# QuizzCraft · Sprint 1 review and retrospective

**Review recorded on 28 November 2026 · Facilitator: Hady Keryakos**
**Attendees:** Bilal Kameh, Ghadi Krikorian, Rim Abboud and Hady Keryakos.
**Team feedback, as reported by Hady:** “The API examples helped us work in parallel. For Sprint 2, let’s put the pull request and one test result directly in each Jira ticket so it’s easier for the next person to review.”

## Goal and selected work

Run the site locally, browse and filter seeded quizzes, and support account sign-in. The team selected QC-17, QC-18, QC-19, QC-20, QC-21, QC-22, QC-23, QC-24 and QC-25. QC-12 is the shared sprint record. The estimate was eight person-hours, two per member with their shared fifteen minutes counted once. At the time of the check, Jira showed one hour logged on QC-19. This is a partial worklog total.

## Evidence

| Area | Outcome and evidence |
|---|---|
| Startup and persistence | Bilal’s fresh local run returned the same PostgreSQL record before and after restarting the backend and database. [QC-19 evidence](https://github.com/Bilalkameh/QuizzCraft/blob/3bb93060aad9610f7254f3e1b84272679c454521/docs/qc-19-evidence.md) |
| Catalog and filters | Rim’s desktop check showed three public quizzes. Science + Easy + True/False returned only Planets Warm-Up. Science + Hard showed the empty state. Clearing filters restored all three titles. [QC-23 results and screenshots](https://github.com/Bilalkameh/QuizzCraft/blob/3bb93060aad9610f7254f3e1b84272679c454521/docs/qc-23-evidence.md) |
| Account API | Seven HTTP/PostgreSQL integration tests passed, including sign-in after an application restart. A separate run of the packaged backend through Vite verified valid login (200), invalid login (401), duplicate registration (409), blocked admin access (403) and logout (204). [Account verification and test source](qc-21-evidence.md). [QC-21](https://net-team-s2bxx850.atlassian.net/browse/QC-21) |
| Sprint 2 handoff | Rim approved the scoring specification as written. QC-29 can use it for test-first implementation. [Dated approval](https://net-team-s2bxx850.atlassian.net/browse/QC-25?focusedCommentId=10000) |

## Retrospective and carryover

For Sprint 2, each ticket owner will add the pull request link and one test result to the Jira ticket when handing it over for review. At the time of this record, QC-17 was in review and Ghadi’s QC-24 desktop sign-in integration was still open. The QC-21 account API and its verification are ready for peer review.

[Shared Jira record](https://net-team-s2bxx850.atlassian.net/browse/QC-12?focusedCommentId=10006)
