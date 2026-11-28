package com.quizzcraft.play;

import java.sql.Types;
import java.time.Instant;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
class AttemptStore {
    record Answer(long questionId, Long choiceId, boolean correct) {}
    record Saved(long attemptId, Instant submittedAt) {}

    private final JdbcClient jdbc;

    AttemptStore(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Saved save(long userId, long revisionId, int score, int maxScore, List<Answer> answers) {
        Saved saved = jdbc.sql("""
                INSERT INTO attempts (user_id, revision_id, score, max_score)
                VALUES (:user, :revision, :score, :maxScore)
                RETURNING id, submitted_at
                """)
                .param("user", userId).param("revision", revisionId)
                .param("score", score).param("maxScore", maxScore)
                .query((row, n) -> new Saved(row.getLong("id"), row.getTimestamp("submitted_at").toInstant()))
                .single();

        for (Answer answer : answers) {
            jdbc.sql("""
                    INSERT INTO attempt_answers (attempt_id, question_id, choice_id, correct)
                    VALUES (:attempt, :question, :choice, :correct)
                    """)
                    .param("attempt", saved.attemptId()).param("question", answer.questionId())
                    .param("choice", answer.choiceId(), Types.BIGINT).param("correct", answer.correct())
                    .update();
        }
        return saved;
    }
}
