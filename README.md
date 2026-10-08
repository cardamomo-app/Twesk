# Twesk

A local-first, single-page dashboard for tasks, habits, captured thoughts, and a small voxel adventure.

## Open the app

From this folder, run:

```sh
npm start
```

Then open **http://127.0.0.1:4187**. Node and Python 3 are needed for these development commands. There are no packages to install and no remote asset dependencies. Keep the server running while using the app; press Control-C in its terminal to stop it.

Use the same browser and address each time. Browser storage belongs to an origin: `localhost:4187` and `127.0.0.1:4187` have separate progress. Settings contains JSON backup export/import for moving progress. Import validates the file and asks before replacing the current save. Clearing browser data removes progress unless backed up. Settings shows when you last exported a backup. If a week passes with progress and no backup, a small dashboard banner offers an export or a reminder in another week.

For a self-contained copy, open **Twesk.html** directly in a regular browser. It embeds the styles, application code, artwork, and a Blob-based combat worker, so no server or internet connection is required. The original `index.html` is the development entry and needs the local server because browsers restrict local-file JavaScript module imports and workers. File-based browser storage can vary by browser and file location; use export/import to move progress between the served app and the HTML copy, and keep backups.

Regenerate `Twesk.html` after source changes with `npm run build:standalone`. The dependency-free packager supports this app's current named imports/exports and fails on unsupported syntax. The bundled app, worker, reset, and restore were checked via HTTP with a separate preview save; direct `file:` navigation is blocked by the in-app test browser and must be checked in a regular browser.

**Settings → Reset progress** restores the full initial state after confirmation. The current save is kept under `twesk.v1.previous`; **Restore previous progress** swaps it back after confirmation. Both operations save a higher revision for other open tabs and stop if saving fails. Export is also available before resetting. This keeps one previous adventure, rather than an unlimited history; clearing browser storage also removes that recovery copy.

## Included

- Three-column desktop dashboard with aligned panel tops and bottoms, internal list scrolling, the date beside the logo, and daily counts in the footer; stacked layouts on smaller screens. The character preview is compact, with extra room reclaimed when spell and replay controls are present in shorter windows.
- Editable tasks with four reward amounts: quick, standard, hard, and quest milestone. Completed tasks can be undone.
- Body, Mind, Soul, and Heart, each with independent XP and levels. Harm is a fifth expandable section with repeatable HP-cost logging.
- Character stat chips reveal floating combat explanations on hover, keyboard focus, or click/tap: current and next-level benefits, category XP, and Heart's healing bonus. Click/tap pins an explanation; Escape or clicking outside dismisses it. Values come from the combat rules without equipment or spell bonuses.
- Every positive habit is available once per calendar day. There is no schedule or frequency field and no HP loss for missed habits. Background momentum can increase or gradually lower the next XP reward.
- Starter habits and editable starter tasks, plus custom habits and suggestions. Creating or editing a habit offers 24 icon choices, including a category default; choices persist through renaming, reloads, and backups.
- Vault with hashtags, search, pending review, kept notes, journal entries, archive/restore, and one-click task conversion. Captured tasks immediately appear in the task inbox.
- Note-length and review gold, with limits and incremental payouts.
- Gold shop with Weapons, Armor, Potions, Spells, and Pets tabs, a matching inventory, visible avatar equipment, and original code-generated voxel artwork.
- Task rewards and the character balance show voxel gold piles beside exact amounts. Larger rewards have fuller piles; completing a task plays a coin-clinking sound and sends voxel coins toward the balance. Mute and reduced-motion settings apply.
- Shop and inventory show modeled equipment on small display stands, using the same geometry as the avatar. A voxel potion bottle, gold-pile prices and balance, and tier-aligned desktop columns keep the shop consistent with the dashboard.
- Three potions restore 30 HP (10 gold), 65 HP (20 gold), or all missing HP (35 gold). Heart improves the first two. Potions stack and can be used from their shop or inventory card; the dashboard shortcut opens the Potions tab.
- Ember spell (20 gold) adds 3 damage per attack; Stone ward (25 gold) blocks 3 extra damage per hit. Prepare one at a time for the next encounter. Preparation updates readiness, consumes one charge only when fighting, and appears in the combat log and replay. Switching or putting away a spell preserves its charge.
- Fern fox (80 gold), Dusk owl (125 gold), and Moon cat (250 gold) are permanent cosmetic companions. Choose one to display beside the character on the dashboard and in the enlarged view.
- Detailed character with 360° drag rotation, a larger inspection view, zoom and keyboard controls. Skin tone, hair color/style, and clothing color save automatically. The top-right profile icon shows a miniature of the same customized face and updates immediately. Each armor tier has its own geometry; Moonstone mail adds a cape and circlet. Appearance carries into combat and is preserved in new encounter replays.
- Voluntary automatic combat, a readiness percentage, random loot, persistent battle damage, recovery journaling, and a harder monster on the date after victory.
- Combat plays out in readable turns with lunges, sword slashes, impacts, synthesized sword/grunt/block sounds, floating HP changes, and equipment/stat callouts. An encounter log, skip control, mute, and reduced-motion support keep it usable. Replaying the last encounter changes no health or rewards. Defeated monsters turn grayscale with X eyes.
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

The 56 domain checks cover independent XP, the weekly progression target, momentum and missed days, reward undo, note caps, conversion/review, health, equipment, exact combat odds versus independent sampling, loot, rollover, backup validation, milestone persistence/migration, monster collection statuses, artwork bounds, habit icon compatibility/validation, personalized face portraits, reset/recovery, failed-storage preservation, device-timezone defaults, and backup-reminder timing.

The full flows were also checked in the browser: capture → convert → complete → buy/equip; habit creation and undo; reload persistence; defeat → journal → HP recovery; potion use; hashtag search and archive restoration; backup export/import; stat level-up; victory; task/category/level/journal seal unlocks; direct journal capture; and bestiary inspection/chapter navigation. Desktop and narrow-screen layouts and both themes were inspected. Collection checks use a separate localhost save so the user's progress is not changed.

## Files

- `index.html`, `styles.css`, `app.js`: page shell, styles, and the interface entry (dashboard layout, dialog routing, event wiring, startup).
- `ui-core.js`: the shared `app` store (save plus view state), saving, HTML helpers, and toasts. `view` holds the top-level redraw functions, registered by `app.js` so feature modules never import it.
- `ui-modal.js`: opening/closing dialogs, `commit` transactions with rollback, and seal notifications.
- Feature modules, each exporting its `modals`, `actions` (keyed by `data-action`), and `forms` (keyed by form id): `ui-tasks.js`, `ui-habits.js`, `ui-vault.js`, `ui-character.js`, `ui-shop.js`, `ui-battle.js`, `ui-collection.js`, `ui-settings.js`. Supporting pieces: `ui-effects.js` (sounds and reward animation) and `ui-stat-tooltip.js`.
- `Twesk.html`, `scripts/build-standalone.mjs`: generated standalone app and its dependency-free packager. Rebuild after source changes.
- `save-recovery.js`: transactional reset/restore with a recoverable previous save.
- `engine.js`: state model and reward/combat rules, independently testable.
- `combat-worker.js`: readiness calculations away from the main interface thread. Early encounters use exact probabilities; larger encounters use 15,000 deterministic samples of the same rules.
- `combat-presentation.js`, `combat-audio.js`: combat descriptions and locally synthesized effects.
- `coin-sound.js`: locally synthesized metallic coin impacts for task completion.
- `art.js`: original isometric voxel scenes and equipment artwork.
- `monster-art.js`: eight detailed voxel monster models, species metadata, and defeated variants.
- `achievements.js`, `badge-art.js`, `collection-view.js`: lifetime counters and migration, milestone rules, original seal artwork, and the achievements/bestiary interface.
- `equipment-art.js`: cached standalone gear, potion, spell, and pet illustrations for the shop, inventory, and character display.
- `avatar-model.js`, `appearance.js`: rotatable character geometry and appearance choices.
- `habit-icons.js`: habit icon catalog, legacy defaults, and saved-choice validation.
- `cuboid-renderer.js`: cached spatial partitioning of model faces, so overlapping parts draw correctly through a full rotation.
- `planning/BALANCE.md`: proposed economy, with the latest MVP decisions at the top.
- `tests/engine.test.js`: domain checks.
- `tests/combat.test.js`: damage breakdowns, stat feedback, replay compatibility, and defeated artwork.
- `tests/avatar.test.js`: appearance migration/validation, model rotation bounds, and replay appearance snapshots.
- `tests/habit-icons.test.js`: icon selection persistence, legacy defaults, backup validation, and unchanged reward/combat behavior.
- `tests/rendering.test.js`: independent ray/solid visibility checks for feet, vest, and all armor sets through a full rotation.
- `tests/shop.test.js`: catalog migration, potion stock/healing, spell consumption and odds against sampling, companion ownership, loot restrictions, and new artwork.
- `tests/achievements.test.js`: permanent seals, reversible counters, legacy-save migration, journal counting, monster statuses, backup validation, and monster/seal artwork.
- `tests/recovery.test.js`: full reset/restore, revision ordering, invalid recovery validation, and storage failure preservation.

## MVP boundaries

No accounts, cross-device sync, projects, subtasks, task recurrence, selling, or crafting. Character customization is limited to name, skin, hair, clothing color, and earned equipment. There is no passive or missed-day damage. The first artwork set uses eight distinct monster species; encounters continue with increasing stats. On first upgrade, achievement totals are reconstructed from records still present in the save; already deleted historical records cannot be recovered. Subsequent completions are counted independently of record deletion. If all equipment in a drop tier is already owned, loot falls back to gold. Long-term progression still needs playtesting.
