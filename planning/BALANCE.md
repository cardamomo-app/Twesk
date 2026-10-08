# Twesk — proposed balance v0.1

Initial balance draft, now used for the MVP prototype. All numbers below are initial tuning parameters. The model targets a desktop dashboard with tasks, a shared Vault/scratchpad, five expandable habit sections, and a character/monster panel. Body, Mind, Soul, and Heart each have independent XP and levels. Harm costs HP and has no level. There is no overall character XP or level.

## Confirmed MVP changes

The latest user decisions supersede the scheduling and missed-habit-damage proposals below:

- No frequency or schedule selection. Every positive habit exists continuously and can be completed once per local calendar date.
- Momentum lives quietly in the background and uses consecutive calendar dates. A missed day can reduce the next bonus, but never takes HP, XP, gold, or levels.
- Missed-habit damage is deferred entirely; there is no setting for it in the MVP.
- Harm remains the fifth expandable section and may be logged repeatedly.
- Local-first saving with export/import backups; no account or sync in this version.
- Recovery journaling remains available after defeat until fully healed, and at zero HP caused by Harm. Potions can heal other damage at any time outside combat.
- Equipment loot falls back to gold if all equipment in that tier is owned.
- The shop and inventory now have Weapons, Armor, Potions, Spells, and Pets tabs. Monster equipment drops remain limited to weapons and armor.
- Potions: healing (10 gold, 30 HP), greater healing (20 gold, 65 HP), full healing (35 gold, all missing HP). Heart improves the first two; healing is capped at maximum HP.
- Spells: Ember (20 gold, +3 attack) and Stone ward (25 gold, +3 damage reduction). Prepare one spell for the next fight; one charge is consumed on starting that fight, regardless of outcome. Switching or putting away a spell costs nothing. The spell lasts the entire encounter and affects the readiness percentage.
- Pets: Fern fox (80 gold), Dusk owl (125 gold), Moon cat (250 gold). Permanent cosmetic companions; one active at a time, no combat or habit bonuses.

The remainder records the starting math and earlier proposals for reference. The running MVP follows the confirmed changes above.

## Pacing targets

- Each regularly practiced stat levels about once a week.
- An ordinary active day funds a small purchase; a week's savings funds two large purchases OR one special purchase. These are alternative budgets.
- A level-1 character with no equipment and full health has about a one-third chance of beating the first monster.
- A basic piece of equipment helps much less than gaining a stat level.
- A monster is always available until defeated. Fighting is voluntary. Winning unlocks the next, harder monster the following local calendar day. Progression follows victories, not elapsed days.

## Starting state

All four stats: level 1, 0/300 XP. Gold: 0. HP: 100/100. No equipment. Bare-hand attack is available. First monster: 112 HP.

## Habits and XP

| Habit effort | Base XP per scheduled completion |
| --- | ---: |
| Small | 10 |
| Standard | 20 |
| Deep | 30 |

Examples: drinking enough water, getting sufficient sleep, eating well, or a short reading session can each be 10 XP. Focused language practice can be 20 XP. A substantial practice session can be 30 XP. The user chooses the effort; these are suggested defaults rather than judgments about personal difficulty.

One completion per habit per scheduled date. Suggested habits only become active when selected. XP goes exclusively to the habit's category.

Each next stat level costs 300 additional XP, at every level. Carry excess XP forward. Requirements do not increase with level: escalating requirements would slow the requested weekly pace unless rewards also increased.

### Momentum

An uninterrupted daily habit pays 1.0x on its first completion, 1.2x on its second, and 1.5x on its third and later completions. For a 10-XP habit: 10, 12, 15, 15, ... .

Each missed scheduled occurrence lowers its next reward by one rung on this ladder: 1.5x -> 1.2x -> 1.1x -> 1.0x. The resumed completion earns that reduced amount. Each following consecutive scheduled completion advances one rung, except that 1.0x advances directly to 1.2x. Unscheduled dates neither increase nor reduce momentum. All base rewards are multiples of 10, so every reward is a whole number.

Previously earned XP and levels never decrease.

### Weekly example

Body: water 10 + sleep 10 + nourishing meals 10 = 30 base XP/day.
Mind: reading 10 + focused practice 20 = 30 base XP/day.

Either category earns 30, 36, 45, 45, 45, 45, 45 XP in its first seven uninterrupted days: 291 total. It reaches level 2 on day 8, level 3 on day 14, and level 4 on day 21. A fully developed momentum bonus earns 315 XP/week.

Soul or Heart with the same daily base XP follows the same pace. A single 10-XP daily habit takes about three weeks for its first level. More active habits accelerate a category. The weekly pace is a routine benchmark, not a fixed time gate or a guarantee for every possible habit mix. There is no category-wide daily XP cap in this draft.

## Tasks and gold

| Task effort | Gold |
| --- | ---: |
| Quick task / errand | 4 |
| Standard task | 10 |
| Hard task | 18 |
| Major milestone / quest completion | 40 |

Projects group tasks but do not automatically pay a second completion reward. A major milestone can be an explicitly rewarded task of its own. Gold is awarded once per completion; completed task history persists.

### Vault rewards

| Saved note length | Total gold for that note |
| --- | ---: |
| 1–49 words | 1 |
| 50–149 words | 2 |
| 150+ words | 3 |

This is a total entitlement, not a fresh payout on each save. Extending a note can pay the difference once; deleting and retyping does not reset its reward. Empty entries pay nothing. Suggested cap: 6 note gold per local date, shared with recovery journals. Note rewards remain well below the 18-gold hard task.

A completed Vault review pays 4 gold, at most once per local date, when it actually processes at least one pending item. Reviewing means handling an inbox item: converting it to a task, organizing it as a kept note, or archiving it. Simply opening the Vault is not a review.

A daily earning example is three quick tasks (12), one hard task (18), one 150-word note (3), and a review (4): **37 gold/day, 259/week**, excluding monster loot. Without capture/review rewards that routine earns 30/day, 210/week. More occasional hard tasks mean slower purchases.

## Shop

| Purchase | Price | Example effect |
| --- | ---: | --- |
| Healing potion | 10 gold | Restore 30 HP before Heart bonuses |
| Small item / basic equipment | 35 gold | Weapon +1 attack, or armor -1 incoming damage |
| Large item / sturdy equipment | 125 gold | Weapon +3 attack, or armor -3 incoming damage |
| Special item / rare equipment | 250 gold | Weapon +5 attack, or armor -5 incoming damage, plus distinctive voxel appearance |

At 37 gold/day: a small item takes 0.95 earning-days, a large item 3.38, a special item 6.76. Seven small items cost 245; two large items cost 250; one special item costs 250. Potions and mixed purchases use the same budget. These options are not all affordable together. Combat loot adds a modest extra source.

One weapon and one armor item can be equipped. Bonuses shown are total item bonuses, not increments that stack with earlier items in the same slot. A replacement goes into inventory. Cosmetics can also occupy the small-item price band. Further tiers/content are outside this initial economy draft.

## Stats and health

| Stat | Effect |
| --- | --- |
| Body | Maximum HP = 100 + 15 × (Body level - 1) |
| Mind | Adds 4 × (Mind level - 1) to each attack; framed as exploiting weaknesses |
| Soul | Deflection probability per incoming attack = 1 - 0.88^(Soul level - 1) |
| Heart | Once per fight, recover 15 × (Heart level - 1) HP after surviving an attack that leaves HP at or below half maximum; also improves potions and journal healing |

Soul starts at 0% deflection, then 12%, 22.56%, 31.85%, etc. Its growth naturally slows and never reaches 100%. Heart's in-fight recovery is called Rally; it cannot revive a fatal hit and cannot exceed maximum HP. It activates at most once per encounter. At Heart 1 it heals zero.

External healing multiplier = 1 + 0.10 × (Heart level - 1). A potion heals floor(30 × multiplier) HP. Use potions outside encounters so the displayed odds do not depend on mid-fight decisions.

When Body levels up, increase current HP by the same 15 as maximum HP, preserving missing HP. Combat damage persists after a win. Defeat leaves HP at 0. Logging Harm deducts HP immediately, with a floor of 0. Reaching 0 through Harm permits the same recovery journal, so the character cannot become stuck. HP reaching 0 never removes items, gold, XP, or levels.

Suggested Harm costs: minor 3 HP, moderate 7 HP, substantial 12 HP. The user chooses the severity. The same Harm entry can be logged again if it happens again.

Optional neglected-habit damage: on each habit's third consecutive missed scheduled occurrence, deduct 2 HP; continue at 2 HP for each further missed scheduled occurrence. Cap all such deductions at 6 HP per local date. A completion resets that habit's missed-occurrence count. Default off unless enabled for that habit. Missed occurrences still reduce momentum when this HP option is off.

### Recovery journal

After defeat, offer reflection and allow retrying the same monster after recovery. The prompt is optional; progress is based on current saved word count, with no semantic judgment.

HP restored = floor(word count / 2 × external healing multiplier), capped at missing HP. At Body 1 / Heart 1, 60 words restore 30 HP, 120 restore 60, and 200 restore all 100. At higher Body levels full recovery takes more words; Heart increases recovery rate.

Show healing as a live preview while typing; commit it when the journal is saved. A given entry heals once; later edits do not repeat healing. Saving a shorter entry grants partial recovery. A later new entry can restore remaining missing HP. Save entries into the Vault with date, #reflection, and a monster reference when relevant. They follow the normal note-gold allowance. Journaling does not automatically give Soul XP; a configured journaling habit may be checked once on its scheduled date like any other habit.

## Combat rules and odds

The encounter plays automatically after pressing Fight. The player acts first, then surviving monsters retaliate. Continue until one reaches 0 HP. No potion use during an encounter.

- Player attack: choose uniformly from 10, 12, 14, ..., 34; add the Mind bonus and equipped weapon bonus.
- Monster 1 attack: choose uniformly from 14, 16, 18, ..., 34; subtract equipped armor, with a minimum of 1 damage.
- Soul independently rolls to deflect each retaliation completely.
- Apply Heart's Rally after a surviving qualifying retaliation.
- Every roll is independent. A killing player hit receives no retaliation.

The exact same rules determine both the displayed victory probability and actual battles. Display a whole percentage; recalculate when HP, a stat level, equipment, or the opponent changes. Partial XP alone does not improve odds until the stat levels up. Predicting battle outcomes includes Soul and Heart automatically.

### Verified first-monster probabilities

Each row changes only the named parameter from the level-1, unequipped, full-HP starting state. Body 2 uses its full 115 HP.

| Change | Victory chance |
| --- | ---: |
| None | 33.54% |
| Basic weapon (+1) | 40.47% |
| Basic armor (-1) | 41.36% |
| Body 2 | 59.61% |
| Mind 2 | 65.37% |
| Soul 2 | 53.29% |
| Heart 2 | 59.61% |
| Large weapon (+3) | 56.98% |
| Special weapon (+5) | 71.71% |
| All four stats at 2, no equipment | 97.85% |
| Starting stats/equipment, only 70 HP | 3.13% |

A basic item adds about 7–8 percentage points. A first stat level adds about 20–32 points. Combined effects are nonlinear; do not add these percentage changes together. Current HP materially affects readiness.

### Later monsters and loot

For monster number n:

- Maximum HP = round(112 × (1 + 0.06 × (n - 1))).
- Average attack = 24 + round-half-up(0.8 × (n - 1)).
- Damage rolls remain average - 10, average - 8, ..., average + 10.
- 75% of victories award gold: 8 + 2 × (n - 1).
- 25% award one equipment item, with an equal weapon/armor choice. Monsters 1–3 drop basic items, 4–7 sturdy items, and 8+ rare items in this draft. Equipment drops do not also pay gold.
- Each monster's loot is awarded once. Losing pays nothing. The next monster appears the following local date and never spawns an additional copy of already-earned loot.

Monster 1 has a 6-gold expected cash payout per victory, plus a 25% equipment chance. A victory every day is not assumed in the shopping budget. Later monsters can require several days of preparation. New names, silhouettes, palettes, and visual features can vary independently of these numbers.

With starting stats and both basic items, victory chances against monsters 1–4 are about 48.6%, 29.8%, 16.5%, and 9.5%. This makes early stat growth important rather than allowing cheap equipment alone to clear the whole sequence. Their availability the next day does not imply they should be defeated daily.

## Verification and limits

`balance_model.py` calculates exact probabilities using all possible damage rolls and an independent seeded 100,000-fight baseline simulation. Exact baseline: 33.54%; simulated: 33.46%. Checks confirm that either basic item helps less than any first stat level, and that the example routine levels on days 8, 14, and 21.

This validates arithmetic and the starting balance, not long-term enjoyment. Later-monster scaling, stat equality at higher levels, equipment variety, and the gold effect of sustained loot need playtesting. The first stat levels deliberately have a large effect. Soul has diminishing returns; Body and Heart overlap in effective survivability but differ in maximum health, healing, and deflection interactions. Prices assume buying alternatives, not every category of item every week.
