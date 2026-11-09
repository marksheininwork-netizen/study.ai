import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(new URL('..', import.meta.url).pathname);
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
const calculate = (text) => {
  const m = text.match(/(-?\d+)\s*([+−×])\s*(-?\d+)/); assert.ok(m, `math prompt parses: ${text}`);
  return m[2] === '+' ? +m[1] + +m[3] : m[2] === '−' ? Math.abs(+m[1] - +m[3]) : +m[1] * +m[3];
};

for (const viewport of [{ name: 'desktop', width: 1365, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', error => failures.push(`${viewport.name}: ${error.message}`));
  await page.goto(base);
  assert.match(await page.title(), /MindSpark Learning/);
  for (const [id, heading] of products) {
    await clickNav(page, id);
    await page.getByRole('heading', { name: heading }).waitFor();
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

  // Create, reveal, grade and persist a card; export it and restore it on a clean device.
  await clickNav(page, 'cards');
  await page.getByLabel('Question').fill('What is 6 × 7?');
  await page.getByLabel('Answer').fill('42');
  await page.getByLabel('Subject').fill('Math');
  await page.getByRole('button', { name: 'Save card' }).click();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByText('42', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'I knew it' }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('mindspark-learning-v1')).cards[0].reviews), 1);
  const downloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();
  const download = await downloadWait;
  const backupPath = `/tmp/mindspark-${viewport.name}-${Date.now()}.json`;
  await download.saveAs(backupPath);
  const backup = await readFile(backupPath);
  const backupContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const restore = await backupContext.newPage();
  await restore.goto(base);
  await clickNav(restore, 'cards');
  await restore.locator('#importFile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: backup });
  await restore.getByText('What is 6 × 7?', { exact: false }).waitFor();
  assert.equal(await restore.evaluate(() => JSON.parse(localStorage.getItem('mindspark-learning-v1')).cardStats.reviews), 1);

  // Malformed imports give a visible error and do not erase existing data.
  await restore.locator('#importFile').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await restore.getByText(/Import failed/).waitFor();
  assert.equal(await restore.evaluate(() => JSON.parse(localStorage.getItem('mindspark-learning-v1')).cards.length), 1);

  // Legacy Study AI flashcards and recall totals survive migration.
  const migrationContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const migration = await migrationContext.newPage();
  await migration.addInitScript(() => {
    localStorage.setItem('study-ai-cards-v1', JSON.stringify([{ id: 'old-1', q: 'Legacy prompt', a: 'Legacy answer', subject: 'Science', due: 0, interval: 2 }]));
    localStorage.setItem('study-ai-stats-v1', JSON.stringify({ reviews: 9, known: 6 }));
  });
  await migration.goto(base); await clickNav(migration, 'cards');
  await migration.getByText('Legacy prompt').waitFor();
  assert.deepEqual(await migration.evaluate(() => JSON.parse(localStorage.getItem('mindspark-learning-v1')).cardStats), { reviews: 9, known: 6 });
  await backupContext.close(); await migrationContext.close();

  // MathBattle and the games portal accept correct answers and retain results/streaks.
  await clickNav(page, 'math');
  const mathAnswer = calculate(await page.locator('.question').innerText());
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

// Exercise one-time-code auth, guest migration and account isolation with an RLS-like backend double.
const accountContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await accountContext.addInitScript(() => {
  const records = window.__mindsparkRecords = {};
  let current = null; let pending = null;
  const users = { 'a@example.test': { id: 'user-a', email: 'a@example.test' }, 'b@example.test': { id: 'user-b', email: 'b@example.test' } };
  const client = {
    auth: {
      async getSession() { return { data: { session: current ? { user: current } : null }, error: null }; },
      async signInWithOtp({ email }) { pending = email; return { error: null }; },
      async verifyOtp() { current = users[pending]; return { data: { user: current }, error: null }; },
      async signOut() { current = null; return { error: null }; }
    },
    from(table) {
      if (table !== 'mindspark_progress') throw Error('Unexpected table');
      let uid, expectedUpdatedAt, update;
      const query = {
        select() { return this; },
        eq(field, value) { if (field === 'user_id') uid = value; if (field === 'updated_at') expectedUpdatedAt = value; return this; },
        async maybeSingle() { if (!current || current.id !== uid) return { data: null, error: { message: 'RLS denied' } }; return { data: records[uid] || null, error: null }; },
        async insert(record) { if (!current || current.id !== record.user_id) return { error: { message: 'RLS denied' } }; if (records[record.user_id]) return { error: { code: '23505', message: 'duplicate' } }; records[record.user_id] = record; return { error: null }; },
        update(record) { update = record; return this; },
        async selectUpdated() { return null; },
        async then() { return this; }
      };
      query.select = function (fields) { if (update) return { maybeSingle: async () => { if (!current || current.id !== uid) return { data: null, error: { message: 'RLS denied' } }; const row = records[uid]; if (!row || row.updated_at !== expectedUpdatedAt) return { data: null, error: null }; Object.assign(row, update); return { data: { updated_at: row.updated_at }, error: null }; } }; return this; };
      return query;
    }
  };
  window.__MINDSPARK_TEST_SUPABASE_CLIENT__ = client;
});
const account = await accountContext.newPage();
await account.goto(base);
await clickNav(account, 'study');
await account.getByLabel('Task', { exact: true }).fill('Private progress for account A');
await account.getByRole('button', { name: 'Add to my plan' }).click();
await account.getByRole('button', { name: 'Optional account' }).click();
await account.getByLabel('Email address').fill('a@example.test');
await account.getByRole('button', { name: 'Email me a sign-in code' }).click();
await account.getByLabel('Six-digit sign-in code').fill('123456');
await account.getByRole('button', { name: 'Verify and sync' }).click();
await account.getByText('Progress synced securely to your account.').waitFor();
assert.equal(await account.evaluate(() => window.__mindsparkRecords['user-a'].payload.tasks[0].title), 'Private progress for account A');
await account.getByRole('button', { name: 'Sign out' }).click();
await account.getByLabel('Email address').fill('b@example.test');
await account.getByRole('button', { name: 'Email me a sign-in code' }).click();
await account.getByLabel('Six-digit sign-in code').fill('654321');
await account.getByRole('button', { name: 'Verify and sync' }).click();
await account.getByText('Progress synced securely to your account.').waitFor();
assert.equal(await account.evaluate(() => window.__mindsparkRecords['user-b'].payload.tasks.length), 0, 'account B must not receive A private progress');
await account.getByRole('button', { name: 'Sign out' }).click();
await account.getByLabel('Email address').fill('a@example.test');
await account.getByRole('button', { name: 'Email me a sign-in code' }).click();
await account.getByLabel('Six-digit sign-in code').fill('123456');
await account.getByRole('button', { name: 'Verify and sync' }).click();
await account.getByText('Progress synced securely to your account.').waitFor();
assert.equal(await account.evaluate(() => window.mindsparkStore.read().tasks.some(x => x.title === 'Private progress for account A')), true, 'switching back restores account A local state');
assert.deepEqual(await account.evaluate(() => Object.keys(window.__mindsparkRecords).sort()), ['user-a', 'user-b']);
await accountContext.close();

assert.deepEqual(failures, [], `browser console errors: ${failures.join('; ')}`);
await browser.close();
await new Promise((done) => server.close(done));
console.log('Account sign-in, guest migration, cross-account isolation, restore, and desktop/mobile browser interactions passed');
