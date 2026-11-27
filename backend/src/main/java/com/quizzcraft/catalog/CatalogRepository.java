package com.quizzcraft.catalog;

import java.sql.Types;
import java.util.List;
import java.util.Optional;

import com.quizzcraft.category.CategoryController.CategoryResponse;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class CatalogRepository {
    private static final String CATALOG = """
            WITH catalog AS (
                SELECT q.id AS quiz_id, r.id AS revision_id, r.title, r.description, r.difficulty,
                       c.id AS category_id, c.name AS category_name, c.status AS category_status,
                       CASE WHEN BOOL_AND(qs.type = 'MULTIPLE_CHOICE') THEN 'MULTIPLE_CHOICE'
                            WHEN BOOL_AND(qs.type = 'TRUE_FALSE') THEN 'TRUE_FALSE'
                            ELSE 'MIXED' END AS format,
                       COUNT(*) AS question_count
                FROM quizzes q
                JOIN quiz_revisions r ON r.id = q.latest_published_revision_id
                                     AND r.quiz_id = q.id AND r.state = 'PUBLISHED'
                JOIN categories c ON c.id = r.category_id
                JOIN questions qs ON qs.revision_id = r.id
                WHERE q.status = 'ACTIVE'
                GROUP BY q.id, r.id, c.id
            )
            SELECT * FROM catalog
            """;

    private static final RowMapper<CatalogQuiz> MAP_QUIZ = (row, rowNumber) -> new CatalogQuiz(
            row.getLong("quiz_id"), row.getLong("revision_id"), row.getString("title"),
            row.getString("description"), new CategoryResponse(row.getLong("category_id"),
                    row.getString("category_name"), row.getString("category_status")),
            row.getString("difficulty"), row.getString("format"), row.getLong("question_count"));

    private final JdbcClient jdbc;

    CatalogRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    List<CatalogQuiz> browse(Long categoryId, String difficulty, String format) {
        return jdbc.sql(CATALOG + """
                WHERE (:categoryId IS NULL OR category_id = :categoryId)
                  AND (:difficulty IS NULL OR difficulty = :difficulty)
                  AND (:format IS NULL OR format IN (:format, 'MIXED'))
                ORDER BY quiz_id
                """)
                .param("categoryId", categoryId, Types.BIGINT)
                .param("difficulty", difficulty, Types.VARCHAR)
                .param("format", format, Types.VARCHAR)
                .query(MAP_QUIZ)
                .list();
    }

    Optional<CatalogQuiz> findPublicQuiz(long quizId) {
        return jdbc.sql(CATALOG + "WHERE quiz_id = :quizId")
                .param("quizId", quizId)
                .query(MAP_QUIZ)
                .optional();
    }
}
