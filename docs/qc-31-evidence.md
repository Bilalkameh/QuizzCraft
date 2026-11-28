# QC-31 · Attempt store and private history

28 November 2026 · Ghadi · [Jira QC-31](https://net-team-s2bxx850.atlassian.net/browse/QC-31) · Branch `QC-31` from `origin/master` at `cf2a29b`

QC-31 stores each graded attempt in PostgreSQL and serves it only to its owner. It follows the [contract](../api-contract.md) (§2 data model, §3 access, §5.4–5.5 shapes, decision D4) and the save interface in Hady's [QC-29 implementation proposal](https://github.com/Bilalkameh/QuizzCraft/blob/hady/sprint2-scoring/docs/qc-29-implementation-proposal.md) (step 4). Scoring and `POST /api/revisions/{id}/attempts` belong to QC-29 and are not on master yet, so this work was developed and tested against sample graded results, as the ticket allows.

## What was built

| Part | Behaviour |
| --- | --- |
| [`schema.sql`](../backend/src/main/resources/schema.sql) | `attempts` holds owner, revision, `submitted_at`, score and max score. Ids start at 7001, matching the contract. `attempt_answers` holds one row per question of the revision, with `choice_id` NULL for a blank and `correct`. An attempt points at the immutable published revision, so history does not depend on later edits. |
| [`AttemptStore`](../backend/src/main/java/com/quizzcraft/attempt/AttemptStore.java) | `save(ownerId, revisionId, score, maxScore, answers)` writes the attempt and its answers in one transaction, joining the caller's transaction, and returns the attempt ID and submission time. It refuses a graded result that does not match a published revision with `IllegalArgumentException`, before writing anything. `result(id)` returns the §5.4 body, and `history(ownerId)` the §5.5 items, newest first. |
| [`AttemptController`](../backend/src/main/java/com/quizzcraft/attempt/AttemptController.java) | `GET /api/me/attempts` returns the caller's own attempts. `GET /api/attempts/{id}` returns the full original result to its owner, `403 FORBIDDEN` to another user and `404 NOT_FOUND` for an unknown ID. Signed out, both routes return `401`. The owner keeps access after removal, and history shows `quizRemoved: true`. |

## For QC-29 (Hady)

After grading, call the store in the same transaction as the removal check, then return its result as the 201 body. That way the submission response and `GET /api/attempts/{id}` are always identical.

```java
SavedAttempt saved = attemptStore.save(userId, revisionId, score, maxScore, answers); // one GradedAnswer per question, blanks included
return ResponseEntity.status(201).body(attemptStore.result(saved.attemptId()).orElseThrow());
```

`GradedAnswer(questionId, choiceId /* null = blank */, correct)`. The store checks that every question of the published revision appears exactly once, that each choice belongs to its question, that a blank is never correct, and that `score` and `maxScore` equal the correct count and the question count.

## Database and API tests

[`AttemptHistoryIntegrationTest`](../backend/src/test/java/com/quizzcraft/attempt/AttemptHistoryIntegrationTest.java) starts the real application on a new PostgreSQL schema, in the same pattern as QC-21, and removes the schema afterwards.

```powershell
cd backend
$env:QUIZZCRAFT_TEST_DB_URL = 'jdbc:postgresql://127.0.0.1:55432/quizzcraft'
mvn -B verify
```

Run on PostgreSQL 16.16, Temurin 25.0.4 (the pom targets Java 21) and Maven 3.9.8, with `-Dmaven.repo.local=../.qc19/m2` because of a local sandbox. **12 tests, 0 failures, 0 errors, 0 skipped. BUILD SUCCESS.** That is QC-31's 5 tests and QC-21's 7, all still passing.

| Test | Checks | Requirement |
| --- | --- | --- |
| `savedAttemptReopensWithTheContractResultAndAppearsInHistory` | The worked example (Mercury, True, blank) reopens as attempt ≥ 7001 with 1/3, points `[1, 0, 0]`, the correct choices 9002/9005/9007, all 8 choice texts and the saved `submittedAt`. History lists it with `quizRemoved: false`. | REV-01, PLAY-05 |
| `retakesAreSeparateRecordsListedNewestFirst` | Two saves give two IDs, each with its own score (1/3 and 3/3), and 6 answer rows. History lists the retake first. | REV-02 |
| `historyIsPrivateToItsOwner` | Player B gets `403` with no answers, and B's history excludes A's attempt. Signed out, both routes return `401`. Unknown ID returns `404`. | REV-03 |
| `saveRejectsGradedResultsThatDoNotMatchAPublishedRevision` | Rejected: a draft revision, a missing question, a question from another revision, a duplicate question, a choice from another question, a correct blank, a wrong score, and an unknown revision. The attempt count is unchanged. | Contract §2 |
| `attemptKeepsItsOriginalRevisionAfterRepublicationRemovalAndRestart` | Save an attempt, then publish revision 2 with a changed question as new rows, remove the quiz, and restart the application. After signing in again, the reopened attempt is identical to the original JSON, and history shows `quizRemoved: true`. | REV-01, REV-04, D4 |

## Live check with the QC-33 screens

With Spring Boot on 8080 and Vite on 5173, [`qc-31-ui-check.mjs`](qc-31/qc-31-ui-check.mjs) registered two throwaway accounts. [`qc-31-sample-attempts.sql`](qc-31/qc-31-sample-attempts.sql) then recorded a 1/3 attempt and a 3/3 retake for player A, standing in for QC-29. Headless Edge 158 passed **8 of 8** checks. Rim's screens worked without changes.

| Step | Observed | Result |
| --- | --- | --- |
| Player A opens My history | `GET /api/me/attempts` → 200 with attempts 7002 (3/3) and 7001 (1/3), newest first ([screenshot](qc-31/qc-31-1-history.png)) | PASS |
| Open the 1/3 result | `GET /api/attempts/7001` → 200. ✓ Mercury, ✗ True (correct: False), ✗ blank (correct: 8), Score 1/3 ([screenshot](qc-31/qc-31-2-result.png)) | PASS |
| Player B opens attempt 7001 | `403`, "This result belongs to another player.", no answers shown ([screenshot](qc-31/qc-31-3-denied.png)) | PASS |
| Player B opens My history | `200`, "You have not played any quizzes yet." | PASS |

## Still to verify at integration

- **The live submission flow:** play, submit, then the saved attempt in history. This waits for QC-29 to call `AttemptStore.save`. Hady's planned tests for retakes, rejected submissions saving nothing, and history after restart can then use the real store.
- **Republication through the maker:** the test publishes revision 2 with SQL in the way contract §2 and the QC-29 proposal describe (new immutable rows). It should be repeated with QC-27's publish endpoint once that lands.
