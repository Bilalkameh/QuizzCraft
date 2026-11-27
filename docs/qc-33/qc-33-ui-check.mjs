// QC-33 UI check: drives the player, result and history screens in headless Edge and saves screenshots.
// Usage: node qc-33-ui-check.mjs <node_modules with playwright-core> <screenshot dir> [base URL] [API base for test controls]
// Against the stand-in API, players are signed in by putting a fake token in localStorage (no sign-in screen yet).
import { createRequire } from 'node:module';

const [, , modulesDir, outDir, base = 'http://127.0.0.1:5173', apiBase = 'http://127.0.0.1:8080'] = process.argv;
const require = createRequire(`${modulesDir}/`);
const { chromium } = require('playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures += 1;
}
const control = (path) => fetch(`${apiBase}${path}`, { method: 'POST' });

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
async function pageAs(token) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (token) await context.addInitScript((t) => window.localStorage.setItem('quizzcraft.token', t), token);
  const page = await context.newPage();
  page.on('response', (r) => {
    if (/\/api\/(quizzes\/\d+\/play|revisions|me|attempts)/.test(r.url())) {
      console.log(`  ${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`);
    }
  });
  return page;
}
const shot = (page, name) => page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
const feedbackRows = async (page) => (await page.locator('.feedback li').allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim());
const attemptIdOf = (page) => page.url().match(/attempts\/(\d+)/)[1];

// 1. Signed out: Start quiz and My history lead to sign-in (ACC-03, QC-25 case 08).
const visitor = await pageAs(null);
await visitor.goto(`${base}/`);
await visitor.getByRole('link', { name: 'Start quiz' }).first().click();
await visitor.getByText('Sign in to play quizzes.').waitFor();
check(true, 'signed out: Start quiz asks for sign-in');
await visitor.goto(`${base}/me/attempts`);
await visitor.getByText('Sign in to see your history.').waitFor();
check(true, 'signed out: My history asks for sign-in');
await visitor.close();

// 2. playerA opens Planets Warm-Up. The play payload has no answer key (PLAY-02, case 01).
const a = await pageAs('playerA-token');
const playResponse = a.waitForResponse((r) => r.url().endsWith('/api/quizzes/101/play'));
await a.goto(`${base}/quizzes/101/play`);
const playBody = await (await playResponse).text();
check(!/isCorrect|correctChoiceId|"correct"|points/.test(playBody), 'play payload contains no answer key or points');
await a.getByText('Question 1 of 3 · No time limit').waitFor();

// 3. Change, clear and skip (PLAY-03, case 03), ending on the worked example: Mercury, True, blank.
await a.getByRole('radio', { name: 'Venus', exact: true }).check();
await a.getByRole('radio', { name: 'Mercury', exact: true }).check();
await a.getByRole('button', { name: 'Next ▶' }).click();
await a.getByRole('radio', { name: 'True', exact: true }).check();
await a.getByRole('button', { name: 'Next ▶' }).click();
await a.getByRole('radio', { name: '8', exact: true }).check();
await a.getByRole('button', { name: 'Clear answer' }).click();
check(!(await a.getByRole('radio', { name: '8', exact: true }).isChecked()), 'Clear answer removes the selection on question 3');
await a.getByRole('button', { name: 'Question 1, answered' }).click();
check(await a.getByRole('radio', { name: 'Mercury', exact: true }).isChecked(), 'jumping back to question 1 keeps the changed answer (Mercury)');
await a.getByRole('button', { name: 'Submit quiz' }).click();
await a.getByText('2 of 3 answered. Unanswered questions score 0. Submit anyway?').waitFor();
check(true, 'blank question triggers the confirmation');
await shot(a, 'qc-33-1-confirm');

const submitRequest = a.waitForRequest((r) => r.url().endsWith('/api/revisions/1001/attempts'));
await a.getByRole('button', { name: 'Submit anyway' }).click();
const sent = JSON.parse((await submitRequest).postData());
check(JSON.stringify(sent) === JSON.stringify({ answers: [
  { questionId: 5001, choiceId: 9002 }, { questionId: 5002, choiceId: 9004 }, { questionId: 5003, choiceId: null },
] }), `request body matches the final screen state: ${JSON.stringify(sent)}`);

// 4. Result 1/3 with per-question feedback (PLAY-01, PLAY-05, case 02).
await a.waitForURL(/\/attempts\/\d+$/);
const firstAttempt = attemptIdOf(a);
await a.getByText('Score 1/3').waitFor();
const firstRows = await feedbackRows(a);
check(firstRows[0].includes('✓') && firstRows[0].includes('Your answer: Mercury')
  && firstRows[1].includes('✗') && firstRows[1].includes('Your answer: True · Correct answer: False')
  && firstRows[2].includes('✗') && firstRows[2].includes('Your answer: blank · Correct answer: 8'),
  `feedback rows: ${firstRows.join(' | ')}`);
await shot(a, 'qc-33-2-result');

// 5. Retake creates a separate attempt (case 07).
await a.getByRole('link', { name: 'Retake' }).click();
await a.getByText('0 of 3 answered').waitFor();
await a.getByRole('radio', { name: 'Mercury', exact: true }).check();
await a.getByRole('button', { name: 'Next ▶' }).click();
await a.getByRole('radio', { name: 'False', exact: true }).check();
await a.getByRole('button', { name: 'Next ▶' }).click();
await a.getByRole('radio', { name: '8', exact: true }).check();
await a.getByRole('button', { name: 'Submit quiz' }).click();
await a.getByText('Score 3/3').waitFor();
const retakeAttempt = attemptIdOf(a);
check(retakeAttempt !== firstAttempt, `retake has its own attempt id (${firstAttempt} then ${retakeAttempt})`);

// 6. A true/false-only quiz works too.
await a.goto(`${base}/quizzes/106/play`);
await a.getByRole('radio', { name: 'True', exact: true }).check();
await a.getByRole('button', { name: 'Next ▶' }).click();
await a.getByRole('radio', { name: 'True', exact: true }).check();
await a.getByRole('button', { name: 'Submit quiz' }).click();
await a.getByText('Score 1/2').waitFor();
const tfAttempt = attemptIdOf(a);
check(true, `true/false-only quiz scored 1/2 (attempt ${tfAttempt})`);

// 7. History, newest first.
await a.goto(`${base}/me/attempts`);
await a.locator('tbody tr').first().waitFor();
const history = (await a.locator('tbody tr').allTextContents()).map((t) => t.replace(/\s+/g, ' '));
check(history.length === 3 && history[0].includes('Stand-in True/False Quiz') && history[1].includes('3/3') && history[2].includes('1/3'),
  `history newest first: ${history.join(' | ')}`);
await shot(a, 'qc-33-3-history');

// 8. Republish, then reopen the first attempt: unchanged (REV-01, case 05/09).
await control('/__republish/101');
await a.goto(`${base}/attempts/${firstAttempt}`);
await a.getByText('Score 1/3').waitFor();
const afterRows = await feedbackRows(a);
check(afterRows[1].includes('Jupiter is a rocky planet.') && JSON.stringify(afterRows) === JSON.stringify(firstRows),
  'first attempt unchanged after republication (still revision 1001 questions and 1/3)');
await a.goto(`${base}/quizzes/101/play`);
await a.getByRole('button', { name: 'Question 2, not answered' }).click();
check(await a.getByText('Saturn is a gas giant.').count() === 1, 'new play opens the republished revision');

// 9. playerB cannot open playerA's attempt and does not see it in their history (case 08).
const b = await pageAs('playerB-token');
await b.goto(`${base}/attempts/${firstAttempt}`);
await b.getByText('This result belongs to another player.').waitFor();
check(await b.locator('.feedback').count() === 0, "playerB sees no feedback for playerA's attempt");
await shot(b, 'qc-33-4-denied');
await b.goto(`${base}/me/attempts`);
await b.getByText('You have not played any quizzes yet.').waitFor();
check(true, "playerA's attempts are absent from playerB's history");

// 10. Removal while playing: 410, nothing saved, history marks it removed (PLAY-06, case 06).
await a.goto(`${base}/quizzes/106/play`);
await a.getByRole('radio', { name: 'True', exact: true }).check();
await control('/__remove/106');
await a.getByRole('button', { name: 'Submit quiz' }).click();
await a.getByRole('button', { name: 'Submit anyway' }).click();
await a.getByText('This quiz was removed while you were playing. Your answers were not saved.').waitFor();
check(await a.getByRole('button', { name: 'Submit quiz' }).isDisabled(), 'submit is disabled after removal');
await shot(a, 'qc-33-5-removed');
await a.goto(`${base}/me/attempts`);
await a.locator('tbody tr').first().waitFor();
const afterRemoval = (await a.locator('tbody tr').allTextContents()).map((t) => t.replace(/\s+/g, ' '));
check(afterRemoval.length === 3 && afterRemoval[0].includes('Removed'), `no attempt saved, removed quiz tagged: ${afterRemoval[0]}`);
await a.goto(`${base}/attempts/${tfAttempt}`);
await a.getByText('Score 1/2').waitFor();
check(true, 'attempt on the removed quiz still opens');

await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'All checks passed');
process.exitCode = failures ? 1 : 0;
