-- QC-20 seed: original catalog test data (requirements section 6.4, ENG-02, CAT-01..05).
-- Runs after schema.sql on every startup. ON CONFLICT DO NOTHING makes it repeatable: an existing
-- row is never duplicated or overwritten, so admin renames, removals and republishes survive restarts.
-- Load it into a fresh database. On a reused one, older rows can occupy these ids or names.
--
-- Ids: Planets Warm-Up uses the QC-18 contract's ids (quiz 101, revision 1001, questions 5001-5003,
-- choices 9001-9008). The other quizzes use lower ids so that the next generated ids match the contract
-- examples: Planets' republish becomes revision 1002, and the first user-made quiz is 105.
--
-- Dev-only admin for the local demo: admin@quizzcraft.local / admin123 (bcrypt hash below).
-- Never reuse it outside a local database.

INSERT INTO categories (id, name, status) VALUES
    (1, 'Geography', 'ACTIVE'),
    (2, 'Science', 'ACTIVE'),
    (3, 'Mathematics', 'ACTIVE')
ON CONFLICT DO NOTHING;

INSERT INTO users (id, email, display_name, password_hash, role) VALUES
    (1, 'admin@quizzcraft.local', 'Admin', '$2a$10$XiR0UwShK0nhmSB1zHACgOGTZfF3PNBSJBIglV1j.u33N1NonESRC', 'ADMIN')
ON CONFLICT DO NOTHING;

INSERT INTO quizzes (id, owner_id, status) VALUES
    (101, 1, 'ACTIVE'),
    (102, 1, 'ACTIVE'),
    (103, 1, 'ACTIVE'),
    (104, 1, 'ACTIVE')
ON CONFLICT DO NOTHING;

INSERT INTO quiz_revisions (id, quiz_id, number, state, title, description, category_id, difficulty, published_at) VALUES
    (1001, 101, 1, 'PUBLISHED', 'Planets Warm-Up', 'Three quick questions about our solar system.', 2, 'EASY', '2026-11-27 09:00:00+02'),
    (902, 102, 1, 'PUBLISHED', 'Rivers and Mountains', 'Three true-or-false statements about famous rivers and peaks.', 1, 'MEDIUM', '2026-11-27 09:05:00+02'),
    (903, 103, 1, 'PUBLISHED', 'Fractions Challenge', 'Three tricky questions on adding, comparing and dividing fractions.', 3, 'HARD', '2026-11-27 09:10:00+02'),
    -- Private draft: never published, so it must never appear publicly (CAT-05).
    (904, 104, NULL, 'DRAFT', 'Moon Basics', 'Two statements about the Moon.', 2, 'EASY', NULL)
ON CONFLICT DO NOTHING;

-- Only set on a fresh seed, so a later republish of a seeded quiz is not undone on restart.
UPDATE quizzes SET latest_published_revision_id = 1001 WHERE id = 101 AND latest_published_revision_id IS NULL;
UPDATE quizzes SET latest_published_revision_id = 902 WHERE id = 102 AND latest_published_revision_id IS NULL;
UPDATE quizzes SET latest_published_revision_id = 903 WHERE id = 103 AND latest_published_revision_id IS NULL;

INSERT INTO questions (id, revision_id, position, type, text) VALUES
    -- Planets Warm-Up (MIXED)
    (5001, 1001, 1, 'MULTIPLE_CHOICE', 'Which planet is closest to the Sun?'),
    (5002, 1001, 2, 'TRUE_FALSE', 'Jupiter is a rocky planet.'),
    (5003, 1001, 3, 'MULTIPLE_CHOICE', 'How many planets orbit the Sun?'),
    -- Rivers and Mountains (TRUE_FALSE)
    (4201, 902, 1, 'TRUE_FALSE', 'The Nile flows into the Mediterranean Sea.'),
    (4202, 902, 2, 'TRUE_FALSE', 'Mount Everest is in the Andes.'),
    (4203, 902, 3, 'TRUE_FALSE', 'The Amazon River is in South America.'),
    -- Fractions Challenge (MULTIPLE_CHOICE)
    (4301, 903, 1, 'MULTIPLE_CHOICE', 'What is 3/4 + 5/6?'),
    (4302, 903, 2, 'MULTIPLE_CHOICE', 'Which fraction is the largest?'),
    (4303, 903, 3, 'MULTIPLE_CHOICE', 'What is 2/3 divided by 4/9?'),
    -- Moon Basics (draft, TRUE_FALSE)
    (4401, 904, 1, 'TRUE_FALSE', 'The Moon orbits the Earth.'),
    (4402, 904, 2, 'TRUE_FALSE', 'The Moon gives off its own light.')
ON CONFLICT DO NOTHING;

INSERT INTO choices (id, question_id, position, text, is_correct) VALUES
    (9001, 5001, 1, 'Venus', FALSE),
    (9002, 5001, 2, 'Mercury', TRUE),
    (9003, 5001, 3, 'Mars', FALSE),
    (9004, 5002, 1, 'True', FALSE),
    (9005, 5002, 2, 'False', TRUE),
    (9006, 5003, 1, '7', FALSE),
    (9007, 5003, 2, '8', TRUE),
    (9008, 5003, 3, '9', FALSE),

    (8201, 4201, 1, 'True', TRUE),
    (8202, 4201, 2, 'False', FALSE),
    (8203, 4202, 1, 'True', FALSE),
    (8204, 4202, 2, 'False', TRUE),
    (8205, 4203, 1, 'True', TRUE),
    (8206, 4203, 2, 'False', FALSE),

    (8301, 4301, 1, '19/12', TRUE),
    (8302, 4301, 2, '8/10', FALSE),
    (8303, 4301, 3, '15/24', FALSE),
    (8304, 4302, 1, '5/8', FALSE),
    (8305, 4302, 2, '7/12', FALSE),
    (8306, 4302, 3, '2/3', TRUE),
    (8307, 4303, 1, '3/2', TRUE),
    (8308, 4303, 2, '8/27', FALSE),
    (8309, 4303, 3, '2/3', FALSE),

    (8401, 4401, 1, 'True', TRUE),
    (8402, 4401, 2, 'False', FALSE),
    (8403, 4402, 1, 'True', FALSE),
    (8404, 4402, 2, 'False', TRUE)
ON CONFLICT DO NOTHING;

-- Move each identity past the highest id in use so generated ids never collide with seeded ones.
SELECT setval(pg_get_serial_sequence('categories', 'id'), (SELECT MAX(id) FROM categories));
SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users));
SELECT setval(pg_get_serial_sequence('quizzes', 'id'), (SELECT MAX(id) FROM quizzes));
SELECT setval(pg_get_serial_sequence('quiz_revisions', 'id'), (SELECT MAX(id) FROM quiz_revisions));
SELECT setval(pg_get_serial_sequence('questions', 'id'), (SELECT MAX(id) FROM questions));
SELECT setval(pg_get_serial_sequence('choices', 'id'), (SELECT MAX(id) FROM choices));
