package com.quizzcraft.attempt;

import java.util.List;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import com.quizzcraft.attempt.AttemptHistory.HistoryItem;

/**
 * Private attempt history (QC-31, contract §5.4–5.5 and §3). Both routes need a signed-in user, which the
 * security configuration enforces with 401. Another user's attempt returns 403, and an unknown one 404.
 * Owners keep access after the quiz is removed (decision D4).
 */
@RestController
class AttemptController {
    record HistoryResponse(List<HistoryItem> items) {}

    record ErrorBody(String error, String message, List<Object> fieldErrors) {
        static ErrorBody of(String error, String message) {
            return new ErrorBody(error, message, List.of());
        }
    }

    private final AttemptHistory attempts;

    AttemptController(AttemptHistory attempts) {
        this.attempts = attempts;
    }

    @GetMapping("/api/me/attempts")
    HistoryResponse myAttempts(@AuthenticationPrincipal Jwt jwt) {
        return new HistoryResponse(attempts.history(userId(jwt)));
    }

    @GetMapping("/api/attempts/{attemptId}")
    ResponseEntity<?> attempt(@PathVariable long attemptId, @AuthenticationPrincipal Jwt jwt) {
        Optional<Long> owner = attempts.ownerOf(attemptId);
        if (owner.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ErrorBody.of("NOT_FOUND", "Attempt not found"));
        }
        if (owner.get() != userId(jwt)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ErrorBody.of("FORBIDDEN", "This attempt belongs to another player"));
        }
        return ResponseEntity.of(attempts.result(attemptId));
    }

    private static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
