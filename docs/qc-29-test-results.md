# QC-29 test-first results

On 28 November 2026 the first scoring test sent a signed-in request with one correct, one wrong and one blank answer. The contract expects HTTP 201, a score of 1/3 and points of 1, 0 and 0. On the Sprint 2 starting commit, Spring returned HTTP 404 before the score assertions could run. This is the first TDD failure for QC-29. [Starting commit](https://github.com/Bilalkameh/QuizzCraft/commit/4b7be93f68b8463a5370624d5e71641a59c08b59) · [Approved test specification](https://net-team-s2bxx850.atlassian.net/browse/QC-25?focusedCommentId=10000)

## Reproduce

Use a running PostgreSQL development database and a role allowed to create schemas. From the repository root, run the commands below. Each suite creates and removes its own test schema. The example URL uses the README's development port. The recorded run used an isolated local cluster on port 55441, Java 21.0.13.1, Maven 3.9.11 and PostgreSQL 17.12. Maven ran offline using its existing dependency cache.

```sh
cd backend
export QUIZZCRAFT_TEST_DB_URL=jdbc:postgresql://127.0.0.1:55432/quizzcraft
mvn -B '-Dtest=PlaySubmissionIntegrationTest#mixedSubmissionReturnsOneOfThreeWithFeedback' test
mvn -B verify
```

## Observed output

First test, before production changes:

```text
[POST /api/revisions/1001/attempts]
expected: 201
 but was: 404
[ERROR] Tests run: 1, Failures: 1, Errors: 0, Skipped: 0
```

The full run executed 16 tests. All seven existing account tests passed. Seven of nine new tests failed on the missing play or submission routes. The signed-out test passed because authentication already rejects these requests. The draft/unknown test returned the expected 404 even with the routes absent. Its result needs to be checked alongside successful play and submission once those routes exist.

```text
[ERROR] Tests run: 16, Failures: 7, Errors: 0, Skipped: 0
[INFO] BUILD FAILURE
```

The new tests exercise hidden keys, scoring, omitted and cleared choices, validation, republication, removal, retakes, access and unpublished targets. The republication and removal tests prepare quiz state through SQL so the maker and moderation endpoints can be developed independently. The two tests for invalid or removed submissions check the HTTP rejection. Verifying that no attempt was written requires the persistence integration. Cross-account history and history after restart also require QC-31.

## After Bilal’s review · 28 November 2026

The [first test commit](https://github.com/Bilalkameh/QuizzCraft/commit/4421457) preserves the initial red result. Bilal requested a case-by-case assignment and a shared transaction with QC-31. The [review record](qc-29-implementation-proposal.md) identifies each owner and the PostgreSQL verification Ghadi and Hady need to run together.

Before implementation, we gave the empty list its own 0/3 test and ran the three invalid requests independently. The revised quiz fixture now has different questions and answer keys for revisions 1001 and 1002. The test submits the original answers to 1001, reopens the quiz on 1002 and submits the same choice label there to check the new feedback.

The PostgreSQL-backed Maven regression run executed all 19 checks. Ten of the twelve play/submission checks failed on missing HTTP routes (404). The existing signed-out and unavailable-target checks passed, along with all seven account tests. The missing routes prevented the scoring and revision assertions from being reached.

```text
PlaySubmissionIntegrationTest: 12 run, 10 failures, 0 errors, 0 skipped
AuthAccessIntegrationTest:     7 run,  0 failures, 0 errors, 0 skipped
[ERROR] Tests run: 19, Failures: 10, Errors: 0, Skipped: 0
[INFO] BUILD FAILURE
```

## Implementation and PostgreSQL verification

Ghadi delegated the transaction decision to Hady’s side. The implemented submit route holds the quiz lock through the attempt and answer inserts, then sends the saved feedback. The write adapter joins the transaction started by the submission service. [Transaction decision and integration handoff](qc-29-implementation-proposal.md)

The worked example now returns 201, 1/3 and feedback points `[1, 0, 0]`. PostgreSQL also contains a distinct owner-linked attempt and all three answers, including the blank. The empty submission gives 0/3. A retake can score 3/3 under a new attempt ID. Opening 1001, publishing 1002 through a SQL fixture and submitting 1001 preserves the original key. The next play serves 1002 and grades with its new key.

| PostgreSQL check | Observation |
|---|---|
| Validation | Each foreign question, mismatched choice, duplicate question or fractional choice ID returned 422. The attempt and answer counts stayed unchanged. |
| Forced insert failure | A temporary constraint rejected the second answer after the attempt and first answer insert. HTTP returned 500. A separate connection found the original row counts. After removing the constraint, the retry returned 201 and added one attempt and three answers. |
| Removal commits first | A concurrent submit waited on the removal transaction, then returned 410 `QUIZ_REMOVED`. No new attempt was saved. Opening a removed quiz returned 404. |
| Submission gets the lock first | The test paused a real answer insert on a PostgreSQL table lock. A second connection could not acquire the quiz row for a status update. Releasing the insert let the submit commit and return 201. All three answers remained after removal. |

The focused test for the original 1/3 example passed. The full Java 21/Maven run against a fresh PostgreSQL 17.12 cluster completed with the following results:

```text
PlaySubmissionIntegrationTest: 16 run, 0 failures, 0 errors, 0 skipped
AuthAccessIntegrationTest:      7 run, 0 failures, 0 errors, 0 skipped
[INFO] Tests run: 23, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```

### Desktop player and restart

The frontend built with `npm ci` and `npm run build`. In Chromium, a regular player registered, signed in and opened Planets Warm-Up through Vite and the running Spring Boot API. Play returned revision 1001 with no answer key. Choosing Mercury, choosing True, and leaving the third question blank produced HTTP 201 and a visible score of 1/3. The result showed Mercury for one point, False as the correct second answer, and 8 as the correct answer for the blank.

After restarting both PostgreSQL and the packaged Spring Boot server, a SQL join returned the same owner, attempt ID, revision, score and three responses as before restart. Reopening that result through the history API remains a QC-31 integration check.

Run the two Maven commands under **Reproduce** to repeat the first test and full verification. Tests use isolated schemas in a running PostgreSQL database. Republish and removal are exercised using SQL fixtures. The real maker and moderation routes are checked on QC-27 and QC-35. Cross-account denial and reopening the stored result through the private history API are checked on QC-31.
