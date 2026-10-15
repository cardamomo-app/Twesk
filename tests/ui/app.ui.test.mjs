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
    // Read all three in one step, inside the ~430 ms animation window, so a slow machine cannot miss it.
    const moment = await page.evaluate(id => ({
      completing: !!document.querySelector('#app .task-row.completing'),
      sparks: document.querySelectorAll('.burst-particle').length,
      saved: JSON.parse(localStorage.getItem('twesk.v1')).tasks.find(t => t.id === id).done,
    }), id);
    assert.ok(moment.completing, 'row plays its completing animation');
    assert.ok(moment.sparks, 'sparks fly from the checkbox');
    assert.equal(moment.saved, false, 'not saved until the animation ends');
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
    await page.click(`#task-form .task-repeat-choice:has([name="repeat"][value="${repeat}"])`);
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
  assert.equal(await page.text('#app .task-row.completed .task-meta'), 'back tomorrow');
  assert.equal(await page.evaluate(() => document.querySelector('#app .task-row.completed .task-meta').title), 'Repeats every day · back tomorrow');
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

uiTest(
  'redrawing the dashboard keeps the monster’s idle float smooth (no restart jump)',
  async page => {
    await page.open();
    await page.click('#app [data-action="category"][data-category="harm"]');
    // Wait until the float is mid-cycle, where a restart would visibly snap it down.
    await page.waitFor(() => {
      const a = document.querySelector('#app .monster-art').getAnimations()[0];
      return a && a.currentTime % 5000 > 1500 && a.currentTime % 5000 < 3500;
    }, { timeout: 8000 });
    const result = await page.evaluate(() => {
      const offset = () => new DOMMatrix(getComputedStyle(document.querySelector('#app .monster-art')).transform).m42;
      const before = offset(), old = document.querySelector('#app .monster-art');
      document.querySelector('#app [data-action="harm"]').click();
      return { replaced: old !== document.querySelector('#app .monster-art'), before, after: offset() };
    });
    assert.ok(result.replaced, 'the monster was redrawn');
    assert.ok(result.before < -1, `mid-float before the redraw (${result.before}px)`);
    assert.ok(Math.abs(result.after - result.before) < 0.5, `float continues: ${result.before}px → ${result.after}px`);
  },
  { reducedMotion: false },
);

uiTest('focus restores 1 HP per minute: credited as it passes, kept on reset, and paid when the task is done', async page => {
  const s = E.freshState();
  s.hp = 60;
  E.setCurrentQuest(s, s.tasks[0].id);
  const id = s.tasks[0].id;
  await page.open({ save: s });
  // Icon-only controls; reset waits until there is something to reset.
  assert.equal(await page.text('[data-action="quest-play"]'), '');
  assert.ok(await page.evaluate(() => document.querySelector('[data-action="quest-reset"]').disabled));
  assert.match(await page.evaluate(() => document.querySelector('[data-focus-meter]').getAttribute('aria-label')), /restores up to 25 HP · 60 of 100 HP/);
  // A session already 3½ minutes in (as after a reload) credits 3 HP.
  const running = elapsed => ({ taskId: id, minutes: 25, remainingMs: 25 * 60000, endAt: Date.now() + (25 - elapsed) * 60000, status: 'running', credited: 0 });
  await page.evaluate(t => localStorage.setItem('twesk.quest-timer.v1', JSON.stringify(t)), running(3.5));
  await page.goto('/');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).hp === 63, { message: '3 minutes credited' });
  assert.equal(await page.evaluate(() => document.querySelector('[data-action="quest-play"]').getAttribute('aria-label')), 'Pause focus timer');
  // Reset keeps the HP and starts the clock over, without crediting again.
  await page.click('[data-action="quest-reset"]');
  assert.equal(await page.text('[data-clock]'), '25:00');
  await new Promise(r => setTimeout(r, 700));
  assert.equal((await page.save()).hp, 63, 'no minute is credited twice');
  // Completing the adventure mid-session still pays out the minutes focused.
  await page.evaluate(t => { t.credited = 0; localStorage.setItem('twesk.quest-timer.v1', JSON.stringify(t)); }, running(5.2));
  await page.goto('/');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).hp === 68);
  await page.evaluate(t => localStorage.setItem('twesk.quest-timer.v1', JSON.stringify({ ...t, credited: 5 })), running(7.1));
  await page.goto('/');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).hp === 70, { message: 'two more minutes' });
  await page.click(`.quest-card [data-action="toggle-task"][data-id="${id}"]`);
  await page.waitFor(id => JSON.parse(localStorage.getItem('twesk.v1')).tasks.find(t => t.id === id).done, { args: [id] });
  await new Promise(r => setTimeout(r, 900));
  assert.equal((await page.save()).hp, 70, 'finishing the task keeps HP exact');
  // Never above maximum HP.
  const full = E.freshState();
  full.hp = 99;
  E.setCurrentQuest(full, full.tasks[0].id);
  await page.open({ save: full });
  await page.evaluate(t => localStorage.setItem('twesk.quest-timer.v1', JSON.stringify(t)), { ...running(10), taskId: full.tasks[0].id });
  await page.goto('/');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).hp === 100);
  await new Promise(r => setTimeout(r, 700));
  assert.equal((await page.save()).hp, 100);
  assert.match(await page.evaluate(() => document.querySelector('[data-focus-meter]').getAttribute('aria-label')), /^Full health/);
});

// Press on one element, move in small steps (as a hand would), and release over another.
async function dragTo(page, from, to, { after = false } = {}) {
  const point = (sel, below) => page.evaluate((sel, below) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: below ? r.bottom - 4 : r.top + r.height / 2 };
  }, sel, below);
  const a = await point(from), b = await point(to, after);
  await page.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y });
  await page.cmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 12; i++)
    await page.cmd('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + ((b.x - a.x) * i) / 12, y: a.y + ((b.y - a.y) * i) / 12, button: 'left', buttons: 1 });
  await new Promise(r => setTimeout(r, 120));
  await page.cmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
}

uiTest('the adventure task drags back to the list when its timer is not running', async page => {
  const s = E.freshState();
  s.hp = 60;
  const [first, second, third] = s.tasks;
  E.setCurrentQuest(s, second.id);
  await page.open({ save: s });
  // While the timer runs there is no grip to drag.
  await page.click('[data-action="quest-play"]');
  assert.ok(!(await page.exists('[data-quest-grip]')), 'no grip while the timer runs');
  // Pause after 2½ minutes of focus; now it can go back, and those minutes still count.
  await page.evaluate(id => {
    const t = { taskId: id, minutes: 25, remainingMs: 22.5 * 60000, endAt: null, status: 'paused', credited: 0 };
    localStorage.setItem('twesk.quest-timer.v1', JSON.stringify(t));
  }, second.id);
  await page.goto('/');
  await page.waitFor(() => document.querySelector('[data-quest-grip]'));
  await dragTo(page, '[data-quest-grip]', `#app .task-list [data-task-id="${third.id}"]`, { after: true });
  await page.waitFor(id => !JSON.parse(localStorage.getItem('twesk.v1')).tasks.find(t => t.id === id).pinned, { args: [second.id] });
  const saved = await page.save();
  assert.deepEqual(saved.tasks.map(t => t.id), [first.id, third.id, second.id], 'dropped after the task it was released on');
  assert.ok(!(await page.exists('.quest-task')), 'the adventure box is empty again');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).hp === 62, { message: 'the focused minutes were credited' });
});

uiTest('a habit drags onto the adventure, reorders in its category, and leaves the box once done', async page => {
  const s = E.freshState();
  const [first, second] = s.habits.filter(h => h.category === 'mind'), harm = s.habits.find(h => h.category === 'harm');
  await page.open({ save: s });
  assert.equal(await page.text('#quest-heading'), 'Adventure');
  await page.click('#app [data-action="category"][data-category="mind"]');
  await page.click('#app [data-action="category"][data-category="harm"]');
  // Reorder within the category: the second habit goes before the first.
  await dragTo(page, `[data-habit-grip][data-id="${second.id}"]`, `#app [data-habit-id="${first.id}"]`);
  await page.waitFor(([a, b]) => { const ids = JSON.parse(localStorage.getItem('twesk.v1')).habits.map(h => h.id); return ids.indexOf(b) < ids.indexOf(a); }, { args: [[first.id, second.id]] });
  // Harm habits can be reordered but never become an adventure.
  await dragTo(page, `[data-habit-grip][data-id="${harm.id}"]`, '.quest-card');
  await new Promise(r => setTimeout(r, 200));
  assert.ok(!(await page.exists('.quest-task')), 'a Harm habit is not an adventure');
  // A positive habit becomes the adventure by dragging its icon, without completing it; its row notes it.
  await dragTo(page, `[data-habit-drag][data-id="${first.id}"]`, '.quest-card');
  await page.waitFor(() => document.querySelector('.quest-task.quest-habit'));
  await new Promise(r => setTimeout(r, 200));
  assert.equal((await page.save()).habits.find(h => h.id === first.id).logs.length, 0, 'dragging the icon does not complete the habit');
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#app .task-item .task-grip')).opacity), '0', 'task grips hide until hover');
  assert.equal(await page.text('.quest-habit .quest-title'), first.title);
  assert.match(await page.text('.quest-habit .xp-badge'), /^\+\d+ XP$/);
  assert.match(await page.text(`#app [data-habit-id="${first.id}"] .habit-name small`), /On your adventure/);
  assert.equal((await page.save()).habits.find(h => h.id === first.id).pinned, true);
  // Its icon completes it: XP is earned and the box empties.
  await page.click('.quest-habit-check');
  await page.waitFor(id => JSON.parse(localStorage.getItem('twesk.v1')).habits.find(h => h.id === id).logs.length === 1, { args: [first.id] });
  await page.waitFor(() => !document.querySelector('.quest-task'));
  assert.equal((await page.save()).habits.find(h => h.id === first.id).pinned, undefined);
  // A plain click on a row's icon still completes that habit.
  await page.click(`[data-habit-drag][data-id="${second.id}"]`);
  await page.waitFor(id => JSON.parse(localStorage.getItem('twesk.v1')).habits.find(h => h.id === id).logs.length === 1, { args: [second.id] });
});

uiTest('adventure steps open and close inside the box, and repeats sit beside the gold', async page => {
  const s = E.freshState();
  const quest = s.tasks[0];
  quest.steps = [{ id: 'a', title: 'First step', done: false }, { id: 'b', title: 'Second step', done: false }];
  E.setCurrentQuest(s, quest.id);
  E.saveTask(s, { title: 'Water the plants', tier: 'quick', repeat: 'daily' }, E.dateKey(new Date(), s.settings.timezone));
  await page.open({ save: s });
  assert.ok(!(await page.exists('.beta')), 'no "Early days" label beside the logo');
  // The repeat schedule sits on the title's line, beside the gold.
  const row = await page.evaluate(() => {
    const meta = [...document.querySelectorAll('#app .task-row .task-meta')][0], reward = meta.closest('.task-side').querySelector('.task-reward');
    const a = meta.getBoundingClientRect(), b = reward.getBoundingClientRect();
    return { text: meta.textContent, sameLine: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 4, before: a.right <= b.left };
  });
  assert.deepEqual(row, { text: 'Every day', sameLine: true, before: true });
  // Steps start collapsed in the box, open in place, and can be ticked there.
  assert.ok(await page.evaluate(() => document.querySelector('.quest-steps').hidden));
  await page.click('.quest-card [data-action="task-steps"]');
  await page.waitFor(() => document.querySelector('.quest-card.steps-open .quest-steps:not([hidden])'));
  assert.ok(!(await page.exists('.modal')), 'no separate dialog');
  await page.click('.quest-steps input[data-step-id="a"]');
  await page.waitFor(id => JSON.parse(localStorage.getItem('twesk.v1')).tasks.find(t => t.id === id).steps[0].done, { args: [quest.id] });
  assert.match(await page.text('.quest-card .quest-step-summary'), /1\/2 steps/);
  await page.click('.quest-card [data-action="task-steps"]');
  await page.waitFor(() => !document.querySelector('.quest-card.steps-open'));
});

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
  assert.ok(!(await page.exists('#vault-download .vault-download')), 'no download button until a note is selected');
  const notes = (await page.save()).notes;
  const card = text => `#vault-results article[data-id="${notes.find(n => n.text.startsWith(text)).id}"]`;
  // Clicking a note's empty space or text selects it; its own buttons keep working normally.
  await page.click(`${card('Plan the garden')} .note-text`);
  await page.click(`${card('Book club')} .note-top`);
  assert.equal(await page.count('#vault-results .note-card.selected'), 2);
  assert.equal(await page.text('#vault-download .vault-download'), '2');
  await page.click(`${card('Unrelated')} .note-text`);
  await page.click(`${card('Unrelated')} .note-text`);
  assert.equal(await page.count('#vault-results .note-card.selected'), 2, 'a second click deselects');
  await page.click('#vault-download .vault-download');
  const text = await page.waitFor(() => window.__exported);
  assert.match(text, /^Twesk notes · 2 notes/);
  assert.match(text, /Plan the garden #home\n\n\n\* \* \*\n\n\n.*\n\nBook club ideas\n\nRead slower books\n$/);
  assert.doesNotMatch(text, /Unrelated/);
  await page.click(`${card('Unrelated')} [data-action="pin-note"]`);
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).notes.some(n => n.pinned));
  assert.ok(!(await page.exists(`${card('Unrelated')}.selected`)), 'buttons inside a note do not select it');
  // The Journal tab works the same way, with Space on a focused card, and exports read as a journal.
  await page.click('[data-action="vault-filter"][data-filter="journal"]');
  assert.ok(!(await page.exists('#vault-download .vault-download')), 'changing tabs clears the selection');
  await page.evaluate(() => { window.__exported = null; document.querySelector('#vault-results .note-card.selectable').focus(); });
  await page.press(' ');
  assert.equal(await page.count('#vault-results .note-card.selected'), 1);
  await page.click('#vault-download .vault-download');
  const journal = await page.waitFor(() => window.__exported);
  assert.match(journal, /^Twesk journal · 1 entry ·/);
  assert.match(journal, /Rainy walk, clear head/);
});

uiTest('Select all picks only the notes shown, so one hashtag can be exported', async page => {
  const s = E.freshState();
  for (const text of ['Seeds to order #garden', 'Compost notes #garden', 'Book list', 'Shed paint colors #garden #home']) {
    const { note } = E.saveNote(s, { text }, '2026-10-01');
    note.status = 'kept';
  }
  await page.open({ save: s });
  await page.evaluate(() => {
    const original = URL.createObjectURL;
    URL.createObjectURL = blob => { blob.text().then(t => (window.__exported = t)); return original(blob); };
  });
  await page.press('j', ['Meta']);
  await page.click('[data-action="vault-filter"][data-filter="kept"]');
  const bookList = (await page.save()).notes.find(n => n.text === 'Book list').id;
  await page.click(`#vault-results article[data-id="${bookList}"] .note-text`);
  await page.click('#vault-tags [data-tag="#garden"]');
  assert.equal(await page.count('#vault-results .note-card'), 3);
  assert.ok(!(await page.exists('#vault-download .vault-download')), 'a selection hidden by the filter is dropped');
  await page.click('[data-action="vault-select-all"]');
  assert.equal(await page.count('#vault-results .note-card.selected'), 3);
  assert.equal(await page.text('#vault-download .vault-download'), '3');
  assert.equal(await page.text('[data-action="vault-select-all"]'), 'Deselect all');
  await page.click('#vault-download .vault-download');
  const text = await page.waitFor(() => window.__exported);
  assert.match(text, /^Twesk notes · 3 notes/);
  assert.doesNotMatch(text, /Book list/);
  await page.click('[data-action="vault-select-all"]');
  assert.equal(await page.count('#vault-results .note-card.selected'), 0, 'Deselect all clears the shown notes');
});

uiTest('selected notes merge into one with paragraph breaks, and Undo restores them', async page => {
  const s = E.freshState();
  for (const [text, created] of [['Paint the shed #garden', '2026-10-01T09:00:00Z'], ['Use the sage green #garden', '2026-10-02T09:00:00Z'], ['Separate thought', '2026-10-03T09:00:00Z']]) {
    const { note } = E.saveNote(s, { text }, '2026-10-01');
    note.created = created;
    note.status = 'kept';
  }
  await page.open({ save: s });
  await page.press('j', ['Meta']);
  await page.click('[data-action="vault-filter"][data-filter="kept"]');
  const notes = (await page.save()).notes;
  const card = text => `#vault-results article[data-id="${notes.find(n => n.text.startsWith(text)).id}"]`;
  await page.click(`${card('Paint the shed')} .note-text`);
  assert.ok(!(await page.exists('.vault-merge')), 'merge needs at least two notes');
  await page.click(`${card('Use the sage')} .note-text`);
  assert.match(await page.evaluate(() => document.querySelector('.vault-merge').getAttribute('aria-label')), /Merge 2 selected notes into one/);
  await page.click('.vault-merge');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).notes.length === 2);
  const merged = (await page.save()).notes.find(n => n.text.startsWith('Paint'));
  assert.equal(merged.text, 'Paint the shed\n\nUse the sage green #garden');
  assert.equal(await page.count('#vault-results .note-card.selected'), 0, 'the selection clears after merging');
  await page.click('#toasts .toast button');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).notes.length === 3);
});

uiTest('hashtags autocomplete in task titles and captured notes', async page => {
  const s = E.freshState();
  E.saveTask(s, { title: 'Draft outline #thesis', tier: 'quick' }, '2026-10-01');
  E.saveNote(s, { text: 'Garden plan #home' }, '2026-10-01');
  await page.open({ save: s });
  // Task title: suggestions from tasks and notes; Enter accepts instead of submitting.
  await page.click('#app .tasks-panel [data-action="new-task"]');
  await page.waitFor(() => document.querySelector('#task-form [name="title"]') === document.activeElement);
  await page.type('Read papers #th');
  await page.waitFor(() => document.querySelector('.tag-suggest'));
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.tag-option span')].map(o => o.textContent)), ['#thesis']);
  await page.press('Enter');
  assert.equal(await page.evaluate(() => document.querySelector('#task-form [name="title"]').value), 'Read papers #thesis ');
  assert.ok(await page.exists('#task-form'), 'Enter picked the tag instead of submitting');
  // Escape closes the suggestions first, then the dialog.
  await page.type('#h');
  await page.waitFor(() => document.querySelector('.tag-suggest'));
  await page.press('Escape');
  assert.ok(!(await page.exists('.tag-suggest')));
  assert.ok(await page.exists('#task-form'), 'the dialog stays open');
  await page.press('Escape');
  await page.waitFor(() => !document.querySelector('.modal'));
  // Captured note: click a suggestion; the word count sees the change.
  await page.press('k', ['Meta']);
  await page.waitFor(() => document.querySelector('#capture-text') === document.activeElement);
  await page.type('Ideas for the #ho');
  await page.click('.tag-option');
  assert.equal(await page.evaluate(() => document.querySelector('#capture-text').value), 'Ideas for the #home ');
  assert.equal(await page.text('#word-count'), '4 words');
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
  await page.click('[data-action="shop-tab"][data-category="armor"]');
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#shop-items .shop-group')].map(h => h.textContent)), ['Body armor', 'Shields', 'Helmets', 'Boots'], 'worn gear shares one tab, grouped');
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

uiTest(
  'delights play over the dashboard, balloons pop, Escape ends one, and drift lasts the day',
  async page => {
    const s = E.freshState();
    s.supplies = { balloons: 1, treat: 1, drift: 2, disco: 1 };
    await page.open({ save: s });
    const openDelights = async () => {
      await page.click('#app .character-actions [data-action="inventory"]');
      await page.click('[data-action="shop-tab"][data-category="delight"]');
    };
    await openDelights();
    assert.equal(await page.text('[data-action="use-delight"][data-id="treat"]'), 'Needs a companion');
    await page.click('[data-action="use-delight"][data-id="balloons"]');
    await page.waitFor(() => !document.querySelector('.modal') && document.querySelectorAll('.balloon').length === 14);
    assert.equal((await page.save()).supplies.balloons, 0);
    await page.waitFor(() => [...document.querySelectorAll('.balloon')].some(b => b.getBoundingClientRect().top < innerHeight - 60), { message: 'a balloon has risen into view' });
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('.balloon')].find(b => b.getBoundingClientRect().top < innerHeight - 60);
      b.dataset.target = '1';
    });
    await page.click('.balloon[data-target="1"]', { moving: true });
    assert.equal(await page.count('.balloon'), 13, 'a clicked balloon pops');
    await page.press('Escape');
    assert.ok(!(await page.exists('#delight-layer')), 'Escape ends the delight');
    await openDelights();
    await page.click('[data-action="use-delight"][data-id="disco"]');
    await page.waitFor(() => document.querySelector('.disco-ball') && document.body.classList.contains('disco-dancing'));
    const dancing = await page.evaluate(() =>
      ['#app .avatar-scene svg.avatar-art', '#app .monster-scene .monster-art'].map(sel => getComputedStyle(document.querySelector(sel)).animationName),
    );
    assert.deepEqual(dancing, ['dance', 'monster-dance'], 'the character and the monster both dance');
    await page.click('#app [data-action="toggle-task"]');
    await page.waitFor(() => getComputedStyle(document.querySelector('#app .monster-scene .monster-art')).animationName === 'monster-dance', { message: 'still dancing after a redraw' });
    await page.press('Escape');
    assert.ok(!(await page.evaluate(() => document.body.classList.contains('disco-dancing'))), 'the dance stops with the party');
    await openDelights();
    await page.click('[data-action="use-delight"][data-id="drift"]');
    await page.waitFor(() => document.querySelector('#ambience i'));
    await page.goto('/');
    await page.waitFor(() => document.querySelector('#ambience i'), { message: 'drift continues after a reload' });
    await openDelights();
    assert.equal(await page.text('[data-action="use-delight"][data-id="drift"]'), 'Drifting today', 'one drift per day');
    assert.ok(await page.evaluate(() => document.querySelector('[data-action="use-delight"][data-id="drift"]').disabled));
  },
  { reducedMotion: false },
);

uiTest('with Reduce motion, a delight becomes a gentle glow', async page => {
  const s = E.freshState();
  s.supplies = { fireworks: 1 };
  await page.open({ save: s });
  await page.click('#app .character-actions [data-action="inventory"]');
  await page.click('[data-action="shop-tab"][data-category="delight"]');
  await page.click('[data-action="use-delight"][data-id="fireworks"]');
  await page.waitFor(() => document.querySelector('#delight-layer.gentle'));
  assert.equal(await page.count('.rocket, .spark'), 0);
});

uiTest('pet hats are sold in the Pets tab and show on the companion', async page => {
  const s = E.freshState();
  s.gold = 500;
  s.inventory = ['fox'];
  s.activePet = 'fox';
  await page.open({ save: s });
  const bare = await page.evaluate(() => document.querySelector('#app .pet-companion').innerHTML);
  await page.click('#app .character-actions [data-action="shop"]');
  await page.click('[data-action="shop-tab"][data-category="pet"]');
  assert.equal(await page.count('.shop-item.pethat'), 4);
  assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#shop-items .shop-group')].map(h => h.textContent)), ['Companions', 'Pet hats']);
  await page.click('[data-action="buy"][data-id="party-hat"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).petHat === 'party-hat');
  assert.match(await page.evaluate(() => document.querySelector('#app .pet-companion').getAttribute('aria-label')), /Fern fox companion wearing a party hat/);
  assert.notEqual(await page.evaluate(() => document.querySelector('#app .pet-companion').innerHTML), bare, 'the hat is drawn');
  await page.click('[data-action="equip"][data-id="party-hat"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).petHat === null);
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

uiTest('shields and boots are sold with armor, and powered fights replay with their effects', async page => {
  // A won fight with an axe stagger and a raised shield, made with the real rules.
  const base = strong();
  base.gold = 5000;
  for (const id of ['frostbite', 'thornwall', 'windstep']) E.buy(base, id);
  let save = null;
  for (let seed = 1; !save && seed < 500; seed++) {
    let x = seed;
    const rng = () => ((x = (Math.imul(1664525, x) + 1013904223) >>> 0), x / 4294967296);
    const trial = structuredClone(base), r = E.fight(trial, today(trial), rng);
    if (r.won && r.events.some(e => e.type === 'stagger') && r.events.some(e => e.shieldBlock !== undefined)) save = trial;
  }
  assert.ok(save, 'found a fight with both powers');
  await page.open({ save });
  assert.match(await page.evaluate(() => document.querySelector('#app .avatar-art').getAttribute('aria-label')), /holding an axe and a shield/);
  await page.click('#app [data-action="replay-battle"]');
  await page.waitFor(() => document.querySelector('.battle-modal'));
  await page.click('[data-action="skip-battle"]');
  await page.waitFor(() => document.querySelector('.combat-history[open]'));
  const log = await page.text('.combat-history');
  assert.match(log, /Frozen!/);
  assert.match(log, /Thornwall shield raised/);
  await page.click('.battle-result [data-action="close-modal"]');
  // Shop: the Boots tab sells boots; buying fills the empty slot.
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('twesk.v1')); s.equipped.boots = null; s.inventory = s.inventory.filter(id => id !== 'windstep'); localStorage.setItem('twesk.v1', JSON.stringify(s)); });
  await page.goto('/');
  await page.click('#app .character-actions [data-action="shop"]');
  await page.click('[data-action="shop-tab"][data-category="armor"]');
  await page.waitFor(() => document.querySelector('#shop-tab-armor[aria-selected="true"]'));
  await page.click('[data-action="buy"][data-id="trailboots"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).equipped.boots === 'trailboots');
});

uiTest('buying keeps the shop where it was, and dragging right turns the character the other way', async page => {
  const s = E.freshState();
  s.gold = 3000;
  await page.open({ save: s });
  // Dragging to the right lowers the model's angle (it used to raise it).
  const angle = () => page.evaluate(() => Number(document.querySelector('#app .avatar-art').dataset.angle));
  const before = await angle();
  await dragTo(page, '#app .avatar-scene', '#app .character-panel .wallet');
  assert.ok((await angle()) < before, 'dragging right turns the model the other way');
  // Buy the last item in a long tab: the dialog stays scrolled to it.
  await page.goto('/');
  await page.click('#app .character-actions [data-action="shop"]');
  await page.click('[data-action="shop-tab"][data-category="armor"]');
  await page.waitFor(() => document.querySelector('#shop-tab-armor[aria-selected="true"]'));
  await page.evaluate(() => document.querySelector('[data-action="buy"][data-id="windstep"]').scrollIntoView({ block: 'center' }));
  const top = await page.evaluate(() => document.querySelector('#overlay .modal').scrollTop);
  assert.ok(top > 300, 'scrolled well down');
  await page.click('[data-action="buy"][data-id="windstep"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).equipped.boots === 'windstep');
  await page.waitFor(() => document.querySelector('[data-action="buy"][data-id="windstep"]')?.disabled);
  assert.equal(await page.evaluate(() => document.querySelector('#overlay .modal').scrollTop), top, 'the shop stays on the item just bought');
});

uiTest('the dial winds back toward 0 as a session runs, and starting one sets off with a sound', async page => {
  // Record every audio context the page makes, to watch the sound engine recover.
  await page.cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: `{const A=window.AudioContext;window.__audio=[];window.AudioContext=class extends A{constructor(...a){super(...a);window.__audio.push(this);}};}`,
  });
  const s = E.freshState();
  E.setCurrentQuest(s, s.tasks[0].id);
  await page.open({ save: s });
  const knob = () => page.evaluate(() => Number(document.querySelector('[data-dial-hand]').getAttribute('transform').match(/rotate\(([-\d.]+)/)[1]));
  assert.equal(await knob(), -135 + (25 / 60) * 270, 'ready: the knob shows the chosen 25 minutes');
  await page.click('[data-action="quest-play"]');
  await page.waitFor(() => window.__audio.length === 1 && window.__audio[0].state === 'running', { message: 'set-off sound played' });
  // Halfway through: the knob has wound back to 12.5 minutes.
  await page.evaluate(id => localStorage.setItem('twesk.quest-timer.v1', JSON.stringify({ taskId: id, minutes: 25, remainingMs: 25 * 60000, endAt: Date.now() + 12.5 * 60000, status: 'running', credited: 0 })), s.tasks[0].id);
  await page.goto('/');
  await page.waitFor(() => document.querySelector('.quest-card.is-walking'));
  await new Promise(r => setTimeout(r, 700));
  assert.ok(Math.abs((await knob()) - (-135 + (12.5 / 60) * 270)) < 1, 'running: the knob shows the time remaining');
});

uiTest('sounds come back after the audio is paused, interrupted by another tab, or the output device changes', async page => {
  await page.cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: `{const A=window.AudioContext;window.__audio=[];window.AudioContext=class extends A{constructor(...a){super(...a);window.__audio.push(this);}};}`,
  });
  const s = E.freshState();
  E.setCurrentQuest(s, s.tasks[0].id);
  await page.open({ save: s });
  await page.click('[data-action="quest-play"]');
  await page.waitFor(() => window.__audio[0]?.state === 'running');
  // The system pauses audio (as after sleep); the next click brings it back.
  await page.evaluate(() => window.__audio[0].suspend());
  await page.waitFor(() => window.__audio[0].state === 'suspended');
  await page.click('[data-action="quest-play"]');
  await page.waitFor(() => window.__audio[0].state === 'running', { message: 'resumed on the next click' });
  // A new output device: the next click builds a fresh audio engine.
  await page.evaluate(() => navigator.mediaDevices.dispatchEvent(new Event('devicechange')));
  await page.click('[data-action="quest-play"]');
  await page.waitFor(() => window.__audio.length === 2 && window.__audio[1].state === 'running' && window.__audio[0].state === 'closed', { message: 'rebuilt for the new output' });
  // Another tab holds the audio and a resume is refused: the following click builds a fresh engine.
  await page.evaluate(async () => { const a = window.__audio[1]; await a.suspend(); a.resume = () => Promise.reject(new Error('interrupted')); });
  await page.click('[data-action="quest-play"]');
  await new Promise(r => setTimeout(r, 800));
  await page.click('[data-action="quest-play"]');
  await page.waitFor(() => window.__audio.length === 3 && window.__audio[2].state === 'running', { message: 'rebuilt after a refused resume' });
});

uiTest('an HP minute chime recovers refused Safari audio without another interaction', async page => {
  await page.cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: `{const A=window.AudioContext;window.__audio=[];window.__voices=0;window.AudioContext=class extends A{constructor(...a){super(...a);window.__audio.push(this);}createOscillator(){const o=super.createOscillator(),start=o.start.bind(o);o.start=(...a)=>{window.__voices++;return start(...a)};return o;}};}`,
  });
  const s = E.freshState(); s.hp = 80; E.setCurrentQuest(s, s.tasks[0].id);
  await page.open({ save: s }); await page.click('[data-action="quest-play"]');
  await page.waitFor(() => window.__audio[0]?.state === 'running');
  const before = await page.evaluate(() => window.__voices);
  await page.evaluate(async id => {
    const a = window.__audio[0]; await a.suspend(); a.resume = () => Promise.reject(new Error('interrupted'));
    const clock = JSON.parse(localStorage.getItem('twesk.quest-timer.v1'));
    clock.endAt = Date.now() + 24 * 60000; clock.credited = 0;
    const value = JSON.stringify(clock); localStorage.setItem('twesk.quest-timer.v1', value);
    window.dispatchEvent(new StorageEvent('storage', { key: 'twesk.quest-timer.v1', newValue: value }));
  }, s.tasks[0].id);
  // No click or key press: the scheduled minute itself must recover and produce sound.
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).hp === 81);
  await page.waitFor(n => window.__audio.length === 2 && window.__audio[1].state === 'running' && window.__voices > n, { args: [before], message: 'minute chime played after automatic audio recovery' });
});

uiTest('adjusting the duration winds the timer, but a running countdown does not', async page => {
  await page.cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: `{const A=window.AudioContext;window.__voices=0;window.AudioContext=class extends A{createOscillator(){const o=super.createOscillator(),start=o.start.bind(o);o.start=(...a)=>{window.__voices++;return start(...a)};return o;}};}`,
  });
  const s = E.freshState(); E.setCurrentQuest(s, s.tasks[0].id); await page.open({ save: s });
  await page.evaluate(() => document.querySelector('.quest-dial').focus());
  await page.press('ArrowRight');
  await page.waitFor(() => window.__voices > 0, { message: 'dial notch produced a sound' });
  assert.equal(await page.evaluate(() => document.querySelector('.quest-dial').getAttribute('aria-valuenow')), '30');
  await page.click('[data-action="quest-play"]');
  const voices = await page.evaluate(() => window.__voices);
  await new Promise(r => setTimeout(r, 1100));
  assert.equal(await page.evaluate(() => window.__voices), voices, 'countdown is quiet between HP chimes');
  await page.click('[data-action="quest-play"]');
  await page.click('[data-action="mute"]');
  await page.evaluate(() => document.querySelector('.quest-dial').focus());
  await page.press('ArrowLeft');
  assert.equal(await page.evaluate(() => window.__voices), voices, 'muting also silences winding');
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

uiTest('F and the top-bar button go full screen and back, but not while typing', async page => {
  await page.open();
  assert.ok(await page.exists('[data-action="fullscreen"]'), 'the button shows on desktop');
  await page.press('f');
  await page.waitFor(() => document.fullscreenElement === document.documentElement);
  await page.waitFor(() => document.querySelector('[data-action="fullscreen"]').getAttribute('aria-pressed') === 'true');
  await page.press('f');
  await page.waitFor(() => !document.fullscreenElement);
  await page.click('[data-action="fullscreen"]');
  await page.waitFor(() => document.fullscreenElement);
  await page.click('[data-action="fullscreen"]');
  await page.waitFor(() => !document.fullscreenElement);
  // Typing an F in a field is just a letter.
  await page.press('k', ['Meta']);
  await page.waitFor(() => document.activeElement?.matches('#overlay textarea, #overlay input'), { message: 'the capture field has focus' });
  await page.press('f');
  await new Promise(r => setTimeout(r, 200));
  assert.ok(!(await page.evaluate(() => document.fullscreenElement)), 'no full screen while typing');
});

uiTest(
  'the full-screen button is hidden on phones',
  async page => {
    await page.open();
    assert.ok(await page.evaluate(() => { const b = document.querySelector('[data-action="fullscreen"]'); return !b || getComputedStyle(b).display === 'none'; }));
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

uiTest('once installed, the app opens and saves with no server or network', async page => {
  await page.open();
  await page.waitFor(() => navigator.serviceWorker?.controller, { timeout: 15000, message: 'service worker controls the page' });
  await page.waitFor(async () => (await caches.keys()).some(k => k.startsWith('twesk-')) && (await caches.open((await caches.keys()).find(k => k.startsWith('twesk-')))).match('./engine.js?v=' + document.querySelector('script[src*="app.js"]').src.split('?v=')[1]), { message: 'files cached' });
  await page.cmd('Network.enable');
  await page.cmd('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.goto('/');
  await page.waitFor(() => document.querySelector('#app .topbar'), { message: 'dashboard rendered offline' });
  await page.waitFor(() => /%$/.test(document.querySelector('#chance-value')?.textContent || ''), { message: 'combat worker works offline' });
  await page.click('#app [data-action="toggle-task"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1')).gold === 4);
  await page.cmd('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  page.errors.length = 0; // offline network errors for non-app requests are expected
  await page.click('.topbar [data-action="settings"]');
  assert.match(await page.text('#settings-form .form-actions .small-label'), /^TWESK · VERSION \d/);
  assert.ok(await page.exists('[data-action="refresh-offline"]'), 'the installed app can refresh its offline copy');
});

uiTest('the standalone Twesk.html runs, including its built-in odds worker', async page => {
  await page.open({ path: '/Twesk.html' });
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0, 'no service worker in the single file');
  assert.ok(!(await page.exists('link[rel="manifest"]')));
  await page.waitFor(() => /%$/.test(document.querySelector('#chance-value')?.textContent || ''), { message: 'odds from the inline worker' });
  assert.equal(await page.count('script[src]'), 0, 'no external scripts');
  await page.click('#app [data-action="toggle-task"]');
  await page.waitFor(() => JSON.parse(localStorage.getItem('twesk.v1'))?.gold === 4);
});
