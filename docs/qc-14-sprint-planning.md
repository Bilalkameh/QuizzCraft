# Sprint 2 planning, review and retrospective

**Planning record, 28 November 2026.** Hady Keryakos facilitates the shared check-in, review and retrospective. [QC-14](https://net-team-s2bxx850.atlassian.net/browse/QC-14)

**Sprint goal** — Publish and play a quiz, see the saved score, and keep attempt history accurate after a revision.

## Selected work and planned effort

| Owner | Sprint work | Budget |
|---|---|---|
| Bilal Kameh | Review revision, ownership and scoring boundaries (20 min). Save private drafts and publish immutable revisions (100 min). [QC-26](https://net-team-s2bxx850.atlassian.net/browse/QC-26) · [QC-27](https://net-team-s2bxx850.atlassian.net/browse/QC-27) | 2 h |
| Hady Keryakos | Write failing scoring tests, then implement and verify submission against the approved specification (120 min). Facilitate the shared activities. [QC-29](https://net-team-s2bxx850.atlassian.net/browse/QC-29) · [Approved specification](https://net-team-s2bxx850.atlassian.net/browse/QC-25?focusedCommentId=10000) | 2 h |
| Ghadi Krikorian | Measure the Sprint 1 quality baseline (30 min). Persist attempts and restrict history to the owner (90 min). [QC-30](https://net-team-s2bxx850.atlassian.net/browse/QC-30) · [QC-31](https://net-team-s2bxx850.atlassian.net/browse/QC-31) | 2 h |
| Rim Abboud | Build and verify the maker's publish screen (65 min) and the player's play, feedback and history screens (55 min). [QC-32](https://net-team-s2bxx850.atlassian.net/browse/QC-32) · [QC-33](https://net-team-s2bxx850.atlassian.net/browse/QC-33) | 2 h |

The eight person-hours include 15 minutes per member for the shared activities. Each member logs actual time once on their tickets. QC-27, QC-29, QC-31 and QC-32 each include one member's shared 15 minutes.

The team can work in parallel using the [API examples](../api-contract.md). At handoff, each owner adds the pull request link and one observed test result directly to their Jira ticket, as agreed in the [Sprint 1 retrospective](qc-12-sprint-review.md).

## Review and retrospective agenda

1. **Publish.** A maker publishes a three-question quiz with both question formats. Record the quiz ID and first revision ID.
2. **Play.** A different account submits one correct, one wrong and one blank answer. Check for a score of 1/3 and feedback for all three questions. Retake the quiz and record both attempt IDs.
3. **Revise and reopen.** The maker changes an answer key and republishes. Open the first attempt from the player's history. Compare its saved questions, answers and score with the first result. [Acceptance walkthroughs](requirements.md#65-user-acceptance-scripts)
4. **Close the record together.** Add the review date, participants, observed results, actual effort, blockers encountered, team feedback and any resulting backlog changes. Agree on one retrospective action and its owner. Link the relevant commits, test output and [AI review decisions](ai-log.md).
