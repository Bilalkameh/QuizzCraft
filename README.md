# QuizzCraft

QuizzCraft currently shows a signed-out quiz catalog with category, difficulty and format filters (QC-23). The data comes from PostgreSQL through the Spring Boot API, and the React development server proxies `/api` to Spring Boot. The catalog needs the `GET /api/quizzes` endpoint from QC-22.

## Local setup on Windows

Use PowerShell with JDK 21, Maven, Node.js 22.12 or newer, npm, and PostgreSQL 16 binaries on your PATH. PostgreSQL's [Windows downloads](https://www.postgresql.org/download/windows/) include a link to the standalone binaries. Use a fresh local cluster for this walkthrough. Its trust authentication is for this isolated, loopback-only demo.

If you extract the standalone archive under `.qc19`, run `$env:Path = "$(Resolve-Path .qc19/pgsql/bin);$env:Path"` from the repository root in each terminal that runs PostgreSQL commands.

From the repository root, initialize the cluster and create the database once.

```powershell
New-Item -ItemType Directory -Force .qc19 | Out-Null
$pgData = Join-Path (Resolve-Path .qc19) 'pgdata'
initdb -D $pgData -U quizzcraft -A trust -E UTF8
pg_ctl -D $pgData -l "$pgData.log" -o "-h 127.0.0.1 -p 55432" -w start
createdb -h 127.0.0.1 -p 55432 -U quizzcraft quizzcraft
```

If using an existing database, set `QUIZZCRAFT_DB_URL`, `QUIZZCRAFT_DB_USER`, and `QUIZZCRAFT_DB_PASSWORD` in the backend terminal as needed. Keep credentials out of tracked files.

## Start the application

Start Spring Boot in one terminal. On startup it creates any missing tables (`schema.sql`) and loads the original seed quizzes (`data.sql`, QC-20). Both scripts are safe to rerun on every restart. The seed expects a fresh database. To check the seeded catalog data, see [requirements §6.4](docs/requirements.md#64-test-data-from-the-qc-20-seed).

```powershell
cd backend
mvn -B verify
java -jar target/quizzcraft-api-0.1.0-SNAPSHOT.jar
```

Start React in another terminal from the repository root.

```powershell
cd frontend
npm.cmd ci --cache ../.qc19/npm-cache
npm.cmd run build
npm.cmd run dev
```

React runs at <http://127.0.0.1:5173/> and the API at <http://127.0.0.1:8080/api/categories>.

## Account API and tests (QC-21)

The backend supports registration, login, current-user lookup and logout under `/api/auth`. Use the [request and response contract](api-contract.md#4-routes) to connect the desktop sign-in screen in QC-24. A registered account can both create and play quizzes. The server assigns every new account the `USER` role.

The bearer token lasts one hour by default. The desktop client should keep it in memory and clear it on logout or page reload. The backend generates a new signing key on startup for local development. To keep tokens valid across backend restarts, supply a stable `QUIZZCRAFT_JWT_SECRET` containing at least 32 random bytes encoded in Base64. To change the lifetime, set `QUIZZCRAFT_TOKEN_TTL` to a duration such as `PT1H`. Keep any configured key out of Git. User accounts persist in PostgreSQL independently of the signing key.

To run the HTTP integration tests, start PostgreSQL using the setup above. From `backend`, pass the JDBC URL of a development or test database. The role must be able to create a schema. Each run creates and removes its own isolated test schema. Without the test URL, Maven skips the database integration suite.

```powershell
$env:QUIZZCRAFT_TEST_DB_URL = 'jdbc:postgresql://127.0.0.1:55432/quizzcraft'
mvn -B verify
```

On macOS, Linux or Git Bash, use `QUIZZCRAFT_TEST_DB_URL=jdbc:postgresql://127.0.0.1:55432/quizzcraft mvn -B verify`. Use the same `QUIZZCRAFT_DB_USER` and `QUIZZCRAFT_DB_PASSWORD` described above if your PostgreSQL credentials differ. [QC-21 verification results](docs/qc-21-evidence.md).

## Verify database persistence

From a third PowerShell terminal at the repository root, run the insert once after Spring Boot has started. Keep this terminal open so the same label is available after restart.

```powershell
$pgData = Join-Path (Resolve-Path .qc19) 'pgdata'
$category = "QC-19-$([guid]::NewGuid().ToString('N'))"
$psqlArgs = @('-X', '-h', '127.0.0.1', '-p', '55432', '-U', 'quizzcraft', '-d', 'quizzcraft', '-v', 'ON_ERROR_STOP=1')
psql @psqlArgs -c "INSERT INTO categories (name) VALUES ('$category') RETURNING id, name;"
```

Capture the database and API output with these commands. Open the React page and record the ID and name shown in the table.

```powershell
psql @psqlArgs -At -c "SELECT id, name FROM categories WHERE name = '$category';"
$response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/api/categories'
$response.StatusCode
$response.Content
```

Stop Spring Boot with Ctrl+C. Restart PostgreSQL with the same data directory, then run the same `java -jar` command in the backend terminal.

```powershell
pg_ctl -D $pgData -l "$pgData.log" -o "-h 127.0.0.1 -p 55432" -m fast -w restart
```

Repeat the SELECT and GET, then reload the React page. Check that all three show the original ID and name. When finished, stop Spring Boot and React with Ctrl+C, then run `pg_ctl -D $pgData -m fast -w stop`.

See the [observed QC-19 results](docs/qc-19-evidence.md), [requirements](docs/requirements.md), [working agreements](AGENTS.md#working-agreements), and [AI log](docs/ai-log.md).
