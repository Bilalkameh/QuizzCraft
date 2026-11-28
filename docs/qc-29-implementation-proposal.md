# QC-29 scoring and submission · proposal for team review

Rim approved the scoring rules and nine acceptance cases on 27 November. This proposal maps them to the backend at `4b7be93`. Hady and the team can use it to review the implementation before writing production code. [Approved specification and review](https://net-team-s2bxx850.atlassian.net/browse/QC-25) · [QC-29](https://net-team-s2bxx850.atlassian.net/browse/QC-29) · [API examples, sections 5.2–5.5](../api-contract.md)

## Smallest implementation to review

1. Add a play/submission controller under `com.quizzcraft.play`. Both routes already require a valid JWT. For `GET /api/quizzes/{id}/play`, read the active quiz’s latest published revision with the existing Spring `JdbcClient`. Order questions and choices by position. The public response contains only quiz ID, revision ID, title, questions and choices as in section 5.2. An explicit list of response fields keeps the answer key private.
2. For `POST /api/revisions/{id}/attempts`, take the owner from the JWT subject and load the published revision named in the URL. A draft or missing revision returns 404. A removed quiz returns 410 with `QUIZ_REMOVED`; opening a new play on it returns 404. If the maker published a newer revision in the meantime, grade the original.
3. Give the grading service the revision’s ordered questions and the submitted answers. Validate the entire request before saving. Reject duplicate questions, questions outside the revision and choices outside their question with 422. Treat omitted questions and explicit null choices as blank. Award one point for a correct choice, zero otherwise. Return one feedback entry per question and include all questions in the denominator.
4. Pass the authenticated owner ID, attempted revision ID, score, maximum score and per-question results to the attempt store. Its save operation writes the attempt and answers together and returns the generated ID and submission time. Guard the removal check and save in the same transaction by locking the quiz row against concurrent removal. Return 201 and the section 5.4 feedback only after a successful save. A retake creates a new attempt.

## Work the team can do in parallel

| Owner | Implementation boundary and integration check |
|---|---|
| Hady · QC-29 | Implement the two routes, revision read and grading rules. Use a test-only attempt store when exercising scoring independently. The first failing example uses revision 1001, choices 9002 and 9004, and a blank. Expect 1/3 and points `[1, 0, 0]`. |
| Bilal · QC-27 | Publish immutable revisions with separate question and choice rows, and update the quiz’s latest revision pointer. Integrate by opening revision 1, publishing revision 2 with a different key, submitting revision 1, then opening a fresh play. [QC-27](https://net-team-s2bxx850.atlassian.net/browse/QC-27) |
| Ghadi · QC-31 | Own the PostgreSQL attempt tables, save implementation and owner-only history endpoints. Agree the save inputs and return values above. Integrate by checking two retakes, denied access for a second player, then the original score after republication, removal and restart. [QC-31](https://net-team-s2bxx850.atlassian.net/browse/QC-31) |
| Rim · QC-33 | Exercise the player screens against the real play and submission routes. Compare the 201 body, including the choice-ID-to-text map, with the existing player fixture. [QC-33](https://net-team-s2bxx850.atlassian.net/browse/QC-33) |

## Decision to record

Can the team accept the grading rules in step 3, the save interface in step 4, and the split of work above? Record the reviewer, date, decision and any requested change on QC-29 after the review. Keep the failing-test commit before the implementation commit and link both test outputs.
