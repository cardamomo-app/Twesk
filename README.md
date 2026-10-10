# Twesk

A local-first, single-page dashboard for tasks, habits, captured thoughts, and a small voxel adventure.

## Use online

Open **https://cardamomo-app.github.io/Twesk/** on desktop or mobile. On a phone, use the browser's **Add to Home Screen** option to install it. Once opened and cached, the installed app also works offline.

Progress is saved locally and is not uploaded to GitHub. Optional private account sync is available in Settings → Set up sync: sign in with the same email on desktop and mobile. Offline changes sync when you reconnect; if both devices changed, choose which adventure to continue. To bring an existing local adventure online, export a backup from the local app and import it in the hosted app before signing in. Backend setup and recovery details are in [supabase/README.md](supabase/README.md).

The GitHub Pages workflow publishes updates from `main` after the domain tests pass. `npm run build:pages` regenerates the offline and standalone versions and prepares `_site/` with only application assets. Development files, screenshots, and local saves are excluded from the hosted artifact. All app URLs are relative so project paths such as `/Twesk/` work correctly.

## Open the app

From this folder, run:

```sh
npm start
```

Then open **http://127.0.0.1:4187**. Only Node is needed; there are no packages to install and no remote asset dependencies. The small local server (`scripts/serve.mjs`) tells browsers to recheck files on every load, so a new version is never hidden behind a stale cached copy. Keep the server running while using the app; press Control-C in its terminal to stop it.

Use the same browser and address each time. Browser storage belongs to an origin: `localhost:4187` and `127.0.0.1:4187` have separate progress. Settings contains JSON backup export/import for moving progress. Import validates the file and asks before replacing the current save. Clearing browser data removes progress unless backed up. Settings shows when you last exported a backup. If a week passes with progress and no backup, a small dashboard banner offers an export or a reminder in another week.

For a self-contained copy, open **Twesk.html** directly in a regular browser. It embeds the styles, application code, artwork, and a Blob-based combat worker, so no server or internet connection is required. The original `index.html` is the development entry and needs the local server because browsers restrict local-file JavaScript module imports and workers. File-based browser storage can vary by browser and file location; use export/import to move progress between the served app and the HTML copy, and keep backups.

Regenerate `sw.js` and `Twesk.html` after source changes with `npm run build`. The dependency-free packager supports this app's current named imports/exports and fails on unsupported syntax. The bundled app, worker, reset, and restore were checked via HTTP with a separate preview save; direct `file:` navigation is blocked by the in-app test browser and must be checked in a regular browser.

**Settings → Reset progress** restores the full initial state after confirmation. The current save is kept under `twesk.v1.previous`; **Restore previous progress** swaps it back after confirmation. Both operations save a higher revision for other open tabs and stop if saving fails. Export is also available before resetting. This keeps one previous adventure, rather than an unlimited history; clearing browser storage also removes that recovery copy.

## Install as an app

Twesk is an installable web app: it gets its own window and Dock icon and keeps working with the server off. A service worker (`sw.js`) caches every file the app uses after the first launch.

**Safari (macOS Sonoma or later):** with `npm start` running, open http://127.0.0.1:4187, then choose **File → Add to Dock**. Safari gives Dock apps their own storage, so to bring existing progress along, first use **Settings → Export backup** in the Safari tab, then open the Dock app and use **Settings → Import backup**. Open the Dock app once while the server is running so it can save its offline copy; after that it opens without the server.

**Chrome, Edge, or Brave:** open the same address and use the install icon in the address bar (or the menu's **Install Twesk**). These share storage with the browser, so progress carries over.

When a newer version is available and the server is running, the app updates in the background and shows **A new version of Twesk is ready · Reload**. Settings shows the running version; if the installed app ever seems out of date, start the server and use **Settings → Refresh offline copy**. Keep exporting backups occasionally: installed or not, progress lives in browser storage.

After changing app files, run `npm run build` to regenerate `sw.js` (its offline file list and version) and `Twesk.html`; a test fails if `sw.js` is out of date.

## Included

- Three-column desktop dashboard with aligned panel tops and bottoms, internal list scrolling, the date beside the logo, and daily counts in the footer; stacked layouts on smaller screens. The character preview is compact, with extra room reclaimed when spell and replay controls are present in shorter windows.
- Editable tasks with four reward amounts: quick, standard, hard, and quest milestone. Completed tasks can be undone.
- Task rows show the title and gold without a task-size caption. The task dialog offers four voxel-gold reward cards, compact repeat choices, and short optional step fields.
- Focus: pin up to three open tasks above the rest. Completing, deleting, or moving a task to the Vault frees its slot. Undoing completion returns it unpinned.
- Manual task order: drag the dotted handle on desktop or touch screens; use ↑ / ↓ while the handle is focused for keyboard ordering. Drag between Focus and Other tasks to pin or unpin, subject to the three-task limit. Tasks of different sizes can be freely mixed; each keeps its size label and gold amount. Project filters preserve the relative order of hidden tasks.
- Small steps: add up to 30 named steps while creating or editing an open task. Expand the progress count to check steps independently, with no extra gold or task achievements. Completing the parent checks every step and pays its normal reward once; Undo restores the prior checklist. Recurring tasks reopen with unchecked steps. Step edits preserve checks by identity, and the Vault round trip, backups, and sync preserve steps, pins, and order.
- Move to Vault: an open task can go back to the Vault inbox to look at later (from its edit dialog), with Undo. A task made from a note reopens that note with its full text; otherwise the title becomes a note. The note is marked "Was a task" and remembers the task's title, size, and repeat, so "Back to tasks" restores them. It earns no note gold or Vault progress.
- Recurring tasks (every day, weekdays, every week, every month) earn gold each completion, then wait under Completed and return on their next date. Missed days never pile up or cost anything.
- Projects: any #tag in a task title groups it. Project chips above the list filter tasks, tags in titles are clickable, and new tasks added while filtering start in that project. Tasks made from Vault notes keep the note's hashtags.
- Body, Mind, Soul, and Heart, each with independent XP and levels. Harm is a fifth expandable section with repeatable HP-cost logging.
- Character stat chips reveal floating combat explanations on hover, keyboard focus, or click/tap: current and next-level benefits, category XP, and Heart's healing bonus. Click/tap pins an explanation; Escape or clicking outside dismisses it. Values come from the combat rules without equipment or spell bonuses.
- Every positive habit is available once per calendar day. There is no schedule or frequency field and no HP loss for missed habits. Background momentum can increase or gradually lower the next XP reward.
- Starter habits and editable starter tasks, plus custom habits and suggestions. Creating or editing a habit offers 24 icon choices, including a category default; choices persist through renaming, reloads, and backups.
- Vault with hashtags, search, pending review, kept notes, journal entries, archive/restore, and one-click task conversion. Captured tasks immediately appear in the task inbox.
- Note export: on the Vault's Notes and Journal tabs, click any note (its empty space or text; its own buttons work as usual) to outline it in purple, or focus it and press Space. A download button with the count then appears at the end of the tab row and merges the selected notes into one plain-text file, oldest first. Each note gets its date as a heading, keeps its own paragraphs, and is separated from the next by a `* * *` divider with blank lines. A journal-only export is titled as a journal (`twesk-journal-….txt`, "N entries"). Changing tabs clears the selection. Select all (in the same row) selects only the notes shown after search and hashtag filters, so one hashtag can be exported on its own; notes hidden by a new filter drop out of the selection.
- Merge notes: with two or more notes selected, an icon-only merge button appears beside the download button. The notes become one (the oldest, keeping its date and task link; pinned if any was), with each note's text in order, oldest first, separated only by a blank line, so hashtags carry over inside the text. Each hashtag is kept only at its last appearance, closest to the end (case-insensitive); earlier repeats are removed, and a line left with nothing but repeated tags is dropped. Undo restores the originals. Merging earns no note gold.
- Hashtag autocomplete: typing `#` and a letter in a task title, a captured note, or Vault search suggests hashtags already used in tasks and notes, most used first. ↑/↓ choose, Enter or Tab accept, Escape closes the list (not the dialog); in notes the list appears under the line being typed.
- Vault organization: pin notes to the top, filter by hashtag chips or by clicking a tag in a note, and review inbox captures one at a time (oldest first) with Keep / Make a task / Archive / Skip buttons or the K, T, A, S keys.
- Habit details: the ⋯ menu shows the next reward and momentum (or tomorrow's, once done today), the current streak, all-time totals, and a 28-day history grid above the edit form.
- Note-length and review gold, with limits and incremental payouts.
- Equipment comparisons on every weapon, armor, and spell card in the shop and inventory: the attack or protection change versus what is equipped or prepared, and the win chance against the next opponent before → after (at full HP when currently at 0 HP).
- Gold shop with Weapons, Armor, Helmets, Potions, Spells, Pets, and Style tabs, a matching inventory, visible avatar equipment, and original code-generated voxel artwork.
- Celebration: ticking a task plays a bright check note, sparks, and a pop before the row slides away; coins arc to the purse, land with a coin cascade, and the balance counts up. Rewards in quick succession climb a pentatonic scale, so a run of tasks or habits sounds increasingly triumphant. Habits pop in their category color; level-ups get a fanfare, a banner, and a glowing stat chip; seals arrive with a bell run, spinning rays, and a shine; purchases ring a register and light up the card. Combat has varied sword swings, heavy blows with a stage shake, monster growls, clanging blocks, a fight-start horn, and a finishing boom. Victory adds a drum roll and brass fanfare, a stamped VICTORY banner, confetti, and a loot reveal with a gold count-up. Mute silences everything; Reduce motion keeps sounds but skips particles and movement.
- Task rewards and the character balance show voxel gold piles beside exact amounts. Larger rewards have fuller piles; completing a task plays a coin-clinking sound and sends voxel coins toward the balance. Mute and reduced-motion settings apply.
- Shop and inventory show modeled equipment on small display stands, using the same geometry as the avatar. A voxel potion bottle, gold-pile prices and balance, and tier-aligned desktop columns keep the shop consistent with the dashboard.
- Three potions restore 30 HP (10 gold), 65 HP (20 gold), or all missing HP (35 gold). Heart improves the first two. Potions stack and can be used from their shop or inventory card; the dashboard shortcut opens the Potions tab.
- Helmets (+5 to +32 max HP) form a third equipment slot; equipping or removing one shifts current HP with the maximum. A legendary tier (Dawnbreaker, Sunforged plate, Sunforged crown, Ember drake) is gold-only. Every pet now lends a combat bonus: Fern fox +4% deflect, Dusk owl +3 attack, Stone tortoise +3 block, Moon cat +20 rally, Ember drake +5 attack. Tonics (Swiftness +10% deflect, Fortitude +15 rally) are drunk ahead of the next fight, one at a time, and stack with a spell. Storm lance (+6 attack) and Starfall (+4 attack, +2 block) join the spells.
- Delights (shop tab): single-use moments of fun that never change stats or rewards. Pet treat (8 gold, your companion hops with a heart), Balloon bouquet (15, balloons float up the screen; click to pop), Seasonal drift (20, blossoms, leaves, or snow by season drift over the dashboard for the rest of the day), Fireworks show (35, night falls for rockets and bursts), and Disco party (60, a mirror ball, sweeping lights, a short synth groove, and a dance by your character, companion, and the monster). Each has its own sounds; they play over the app without blocking it, and Escape ends one early. With Reduce motion they become a gentle glow.
- Pet hats (Pets tab): Party hat (40), Flower crown (60), Top hat (80), and Tiny crown (120). Owned once, worn one at a time, and kept on when you switch companions; each pet has its own hat spot and size. Purely cosmetic.
- Styles: new hair colors, clothing colors, hairstyles (top bun, long, mohawk), facial hair, and accessories (earring, flower, glasses, eyepatch) are bought with gold. The character studio lets you try any locked style on the model before buying; the Style tab previews each on your face.
- Ember spell (20 gold) adds 3 damage per attack; Stone ward (25 gold) blocks 3 extra damage per hit. Prepare one at a time for the next encounter. Preparation updates readiness, consumes one charge only when fighting, and appears in the combat log and replay. Switching or putting away a spell preserves its charge.
- Pets are permanent companions with small combat bonuses. Choose one to display beside the character on the dashboard and in the enlarged view.
- Detailed character with 360° drag rotation, a larger inspection view, zoom and keyboard controls. Skin tone, hair color/style, and clothing color save automatically. The top-right profile icon shows a miniature of the same customized face and updates immediately. Each armor tier has its own geometry; Moonstone mail adds a cape and circlet. Appearance carries into combat and is preserved in new encounter replays.
- Voluntary automatic combat, a readiness percentage, random loot, persistent battle damage, recovery journaling, and a harder monster on the date after victory.
- Combat plays out in readable turns with lunges, sword slashes, impacts, synthesized sword/grunt/block sounds, floating HP changes, and equipment/stat callouts. An encounter log, skip control, mute, and reduced-motion support keep it usable. Replaying the last encounter changes no health or rewards. Defeated monsters turn grayscale with X eyes.
- Progress history (calendar icon in the top bar): a month calendar shaded by daily activity, with markers for tasks, level-ups, and victories. Selecting a day shows its habits, XP by stat, harm logs, tasks and task gold, level-ups, notes, journal entries, and encounters; the month summary totals active days, habits, tasks, gold, victories, and level-ups, with stat-growth bars. Arrow keys move between days. Habit, note, and encounter history comes from existing dated records; tasks, task gold, and level-ups are recorded per day from this version (dated task completions already in a save are carried over), keeping up to 800 days.
- Achievements opens a collection of 28 original RPG seals for tasks, each positive habit category, leveling, monster victories, Vault entries, and journaling. Category filters, an earned-only view, progress bars, dates, and unlock notifications make milestones easy to find. Seals remain earned after undo; counters reverse undone completions and retain contributions from deleted records. Seals add no currency or combat bonuses.
- Bestiary shows defeated, available, next, and locked encounters, with monster details, actual combat stats, and chapter navigation. Eight distinct voxel creatures have roots, scales, crystals, pincers, antlers, petals, armor, or patterned wings; their models also appear on the dashboard and in combat. Defeated creatures have grayscale bodies and X eyes. Later chapters repeat these species with increasing encounter stats.
- Quick capture includes a Journal option alongside Note and Task. Ordinary journal entries count toward milestones without requiring combat defeat or healing HP.
- Name and timezone settings (new saves start in this device's timezone; Settings offers a one-click switch if they differ), light/dark themes, sound mute, reduced motion, keyboard capture, and local backups.
- Confirmed full reset with recoverable previous progress, plus a self-contained HTML build for opening without a local server.

Quick capture: **Command/Ctrl-K**. Vault: **Command/Ctrl-J**. Escape closes dialogs. Reward sounds use a local audio synthesizer.

## Verify

```sh
npm test
```

The 123 domain checks cover independent XP, the weekly progression target, momentum and missed days, reward undo, note caps, conversion/review, health, equipment, exact combat odds versus independent sampling, loot, rollover, backup validation, milestone persistence/migration, monster collection statuses, artwork bounds, habit icon compatibility/validation, personalized face portraits, reset/recovery, failed-storage preservation, device-timezone defaults, backup-reminder timing, recurring-task schedules, project tags, loadout comparisons, habit details, pinned notes, capped Soul deflection and monster gold, helmets, pet/spell/tonic bonuses, the wardrobe, rendering of every style and helmet from every side, and the daily history record (undo, level-up removal, migration, bounds).

### Interface tests

```sh
npm run test:ui
```

26 tests drive the real interface in a headless Chromium-based browser with real mouse clicks and key presses: loading and reload persistence, task completion and undo, moving a task back to the Vault and returning it, selecting and downloading notes as text, Select all with a hashtag filter, merging notes with Undo, hashtag autocomplete (including the animated path with motion on), recurring tasks and project filters, habit scroll position, level-up celebration, ⌘K capture and keyboard Vault review, shop comparisons/helmets/tonics/styles, studio try-on and purchase, a won fight with its loot, the history calendar, backup export plus reset and restore, Escape and focus trapping, the phone layout, migration of older saves, and pet hats, delights (popping balloons, the monster dancing, Escape, dancing, a drift that lasts the day, and the Reduce motion glow), the installed app opening and saving fully offline, and the standalone `Twesk.html` with its built-in worker (and no service worker). Each test runs in an isolated browser profile, so real saves are never touched; a failing test saves a screenshot to `tests/ui/artifacts/`.

The driver (`tests/ui/browser.mjs`) has no dependencies: it uses the browser's DevTools protocol over Node's built-in WebSocket. It looks for Chrome, Chromium, Edge, or Brave in /Applications, ~/Applications, and the Applications folder of any attached drive (so a browser kept on an external disk works while it is plugged in); set `CHROME_PATH` to choose one. Without a browser, the interface tests are skipped. `npm run test:all` runs both suites. The suite takes about 15 seconds.

The full flows were also checked in the browser: capture → convert → complete → buy/equip; habit creation and undo; reload persistence; defeat → journal → HP recovery; potion use; hashtag search and archive restoration; backup export/import; stat level-up; victory; task/category/level/journal seal unlocks; direct journal capture; and bestiary inspection/chapter navigation. Desktop and narrow-screen layouts and both themes were inspected. Collection checks use a separate localhost save so the user's progress is not changed.

## Files

- `manifest.json`, `icons/`, `sw.js`, `scripts/sw-source.mjs`, `scripts/build-sw.mjs`, `scripts/make-icons.mjs`: installable app metadata, icons (rendered from `icons/icon.svg`), and the generated offline cache.
- `index.html`, `styles.css`, `app.js`: page shell, styles, and the interface entry (dashboard layout, dialog routing, event wiring, startup).
- `ui-core.js`: the shared `app` store (save plus view state), saving, HTML helpers, and toasts. `view` holds the top-level redraw functions, registered by `app.js` so feature modules never import it.
- `ui-modal.js`: opening/closing dialogs, `commit` transactions with rollback, and seal notifications.
- Feature modules, each exporting its `modals`, `actions` (keyed by `data-action`), and `forms` (keyed by form id): `ui-tasks.js`, `ui-habits.js`, `ui-vault.js`, `ui-character.js`, `ui-shop.js`, `ui-battle.js`, `ui-collection.js`, `ui-settings.js`. Supporting pieces: `ui-effects.js` (sounds and reward animation) and `ui-stat-tooltip.js`.
- `Twesk.html`, `scripts/build-standalone.mjs`: generated standalone app and its dependency-free packager. Rebuild after source changes.
- `save-recovery.js`: transactional reset/restore with a recoverable previous save.
- `engine.js`: state model and reward/combat rules, independently testable.
- `combat-worker.js`, `ui-odds.js`: readiness calculations away from the main interface thread, cached per loadout and shared by the dashboard and shop comparisons. `estimateOdds` in the engine uses exact probabilities for early encounters and 15,000 deterministic samples of the same rules for larger ones.
- `combat-presentation.js`: combat descriptions.
- `sfx.js`: every sound effect, synthesized locally with Web Audio through one compressor and reverb, with random variants and a reward combo scale.
- `ui-effects.js`: celebration visuals (bursts, confetti, flying coins, count-ups, level banner) and the mute/motion-aware sound hook.
- `art.js`: original isometric voxel scenes and equipment artwork.
- `monster-art.js`: eight detailed voxel monster models, species metadata, and defeated variants.
- `achievements.js`, `badge-art.js`, `collection-view.js`: lifetime counters and migration, milestone rules, original seal artwork, and the achievements/bestiary interface.
- `equipment-art.js`: cached standalone gear, potion, spell, and pet illustrations for the shop, inventory, and character display.
- `avatar-model.js`, `appearance.js`: rotatable character geometry and appearance choices.
- `habit-icons.js`: habit icon catalog, legacy defaults, and saved-choice validation.
- `cuboid-renderer.js`: cached spatial partitioning of model faces, so overlapping parts draw correctly through a full rotation.
- `planning/BALANCE.md`, `planning/long-term-sim.mjs`: the economy and its year-long simulation through the real engine, with the latest findings at the top.
- `ui-delights.js`: delight moments and the seasonal drift layer (sounds live in `sfx.js`).
- `ui-tag-suggest.js`: hashtag autocomplete (matching rules live in `engine.js`).
- `notes-export.js`, `tests/notes-export.test.js`: merging selected notes into one readable text file.
- `ui-history.js`, `tests/history.test.js`: the progress calendar and its daily record.
- `tests/ui/browser.mjs`, `tests/ui/app.ui.test.mjs`: dependency-free browser driver and the interface tests.
- `tests/depth.test.js`: balance caps, helmets, stacking bonuses, tonics, the wardrobe, and avatar rendering for every style.
- `tests/engine.test.js`: domain checks.
- `tests/combat.test.js`: damage breakdowns, stat feedback, replay compatibility, and defeated artwork.
- `tests/avatar.test.js`: appearance migration/validation, model rotation bounds, and replay appearance snapshots.
- `tests/habit-icons.test.js`: icon selection persistence, legacy defaults, backup validation, and unchanged reward/combat behavior.
- `tests/rendering.test.js`: independent ray/solid visibility checks for feet, vest, and all armor sets through a full rotation.
- `tests/shop.test.js`: catalog migration, potion stock/healing, spell consumption and odds against sampling, companion ownership, loot restrictions, and new artwork.
- `tests/achievements.test.js`: permanent seals, reversible counters, legacy-save migration, journal counting, monster statuses, backup validation, and monster/seal artwork.
- `tests/recovery.test.js`: full reset/restore, revision ordering, invalid recovery validation, and storage failure preservation.

## MVP boundaries

No nested subtasks, due dates, selling, or crafting. Sync shares one adventure per account, with explicit conflict choices rather than automatic merging. Projects are hashtag groups rather than separate objects. Character customization covers name, skin, hair color and style, clothing color, facial hair, one accessory, and equipment. There is no passive or missed-day damage. The first artwork set uses eight distinct monster species; encounters continue with increasing stats. On first upgrade, achievement totals are reconstructed from records still present in the save; already deleted historical records cannot be recovered. Subsequent completions are counted independently of record deletion. If all equipment in a drop tier is already owned, loot falls back to gold. Long-term progression still needs playtesting.
