// Interface tests: real clicks and key presses in a headless Chromium-based browser.
// Run with: npm run test:ui   (needs Chrome, Edge, Chromium, or Brave; set CHROME_PATH to choose)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../engine.js';
import { browserPath, launchBrowser, startServer } from './browser.mjs';

const skip = browserPath ? false : 'no Chromium-based browser found (set CHROME_PATH)';
let browser, server, origin;
before(async () => {
  if (skip) return;
  ({ server, origin } = await startServer());
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  server?.closeAllConnections();
  server?.close();
});

const today = s => E.dateKey(new Date(), s.settings.timezone);
const strong = () => {
  const s = E.freshState();
  for (const c of E.CATEGORIES) s.xp[c] = 1500;
  s.hp = E.maxHP(s);
  return s;
};
// Each test gets a fresh, isolated page; failures leave a screenshot in tests/ui/artifacts/.
function uiTest(name, fn, options = {}) {
  test(name, { skip }, async () => {
    const page = await browser.newPage({ origin, ...options });
    try {
      await fn(page);
      assert.deepEqual(page.errors, [], 'no errors in the page console');
    } catch (error) {
      const shot = await page.screenshot(name).catch(() => null);
      if (shot) error.message += `\n  screenshot: ${shot}`;
      throw error;
    } finally {
      await page.close();
    }
  });
}

uiTest('loads the dashboard and keeps progress across a reload', async page => {
  await page.open();
  assert.equal(await page.count('#app .task-row'), 3);
  assert.ok(await page.exists('#app .habits-panel'));
  assert.ok(await page.exists('#app .character-panel'));
  await page.waitFor(() => /%$/.test(document.querySelector('#chance-value')?.textContent || ''), { message: 'victory chance computed' });
  await page.click('#app [data-action="toggle-task"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).gold === 4);
  await page.goto('/');
  await page.waitFor(() => !!document.querySelector('#app .topbar'));
  assert.equal((await page.save()).gold, 4);
  assert.equal(await page.count('#app .task-row'), 2);
});

uiTest('completing a task pays gold, moves it to Completed, and Undo reverses it', async page => {
  await page.open();
  await page.click('#app [data-action="toggle-task"]');
  await page.waitFor(() => document.querySelector('#toasts .toast button'));
  assert.equal((await page.save()).gold, 4);
  await page.click('#app [data-action="task-view"][data-view="done"]');
  assert.equal(await page.count('#app .task-row.completed'), 1);
  await page.click('#toasts .toast button');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).gold === 0);
  assert.equal(await page.count('#app .task-row.completed'), 0);
});

uiTest(
  'with motion on, a ticked task animates its check before leaving the list',
  async page => {
    await page.open();
    const id = await page.evaluate(() => document.querySelector('#app [data-action="toggle-task"]').dataset.id);
    await page.click(`#app [data-action="toggle-task"][data-id="${id}"]`);
    assert.ok(await page.exists('#app .task-row.completing'), 'row plays its completing animation');
    assert.ok(await page.count('.burst-particle'), 'sparks fly from the checkbox');
    assert.equal((await page.save()).tasks.find(t => t.id === id).done, false, 'not saved until the animation ends');
    await page.waitFor(id => JSON.parse(localStorage.getItem('twesk.v1')).tasks.find(t => t.id === id).done, { args: [id] });
    assert.ok(await page.count('.flying-coin'), 'coins fly to the purse');
  },
  { reducedMotion: false },
);

uiTest('recurring tasks and #project filters', async page => {
  await page.open();
  const addTask = async (title, repeat = '') => {
    await page.click('#app .tasks-panel [data-action="new-task"]');
    await page.waitFor(() => document.querySelector('#task-form'));
    await page.fill('#task-form [name="title"]', title);
    await page.select('#task-form [name="repeat"]', repeat);
    await page.click('#task-form [type="submit"]');
    await page.waitFor(() => !document.querySelector('#task-form'));
  };
  await addTask('Water the plants #home', 'daily');
  await addTask('Read two papers #thesis');
  // Chips follow the task list (newest first), after "All".
  assert.deepEqual(
    await page.evaluate(() => [...document.querySelectorAll('#app .project-chip')].map(c => c.firstChild.textContent)),
    ['All', '#thesis', '#home'],
  );
  await page.click('#app .project-chip[data-project="#thesis"]');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#app .task-title')].map(t => t.textContent)), ['Read two papers #thesis']);
  await page.click('#app .project-chip[data-project="#thesis"]');
  const plants = await page.evaluate(() => [...document.querySelectorAll('#app .task-row')].find(r => r.textContent.includes('Water')).querySelector('[data-action="toggle-task"]').dataset.id);
  await page.click(`#app [data-action="toggle-task"][data-id="${plants}"]`);
  await page.click('#app [data-action="task-view"][data-view="done"]');
  assert.match(await page.text('#app .task-row.completed .task-meta'), /Every day · back tomorrow/);
  const task = (await page.save()).tasks.find(t => t.id === plants);
  assert.equal(task.repeat, 'daily');
  assert.ok(task.due > today(await page.save()));
});

uiTest(
  'checking a habit keeps the habit list where it was scrolled',
  async page => {
    await page.open();
    for (const c of ['mind', 'soul', 'heart', 'harm']) await page.click(`#app [data-action="category"][data-category="${c}"]`);
    // Scroll the target habit into view first (as the click helper would), then record the position.
    const { id, before } = await page.evaluate(() => {
      const button = document.querySelector('#app .habit-category.heart .habit-complete');
      button.scrollIntoView({ block: 'center' });
      return { id: button.dataset.id, before: document.querySelector('.habits-scroll').scrollTop };
    });
    assert.ok(before > 0, 'the habit list is scrolled at this size');
    await page.click(`#app .habit-complete[data-id="${id}"]`);
    await page.waitFor(id => JSON.parse(localStorage.getItem('twesk.v1')).habits.find(h => h.id === id).logs.length === 1, { args: [id] });
    assert.equal(await page.evaluate(() => document.querySelector('.habits-scroll').scrollTop), before);
  },
  { height: 700 },
);

uiTest('a level-up shows its banner, glowing stat chip, and toast', async page => {
  const s = E.freshState();
  s.xp.soul = 295;
  await page.open({ save: s });
  await page.click('#app [data-action="category"][data-category="soul"]');
  await page.click('#app .habit-category.soul .habit-complete');
  await page.waitFor(() => document.querySelector('.level-banner'));
  assert.match(await page.text('.level-banner'), /Soul · Level 2/);
  assert.ok(await page.exists('.stat-chip.soul.leveled'));
  assert.match(await page.text('#toasts'), /Soul reached level 2/);
});

uiTest('a task can move back to the Vault and return with its settings, with Undo', async page => {
  await page.open();
  const id = await page.evaluate(() => document.querySelector('#app [data-action="edit-task"]').dataset.id);
  await page.click(`#app [data-action="edit-task"][data-id="${id}"]`);
  await page.click('[data-action="task-to-vault"]');
  await page.waitFor(() => !document.querySelector('#task-form'));
  let s = await page.save();
  assert.ok(!s.tasks.some(t => t.id === id));
  const note = s.notes.find(n => n.status === 'inbox' && n.taskTitle);
  assert.ok(note, 'the task is waiting in Needs review');
  await page.click('#toasts .toast button');
  await page.waitFor(id => JSON.parse(localStorage.getItem('twesk.v1')).tasks.some(t => t.id === id), { args: [id] });
  assert.equal((await page.save()).notes.length, 0, 'Undo removes the note again');
  await page.click(`#app [data-action="edit-task"][data-id="${id}"]`);
  await page.click('[data-action="task-to-vault"]');
  await page.press('j', ['Meta']);
  await page.waitFor(() => document.querySelector('.vault-modal'));
  assert.match(await page.text('#vault-results .note-card'), /WAS A TASK/);
  await page.click('#vault-results [data-action="convert-note"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).tasks.length === 3);
  s = await page.save();
  assert.equal(s.tasks[0].title, 'Reply to that email');
  assert.equal(s.tasks[0].tier, 'quick');
});

uiTest('reviewed notes can be selected and downloaded together as one text file', async page => {
  const s = E.freshState();
  for (const [text, created] of [['Plan the garden #home', '2026-10-01T09:00:00Z'], ['Book club ideas\n\nRead slower books', '2026-10-03T09:00:00Z'], ['Unrelated', '2026-10-05T09:00:00Z']]) {
    const { note } = E.saveNote(s, { text }, '2026-10-01');
    note.created = created;
    note.status = 'kept';
  }
  E.saveNote(s, { text: 'Rainy walk, clear head', kind: 'journal' }, '2026-10-02');
  await page.open({ save: s });
  // Capture the downloaded file's text (downloads are blocked during tests).
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = blob => { blob.text().then(t => (window.__exported = t)); return original(blob); };
  });
  await page.press('j', ['Meta']);
  await page.click('[data-action="vault-filter"][data-filter="kept"]');
  await page.click('[data-action="vault-select"]');
  const notes = (await page.save()).notes;
  for (const text of ['Plan the garden', 'Book club']) {
    const id = notes.find(n => n.text.startsWith(text)).id;
    await page.click(`#vault-results article[data-id="${id}"] .note-text`);
  }
  assert.match(await page.text('.vault-select-bar'), /2 selected/);
  assert.equal(await page.count('#vault-results .note-card.selected'), 2);
  await page.click('[data-action="vault-export"]');
  const text = await page.waitFor(() => window.__exported);
  assert.match(text, /^Twesk notes · 2 notes/);
  assert.match(text, /Plan the garden #home\n\n\n\* \* \*\n\n\n.*\n\nBook club ideas\n\nRead slower books\n$/);
  assert.doesNotMatch(text, /Unrelated/);
  await page.click('[data-action="vault-select-done"]');
  assert.ok(await page.exists('#vault-results [data-action="edit-note"]'), 'normal note actions return');
  // The Journal tab offers the same, and exports read as a journal.
  await page.click('[data-action="vault-filter"][data-filter="journal"]');
  await page.click('[data-action="vault-select"]');
  await page.click('[data-action="vault-select-all"]');
  await page.evaluate(() => (window.__exported = null));
  await page.click('[data-action="vault-export"]');
  const journal = await page.waitFor(() => window.__exported);
  assert.match(journal, /^Twesk journal · 1 entry ·/);
  assert.match(journal, /Rainy walk, clear head/);
});

uiTest('quick capture with ⌘K, then one-by-one Vault review with keyboard keys', async page => {
  await page.open();
  for (const text of ['Book flights #trip', 'Idea for chapter two #thesis']) {
    await page.press('k', ['Meta']);
    await page.waitFor(() => document.querySelector('#capture-text') === document.activeElement);
    await page.type(text);
    await page.click('#capture-form [type="submit"]');
    await page.waitFor(() => !document.querySelector('#capture-form'));
  }
  await page.press('j', ['Meta']);
  await page.waitFor(() => document.querySelector('.vault-modal'));
  assert.equal(await page.count('#vault-tags .project-chip'), 2);
  await page.click('[data-action="review-notes"]');
  await page.waitFor(() => document.querySelector('.review-text'));
  assert.equal(await page.text('.review-text'), 'Book flights #trip', 'oldest note first');
  await page.press('t');
  await page.waitFor(() => /chapter two/.test(document.querySelector('.review-text')?.textContent || ''));
  await page.press('k');
  await page.waitFor(() => document.querySelector('.review-done'));
  const s = await page.save();
  assert.ok(s.tasks.some(t => t.title === 'Book flights #trip' && t.inbox));
  assert.deepEqual(s.notes.map(n => n.status).sort(), ['kept', 'kept']);
  await page.press('Escape');
  await page.waitFor(() => !document.querySelector('.modal'));
});

uiTest('the shop compares items, helmets raise HP, tonics activate, and styles can be bought', async page => {
  const s = E.freshState();
  s.gold = 2000;
  await page.open({ save: s });
  await page.click('#app .character-actions [data-action="shop"]');
  await page.click('[data-action="shop-tab"][data-category="helmet"]');
  await page.waitFor(() => [...document.querySelectorAll('[data-odds="with"]')].every(e => /%$/.test(e.textContent)), { message: 'comparison odds filled' });
  assert.match(await page.text('[data-compare="helm"]'), /\+12 max HP vs no helmet/);
  await page.click('[data-action="buy"][data-id="helm"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).equipped.helmet === 'helm');
  assert.equal((await page.save()).hp, 112);
  await page.click('[data-action="shop-tab"][data-category="potion"]');
  await page.click('[data-action="buy"][data-id="swift-tonic"]');
  await page.click('[data-action="use-potion"][data-id="swift-tonic"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).tonic === 'swift-tonic');
  await page.click('[data-action="shop-tab"][data-category="style"]');
  await page.click('[data-action="buy-style"][data-key="accessory"][data-value="glasses"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).appearance.accessory === 'glasses');
  const after = await page.save();
  assert.equal(after.gold, 2000 - 125 - 35 - 60);
  assert.deepEqual(after.wardrobe, ['accessory:glasses']);
});

uiTest('the character studio previews a locked style without saving, then buys it', async page => {
  const s = E.freshState();
  s.gold = 500;
  await page.open({ save: s });
  await page.click('#app [data-action="avatar-open"]');
  await page.click('[data-action="appearance"][data-field="beard"][data-value="full"]');
  await page.waitFor(() => document.querySelector('.style-preview-bar'));
  assert.ok(await page.exists('.avatar-turntable [data-part="beard"]'), 'the model wears the beard');
  assert.equal((await page.save()).appearance.beard, 'none', 'nothing saved while trying on');
  // Unsized SVGs render full-width in some browsers (e.g. Safari), so every gold pile needs a CSS size.
  const bar = await page.evaluate(() => {
    const el = document.querySelector('.style-preview-bar'),
      unsized = [...document.querySelectorAll('.gold-pile')].filter(p => !/px$/.test(getComputedStyle(p).width) || parseFloat(getComputedStyle(p).width) > 60);
    return { height: el.getBoundingClientRect().height, unsized: unsized.length };
  });
  assert.equal(bar.unsized, 0, 'every gold pile has an explicit size');
  assert.ok(bar.height < 80, `the try-on bar stays compact (${bar.height}px)`);
  await page.click('[data-action="buy-preview"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).appearance.beard === 'full');
  assert.equal((await page.save()).gold, 430);
  assert.ok(!(await page.exists('.style-preview-bar')));
});

uiTest('a won fight plays out, celebrates, and pays its loot', async page => {
  await page.open({ save: strong() });
  await page.waitFor(() => /%$/.test(document.querySelector('#chance-value')?.textContent || ''));
  await page.click('#app [data-action="fight"]');
  await page.waitFor(() => document.querySelector('.battle-modal'));
  await page.click('[data-action="skip-battle"]');
  await page.waitFor(() => document.querySelector('.victory-banner'));
  assert.equal(await page.text('#modal-title'), 'Victory!');
  assert.ok(await page.exists('.loot-box'));
  const s = await page.save();
  assert.equal(s.battles.length, 1);
  assert.equal(s.monster.defeatedOn, today(s));
  await page.click('.battle-result [data-action="close-modal"]');
  await page.waitFor(() => /Next opponent arrives tomorrow/.test(document.querySelector('#app .monster-panel')?.textContent || ''));
});

uiTest('the history calendar shows today’s habit and task', async page => {
  await page.open();
  await page.click('#app [data-action="toggle-task"]');
  await page.click('#app .habit-category.body .habit-complete');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).habits.some(h => h.logs.length));
  await page.click('#app [data-action="history"]');
  await page.waitFor(() => document.querySelector('.history-modal'));
  const s = await page.save();
  assert.ok(await page.exists(`.history-day.today.heat-1[data-day="${today(s)}"]`));
  const facts = await page.text('.history-facts');
  assert.match(facts, /1 habit/);
  assert.match(facts, /1 task/);
});

uiTest('export records the backup date; reset and restore round-trip a save', async page => {
  const s = E.freshState();
  s.gold = 321;
  s.name = 'Tester';
  await page.open({ save: s });
  await page.click('.topbar [data-action="settings"]');
  await page.click('#settings-form [data-action="export"]');
  await page.waitFor(() => /today/.test(document.querySelector('#backup-status')?.textContent || ''));
  await page.click('[data-action="reset-progress"]');
  await page.click('.modal [data-action="confirm-reset"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).name === 'Adventurer');
  assert.equal((await page.save()).gold, 0);
  await page.click('.topbar [data-action="settings"]');
  await page.click('[data-action="restore-previous"]');
  await page.click('.modal [data-action="confirm-previous"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).name === 'Tester');
  assert.equal((await page.save()).gold, 321);
});

uiTest('Escape closes dialogs and Tab keeps focus inside them', async page => {
  await page.open();
  await page.click('.topbar [data-action="settings"]');
  await page.waitFor(() => document.querySelector('#settings-form'));
  for (let i = 0; i < 25; i++) await page.press('Tab');
  assert.ok(await page.evaluate(() => document.querySelector('#overlay').contains(document.activeElement)));
  await page.press('Escape');
  await page.waitFor(() => !document.querySelector('.modal'));
});

uiTest(
  'the phone layout has no sideways scrolling, even in the shop',
  async page => {
    await page.open();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.click('#app .character-actions [data-action="shop"]');
    await page.waitFor(() => document.querySelector('.shop-modal'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  },
  { width: 375, height: 812 },
);

uiTest('older saves without newer fields load cleanly', async page => {
  const s = E.freshState();
  delete s.history;
  delete s.wardrobe;
  delete s.tonic;
  s.equipped = { weapon: null, armor: null };
  delete s.appearance.beard;
  delete s.appearance.accessory;
  delete s.settings.lastBackup;
  await page.open({ save: s });
  assert.ok(!(await page.exists('.save-warning')));
  const migrated = await page.save();
  assert.equal(migrated.equipped.helmet, null);
  assert.deepEqual(migrated.wardrobe, []);
});

uiTest('the standalone Twesk.html runs, including its built-in odds worker', async page => {
  await page.open({ path: '/Twesk.html' });
  await page.waitFor(() => /%$/.test(document.querySelector('#chance-value')?.textContent || ''), { message: 'odds from the inline worker' });
  assert.equal(await page.count('script[src]'), 0, 'no external scripts');
  await page.click('#app [data-action="toggle-task"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1'))?.gold === 4);
});
