# AI work log

## 2026-11-27 · QC-19 · ENG-01 and ENG-04

- **Tool and request** — Codex. Bilal approved the local setup plan and asked for a public category endpoint, a React table, and before-and-after evidence from PostgreSQL, the API, and the browser.
- **Inputs** — The live [QC-19 issue](https://net-team-s2bxx850.atlassian.net/browse/QC-19), both team handoff documents, the [requirements](requirements.md), and the [QC-18 draft API contract](https://github.com/Bilalkameh/QuizzCraft/blob/QC-18-api-contract/api-contract.md). Local branch `QC-19` starts at `origin/master` commit `0e44b4b`.
- **Implementation** — Added a Spring Boot and JPA backend, PostgreSQL category schema, and a React/Vite client with a same-origin API proxy. The endpoint lists category IDs, names, and statuses. The browser shows each category's database ID and name. The application initializes the schema. The verification operator inserts the category once.
- **Build checks** — `mvn -B verify` passed and produced the runnable JAR. Maven reported no tests to run. `npm.cmd ci --cache ../.qc19/npm-cache` and `npm.cmd run build` passed. The first clean install hit a Windows sandbox child-process restriction. The rerun succeeded outside the sandbox.
- **Restart check** — PostgreSQL SELECT, HTTP 200 from `GET /api/categories`, and the React table in Edge showed the same ID and unique name before and after PostgreSQL and Spring Boot restarted. A PowerShell capture fix reused the original inserted row. The [evidence](qc-19-evidence.md) records the outputs and process IDs.
- **Review** — Bilal approved implementation locally and reserved commit, push, and Jira update for his review. File and evidence review is pending. Proposal submission and instructor or teammate access also await Bilal's confirmation.
