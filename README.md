# QuizzCraft

QuizzCraft currently lists categories from PostgreSQL through the Spring Boot API. The React development server proxies `/api` to Spring Boot.

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

Start Spring Boot in one terminal. On startup it creates the category table if needed.

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
