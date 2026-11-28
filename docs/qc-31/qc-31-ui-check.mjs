// QC-31 live check: the QC-33 history and result screens against the real attempt API, in headless Edge.
// Usage: node docs/qc-31/qc-31-ui-check.mjs <node_modules with playwright-core> <screenshot dir> <path to psql>
// Needs Spring Boot on 8080 and `npm.cmd run dev` on 5173. Registers two throwaway accounts, and records sample
// graded attempts with qc-31-sample-attempts.sql because submission (QC-29) is not on master yet.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const [, , modulesDir, outDir, psql, base = 'http://127.0.0.1:5173'] = process.argv;
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

const sql = fileURLToPath(new URL('qc-31-sample-attempts.sql', import.meta.url));
const [firstId, retakeId] = execFileSync(psql, ['-X', '-h', '127.0.0.1', '-p', '55432', '-U', 'quizzcraft', '-d', 'quizzcraft',
  '-v', 'ON_ERROR_STOP=1', '-v', `email=${players.a.email}`, '-At', '-f', sql], { encoding: 'utf8' }).trim().split(' ');
console.log(`Sample attempts for player A: ${firstId} (1/3), ${retakeId} (3/3)`);

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on('response', (r) => {
  const { pathname } = new URL(r.url());
  if (/^\/api\/(me\/attempts|attempts\/)/.test(pathname)) console.log(`  GET ${pathname} -> ${r.status()}`);
});
const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
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

// 1. Player A's history lists both attempts, newest first, with their own scores (REV-02).
await signIn(players.a);
await page.getByRole('link', { name: 'My history' }).click();
await page.locator('table.my-quizzes tbody tr').first().waitFor();
const rows = (await page.locator('table.my-quizzes tbody tr').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
check(rows.length === 2, `history shows 2 attempts: ${JSON.stringify(rows)}`);
check(rows[0]?.includes('3/3') && rows[1]?.includes('1/3'), 'newest first: the 3/3 retake above the 1/3 attempt');
await shot('qc-31-1-history');

// 2. Opening the first attempt shows the saved result and feedback (REV-01).
await page.getByRole('link', { name: 'Open result' }).nth(1).click();
await page.getByText('Score 1/3').waitFor();
check(page.url().endsWith(`/attempts/${firstId}`), `the 1/3 row opens /attempts/${firstId}`);
const feedback = (await page.locator('.feedback li').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
check(feedback.length === 3 && feedback[0].includes('Mercury') && feedback[1].includes('Correct answer: False')
  && feedback[2].includes('blank') && feedback[2].includes('Correct answer: 8'), `feedback: ${JSON.stringify(feedback)}`);
await shot('qc-31-2-result');

// 3. Player B cannot read player A's attempt and has an empty history (REV-03).
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
