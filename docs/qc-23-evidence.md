# QC-23 catalog UI verification

2026-11-27 · Local branch `QC-23` from `master` at `a56cc38` · CAT-01, CAT-02 and CAT-04 in the UI, with the CAT-05 draft check.

## Setup

QC-22 (`GET /api/quizzes`) was still in review as PR #4, so the UI was checked against that branch's backend without merging it into `QC-23`. The backend ran from a detached worktree at `8708394` under the ignored `.qc19/` folder.

- PostgreSQL 18.1 local binaries with a fresh cluster on `127.0.0.1:55432` and an empty `quizzcraft` database.
- Spring Boot from QC-22 built with `mvn -B verify` (JDK 21.0.13, Maven 3.9.16) and run with `java -jar`. It created the schema and loaded the QC-20 seed on startup, on port 8080.
- React from `QC-23`: `npm.cmd ci --cache ../.qc19/npm-cache`, `npm.cmd run build` (passed), then `npm.cmd run dev` on <http://127.0.0.1:5173/>.

## API through the Vite proxy

| Signed-out request | HTTP | Titles |
| --- | --- | --- |
| `GET /api/quizzes` | 200 | Planets Warm-Up, Rivers and Mountains, Fractions Challenge |
| `GET /api/quizzes?categoryId=2&difficulty=EASY&format=TRUE_FALSE` | 200 | Planets Warm-Up (format `MIXED`) |
| `GET /api/quizzes?categoryId=2&difficulty=HARD` | 200 | `{"items":[]}` |

## Browser check

[`qc-23/qc-23-ui-check.mjs`](qc-23/qc-23-ui-check.mjs) drives headless Microsoft Edge at 1280 × 800 through the real filter controls with `playwright-core`. Playwright was installed into the ignored `.qc19/uat` folder and is not a project dependency. Run it with `node docs/qc-23/qc-23-ui-check.mjs <path to node_modules containing playwright-core> <screenshot folder>`.

| Step | Requests sent by the UI | Observed | Result |
| --- | --- | --- | --- |
| Open the catalog signed out | `/api/quizzes` | 3 cards, each with title, description, category, difficulty, format and question count | PASS ([screenshot](qc-23/qc-23-1-all.png)) |
| Science + Easy + True / false | `…?categoryId=2&difficulty=EASY&format=TRUE_FALSE` | Planets Warm-Up only, shown as "Mixed: multiple choice + true / false". The seeded draft Moon Basics was absent. | PASS ([screenshot](qc-23/qc-23-2-match.png)) |
| Clear filters (sidebar) | `/api/quizzes` | All 3 quizzes return | PASS |
| Science + Hard | `…?categoryId=2&difficulty=HARD` | "No quizzes match these filters." with a Clear filters button | PASS ([screenshot](qc-23/qc-23-3-empty.png)) |
| Clear filters (empty state) | `/api/quizzes` | All 3 quizzes return | PASS |

## Notes

- The sketch in requirements §5.2 shows format as two checkboxes, but the API accepts one `format` value. The UI uses Any / Multiple choice / True / false radio buttons, so it never sends a combination the API cannot express.
- Cards do not link to the quiz detail page yet. That screen is not part of QC-23.
- Re-run this check against `master` after PR #4 merges.
