# QC-33 player, result and history: interim verification

2026-11-27 · Local branch `QC-33`, stacked on `QC-32` at `bc4a834` · PLAY-01 to PLAY-06, REV-01, ACC-03 for play and history.

**Status: built and checked against a stand-in API.** Scoring and submission (QC-29), attempt storage and history (QC-31) and sign-in (QC-21) were still To Do, and `GET /api/quizzes/101/play` on `master` returned `404`. As QC-33 asks, the screens were built against fixtures while scoring and storage are developed. The ticket's integrated walkthrough is still open (see [Still to verify](#still-to-verify)).

The branch builds on QC-32 because it reuses that branch's `api.js`, `auth.js` and routing. **Merge QC-32 first.**

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

## Still to verify

QC-33 requires an integrated walkthrough with real attempt IDs. When QC-29, QC-31 and QC-21 are merged:

1. Replace the token placeholder in `auth.js` (shared with QC-32) with QC-21's storage, and make the check sign in for real.
2. Re-run `qc-33-ui-check.mjs` against the real backend and seeded quiz 101. Use the maker screen or an admin action instead of the stand-in's test controls. Confirm both formats, the `403` for another player, and an unchanged result after republication.
3. Record the real attempt IDs here and link the walkthrough on QC-33.
