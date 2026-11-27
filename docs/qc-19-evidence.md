# QC-19 local verification

2026-11-27, local branch `QC-19`, based on `origin/master` at `0e44b4b`. The setup commit is pending Bilal's review.

## Restart check

The fresh database started with an empty category list. `GET /api/categories` returned HTTP 200 and `[]`. One manual `INSERT ... RETURNING id, name` returned `1|QC-19-78ea9b905c4e47f79b4eac0190b73921`.

| Observation | Before restart, 19:52:52 +02:00 | After restart, 19:53:06 +02:00 |
| --- | --- | --- |
| PostgreSQL server PID | 24820 | 23040 |
| Spring Boot PID | 33456 | 24568 |
| PostgreSQL SELECT | `1\|QC-19-78ea9b905c4e47f79b4eac0190b73921` | `1\|QC-19-78ea9b905c4e47f79b4eac0190b73921` |
| API status | HTTP 200 | HTTP 200 |
| API JSON | `[{"id":1,"name":"QC-19-78ea9b905c4e47f79b4eac0190b73921","status":"ACTIVE"}]` | `[{"id":1,"name":"QC-19-78ea9b905c4e47f79b4eac0190b73921","status":"ACTIVE"}]` |
| React table cells | ID `1`, name `QC-19-78ea9b905c4e47f79b4eac0190b73921` | ID `1`, name `QC-19-78ea9b905c4e47f79b4eac0190b73921` |

The initial capture stopped after the single insert because the PowerShell harness mishandled the one-element API array. After fixing the harness, I reopened the existing cluster and recovered the original ID with a SELECT. I then captured all three layers, stopped Spring Boot, ran `pg_ctl -m fast -w restart` on the same PostgreSQL data directory, relaunched Spring Boot, and captured all three layers again. The category was never reinserted. React evidence came from the rendered table in a fresh Edge tab for each observation.

## Checks

| Command or check | Result |
| --- | --- |
| `mvn -B verify` | BUILD SUCCESS on Java 21 and Spring Boot 3.5.16. Maven reported no tests to run. |
| `npm.cmd ci --cache ../.qc19/npm-cache` | Passed. npm reported zero vulnerabilities in this run. |
| `npm.cmd run build` | Passed. Vite 7.3.8 transformed 22 modules. |
| PostgreSQL 16.16, Spring Boot, and React in Edge 158.0.4370.45 | The same ID and name were observed before and after both server processes restarted. |

The [README](../README.md) has the reproduction commands. This run covers the QC-19 local setup and category check. The full release regression is tracked in QC-42. Proposal submission timing and instructor or teammate access await Bilal's confirmation.
