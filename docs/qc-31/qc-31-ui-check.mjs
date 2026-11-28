// QC-31 live check: play and submit through the real QC-29 API, then read the saved attempts back through the
// QC-33 history and result screens, in headless Edge.
// Usage: node docs/qc-31/qc-31-ui-check.mjs <node_modules with playwright-core> <screenshot dir> [base URL]
// Needs Spring Boot on 8080 and `npm.cmd run dev` on 5173. Registers two throwaway accounts.
import { createRequire } from 'node:module';

const [, , modulesDir, outDir, base = 'http://127.0.0.1:5173'] = process.argv;
const require = createRequire(`${modulesDir}/`);
const { chromium } = require('playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
}

const run = Date.now().toString(36);
const players = {
  a: { email: `history-a-${run}@example.test`, password: `qc31-${run}-a`, displayName: `Player A ${run}` },
  b: { email: `history-b-${run}@example.test`, password: `qc31-${run}-b`, displayName: `Player B ${run}` },
};
for (const player of Object.values(players)) {
  const response = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(player),
  });
  check(response.status === 201, `register ${player.email} → ${response.status}`);
}

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('response', (r) => {
  const { pathname } = new URL(r.url());
  if (/^\/api\/(quizzes\/\d+\/play|revisions\/|me\/attempts|attempts\/)/.test(pathname)) {
    console.log(`  ${r.request().method()} ${pathname} -> ${r.status()}`);
  }
});
const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
const pick = (name) => page.getByRole('radio', { name, exact: true }).check();
const next = () => page.getByRole('button', { name: 'Next ▶' }).click();
const attemptIdOf = () => page.url().match(/attempts\/(\d+)$/)[1];
// Navigate inside the app: a full page load would discard the in-memory session (QC-24).
const openInApp = (path) => page.evaluate((p) => {
  window.history.pushState({}, '', p);
  window.dispatchEvent(new PopStateEvent('popstate'));
}, path);

async function signIn(player) {
  await page.goto(`${base}/signin`);
  await page.getByLabel('Email').fill(player.email);
  await page.getByLabel('Password').fill(player.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('.account-menu').getByText(`Signed in as ${player.displayName}`).waitFor();
}

// 1. Player A plays "Planets Warm-Up": Mercury, True, blank. The saved result is 1/3 (PLAY-01, REV-01).
await signIn(players.a);
await page.locator('.quiz-card', { hasText: 'Planets Warm-Up' }).getByRole('link', { name: 'Start quiz' }).click();
await page.getByText('Question 1 of 3 · No time limit').waitFor();
await pick('Mercury');
await next();
await pick('True');
await next();
await page.getByRole('button', { name: 'Submit quiz' }).click();
await page.getByRole('button', { name: 'Submit anyway' }).click();
await page.waitForURL(/\/attempts\/\d+$/);
await page.getByText('Score 1/3').waitFor();
const firstId = attemptIdOf();
check(true, `submission saved attempt ${firstId} with Score 1/3`);

// 2. Retake with every answer correct: a separate attempt, 3/3 (REV-02).
await page.getByRole('link', { name: 'Retake' }).click();
await page.getByText('Question 1 of 3 · No time limit').waitFor();
await pick('Mercury');
await next();
await pick('False');
await next();
await pick('8');
await page.getByRole('button', { name: 'Submit quiz' }).click();
await page.waitForURL((url) => /\/attempts\/\d+$/.test(url.pathname) && !url.pathname.endsWith(`/${firstId}`));
await page.getByText('Score 3/3').waitFor();
const retakeId = attemptIdOf();
check(retakeId !== firstId, `the retake is a separate attempt (${retakeId})`);

// 3. My history lists both, newest first, and reopens the first with its original feedback.
await page.getByRole('link', { name: 'My history' }).first().click();
await page.locator('table.my-quizzes tbody tr').first().waitFor();
const rows = (await page.locator('table.my-quizzes tbody tr').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
check(rows.length === 2 && rows[0].includes('3/3') && rows[1].includes('1/3'), `history newest first: ${JSON.stringify(rows)}`);
await shot('qc-31-1-history');
await page.getByRole('link', { name: 'Open result' }).nth(1).click();
await page.getByText('Score 1/3').waitFor();
const feedback = (await page.locator('.feedback li').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
check(page.url().endsWith(`/attempts/${firstId}`) && feedback.length === 3 && feedback[0].includes('Mercury')
  && feedback[1].includes('Correct answer: False') && feedback[2].includes('blank') && feedback[2].includes('Correct answer: 8'),
  `attempt ${firstId} reopens with its original feedback: ${JSON.stringify(feedback)}`);
await shot('qc-31-2-result');

// 4. Player B cannot read player A's attempt and has an empty history (REV-03).
await page.locator('.account-menu').getByRole('button', { name: 'Sign out' }).click();
await signIn(players.b);
await openInApp(`/attempts/${firstId}`);
await page.getByText('This result belongs to another player.').waitFor();
check((await page.locator('.feedback li').count()) === 0, "player B sees the 403 message and none of player A's answers");
await shot('qc-31-3-denied');
await page.getByRole('link', { name: 'Go to my history' }).click();
await page.getByText('You have not played any quizzes yet.').waitFor();
check(true, "player B's history is empty");

await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'All checks passed');
process.exit(failures ? 1 : 0);
