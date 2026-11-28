package com.quizzcraft.play;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class PlayService {
    private final PlayRepository revisions;
    private final AttemptStore attempts;

    PlayService(PlayRepository revisions, AttemptStore attempts) {
        this.revisions = revisions;
        this.attempts = attempts;
    }

    @Transactional(readOnly = true)
    public PlayQuiz play(long quizId) {
        var revision = revisions.current(quizId);
        var questions = revisions.questions(revision.revisionId()).stream()
                .map(q -> new PlayQuestion(q.questionId(), q.position(), q.type(), q.text(),
                        q.choices().stream().map(c -> new PlayChoice(c.choiceId(), c.text())).toList()))
                .toList();
        return new PlayQuiz(quizId, revision.revisionId(), revision.title(), questions);
    }

    @Transactional
    public Result submit(long ownerId, long revisionId, SubmissionRequest request) {
        var revision = revisions.lockForSubmission(revisionId);
        if ("REMOVED".equals(revision.status())) {
            throw new PlayFailure(HttpStatus.GONE, "QUIZ_REMOVED", "This quiz was removed");
        }
        var grade = grade(revisions.questions(revisionId), request.selections());
        int maxScore = grade.questions().size();
        var answers = grade.questions().stream()
                .map(q -> new AttemptStore.Answer(q.questionId(), q.chosenChoiceId(), q.correct()))
                .toList();
        var saved = attempts.save(ownerId, revisionId, grade.score(), maxScore, answers);
        return new Result(saved.attemptId(), revision.quizId(), revisionId, revision.title(),
                saved.submittedAt(), grade.score(), maxScore, grade.questions(), grade.choices());
    }

    private static Grade grade(List<PlayRepository.Question> questions, Map<Long, Long> selections) {
        if (questions.isEmpty()) {
            throw new IllegalStateException("Published revision has no questions");
        }
        var remaining = new HashMap<>(selections);
        var feedback = new ArrayList<Feedback>(questions.size());
        var choiceLabels = new LinkedHashMap<Long, String>();
        int score = 0;
        for (var question : questions) {
            Long chosen = remaining.remove(question.questionId());
            Long key = null;
            boolean validChoice = chosen == null;
            for (var choice : question.choices()) {
                choiceLabels.put(choice.choiceId(), choice.text());
                if (Objects.equals(chosen, choice.choiceId())) {
                    validChoice = true;
                }
                if (choice.correct()) {
                    if (key != null) {
                        throw new IllegalStateException("Published question has multiple correct choices");
                    }
                    key = choice.choiceId();
                }
            }
            if (key == null) {
                throw new IllegalStateException("Published question has no correct choice");
            }
            if (!validChoice) {
                throw PlayFailure.invalid("Choice does not belong to its question");
            }
            boolean correct = key.equals(chosen);
            int points = correct ? 1 : 0;
            score += points;
            feedback.add(new Feedback(question.questionId(), question.text(), chosen, key, correct, points));
        }
        if (!remaining.isEmpty()) {
            throw PlayFailure.invalid("Question does not belong to this revision");
        }
        return new Grade(score, feedback, choiceLabels);
    }

    record PlayQuiz(long quizId, long revisionId, String title, List<PlayQuestion> questions) {}
    record PlayQuestion(long questionId, int position, String type, String text, List<PlayChoice> choices) {}
    record PlayChoice(long choiceId, String text) {}
    record Feedback(long questionId, String text, Long chosenChoiceId, long correctChoiceId,
                    boolean correct, int points) {}
    record Result(long attemptId, long quizId, long revisionId, String title, Instant submittedAt,
                  int score, int maxScore, List<Feedback> questions, Map<Long, String> choices) {}
    private record Grade(int score, List<Feedback> questions, Map<Long, String> choices) {}
}
