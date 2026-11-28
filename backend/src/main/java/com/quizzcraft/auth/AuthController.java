package com.quizzcraft.auth;

import java.util.List;
import java.util.Locale;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
class AuthController {
    private final AccountService accounts;

    AuthController(AccountService accounts) {
        this.accounts = accounts;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    User register(@Valid @RequestBody Registration request) {
        return accounts.register(request);
    }

    @PostMapping("/login")
    LoginResult login(@RequestBody Login request) {
        return accounts.login(request);
    }

    @GetMapping("/me")
    User currentUser(@AuthenticationPrincipal Jwt jwt) {
        return accounts.findUser(Long.parseLong(jwt.getSubject()));
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void logout() {
        // The React client discards its bearer token. No session is stored on the server.
    }

    @ExceptionHandler(AccountService.Failure.class)
    ResponseEntity<AuthError> accountFailure(AccountService.Failure e) {
        return ResponseEntity.status(e.status).body(e.error);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.UNPROCESSABLE_ENTITY)
    AuthError invalidFields(MethodArgumentNotValidException e) {
        List<AuthError.FieldError> fields = e.getBindingResult().getFieldErrors().stream()
                .map(field -> new AuthError.FieldError(field.getField(), field.getDefaultMessage()))
                .toList();
        return new AuthError("VALIDATION_FAILED", "Check the registration fields", fields);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    AuthError invalidBody() {
        return AuthError.of("INVALID_REQUEST", "Expected a valid JSON request body");
    }

    private static String normalizeEmail(String email) {
        return email == null ? null : email.strip().toLowerCase(Locale.ROOT);
    }

    @JsonIgnoreProperties("role")
    record Registration(@NotBlank @Email @Size(max = 320)
                        @Pattern(regexp = "[^\\x00]*", message = "must not contain a null character") String email,
                        @NotBlank String password,
                        @NotBlank @Size(max = 100)
                        @Pattern(regexp = "[^\\x00]*", message = "must not contain a null character") String displayName) {
        Registration {
            email = normalizeEmail(email);
            displayName = displayName == null ? null : displayName.strip();
        }
    }

    record Login(String email, String password) {
        Login {
            email = normalizeEmail(email);
        }
    }

    record User(long id, String email, String displayName, String role) {}
    record LoginResult(String token, User user) {}
}
