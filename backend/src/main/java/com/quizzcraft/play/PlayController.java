package com.quizzcraft.play;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
class PlayController {
    private final PlayService service;

    PlayController(PlayService service) {
        this.service = service;
    }

    @GetMapping("/api/quizzes/{quizId}/play")
    PlayService.PlayQuiz play(@PathVariable long quizId) {
        return service.play(quizId);
    }

    @PostMapping("/api/revisions/{revisionId}/attempts")
    @ResponseStatus(HttpStatus.CREATED)
    PlayService.Result submit(@PathVariable long revisionId, @AuthenticationPrincipal Jwt user,
                              @RequestBody SubmissionRequest request) {
        return service.submit(Long.parseLong(user.getSubject()), revisionId, request);
    }

    @ExceptionHandler(PlayFailure.class)
    ResponseEntity<ErrorBody> playFailure(PlayFailure failure) {
        return ResponseEntity.status(failure.status).body(new ErrorBody(failure.code, failure.getMessage(), List.of()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorBody malformedBody() {
        return new ErrorBody("INVALID_REQUEST", "Expected a valid JSON request body", List.of());
    }

    record ErrorBody(String error, String message, List<?> fieldErrors) {}
}

class PlayFailure extends RuntimeException {
    final HttpStatus status;
    final String code;

    PlayFailure(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    static PlayFailure invalid(String message) {
        return new PlayFailure(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", message);
    }
}
