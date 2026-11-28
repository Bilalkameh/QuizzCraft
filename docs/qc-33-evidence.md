# QC-33 player, result and history: verification

2026-11-27 · Local branch `QC-33`, stacked on `QC-32` at `bc4a834` · PLAY-01 to PLAY-06, REV-01, ACC-03 for play and history.

**Status: verified against the real API on 2026-11-28, with real attempt IDs 7009–7012** (see [Integrated walkthrough](#integrated-walkthrough)). The walkthrough found one bug, now fixed: a reloaded result page could show the result while signed out. The screens were first built and checked against fixtures, because QC-29, QC-31 and QC-21 were still To Do. That interim check is kept below for the record.

## Sources

- Contract §5.2–5.5 for the play, submit, result and history bodies. No new shapes were needed.
- The approved [QC-25 scoring and submission specification](https://net-team-s2bxx850.atlassian.net/browse/QC-25), attached to QC-25. Its approval was recorded on 27 November 2026. Each check below cites the QC-25 case it covers.

## What was built

- **`/quizzes/:quizId/play`** shows one question at a time with "Question N of M · No time limit".
  - Previous and Next buttons. Next reads Skip when the question has no answer.
  - A numbered strip to jump between questions, showing which ones are answered.
  - One choice per question, with Clear answer.
  - Submit quiz asks "N of M answered. Unanswered questions score 0. Submit anyway?" when anything is blank.
  - The request sends every question once, with `null` for blanks (QC-25 step 2).
  - A `410 QUIZ_REMOVED` shows "This quiz was removed while you were playing. Your answers were not saved." and disables submit. `401` and `422` show their own messages.
- **`/attempts/:attemptId`** shows the score, then for each question ✓ or ✗, your answer (or blank), the correct answer when you were wrong, and points. It has Retake and My history buttons. Right after submitting, it uses the `201` body. Otherwise it loads `GET /api/attempts/{id}`. A `403` shows "This result belongs to another player."
- **`/me/attempts`** lists attempts newest first with score and date. A quiz that has since been removed is tagged Removed.
- The top bar has a **My history** link. Each catalog card has a **Start quiz** link, because the quiz detail page (requirements §5.1) is not built yet.

## Interim check against the stand-in API

[`qc-33/qc-33-stand-in-api.mjs`](qc-33/qc-33-stand-in-api.mjs) is a small Node server on port 8080. It serves "Planets Warm-Up" with the contract's ids (quiz 101, revision 1001, questions 5001–5003, choices 9001–9008), plus a two-question true/false fixture (quiz 106). It grades and validates as QC-25 describes. It has two test-only controls: republish quiz 101 as revision 1002 with a changed question 2, and remove a quiz. [`qc-33/qc-33-ui-check.mjs`](qc-33/qc-33-ui-check.mjs) drove headless Edge with fake `playerA` and `playerB` tokens. 18 of 18 checks passed.

| Step | Observed | QC-25 case | Result |
| --- | --- | --- | --- |
| Signed out, Start quiz and My history | `401`, then "Sign in to play quizzes." and "Sign in to see your history." | 08 | PASS |
| Open quiz 101 | The play response has no `isCorrect`, `correctChoiceId`, `correct` or `points` | 01 | PASS |
| Pick Venus then Mercury, pick True, pick 8 then Clear, jump back to Q1 | Mercury is still selected and Q3 is blank | 03 | PASS |
| Submit with one blank | Confirmation "2 of 3 answered…" ([screenshot](qc-33/qc-33-1-confirm.png)) | — | PASS |
| Submit anyway | Request body `[{5001,9002},{5002,9004},{5003,null}]`, exactly the final screen state | 02, 03 | PASS |
| Result | Score 1/3. ✓ Q1 Mercury. ✗ Q2, you: True, correct: False. ✗ Q3, blank, correct: 8 ([screenshot](qc-33/qc-33-2-result.png)) | 02 | PASS |
| Retake, all correct | 3/3 as attempt 7002, separate from 7001 | 07 | PASS |
| True/false-only quiz 106 | 1/2 as attempt 7003 | both formats | PASS |
| My history | 7003, 7002, 7001, newest first ([screenshot](qc-33/qc-33-3-history.png)) | — | PASS |
| Republish 101 as revision 1002, then reopen 7001 | Unchanged: revision 1001's "Jupiter is a rocky planet." and 1/3. A new play shows the revised question. | 05, 09 | PASS |
| playerB opens attempt 7001 | `403`, "This result belongs to another player.", no feedback. playerB's history is empty ([screenshot](qc-33/qc-33-4-denied.png)) | 08 | PASS |
| Remove quiz 106 during play, then submit | `410` message, submit disabled ([screenshot](qc-33/qc-33-5-removed.png)). History still has 3 attempts, tagged Removed, and attempt 7003 still opens. | 06, 09 | PASS |

`npm.cmd run build` passed. On this branch, the QC-32 maker check still passed 14 of 14 against its stand-in. The QC-23 catalog check still passed against the real `master` backend.

## Integrated walkthrough

2026-11-28 · Branch `qc-32-33-integration` from `master` at `569f382`, after QC-21, QC-24, QC-27, QC-29, QC-31 and QC-30 merged. QC-33 itself had merged as #8. The setup is the same as the [QC-32 real-system walkthrough](qc-32-evidence.md#real-system-walkthrough): a fresh `quizzcraft_qc3233` database seeded by Spring Boot.

**Contract match.** `PlayService` (`PlayQuiz`, `Feedback`, `Result`) and `AttemptHistory` (`AttemptResult`, `HistoryItem`) use the contract §5.2–5.5 field names. Another player's attempt returns `403 FORBIDDEN`. No API-related frontend change was needed.

**Bug found and fixed.** Right after a submission, the result page reuses the `201` body that the player screen passes in the browser's navigation state. The browser keeps that state across reloads. After a reload, which drops the in-memory session, the result was shown again without signing in. `AttemptResult.jsx` now uses the passed result only while a session exists. Otherwise it loads `GET /api/attempts/{id}`, which returns `401` and redirects to sign-in. A check for this was added to the walkthrough.

[`qc-33/qc-33-real-check.mjs`](qc-33/qc-33-real-check.mjs) registers two fresh accounts (random passwords, not recorded) and signs in through the real sign-in screen. It plays seeded quiz 101 (mixed formats) and 102 "Rivers and Mountains" (true/false only). For republication, it creates quiz 109 for playerA through the real maker API, publishes it, plays it, then republishes it with a changed question 1. Removal during play (`410`, D3) is not part of this ticket's real-API check, because no admin removal route exists yet (QC-35). It stays covered by the stand-in check above. The final run passed 15 of 15. Two earlier runs stopped on the reload bug above and on a script check that ran before the page had loaded. The attempts from those runs (7001–7008) belong to their own throwaway accounts.

| Step | Real responses | Observed | Attempt | Result |
| --- | --- | --- | --- | --- |
| Signed out, Start quiz on Planets Warm-Up | `GET /play` → 401 | Redirected to sign-in with "Sign in to play quizzes." | — | PASS |
| playerA opens quiz 101 | `GET /api/quizzes/101/play` → 200 | No `isCorrect`, `correctChoiceId`, `correct` or `points` in the payload (PLAY-02) | — | PASS |
| Venus then Mercury, True, 8 then Clear, submit anyway | `POST /api/revisions/1001/attempts` → 201 | Body `[{5001,9002},{5002,9004},{5003,null}]` (PLAY-03, PLAY-04) | 7009 | PASS |
| Result | — | Score 1/3. ✓ Mercury. ✗ True, correct: False. ✗ blank, correct: 8 (PLAY-01, PLAY-05) | 7009 | PASS ([screenshot](qc-33/qc-33-real-1-result.png)) |
| Retake, all correct | `POST` → 201 | 3/3, a separate attempt (QC-25 case 07) | 7010 | PASS |
| Quiz 102, all True | `POST` → 201 | True/false only, Score 2/3, 3 feedback rows (both formats) | 7011 | PASS |
| Own quiz 109, revision 1010: Mars, True | `POST /api/revisions/1010/attempts` → 201 | Score 1/2 | 7012 | PASS |
| Reload the result page | `GET /api/attempts/7012` → 401 | Redirected to sign-in, no result shown (bug fix above) | 7012 | PASS |
| Republish 109 as revision 1011 (number 2), reopen 7012 | `GET /api/attempts/7012` → 200 | Still revision 1010's "Which planet is called the Red Planet?" and 1/2 (REV-01). A new play shows revision 2's question. | 7012 | PASS ([screenshot](qc-33/qc-33-real-2-after-republish.png)) |
| My history | `GET /api/me/attempts` → 200 | 7012, 7011, 7010, 7009, newest first | all | PASS ([screenshot](qc-33/qc-33-real-3-history.png)) |
| playerB opens attempt 7009 | `GET /api/attempts/7009` → **403** | "This result belongs to another player.", no feedback. playerB's history is empty | 7009 | PASS ([screenshot](qc-33/qc-33-real-4-denied.png)) |

`npm.cmd run lint` reported no findings and `npm.cmd run build` passed with the fix.
