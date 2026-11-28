package com.quizzcraft.play;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class PlayRepository {
    private static final String PUBLISHED = """
            SELECT r.quiz_id, r.id AS revision_id, r.title, q.status
            FROM quiz_revisions r JOIN quizzes q ON q.id = r.quiz_id
            WHERE r.state = 'PUBLISHED'
            """;
    private final JdbcClient db;

    PlayRepository(JdbcClient db) {
        this.db = db;
    }

    Revision current(long quizId) {
        return revision(PUBLISHED + """
                AND q.id = :id AND q.status = 'ACTIVE' AND q.latest_published_revision_id = r.id
                """, quizId);
    }

    Revision lockForSubmission(long revisionId) {
        // SHARE permits concurrent submissions but conflicts with an update to the quiz's removal status.
        return revision(PUBLISHED + " AND r.id = :id FOR SHARE OF q", revisionId);
    }

    private Revision revision(String sql, long id) {
        return db.sql(sql).param("id", id).query((row, number) ->
                new Revision(row.getLong("quiz_id"), row.getLong("revision_id"),
                        row.getString("title"), row.getString("status")))
                .optional().orElseThrow(() -> new PlayFailure(HttpStatus.NOT_FOUND, "NOT_FOUND",
                        "Published quiz revision unavailable"));
    }

    List<Question> questions(long revisionId) {
        return db.sql("""
                SELECT q.id, q.position, q.type, q.text, c.id AS choice_id, c.text AS choice_text, c.is_correct
                FROM questions q LEFT JOIN choices c ON c.question_id = q.id
                WHERE q.revision_id = :revisionId
                ORDER BY q.position, c.position
                """).param("revisionId", revisionId).query(rows -> {
            Map<Long, Question> ordered = new LinkedHashMap<>();
            while (rows.next()) {
                long id = rows.getLong("id");
                Question question = ordered.get(id);
                if (question == null) {
                    question = new Question(id, rows.getInt("position"), rows.getString("type"),
                            rows.getString("text"), new ArrayList<>());
                    ordered.put(id, question);
                }
                Long choiceId = rows.getObject("choice_id", Long.class);
                if (choiceId != null) {
                    question.choices().add(new Choice(choiceId, rows.getString("choice_text"),
                            rows.getBoolean("is_correct")));
                }
            }
            return List.copyOf(ordered.values());
        });
    }

    record Revision(long quizId, long revisionId, String title, String status) {}
    record Question(long questionId, int position, String type, String text, List<Choice> choices) {}
    record Choice(long choiceId, String text, boolean correct) {}
}
