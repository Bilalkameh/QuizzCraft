# QuizzCraft — API and data contract (QC-18)

Status: **DRAFT for team review** · Requirements: ENG-03, REV-01 · Owner: Ghadi
Decisions D1–D8 and the access rules are agreed. QC-21 specifies the token lifetime and client storage below.

## 1. Architecture

```
React (desktop, Vite dev server)  --HTTP/JSON-->  Spring Boot API (/api/**)  --JPA-->  PostgreSQL
```

- The browser never sees answer keys before submission. Grading, permissions and publication validation happen only on the server.
- Every route lives under `/api`. In development, the React dev server proxies `/api` to Spring Boot, so the browser treats everything as one origin.
- Auth (**decided: JWT**): login returns a signed JWT (claims: user id, role, expiry). React sends `Authorization: Bearer <token>` on every protected call. The server is stateless. Logout means React discards the token. **QC-21 / QC-24 integration:** the default lifetime is one hour. Keep the token in React memory and discard it on logout, expiration or page reload. After the token is discarded, protected actions require another login.

## 2. Domain model

```
User 1───* Quiz 1───* QuizRevision 1───* Question 1───* Choice
 │                        │  └──* Category (FK, may be RETIRED)
 └──* Attempt *───1───────┘
        └──* AttemptAnswer ──> Question, Choice (nullable)
```

| Entity | Key fields | Rules |
|---|---|---|
| `User` | id, email (unique), displayName, passwordHash, role `USER`/`ADMIN` | Registration always creates `USER`. A `role` sent by the client is ignored. |
| `Category` | id, name (unique), status `ACTIVE`/`RETIRED` | Never deleted. Retired = cannot be assigned to new revisions. |
| `Quiz` | id, ownerId, status `ACTIVE`/`REMOVED`, latestPublishedRevisionId (nullable) | The stable identity the catalog shows. Removal is a soft delete. |
| `QuizRevision` | id, quizId, number, state `DRAFT`/`PUBLISHED`, title, description, categoryId, difficulty `EASY`/`MEDIUM`/`HARD`, publishedAt | At most one `DRAFT` per quiz. A `PUBLISHED` revision is **immutable** and never deleted. |
| `Question` | id, revisionId, position, type `MULTIPLE_CHOICE`/`TRUE_FALSE`, text | Belongs to exactly one revision. Editing creates new rows in the new draft. |
| `Choice` | id, questionId, position, text, isCorrect | Publication requires exactly one `isCorrect` per question. A TF question has exactly the two choices True/False. |
| `Attempt` | id, userId, revisionId, submittedAt, score, maxScore | One row per submission. Retakes create new rows. |
| `AttemptAnswer` | attemptId, questionId, choiceId (null = blank), correct | Stored at submit time, so history never depends on later edits. |

**Derived format** of a revision: all MC → `MULTIPLE_CHOICE`, all TF → `TRUE_FALSE`, both → `MIXED`.

**Why history survives:** an attempt points at an immutable revision, its questions and its choices. Republishing adds a new revision. Removal only flips `Quiz.status`. No row an attempt depends on is ever updated or deleted.

## 3. Access rules

| Caller | Can |
|---|---|
| Visitor (signed out) | Browse catalog, view public quiz detail, list categories |
| `USER` | + play, submit, read **own** attempts, create/edit/publish **own** quizzes |
| `ADMIN` | + manage categories, remove any quiz |

Status codes: `401` not signed in · `403` signed in but not allowed (another user's quiz or attempt, admin route) · `404` the resource does not exist **or** the quiz is removed/unpublished for the public · `422` validation failure.

**Decided:** another user's attempt returns `403`.
**Decided:** playing requires sign-in for this release (no anonymous play).

Error body (all 4xx):
```json
{ "error": "VALIDATION_FAILED", "message": "Quiz cannot be published", "fieldErrors": [
  { "field": "questions[1].choices", "message": "Exactly one choice must be correct" } ] }
```

## 4. Routes

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/auth/register` | — | `{email, password, displayName}` → 201 user · 409 `EMAIL_TAKEN` |
| `POST /api/auth/login` | — | `{email, password}` → 200 `{token, user}` · 401 `INVALID_CREDENTIALS` |
| `POST /api/auth/logout` | user | 204 (client discards token) |
| `GET /api/auth/me` | token | 200 user or 401 (missing/expired token) |
| `GET /api/categories` | — | All categories with `status` (so retired ones stay filterable) |
| `GET /api/quizzes?categoryId=&difficulty=&format=` | — | Catalog: active quizzes, latest published revision |
| `GET /api/quizzes/{quizId}` | — | Public detail (no questions) · 404 if removed / never published |
| `GET /api/quizzes/{quizId}/play` | user | Playable latest revision, **no answer key** |
| `POST /api/revisions/{revisionId}/attempts` | user | Submit → 201 graded result · 410 `QUIZ_REMOVED` if the quiz was removed |
| `GET /api/me/attempts` | user | Own history, newest first |
| `GET /api/attempts/{attemptId}` | owner | Full original result |
| `GET /api/my/quizzes` | user | Own quizzes with draft/published state |
| `POST /api/my/quizzes` | user | Create quiz + empty draft |
| `GET` / `PUT /api/my/quizzes/{quizId}/draft` | owner | Read / replace the draft (includes `isCorrect`) |
| `POST /api/my/quizzes/{quizId}/publish` | owner | Validate draft → new immutable revision · 422 on errors |
| `POST /api/admin/categories` · `PATCH /api/admin/categories/{id}` | admin | Create / rename |
| `POST /api/admin/categories/{id}/retire` | admin | Retire (idempotent) |
| `DELETE /api/admin/quizzes/{quizId}` | admin | Soft remove → 204 |

### Catalog filter semantics
- Filters combine with AND, and every filter is optional.
- `format=MULTIPLE_CHOICE` matches `MULTIPLE_CHOICE` and `MIXED`. `format=TRUE_FALSE` matches `TRUE_FALSE` and `MIXED`. A quiz appears **once**.
- Drafts, never-published quizzes and removed quizzes are never returned.
- A retired `categoryId` is accepted and still returns its existing quizzes.
- An empty result is `200` with `items: []`, and the UI shows the "no match" message.

## 5. Worked example (same quiz throughout)

Seed quiz (QC-20 will use the real seed): **"Planets Warm-Up"**, Science, Easy, MIXED, 3 questions.

### 5.1 Catalog — `GET /api/quizzes?categoryId=2&format=TRUE_FALSE`
```json
{ "items": [
  { "quizId": 101, "revisionId": 1001, "title": "Planets Warm-Up",
    "description": "Three quick questions about our solar system.",
    "category": { "id": 2, "name": "Science", "status": "ACTIVE" },
    "difficulty": "EASY", "format": "MIXED", "questionCount": 3 } ] }
```

### 5.2 Play — `GET /api/quizzes/101/play`
The response has no `isCorrect` anywhere. `revisionId` is the revision being shown.
```json
{ "quizId": 101, "revisionId": 1001, "title": "Planets Warm-Up",
  "questions": [
    { "questionId": 5001, "position": 1, "type": "MULTIPLE_CHOICE", "text": "Which planet is closest to the Sun?",
      "choices": [ { "choiceId": 9001, "text": "Venus" }, { "choiceId": 9002, "text": "Mercury" }, { "choiceId": 9003, "text": "Mars" } ] },
    { "questionId": 5002, "position": 2, "type": "TRUE_FALSE", "text": "Jupiter is a rocky planet.",
      "choices": [ { "choiceId": 9004, "text": "True" }, { "choiceId": 9005, "text": "False" } ] },
    { "questionId": 5003, "position": 3, "type": "MULTIPLE_CHOICE", "text": "How many planets orbit the Sun?",
      "choices": [ { "choiceId": 9006, "text": "7" }, { "choiceId": 9007, "text": "8" }, { "choiceId": 9008, "text": "9" } ] } ] }
```

### 5.3 Submit — `POST /api/revisions/1001/attempts`
One correct answer, one wrong and one blank. Skipped or cleared questions are sent as `null` or left out.
```json
{ "answers": [
  { "questionId": 5001, "choiceId": 9002 },
  { "questionId": 5002, "choiceId": 9004 },
  { "questionId": 5003, "choiceId": null } ] }
```
Validation (422): a `questionId` not in revision 1001, a `choiceId` not under that question, or a duplicate `questionId`.

### 5.4 Result — `201 Created` (same shape as `GET /api/attempts/7001`)
```json
{ "attemptId": 7001, "quizId": 101, "revisionId": 1001, "title": "Planets Warm-Up",
  "submittedAt": "2026-11-28T10:15:00Z", "score": 1, "maxScore": 3,
  "questions": [
    { "questionId": 5001, "text": "Which planet is closest to the Sun?", "chosenChoiceId": 9002, "correctChoiceId": 9002, "correct": true,  "points": 1 },
    { "questionId": 5002, "text": "Jupiter is a rocky planet.",         "chosenChoiceId": 9004, "correctChoiceId": 9005, "correct": false, "points": 0 },
    { "questionId": 5003, "text": "How many planets orbit the Sun?",    "chosenChoiceId": null, "correctChoiceId": 9007, "correct": false, "points": 0 } ],
  "choices": { "9001": "Venus", "9002": "Mercury", "9003": "Mars", "9004": "True", "9005": "False", "9006": "7", "9007": "8", "9008": "9" } }
```
The correct answers appear only in a result, after submission.

### 5.5 History — `GET /api/me/attempts`
```json
{ "items": [ { "attemptId": 7001, "quizId": 101, "revisionId": 1001, "title": "Planets Warm-Up",
               "score": 1, "maxScore": 3, "submittedAt": "2026-11-28T10:15:00Z", "quizRemoved": false } ] }
```
`title` comes from the attempted revision, not the current one.

### 5.6 Publish validation — `POST /api/my/quizzes/101/publish` (bad draft)
```json
{ "error": "VALIDATION_FAILED", "message": "Quiz cannot be published",
  "fieldErrors": [ { "field": "categoryId", "message": "Category is retired" },
                   { "field": "questions[1].choices", "message": "Exactly one choice must be correct" } ] }
```
Publication requires a title, an active category, a difficulty, at least 1 question, and exactly one correct choice per question (TF questions need exactly 2 choices). Success returns `201 { "quizId": 101, "revisionId": 1002, "number": 2 }`.

## 6. Decisions

| # | Topic | Proposal | Test that proves it |
|---|---|---|---|
| D1 | Revision identity | `revisionId` is a DB id that is never reused. Play returns it, and submission targets it in the URL. | Submit to 1001 after 1002 is published → graded against 1001 |
| D2 | Republish during open play | **Accept**: the player is graded on the revision they saw | Same as D1. Result shows rev-1001 questions |
| D3 | Removal during open play (**decided: reject**) | `410 Gone`, error `QUIZ_REMOVED`, no attempt saved. The UI tells the player the quiz was removed. | Open play → admin removes → submit → 410 and attempt count unchanged |
| D4 | History after removal | Owners keep full access to past attempts. `quizRemoved: true` is shown in history. | Attempt → remove → restart → `GET /api/attempts/{id}` returns 200 with the original score |
| D5 | Category retirement | Existing revisions keep the category. It stays in `/api/categories` with `RETIRED` and stays filterable. New drafts and publications that use it → 422. Rename affects display everywhere, including history. | Retire Science → filter still returns Planets Warm-Up → publish with Science → 422 |
| D6 | Removed quiz, public | Catalog omits it. `/api/quizzes/{id}` and `/play` → 404 | QC-35 checks |
| D7 | Admin self-assignment | `role` is ignored on register. There is no route to change roles, and admins are seeded. | Register with `"role":"ADMIN"` → `/api/admin/*` returns 403 |
| D8 | Ids | `BIGINT` identity columns, sent as JSON numbers | — |

## 7. Hand-offs
- **Rim (QC-23, QC-32, QC-33):** build against §5.1–5.6 now. Those fields are the contract.
- **Bilal (QC-22, QC-27):** §4 filter semantics, §5.6 validation, D1/D5.
- **Hady (QC-21, QC-25, QC-29):** §3 access/status codes, §5.3–5.4 grading shape, D3/D7.
- **Ghadi (QC-20, QC-31):** the seed must contain this example quiz shape, plus a TF-only quiz, an MC-only quiz and a private draft.