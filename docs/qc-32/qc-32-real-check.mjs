// QC-32 integrated check against the REAL backend (QC-21, QC-24, QC-27 merged). Drives headless Edge.
// Registers two fresh accounts through the API, then signs in through the real sign-in screen. The token is
// kept in memory only (QC-24), so every full page load signs in again through the redirect.
// Usage: node qc-32-real-check.mjs <node_modules with playwright-core> <screenshot dir> [base URL]
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const [, , modulesDir, outDir, base = 'http://127.0.0.1:5173'] = process.argv;
const require = createRequire(`${modulesDir}/`);
const { chromium } = require('playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const run = Date.now().toString(36);
const TITLE = `Ocean Basics ${run}`;
let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
}

// Fresh accounts per run. The password is random and never printed.
async function register(name) {
  const user = { email: `${name}.${run}@example.test`, password: randomUUID(), displayName: `${name} ${run}` };
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user),
  });
  console.log(`  register ${name} -> ${response.status}`);
  if (response.status !== 201) throw new Error(`register ${name} failed`);
  return user;
}
const playerA = await register('playerA');
const playerB = await register('playerB');

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
async function newPage() {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('response', (r) => {
    if (r.url().includes('/api/my/')) console.log(`  ${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`);
  });
  return page;
}
// Open a protected page. A full page load drops the in-memory token, so the app always redirects to
// /signin first and returns to the page after sign-in.
async function visit(page, path, user) {
  await page.goto(`${base}${path}`);
  await page.waitForURL(/\/signin$/);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === path);
}
const shot = (page, name) => page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
const question = (page, n) => page.locator('fieldset.question').nth(n - 1);
const hasError = (locator) => locator.evaluate((el) => el.classList.contains('has-error'));

// 1. Signed out: My quizzes sends the visitor to sign-in with the maker message (ACC-03).
const visitor = await newPage();
await visitor.goto(`${base}/my/quizzes`);
await visitor.waitForURL(/\/signin$/);
check(await visitor.getByText('Sign in to make quizzes.').count() === 1, 'signed out: My quizzes redirects to sign-in with the maker message');
await visitor.close();

// 2. playerA creates a quiz and publishes it empty (MAKE-03).
const a = await newPage();
await visit(a, '/my/quizzes', playerA);
await a.getByRole('button', { name: 'New quiz' }).click();
await a.waitForURL(/\/my\/quizzes\/\d+\/edit$/);
const editPath = new URL(a.url()).pathname;
const quizId = editPath.match(/quizzes\/(\d+)\/edit/)[1];
console.log(`  created quiz ${quizId}`);
await a.getByRole('button', { name: 'Publish' }).click();
await a.locator('.error-summary').waitFor();
const emptyErrors = await a.locator('.error-summary li').allTextContents();
check(['Title', 'Category', 'Difficulty', 'Questions'].every((f) => emptyErrors.some((e) => e.startsWith(f))),
  `empty publish rejected with field errors: ${emptyErrors.join(' | ')}`);

// 3. Fill in one MC and one TF question, leave Q2 without a correct answer, save (MAKE-01, MAKE-02).
await a.getByLabel('Title').fill(TITLE);
await a.getByLabel('Description').fill('Five-minute warm-up about the oceans.');
await a.getByLabel('Category').selectOption({ label: 'Geography' });
await a.getByLabel('Difficulty').selectOption({ label: 'Easy' });
await a.getByRole('button', { name: 'Add multiple-choice question' }).click();
await question(a, 1).getByLabel('Question text').fill('Which is the largest ocean?');
await question(a, 1).getByRole('button', { name: 'Add choice' }).click();
await question(a, 1).getByLabel('Choice 1 text').fill('Atlantic');
await question(a, 1).getByLabel('Choice 2 text').fill('Pacific');
await question(a, 1).getByLabel('Choice 3 text').fill('Indian');
await question(a, 1).getByLabel('Choice 2 is correct').check();
await a.getByRole('button', { name: 'Add true / false question' }).click();
await question(a, 2).getByLabel('Question text').fill('The Dead Sea is an ocean.');
await a.getByRole('button', { name: 'Save draft' }).click();
await a.getByText('Draft saved.').waitFor();
check(true, 'incomplete draft saved');

// 4. Reopen after a full reload and a new sign-in: every field intact; not in the catalog.
await visit(a, editPath, playerA);
await a.getByLabel('Title').waitFor();
const reopened = {
  title: await a.getByLabel('Title').inputValue(),
  difficulty: await a.getByLabel('Difficulty').inputValue(),
  q1: await question(a, 1).getByLabel('Question text').inputValue(),
  q1correct: await question(a, 1).getByLabel('Choice 2 is correct').isChecked(),
  q1choices: await question(a, 1).locator('input[type=text][aria-label$="text"]').count(),
  q2: await question(a, 2).getByLabel('Question text').inputValue(),
};
check(reopened.title === TITLE && reopened.difficulty === 'EASY' && reopened.q1 === 'Which is the largest ocean?'
  && reopened.q1correct && reopened.q1choices === 3 && reopened.q2 === 'The Dead Sea is an ocean.',
  `draft reopened intact after sign-in again: ${JSON.stringify(reopened)}`);
const catalogBefore = await (await fetch(`${base}/api/quizzes`)).json();
check(!catalogBefore.items.some((q) => q.title === TITLE), 'unpublished draft absent from GET /api/quizzes');

// 5. Publish with no correct answer on Q2: 422 highlights question 2.
await a.getByRole('button', { name: 'Publish' }).click();
await a.locator('.error-summary').waitFor();
const summary = (await a.locator('.error-summary').textContent()).replace(/\s+/g, ' ');
check(await hasError(question(a, 2)) && !(await hasError(question(a, 1))), `question 2 highlighted, question 1 not: ${summary}`);
await shot(a, 'qc-32-real-1-validation');

// 6. Fix and publish: revision 1, visible in the catalog (MAKE-04).
await question(a, 2).getByLabel('Choice 2 is correct').check();
await a.getByRole('button', { name: 'Publish' }).click();
await a.getByText('Published as revision 1.').waitFor();
check(true, 'valid quiz published as revision 1');
await a.locator('.success-text').getByRole('link', { name: 'catalog' }).click();
await a.locator('.quiz-card', { hasText: TITLE }).waitFor();
const card = (await a.locator('.quiz-card', { hasText: TITLE }).textContent()).replace(/\s+/g, ' ');
check(/Geography/.test(card) && /Easy/.test(card) && /Mixed/.test(card), `catalog card: ${card}`);
await shot(a, 'qc-32-real-2-catalog');

// 7. Revise and republish: revision 2.
await visit(a, editPath, playerA);
await question(a, 1).getByLabel('Question text').fill('Which ocean is the largest by area?');
await a.getByRole('button', { name: 'Publish' }).click();
await a.getByText('Published as revision 2.').waitFor();
await visit(a, '/my/quizzes', playerA);
const row = a.getByRole('row', { name: new RegExp(TITLE) });
await row.waitFor();
const rowText = (await row.textContent()).replace(/\s+/g, ' ');
check(/Published, revision 2/.test(rowText), `My quizzes: ${rowText}`);
await shot(a, 'qc-32-real-3-my-quizzes');

// 8. playerB cannot edit playerA's quiz (MAKE-05).
const b = await newPage();
await visit(b, '/my/quizzes', playerB);
await b.locator('table, .notice').first().waitFor();
check(await b.getByText(TITLE).count() === 0, "playerA's quiz is not in playerB's list, so there is no Edit link");
// Skip the 401 sent before the redirect to sign-in; the request after sign-in is the one that matters.
const denied = b.waitForResponse((r) => r.url().endsWith(`/api/my/quizzes/${quizId}/draft`) && r.status() !== 401);
await visit(b, editPath, playerB);
check((await denied).status() === 403, 'GET draft as playerB returned 403');
await b.getByText('Only the quiz owner can edit or publish this quiz.').waitFor();
check(await b.getByLabel('Title').count() === 0, 'playerB sees the owner-only message and no form');
await shot(b, 'qc-32-real-4-denied');

await browser.close();
console.log(`quizId=${quizId}`);
console.log(failures ? `${failures} check(s) failed` : 'All checks passed');
process.exitCode = failures ? 1 : 0;
