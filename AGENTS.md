# QuizzCraft

QuizzCraft is a local desktop web application with React/Vite in `frontend/`, Spring Boot/Java in `backend/`, and PostgreSQL. In local development, the browser calls `/api` through Vite's proxy. The server owns data access, authorization, validation and scoring.

## Working agreements

- Read the live Jira ticket and the relevant sections of [requirements](docs/requirements.md) before editing. Use the [QC-18 draft contract](https://github.com/Bilalkameh/QuizzCraft/blob/QC-18-api-contract/api-contract.md) as the API reference.
- Keep changes scoped to the ticket and preserve teammates' local work. Confirm with the task owner before pushing, merging, or updating shared Jira records on their behalf.
- Follow the setup and verification commands in [README.md](README.md). Record the requirement, commands, observed results, and human review decisions in the [AI log](docs/ai-log.md). Keep credentials out of the repository and evidence.
