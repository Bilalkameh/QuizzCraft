// QC-23 UI check: drives the real catalog in headless Edge and saves screenshots.
import { createRequire } from 'node:module';

const [, , modulesDir, outDir] = process.argv;
const require = createRequire(`${modulesDir}/`);
const { chromium } = require('playwright-core');

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ALL = ['Planets Warm-Up', 'Rivers and Mountains', 'Fractions Challenge'];

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const requests = [];
page.on('request', (r) => { if (r.url().includes('/api/')) requests.push(r.url().replace(/^https?:\/\/[^/]+/, '')); });

const titles = () => page.locator('.quiz-card h3').allTextContents();
async function expectTitles(expected, label) {
  await page.waitForFunction(
    (n) => !document.querySelector('[aria-busy="true"]') && document.querySelectorAll('.quiz-card').length === n,
    expected.length,
  );
  const actual = await titles();
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: ${actual.join(', ') || '(none)'}`);
  if (!ok) process.exitCode = 1;
}
async function step(label, fn) {
  const before = requests.length;
  await fn();
  await page.waitForLoadState('networkidle');
  console.log(`  request: ${requests.slice(before).join(' ; ') || '(none)'}`);
  console.log(`  -- ${label}`);
}

await page.goto('http://127.0.0.1:5173/');
await expectTitles(ALL, 'no filters');
const firstCard = await page.locator('.quiz-card').first().innerText();
console.log(`  first card text: ${firstCard.replace(/\s+/g, ' ')}`);
await page.screenshot({ path: `${outDir}/qc-23-1-all.png`, fullPage: true });

await step('Science + Easy + True/false', async () => {
  await page.selectOption('#category-filter', { label: 'Science' });
  await page.getByRole('radio', { name: 'Easy' }).check();
  await page.getByRole('radio', { name: 'True / false' }).check();
});
await expectTitles(['Planets Warm-Up'], 'Science + Easy + True/false (CAT-02)');
const draftShown = await page.getByText('Moon Basics').count();
console.log(`${draftShown ? 'FAIL' : 'PASS'} draft "Moon Basics" absent (CAT-05)`);
if (draftShown) process.exitCode = 1;
await page.screenshot({ path: `${outDir}/qc-23-2-match.png`, fullPage: true });

await step('Clear filters (sidebar)', () => page.locator('.filters').getByRole('button', { name: 'Clear filters' }).click());
await expectTitles(ALL, 'after Clear filters');

await step('Science + Hard', async () => {
  await page.selectOption('#category-filter', { label: 'Science' });
  await page.getByRole('radio', { name: 'Hard' }).check();
});
await page.getByText('No quizzes match these filters.').waitFor();
await expectTitles([], 'Science + Hard empty state (CAT-04)');
console.log('PASS empty message "No quizzes match these filters." shown');
await page.screenshot({ path: `${outDir}/qc-23-3-empty.png`, fullPage: true });

await step('Clear filters (empty state)', () => page.locator('.results').getByRole('button', { name: 'Clear filters' }).click());
await expectTitles(ALL, 'after empty-state Clear filters');

await browser.close();
