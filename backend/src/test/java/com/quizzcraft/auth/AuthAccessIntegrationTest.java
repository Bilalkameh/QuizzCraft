package com.quizzcraft.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.quizzcraft.QuizzCraftApplication;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.web.servlet.context.ServletWebServerApplicationContext;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@EnabledIfEnvironmentVariable(named = "QUIZZCRAFT_TEST_DB_URL", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Execution(ExecutionMode.SAME_THREAD)
class AuthAccessIntegrationTest {
    private static final String PASSWORD = UUID.randomUUID().toString();
    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private final String schema = "qc21_test_" + UUID.randomUUID().toString().replace("-", "");
    private JdbcTemplate database;
    private ServletWebServerApplicationContext app;

    @BeforeAll
    void startInIsolatedSchema() {
        var connection = new DriverManagerDataSource(System.getenv("QUIZZCRAFT_TEST_DB_URL"),
                System.getenv().getOrDefault("QUIZZCRAFT_DB_USER", "quizzcraft"),
                System.getenv().getOrDefault("QUIZZCRAFT_DB_PASSWORD", ""));
        var admin = new JdbcTemplate(connection);
        admin.execute("CREATE SCHEMA " + schema);
        database = admin;
        startApp();
    }

    private void startApp() {
        app = (ServletWebServerApplicationContext) new SpringApplicationBuilder(QuizzCraftApplication.class)
                .run("--server.port=0", "--spring.datasource.url=" + System.getenv("QUIZZCRAFT_TEST_DB_URL"),
                        "--spring.datasource.hikari.schema=" + schema);
    }

    @AfterAll
    void removeTestSchema() {
        if (app != null) {
            app.close();
        }
        if (database != null) {
            database.execute("DROP SCHEMA " + schema + " CASCADE");
        }
    }

    @Test
    void registerSignOutAndSignBackInAfterServerRestart() throws Exception {
        String email = email();
        JsonNode user = register(email).expect(201);
        assertThat(user.path("id").asLong()).isPositive();
        assertThat(user.path("email").asText()).isEqualTo(email);
        assertThat(user.path("displayName").asText()).isEqualTo("Test Player");
        assertThat(user.path("role").asText()).isEqualTo("USER");
        assertThat(user.has("password") || user.has("passwordHash") || user.has("password_hash")).isFalse();

        String storedHash = app.getBean(JdbcTemplate.class).queryForObject(
                "select password_hash from users where id = ?", String.class, user.get("id").asLong());
        assertThat(storedHash).isNotBlank().isNotEqualTo(PASSWORD);
        JsonNode session = login(email, PASSWORD).expect(200);
        assertThat(session.get("user")).isEqualTo(user);
        String token = session.path("token").asText();
        assertThat(token).isNotBlank();
        assertThat(request("GET", "/api/auth/me", null, token).expect(200)).isEqualTo(user);
        request("POST", "/api/auth/logout", null, token).expect(204);
        request("GET", "/api/auth/me", null, null).expect(401);

        app.close();
        startApp();
        JsonNode nextSession = login(email, PASSWORD).expect(200);
        assertThat(request("GET", "/api/auth/me", null, nextSession.get("token").asText()).expect(200))
                .isEqualTo(user);
    }

    @Test
    void duplicateRegistrationReturnsConflictAndPostgresEnforcesUniqueness() throws Exception {
        String email = email();
        register(email).expect(201);
        JsonNode duplicate = register(" " + email.toUpperCase(Locale.ROOT) + " ").expect(409);
        assertThat(duplicate.path("error").asText()).isEqualTo("EMAIL_TAKEN");
        JdbcTemplate jdbc = app.getBean(JdbcTemplate.class);
        assertThat(jdbc.queryForObject("select count(*) from users where email = ?", Integer.class, email))
                .isEqualTo(1);
        assertThatThrownBy(() -> jdbc.update("""
                insert into users (email, display_name, password_hash, role)
                select email, display_name, password_hash, role from users where email = ?
                """, email)).isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    void incompleteRegistrationReturnsFieldErrorsWithoutSavingTheAccount() throws Exception {
        String email = email();
        JsonNode errors = request("POST", "/api/auth/register",
                Map.of("email", email, "password", "", "displayName", " "), null).expect(422);
        assertThat(errors.path("error").asText()).isEqualTo("VALIDATION_FAILED");
        assertThat(errors.path("fieldErrors").findValuesAsText("field")).contains("displayName", "password");
        JsonNode invalidName = request("POST", "/api/auth/register",
                Map.of("email", email, "password", PASSWORD, "displayName", "Player" + (char) 0), null)
                .expect(422);
        assertThat(invalidName.path("fieldErrors").findValuesAsText("field")).contains("displayName");
        JsonNode invalidEmail = register("invalid" + (char) 0 + "@example.test").expect(422);
        assertThat(invalidEmail.path("fieldErrors").findValuesAsText("field")).contains("email");
        login(email, PASSWORD).expect(401);
        register(email).expect(201);
    }

    @Test
    void wrongPasswordAndUnknownAccountHaveTheSamePublicError() throws Exception {
        String email = email();
        register(email).expect(201);
        JsonNode wrongPassword = login(email, UUID.randomUUID().toString()).expect(401);
        JsonNode unknownAccount = login(email(), PASSWORD).expect(401);
        assertThat(wrongPassword.path("error").asText()).isEqualTo("INVALID_CREDENTIALS");
        assertThat(wrongPassword.path("message").asText()).isNotBlank();
        assertThat(unknownAccount.path("error")).isEqualTo(wrongPassword.get("error"));
        assertThat(unknownAccount.path("message")).isEqualTo(wrongPassword.get("message"));
        assertThat(wrongPassword.has("token") || unknownAccount.has("token")).isFalse();
        JsonNode invalidEmail = login("invalid" + (char) 0 + "@example.test", PASSWORD).expect(401);
        assertThat(invalidEmail.path("error")).isEqualTo(wrongPassword.get("error"));
        assertThat(invalidEmail.path("message")).isEqualTo(wrongPassword.get("message"));
    }

    @Test
    void visitorsCanBrowseButCannotCreatePlaySubmitOrReadHistory() throws Exception {
        JsonNode catalog = request("GET", "/api/quizzes", null, null).expect(200);
        assertThat(catalog.path("items").isArray()).isTrue();
        assertThat(catalog.path("items").findValuesAsText("title")).contains("Planets Warm-Up");
        request("GET", "/api/quizzes/101", null, null).expect(200);
        request("GET", "/api/categories", null, null).expect(200);
        request("POST", "/api/my/quizzes", Map.of(), null).expect(401);
        request("GET", "/api/quizzes/101/play", null, null).expect(401);
        request("POST", "/api/revisions/1001/attempts", Map.of(), null).expect(401);
        request("GET", "/api/me/attempts", null, null).expect(401);
        request("GET", "/api/attempts/1", null, null).expect(401);
        request("POST", "/api/auth/logout", null, null).expect(401);
    }

    @Test
    void registrationIgnoresAdminRoleAndIdentityComesFromTheToken() throws Exception {
        String email = email();
        JsonNode user = request("POST", "/api/auth/register",
                Map.of("email", email, "displayName", "Maker", "password", PASSWORD, "role", "ADMIN"), null)
                .expect(201);
        assertThat(user.path("role").asText()).isEqualTo("USER");
        String token = login(email, PASSWORD).expect(200).get("token").asText();
        JsonNode other = register(email()).expect(201);
        assertThat(other.get("id")).isNotEqualTo(user.get("id"));
        JsonNode me = request("GET", "/api/auth/me?userId=" + other.get("id").asLong(), null, token)
                .expect(200);
        assertThat(me).isEqualTo(user);
        request("POST", "/api/admin/categories", Map.of("name", "Example"), token).expect(403);
    }

    @Test
    void invalidExpiredAndDamagedTokensCannotOpenPrivateRoutes() throws Exception {
        String email = email();
        JsonNode user = register(email).expect(201);
        String token = login(email, PASSWORD).expect(200).get("token").asText();
        request("GET", "/api/auth/me", null, token).expect(200);
        String[] parts = token.split("\\.");
        assertThat(parts.length).isEqualTo(3);
        String badSignature = (parts[2].startsWith("a") ? "b" : "a") + parts[2].substring(1);
        request("GET", "/api/auth/me", null, parts[0] + "." + parts[1] + "." + badSignature).expect(401);
        request("GET", "/api/me/attempts", null, "invalid-token").expect(401);

        // Use the same test issuer and key so expiry is the only reason for rejection.
        Instant past = Instant.now().minusSeconds(600);
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer("quizzcraft").subject(user.get("id").asText())
                .claim("role", "USER").issuedAt(past).expiresAt(past.plusSeconds(60)).build();
        var header = JwsHeader.with(MacAlgorithm.HS256).build();
        String expired = app.getBean(JwtEncoder.class).encode(JwtEncoderParameters.from(header, claims))
                .getTokenValue();
        request("GET", "/api/auth/me", null, expired).expect(401);
    }

    private static String email() {
        return "qc21-" + UUID.randomUUID() + "@example.test";
    }

    private Reply register(String email) throws Exception {
        return request("POST", "/api/auth/register",
                Map.of("email", email, "displayName", "Test Player", "password", PASSWORD), null);
    }

    private Reply login(String email, String password) throws Exception {
        return request("POST", "/api/auth/login", Map.of("email", email, "password", password), null);
    }

    private Reply request(String method, String path, Object payload, String token) throws Exception {
        URI uri = URI.create("http://127.0.0.1:" + app.getWebServer().getPort() + path);
        var builder = HttpRequest.newBuilder(uri);
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        var body = HttpRequest.BodyPublishers.noBody();
        if (payload != null) {
            body = HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload));
            builder.header("Content-Type", "application/json");
        }
        var response = http.send(builder.method(method, body).build(), HttpResponse.BodyHandlers.ofString());
        JsonNode result = response.body().isBlank() ? json.nullNode() : json.readTree(response.body());
        return new Reply(method + " " + path, response.statusCode(), result);
    }

    private record Reply(String request, int status, JsonNode body) {
        JsonNode expect(int expected) {
            assertThat(status).as(request).isEqualTo(expected);
            return body;
        }
    }
}
