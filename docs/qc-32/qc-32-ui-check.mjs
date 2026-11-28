// QC-32 UI check: drives the maker screens in headless Edge and saves screenshots.
// Usage: node qc32-ui-check.mjs <node_modules with playwright-core> <screenshot dir> [base URL]
import { createRequire } from 'node:module';

const [, , modulesDir, outDir, base = 'http://127.0.0.1:5173'] = process.argv;
const require = createRequire(`${modulesDir}/`);
const { chromium } = require('playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const TITLE = `Ocean Basics ${Date.now().toString(36)}`;
let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

async function pageAs(token) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (token) await context.addInitScript((t) => window.localStorage.setItem('quizzcraft.token', t), token);
  const page = await context.newPage();
  page.on('response', (r) => {
    if (r.url().includes('/api/my/')) console.log(`  ${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`);
  });
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
const question = (page, n) => page.locator('fieldset.question').nth(n - 1);

// 1. Signed out: the maker screens ask for sign-in.
const visitor = await pageAs(null);
await visitor.goto(`${base}/my/quizzes`);
await visitor.getByText('Sign in to make quizzes.').waitFor();
check(true, 'signed out /my/quizzes asks for sign-in (ACC-03)');
await visitor.close();

// 2. playerA creates a quiz and tries to publish it empty.
const a = await pageAs('playerA-token');
await a.goto(`${base}/my/quizzes`);
await a.getByRole('button', { name: 'New quiz' }).click();
await a.waitForURL(/\/my\/quizzes\/\d+\/edit$/);
const editUrl = a.url();
const quizId = editUrl.match(/quizzes\/(\d+)\/edit/)[1];
console.log(`  created quiz ${quizId}`);
await a.getByRole('button', { name: 'Publish' }).click();
await a.locator('.error-summary').waitFor();
const emptyErrors = await a.locator('.error-summary li').allTextContents();
check(['Title', 'Category', 'Difficulty', 'Questions'].every((f) => emptyErrors.some((e) => e.startsWith(f))),
  `empty publish lists title, category, difficulty and questions: ${emptyErrors.join(' | ')}`);
check(await a.getByLabel('Title').getAttribute('aria-invalid') === 'true', 'title field marked invalid');

// 3. Fill in details, one MC and one TF question; leave Q2 without a correct answer; save.
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
const tfChoices = await question(a, 2).locator('.fixed-choice').allTextContents();
check(tfChoices.join('/') === 'True/False', `true/false question has exactly True/False (MAKE-02): ${tfChoices.join('/')}`);
await a.getByRole('button', { name: 'Save draft' }).click();
await a.getByText('Draft saved.').waitFor();
check(true, 'incomplete draft saves privately');

// 4. Reopen the draft: every field intact (MAKE-01).
await a.reload();
await a.getByLabel('Title').waitFor();
const reopened = {
  title: await a.getByLabel('Title').inputValue(),
  category: await a.getByLabel('Category').inputValue(),
  difficulty: await a.getByLabel('Difficulty').inputValue(),
  q1: await question(a, 1).getByLabel('Question text').inputValue(),
  q1correct: await question(a, 1).getByLabel('Choice 2 is correct').isChecked(),
  q1choices: await question(a, 1).locator('input[type=text][aria-label$="text"]').count(),
  q2: await question(a, 2).getByLabel('Question text').inputValue(),
};
check(reopened.title === TITLE && reopened.category === '1' && reopened.difficulty === 'EASY'
  && reopened.q1 === 'Which is the largest ocean?' && reopened.q1correct && reopened.q1choices === 3
  && reopened.q2 === 'The Dead Sea is an ocean.', `reopened draft intact: ${JSON.stringify(reopened)}`);
await a.goto(`${base}/`);
await a.locator('.quiz-grid, .notice').first().waitFor();
check(await a.getByText(TITLE).count() === 0, 'unpublished draft absent from the catalog');

// 5. Publish with no correct answer on question 2: 422 highlights question 2 (MAKE-03).
await a.goto(editUrl);
await a.getByRole('button', { name: 'Publish' }).click();
await a.locator('.error-summary').waitFor();
const q2Error = await question(a, 2).locator('.field-errors').textContent();
check(await question(a, 2).evaluate((el) => el.classList.contains('has-error')) && /exactly one choice must be correct/i.test(q2Error),
  `question 2 highlighted: "${q2Error}"`);
check(!(await question(a, 1).evaluate((el) => el.classList.contains('has-error'))), 'question 1 not highlighted');
await shot(a, 'qc-32-1-validation');

// 6. Fix it and publish (MAKE-04).
await question(a, 2).getByLabel('Choice 2 is correct').check();
await a.getByRole('button', { name: 'Publish' }).click();
await a.getByText('Published as revision 1.').waitFor();
check(true, 'valid quiz publishes as revision 1');
await shot(a, 'qc-32-2-published');
await a.locator('.success-text').getByRole('link', { name: 'catalog' }).click();
await a.getByText(TITLE).waitFor();
check(true, 'published quiz appears in the catalog');
await shot(a, 'qc-32-3-catalog');

// 7. Revise and republish: revision 2.
await a.goto(editUrl);
await question(a, 1).getByLabel('Question text').fill('Which ocean is the largest by area?');
await a.getByRole('button', { name: 'Publish' }).click();
await a.getByText('Published as revision 2.').waitFor();
await a.goto(`${base}/my/quizzes`);
const row = a.getByRole('row', { name: new RegExp(TITLE) });
await row.waitFor();
const rowText = (await row.textContent()).replace(/\s+/g, ' ');
check(/Published, revision 2/.test(rowText), `My quizzes shows the new revision: ${rowText}`);
await shot(a, 'qc-32-4-my-quizzes');

// 8. playerB cannot edit playerA's quiz (MAKE-05).
const b = await pageAs('playerB-token');
await b.goto(`${base}/my/quizzes`);
await b.locator('table, .notice').first().waitFor();
check(await b.getByText(TITLE).count() === 0, "playerA's quiz is not in playerB's list, so no Edit button");
await b.goto(editUrl);
await b.getByText('Only the quiz owner can edit or publish this quiz.').waitFor();
check(await b.getByLabel('Title').count() === 0, 'playerB sees the denial and no form');
await shot(b, 'qc-32-5-denied');

await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'All checks passed');
process.exitCode = failures ? 1 : 0;
