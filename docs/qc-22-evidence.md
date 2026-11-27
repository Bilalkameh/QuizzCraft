# QC-22 catalog verification

2026-11-27 · Local branch `QC-22` from `origin/master` at `a56cc38` · CAT-02, with related CAT-01 and CAT-03–05 checks.

## Commands

Run from the repository root in PowerShell with Java 21, Maven and PostgreSQL 16 on PATH. With the standalone PostgreSQL binaries from the QC-19 walkthrough, first run `$env:Path = "$(Resolve-Path .qc19/pgsql/bin);$env:Path"`.

```powershell
Push-Location backend
mvn -B verify
Pop-Location
./backend/scripts/check-catalog.ps1
```

Maven reported `BUILD SUCCESS` and `No tests to run`. The PowerShell check starts a fresh PostgreSQL cluster on loopback port 55433, creates `quizzcraft_qc22`, and runs the packaged application on port 8082 so it loads the merged QC-20 schema and seed. It sends requests without credentials and stops its processes when it finishes. Logs and test data are left under an ignored `.qc19/qc22-*` directory. The [script](../backend/scripts/check-catalog.ps1) accepts alternate ports.

## Observed results

| Signed-out request | HTTP | Result |
| --- | --- | --- |
| `GET /api/quizzes` | 200 | Planets Warm-Up, Rivers and Mountains, Fractions Challenge |
| `GET /api/quizzes?categoryId=2&difficulty=EASY&format=TRUE_FALSE` | 200 | Planets Warm-Up once, with format `MIXED` |
| `GET /api/quizzes?categoryId=2&difficulty=HARD` | 200 | `{"items":[]}` |
| `GET /api/quizzes?format=MULTIPLE_CHOICE` | 200 | Planets Warm-Up, Fractions Challenge |
| `GET /api/quizzes?format=TRUE_FALSE` | 200 | Planets Warm-Up, Rivers and Mountains |
| `GET /api/quizzes/104` and `GET /api/quizzes/9999` | 404 each | Draft-only Moon Basics and unknown quiz. Moon Basics was absent from every catalog response. |
| `GET /api/quizzes/101` | 200 | Revision 1001, `MIXED`, 3 questions counted. The response contained metadata only. |
| `GET /api/quizzes?categoryId=2` after retiring Science | 200 | Planets Warm-Up, with category status `RETIRED` |
| Format filters and `GET /api/quizzes/101` after changing the published revision pointer to 1002 | 200 | Planets Revised matched only the true/false filter. Detail returned revision 1002, `TRUE_FALSE`, question count 1. |
| `GET /api/quizzes` after setting quiz 101 to `REMOVED` | 200 | Rivers and Mountains, Fractions Challenge |
| `GET /api/quizzes/101` after removal | 404 | Quiz 101 was unavailable publicly. |

## QC-23 response example

Observed HTTP 200 for `GET /api/quizzes?categoryId=2&difficulty=EASY&format=TRUE_FALSE`, formatted for readability.

```json
{
  "items": [
    {
      "quizId": 101,
      "revisionId": 1001,
      "title": "Planets Warm-Up",
      "description": "Three quick questions about our solar system.",
      "category": { "id": 2, "name": "Science", "status": "ACTIVE" },
      "difficulty": "EASY",
      "format": "MIXED",
      "questionCount": 3
    }
  ]
}
```
