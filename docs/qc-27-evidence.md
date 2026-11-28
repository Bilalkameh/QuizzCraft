# QC-27 maker backend verification

28 November 2026 · Branch `QC-27` · Base `4b7be93f68b8463a5370624d5e71641a59c08b59`

The initial `git status --short` was empty on QC-26. Its committed review remains on that branch at `39af2eb`. After the sandbox denied the first switch, the approved `git switch master`, `git pull --ff-only origin master` and `git switch -c QC-27` succeeded. Master was already current.

## Contract and implementation

- Implemented MAKE-01 through MAKE-06, ACC-03 and the revision preservation needed by REV-01. Used the live [QC-27 ticket](https://net-team-s2bxx850.atlassian.net/browse/QC-27), [requirements](requirements.md), [QC-18 contract](../api-contract.md) §§2–4, §5.6 and D5, and the [QC-32 payloads](qc-32-evidence.md#proposed-request-and-response-shapes-for-bilal-qc-27-to-confirm).
- Create accepts `{}`. The list uses the draft title when a draft exists and the latest published title otherwise. Drafts accept absent category and difficulty, blank text and unfinished questions. Description is optional. Multiple choice needs 2–6 options at publication. True/False choices use fixed labels and return True before False, carrying the correctness flag with its label. A supplied category must exist and be active on save and publish. Reopening a publication with a retired category copies it for editing so the owner can select a replacement.
- Opening, replacing and publishing a draft acquire a PostgreSQL row lock on the quiz after matching its owner to the JWT subject. Publishing with no draft returns `422` and asks the owner to save a draft. An unknown quiz or a removed quiz requested by its owner returns `404`. Another signed-in user receives `403` on existing quizzes.
- Publishing promotes the validated draft and updates the catalog pointer in one transaction. A later draft has its own revision, question and choice rows. The starter seed inserts the private fixture's questions and choices only on initial draft creation, so a restart preserves the maker's edits and published rows.

## Commands and outcomes

Used PostgreSQL 16.16 and Java 21 with the README setup. From the repository root, started the existing local PostgreSQL cluster on loopback, created a separate database with a randomly suffixed `quizzcraft_qc27_` name, and ran the existing HTTP suite in its isolated schema:

~~~powershell
$pg = (Resolve-Path .qc19/pgsql/bin).Path
$env:Path = "$pg;$env:Path"
$qc27Database = 'quizzcraft_qc27_' + [guid]::NewGuid().ToString('N').Substring(0,8)
pg_ctl -D .qc19/pgdata -l .qc19/pgdata.log -o '-h 127.0.0.1 -p 55432' -w start
createdb -h 127.0.0.1 -p 55432 -U quizzcraft $qc27Database
Push-Location backend
$env:QUIZZCRAFT_TEST_DB_URL = "jdbc:postgresql://127.0.0.1:55432/$qc27Database"
mvn -B verify
~~~

Maven reported `BUILD SUCCESS`. All 10 tests passed, with zero failures, errors or skips. Seven cover the existing auth and access behavior. Three cover the maker workflow, revision preservation and seed restart.

From the repository root with `.qc19/pgsql/bin` on PATH, `./backend/scripts/check-catalog.ps1` passed all signed-out QC-22 checks on the QC-27 build, including catalog filters, draft hiding, retired category filtering, revision switching and quiz removal.

For the HTTP examples below, we set `$env:QUIZZCRAFT_DB_URL = $env:QUIZZCRAFT_TEST_DB_URL`, started the packaged application with `java -jar target/quizzcraft-api-0.1.0-SNAPSHOT.jar --server.port=18027`, and sent requests with a scratch Node `fetch` client. After stopping the application, we ran `dropdb -h 127.0.0.1 -p 55432 -U quizzcraft $qc27Database` and `pg_ctl -D ../.qc19/pgdata -m fast -w stop`. The examples omit credentials and bearer tokens.

The [HTTP integration suite](../backend/src/test/java/com/quizzcraft/auth/AuthAccessIntegrationTest.java#L207) registered and signed in separate accounts through the existing auth endpoints.

| Check | Observed result |
| --- | --- |
| Create, save and reopen an incomplete draft | `201`, then `200` on save and reopen after signing out and back in. The quiz was absent from signed-out list and public detail returned `404`. |
| Invalid publication | Empty draft returned `422` with `title`, `categoryId`, `difficulty` and `questions`. An unmarked second question returned `questions[1].choices`. An unknown category on save and a retired category on save/publish flagged `categoryId`. Rejected publication preserved the draft and existing catalog revision. |
| Ownership | All signed-out maker calls returned `401`. The second account's list omitted the quiz. Its draft read, save and publish each returned `403`. The owner's stored draft and catalog publication remained intact. |
| Publish both formats | `201`, number 1. Signed-out list and detail immediately returned the same new publication with `MIXED` format. |
| Republish | Concurrent opens returned the same copied draft with distinct question and choice IDs from revision 1. Saving the copy kept revision 1 visible. Two competing publish calls returned one `201` and one `422`. List and detail switched to revision 2, and a SQL comparison found revision 1's question and choice IDs, positions, text and correctness flags intact. |
| Restart | After editing and publishing the seeded draft with one question, the test restarted Spring Boot on the same database. The published rows and public question count stayed intact. |

## QC-32 payloads from the real API

Sending `{}` to `POST /api/my/quizzes` returned `201`.

~~~json
{"quizId":105}
~~~

The owner sent `{"title":"","description":"Private notes","categoryId":null,"difficulty":null,"questions":[]}` to `PUT /api/my/quizzes/105/draft`. Both PUT and the next GET returned `200` with the same body:

~~~json
{"quizId":105,"title":"","description":"Private notes","categoryId":null,"difficulty":null,"questions":[]}
~~~

With no correct answer on question 2, `POST /api/my/quizzes/105/publish` returned `422`.

~~~json
{
  "error": "VALIDATION_FAILED",
  "message": "Quiz cannot be published",
  "fieldErrors": [{"field":"questions[1].choices","message":"Exactly one choice must be correct"}]
}
~~~

After saving the correction, publish returned `201 {"quizId":105,"revisionId":1002,"number":1}`. `GET /api/my/quizzes` returned `200`.

~~~json
{
  "items": [{
    "quizId": 105,
    "title": "Maker boundary example",
    "status": "ACTIVE",
    "hasDraft": false,
    "published": {"revisionId":1002,"number":1,"publishedAt":"2026-11-28T19:27:43.484555Z"}
  }]
}
~~~

Reopening `GET /api/my/quizzes/105/draft` after publishing returned `200` with the private copy.

~~~json
{
  "quizId": 105,
  "title": "Maker boundary example",
  "description": null,
  "categoryId": 2,
  "difficulty": "EASY",
  "questions": [
    {
      "type": "MULTIPLE_CHOICE",
      "text": "Pick Mercury.",
      "choices": [{"text":"Mercury","isCorrect":true},{"text":"Mars","isCorrect":false}]
    },
    {
      "type": "TRUE_FALSE",
      "text": "Earth is a star.",
      "choices": [{"text":"True","isCorrect":false},{"text":"False","isCorrect":true}]
    }
  ]
}
~~~

The second account's draft GET returned `403 {"error":"FORBIDDEN","message":"Only the quiz owner can edit it","fieldErrors":[]}`. The owner's second publish returned `201 {"quizId":105,"revisionId":1003,"number":2}`. Signed-out detail returned revision 1002 before that publish and 1003 afterward, both with `format: "MIXED"` and `questionCount: 2`.

Teammate review and shared Jira update are Pending.
