package com.quizzcraft.auth;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

import com.quizzcraft.auth.AuthController.Login;
import com.quizzcraft.auth.AuthController.LoginResult;
import com.quizzcraft.auth.AuthController.Registration;
import com.quizzcraft.auth.AuthController.User;

@Service
class AccountService {
    private record Credentials(User user, String passwordHash) {}
    private static final RowMapper<User> USER_ROW = (row, n) -> new User(row.getLong("id"), row.getString("email"),
            row.getString("display_name"), row.getString("role"));

    private final JdbcClient jdbc;
    private final BCryptPasswordEncoder passwordEncoder;
    private final JwtEncoder tokens;
    private final Duration ttl;
    private final String dummyHash;

    AccountService(JdbcClient jdbc, BCryptPasswordEncoder passwordEncoder, JwtEncoder tokens,
                   @Value("${quizzcraft.auth.token-ttl}") Duration ttl) {
        if (ttl.isNegative() || ttl.isZero()) {
            throw new IllegalArgumentException("QUIZZCRAFT_TOKEN_TTL must be positive");
        }
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.tokens = tokens;
        this.ttl = ttl;
        // Unknown accounts follow the same BCrypt comparison path as a wrong password.
        this.dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
    }

    User register(Registration request) {
        if (exceedsBcryptLimit(request.password())) {
            var field = new AuthError.FieldError("password", "Use at most 72 UTF-8 bytes");
            throw new Failure(HttpStatus.UNPROCESSABLE_ENTITY,
                    new AuthError("VALIDATION_FAILED", "Check the registration fields", List.of(field)));
        }
        return jdbc.sql("""
                INSERT INTO users (email, display_name, password_hash, role)
                VALUES (:email, :displayName, :hash, 'USER')
                ON CONFLICT (email) DO NOTHING
                RETURNING id, email, display_name, role
                """)
                .param("email", request.email())
                .param("displayName", request.displayName())
                .param("hash", passwordEncoder.encode(request.password()))
                .query(USER_ROW).optional()
                .orElseThrow(() -> new Failure(HttpStatus.CONFLICT,
                        AuthError.of("EMAIL_TAKEN", "That email is already registered")));
    }

    LoginResult login(Login request) {
        if (request.email() == null || request.email().isBlank() || request.email().length() > 320 || request.email().indexOf(0) >= 0
                || request.password() == null || request.password().isBlank() || exceedsBcryptLimit(request.password())) {
            throw invalidCredentials();
        }
        Optional<Credentials> account = jdbc.sql("SELECT id, email, display_name, role, password_hash FROM users WHERE email = :email")
                .param("email", request.email())
                .query((row, n) -> new Credentials(USER_ROW.mapRow(row, n), row.getString("password_hash")))
                .optional();
        String hash = account.map(Credentials::passwordHash).orElse(dummyHash);
        if (!passwordEncoder.matches(request.password(), hash) || account.isEmpty()) {
            throw invalidCredentials();
        }

        User user = account.get().user();
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(AuthSecurity.ISSUER).subject(Long.toString(user.id()))
                .issuedAt(now).expiresAt(now.plus(ttl)).claim("role", user.role()).build();
        String token = tokens.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return new LoginResult(token, user);
    }

    User findUser(long id) {
        return jdbc.sql("SELECT id, email, display_name, role FROM users WHERE id = :id")
                .param("id", id).query(USER_ROW).optional()
                .orElseThrow(() -> new Failure(HttpStatus.UNAUTHORIZED, AuthError.of("UNAUTHORIZED", "Sign in to continue")));
    }

    private static boolean exceedsBcryptLimit(String password) {
        return password.getBytes(StandardCharsets.UTF_8).length > 72;
    }

    private static Failure invalidCredentials() {
        return new Failure(HttpStatus.UNAUTHORIZED, AuthError.of("INVALID_CREDENTIALS", "Invalid email or password"));
    }

    static final class Failure extends RuntimeException {
        final HttpStatus status;
        final AuthError error;

        Failure(HttpStatus status, AuthError error) {
            super(error.message());
            this.status = status;
            this.error = error;
        }
    }
}
