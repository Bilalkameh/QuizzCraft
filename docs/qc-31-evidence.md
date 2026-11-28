# QC-31 · Attempt store and private history

28 November 2026 · Ghadi · [Jira QC-31](https://net-team-s2bxx850.atlassian.net/browse/QC-31) · Branch `QC-31`, which includes QC-29 from `origin/master` (`57f7c92`)

QC-31 stores each graded attempt in PostgreSQL and serves it only to its owner. It follows the [contract](../api-contract.md) (§2 data model, §3 access, §5.4–5.5 shapes, decision D4). Saving is split with QC-29 as in Hady's [implementation proposal](qc-29-implementation-proposal.md). QC-29 grades a submission and writes the attempt and its answers in one transaction (`play/AttemptStore`). QC-31 owns the attempt tables and the private history routes that read them back.

## What was built

| Part | Behaviour |
| --- | --- |
| [`schema.sql`](../backend/src/main/resources/schema.sql) | `attempts` holds owner, revision, `submitted_at`, score and max score. Ids start at 7001, matching the contract, and an index supports the newest-first history. `attempt_answers` holds one row per question of the revision, with `choice_id` NULL for a blank and `correct`. An attempt points at the immutable published revision, so history does not depend on later edits. |
| [`AttemptHistory`](../backend/src/main/java/com/quizzcraft/attempt/AttemptHistory.java) | Read-only. `history(ownerId)` returns the §5.5 items, newest first, with titles from the attempted revision and `quizRemoved`. `result(id)` returns the §5.4 body built from the saved answers and that revision's questions and choices. |
| [`AttemptController`](../backend/src/main/java/com/quizzcraft/attempt/AttemptController.java) | `GET /api/me/attempts` returns the caller's own attempts. `GET /api/attempts/{id}` returns the full original result to its owner, `403 FORBIDDEN` to another user and `404 NOT_FOUND` for an unknown ID. Signed out, both routes return `401`. The owner keeps access after removal (D4). |

### Merge with QC-29

The first QC-31 commit had its own `AttemptStore` with a `save` method, built before QC-29 landed. Merging master brought in QC-29's `play/AttemptStore`. That caused two failures on `5330fbb`:
- Spring refused to start (`ConflictingBeanDefinitionException: Annotation-specified bean name 'attemptStore'`), so every integration test failed, including QC-21's.
- `schema.sql` still contained merge conflict markers around two `attempts` definitions.

The fix keeps QC-29's store as the only writer and turns QC-31's class into the read-only `AttemptHistory`. Hady's code is unchanged. The single `attempts` definition keeps QC-29's `statement_timestamp()` default and QC-31's 7001 start and history index.

## Database and API tests

[`AttemptHistoryIntegrationTest`](../backend/src/test/java/com/quizzcraft/attempt/AttemptHistoryIntegrationTest.java) starts the real application on a new PostgreSQL schema, in the same pattern as QC-21 and QC-29. It creates attempts through the real `POST /api/revisions/1001/attempts` and removes the schema afterwards.

```powershell
cd backend
$env:QUIZZCRAFT_TEST_DB_URL = 'jdbc:postgresql://127.0.0.1:55432/quizzcraft'
mvn -B verify
```

Run on PostgreSQL 16.16, Temurin 25.0.4 (the pom targets Java 21) and Maven 3.9.8, with `-Dmaven.repo.local=../.qc19/m2` because of a local sandbox. **28 tests, 0 failures, 0 errors, 0 skipped. BUILD SUCCESS.** That is QC-31's 5, QC-21's 7 and QC-29's 16. The `qc29_injected_failure` error in the log comes from QC-29's rollback test, which forces an insert to fail on purpose and passes.

| Test | Checks | Requirement |
| --- | --- | --- |
| `submittedAttemptReopensWithTheSameResultAndAppearsInHistory` | Submit the worked example (Mercury, True, blank) and get attempt ≥ 7001. `GET /api/attempts/{id}` returns exactly the 201 submission body: 1/3, points `[1, 0, 0]`, correct choices 9002/9005/9007 and all 8 choice texts. History lists it with the same `submittedAt` and `quizRemoved: false`. | REV-01, PLAY-05 |
| `retakesAreSeparateRecordsListedNewestFirst` | Two submissions give two IDs with their own scores (1/3, 3/3). History lists the retake first. | REV-02 |
| `historyIsPrivateToItsOwner` | Player B gets `403` with no answers, and B's history excludes A's attempt. Signed out, both routes return `401`. Unknown ID returns `404`. | REV-03 |
| `rejectedSubmissionsDoNotAppearInHistory` | A choice from another question returns `422`, and the player's history is unchanged. | PLAY-04 |
| `attemptKeepsItsOriginalRevisionAfterRepublicationRemovalAndRestart` | Submit, then publish revision 2 with a changed question as new rows, remove the quiz, and restart the application. After signing in again, the reopened attempt is identical to the original JSON, and history shows `quizRemoved: true`. | REV-01, REV-04, D4 |

## Live check with the QC-33 screens

With Spring Boot on 8080 and Vite on 5173, [`qc-31-ui-check.mjs`](qc-31/qc-31-ui-check.mjs) registered two throwaway accounts and drove headless Edge 158 through the real play, submit and history flow. **8 of 8** checks passed. Rim's screens needed no changes.

| Step | Observed | Result |
| --- | --- | --- |
| Player A plays Planets Warm-Up: Mercury, True, blank, Submit anyway | `GET /api/quizzes/101/play` → 200, `POST /api/revisions/1001/attempts` → 201, result Score 1/3 (attempt 7003) | PASS |
| Retake with all correct | `POST` → 201, Score 3/3, separate attempt 7004 | PASS |
| My history | `GET /api/me/attempts` → 200, 3/3 then 1/3, newest first ([screenshot](qc-31/qc-31-1-history.png)) | PASS |
| Open the 1/3 result | `GET /api/attempts/7003` → 200. ✓ Mercury, ✗ True (correct: False), ✗ blank (correct: 8) ([screenshot](qc-31/qc-31-2-result.png)) | PASS |
| Player B opens attempt 7003 | `403`, "This result belongs to another player.", no answers shown ([screenshot](qc-31/qc-31-3-denied.png)) | PASS |
| Player B opens My history | `200`, "You have not played any quizzes yet." | PASS |

## Still to verify at integration

Republication through the maker: the test publishes revision 2 with SQL in the way contract §2 and the QC-29 proposal describe (new immutable rows). It should be repeated with QC-27's publish endpoint once that lands.
