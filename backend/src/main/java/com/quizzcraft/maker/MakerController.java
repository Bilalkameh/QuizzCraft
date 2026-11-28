package com.quizzcraft.maker;

import java.util.List;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import static com.quizzcraft.maker.MakerModels.*;

@RestController
@RequestMapping("/api/my/quizzes")
class MakerController {
    private final MakerService maker;

    MakerController(MakerService maker) {
        this.maker = maker;
    }

    @GetMapping
    QuizList list(@AuthenticationPrincipal Jwt jwt) {
        return new QuizList(maker.list(userId(jwt)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    CreatedQuiz create(@AuthenticationPrincipal Jwt jwt) {
        return new CreatedQuiz(maker.create(userId(jwt)));
    }

    @GetMapping("/{quizId}/draft")
    ResponseEntity<Draft> getDraft(@AuthenticationPrincipal Jwt jwt, @PathVariable long quizId) {
        return privateDraft(maker.openDraft(userId(jwt), quizId));
    }

    @PutMapping("/{quizId}/draft")
    ResponseEntity<Draft> saveDraft(@AuthenticationPrincipal Jwt jwt, @PathVariable long quizId,
                                    @RequestBody DraftInput draft) {
        return privateDraft(maker.saveDraft(userId(jwt), quizId, draft));
    }

    @PostMapping("/{quizId}/publish")
    @ResponseStatus(HttpStatus.CREATED)
    Publication publish(@AuthenticationPrincipal Jwt jwt, @PathVariable long quizId) {
        return maker.publish(userId(jwt), quizId);
    }

    @ExceptionHandler(MakerService.Failure.class)
    ResponseEntity<ApiError> makerFailure(MakerService.Failure failure) {
        return ResponseEntity.status(failure.status).body(failure.error);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ApiError invalidBody() {
        return new ApiError("INVALID_REQUEST", "Expected a valid JSON draft", List.of());
    }

    private static ResponseEntity<Draft> privateDraft(Draft draft) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(draft);
    }

    private static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }

    record CreatedQuiz(long quizId) {}
    record QuizList(List<QuizSummary> items) {}
}
