-- QC-20 catalog check. Run after Spring Boot has seeded a fresh database:
--   psql -X -h 127.0.0.1 -p 55432 -U quizzcraft -d quizzcraft -v ON_ERROR_STOP=1 -f docs/qc-20-catalog-check.sql
-- It applies the QC-18 catalog rules in SQL until GET /api/quizzes exists (QC-22): only ACTIVE quizzes,
-- showing their latest PUBLISHED revision, with the format derived from the question types.
-- A MIXED quiz matches either format filter (CAT-03).

\echo '1. Seeded rows'
SELECT (SELECT COUNT(*) FROM categories) AS categories,
       (SELECT COUNT(*) FROM users) AS users,
       (SELECT COUNT(*) FROM quizzes) AS quizzes,
       (SELECT COUNT(*) FROM quiz_revisions) AS revisions,
       (SELECT COUNT(*) FROM questions) AS questions,
       (SELECT COUNT(*) FROM choices) AS choices;

\echo '2. Every quiz, including the draft'
SELECT q.id AS quiz_id, r.id AS revision_id, r.state, r.title, c.name AS category, r.difficulty,
       CASE WHEN BOOL_AND(qs.type = 'MULTIPLE_CHOICE') THEN 'MULTIPLE_CHOICE'
            WHEN BOOL_AND(qs.type = 'TRUE_FALSE') THEN 'TRUE_FALSE'
            ELSE 'MIXED' END AS format,
       COUNT(qs.id) AS question_count,
       q.latest_published_revision_id
FROM quizzes q
JOIN quiz_revisions r ON r.quiz_id = q.id
LEFT JOIN categories c ON c.id = r.category_id
LEFT JOIN questions qs ON qs.revision_id = r.id
GROUP BY q.id, r.id, r.state, r.title, c.name, r.difficulty
ORDER BY q.id;

\echo '3. Answer keys are valid (expect no rows): one correct choice per question, TF choices are exactly True/False'
SELECT qs.id AS question_id, qs.type,
       COUNT(ch.id) FILTER (WHERE ch.is_correct) AS correct_choices,
       STRING_AGG(ch.text, '/' ORDER BY ch.position) AS choices
FROM questions qs
JOIN choices ch ON ch.question_id = qs.id
GROUP BY qs.id, qs.type
HAVING COUNT(ch.id) FILTER (WHERE ch.is_correct) <> 1
    OR (qs.type = 'TRUE_FALSE' AND STRING_AGG(ch.text, '/' ORDER BY ch.position) <> 'True/False');

\echo '4. Expected catalog results per filter'
WITH catalog AS (
    SELECT q.id AS quiz_id, r.title, c.name AS category, r.difficulty,
           CASE WHEN BOOL_AND(qs.type = 'MULTIPLE_CHOICE') THEN 'MULTIPLE_CHOICE'
                WHEN BOOL_AND(qs.type = 'TRUE_FALSE') THEN 'TRUE_FALSE'
                ELSE 'MIXED' END AS format
    FROM quizzes q
    JOIN quiz_revisions r ON r.id = q.latest_published_revision_id AND r.state = 'PUBLISHED'
    JOIN categories c ON c.id = r.category_id
    JOIN questions qs ON qs.revision_id = r.id
    WHERE q.status = 'ACTIVE'
    GROUP BY q.id, r.title, c.name, r.difficulty
),
filters (ord, label, category, difficulty, format) AS (VALUES
    (1, 'no filters', NULL::text, NULL::text, NULL::text),
    (2, 'Science + Easy + True/False', 'Science', 'EASY', 'TRUE_FALSE'),
    (3, 'format = Multiple choice', NULL, NULL, 'MULTIPLE_CHOICE'),
    (4, 'format = True/False', NULL, NULL, 'TRUE_FALSE'),
    (5, 'Science + Easy', 'Science', 'EASY', NULL),
    (6, 'Geography + Medium', 'Geography', 'MEDIUM', NULL),
    (7, 'Mathematics + Hard', 'Mathematics', 'HARD', NULL),
    (8, 'Science + Hard (empty)', 'Science', 'HARD', NULL)
)
SELECT f.label AS filters,
       COUNT(c.quiz_id) AS matches,
       COALESCE(STRING_AGG(c.title, ', ' ORDER BY c.quiz_id), '(none)') AS expected_titles
FROM filters f
LEFT JOIN catalog c
       ON (f.category IS NULL OR c.category = f.category)
      AND (f.difficulty IS NULL OR c.difficulty = f.difficulty)
      AND (f.format IS NULL OR c.format = f.format OR c.format = 'MIXED')
GROUP BY f.ord, f.label
ORDER BY f.ord;

\echo '5. Next generated ids (contract examples: quiz 105, revision 1002)'
SELECT pg_sequence_last_value(pg_get_serial_sequence('quizzes', 'id')) + 1 AS next_quiz_id,
       pg_sequence_last_value(pg_get_serial_sequence('quiz_revisions', 'id')) + 1 AS next_revision_id;
