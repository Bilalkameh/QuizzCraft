# QC-21 · Account API verification

28 November 2026 · Hady Keryakos · [Jira QC-21](https://net-team-s2bxx850.atlassian.net/browse/QC-21) · Base commit `3bb93060aad9610f7254f3e1b84272679c454521`

The registration, login, current-user and logout endpoints were tested over HTTP using the real Spring Boot app and PostgreSQL. The app-start and HTTP checks used throwaway account data. The repository's [account contract](../api-contract.md#4-routes) specifies the request and response fields.

## Automated checks

From `backend`, set `QUIZZCRAFT_TEST_DB_URL` to the test database and run `mvn -B verify`. The run on JDK 21.0.13.1, Maven 3.9.11 and PostgreSQL 17.12 completed with **7 tests run, 0 failures, 0 errors and 0 skipped**. The tests created a unique schema and removed it after the suite. [Test source](../backend/src/test/java/com/quizzcraft/auth/AuthAccessIntegrationTest.java)

| Requirement | Observed result |
|---|---|
| ACC-01 · One regular account | Registration returned 201 and role USER. Login and current-user lookup returned the same ID. Logout returned 204. A repeat registration with different email case and surrounding spaces returned 409 EMAIL_TAKEN, leaving one row. |
| ACC-02 · Invalid credentials | Wrong passwords and unknown accounts returned 401 INVALID_CREDENTIALS with the same public message. Missing or invalid registration fields returned 422. |
| ACC-03 · Signed-out access | Public categories, catalog and published detail returned 200. Signed-out requests to protected quiz creation, play, submission and private history routes returned 401. Malformed, expired and invalidly signed bearer tokens were rejected. |
| ACC-04 · No admin self-assignment | Registration with a submitted ADMIN role created a USER. The account received 403 on an admin route. |
| ACC-05 · Persistence | The test closed and restarted the Spring Boot application against the same PostgreSQL schema, signed in again, and verified the same user ID and details. |

## Packaged application

The production frontend build succeeded with `npm ci` and `npm run build`. A second check started the packaged backend JAR, a fresh PostgreSQL database and Vite. The following requests went through Vite’s real `/api` proxy.

| Request | Observed result |
|---|---|
| GET /api/quizzes?categoryId=2&difficulty=EASY&format=TRUE_FALSE | 200 · Planets Warm-Up was the only returned title. |
| Register, register again, then log in with a wrong and a correct password | 201, 409, 401, 200 respectively. |
| Read /api/auth/me with the issued token | 200 · The response matched the registered user. |
| Call POST /api/admin/categories as that regular account | 403. |
| Log out, discard the token, read /api/auth/me, create a quiz and read private history | 204 for logout, followed by 401 for each protected request. |

This verification exercises the backend through HTTP. Ghadi owns the desktop account screens in QC-24. An authenticated client discards the bearer on logout; a copied token remains valid until expiry under the agreed stateless design. The default lifetime is one hour. A local server restart with the generated signing key also expires existing sessions.
