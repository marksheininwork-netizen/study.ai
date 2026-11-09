import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(new URL('..', import.meta.url).pathname);
const axeSource = await readFile(resolve(root, 'node_modules/axe-core/axe.min.js'), 'utf8');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (path !== root && !path.startsWith(root + sep)) throw new Error('bad path');
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': mime[extname(path)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await chromium.launch({ headless: true });
const failures = [];
const products = [
  ['study', 'Turn schoolwork into a plan'], ['quiz', 'Practice by subject'],
  ['cards', 'Build memory with active recall'], ['math', 'Beat your personal best'],
  ['essay', 'Revise with a clear next step'], ['focus', 'Make room for focused work'],
  ['academy', 'Stretch your problem-solving'], ['games', 'Quick math streak'],
];
const clickNav = async (page, id) => page.locator(`[data-page="${id}"]:visible`).first().click();
const auditAccessibility = async (page, label) => {
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return result.violations.map(({ id, impact, help, nodes }) => ({ id, impact, help, targets: nodes.map(node => node.target) }));
  });
  assert.deepEqual(violations, [], `${label} WCAG A/AA accessibility violations: ${JSON.stringify(violations)}`);
};
const calculate = (text) => {
  const m = text.match(/(-?\d+)\s*([+−×])\s*(-?\d+)/); assert.ok(m, `math prompt parses: ${text}`);
  return m[2] === '+' ? +m[1] + +m[3] : m[2] === '−' ? +m[1] - +m[3] : +m[1] * +m[3];
};

for (const viewport of [{ name: 'desktop', width: 1365, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', error => failures.push(`${viewport.name}: ${error.message}`));
  await page.goto(base);
  assert.match(await page.title(), /MindSpark Learning/);
  await page.addScriptTag({ content: axeSource });
  for (const [id, heading] of products) {
    await clickNav(page, id);
    await page.getByRole('heading', { name: heading }).waitFor();
    await auditAccessibility(page, `${viewport.name} ${id}`);
  }
  if (viewport.name === 'mobile') {
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(dimensions.scroll <= dimensions.width + 2, `no page-wide horizontal overflow: ${JSON.stringify(dimensions)}`);
  }

  // Study planning persists and can be checked off.
  await clickNav(page, 'study');
  await page.getByLabel('Task', { exact: true }).fill('Review cell structure');
  await page.getByLabel('Subject', { exact: true }).fill('Biology');
  await page.getByRole('button', { name: 'Add to my plan' }).click();
  await page.getByText('Review cell structure').waitFor();
  await page.locator('[data-task="0"]').check();
  await page.reload();
  await clickNav(page, 'study');
  assert.equal(await page.locator('[data-task="0"]').isChecked(), true);

  // Five question quiz and the original contest problem set both score and save attempts.
  await clickNav(page, 'quiz');
  for (let i = 0; i < 5; i++) {
    await page.locator('[data-answer="0"]').click();
    await page.locator('.feedback').waitFor();
    if (i < 4) await page.locator('[data-next="quiz"]').click();
  }
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('mindspark-learning-v1')).quizHistory.length) >= 5);
  await clickNav(page, 'academy');
  await page.locator('[data-answer="1"]').click();
  await page.locator('.feedback').waitFor();
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('mindspark-learning-v1')).academyHistory.length) >= 1);

  // Create a representative backup and restore every exported field into a truly empty guest context.
  await clickNav(page, 'cards');
  await page.getByLabel('Question').fill('What is 6 × 7?');
  await page.getByLabel('Answer').fill('42');
  await page.getByLabel('Subject').fill('Math');
  await page.getByRole('button', { name: 'Save card' }).click();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByText('42', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'I knew it' }).click();
  const fullProgress = {
    cards: [{ id: 'backup-card', q: 'What is 6 × 7?', a: '42', subject: 'Math', due: 1800000000000, interval: 3, reviews: 2, known: 1 }],
    cardStats: { reviews: 7, known: 5 },
    tasks: [{ id: 'backup-task', title: 'Review cells', subject: 'Biology', done: true }],
    quizHistory: [{ id: 'backup-quiz', label: 'Biology quiz', score: '4/5', day: '2026-01-02' }],
    academyHistory: [{ id: 'backup-academy', label: 'Logic challenge', score: '1/1', day: '2026-01-03' }],
    mathHistory: [{ id: 'backup-math', label: 'Integer practice', score: '8/10', day: '2026-01-04' }],
    focusSessions: [{ id: 'backup-focus', label: 'Focus session', minutes: 25, day: '2026-01-05' }],
    gameBest: 9, essayChecks: 4, createdAt: 1767225600000
  };
  await page.evaluate(value => window.mindsparkStore.replace(value), fullProgress);
  const downloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await downloadWait;
  await page.getByRole('link', { name: 'Download MindSpark progress backup' }).waitFor();
  const backupPath = `/tmp/mindspark-${viewport.name}-${Date.now()}.json`;
  await download.saveAs(backupPath);
  const backup = await readFile(backupPath);
  const backupContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const restore = await backupContext.newPage();
  await restore.goto(base);
  assert.deepEqual(await restore.evaluate(() => { const d = window.mindsparkStore.read(); return { cards:d.cards.length,tasks:d.tasks.length,quizHistory:d.quizHistory.length,academyHistory:d.academyHistory.length,mathHistory:d.mathHistory.length,focusSessions:d.focusSessions.length,gameBest:d.gameBest,essayChecks:d.essayChecks,cardStats:d.cardStats }; }), { cards:0,tasks:0,quizHistory:0,academyHistory:0,mathHistory:0,focusSessions:0,gameBest:0,essayChecks:0,cardStats:{reviews:0,known:0} }, 'new context starts as an empty guest workspace');
  await clickNav(restore, 'cards');
  await restore.locator('#importFile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await restore.waitForFunction(() => document.querySelector('#importStatus')?.textContent.includes('merged safely'));
  assert.deepEqual(await restore.evaluate(() => window.mindsparkStore.read()), fullProgress, 'all exported fields restore exactly into an empty guest context');

  // Re-imports are idempotent, while valid partial backups preserve other supported progress.
  await restore.locator('#importFile').setInputFiles({ name: 'backup-again.json', mimeType: 'application/json', buffer: backup });
  await restore.waitForFunction(() => document.querySelector('#importStatus')?.textContent.includes('merged safely'));
  assert.deepEqual(await restore.evaluate(() => window.mindsparkStore.read()), fullProgress, 'repeated backup does not duplicate records');
  const partial = { product: 'MindSpark Learning', version: 1, data: { tasks: [{ id: 'partial-task', title: 'Practice fractions', subject: 'Math', done: false }], gameBest: 12 } };
  await restore.locator('#importFile').setInputFiles({ name: 'partial.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(partial)) });
  await restore.waitForFunction(() => document.querySelector('#importStatus')?.textContent.includes('merged safely'));
  const merged = await restore.evaluate(() => window.mindsparkStore.read());
  assert.equal(merged.tasks.length, 2, 'partial lists append unique IDs');
  assert.equal(merged.gameBest, 12, 'partial counters keep the greater value');
  assert.deepEqual({ ...merged, tasks: fullProgress.tasks, gameBest: fullProgress.gameBest }, fullProgress, 'omitted fields and existing progress are retained');

  // Older Study AI backup version zero remains importable as a partial card backup.
  const oldBackup = { product: 'Study AI', version: 0, data: { cards: [{ id: 'old-version-card', q: 'Legacy prompt', a: 'Legacy answer', subject: 'Science', due: 0, interval: 1, reviews: 0, known: 0 }], cardStats: { reviews: 3, known: 2 } } };
  await restore.locator('#importFile').setInputFiles({ name: 'old-version.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(oldBackup)) });
  await restore.waitForFunction(() => document.querySelector('#importStatus')?.textContent.includes('merged safely'));
  assert.equal((await restore.evaluate(() => window.mindsparkStore.read())).cards.length, 2);
  assert.equal((await restore.evaluate(() => window.mindsparkStore.read())).cardStats.reviews, 7, 'older stats merge monotonically');

  // Malformed, duplicated, unsupported, and structurally partial imports leave existing state untouched.
  const snapshot = await restore.evaluate(() => window.mindsparkStore.read());
  const invalidBackups = [
    ['malformed.json', Buffer.from('{broken')],
    ['duplicate.json', Buffer.from(JSON.stringify({ product:'MindSpark Learning',version:1,data:{ cards:[oldBackup.data.cards[0],oldBackup.data.cards[0]] } }))],
    ['future-version.json', Buffer.from(JSON.stringify({ product:'MindSpark Learning',version:2,data:{ tasks:[] } }))],
    ['partial-invalid.json', Buffer.from(JSON.stringify({ product:'MindSpark Learning',version:1,data:{ tasks:'not-a-list' } }))],
    ['unknown-field.json', Buffer.from(JSON.stringify({ product:'MindSpark Learning',version:1,data:{ tasks:[],privateNotes:'unsupported' } }))]
  ];
  for (const [name, buffer] of invalidBackups) {
    await restore.locator('#importFile').setInputFiles({ name, mimeType: 'application/json', buffer });
    await restore.waitForFunction(() => document.querySelector('#importStatus')?.textContent.startsWith('Import failed:'));
    assert.deepEqual(await restore.evaluate(() => window.mindsparkStore.read()), snapshot, `${name} preserves all existing progress`);
  }
  // A file read interrupted by the browser must fail atomically as well.
  await restore.evaluate(() => {
    const read = File.prototype.text;
    File.prototype.text = function() {
      return this.name === "interrupted.json" ? Promise.reject(new Error("Backup read was interrupted.")) : read.call(this);
    };
  });
  await restore.locator('#importFile').setInputFiles({ name: 'interrupted.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ product:'MindSpark Learning',version:1,data:{ tasks:[{ id:'interrupted-task',title:'Must not be applied',done:false }] } })) });
  await restore.waitForFunction(() => document.querySelector('#importStatus')?.textContent.includes('Import failed: Backup read was interrupted.'));
  assert.deepEqual(await restore.evaluate(() => window.mindsparkStore.read()), snapshot, 'an interrupted backup read preserves every existing field');
  await restore.evaluate(() => { delete File.prototype.text; });

  const atLimit = { ...snapshot, tasks: Array.from({ length: 1000 }, (_, index) => ({ id: `limit-${index}`, title: `Task ${index}`, done: false })) };
  await restore.evaluate(value => window.mindsparkStore.replace(value), atLimit);
  await restore.locator('#importFile').setInputFiles({ name: 'over-limit-partial.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ product:'MindSpark Learning',version:1,data:{ tasks:[{ id:'overflow-task',title:'Must not be dropped' }] } })) });
  await restore.waitForFunction(() => document.querySelector('#importStatus')?.textContent.includes('1,000-item limit'));
  assert.deepEqual(await restore.evaluate(() => window.mindsparkStore.read()), atLimit, 'imports exceeding the supported list size are rejected without truncating existing or incoming records');

  // Legacy Study AI flashcards and recall totals survive migration.
  const migrationContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const migration = await migrationContext.newPage();
  await migration.addInitScript(() => {
    localStorage.setItem('study-ai-cards-v1', JSON.stringify([{ id: 'old-1', q: 'Legacy prompt', a: 'Legacy answer', subject: 'Science', due: 0, interval: 2 }]));
    localStorage.setItem('study-ai-stats-v1', JSON.stringify({ reviews: 9, known: 6 }));
  });
  await migration.goto(base); await clickNav(migration, 'cards');
  await migration.getByText('Legacy prompt').first().waitFor();
  assert.deepEqual(await migration.evaluate(() => JSON.parse(localStorage.getItem('mindspark-learning-v1')).cardStats), { reviews: 9, known: 6 });
  await migration.reload(); await clickNav(migration, 'cards');
  await migration.getByText('Legacy prompt').first().waitFor();
  await backupContext.close(); await migrationContext.close();

  // MathBattle and the games portal accept correct answers and retain results/streaks.
  await page.evaluate(() => { const values = [13 / 18, 17 / 18, 0.5]; Math.random = () => values.shift() ?? 0; });
  await clickNav(page, 'math');
  assert.equal(await page.locator('.question').innerText(), '15 − 19 = ?');
  const mathAnswer = calculate(await page.locator('.question').innerText());
  assert.equal(mathAnswer, -4, 'MathBattle subtraction preserves negative answers');
  await page.getByLabel('Your answer').fill(String(mathAnswer)); await page.getByRole('button', { name: 'Check answer' }).click();
  await page.getByText('Correct — nice work.').waitFor();
  await page.waitForTimeout(800);
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('mindspark-learning-v1')).mathHistory.length) >= 1);
  await clickNav(page, 'games');
  const gameAnswer = calculate(await page.locator('#gamePrompt').innerText());
  await page.getByLabel('Your answer').fill(String(gameAnswer)); await page.getByRole('button', { name: 'Check' }).click();
  await page.getByText('Correct! Keep the streak going.').waitFor();
  assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('mindspark-learning-v1')).gameBest) >= 1);

  // EssayCoach remains local and gives concrete revision prompts.
  await clickNav(page, 'essay');
  await page.getByLabel('Draft excerpt').fill('Schools should offer more plant-based lunches because they can expand student choice. For example, students may find options that match their needs.');
  await page.getByRole('button', { name: 'Review my draft' }).click();
  await page.getByRole('heading', { name: 'Revision checklist' }).waitFor();
  assert.match(await page.locator('#essayResult').innerText(), /Automated surface checks can miss meaning/);

  // Timer continues across product navigation and records a completed ten-minute session.
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await clickNav(page, 'focus');
  await page.locator('#focusLength').selectOption('10');
  await page.getByRole('button', { name: 'Start focus' }).click();
  await clickNav(page, 'study');
  await page.clock.fastForward(10 * 60 * 1000);
  await clickNav(page, 'focus');
  await page.getByText(/Session complete/).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mindspark-learning-v1')).focusSessions.at(-1).minutes), 10);
  assert.equal(await page.locator('#timerDisplay').innerText(), '00:00');
  await page.getByRole('button', { name: 'Start focus' }).waitFor();
  await context.close();
  console.log(`${viewport.name}: navigation, persistence, quizzes, flashcards, math, writing, games, timer, migration, and backups passed`);
}

// Exercise age-gated Clerk login, guest migration, account switching and per-account progress isolation.
const accountContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const browserRecords = {};
let failNextProgressWrite = false;
await accountContext.addInitScript(() => {
  let current = null;
  const listeners = [];
  const users = {
    a: { id: 'user-a' },
    b: { id: 'user-b' }
  };
  const notify = () => listeners.forEach(listener => listener({ user: current }));
  const auth = {
    get user() { return current; },
    session: { async getToken() { return current ? 'test-session-' + current.id : null; } },
    addListener(listener) { listeners.push(listener); },
    mountSignIn(element) {
      if (auth.failNextMount) { auth.failNextMount = false; throw new Error('Simulated Clerk sign-in component load failure'); }
      element.innerHTML = '<button type="button" id="testUserA">Test account A</button><button type="button" id="testUserB">Test account B</button>';
      element.querySelector('#testUserA').addEventListener('click', () => { current = users.a; notify(); });
      element.querySelector('#testUserB').addEventListener('click', () => { current = users.b; notify(); });
    },
    async signOut() { current = null; notify(); }
  };
  auth.failNextMount = false;
  window.__MINDSPARK_TEST_AUTH__ = auth;
});
const account = await accountContext.newPage();
await account.route('**/api/progress', async route => {
  const request = route.request();
  const auth = request.headers()['authorization'] || '';
  const match = /^Bearer test-session-(user-[ab])$/.exec(auth);
  if (!match) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Sign in required' }) });
  const userId = match[1];
  if (request.method() === 'GET') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ record: browserRecords[userId] || null }) });
  if (request.method() === 'DELETE') { delete browserRecords[userId]; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ deleted: true }) }); }
  const input = JSON.parse(request.postData() || '{}');
  if (request.method() !== 'PUT') return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'Method not allowed' }) });
  if (failNextProgressWrite) {
    failNextProgressWrite = false;
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Staging sync unavailable' }) });
  }
  const current = browserRecords[userId] || null;
  if ((!current && input.baseVersion !== 0) || (current && current.version !== input.baseVersion)) {
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ conflict: true, record: current }) });
  }
  const version = (current?.version || 0) + 1;
  browserRecords[userId] = { payload: input.payload, version, updatedAt: new Date().toISOString() };
  return route.fulfill({ status: current ? 200 : 201, contentType: 'application/json', body: JSON.stringify({ record: browserRecords[userId] }) });
});
await account.route('**/api/account', async route => {
  const request = route.request();
  const auth = request.headers()['authorization'] || '';
  const match = /^Bearer test-session-(user-[ab])$/.exec(auth);
  if (!match) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Sign in required' }) });
  delete browserRecords[match[1]];
  return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ deleted: true, progressDeleted: true, identityDeleted: true }) });
});
await account.goto(base);
await clickNav(account, 'study');
await account.getByLabel('Task', { exact: true }).fill('Private progress for account A');
await account.getByRole('button', { name: 'Add to my plan' }).click();
await account.getByRole('button', { name: 'Optional account' }).click();
await account.addScriptTag({ content: axeSource });
await auditAccessibility(account, 'account dialog');
assert.equal(await account.evaluate(() => document.activeElement === document.querySelector('#accountDialog button[aria-label="Close account dialog"]')), true, 'dialog moves keyboard focus inside on open');
await account.keyboard.press('Shift+Tab');
assert.equal(await account.locator('#accountDialog').evaluate(dialog => dialog.contains(document.activeElement)), true, 'dialog contains focus when tabbing backward from its first control');
await account.keyboard.press('Tab');
assert.equal(await account.locator('#accountDialog').evaluate(dialog => dialog.contains(document.activeElement)), true, 'dialog contains focus when tabbing forward from its last control');
await account.keyboard.press('Escape');
assert.equal(await account.evaluate(() => document.activeElement.id), 'accountOpen', 'closing dialog returns focus to opener');
await account.getByRole('button', { name: 'Optional account' }).click();
await account.getByRole('button', { name: 'Continue with secure sign-in' }).click();
await account.getByText(/Cloud accounts are currently for people age 16 or older/).waitFor();
await account.getByRole('checkbox', { name: /at least 16 years old/ }).check();
await account.evaluate(() => { window.__MINDSPARK_TEST_AUTH__.failNextMount = true; });
await account.getByRole('button', { name: 'Continue with secure sign-in' }).click();
await account.getByText('Simulated Clerk sign-in component load failure').waitFor();
assert.equal(await account.evaluate(() => window.__MINDSPARK_TEST_AUTH__.user), null, 'a failed sign-in component load keeps guest mode and does not create a user');
await account.getByRole('button', { name: 'Continue with secure sign-in' }).click();
await account.getByRole('button', { name: 'Test account A' }).click();
await account.getByText('Progress synced securely to your account.').waitFor();
assert.equal(browserRecords['user-a'].payload.tasks[0].title, 'Private progress for account A', 'guest data migrates into account A');
await account.getByRole('button', { name: 'Close account dialog' }).click();
// Simulate a transient server error during an ordinary local save, then recover without losing the device copy.
failNextProgressWrite = true;
await account.getByLabel('Task', { exact: true }).fill('Retry after a sync outage');
await account.getByLabel('Subject', { exact: true }).fill('Science');
await account.getByRole('button', { name: 'Add to my plan' }).click();
await account.waitForTimeout(1400);
await account.getByText(/Sync paused: Staging sync unavailable/).waitFor();
assert.equal(await account.evaluate(() => window.mindsparkStore.read().tasks.some(task => task.title === 'Retry after a sync outage')), true, 'a transient sync error never discards local progress');
await account.evaluate(() => window.mindsparkAccount.sync());
await account.getByText('Progress synced securely to your account.').waitFor();
assert.ok(browserRecords['user-a'].payload.tasks.some(task => task.title === 'Retry after a sync outage'), 'retry after recovery syncs the preserved local edit');
await account.getByRole('button', { name: 'Optional account' }).click();
await account.getByRole('button', { name: 'Sign out' }).click();
await account.getByText('Guest learner').waitFor();
await account.getByRole('button', { name: 'Continue with secure sign-in' }).click();
await account.getByRole('button', { name: 'Test account B' }).click();
await account.getByText('Progress synced securely to your account.').waitFor();
assert.equal(browserRecords['user-b'].payload.tasks.length, 0, 'account B must not receive A private progress');
await account.getByRole('button', { name: 'Sign out' }).click();
await account.getByRole('button', { name: 'Continue with secure sign-in' }).click();
await account.getByRole('button', { name: 'Test account A' }).click();
await account.getByText('Progress synced securely to your account.').waitFor();
assert.equal(await account.evaluate(() => window.mindsparkStore.read().tasks.some(x => x.title === 'Private progress for account A')), true, 'switching back restores only account A local state');
assert.deepEqual(Object.keys(browserRecords).sort(), ['user-a', 'user-b']);
const cancelDelete = account.waitForEvent('dialog');
const cancelDeleteClick = account.getByRole('button', { name: 'Delete my account and progress' }).click();
(await cancelDelete).dismiss();
await cancelDeleteClick;
assert.equal(browserRecords['user-a'].payload.tasks[0].title, 'Private progress for account A', 'canceling typed confirmation preserves account and progress');
const acceptDelete = account.waitForEvent('dialog');
const acceptDeleteClick = account.getByRole('button', { name: 'Delete my account and progress' }).click();
(await acceptDelete).accept('DELETE');
await acceptDeleteClick;
await account.getByText('Your account and cloud progress were deleted. You are signed out; guest mode is ready.').waitFor();
assert.equal(browserRecords['user-a'], undefined, 'confirmed deletion removes the account progress row');
assert.deepEqual(Object.keys(browserRecords), ['user-b'], 'other account progress is untouched');
assert.equal(await account.evaluate(() => window.mindsparkStore.read().tasks.length), 0, 'deleted account data is cleared from the current browser');
assert.equal(await account.evaluate(() => localStorage.getItem('mindspark-sync-owner')), null, 'the current browser session is detached from the deleted identity');
await accountContext.close();

assert.deepEqual(failures, [], `browser console errors: ${failures.join('; ')}`);
await browser.close();
await new Promise((done) => server.close(done));
console.log('Account sign-in, guest migration, cross-account isolation, restore, and desktop/mobile browser interactions passed');
