// QC-33 integrated check against the REAL backend (QC-21, QC-24, QC-27, QC-29, QC-31 merged). Drives headless Edge.
// Registers two fresh accounts, signs in through the real sign-in screen, and plays seeded quiz 101 (mixed
// formats) and 102 (true/false only). For republication it creates and republishes a quiz for playerA through
// the real maker API. Records the real attempt ids.
// Usage: node qc-33-real-check.mjs <node_modules with playwright-core> <screenshot dir> [base URL]
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const [, , modulesDir, outDir, base = 'http://127.0.0.1:5173'] = process.argv;
const require = createRequire(`${modulesDir}/`);
const { chromium } = require('playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const run = Date.now().toString(36);
let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
}

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
// Fresh accounts per run. Passwords are random and never printed.
async function register(name) {
  const user = { email: `${name}.${run}@example.test`, password: randomUUID(), displayName: `${name} ${run}` };
  const { status } = await call('POST', '/api/auth/register', user);
  console.log(`  register ${name} -> ${status}`);
  if (status !== 201) throw new Error(`register ${name} failed`);
  user.token = (await call('POST', '/api/auth/login', { email: user.email, password: user.password })).body.token;
  return user;
}
const playerA = await register('playerA');
const playerB = await register('playerB');

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
async function newPage() {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('response', (r) => {
    if (/\/api\/(quizzes\/\d+\/play|revisions|me\/|attempts)/.test(r.url())) {
      console.log(`  ${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`);
    }
  });
  return page;
}
// A full page load drops the in-memory token, so the app redirects to /signin and returns afterwards.
async function visit(page, path, user) {
  await page.goto(`${base}${path}`);
  await page.waitForURL(/\/signin$/);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === path);
}
const shot = (page, name) => page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
const radio = (page, name) => page.getByRole('radio', { name, exact: true });
const rows = async (page, selector) => (await page.locator(selector).allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
const attemptIdOf = (page) => page.url().match(/attempts\/(\d+)/)[1];
const next = (page) => page.getByRole('button', { name: /^(Next|Skip) ▶$/ }).click();

// 1. Signed out: Start quiz sends the visitor to sign-in with the player message (ACC-03).
const visitor = await newPage();
await visitor.goto(`${base}/`);
await visitor.locator('.quiz-card', { hasText: 'Planets Warm-Up' }).getByRole('link', { name: 'Start quiz' }).click();
await visitor.waitForURL(/\/signin$/);
check(await visitor.getByText('Sign in to play quizzes.').count() === 1, 'signed out: Start quiz redirects to sign-in with the player message');
await visitor.close();

// 2. playerA opens Planets Warm-Up (mixed). No answer key in the play payload (PLAY-02, QC-25 case 01).
const a = await newPage();
const playResponse = a.waitForResponse((r) => r.url().endsWith('/api/quizzes/101/play') && r.status() === 200);
await visit(a, '/quizzes/101/play', playerA);
const playBody = await (await playResponse).text();
check(!/isCorrect|correctChoiceId|"correct"|points/.test(playBody), 'real play payload contains no answer key or points');

// 3. Change, clear and skip, ending on the worked example: Mercury, True, blank (PLAY-03).
await radio(a, 'Venus').check();
await radio(a, 'Mercury').check();
await next(a);
await radio(a, 'True').check();
await next(a);
await radio(a, '8').check();
await a.getByRole('button', { name: 'Clear answer' }).click();
await a.getByRole('button', { name: 'Submit quiz' }).click();
await a.getByText('2 of 3 answered. Unanswered questions score 0. Submit anyway?').waitFor();
const submitRequest = a.waitForRequest((r) => r.url().endsWith('/api/revisions/1001/attempts'));
await a.getByRole('button', { name: 'Submit anyway' }).click();
const sent = JSON.parse((await submitRequest).postData());
check(JSON.stringify(sent) === JSON.stringify({ answers: [
  { questionId: 5001, choiceId: 9002 }, { questionId: 5002, choiceId: 9004 }, { questionId: 5003, choiceId: null },
] }), `request body matches the screen: ${JSON.stringify(sent)}`);

// 4. Real grading: 1/3 with feedback (PLAY-01, PLAY-05, QC-25 case 02).
await a.waitForURL(/\/attempts\/\d+$/);
const first = attemptIdOf(a);
await a.getByText('Score 1/3').waitFor();
const firstRows = await rows(a, '.feedback li');
check(firstRows[0].includes('✓') && firstRows[0].includes('Your answer: Mercury')
  && firstRows[1].includes('Your answer: True · Correct answer: False')
  && firstRows[2].includes('Your answer: blank · Correct answer: 8'), `attempt ${first}: ${firstRows.join(' | ')}`);
await shot(a, 'qc-33-real-1-result');

// 5. Retake creates another attempt (QC-25 case 07).
await a.getByRole('link', { name: 'Retake' }).click();
await a.getByText('0 of 3 answered').waitFor();
await radio(a, 'Mercury').check();
await next(a);
await radio(a, 'False').check();
await next(a);
await radio(a, '8').check();
await a.getByRole('button', { name: 'Submit quiz' }).click();
await a.getByText('Score 3/3').waitFor();
const retake = attemptIdOf(a);
check(retake !== first, `retake saved as a separate attempt (${first}, then ${retake})`);

// 6. True/false-only seeded quiz 102.
const tfPlay = a.waitForResponse((r) => r.url().endsWith('/api/quizzes/102/play') && r.status() === 200);
await visit(a, '/quizzes/102/play', playerA);
const tfQuiz = await (await tfPlay).json();
check(tfQuiz.questions.every((q) => q.type === 'TRUE_FALSE'), `quiz 102 "${tfQuiz.title}" is true/false only`);
for (let i = 0; i < tfQuiz.questions.length; i += 1) {
  await radio(a, 'True').check();
  if (i < tfQuiz.questions.length - 1) await next(a);
}
await a.getByRole('button', { name: 'Submit quiz' }).click();
await a.waitForURL(/\/attempts\/\d+$/);
await a.locator('.score').waitFor();
const tfAttempt = attemptIdOf(a);
const tfScore = (await a.locator('.score').textContent()).trim();
const tfRows = await rows(a, '.feedback li');
check(/Score \d\/3/.test(tfScore) && tfRows.length === 3, `true/false attempt ${tfAttempt}: ${tfScore}, ${tfRows.length} feedback rows`);

// 7. Republication: playerA's own quiz, published through the real maker API, played, then republished.
const created = await call('POST', '/api/my/quizzes', {}, playerA.token);
const ownQuiz = created.body.quizId;
const draft = (q1) => ({
  title: `Republish Check ${run}`, description: 'Checks that a saved result keeps its revision.', categoryId: 2, difficulty: 'EASY',
  questions: [
    { type: 'MULTIPLE_CHOICE', text: q1, choices: [{ text: 'Mars', isCorrect: true }, { text: 'Venus', isCorrect: false }] },
    { type: 'TRUE_FALSE', text: 'The Moon has its own light.', choices: [{ text: 'True', isCorrect: false }, { text: 'False', isCorrect: true }] },
  ],
});
await call('PUT', `/api/my/quizzes/${ownQuiz}/draft`, draft('Which planet is called the Red Planet?'), playerA.token);
const rev1 = await call('POST', `/api/my/quizzes/${ownQuiz}/publish`, undefined, playerA.token);
console.log(`  quiz ${ownQuiz} published as revision ${rev1.body.revisionId} (number ${rev1.body.number})`);
await visit(a, `/quizzes/${ownQuiz}/play`, playerA);
await radio(a, 'Mars').check();
await next(a);
await radio(a, 'True').check();
await a.getByRole('button', { name: 'Submit quiz' }).click();
await a.getByText('Score 1/2').waitFor();
const beforeRepublish = attemptIdOf(a);
const beforeRows = await rows(a, '.feedback li');
await call('PUT', `/api/my/quizzes/${ownQuiz}/draft`, draft('Which planet has the Great Red Spot?'), playerA.token);
const rev2 = await call('POST', `/api/my/quizzes/${ownQuiz}/publish`, undefined, playerA.token);
console.log(`  quiz ${ownQuiz} republished as revision ${rev2.body.revisionId} (number ${rev2.body.number})`);
// Reloading drops the in-memory session. The result must not be shown again from the browser's saved state.
await a.reload();
await a.waitForURL(/\/signin$/);
check(await a.locator('.feedback').count() === 0, 'reloading a result while signed out redirects to sign-in and shows no result');
await visit(a, `/attempts/${beforeRepublish}`, playerA);
await a.getByText('Score 1/2').waitFor();
const afterRows = await rows(a, '.feedback li');
check(rev2.body.number === 2 && afterRows[0].includes('Which planet is called the Red Planet?')
  && JSON.stringify(afterRows) === JSON.stringify(beforeRows),
  `attempt ${beforeRepublish} unchanged after revision 2 (REV-01): ${afterRows[0]}`);
await shot(a, 'qc-33-real-2-after-republish');
await visit(a, `/quizzes/${ownQuiz}/play`, playerA);
await a.getByText('Which planet has the Great Red Spot?').waitFor();
check(true, 'a new play opens revision 2');

// 8. History, newest first, from the database (QC-31).
await visit(a, '/me/attempts', playerA);
await a.locator('tbody tr').first().waitFor();
const history = await rows(a, 'tbody tr');
const historyResponse = await call('GET', '/api/me/attempts', undefined, playerA.token);
const ids = historyResponse.body.items.map((i) => String(i.attemptId));
check(JSON.stringify(ids) === JSON.stringify([beforeRepublish, tfAttempt, retake, first]) && history.length === 4,
  `history newest first: ${ids.join(', ')}`);
await shot(a, 'qc-33-real-3-history');

// 9. playerB cannot read playerA's attempt, and does not see it in their own history (QC-25 case 08).
const b = await newPage();
const denied = b.waitForResponse((r) => r.url().endsWith(`/api/attempts/${first}`) && r.status() !== 401);
await visit(b, `/attempts/${first}`, playerB);
check((await denied).status() === 403, `GET /api/attempts/${first} as playerB returned 403`);
await b.getByText('This result belongs to another player.').waitFor();
check(await b.locator('.feedback').count() === 0, 'playerB sees the denial and no feedback');
await shot(b, 'qc-33-real-4-denied');
await visit(b, '/me/attempts', playerB);
await b.getByText('You have not played any quizzes yet.').waitFor();
check(true, "playerB's history is empty");

await browser.close();
console.log(`attempts: first=${first} retake=${retake} trueFalse=${tfAttempt} republication=${beforeRepublish} quiz=${ownQuiz}`);
console.log(failures ? `${failures} check(s) failed` : 'All checks passed');
process.exitCode = failures ? 1 : 0;
