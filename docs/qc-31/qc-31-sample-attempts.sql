-- QC-31 live check: record two sample graded attempts for one account, standing in for QC-29's
-- POST /api/revisions/{id}/attempts until it lands. Attempt 1 is the contract's worked example (1/3),
-- and attempt 2 is an all-correct retake (3/3) one minute later.
--   psql -X -h 127.0.0.1 -p 55432 -U quizzcraft -d quizzcraft -v ON_ERROR_STOP=1 -v email=<address> -At -f docs/qc-31/qc-31-sample-attempts.sql
WITH player AS (
    SELECT id FROM users WHERE email = lower(:'email')
),
first AS (
    INSERT INTO attempts (user_id, revision_id, score, max_score, submitted_at)
    SELECT id, 1001, 1, 3, NOW() - INTERVAL '1 minute' FROM player RETURNING id
),
retake AS (
    INSERT INTO attempts (user_id, revision_id, score, max_score)
    SELECT id, 1001, 3, 3 FROM player RETURNING id
),
first_answers AS (
    INSERT INTO attempt_answers (attempt_id, question_id, choice_id, correct)
    SELECT first.id, v.question_id, v.choice_id, v.correct
    FROM first, (VALUES (5001, 9002::bigint, TRUE), (5002, 9004::bigint, FALSE), (5003, NULL::bigint, FALSE))
         AS v (question_id, choice_id, correct)
),
retake_answers AS (
    INSERT INTO attempt_answers (attempt_id, question_id, choice_id, correct)
    SELECT retake.id, v.question_id, v.choice_id, v.correct
    FROM retake, (VALUES (5001, 9002::bigint, TRUE), (5002, 9005::bigint, TRUE), (5003, 9007::bigint, TRUE))
         AS v (question_id, choice_id, correct)
)
SELECT (SELECT id FROM first) || ' ' || (SELECT id FROM retake);
