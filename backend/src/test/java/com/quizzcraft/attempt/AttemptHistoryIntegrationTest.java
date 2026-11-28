package com.quizzcraft.attempt;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.quizzcraft.QuizzCraftApplication;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * QC-31 · private attempt history against a real PostgreSQL schema (REV-01…04, ACC-03). Attempts are created
 * through the real QC-29 submission route, then read back through the history routes.
 */
@EnabledIfEnvironmentVariable(named = "QUIZZCRAFT_TEST_DB_URL", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Execution(ExecutionMode.SAME_THREAD)
class AttemptHistoryIntegrationTest {
    /** Contract §5.3: Mercury (correct), True (wrong), blank. Scores 1/3. */
    private static final String WORKED_EXAMPLE = """
            {"answers":[{"questionId":5001,"choiceId":9002},{"questionId":5002,"choiceId":9004},
                        {"questionId":5003,"choiceId":null}]}
            """;
    private static final String ALL_CORRECT = """
            {"answers":[{"questionId":5001,"choiceId":9002},{"questionId":5002,"choiceId":9005},
                        {"questionId":5003,"choiceId":9007}]}
            """;

    private record Player(String email, String password) {}

    private final String schema = "qc31_" + UUID.randomUUID().toString().replace("-", "");
    private final TestRestTemplate http = new TestRestTemplate();
    private JdbcTemplate schemaAdmin;
    private ServletWebServerApplicationContext app;
    private Player playerA;
    private Player playerB;

    @BeforeAll
    void startInNewPostgresSchema() {
        schemaAdmin = new JdbcTemplate(new DriverManagerDataSource(System.getenv("QUIZZCRAFT_TEST_DB_URL"),
                System.getenv().getOrDefault("QUIZZCRAFT_DB_USER", "quizzcraft"),
                System.getenv().getOrDefault("QUIZZCRAFT_DB_PASSWORD", "")));
        schemaAdmin.execute("CREATE SCHEMA " + schema);
        startApp();
        playerA = register("player-a@example.test", "Player A");
        playerB = register("player-b@example.test", "Player B");
    }

    @AfterAll
    void removeTestSchema() {
        if (app != null) {
            app.close();
        }
        if (schemaAdmin != null) {
            schemaAdmin.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    @Test
    void submittedAttemptReopensWithTheSameResultAndAppearsInHistory() {
        String token = signIn(playerA);
        JsonNode submitted = submit(WORKED_EXAMPLE, token, 201);
        long attempt = submitted.required("attemptId").asLong();
        assertThat(attempt).isGreaterThanOrEqualTo(7001);

        JsonNode reopened = get("/api/attempts/" + attempt, token, 200);
        assertThat(reopened).as("GET /api/attempts/{id} returns the 201 submission body").isEqualTo(submitted);
        assertThat(reopened.required("revisionId").asLong()).isEqualTo(1001);
        assertThat(reopened.required("title").asText()).isEqualTo("Planets Warm-Up");
        assertThat(reopened.required("score").intValue()).isEqualTo(1);
        assertThat(reopened.required("maxScore").intValue()).isEqualTo(3);
        JsonNode questions = reopened.required("questions");
        feedback(questions.get(0), 5001, "Which planet is closest to the Sun?", 9002L, 9002, 1);
        feedback(questions.get(1), 5002, "Jupiter is a rocky planet.", 9004L, 9005, 0);
        feedback(questions.get(2), 5003, "How many planets orbit the Sun?", null, 9007, 0);
        assertThat(reopened.required("choices").size()).isEqualTo(8);
        assertThat(reopened.required("choices").required("9002").asText()).isEqualTo("Mercury");

        JsonNode item = historyItem(get("/api/me/attempts", token, 200), attempt);
        assertThat(item.required("quizId").asLong()).isEqualTo(101);
        assertThat(item.required("revisionId").asLong()).isEqualTo(1001);
        assertThat(item.required("title").asText()).isEqualTo("Planets Warm-Up");
        assertThat(item.required("score").intValue()).isEqualTo(1);
        assertThat(item.required("maxScore").intValue()).isEqualTo(3);
        assertThat(item.required("submittedAt").asText()).isEqualTo(submitted.required("submittedAt").asText());
        assertThat(item.required("quizRemoved").booleanValue()).isFalse();
    }

    @Test
    void retakesAreSeparateRecordsListedNewestFirst() {
        String token = signIn(playerA);
        long first = submit(WORKED_EXAMPLE, token, 201).required("attemptId").asLong();
        long retake = submit(ALL_CORRECT, token, 201).required("attemptId").asLong();
        assertThat(retake).isNotEqualTo(first);

        List<Long> order = attemptIds(get("/api/me/attempts", token, 200));
        assertThat(order).contains(first, retake);
        assertThat(order.indexOf(retake)).as("newest first").isLessThan(order.indexOf(first));
        assertThat(get("/api/attempts/" + first, token, 200).required("score").intValue()).isEqualTo(1);
        assertThat(get("/api/attempts/" + retake, token, 200).required("score").intValue()).isEqualTo(3);
    }

    @Test
    void historyIsPrivateToItsOwner() {
        long attempt = submit(WORKED_EXAMPLE, signIn(playerA), 201).required("attemptId").asLong();

        String tokenB = signIn(playerB);
        JsonNode denied = get("/api/attempts/" + attempt, tokenB, 403);
        assertThat(denied.required("error").asText()).isEqualTo("FORBIDDEN");
        assertThat(denied.has("questions")).isFalse();
        assertThat(attemptIds(get("/api/me/attempts", tokenB, 200))).doesNotContain(attempt);

        get("/api/attempts/" + attempt, null, 401);
        get("/api/me/attempts", null, 401);
        assertThat(get("/api/attempts/999999", signIn(playerA), 404).required("error").asText()).isEqualTo("NOT_FOUND");
    }

    @Test
    void rejectedSubmissionsDoNotAppearInHistory() {
        String token = signIn(playerA);
        List<Long> before = attemptIds(get("/api/me/attempts", token, 200));
        // A choice that belongs to another question is rejected by QC-29 before anything is saved.
        submit("{\"answers\":[{\"questionId\":5002,\"choiceId\":9002}]}", token, 422);
        assertThat(attemptIds(get("/api/me/attempts", token, 200))).isEqualTo(before);
    }

    @Test
    void attemptKeepsItsOriginalRevisionAfterRepublicationRemovalAndRestart() {
        String token = signIn(playerA);
        long attempt = submit(WORKED_EXAMPLE, token, 201).required("attemptId").asLong();
        JsonNode original = get("/api/attempts/" + attempt, token, 200);

        // Stand in for QC-27 (publish) and QC-35 (remove): add revision 2 with a changed question as new rows,
        // point the quiz at it, then remove the quiz.
        JdbcTemplate db = db();
        long revision2 = db.queryForObject("""
                INSERT INTO quiz_revisions (quiz_id, number, state, title, category_id, difficulty, published_at)
                VALUES (101, 2, 'PUBLISHED', 'Planets Warm-Up, revised', 2, 'EASY', NOW()) RETURNING id
                """, Long.class);
        long question = db.queryForObject("""
                INSERT INTO questions (revision_id, position, type, text)
                VALUES (?, 1, 'TRUE_FALSE', 'Venus is closest to the Sun.') RETURNING id
                """, Long.class, revision2);
        db.update("INSERT INTO choices (question_id, position, text, is_correct) VALUES (?, 1, 'True', false), (?, 2, 'False', true)",
                question, question);
        db.update("UPDATE quizzes SET latest_published_revision_id = ?, status = 'REMOVED' WHERE id = 101", revision2);
        try {
            restartApp();
            String afterRestart = signIn(playerA); // The signing key is regenerated on restart.
            assertThat(get("/api/attempts/" + attempt, afterRestart, 200))
                    .as("the reopened attempt is identical to the original result").isEqualTo(original);
            JsonNode item = historyItem(get("/api/me/attempts", afterRestart, 200), attempt);
            assertThat(item.required("title").asText()).isEqualTo("Planets Warm-Up");
            assertThat(item.required("revisionId").asLong()).isEqualTo(1001);
            assertThat(item.required("quizRemoved").booleanValue()).isTrue();
        } finally {
            db().update("UPDATE quizzes SET latest_published_revision_id = 1001, status = 'ACTIVE' WHERE id = 101");
        }
    }

    private static void feedback(JsonNode question, long id, String text, Long chosen, long correct, int points) {
        assertThat(question.required("questionId").asLong()).isEqualTo(id);
        assertThat(question.required("text").asText()).isEqualTo(text);
        JsonNode answer = question.required("chosenChoiceId");
        if (chosen == null) {
            assertThat(answer.isNull()).isTrue();
        } else {
            assertThat(answer.asLong()).isEqualTo(chosen);
        }
        assertThat(question.required("correctChoiceId").asLong()).isEqualTo(correct);
        assertThat(question.required("correct").booleanValue()).isEqualTo(points == 1);
        assertThat(question.required("points").intValue()).isEqualTo(points);
    }

    private static JsonNode historyItem(JsonNode history, long attemptId) {
        for (JsonNode item : history.required("items")) {
            if (item.required("attemptId").asLong() == attemptId) {
                return item;
            }
        }
        throw new AssertionError("attempt " + attemptId + " missing from history " + history);
    }

    private static List<Long> attemptIds(JsonNode history) {
        List<Long> ids = new ArrayList<>();
        history.required("items").forEach(item -> ids.add(item.required("attemptId").asLong()));
        return ids;
    }

    private void startApp() {
        app = (ServletWebServerApplicationContext) new SpringApplicationBuilder(QuizzCraftApplication.class)
                .run("--server.port=0", "--spring.datasource.url=" + System.getenv("QUIZZCRAFT_TEST_DB_URL"),
                        "--spring.datasource.hikari.schema=" + schema);
    }

    private void restartApp() {
        app.close();
        startApp();
    }

    private JdbcTemplate db() {
        return app.getBean(JdbcTemplate.class);
    }

    private Player register(String email, String displayName) {
        String password = UUID.randomUUID().toString();
        request(HttpMethod.POST, "/api/auth/register",
                Map.of("email", email, "displayName", displayName, "password", password), null, 201);
        return new Player(email, password);
    }

    private String signIn(Player player) {
        return request(HttpMethod.POST, "/api/auth/login", Map.of("email", player.email(), "password", player.password()),
                null, 200).required("token").asText();
    }

    private JsonNode submit(String answers, String token, int expected) {
        return request(HttpMethod.POST, "/api/revisions/1001/attempts", answers, token, expected);
    }

    private JsonNode get(String path, String token, int expected) {
        return request(HttpMethod.GET, path, null, token, expected);
    }

    private JsonNode request(HttpMethod method, String path, Object body, String token, int expected) {
        HttpHeaders headers = new HttpHeaders();
        if (body != null) {
            headers.setContentType(MediaType.APPLICATION_JSON);
        }
        if (token != null) {
            headers.setBearerAuth(token);
        }
        var response = http.exchange("http://127.0.0.1:" + app.getWebServer().getPort() + path, method,
                new HttpEntity<>(body, headers), JsonNode.class);
        assertThat(response.getStatusCode().value()).as("%s %s", method, path).isEqualTo(expected);
        return response.getBody();
    }
}
