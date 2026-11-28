package com.quizzcraft.attempt;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * PostgreSQL attempt store (QC-31). QC-29 grades a submission and calls {@link #save}. History reads use
 * {@link #history} and {@link #result}. An attempt points at the immutable published revision it was graded
 * against, so reopening it shows that revision's questions even after the quiz is republished or removed.
 * It is a plain component, not a {@code @Repository}, so callers receive {@link IllegalArgumentException} as
 * documented instead of a translated Spring exception. {@link JdbcClient} still translates SQL errors.
 */
@Component
public class AttemptStore {
    /** One graded question, as QC-29 passes it in. {@code choiceId == null} means blank. */
    public record GradedAnswer(long questionId, Long choiceId, boolean correct) {}

    public record SavedAttempt(long attemptId, Instant submittedAt) {}

    /** Contract §5.4. The same body serves the 201 submission response and {@code GET /api/attempts/{id}}. */
    public record AttemptResult(long attemptId, long quizId, long revisionId, String title, Instant submittedAt,
                                int score, int maxScore, List<QuestionFeedback> questions,
                                Map<String, String> choices) {}

    public record QuestionFeedback(long questionId, String text, Long chosenChoiceId, Long correctChoiceId,
                                   boolean correct, int points) {}

    /** Contract §5.5. */
    public record HistoryItem(long attemptId, long quizId, long revisionId, String title, int score, int maxScore,
                              Instant submittedAt, boolean quizRemoved) {}

    private final JdbcClient jdbc;

    AttemptStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Saves a graded attempt and one answer row per question of the revision, together. It joins the caller's
     * transaction, so QC-29 can check for removal and save atomically. QC-29 validates the request first. A
     * graded result that does not match a published revision is a programming error and throws
     * {@link IllegalArgumentException} before anything is written.
     */
    @Transactional
    public SavedAttempt save(long ownerId, long revisionId, int score, int maxScore, List<GradedAnswer> answers) {
        checkMatchesPublishedRevision(revisionId, score, maxScore, answers);
        SavedAttempt saved = jdbc.sql("""
                        INSERT INTO attempts (user_id, revision_id, score, max_score)
                        VALUES (:ownerId, :revisionId, :score, :maxScore)
                        RETURNING id, submitted_at
                        """)
                .param("ownerId", ownerId)
                .param("revisionId", revisionId)
                .param("score", score)
                .param("maxScore", maxScore)
                .query((row, n) -> new SavedAttempt(row.getLong("id"), instant(row.getObject("submitted_at", OffsetDateTime.class))))
                .single();
        for (GradedAnswer answer : answers) {
            jdbc.sql("""
                            INSERT INTO attempt_answers (attempt_id, question_id, choice_id, correct)
                            VALUES (:attemptId, :questionId, :choiceId, :correct)
                            """)
                    .param("attemptId", saved.attemptId())
                    .param("questionId", answer.questionId())
                    .param("choiceId", answer.choiceId(), java.sql.Types.BIGINT)
                    .param("correct", answer.correct())
                    .update();
        }
        return saved;
    }

    /** The owner's attempts, newest first. Titles come from the attempted revision, not the current one. */
    public List<HistoryItem> history(long ownerId) {
        return jdbc.sql("""
                        SELECT a.id, r.quiz_id, a.revision_id, r.title, a.score, a.max_score, a.submitted_at,
                               q.status = 'REMOVED' AS quiz_removed
                        FROM attempts a
                        JOIN quiz_revisions r ON r.id = a.revision_id
                        JOIN quizzes q ON q.id = r.quiz_id
                        WHERE a.user_id = :ownerId
                        ORDER BY a.submitted_at DESC, a.id DESC
                        """)
                .param("ownerId", ownerId)
                .query((row, n) -> new HistoryItem(row.getLong("id"), row.getLong("quiz_id"),
                        row.getLong("revision_id"), row.getString("title"), row.getInt("score"),
                        row.getInt("max_score"), instant(row.getObject("submitted_at", OffsetDateTime.class)),
                        row.getBoolean("quiz_removed")))
                .list();
    }

    /** The account that owns an attempt, or empty if there is no such attempt. */
    public Optional<Long> ownerOf(long attemptId) {
        return jdbc.sql("SELECT user_id FROM attempts WHERE id = :attemptId")
                .param("attemptId", attemptId)
                .query(Long.class)
                .optional();
    }

    /** The full original result of an attempt, or empty if there is no such attempt. Does not check ownership. */
    public Optional<AttemptResult> result(long attemptId) {
        record Header(long quizId, long revisionId, String title, Instant submittedAt, int score, int maxScore) {}
        Optional<Header> header = jdbc.sql("""
                        SELECT r.quiz_id, a.revision_id, r.title, a.submitted_at, a.score, a.max_score
                        FROM attempts a JOIN quiz_revisions r ON r.id = a.revision_id
                        WHERE a.id = :attemptId
                        """)
                .param("attemptId", attemptId)
                .query((row, n) -> new Header(row.getLong("quiz_id"), row.getLong("revision_id"),
                        row.getString("title"), instant(row.getObject("submitted_at", OffsetDateTime.class)),
                        row.getInt("score"), row.getInt("max_score")))
                .optional();
        if (header.isEmpty()) {
            return Optional.empty();
        }
        Header h = header.get();
        List<QuestionFeedback> questions = jdbc.sql("""
                        SELECT qs.id, qs.text, aa.choice_id, COALESCE(aa.correct, FALSE) AS correct,
                               (SELECT ch.id FROM choices ch
                                WHERE ch.question_id = qs.id AND ch.is_correct
                                ORDER BY ch.position LIMIT 1) AS correct_choice_id
                        FROM questions qs
                        LEFT JOIN attempt_answers aa ON aa.question_id = qs.id AND aa.attempt_id = :attemptId
                        WHERE qs.revision_id = :revisionId
                        ORDER BY qs.position
                        """)
                .param("attemptId", attemptId)
                .param("revisionId", h.revisionId())
                .query((row, n) -> {
                    boolean correct = row.getBoolean("correct");
                    return new QuestionFeedback(row.getLong("id"), row.getString("text"),
                            row.getObject("choice_id", Long.class), row.getObject("correct_choice_id", Long.class),
                            correct, correct ? 1 : 0);
                })
                .list();
        Map<String, String> choices = new LinkedHashMap<>();
        jdbc.sql("""
                        SELECT ch.id, ch.text FROM choices ch JOIN questions qs ON qs.id = ch.question_id
                        WHERE qs.revision_id = :revisionId
                        ORDER BY qs.position, ch.position
                        """)
                .param("revisionId", h.revisionId())
                .query((row, n) -> choices.put(Long.toString(row.getLong("id")), row.getString("text")))
                .list();
        return Optional.of(new AttemptResult(attemptId, h.quizId(), h.revisionId(), h.title(), h.submittedAt(),
                h.score(), h.maxScore(), questions, choices));
    }

    private void checkMatchesPublishedRevision(long revisionId, int score, int maxScore, List<GradedAnswer> answers) {
        Map<Long, Set<Long>> choicesByQuestion = new HashMap<>();
        jdbc.sql("""
                        SELECT qs.id AS question_id, ch.id AS choice_id
                        FROM quiz_revisions r
                        JOIN questions qs ON qs.revision_id = r.id
                        LEFT JOIN choices ch ON ch.question_id = qs.id
                        WHERE r.id = :revisionId AND r.state = 'PUBLISHED'
                        """)
                .param("revisionId", revisionId)
                .query((row, n) -> {
                    Set<Long> choices = choicesByQuestion.computeIfAbsent(row.getLong("question_id"), id -> new HashSet<>());
                    Long choice = row.getObject("choice_id", Long.class);
                    if (choice != null) {
                        choices.add(choice);
                    }
                    return null;
                })
                .list();
        if (choicesByQuestion.isEmpty()) {
            throw new IllegalArgumentException("Revision " + revisionId + " is not a published revision with questions");
        }
        Set<Long> seen = new HashSet<>();
        int correctCount = 0;
        for (GradedAnswer answer : answers) {
            Set<Long> choices = choicesByQuestion.get(answer.questionId());
            if (choices == null || !seen.add(answer.questionId())) {
                throw new IllegalArgumentException("Question " + answer.questionId()
                        + " is not in revision " + revisionId + " or appears twice");
            }
            if (answer.choiceId() != null && !choices.contains(answer.choiceId())) {
                throw new IllegalArgumentException("Choice " + answer.choiceId() + " is not under question " + answer.questionId());
            }
            if (answer.correct() && answer.choiceId() == null) {
                throw new IllegalArgumentException("A blank answer cannot be correct (question " + answer.questionId() + ")");
            }
            if (answer.correct()) {
                correctCount++;
            }
        }
        if (seen.size() != choicesByQuestion.size()) {
            throw new IllegalArgumentException("Expected one answer for each of the " + choicesByQuestion.size()
                    + " questions in revision " + revisionId + ", blanks included");
        }
        if (maxScore != choicesByQuestion.size() || score != correctCount) {
            throw new IllegalArgumentException("Score " + score + "/" + maxScore + " does not match "
                    + correctCount + " correct answers out of " + choicesByQuestion.size() + " questions");
        }
    }

    private static Instant instant(OffsetDateTime time) {
        return time.toInstant();
    }
}
