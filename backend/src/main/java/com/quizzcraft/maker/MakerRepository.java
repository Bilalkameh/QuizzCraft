package com.quizzcraft.maker;

import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import static com.quizzcraft.maker.MakerModels.*;

@Repository
class MakerRepository {
    private final JdbcClient jdbc;

    MakerRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    List<QuizSummary> list(long userId) {
        return jdbc.sql("""
                SELECT q.id, q.status, d.id AS draft_id,
                       CASE WHEN d.id IS NOT NULL THEN d.title ELSE p.title END AS title,
                       p.id AS published_id, p.number, p.published_at
                FROM quizzes q
                LEFT JOIN quiz_revisions d ON d.quiz_id = q.id AND d.state = 'DRAFT'
                LEFT JOIN quiz_revisions p ON p.id = q.latest_published_revision_id
                                          AND p.quiz_id = q.id AND p.state = 'PUBLISHED'
                WHERE q.owner_id = :owner
                ORDER BY q.id
                """).param("owner", userId).query((row, index) -> {
            Long publishedId = row.getObject("published_id", Long.class);
            Published published = publishedId == null ? null : new Published(
                    publishedId, row.getInt("number"), row.getObject("published_at", OffsetDateTime.class));
            return new QuizSummary(row.getLong("id"), row.getString("title"), row.getString("status"),
                    row.getObject("draft_id") != null, published);
        }).list();
    }

    long createQuiz(long userId) {
        return jdbc.sql("INSERT INTO quizzes (owner_id) VALUES (:owner) RETURNING id")
                .param("owner", userId).query(Long.class).single();
    }

    Optional<Quiz> lockQuiz(long quizId, long userId) {
        return jdbc.sql("""
                SELECT status, latest_published_revision_id
                FROM quizzes WHERE id = :quiz AND owner_id = :owner FOR UPDATE
                """).param("quiz", quizId).param("owner", userId)
                .query((row, index) -> new Quiz(row.getString("status"),
                        row.getObject("latest_published_revision_id", Long.class))).optional();
    }

    boolean quizExists(long quizId) {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM quizzes WHERE id = :quiz)")
                .param("quiz", quizId).query(Boolean.class).single();
    }

    Optional<Long> findDraft(long quizId) {
        return jdbc.sql("SELECT id FROM quiz_revisions WHERE quiz_id = :quiz AND state = 'DRAFT'")
                .param("quiz", quizId).query(Long.class).optional();
    }

    long createDraft(long quizId) {
        return jdbc.sql("INSERT INTO quiz_revisions (quiz_id, state) VALUES (:quiz, 'DRAFT') RETURNING id")
                .param("quiz", quizId).query(Long.class).single();
    }

    Optional<Long> findPublished(long quizId, long revisionId) {
        return jdbc.sql("SELECT id FROM quiz_revisions WHERE id = :revision AND quiz_id = :quiz AND state = 'PUBLISHED'")
                .param("revision", revisionId).param("quiz", quizId).query(Long.class).optional();
    }

    DraftInput load(long revisionId) {
        List<Question> questions = new ArrayList<>();
        List<Choice> choices = null;
        long currentQuestionId = 0;
        for (var row : jdbc.sql("""
                SELECT q.id, q.type, q.text AS question_text, c.id AS choice_id, c.text AS choice_text, c.is_correct
                FROM questions q LEFT JOIN choices c ON c.question_id = q.id
                WHERE q.revision_id = :revision
                ORDER BY q.position,
                         CASE WHEN q.type = 'TRUE_FALSE' AND c.text = 'True' THEN 0 ELSE 1 END, c.position
                """).param("revision", revisionId).query((rs, index) ->
                new QuestionRow(rs.getLong("id"), rs.getString("type"), rs.getString("question_text"),
                        rs.getObject("choice_id") == null ? null
                                : new Choice(rs.getString("choice_text"), rs.getBoolean("is_correct")))).list()) {
            if (choices == null || row.id() != currentQuestionId) {
                currentQuestionId = row.id();
                choices = new ArrayList<>();
                questions.add(new Question(row.type(), row.text(), choices));
            }
            if (row.choice() != null) {
                choices.add(row.choice());
            }
        }
        return jdbc.sql("SELECT title, description, category_id, difficulty FROM quiz_revisions WHERE id = :revision")
                .param("revision", revisionId)
                .query((row, index) -> new DraftInput(row.getString("title"), row.getString("description"),
                        row.getObject("category_id", Long.class), row.getString("difficulty"), questions)).single();
    }

    void replace(long draftId, DraftInput draft) {
        int updated = jdbc.sql("""
                UPDATE quiz_revisions SET title = :title, description = :description,
                    category_id = :category, difficulty = :difficulty
                WHERE id = :draft AND state = 'DRAFT'
                """).param("title", draft.title(), Types.VARCHAR)
                .param("description", draft.description(), Types.VARCHAR)
                .param("category", draft.categoryId(), Types.BIGINT)
                .param("difficulty", draft.difficulty(), Types.VARCHAR)
                .param("draft", draftId).update();
        if (updated != 1) {
            throw new IllegalStateException("Expected one draft to replace");
        }
        jdbc.sql("""
                DELETE FROM choices USING questions
                WHERE choices.question_id = questions.id AND questions.revision_id = :draft
                """).param("draft", draftId).update();
        jdbc.sql("DELETE FROM questions WHERE revision_id = :draft").param("draft", draftId).update();

        int questionPosition = 0;
        for (var question : draft.questions()) {
            long questionId = jdbc.sql("""
                    INSERT INTO questions (revision_id, position, type, text)
                    VALUES (:draft, :position, :type, :text) RETURNING id
                    """).param("draft", draftId).param("position", ++questionPosition)
                    .param("type", question.type()).param("text", question.text()).query(Long.class).single();
            int choicePosition = 0;
            for (var choice : question.choices()) {
                jdbc.sql("""
                        INSERT INTO choices (question_id, position, text, is_correct)
                        VALUES (:question, :position, :text, :correct)
                        """).param("question", questionId).param("position", ++choicePosition)
                        .param("text", choice.text()).param("correct", choice.isCorrect()).update();
            }
        }
    }

    Optional<String> lockCategoryStatus(long categoryId) {
        return jdbc.sql("SELECT status FROM categories WHERE id = :category FOR SHARE")
                .param("category", categoryId).query(String.class).optional();
    }

    int publish(long quizId, long draftId) {
        int number = jdbc.sql("""
                UPDATE quiz_revisions
                SET state = 'PUBLISHED', published_at = clock_timestamp(),
                    number = (SELECT COALESCE(MAX(number), 0) + 1 FROM quiz_revisions WHERE quiz_id = :quiz)
                WHERE id = :draft AND quiz_id = :quiz AND state = 'DRAFT'
                RETURNING number
                """).param("quiz", quizId).param("draft", draftId).query(Integer.class).single();
        jdbc.sql("UPDATE quizzes SET latest_published_revision_id = :draft WHERE id = :quiz")
                .param("draft", draftId).param("quiz", quizId).update();
        return number;
    }

    record Quiz(String status, Long publishedId) {}
    private record QuestionRow(long id, String type, String text, Choice choice) {}
}
