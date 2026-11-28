# QC-30 · Quality baseline (Sprint 1, commit `4b7be93`)

28 November 2026 · Ghadi · [Jira QC-30](https://net-team-s2bxx850.atlassian.net/browse/QC-30) · Repeated in [QC-40](https://net-team-s2bxx850.atlassian.net/browse/QC-40)

The measured commit is [`4b7be93`](https://github.com/Bilalkameh/QuizzCraft/commit/4b7be93f68b8463a5370624d5e71641a59c08b59), the QC-24 merge. It was the last master commit before Sprint 1 closed, and it contains the catalog, the account API and sign-in. It was exported with `git archive`, so later feature work did not affect it.

## Goal–Question–Metric

**Goal.** Improve the reliability of the server rules that matter most to players (scoring, private history and access control) so they stay correct while Sprints 2 and 3 add features. Viewpoint: the development team.

| Question | Metric | Tool |
| --- | --- | --- |
| Q1. How much of the server code do the automated tests execute? | M1 line coverage, M2 branch coverage, overall and per package | JaCoCo |
| Q2. Are there likely defects that the tests do not reveal? | M3 SpotBugs findings by priority. M4 ESLint errors and warnings in the React client | SpotBugs, ESLint |
| Q3. Is the client tested automatically? | M5 number of automated frontend tests | npm scripts |
| Q4. Would the tests catch a scoring defect? | M6 whether a planted scoring fault fails a test | QC-38 (Sprint 3) |

Branch coverage (M2) is the main signal, because access rules and validation are mostly conditions. Line coverage alone can look high while whole decision paths go untested.

## Baseline results

| Metric | Baseline at `4b7be93` |
| --- | --- |
| Backend tests | 7 (QC-21 account tests), 0 failures |
| M1 line coverage | 159 / 173 = **91.9%** |
| M2 branch coverage | 23 / 46 = **50.0%** |
| Instruction coverage | 876 / 981 = 89.3% |
| M3 SpotBugs findings | **3** (priority 1: 1, priority 2: 2), across 23 classes |
| M4 ESLint, 15 frontend files | **0 errors, 0 warnings** |
| M5 frontend tests | **0** (no test runner) |

| Package | Lines | Branches |
| --- | --- | --- |
| `com.quizzcraft.auth` | 117 / 125 | **21 / 42** |
| `com.quizzcraft.catalog` | 27 / 31 | 2 / 4 |
| `com.quizzcraft.category` | 14 / 14 | 0 / 0 |
| `com.quizzcraft` (application class) | 1 / 3 | 0 / 0 |

Raw reports: [JaCoCo CSV](qc-30/baseline-jacoco.csv) · [SpotBugs XML](qc-30/baseline-spotbugs.xml) · [ESLint](qc-30/baseline-eslint.json) · [Maven summary](qc-30/baseline-mvn-summary.txt)

**Reading the numbers.** Line coverage is high, but only half of the branches in `auth` run. Every path the tests take hits the main line of the code, while many error and edge conditions are never exercised. The catalog filter enums show 0 / 2 lines because no test filters the catalog. No scoring or history code existed at this commit, so M6 has no baseline yet. QC-38 adds it.

## One finding explained

SpotBugs' only priority-1 finding is **`DMI_RANDOM_USED_ONLY_ONCE` in `AuthSecurity.jwtKey`** (rank 14, CWE-440). The method creates `new SecureRandom()` and calls `nextBytes` once, to make the 32-byte JWT signing key at startup when no `QUIZZCRAFT_JWT_SECRET` is configured.

The rule exists because creating a `java.util.Random` for every value gives poor, sometimes predictable randomness. Here, however, the generator is `SecureRandom`, which seeds itself from the operating system's entropy source, and it is used once per application start, not per value. **This is a false positive, and no code change is needed.** It still teaches something: the key is regenerated on every restart, which is why sessions end when the server restarts (QC-21 documents this).

The other two findings are low risk:
- `UWF_UNWRITTEN_FIELD` on `Category.name`: JPA writes the field by reflection.
- `CT_CONSTRUCTOR_THROW` in `AccountService`: a fail-fast check on the token lifetime. The finalizer attack it describes needs a caller able to subclass a Spring singleton.

Proposed for QC-40: record each finding as fixed or explained, instead of aiming for a raw count of zero.

## How it was measured

Environment: PostgreSQL 16.16 (local cluster on port 55432), Temurin JDK 25.0.4 (the pom targets Java 21), Maven 3.9.8, Node 22.20.0. Coverage only includes the PostgreSQL integration tests when `QUIZZCRAFT_TEST_DB_URL` is set. Without it, Maven skips them and coverage is near zero.

**Baseline commit (before the tools were in the build):**

```powershell
git archive --format=zip -o baseline.zip 4b7be93   # unzip, then from its backend folder:
$env:QUIZZCRAFT_TEST_DB_URL = 'jdbc:postgresql://127.0.0.1:55432/quizzcraft'
mvn -B org.jacoco:jacoco-maven-plugin:0.8.16:prepare-agent verify org.jacoco:jacoco-maven-plugin:0.8.16:report com.github.spotbugs:spotbugs-maven-plugin:4.10.5.0:spotbugs
# frontend: copy frontend/eslint.config.js from this branch, install the same pinned ESLint packages, then
npx eslint src
```

**From QC-30 onwards, the tools are part of the build with the same versions:**

| Command | Output |
| --- | --- |
| `cd backend; mvn -B verify` (with `QUIZZCRAFT_TEST_DB_URL`) | `target/site/jacoco/` (index.html, jacoco.csv) and `target/spotbugsXml.xml`. SpotBugs reports findings without failing the build. |
| `cd frontend; npm ci; npm run lint` | ESLint 9.39.5 with [`eslint.config.js`](../frontend/eslint.config.js): ESLint recommended, React recommended except `prop-types`, and the two Rules of Hooks |

Pinned versions: JaCoCo 0.8.16, SpotBugs Maven plugin 4.10.5.0 (SpotBugs 4.10.5, default effort and threshold), ESLint and `@eslint/js` 9.39.5, `eslint-plugin-react` 7.37.5, `eslint-plugin-react-hooks` 7.1.1, `globals` 17.14.0. ESLint 10 was not used because `eslint-plugin-react` 7.37.5 supports only up to ESLint 9. Without that plugin, components used only in JSX would be reported as unused.

**Checks on the measurement itself.**
- A planted file with an unused variable, a conditional hook and an undefined component produced exactly those 4 ESLint errors, so a clean result means clean code, not an inactive config.
- On the QC-30 branch (master `3a9dcf2`, which adds QC-27, QC-29 and QC-31), the build-integrated command ran 31 tests: 93.4% lines (549 / 588), 70.5% branches (148 / 210), the same 3 SpotBugs findings and 0 ESLint problems. These are not baseline values. They only show that QC-40 can rerun the measurement with one command.

## For QC-40

Run the two commands above on the Sprint 3 commit and compare them with the baseline table. Proposed targets, for the team to confirm:
- Branch coverage in `auth` above 50%, with all new scoring and history packages measured.
- Every SpotBugs finding fixed or explained.
- 0 ESLint errors.
- At least one automated frontend test, or an agreed reason for none.
