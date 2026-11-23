# Tabletop Kit — design document

Offline solo-TTRPG toolkit, built as a PWA for iPhone/iPad. Personal use only.
Update this file with every change so the project can be picked up by anyone (or any AI).

**Version:** 0.6.0 (Obsidian vault per campaign)

## Goals
- Works fully offline once installed (vacation use).
- One generic engine; specific games are added as **packs** (data), not code, wherever possible.
- Results flow into Obsidian journaling with minimal friction.
- Vanilla HTML/CSS/JS, no build step, heavily commented code.

## Running it
- Any static web server works. Service workers (offline mode) need **HTTPS or localhost**.
- Easiest real install: push the folder to a GitHub repo → Settings → Pages → deploy from branch.
  Open the `https://…github.io/…` URL in Safari → Share → Add to Home Screen. Then turn on airplane mode to test.
- Updating: change files, **bump `VERSION` in `sw.js`**, push. Open the app online once to pick up the update.

## File map
| File | Role |
|---|---|
| `index.html` | App shell: header, nav, main area, iPad side log |
| `css/app.css` | Theme variables (dark/light) and phone/iPad layouts (breakpoint 900px) |
| `sw.js` | Precaches every file for offline use. Add new files to `FILES`! |
| `js/app.js` | Start-up, tab routing, event delegation (`data-act`, `data-draft`, `data-setting`, `data-enter`) |
| `js/state.js` | Single state object, debounced IndexedDB saves, backup export/import |
| `js/store.js` | Minimal IndexedDB key→value wrapper |
| `js/rng.js` | All randomness (crypto RNG, Fisher–Yates shuffle) |
| `js/dice.js` | Dice notation: `NdM`, `+/-`, `kh/kl`, `d%`, `dF` |
| `js/decks.js` | Stateful decks (draw/discard piles). Playing cards (± jokers), tarot (± reversals) |
| `js/tables.js` | Table parse (book paste formats), roll, `[[nested]]` + `{dice}`, packs |
| `js/npcs.js` | NPC hub: cards, shared −2..+2 Attitude, UNE relationship mapping, Mythic Characters link (`item.npcId`) |
| `js/letstalk.js` | Let's Talk dialogue engine (greetings, tone deck, reactions, mood effects, wildcard, Err…hmm, hardcore, lying, persuading) |
| `js/data/letstalk.js` | Let's Talk rules data, used under the author's non-commercial permission (credited), descriptions in our own words |
| `js/keepingcontact.js` | Keeping Contact rules on any holder with `.attitude` + `.kc` (cards, pairs, factions) |
| `js/data/keepingcontact.js` | KC level names per relationship type + paraphrased first-impression/backstory prompts (author's non-commercial permission) |
| `js/obsidian.js` | Vault settings per campaign, obsidian:// links (append / replace / daily), app-owned note builders (NPC, faction, Campaign Overview), changed-since-sent, tiny ZIP writer |
| `js/views/send.js` | "Send to note" picker: campaign log, daily note, pinned, recent, typed path |
| `js/apothecaria.js` | Apothecaria library: reagent + ailment parsers (user-pasted pages), add/replace by source, potency, `curesFor`, `forageValue`, `bestLocale` |
| `js/views/apothecaria.js` | Apothecaria tab (Settings → Game modules): library, ★ fixing, Cure finder, paste sheet |
| `js/games.js` | Game module list + `gameOn(id)`; Settings shows a toggle per module, its tab shows only when on |
| `js/apoplay.js` | Apothecaria game engine per campaign (`state.apoPlay`): reputation/tier, silver, calendar, tools, stock, patient draw, foraging (events, points, timer), brew check, pay, Witch clues, shop |
| `js/views/apoplay.js` | Apothecaria Play and Setup screens (`data-change` fields → `onPlayChange`) |
| `js/une.js` | UNE procedures only; tables are user-pasted and linked to slots (auto-matched by name) |
| `js/views/npcs.js` | NPCs tab: list → card → talk; UNE setup and conversation options sheets |
| `js/mythic.js` | Mythic 2e procedures only. The book's tables are pasted in by the user |
| `js/log.js` | Session log, Markdown export, `obsidian://` URIs |
| `js/ui.js` | Helpers: escaping, toast, clipboard, file save/open, sheets |
| `js/data/tarot.js` | 78 cards, original plain-English meanings, spreads, reading guide |
| `js/data/examples.js` | Starter pack installed on first launch |
| `js/views/*.js` | One per screen: `render()` returns HTML, `actions` handles taps |

## Campaigns: the scope rule
Every piece of data is either **global** or **per-campaign**. A new feature MUST say which one it is, and put it in the right place.

| Scope | What | Stored under |
|---|---|---|
| Global | settings, Mythic setup (rules, odds data, table choices), UNE setup (slot → table), campaign list, Apothecaria library (reagents, ailments) | `settings`, `mythic`, `une`, `campaigns`, `apo` |
| Global by default | tables (`campaign: null`). A table with `campaign: id` belongs to that campaign only | `tables` |
| Per-campaign | Apothecaria game (`apoPlay`), log, decks, trackers (counters and lists, including Mythic Threads and Characters), dice favourites, Mythic play state (chaos, scene, tracks, keyed scenes), NPC cards, social options (Let's Talk + KC), the dialogue in progress, NPC↔NPC pairs and faction ties (`relations`), factions | `c:<campaignId>` |
| Per-campaign overrides | Mythic method, chaos variant (`campaign.overrides`, '' = use global) | in `campaigns` |
| Per-campaign vault | `campaign.vault` = { name, npcFolder, factionFolder, logMode, logNote, overviewNote, pinned, recent } | in `campaigns` |

In memory, `state.log/decks/trackers/dice` always hold the current campaign; `state.mythic` is global setup and current play
merged together. `state.save()` splits it again. `visibleTables()` = global tables + the current campaign's own tables.
Switching campaign: flush, load `c:<id>`, swap. Campaign files (`tabletop-kit-campaign`) export one campaign and its own tables;
importing always creates a new campaign. Backups are version 2 (all campaigns); v1 backups migrate like a first run.

## Data model (IndexedDB keys)
- `settings`: theme, tarotReversals, jokers, obsidianVault/Target/File, exportStyle, games (`{apothecaria: true}`)
- `log`: `[{id, ts, kind, title, body, sent}]`. `kind: 'session'` and `'scene'` are dividers
- `decks`: `{deckId: {draw: [ids], discard: [{id, rev}], built}}`
- `tables`: `[{id, name, folder, die, entries: [{min, max, text}], notes}]`. `die: 'card'` = card-keyed (A=1…10, J=11, Q=12, K=13, Joker=14), rolled by drawing from the `standard` deck
- `apo`: `{reagents: [{id, source, name, pot, type, locales: [{name, value}], seasons: {Season: ±n}, poison, sweet,
  parts: [{part, methods, tags, causes}], desc}], ailments: [{id, source, tier, rank, name, tags: [{tag, pot}], timer, desc, consequence}]}`.
  `pot: null` = ★ potency didn't survive the paste; set in the app. Re-pasting replaces by source+name / source+tier+rank and keeps hand-set potency
- `trackers`: `{counters: [{id, name, value, max}], lists: [{id, name, items: [{id, text}]}]}`
- `mythic`: `{chaos, scene, method: 'check'|'chart', variant: 'standard'|'mid'|'low'|'none',
  checkMods: {variant: {odds: {label: n}, chaos: {1..9: n}}}, charts: {variant: {odds, cells}},
  focusTable, actionTables: [id, id], descriptionTables: [id, id], elementsFolder, sceneAdjustTable,
  discoveryTable, defaultMeaning, tracks: [{id, thread, length, points, flash: [], pendingFlashpoint, done}], activeTrack,
  keyed: [{id, name, trigger, event, count, target, auto}], noDiscovery}`. `migrate()` converts v0.1 saves.
- `dice`: `{favorites: []}`

Pack file: `{format: 'tabletop-kit-pack', version: 1, name, tables: [...]}`. Importing replaces tables with the same folder and name.
Backup file: `{format: 'tabletop-kit-backup', version: 1, data: {...all keys}}`.

## Features (v0.1)
- **Dice:** quick dice, expression builder, favourites, breakdown with dropped dice struck through.
- **Cards:** persistent playing-card deck (draw 1–3, put last back, shuffle all back, jokers toggle).
  Tarot with spreads (single, past/present/future, situation/obstacle/advice, NPC, scene, relationship, quest hook),
  reversals toggle, meanings and comparison, suit and number context, a "how to read" guide, and a browser for all 78 cards.
- **Tables:** folders = packs, search, roll/reroll, editor with paste-in parsing (`01-05`, `96-00`, wrapped lines, plain lists),
  gap/overlap warnings, test roll, pack import/export.
- **Mythic (2e, v0.2):** sub-tabs Play / Lists / Thread / Keyed.
  - Fate Check (2d10 + odds + chaos modifiers; ≥11 Yes, 18–20 Exc Yes, 2–4 Exc No) is the default; Fate Chart (d100) optional.
    Custom % always available. Random events on doubles ≤ CF with both methods.
  - Chaos variants (standard/mid/low/none), each with its own pasted modifiers/chart.
  - Question types: normal, NPC action (shows how to read the answer), Discovery (needs a track; odds floor 50/50;
    Yes → discovery table ×1, Exc Yes ×2, Exc No → no more discovery this scene; "+N" in a result is added to the track).
  - Scene test: d10 ≤ CF → odd Altered (+ Scene Adjustment; a "2 adjustments" result rolls two more), even Interrupt (+ event).
  - Random events: Focus table; when the focus mentions an existing thread or NPC, roll the list (2e: 5 sections × 5 lines,
    section die d4/d6/d8/d10 by active sections, d10 for the line, empty line = Choose). Empty list → Current Context.
  - Meaning: Actions (2 tables), Descriptions (2 tables), any table in the Elements folder (rolled twice).
  - Thread Progress Track 10/15/20, Progress/Flashpoint +2, phases of 5; a phase crossed without a Flashpoint triggers one
    (now, or at the next scene test in bookkeeping mode); Conclusion at the end.
  - Keyed Scenes: user rules with counter/target, optional auto-count per scene, due banner.
- **Sub-folders (v0.2.1):** folder names use `/` (e.g. `Mythic/Elements`). Tree view with collapsible parents, ✎ rename/move a folder
  and everything in it, ⇪ export includes sub-folders, `[[Elements/Smells]]` or `[[Mythic/Elements/Smells]]` references,
  and the Mythic Elements folder includes its sub-folders.
- **Paste fixes (v0.2.1):** a range alone on a line is joined to the text on the next line; `# A | B | C` headings split
  side-by-side tables wherever the numbering restarts on a line.
- **Whole-page paste (v0.2.2):** ALL-CAPS lines count as headings (title-cased); consecutive headings = side-by-side tables;
  items are dealt out in reading order, moving to the next table whenever the number doesn't go up. The number of side-by-side
  tables is inferred from the numbering, so a page title above the headings is dropped. Page numbers (bare numbers > 100) are
  ignored, and `100:Word` without a space parses.
- **Robust columns (v0.2.3):** each numbered item goes to the left-most side-by-side table that lacks that number, so one bad
  column can't shift the others. A run of 3+ number-less lines (a column whose numbers didn't copy) fills the gaps of the table
  missing that many entries, in order; bare `51:` lines are joined to the text on the next line.
- **Per-thread tracks (v0.2.4):** each thread can have its own Thread Progress Track; progress is kept when you switch.
  The Thread tab picks threads from the Threads list (or "Other…"), shows all tracks as chips, and the highlighted one is used
  by Discovery Checks. A Flashpoint queued on any track fires at the next scene test. v0.2.3 saves migrate automatically.
- **Track tidy-up (v0.2.5):** tracks can be minimized (`paused`, progress kept) and live under a collapsed "Minimized" group;
  concluded tracks move to a collapsed "Concluded" group automatically (never deleted unless you tap Delete). A concluded track
  offers "Remove this thread from the Threads list". Threads on Lists show a small progress bar (⏸ minimized, ✓ concluded) that
  opens their track.
- **Campaigns (v0.3.0):** top-bar campaign menu to switch, create (optionally copying lists, counters, dice favourites and
  that campaign's own tables), rename, set game/notes, override Mythic rules or the Obsidian note, export, import, archive and delete.
  Existing data became "Campaign 1". Tables can be "All campaigns" or "Only this campaign" (editor and bulk paste).
  Folder / pack is now a dropdown of existing folders plus "＋ New folder…".
- **NPC hub (v0.4.0):** NPCs tab with one card per NPC (per campaign): name, role, Attitude (−2..+2), UNE profile, relationship
  override, personality mood, romance and cooldown flags, notes, archive. Features read and update cards: Mythic Characters list
  items link to cards (adding a character creates a card; renaming a card renames its list items; random events and list
  rolls offer "Open card"). Let's Talk uses the card's Attitude/mood/romance and the aftermath adjusts Attitude. UNE fills the
  profile, and rolls conversation mood (relationship) and discussion (demeanor → bearing + focus).
- **Obsidian (v0.6.0):** one vault per campaign, folders at the vault root (defaults `NPC`, `The World/Factions`,
  `Sessions/Session Log`, `Campaign Overview`). App → vault only (iOS can't let the app read the vault); every send opens
  Obsidian. NPC/faction/overview notes are app-owned and replaced on send (Properties + sections, with a callout saying so);
  you write story in your own notes and link `[[Name]]`. Cards track `updatedAt` vs `sentAt` and show • when the note is out
  of date. Log entries/sessions can go to any note (picker with pinned + recent paths). "All notes as .zip" exports every
  app-owned note plus the log for unzipping into the vault (Files app).
- **Random names (v0.5.1):** 🎲 next to an NPC's name opens 6 suggestions. Source per campaign (`social.names`): built-in
  original syllable sets (Fantasy, Rustic, Harsh, Lyrical, Sci-fi), one of your tables rolled once (full names), or a table
  rolled 2–3 times and joined (name fragments, e.g. a syllable table). Code: `js/names.js`.
- **Keeping Contact (v0.5.0):** on every card: AR bar with limits (−4/+6; Bond or finished quest −5/+5; both −6/+4),
  Stressed/Pleased, approve (little / a lot / great favour / once-in-a-lifetime) and disapprove (little / angered / great harm /
  betrayal → foe), romance makes AR changes one bigger, hurt-feelings cooldown, Update relationships (volatility 1–3/4/5),
  Create/Break Bond (max 5 Bonds incl. factions; +quest stages; 7–9 → +2 next time), Start/End romance (+1 to Attitude rolls in
  romance), Ask for something (debt, intimidation, social skill), personal quest (3 stages, neglect, failure), courage rerolls,
  first impression (1d6 hunch). Relations tab: NPC↔NPC pairs (moment of intimacy, polite conversation, heated argument, next-roll
  modifiers, crushes, deal two at random, backstory). Factions tab: Reputation/Status/Leadership, join (Bond) → member (Status
  ≤0), leader, leaving (treason), hunted, rebellion, faction quest, ties between factions (Entente cordiale, For the mutual
  benefit, Butting heads), choosing sides (helping one annoys factions at Ties −2). Let's Talk aftermath uses approve/disapprove,
  romance stage drives the Romantic tone, and the KC "porting" rule replaces the ends-of-scale rule (extra d10s keep high/low).
- **Let's Talk rules implemented:** topic d10, mood (2d10 grid, by attitude, personality, or chosen), deck of 9 base tones
  (+Flirting if Unfriendly or better and not on cooldown, +Romantic for romances, +Wildcard copy of the PC's tone), draw 3 per
  exchange, unusable tones greyed out, reaction roll d10 vs attitude, tone→reaction table, max 3 exchanges, Furious ends it,
  Advanced Mood effects (modifiers, restrict, reshuffle, shift, until/after/exchange windows, Negotiator, Pragmatic, Tired),
  Wildcard+tone forces the tone and you choose the reaction, ±beyond the scale → choose / automatic Negative, Err…hmm,
  Hardcore (keep first 3, swap one when stuck), lying, persuading (Yes / Yes but / No but / No).
- **Bulk paste (Tables):** many tables at once under `# Name` headings; splits multi-column `N: word` lines; previews gaps.
- **Track:** counters (with max) and lists with random pick.
- **Log:** sessions, scenes, notes, per-entry copy/send/delete, copy session as Markdown,
  send unsent entries to Obsidian (daily note or a set file; callout or bullet style).
- **Settings:** Obsidian, theme, backup export/restore, persistent-storage request.

## v0.7.1 — Apothecaria groundwork
- **Card-keyed tables:** Die → "Playing card". Labels `A`, `2`–`10`, `J`, `Q`, `K`, `Joker`, words (`Queen`), ranges (`J-K`, `Queen/King`).
  Handles PDF copies where the label sits mid-entry (blank-line blocks) and stacked bare `J`/`Q`/`K` labels. "A + lowercase word" is text, not
  the Ace. Bulk paste auto-detects card tables. Drawing uses the shared playing-card deck (cards stay out until reshuffled); a Joker with no
  Joker entry says so.
- **Apothecaria library:** paste reagent or ailment pages (kind auto-detected). Reagent header `Name ★ - TYPE - Locale (n) - …` (dashes need
  spaces), season lines, `Add(s) N point(s) of POISON|SWEET`, part lines `X can be CRUSHED then BOILED for [A] and [B]` (nameless
  `Can be added RAW…`, wrapped tag lines, `but CAUSES [X]` = side effect). Ailment header `1) Name - [TAG ★★] - Timer: 6`, tier from a
  "Novice Ailments" heading, `Consequence:` (wrapped). Potency accepts ★, *, or a digit. Locale spellings unified ignoring a final "s".
- **Tab** (v0.7.2: switched on in Settings → Game modules, global; the campaign Game field is just a label). Ailments by tier, Reagents (search name/tag/locale/type, season-adjusted
  values), Needs-★ filter with tap-to-set stars, Cure finder (by ailment or tags; reagent potency ≥ tag potency; unknown potency still listed).
- **Rule notes from the book (for 0.7.2+):** potion pays 20/30/40/50 by tier, Poison −4 / Sweet +4 each (cancel), 5 Poison = no pay +
  Consequence + −1 Rep; one part per reagent; foraging: event, card ≥ value finds it, else +1 point (+2 Sickle), events don't repeat per
  ailment, changing locale −1 Timer and new track; starting locales Forest/Mountain/Loch/Dungeon (first travel free); Village −1 Timer;
  downtime = 6-segment timer; 13 weeks per season then a festival; Joker or a Joker-less season = Witch clue (First Steps → About the Witch
  → The Plot Thickens → The Finale); suits ♥ villager ♦ adventurer ♣ monster ♠ repeat patient; Rep starts 5, tiers 0–10/11–21/22–32/33+.

## v0.7.2 — paste fixes from real iPad copies
- **How the book's ★ copies (tested):** ★ → nothing; ★★ AND ★★★ → a line break (so a break = "2 or 3", `guess: '2-3'`, shown ★★/★★★?, treated as 3 by the Cure finder so no cure is hidden). Parsers glue broken lines back (a header whose
  `- TYPE - Locale (n)` part landed on the next line; an unclosed `[TAG` continued on the next line) and insert a marker there,
  read as ★★. No mark → ★. Both are stored as guesses (`potGuess` / `tag.guess`), shown as amber `★?`, listed by "Needs ★",
  and confirmed by tapping a star value. Re-pasting never overwrites a confirmed value with a guess. Typed ★/*/digits are trusted.
- Book typos `[TAG}` / `{TAG]` read as `[TAG]`. An unclosed `[` is only continued when the next line starts with a symbol (e.g. `]`) or it's an ailment header; a name is only joined to a following `- TYPE -` line if it's short, has no `[` and isn't a part line.
- Ailment text run onto the header line after `Timer: n` becomes the description. Unicode line separators count as line breaks.
- Lines that look like reagent headers but can't be read are listed in the paste preview.
- Game modules toggles in Settings (`games.js`) replace the campaign-Game check. Existing Apothecaria data turns the module on.

## Service worker (v0.7.2-3)
- Network first, cache fallback (3 s timeout), cache refreshed on every successful fetch. Updates show up on a plain reload
  whenever the server is reachable; offline still works. Still bump `VERSION` in `sw.js` on every build (even re-builds of the same
  version, e.g. `tk-v0.7.2-3`) so old caches get cleared. Lesson: re-zipping 0.7.2 without a bump left the old cache-first worker
  serving stale files.

## v0.7.3 — Apothecaria play loop + editing
- **Potency is never guessed** (user's choice): only real ★ / * / digits count; otherwise `pot: null` (amber ?★) until set by
  hand. `upgradeLibrary()` (run at start-up) clears 0.7.2 guesses and pulls `Requires a … to collect` out of old descriptions.
- `Requires a Wand to collect` → `reagent.requires` (anywhere in a line; the rest stays description). Foraging warns / blocks.
- **Editor:** ✎ Edit and ＋ Reagent / ＋ Ailment open the entry as text in the book's layout (`reagentToText` / `ailmentToText`),
  re-parsed on save with a live preview. Stock ± on each reagent.
- **Tab modes:** 🧪 Play · 📚 Library · ⚙︎ Setup.
- **Play:** status (Reputation + tier, Silver, Week/Season/Year with ± fixes) → draw patient (tier choice, lower = no Reputation;
  suit → Villager/Adventurer/Monster/Repeat; Joker → clue + redraw) or pick by hand → patient card (timer ring ±, 13-turn rule
  for untimed) → shopping list (per tag: in stock ✓, else the easiest open cures; tap to hunt = travel + target) → forage (first trip
  free, moves −1 Timer + reset points, draw = event once per ailment via forced card roll on the linked table, card ≥ value or points ≥
  value finds it, Sickle +2, Timer −1, Joker = clue) → village (−1 Timer) → brew (stock checkboxes, one part per reagent, best part
  preselected; tags ✓/✗ by potency, Poison/Sweet net, side effects, tool check, pay = tier base − 4 × net, +1 Rep at own tier or
  higher, 5+ net Poison = no pay, −1 Rep; >13 turns untimed = −1 Rep) → week +1. Season change → festival + clue note if no Joker.
- **Setup:** locale → card table links and 4 Witch clue tables (global, in `state.apo`), current Witch stage, tools (buy with silver
  or tick for free; Coracle opens Bog, Broom opens Isles), story locales (unlock toggles).
- Rule notes: reputation pay uses YOUR tier (book: "as your Reputation rises you gain more silver"). No exact-tags bonus (not in book).

## v0.7.4 — Home, downtime, village, festivals
- **Pay** stays as the book has it: 20/30/40/50 by your Reputation tier, −4 per net Poison, +4 per net Sweet (confirmed with user).
- New tab mode **🏡 Home** (per campaign): familiar (name, form — drawn from a linked card table or typed — and skill, drawn or
  chosen), apprentices (Spare Room), tools, upgrades (buy or add free; slots for the reagents they hold, Travel Stone links 2
  locales), special items (toggles; Moonstone has 4 uses).
- **Skills** (familiar + apprentices stack): Forager/Hunter/Magic Eye lower values, Scout +2 Timer, Helpful ±1 on the potion,
  Shrewd +50% on silver gained, Ways = one reagent (value ≤ 7) always available, Independent = once per ailment send them to
  another locale (one card, no events), Prepared = tracks start at 2 points, Transport = free moves, Useful = counts as a chosen
  tool. Cute is narrative (noted).
- **Always available** reagents = upgrade slots + Ways: shown as "home", usable in brews without using stock.
- **Upgrades:** Garden Plot (start with 1), Hive (+1 Sweet, 4 per season, reset at season change), Fish Tank, Paddock, Basement
  Hollow, Glimmerwood Greenhouse, Meltwater Pond, Mini Mountain (slot limits and type/locale/value filters), Treatment Room (Timers
  +3, +10 silver), Spare Room (Rep 30+, adds an apprentice), Spirit Seal (narrative), Travel Stone (free moves between its pair),
  Raven Loft (listed; second-patient flow not automated yet).
- **Items:** Flower Crown (PLANT −2), Crown of Bones (ANIMAL −2), Bata's Oar (2 points a miss in the Loch), Sun Sugar (+3 Sweet),
  Moonstone (Poison → 0, 4 uses), Mimic (village services cost no Timer), Golem / Tourist Map (narrative).
- **Downtime:** 6-step timer; forage, village, spend time with someone (NPC list), apprentices collect one reagent each; End → week +1.
  Trips are shared code: `trip()` = the patient or the downtime.
- **Village** (fold-out under Forage): go (−1 Timer), Copper Fox (10 silver → adventurer, cancels one drawn event), Lunar Tower (card
  → +⌊value/2⌋ points), Bits & Bobs (−1 Timer, 3 cards; buy a reagent whose printed value equals a card for 2 × its highest value),
  Ritual Circle (Athame; once per ailment; −1 Timer; sacrificed values ≥ new reagent's value).
- **Festivals** at each season's end (`FESTIVALS`): Play shows the festival instead of patients until "Festival over". Card games:
  Flower dance (K/Q → Flower Crown), baking contest (blackjack vs 3 face-down cards → Sun Sugar), rowboat race (highest single card
  of 2 each → Bata's Oar), Spooky Soiree (K/Q → Crown of Bones), speech (+100), snowball (5 vs 4 totals), sled (10+ → 20 silver).
  Prompts stay in the user's book. Jokers anywhere → pending clue card at the top of Play.
- **Patients → NPC cards** (👤 button; links `patient.npcId`). **Obsidian:** "↗ Obsidian note" replaces an app-owned `Apothecary`
  note (status, home, familiar, stock, last 20 patients, Witch clues).

## v0.7.5 — expansion support
Read (rules pages, by search and skim): Tinker's Troubles, Bogle's Night (Halloween), Nightfall, Shimmersnow Valley, The Wild Highland,
The Cursed Coast, Dance of Seasons (early access: Spring/Summer), The Modern Witch Catalogue. Most content is tables; the rules
that repeat across them are built as general features, and one-off procedures stay manual (counters + card draws).
- **Parsers:** ailment card ranges (`1 - 4)`, `A & 2)`, `9 – Q)`, `JQK)`) → `rank`/`rankMax`; tags or Timer on the following lines;
  `Timer:` / `4`; `Timer: 1 Season (13 Weeks)` → `timerText` (no countdown); `Extra:` → `extra`; `Requires: A & B` → `needs`
  (specific reagents); tagless "special cure" ailments allowed. Reagents: any CAPS type (MADE, MINERAL, WATER), `MADE?`, missing dash
  after the type, `???` / `Only Found After …` → `where`, value on the next line, `during` seasons and lists ("Spring and Summer",
  "Summer, Harvest, and Winter"; Harvest = Autumn), `Can only be found during …` → `only`, "a [TAG] of your choosing" → `ANY`,
  "Added RAW for …" without "can be", "removes 1 point of Poison", "for 1 point of Sweet", "give it 5 Sweet". Page numbers are now
  dropped after gluing (so `Timer:` / `4` survives).
- **Card tables:** suit labels (`7♥`, `1♦`, `K♣`) and suit-only tables (`♥ Bear…`, only when no rank labels exist; otherwise "♥ - …"
  inside an entry stays text). Rolling prefers the drawn suit's entry, then a suitless one. `rollTable(…, forced, forcedSuit)`.
- **Patients:** "Ailments from" source chips per campaign (`apoPlay.sources`, [] = all); several matches → random. Brew rules: a
  tag listed twice needs separate reagents; ANY covers one missing tag; `needs` must all be in the potion; special cures count as cured
  (user checks). Timer-in-weeks ailments skip the 13-turn rule.
- **Raven Loft:** a second card = far-away patient (`patient.far`, own timer ticking with yours); Brew has "Far away" target; cured in
  time = double silver; left unfinished when the main patient ends = Consequence.
- **Golem:** task per season (Home) resolved at season end: Make builds the chosen upgrade, Search brings one of each of ≤10 reagents,
  Tend doubles next season's Hive boosts.
- **Event variants:** `state.apo.localeVariants[locale] = [{ when, table }]`, when = Night | a season | a named state. Lookup: Night (🌙
  toggle in Forage) → named state chosen in Play → season → default.
- **Quests & counters** (Play, per campaign) + patients-cured count. **Event effects** for the current forage/downtime (`trip.mods`:
  points per miss, value change per type or all). **Your own gear** (Home): name/note + points per miss, value change by type, Timer
  bonus, tags needing 1★ less, free move pair; on/off. **Shops** (Setup links card tables; Home: browse draws 5, prices read from
  "N Silver", buy → owned list).

## v0.8.0 — grid tables + fishing
- **Grid tables** (general): `table.columns = [{ name, entries }]`, written with `## Column` sections (editor and bulk paste; a
  `##` line inside a `#` table is a column, not a new table). `entries` mirrors the first column so old code keeps working.
  `applyText`, `parseColumns`, `columnTable(table, name)` (roll one column), `dieSize` = largest column, `checkTable` only reports
  overlaps (uneven columns are normal). Tables screen: rolling a grid asks for a column (chips), Reroll keeps it, other columns one tap.
  Packs keep columns.
- **Fishing** (The Cursed Coast), per campaign `apoPlay.fishing = { rod, boat, bulb }`, global `state.apo.fishingTable` (grid) and
  `fishingBoat[column]`. Home → Fishing gear (rods: Beginner's +0, Pro up to +2, Legendary up to +4; buy or choose; boat; Capture
  Bulb). Setup → Fishing (pick grid, tick columns needing a boat). Downtime → Fishing card: pick column, optional chum (5 silver,
  +2), Cast (Timer −1, Jokers are clues) → one option per rod bonus 0…max; picking one applies "Gain N Silver" (Shrewd counts),
  "Gain/Lose N Reputation", a reagent with the catch's name → stock, `[[Table]]` in the cell is rolled (e.g. Pirate Chests),
  "End Fishing" stops fishing until the downtime ends.

## Decisions
- Mythic tables (and Fate Check modifiers) are **user-supplied** (pasted from the user's own copy) so the code works with 1e or 2e and ships no copyrighted text.
  Exceptional thresholds default to the 1/5 rule (50% → 1–10 / 91–100) unless the pasted chart gives explicit triplets.
- Tarot meanings are original summaries of the common RWS-tradition readings.
- Re-draw the whole screen on change (simple). Drafts kept in `ui.drafts` so typing survives re-draws.
- Obsidian integration uses `obsidian://daily|new?…&append=true&content=…`. No plugin needed. The app switches to Obsidian when sending.

## Roadmap / ideas
- [ ] Apothecaria: upgrade changes locked to season start; Cute familiar draw-twice; Witch stage auto-advance option; reagent potency loss in the Shimmersnow fridge
- [ ] Expansion mini-games as one-tap card challenges (Wild Hunt fight, Colossus climb, Passing the Mist, Guisers vs Treats, fishing grid) if the generic counters + Cards screen feel too manual
- [x] Grid tables (v0.8.0)
### Next iteration (requested)
- [ ] Grid table type: enter column headers once, then rows as label + ranges; the app splits it into one table per row (UNE power/mood/bearing, Mythic fate chart)
- [ ] Device moves: export/import a single campaign via iCloud (exists: campaign menu → Export/Import). A plugin is optional later
- [ ] (Offered, not confirmed) "Choose focus" option for random events: pick a focus result instead of rolling it

- [ ] Mythic: NPC statistics questions, Adventure Crafter, prepared-adventure focus table
- [x] Card-keyed tables (v0.7.1)
- [x] **v0.7.3** Apothecaria play loop: per-campaign state (reputation/tier, silver, week/season, stock, tools, upgrades, familiar, unlocked
  locales, Witch clue stage), new patient draw (suit → patient type, rank → ailment), shopping list, forage track + timer ring, brew check + pay
- [x] **v0.7.4** Downtime (6-step timer, character time), Village services, upgrades (garden plots etc., seasonal yields), apprentices, familiars + skills (affect values), special items (Golem, Moonstone, Mimic, Tourist Map), festival prompts, patients as NPC cards, Obsidian note for the apothecary
- [ ] Apothecaria expansions (mostly more pasted data; any new rules as found); Apawthecaria (travel days, foraging hours, weight)
- [ ] Iron Valley tables; Shadowdark, Worlds Without Number, Traveller, Ars Magica packs as needed
- [ ] Imported "NPC relations / dialogue" GM guides as packs
- [ ] d66 / two-dice tables; roll N times / unique results; weighted list syntax
- [ ] Custom decks (user-defined card lists)
