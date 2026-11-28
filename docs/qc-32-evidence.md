# QC-32 maker screens: interim verification

2026-11-27 · Local branch `QC-32` from `master` at `3bb9306` · MAKE-01 to MAKE-05 (UI side), ACC-03 for the maker routes.

**Status: built and checked against a stand-in API.** The real maker API (QC-27) and sign-in (QC-21, QC-24) were still To Do, and `GET /api/my/quizzes` on `master` returned `404`. As QC-32 asks, the screens were built against the contract while the API is developed. The ticket's real-API verification is still open (see [Still to verify](#still-to-verify)).

## What was built

- `/my/quizzes` lists the signed-in user's quizzes with their state and an Edit link. It has a **New quiz** button.
- `/my/quizzes/:quizId/edit` is the maker form:
  - Title, description, category (active categories only) and difficulty fields.
  - Multiple-choice questions take 2 to 6 choices. True/false questions always have exactly the fixed choices True and False.
  - Each question has one radio group for marking the correct answer.
  - **Save draft** stores an incomplete quiz privately. **Publish** saves first, then publishes.
  - A `422` lists every error at the top and marks each failing field or question in red, beside the problem (MAKE-03).
  - A `401` asks the user to sign in. A `403` shows "Only the quiz owner can edit or publish this quiz." and no form.
- All maker requests go through `frontend/src/api.js`. `frontend/src/auth.js` holds the token placeholder.
- `react-router` 7 provides the routes proposed in requirements §5.1.

## Proposed request and response shapes for Bilal (QC-27) to confirm

Contract §4 names these routes but gives no bodies for them. The UI uses the shapes below. If QC-27 chooses different ones, only `frontend/src/api.js` and the `toForm`/`toDraftBody` helpers in `QuizEditor.jsx` need to change.

| Route | Proposed body |
| --- | --- |
| `GET /api/my/quizzes` | `200 { "items": [ { "quizId": 105, "title": "…", "status": "ACTIVE", "hasDraft": true, "published": { "revisionId": 1002, "number": 1, "publishedAt": "…" } } ] }`. `published` is `null` when the quiz has never been published. `title` is the draft's title, or the latest published title when there is no draft. |
| `POST /api/my/quizzes` | Empty body → `201 { "quizId": 105 }`. This creates the quiz and an empty draft. |
| `GET /api/my/quizzes/{id}/draft` | `200 { "quizId", "title", "description", "categoryId", "difficulty", "questions": [ { "type", "text", "choices": [ { "text", "isCorrect" } ] } ] }`. If the quiz has no draft, the server creates one from the latest published revision, which is how "edit a published quiz" starts. Returns `403` for a quiz owned by someone else. |
| `PUT /api/my/quizzes/{id}/draft` | Same body as GET, without `quizId`. It replaces the draft and returns `200` with the saved draft. It accepts incomplete drafts (empty title, `null` category or difficulty, no questions, no correct choice). It returns `422` only for a retired category, per D5. |
| `POST /api/my/quizzes/{id}/publish` | Unchanged from contract §5.6: `201 { "quizId", "revisionId", "number" }`, or `422` with `fieldErrors`. |

Field names in `fieldErrors` the UI maps: `title`, `description`, `categoryId`, `difficulty`, `questions` (no questions), and anything starting with `questions[i]`, for example `questions[1].choices` or `questions[1].text`. Others are still listed in the summary at the top.

Other assumptions: the client sends `null` for an unset category or difficulty, and MC questions allow 2–6 choices (requirements §7 item 8).

## Interim check against the stand-in API

[`qc-32/qc-32-stand-in-api.mjs`](qc-32/qc-32-stand-in-api.mjs) is a small Node server that implements the shapes above and the contract's publication rules, with two fake tokens for `playerA` and `playerB`. It stood in on port 8080 while `npm.cmd run dev` served the `QC-32` frontend. [`qc-32/qc-32-ui-check.mjs`](qc-32/qc-32-ui-check.mjs) drove headless Edge through journey J2. It puts the fake token in `localStorage` because QC-24 has no sign-in screen yet.

| Step | Requests | Observed | Result |
| --- | --- | --- | --- |
| Signed out, open My quizzes | `GET /api/my/quizzes` → 401 | "Sign in to make quizzes." | PASS |
| playerA: New quiz, then Publish with nothing filled in | `POST` → 201, `PUT draft` → 200, `POST publish` → 422 | Title, Category, Difficulty and Questions errors listed, title marked invalid | PASS |
| Add 1 MC (3 choices, Pacific correct) and 1 TF question with no correct answer, then Save draft | `PUT draft` → 200 | "Draft saved." TF question shows exactly True / False (MAKE-02) | PASS |
| Reload the editor | `GET draft` → 200 | Every field, choice and the correct mark intact (MAKE-01). Title absent from the catalog | PASS |
| Publish | `POST publish` → 422 | Question 2 outlined in red with "Exactly one choice must be correct". Question 1 not marked (MAKE-03) | PASS ([screenshot](qc-32/qc-32-1-validation.png)) |
| Mark False correct, then Publish | `POST publish` → 201 | "Published as revision 1." The quiz appears in the catalog (MAKE-04) | PASS ([published](qc-32/qc-32-2-published.png), [catalog](qc-32/qc-32-3-catalog.png)) |
| Change question 1 and publish again | `POST publish` → 201 | My quizzes shows "Published, revision 2" | PASS ([screenshot](qc-32/qc-32-4-my-quizzes.png)) |
| playerB: My quizzes, then open playerA's edit URL | `GET draft` → 403 | The quiz is not in playerB's list, so there is no Edit button. Direct URL shows the owner-only message and no form (MAKE-05) | PASS ([screenshot](qc-32/qc-32-5-denied.png)) |

`npm.cmd run build` passed. After the routing change, the QC-23 catalog check (`docs/qc-23/qc-23-ui-check.mjs`) still passed every step against the real `master` backend.

## Still to verify

The ticket requires a check with the real API. When QC-27 and QC-21 are merged:

1. Compare QC-27's bodies with the table above and adjust `api.js` if needed.
2. Replace the placeholder in `auth.js` with QC-21's token storage. Change the check script to sign in instead of setting a fake token.
3. Re-run `qc-32-ui-check.mjs` against the real backend. Confirm that publishing adds the quiz to the catalog and that a second account gets `403`, then record the walkthrough here.
