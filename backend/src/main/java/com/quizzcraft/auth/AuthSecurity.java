package com.quizzcraft.auth;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Objects;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;

@Configuration
class AuthSecurity {
    static final String ISSUER = "quizzcraft";
    private static final String[] PUBLIC_READS = {"/api/categories", "/api/quizzes", "/api/quizzes/{id:[0-9]+}"};

    @Bean
    BCryptPasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    SecretKey jwtKey(@Value("${quizzcraft.auth.jwt-secret}") String encodedKey) {
        byte[] key;
        if (encodedKey.isEmpty()) {
            // Local runs generate a new signing key on startup. No secret is stored in Git.
            key = new byte[32];
            new SecureRandom().nextBytes(key);
        } else {
            key = Base64.getDecoder().decode(encodedKey);
            if (key.length < 32) {
                throw new IllegalArgumentException("QUIZZCRAFT_JWT_SECRET must encode at least 32 random bytes");
            }
        }
        return new SecretKeySpec(key, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey key) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(key));
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey key) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                new JwtIssuerValidator(ISSUER), new JwtTimestampValidator(Duration.ZERO),
                new JwtClaimValidator<Instant>("exp", Objects::nonNull),
                new JwtClaimValidator<String>("sub", subject -> subject != null && subject.matches("[1-9][0-9]*")),
                new JwtClaimValidator<String>("role", role -> "USER".equals(role) || "ADMIN".equals(role))));
        return decoder;
    }

    @Bean
    SecurityFilterChain apiSecurity(HttpSecurity http, ObjectMapper mapper) throws Exception {
        JwtGrantedAuthoritiesConverter roles = new JwtGrantedAuthoritiesConverter();
        roles.setAuthoritiesClaimName("role");
        roles.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter authentication = new JwtAuthenticationConverter();
        authentication.setJwtGrantedAuthoritiesConverter(roles);

        AuthenticationEntryPoint unauthorized = (req, res, failure) -> {
            res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            res.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
            res.setContentType(MediaType.APPLICATION_JSON_VALUE);
            mapper.writeValue(res.getOutputStream(), AuthError.of("UNAUTHORIZED", "Sign in to continue"));
        };
        AccessDeniedHandler forbidden = (req, res, failure) -> {
            res.setStatus(HttpServletResponse.SC_FORBIDDEN);
            res.setContentType(MediaType.APPLICATION_JSON_VALUE);
            mapper.writeValue(res.getOutputStream(), AuthError.of("FORBIDDEN", "Access denied"));
        };

        return http
                // Authentication uses an explicit Authorization header and no cookie or server session.
                .csrf(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .requestCache(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(routes -> routes
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login").permitAll()
                        .requestMatchers(HttpMethod.GET, PUBLIC_READS).permitAll()
                        .requestMatchers(HttpMethod.HEAD, PUBLIC_READS).permitAll()
                        .requestMatchers("/api/admin/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .exceptionHandling(errors -> errors.authenticationEntryPoint(unauthorized).accessDeniedHandler(forbidden))
                .oauth2ResourceServer(server -> server
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(authentication))
                        .authenticationEntryPoint(unauthorized).accessDeniedHandler(forbidden))
                .build();
    }
}
