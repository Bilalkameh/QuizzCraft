// QC-24 UI check: drives registration, sign-in and sign-out in headless Edge against the live API (QC-21).
// Usage: node docs/qc-24/qc-24-ui-check.mjs <node_modules with playwright-core> <screenshot dir> [base URL]
// Needs Spring Boot on 8080 and `npm.cmd run dev` on 5173. Each run registers a new throwaway account.
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
const email = `playera-${run}@example.test`;
const password = `qc24-${run}-pass`;
const displayName = `playerA ${run}`;

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('response', (r) => {
  const { pathname } = new URL(r.url());
  if (!pathname.startsWith('/api/')) return;
  const bearer = r.request().headers().authorization?.startsWith('Bearer ') ? ' (Bearer)' : '';
  console.log(`  ${r.request().method()} ${pathname} -> ${r.status()}${bearer}`);
});
const shot = (name) => page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
const bar = page.locator('.account-menu');
const storageIsEmpty = async () => {
  const [local, session] = await page.evaluate(() => [localStorage.length, sessionStorage.length]);
  return local === 0 && session === 0 && (await context.cookies()).length === 0;
};
const apiResponse = (path, method = 'GET') =>
  page.waitForResponse((r) => new URL(r.url()).pathname === path && r.request().method() === method);

console.log(`Run ${run}: registering ${email}`);

// 1. Signed out, the catalog is browsable and the top bar offers sign-in (ACC-03).
await page.goto(`${base}/`);
await page.getByRole('link', { name: 'Start quiz' }).first().waitFor();
check((await page.locator('.quiz-card').count()) > 0, 'signed out: the catalog lists published quizzes');
check(await bar.getByRole('link', { name: 'Sign in' }).isVisible(), 'signed out: the top bar shows Sign in and Register');
const signedOutBar = (await page.locator('.top-bar').boundingBox()).height;

// 2. Protected actions lead to sign-in, showing the reason from the screen (ACC-03).
const play401 = apiResponse('/api/quizzes/101/play');
await page.locator('.quiz-card', { hasText: 'Planets Warm-Up' }).getByRole('link', { name: 'Start quiz' }).click();
check((await play401).status() === 401, 'signed out: GET /api/quizzes/101/play returns 401');
await page.getByText('Sign in to play quizzes.').waitFor();
check(new URL(page.url()).pathname === '/signin', 'signed out: Start quiz leads to /signin with "Sign in to play quizzes."');
await shot('qc-24-1-signin-required');

await page.getByRole('link', { name: 'My history' }).click();
await page.getByText('Sign in to see your history.').waitFor();
check(new URL(page.url()).pathname === '/signin', 'signed out: My history leads to /signin with "Sign in to see your history."');

// 3. Register from there. The new account is signed in and returned to My history (ACC-01).
await page.locator('.auth-switch').getByRole('link', { name: 'Register' }).click();
await page.getByRole('heading', { name: 'Create an account' }).waitFor();
await page.getByLabel('Display name').fill(displayName);
await page.getByLabel('Email').fill(email);
await page.getByLabel('Password').fill(password);
const registered = apiResponse('/api/auth/register', 'POST');
const historyRequest = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/me/attempts');
await page.getByRole('button', { name: 'Create account' }).click();
const registerBody = await (await registered).json();
check((await registered).status() === 201 && registerBody.role === 'USER', `register returns 201 with role ${registerBody.role}`);
await bar.getByText(`Signed in as ${displayName}`).waitFor();
check(new URL(page.url()).pathname === '/me/attempts', 'after registering: signed in and back on /me/attempts');
const sentHistory = await historyRequest;
check(sentHistory.headers().authorization?.startsWith('Bearer '), 'the protected request carries the Bearer token');
check((await sentHistory.response()).status() !== 401, `the token is accepted (status ${(await sentHistory.response()).status()}, history API pending QC-31)`);
check(await storageIsEmpty(), 'the token is kept in memory: no localStorage, sessionStorage or cookies');
await shot('qc-24-2-registered');

// 4. Sign out discards the token; protected screens ask again.
await bar.getByRole('button', { name: 'Sign out' }).click();
await bar.getByRole('link', { name: 'Sign in' }).waitFor();
check(new URL(page.url()).pathname === '/', 'sign out: back on the catalog with Sign in in the top bar');
const mine401 = apiResponse('/api/my/quizzes');
await page.getByRole('link', { name: 'My quizzes' }).click();
const mine = await mine401;
check(mine.status() === 401 && !mine.request().headers().authorization, 'after sign out: GET /api/my/quizzes is sent without a token and returns 401');
await page.getByText('Sign in to make quizzes.').waitFor();
check(true, 'after sign out: My quizzes leads to sign-in');

// 5. Registering the same email again shows EMAIL_TAKEN (ACC-01).
await bar.getByRole('link', { name: 'Register' }).click();
await page.getByLabel('Display name').fill('Duplicate');
await page.getByLabel('Email').fill(`  ${email.toUpperCase()} `);
await page.getByLabel('Password').fill(password);
const duplicate = apiResponse('/api/auth/register', 'POST');
await page.getByRole('button', { name: 'Create account' }).click();
const duplicateBody = await (await duplicate).json();
await page.getByText('An account with this email already exists.').waitFor();
check((await duplicate).status() === 409 && duplicateBody.error === 'EMAIL_TAKEN', 'same email (other case, spaces) returns 409 EMAIL_TAKEN and the message is shown');
await shot('qc-24-3-email-taken');

// 6. Denied sign-in: one generic error and no token (ACC-02).
await page.getByRole('link', { name: 'Catalog', exact: true }).click();
await bar.getByRole('link', { name: 'Sign in' }).click();
await page.getByRole('heading', { name: 'Sign in' }).waitFor();
await page.getByLabel('Email').fill(email);
await page.getByLabel('Password').fill('wrong-password');
let denied = apiResponse('/api/auth/login', 'POST');
await page.getByRole('button', { name: 'Sign in' }).click();
const deniedBody = await (await denied).json();
await page.getByText('Email or password is incorrect.').waitFor();
check((await denied).status() === 401 && deniedBody.error === 'INVALID_CREDENTIALS', 'wrong password returns 401 INVALID_CREDENTIALS and shows one generic error');
check(new URL(page.url()).pathname === '/signin' && (await bar.getByRole('link', { name: 'Sign in' }).isVisible()), 'denied: still signed out on /signin');
check((await page.getByLabel('Password').inputValue()) === '' && (await storageIsEmpty()), 'denied: password field cleared and no token stored');
await shot('qc-24-4-denied-signin');

await page.getByLabel('Email').fill(`nobody-${run}@example.test`);
await page.getByLabel('Password').fill(password);
denied = apiResponse('/api/auth/login', 'POST');
await page.getByRole('button', { name: 'Sign in' }).click();
check((await denied).status() === 401, 'unknown email also returns 401');
check((await page.getByRole('alert').textContent()) === 'Email or password is incorrect.', 'unknown email shows the same message, so neither field is revealed');

// 7. Successful sign-in returns to the catalog in the signed-in state (ACC-01).
await page.getByLabel('Email').fill(email);
await page.getByLabel('Password').fill(password);
const ok = apiResponse('/api/auth/login', 'POST');
await page.getByRole('button', { name: 'Sign in' }).click();
const okBody = await (await ok).json();
check((await ok).status() === 200 && okBody.user?.email === email && typeof okBody.token === 'string', 'correct password returns 200 with a token and the same user');
await bar.getByText(`Signed in as ${displayName}`).waitFor();
check(new URL(page.url()).pathname === '/', 'signed in: back on the catalog, the top bar shows the display name and Sign out');
await page.locator('.quiz-card').first().waitFor();
const signedInBar = (await page.locator('.top-bar').boundingBox()).height;
check(signedInBar === signedOutBar, `the top bar keeps its height when signed in (${signedOutBar}px → ${signedInBar}px)`);
await shot('qc-24-5-signed-in');

// 8. Signed in, Start quiz no longer leads to sign-in.
const playSigned = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/quizzes/101/play');
await page.locator('.quiz-card', { hasText: 'Planets Warm-Up' }).getByRole('link', { name: 'Start quiz' }).click();
const playRequest = await playSigned;
const playStatus = (await playRequest.response()).status();
await page.waitForTimeout(300);
check(playRequest.headers().authorization?.startsWith('Bearer ') && playStatus !== 401 && new URL(page.url()).pathname === '/quizzes/101/play',
  `signed in: Start quiz stays on the player with the token (status ${playStatus}, play API pending QC-29)`);

// 9. A page reload discards the in-memory token (contract §1).
await page.goto(`${base}/`);
await bar.getByRole('link', { name: 'Sign in' }).waitFor();
check(true, 'reload: the session is gone and the top bar shows Sign in again');

await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'All checks passed');
process.exit(failures ? 1 : 0);
