package com.quizzcraft.maker;

import java.time.OffsetDateTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

final class MakerModels {
    private MakerModels() {}

    record QuizSummary(long quizId, String title, String status, boolean hasDraft, Published published) {}
    record Published(long revisionId, int number, OffsetDateTime publishedAt) {}
    record Publication(long quizId, long revisionId, int number) {}

    record DraftInput(String title, String description, Long categoryId, String difficulty, List<Question> questions) {}
    record Draft(long quizId, String title, String description, Long categoryId, String difficulty,
                 List<Question> questions) {
        Draft(long quizId, DraftInput input) {
            this(quizId, input.title(), input.description(), input.categoryId(), input.difficulty(), input.questions());
        }
    }
    record Question(String type, String text, List<Choice> choices) {}
    record Choice(String text, @JsonProperty("isCorrect") boolean isCorrect) {}
    record ApiError(String error, String message, List<FieldError> fieldErrors) {}
    record FieldError(String field, String message) {}
}
