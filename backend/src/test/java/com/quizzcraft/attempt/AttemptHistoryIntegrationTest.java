package com.quizzcraft.attempt;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.quizzcraft.QuizzCraftApplication;
import com.quizzcraft.attempt.AttemptStore.GradedAnswer;
import com.quizzcraft.attempt.AttemptStore.SavedAttempt;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * QC-31 · attempt store and private history against a real PostgreSQL schema (REV-01…04, ACC-03).
 * Scoring and submission are QC-29, so these tests save sample graded results through the store, using the
 * contract's worked example for "Planets Warm-Up" (revision 1001).
 */
@EnabledIfEnvironmentVariable(named = "QUIZZCRAFT_TEST_DB_URL", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Execution(ExecutionMode.SAME_THREAD)
class AttemptHistoryIntegrationTest {
    /** Contract §5.3–5.4: Mercury (correct), True (wrong), blank. Scores 1/3. */
    private static final List<GradedAnswer> WORKED_EXAMPLE = List.of(
            new GradedAnswer(5001, 9002L, true), new GradedAnswer(5002, 9004L, false), new GradedAnswer(5003, null, false));
    private static final List<GradedAnswer> ALL_CORRECT = List.of(
            new GradedAnswer(5001, 9002L, true), new GradedAnswer(5002, 9005L, true), new GradedAnswer(5003, 9007L, true));

    private record Player(String email, String password, long id) {}

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
    void savedAttemptReopensWithTheContractResultAndAppearsInHistory() {
        SavedAttempt saved = store().save(playerA.id(), 1001, 1, 3, WORKED_EXAMPLE);
        assertThat(saved.attemptId()).isGreaterThanOrEqualTo(7001);

        JsonNode result = get("/api/attempts/" + saved.attemptId(), signIn(playerA), 200);
        assertThat(result.required("attemptId").asLong()).isEqualTo(saved.attemptId());
        assertThat(result.required("quizId").asLong()).isEqualTo(101);
        assertThat(result.required("revisionId").asLong()).isEqualTo(1001);
        assertThat(result.required("title").asText()).isEqualTo("Planets Warm-Up");
        assertThat(Instant.parse(result.required("submittedAt").asText())).isEqualTo(saved.submittedAt());
        assertThat(result.required("score").intValue()).isEqualTo(1);
        assertThat(result.required("maxScore").intValue()).isEqualTo(3);
        JsonNode questions = result.required("questions");
        assertThat(questions.size()).isEqualTo(3);
        feedback(questions.get(0), 5001, "Which planet is closest to the Sun?", 9002L, 9002, 1);
        feedback(questions.get(1), 5002, "Jupiter is a rocky planet.", 9004L, 9005, 0);
        feedback(questions.get(2), 5003, "How many planets orbit the Sun?", null, 9007, 0);
        JsonNode choices = result.required("choices");
        assertThat(choices.size()).isEqualTo(8);
        assertThat(choices.required("9002").asText()).isEqualTo("Mercury");
        assertThat(choices.required("9005").asText()).isEqualTo("False");
        assertThat(choices.required("9007").asText()).isEqualTo("8");

        JsonNode item = historyItem(get("/api/me/attempts", signIn(playerA), 200), saved.attemptId());
        assertThat(item.required("quizId").asLong()).isEqualTo(101);
        assertThat(item.required("revisionId").asLong()).isEqualTo(1001);
        assertThat(item.required("title").asText()).isEqualTo("Planets Warm-Up");
        assertThat(item.required("score").intValue()).isEqualTo(1);
        assertThat(item.required("maxScore").intValue()).isEqualTo(3);
        assertThat(item.required("quizRemoved").booleanValue()).isFalse();
    }

    @Test
    void retakesAreSeparateRecordsListedNewestFirst() {
        long first = store().save(playerA.id(), 1001, 1, 3, WORKED_EXAMPLE).attemptId();
        long retake = store().save(playerA.id(), 1001, 3, 3, ALL_CORRECT).attemptId();
        assertThat(retake).isNotEqualTo(first);

        String token = signIn(playerA);
        List<Long> order = attemptIds(get("/api/me/attempts", token, 200));
        assertThat(order).contains(first, retake);
        assertThat(order.indexOf(retake)).as("newest first").isLessThan(order.indexOf(first));
        assertThat(get("/api/attempts/" + first, token, 200).required("score").intValue()).isEqualTo(1);
        assertThat(get("/api/attempts/" + retake, token, 200).required("score").intValue()).isEqualTo(3);
        assertThat(count("SELECT COUNT(*) FROM attempt_answers WHERE attempt_id IN (?, ?)", first, retake)).isEqualTo(6);
    }

    @Test
    void historyIsPrivateToItsOwner() {
        long attempt = store().save(playerA.id(), 1001, 1, 3, WORKED_EXAMPLE).attemptId();

        JsonNode denied = get("/api/attempts/" + attempt, signIn(playerB), 403);
        assertThat(denied.required("error").asText()).isEqualTo("FORBIDDEN");
        assertThat(denied.has("questions")).isFalse();
        assertThat(attemptIds(get("/api/me/attempts", signIn(playerB), 200))).doesNotContain(attempt);

        get("/api/attempts/" + attempt, null, 401);
        get("/api/me/attempts", null, 401);
        assertThat(get("/api/attempts/999999", signIn(playerA), 404).required("error").asText()).isEqualTo("NOT_FOUND");
    }

    @Test
    void saveRejectsGradedResultsThatDoNotMatchAPublishedRevision() {
        int before = count("SELECT COUNT(*) FROM attempts");
        long a = playerA.id();
        // Draft revision 904 ("Moon Basics") is not published.
        rejected(() -> store().save(a, 904, 1, 2, List.of(new GradedAnswer(4401, 8401L, true), new GradedAnswer(4402, null, false))));
        // A question missing, from another revision, or twice.
        rejected(() -> store().save(a, 1001, 1, 3, WORKED_EXAMPLE.subList(0, 2)));
        rejected(() -> store().save(a, 1001, 1, 3, List.of(WORKED_EXAMPLE.get(0), WORKED_EXAMPLE.get(1), new GradedAnswer(4201, 8201L, false))));
        rejected(() -> store().save(a, 1001, 1, 3, List.of(WORKED_EXAMPLE.get(0), WORKED_EXAMPLE.get(0), WORKED_EXAMPLE.get(2))));
        // A choice from another question, a correct blank, and a score that does not match the answers.
        rejected(() -> store().save(a, 1001, 0, 3, List.of(new GradedAnswer(5001, 9002L, false), new GradedAnswer(5002, 9002L, false), WORKED_EXAMPLE.get(2))));
        rejected(() -> store().save(a, 1001, 2, 3, List.of(WORKED_EXAMPLE.get(0), WORKED_EXAMPLE.get(1), new GradedAnswer(5003, null, true))));
        rejected(() -> store().save(a, 1001, 2, 3, WORKED_EXAMPLE));
        rejected(() -> store().save(a, 999999, 0, 1, List.of()));
        assertThat(count("SELECT COUNT(*) FROM attempts")).as("no partial or complete attempt saved").isEqualTo(before);
    }

    @Test
    void attemptKeepsItsOriginalRevisionAfterRepublicationRemovalAndRestart() {
        long attempt = store().save(playerA.id(), 1001, 1, 3, WORKED_EXAMPLE).attemptId();
        JsonNode original = get("/api/attempts/" + attempt, signIn(playerA), 200);

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
            String token = signIn(playerA); // The signing key is regenerated on restart.
            assertThat(get("/api/attempts/" + attempt, token, 200))
                    .as("the reopened attempt is identical to the original result").isEqualTo(original);
            JsonNode item = historyItem(get("/api/me/attempts", token, 200), attempt);
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

    private static void rejected(Runnable save) {
        assertThatThrownBy(save::run).isInstanceOf(IllegalArgumentException.class);
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

    private AttemptStore store() {
        return app.getBean(AttemptStore.class);
    }

    private JdbcTemplate db() {
        return app.getBean(JdbcTemplate.class);
    }

    private int count(String sql, Object... args) {
        return db().queryForObject(sql, Integer.class, args);
    }

    private Player register(String email, String displayName) {
        String password = UUID.randomUUID().toString();
        long id = request(HttpMethod.POST, "/api/auth/register",
                Map.of("email", email, "displayName", displayName, "password", password), null, 201).required("id").asLong();
        return new Player(email, password, id);
    }

    private String signIn(Player player) {
        return request(HttpMethod.POST, "/api/auth/login", Map.of("email", player.email(), "password", player.password()),
                null, 200).required("token").asText();
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
