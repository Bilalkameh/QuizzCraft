# QC-20 seed verification

2026-11-27, local branch `qc-20-seeding`, based on `master` at `e371bdb`. Covers ENG-02 and the seed side of CAT-01…05. The seed files are [`schema.sql`](../backend/src/main/resources/schema.sql) and [`data.sql`](../backend/src/main/resources/data.sql). The check is [`qc-20-catalog-check.sql`](qc-20-catalog-check.sql). The expected titles are recorded in [requirements §6.4](requirements.md#64-test-data-from-the-qc-20-seed).

## Environment

| Item | Value |
| --- | --- |
| PostgreSQL | 16.16 standalone binaries (EDB) in `.qc19/pgsql`, new cluster from `initdb`, port 55432 |
| Java and build | Temurin 25.0.4 (the pom targets Java 21), Maven 3.9.8, Spring Boot 3.5.16 |
| API port | 8081 via `--server.port=8081`, because another local service (Apache `httpd`) already held 8080. No repository change. |

## Fresh database run

1. Following the README, I created a new cluster and an empty `quizzcraft` database. `pg_tables` showed 0 public tables.
2. `mvn -B "-Dmaven.repo.local=../.qc19/m2" verify` passed (BUILD SUCCESS, no tests yet). The local Maven repository was needed because the sandbox could not write to `~/.m2`.
3. `java -jar target/quizzcraft-api-0.1.0-SNAPSHOT.jar --server.port=8081` started in 2.81 s with no warnings or errors. Spring ran `schema.sql` and then `data.sql`.
4. `GET /api/categories` returned HTTP 200 with `[{"id":1,"name":"Geography","status":"ACTIVE"},{"id":2,"name":"Science","status":"ACTIVE"},{"id":3,"name":"Mathematics","status":"ACTIVE"}]`.
5. `psql -X -h 127.0.0.1 -p 55432 -U quizzcraft -d quizzcraft -v ON_ERROR_STOP=1 -f docs/qc-20-catalog-check.sql` exited 0.

| Check | Observed |
| --- | --- |
| Seeded rows | 3 categories, 1 user, 4 quizzes, 4 revisions, 11 questions, 27 choices |
| Quiz 101 / rev 1001 | Planets Warm-Up · Science · EASY · MIXED · 3 questions · PUBLISHED |
| Quiz 102 / rev 902 | Rivers and Mountains · Geography · MEDIUM · TRUE_FALSE · 3 questions · PUBLISHED |
| Quiz 103 / rev 903 | Fractions Challenge · Mathematics · HARD · MULTIPLE_CHOICE · 3 questions · PUBLISHED |
| Quiz 104 / rev 904 | Moon Basics · Science · EASY · TRUE_FALSE · 2 questions · DRAFT, no latest published revision |
| Answer keys | 0 invalid questions: each has exactly one correct choice, and every TF question has the choices `True/False` |
| Next generated ids | quiz 105, revision 1002, matching the contract examples |

Expected catalog results, derived with the contract's rules: only ACTIVE quizzes, each showing its latest PUBLISHED revision, and a MIXED quiz matches either format filter.

| Filters | Matches | Titles |
| --- | --- | --- |
| no filters | 3 | Planets Warm-Up, Rivers and Mountains, Fractions Challenge |
| Science + Easy + True/False | 1 | Planets Warm-Up |
| format = Multiple choice | 2 | Planets Warm-Up, Fractions Challenge |
| format = True/False | 2 | Planets Warm-Up, Rivers and Mountains |
| Science + Easy | 1 | Planets Warm-Up |
| Geography + Medium | 1 | Rivers and Mountains |
| Mathematics + Hard | 1 | Fractions Challenge |
| Science + Hard | 0 | (none) |

"Moon Basics" matches Science + Easy + True/False by its fields, but it never appears in any row.

## Repeat run

I stopped Spring Boot, ran `pg_ctl -m fast -w restart` on the same data directory, and started the same JAR again, so `schema.sql` and `data.sql` ran a second time. It started in 2.93 s with no warnings or errors. The catalog check output matched the first run row for row, with no duplicate or changed rows.

## Not covered here

`GET /api/quizzes` with filters, and `GET /api/quizzes/104` returning 404, do not exist yet. They belong to QC-22. When they land, they should return the titles above.
