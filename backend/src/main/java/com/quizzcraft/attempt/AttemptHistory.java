package com.quizzcraft.attempt;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/**
 * Reads saved attempts back from PostgreSQL (QC-31). QC-29 grades a submission and saves it in one transaction
 * (play/AttemptStore). An attempt points at the immutable published revision it was graded against, so
 * reopening it shows that revision's questions even after the quiz is republished or removed.
 */
@Repository
class AttemptHistory {
    /** Contract §5.4, the same shape as the 201 submission response. */
    record AttemptResult(long attemptId, long quizId, long revisionId, String title, Instant submittedAt,
                         int score, int maxScore, List<QuestionFeedback> questions, Map<String, String> choices) {}

    record QuestionFeedback(long questionId, String text, Long chosenChoiceId, Long correctChoiceId,
                            boolean correct, int points) {}

    /** Contract §5.5. */
    record HistoryItem(long attemptId, long quizId, long revisionId, String title, int score, int maxScore,
                       Instant submittedAt, boolean quizRemoved) {}

    private final JdbcClient jdbc;

    AttemptHistory(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** The owner's attempts, newest first. Titles come from the attempted revision, not the current one. */
    List<HistoryItem> history(long ownerId) {
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
    Optional<Long> ownerOf(long attemptId) {
        return jdbc.sql("SELECT user_id FROM attempts WHERE id = :attemptId")
                .param("attemptId", attemptId)
                .query(Long.class)
                .optional();
    }

    /** The full original result of an attempt, or empty if there is no such attempt. Does not check ownership. */
    Optional<AttemptResult> result(long attemptId) {
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

    private static Instant instant(OffsetDateTime time) {
        return time.toInstant();
    }
}
