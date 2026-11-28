package com.quizzcraft.maker;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import static com.quizzcraft.maker.MakerModels.*;

@Service
class MakerService {
    private static final Set<String> DIFFICULTIES = Set.of("EASY", "MEDIUM", "HARD");
    private static final Set<String> QUESTION_TYPES = Set.of("MULTIPLE_CHOICE", "TRUE_FALSE");

    private final MakerRepository repository;

    MakerService(MakerRepository repository) {
        this.repository = repository;
    }

    List<QuizSummary> list(long userId) {
        return repository.list(userId);
    }

    @Transactional
    public long create(long userId) {
        long quizId = repository.createQuiz(userId);
        repository.createDraft(quizId);
        return quizId;
    }

    @Transactional
    public Draft openDraft(long userId, long quizId) {
        var quiz = requireOwnedQuiz(userId, quizId);
        long draftId = repository.findDraft(quizId).orElseGet(() -> {
            long newId = repository.createDraft(quizId);
            if (quiz.publishedId() != null) {
                repository.findPublished(quizId, quiz.publishedId())
                        .ifPresent(id -> repository.replace(newId, repository.load(id)));
            }
            return newId;
        });
        return new Draft(quizId, repository.load(draftId));
    }

    @Transactional
    public Draft saveDraft(long userId, long quizId, DraftInput input) {
        requireOwnedQuiz(userId, quizId);
        var errors = new ArrayList<FieldError>();
        var questions = normalizeQuestions(input.questions(), errors);
        checkText(errors, "title", input.title(), 200);
        checkText(errors, "description", input.description(), Integer.MAX_VALUE);
        if (input.difficulty() != null && !DIFFICULTIES.contains(input.difficulty())) {
            errors.add(new FieldError("difficulty", "Choose Easy, Medium or Hard"));
        }
        checkCategory(input.categoryId(), errors, false);
        requireValid(errors, "Check the draft fields");

        var draft = new DraftInput(input.title(), input.description(), input.categoryId(), input.difficulty(), questions);
        long draftId = repository.findDraft(quizId).orElseGet(() -> repository.createDraft(quizId));
        repository.replace(draftId, draft);
        return new Draft(quizId, draft);
    }

    @Transactional
    public Publication publish(long userId, long quizId) {
        requireOwnedQuiz(userId, quizId);
        long draftId = repository.findDraft(quizId).orElseThrow(() -> invalid("Quiz cannot be published",
                List.of(new FieldError("draft", "Save a draft before publishing"))));
        var draft = repository.load(draftId);
        var errors = new ArrayList<FieldError>();
        if (blank(draft.title())) {
            errors.add(new FieldError("title", "Enter a title"));
        }
        checkCategory(draft.categoryId(), errors, true);
        if (draft.difficulty() == null || !DIFFICULTIES.contains(draft.difficulty())) {
            errors.add(new FieldError("difficulty", "Choose Easy, Medium or Hard"));
        }
        if (draft.questions().isEmpty()) {
            errors.add(new FieldError("questions", "Add at least one question"));
        }
        for (int i = 0; i < draft.questions().size(); i++) {
            checkPublishQuestion(draft.questions().get(i), "questions[" + i + "]", errors);
        }
        requireValid(errors, "Quiz cannot be published");

        int number = repository.publish(quizId, draftId);
        return new Publication(quizId, draftId, number);
    }

    private MakerRepository.Quiz requireOwnedQuiz(long userId, long quizId) {
        var quiz = repository.lockQuiz(quizId, userId).orElseThrow(() -> repository.quizExists(quizId)
                ? new Failure(HttpStatus.FORBIDDEN, new ApiError("FORBIDDEN", "Only the quiz owner can edit it", List.of()))
                : quizNotFound());
        if (!"ACTIVE".equals(quiz.status())) {
            throw quizNotFound();
        }
        return quiz;
    }

    private void checkCategory(Long categoryId, List<FieldError> errors, boolean required) {
        if (categoryId == null) {
            if (required) {
                errors.add(new FieldError("categoryId", "Choose an active category"));
            }
            return;
        }
        repository.lockCategoryStatus(categoryId).ifPresentOrElse(status -> {
            if (!"ACTIVE".equals(status)) {
                errors.add(new FieldError("categoryId", "Category is retired"));
            }
        }, () -> errors.add(new FieldError("categoryId", "Category does not exist")));
    }

    private static List<Question> normalizeQuestions(List<Question> input, List<FieldError> errors) {
        if (input == null) {
            return List.of();
        }
        var questions = new ArrayList<Question>();
        for (int i = 0; i < input.size(); i++) {
            String path = "questions[" + i + "]";
            Question question = input.get(i);
            if (question == null || question.type() == null || !QUESTION_TYPES.contains(question.type())) {
                errors.add(new FieldError(path + ".type", "Choose Multiple Choice or True/False"));
                continue;
            }
            checkText(errors, path + ".text", question.text(), Integer.MAX_VALUE);
            var choices = normalizeChoices(question, path + ".choices", errors);
            questions.add(new Question(question.type(), emptyIfNull(question.text()), choices));
        }
        return questions;
    }

    private static List<Choice> normalizeChoices(Question question, String path, List<FieldError> errors) {
        var choices = new ArrayList<Choice>();
        if (question.choices() != null) {
            for (Choice choice : question.choices()) {
                if (choice == null) {
                    errors.add(new FieldError(path, "Each choice must be an object"));
                    continue;
                }
                checkText(errors, path, choice.text(), 500);
                choices.add(new Choice(emptyIfNull(choice.text()), choice.isCorrect()));
            }
        }
        if ("TRUE_FALSE".equals(question.type())) {
            if (choices.isEmpty()) {
                return List.of(new Choice("True", false), new Choice("False", false));
            }
            if (!trueFalsePair(choices)) {
                errors.add(new FieldError(path, "Use exactly the choices True and False"));
            } else {
                choices.sort(Comparator.comparing(choice -> !"True".equals(choice.text())));
            }
        }
        return choices;
    }

    private static void checkPublishQuestion(Question question, String path, List<FieldError> errors) {
        if (blank(question.text())) {
            errors.add(new FieldError(path + ".text", "Enter the question text"));
        }
        String choicePath = path + ".choices";
        var choices = question.choices();
        if ("TRUE_FALSE".equals(question.type())) {
            if (!trueFalsePair(choices)) {
                errors.add(new FieldError(choicePath, "Use exactly the choices True and False"));
            }
        } else if (choices.size() < 2 || choices.size() > 6) {
            errors.add(new FieldError(choicePath, "Enter 2 to 6 multiple-choice options"));
        } else if (choices.stream().anyMatch(choice -> blank(choice.text()))) {
            errors.add(new FieldError(choicePath, "Enter text for every choice"));
        }
        if (choices.stream().filter(Choice::isCorrect).count() != 1) {
            errors.add(new FieldError(choicePath, "Exactly one choice must be correct"));
        }
    }

    private static boolean trueFalsePair(List<Choice> choices) {
        return choices.size() == 2 && choices.stream().anyMatch(choice -> "True".equals(choice.text()))
                && choices.stream().anyMatch(choice -> "False".equals(choice.text()));
    }

    private static void checkText(List<FieldError> errors, String path, String text, int limit) {
        if (text != null && text.indexOf(0) >= 0) {
            errors.add(new FieldError(path, "Text must not contain a null character"));
        } else if (text != null && text.length() > limit && text.codePointCount(0, text.length()) > limit) {
            errors.add(new FieldError(path, "Enter at most " + limit + " characters"));
        }
    }

    private static boolean blank(String text) {
        return text == null || text.isBlank();
    }

    private static String emptyIfNull(String text) {
        return text == null ? "" : text;
    }

    private static void requireValid(List<FieldError> errors, String message) {
        if (!errors.isEmpty()) {
            throw invalid(message, errors);
        }
    }

    private static Failure invalid(String message, List<FieldError> errors) {
        return new Failure(HttpStatus.UNPROCESSABLE_ENTITY, new ApiError("VALIDATION_FAILED", message, errors));
    }

    private static Failure quizNotFound() {
        return new Failure(HttpStatus.NOT_FOUND, new ApiError("QUIZ_NOT_FOUND", "Quiz was not found", List.of()));
    }

    static class Failure extends RuntimeException {
        final HttpStatus status;
        final ApiError error;

        Failure(HttpStatus status, ApiError error) {
            super(error.message());
            this.status = status;
            this.error = error;
        }
    }
}
