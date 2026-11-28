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

Use the same `mvn -B verify` command above against a development PostgreSQL database to repeat the suite. The next implementation step awaits Ghadi’s confirmation of the shared transaction. Verify the rollback and unchanged row counts with his real store.
