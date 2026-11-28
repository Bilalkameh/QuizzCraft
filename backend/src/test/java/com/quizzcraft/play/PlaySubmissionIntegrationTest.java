package com.quizzcraft.play;

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

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfEnvironmentVariable(named = "QUIZZCRAFT_TEST_DB_URL", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Execution(ExecutionMode.SAME_THREAD)
class PlaySubmissionIntegrationTest {
    private static final String MIXED = """
            {"answers":[{"questionId":5001,"choiceId":9002},{"questionId":5002,"choiceId":9004},
                        {"questionId":5003,"choiceId":null}]}
            """;
    private static final String ALL_BLANK = "{\"answers\":[]}";
    private final String schema = "qc29_" + UUID.randomUUID().toString().replace("-", "");
    private final TestRestTemplate http = new TestRestTemplate();
    private JdbcTemplate schemaAdmin;
    private JdbcTemplate db;
    private ServletWebServerApplicationContext app;
    private String token;

    @BeforeAll
    void startInNewPostgresSchemaAndSignIn() {
        String url = System.getenv("QUIZZCRAFT_TEST_DB_URL");
        var connection = new DriverManagerDataSource(url,
                System.getenv().getOrDefault("QUIZZCRAFT_DB_USER", "quizzcraft"),
                System.getenv().getOrDefault("QUIZZCRAFT_DB_PASSWORD", ""));
        schemaAdmin = new JdbcTemplate(connection);
        schemaAdmin.execute("CREATE SCHEMA " + schema);
        app = (ServletWebServerApplicationContext) new SpringApplicationBuilder(QuizzCraftApplication.class)
                .run("--server.port=0", "--spring.datasource.url=" + url, "--spring.datasource.hikari.schema=" + schema);
        db = app.getBean(JdbcTemplate.class);

        String email = "player@example.test";
        String password = UUID.randomUUID().toString();
        request(HttpMethod.POST, "/api/auth/register", Map.of("email", email, "displayName", "Player", "password", password), null, 201);
        token = request(HttpMethod.POST, "/api/auth/login", Map.of("email", email, "password", password), null, 200)
                .required("token").asText();
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
    void mixedSubmissionReturnsOneOfThreeWithFeedback() {
        JsonNode result = submit(1001, MIXED, 201);
        assertThat(result.required("attemptId").asLong()).isPositive();
        assertThat(result.required("quizId").asLong()).isEqualTo(101);
        assertThat(result.required("revisionId").asLong()).isEqualTo(1001);
        assertThat(result.required("title").asText()).isEqualTo("Planets Warm-Up");
        OffsetDateTime.parse(result.required("submittedAt").asText());
        assertThat(result.required("score").intValue()).isEqualTo(1);
        assertThat(result.required("maxScore").intValue()).isEqualTo(3);
        JsonNode questions = result.required("questions");
        assertThat(questions.size()).isEqualTo(3);
        feedback(questions.get(0), 5001, 9002, 9002, 1);
        feedback(questions.get(1), 5002, 9004, 9005, 0);
        feedback(questions.get(2), 5003, null, 9007, 0);
        assertThat(result.required("choices").required("9002").asText()).isEqualTo("Mercury");
        assertThat(result.required("choices").required("9005").asText()).isEqualTo("False");
        assertThat(result.required("choices").required("9007").asText()).isEqualTo("8");
    }

    @Test
    void playIncludesBothFormatsAndNeverRevealsKeysOrFeedback() {
        JsonNode play = play(101, 200);
        assertThat(play.required("revisionId").asLong()).isEqualTo(1001);
        assertThat(play.required("questions").findValuesAsText("type"))
                .containsExactly("MULTIPLE_CHOICE", "TRUE_FALSE", "MULTIPLE_CHOICE");
        assertThat(play.at("/questions/0/choices").findValuesAsText("text"))
                .containsExactly("Venus", "Mercury", "Mars");
        for (String field : new String[]{"isCorrect", "is_correct", "correctChoiceId", "correct", "points", "score", "feedback"}) {
            assertThat(play.findValues(field)).as("pre-submission field %s", field).isEmpty();
        }
    }

    @Test
    void finalSelectionsExplicitBlanksAndOmissionsAreGradedOnce() {
        JsonNode finalSelection = submit(1001, """
                {"answers":[{"questionId":5001,"choiceId":9002},{"questionId":5002,"choiceId":null}]}
                """, 201);
        assertThat(finalSelection.required("score").intValue()).isEqualTo(1);
        assertThat(finalSelection.required("maxScore").intValue()).isEqualTo(3);
        JsonNode questions = finalSelection.required("questions");
        feedback(questions.get(1), 5002, null, 9005, 0);
        feedback(questions.get(2), 5003, null, 9007, 0);
        JsonNode blank = submit(1001, ALL_BLANK, 201);
        assertThat(blank.required("score").intValue()).isZero();
        assertThat(blank.required("maxScore").intValue()).isEqualTo(3);
        assertThat(blank.required("questions").findValuesAsText("points")).containsExactly("0", "0", "0");
    }

    @Test
    void invalidQuestionWrongChoiceAndDuplicateEachRejectTheWholeSubmission() {
        for (String invalid : new String[]{
                "{\"questionId\":4201,\"choiceId\":8201}",
                "{\"questionId\":5002,\"choiceId\":9002}",
                "{\"questionId\":5001,\"choiceId\":9001}"}) {
            String body = "{\"answers\":[{\"questionId\":5001,\"choiceId\":9002}," + invalid + "]}";
            JsonNode error = submit(1001, body, 422);
            assertThat(error.required("error").asText()).isEqualTo("VALIDATION_FAILED");
            assertThat(error.has("attemptId")).isFalse();
        }
    }

    @Test
    void republicationChangesNewPlayButStillGradesTheOpenedRevision() {
        assertThat(play(101, 200).required("revisionId").asLong()).isEqualTo(1001);
        // Stand in for the maker's publish operation, using real immutable revision rows.
        long revision = db.queryForObject("""
                INSERT INTO quiz_revisions (quiz_id, number, state, title, category_id, difficulty, published_at)
                VALUES (101, 2, 'PUBLISHED', 'Revised quiz', 2, 'EASY', NOW()) RETURNING id
                """, Long.class);
        long question = db.queryForObject("""
                INSERT INTO questions (revision_id, position, type, text) VALUES (?, 1, 'TRUE_FALSE', 'Venus is closest.')
                RETURNING id
                """, Long.class, revision);
        db.update("""
                INSERT INTO choices (question_id, position, text, is_correct)
                VALUES (?, 1, 'True', false), (?, 2, 'False', true)
                """, question, question);
        db.update("UPDATE quizzes SET latest_published_revision_id = ? WHERE id = 101", revision);
        try {
            JsonNode fresh = play(101, 200);
            assertThat(fresh.required("revisionId").asLong()).isEqualTo(revision);
            assertThat(fresh.required("title").asText()).isEqualTo("Revised quiz");
            JsonNode original = submit(1001, MIXED, 201);
            assertThat(original.required("title").asText()).isEqualTo("Planets Warm-Up");
            assertThat(original.required("revisionId").asLong()).isEqualTo(1001);
            assertThat(original.required("score").intValue()).isEqualTo(1);
            feedback(original.required("questions").get(0), 5001, 9002, 9002, 1);
        } finally {
            db.update("UPDATE quizzes SET latest_published_revision_id = 1001 WHERE id = 101");
        }
    }

    @Test
    void removalDuringPlayRejectsSubmissionAndHidesNewPlay() {
        assertThat(play(102, 200).required("revisionId").asLong()).isEqualTo(902);
        db.update("UPDATE quizzes SET status = 'REMOVED' WHERE id = 102");
        try {
            JsonNode error = submit(902, ALL_BLANK, 410);
            assertThat(error.required("error").asText()).isEqualTo("QUIZ_REMOVED");
            assertThat(error.has("attemptId")).isFalse();
            play(102, 404);
        } finally {
            db.update("UPDATE quizzes SET status = 'ACTIVE' WHERE id = 102");
        }
    }

    @Test
    void distinctRetakesCarryTheirOwnScores() {
        JsonNode first = submit(1001, MIXED, 201);
        JsonNode next = submit(1001, """
                {"answers":[{"questionId":5001,"choiceId":9002},{"questionId":5002,"choiceId":9005},
                            {"questionId":5003,"choiceId":9007}]}
                """, 201);
        assertThat(first.required("attemptId").asLong()).isPositive();
        assertThat(next.required("attemptId").asLong()).isPositive().isNotEqualTo(first.get("attemptId").asLong());
        assertThat(first.required("score").intValue()).isEqualTo(1);
        assertThat(next.required("score").intValue()).isEqualTo(3);
    }

    @Test
    void draftAndUnknownTargetsAreUnavailableToAPlayer() {
        play(104, 404);
        submit(904, ALL_BLANK, 404);
        play(999999, 404);
        submit(999999, ALL_BLANK, 404);
    }

    @Test
    void signedOutPlayersCannotOpenPlayOrSubmit() {
        request(HttpMethod.GET, "/api/quizzes/101/play", null, null, 401);
        request(HttpMethod.POST, "/api/revisions/1001/attempts", MIXED, null, 401);
    }

    private static void feedback(JsonNode question, int id, Integer chosen, int correct, int points) {
        assertThat(question.required("questionId").asInt()).isEqualTo(id);
        assertThat(question.required("text").asText()).isNotBlank();
        JsonNode answer = question.required("chosenChoiceId");
        if (chosen == null) {
            assertThat(answer.isNull()).isTrue();
        } else {
            assertThat(answer.intValue()).isEqualTo(chosen);
        }
        assertThat(question.required("correctChoiceId").asInt()).isEqualTo(correct);
        assertThat(question.required("correct").booleanValue()).isEqualTo(points == 1);
        assertThat(question.required("points").intValue()).isEqualTo(points);
    }

    private JsonNode play(long quiz, int status) {
        return request(HttpMethod.GET, "/api/quizzes/" + quiz + "/play", null, token, status);
    }

    private JsonNode submit(long revision, String answers, int status) {
        return request(HttpMethod.POST, "/api/revisions/" + revision + "/attempts", answers, token, status);
    }

    private JsonNode request(HttpMethod method, String path, Object body, String jwt, int expected) {
        HttpHeaders headers = new HttpHeaders();
        if (body != null) {
            headers.setContentType(MediaType.APPLICATION_JSON);
        }
        if (jwt != null) {
            headers.setBearerAuth(jwt);
        }
        String url = "http://127.0.0.1:" + app.getWebServer().getPort() + path;
        var response = http.exchange(url, method, new HttpEntity<>(body, headers), JsonNode.class);
        assertThat(response.getStatusCode().value()).as("%s %s", method, path).isEqualTo(expected);
        return response.getBody();
    }
}
