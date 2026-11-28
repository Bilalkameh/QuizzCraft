# QC-24 · Desktop sign-in verification

28 November 2026 · Ghadi · [Jira QC-24](https://net-team-s2bxx850.atlassian.net/browse/QC-24) · Branch `QC-24` from `origin/master` at `c75cdc6`

The registration, sign-in and sign-out screens were checked against the live QC-21 account API with Spring Boot, PostgreSQL and the Vite dev server. Each run of the check registers a new throwaway account.

## What was built

| Part | Behaviour |
| --- | --- |
| [`auth.js`](../frontend/src/auth.js) | Holds the token and user in memory only (contract §1). The session ends on sign-out, when the JWT `exp` time passes, when the API rejects the token with `401`, and on page reload. `getToken()` keeps the interface the maker and player screens already use. |
| [`/signin`](../frontend/src/account/SignIn.jsx) | `401 INVALID_CREDENTIALS` shows one message, "Email or password is incorrect.", for a wrong password and an unknown email alike. The password field is cleared. After sign-in, the visitor returns to the page they came from. |
| [`/register`](../frontend/src/account/Register.jsx) | Creates the account, then signs in with the same credentials and returns to the page the visitor came from. `409 EMAIL_TAKEN` shows "An account with this email already exists." with a "Sign in instead" link. `422` field errors appear under each field. |
| [Top bar](../frontend/src/account/AccountMenu.jsx) | Signed out, it shows Sign in and Register. Signed in, it shows "Signed in as *name*" and Sign out, which calls `POST /api/auth/logout`, discards the token and returns to the catalog. |
| [`SignInRequired`](../frontend/src/maker/errors.jsx) | The maker and player screens already render this on a `401`. It now redirects to `/signin` and passes on the screen's message and the page to return to. |

## UI check against the live API

Environment: PostgreSQL 16.16 on port 55432, Spring Boot from `c75cdc6` on 8080, Vite 7.3.8 dev server on 5173, React 19.3.1, React Router 7.18.7, Node 22.20.0, and headless Microsoft Edge 158.0.4370.45 at 1280 × 800 through `playwright-core` 1.65.1. Playwright was installed into the ignored `.qc19/uat` folder and is not a project dependency.

```powershell
node docs/qc-24/qc-24-ui-check.mjs <absolute path to node_modules containing playwright-core> docs/qc-24
```

[`qc-24-ui-check.mjs`](qc-24/qc-24-ui-check.mjs) passed **24 of 24** checks.

| Step | Observed | Requirement | Result |
| --- | --- | --- | --- |
| Signed out, open the catalog | Published quizzes listed. Top bar shows Sign in and Register. | ACC-03 | PASS |
| Signed out, Start quiz on Planets Warm-Up | `GET /api/quizzes/101/play` → `401`, redirected to `/signin` with "Sign in to play quizzes." ([screenshot](qc-24/qc-24-1-signin-required.png)) | ACC-03 | PASS |
| Signed out, My history | `GET /api/me/attempts` → `401`, redirected to `/signin` with "Sign in to see your history." | ACC-03 | PASS |
| Register from that page | `POST /api/auth/register` → `201`, role `USER`, then `POST /api/auth/login` → `200`. The visitor was signed in and returned to `/me/attempts`, and the history request carried `Authorization: Bearer`. ([screenshot](qc-24/qc-24-2-registered.png)) | ACC-01 | PASS |
| Token storage | `localStorage`, `sessionStorage` and cookies were all empty while signed in. | Contract §1 | PASS |
| Sign out | `POST /api/auth/logout` → `204`, back on the catalog. `GET /api/my/quizzes` was then sent without a token, returned `401`, and redirected to sign-in. | ACC-03 | PASS |
| Register the same email again (upper case, surrounding spaces) | `409 EMAIL_TAKEN`, and the message is shown ([screenshot](qc-24/qc-24-3-email-taken.png)) | ACC-01 | PASS |
| **Denied sign-in:** wrong password | `POST /api/auth/login` → `401 INVALID_CREDENTIALS`. "Email or password is incorrect." is shown, the visitor stays signed out on `/signin`, the password is cleared and no token is stored. ([screenshot](qc-24/qc-24-4-denied-signin.png)) | ACC-02 | PASS |
| Denied sign-in: unknown email | `401`, with the same message, so the screen does not reveal which field was wrong. | ACC-02 | PASS |
| **Successful sign-in** | `POST /api/auth/login` → `200` with a token and the same user. The catalog shows "Signed in as *name*" and Sign out. The top bar height is unchanged. ([screenshot](qc-24/qc-24-5-signed-in.png)) | ACC-01 | PASS |
| Signed in, Start quiz | The play request carried the token and was not redirected to sign-in. | ACC-03 | PASS |
| Reload the page | Signed out again, as the contract requires for an in-memory token. | Contract §1 | PASS |

`npm.cmd run build` passed (46 modules). Its only notice is React Router's `"use client"` directive, which was already present on master.

## Still open elsewhere

- Signed in, `GET /api/quizzes/101/play`, `/api/me/attempts` and `/api/my/quizzes` return `404`, because those endpoints are QC-29, QC-31 and QC-27 and are not on master yet. The token was accepted (no `401`), and those screens show their own "could not load" messages.
- The [QC-32](qc-32/qc-32-ui-check.mjs) and [QC-33](qc-33/qc-33-ui-check.mjs) checkers signed players in by putting a fake token in `localStorage`. Now that the token lives in memory, they must sign in through `/signin` instead.
