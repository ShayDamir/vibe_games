# Der · Die · Das

The German gender shooter: nouns fly at you through a 3D synthwave tunnel, you blast the correct article, and every word teaches the rule behind its gender.

## How the game works

- Three guns — `1` / tap = **der** (blue), `2` = **die** (pink), `3` = **das** (yellow). Shoot the word before it slips past.
- Correct hit: the article glues onto the word, the word gets painted in the gender color, you earn coins. Wrong: the word explodes and the streak is lost. A miss costs nothing.
- After every word a reveal card shows the translation and the gender rule — a rule chip, a red **EXCEPTION** chip, or a red **NO RULE** chip ("memorize it with the article"). Compound words additionally show which word they take the gender of, words with a `mnemo` show it in gold under the chip, and dual-gender words (`genders`) note that both articles are correct. The card stays up longer after a wrong answer or miss (5.5s vs 2.7s) so it can be read and memorized. Space pauses to read.
- Scoring: correct = `1 + floor(streak/5)` coins; every 5-streak also speeds the words up. Streak resets each round and on a wrong answer, so a perfect 20-word round pays exactly **54 coins** — use that as the unit when tuning shop prices.
- Rounds: up to 20 unique words — never a duplicate in one round, shorter if the pool is small, and at most 3 rule-less words (`CFG.maxNoRule`).
- Error recovery: the game keeps the last 10 failed words and mixes up to 3 of them into every round. Getting one right this time pays double coins, the card carries an ERROR RECOVERY badge, and the word leaves the list.
- Levels: the pool is gated by CEFR level — the game starts at a1, and a2/b1/b2 are unlocked in the shop for 160 coins each (≈ 3 perfect rounds). A level only shows up while it still has locked words to offer.
- Rule Shop (between rounds): a fresh random offer of up to 2 locked rules per gender (ending rules 25/30 coins, semantic group rules 30 — two rules ≈ one perfect round). Unlocking a rule adds its words to the pool from the next round. The shop also has a RESET TO A1 button that wipes the save (coins, rules, levels, failure list) behind two confirmations.
- Progress (coins, unlocked rules, unlocked levels, rounds played, best streak, failure list) persists in localStorage under `der_die_das_save_v1`.

## Files

| File | Role |
|---|---|
| `index.html` | DOM skeleton + overlays. Script order matters: three.js (CDN) → `rules.js` → `words.js` → `game.js`. |
| `game.js` | The whole engine: three.js scene, state machine (`menu/intro/fly/reveal/gap/roundend/shop`), scoring, shop, persistence. Contains no content — words and rules never live here. |
| `words.js` | The dictionary `window.GERMAN_WORDS`. |
| `rules.js` | The gender rules `window.GENDER_RULES`. |
| `style.css` | All styling (gun pads, HUD, chips, shop, panels). |
| `tools/` | Python maintenance tools for the word data (see below). |
| `TODO.md` | Backlog — tick items off as they land. |

## words.js format

One object per word; required fields `w`, `g`, `en`:

```js
{ w: 'Mutter', g: 'die', en: 'mother', rule: 'der_er', exception: true,
  note: 'Classic trap: -er → der — but it is die Mutter. Memorize it with the article!' },
{ w: 'Haus',       g: 'das', en: 'house', level: 'a1' },
{ w: 'Abendessen', g: 'das', en: 'dinner', level: 'a1', compound: true, head: 'Essen', rule: 'das_inf' },
{ w: 'kranken',    en: 'compound part: sick (der Kranke)', part: true },
```

- `rule` — rule id from `rules.js` (ending rule or semantic group rule). **Optional**: a word without a rule is allowed (max 3 per round, revealed with the NO RULE chip).
- `level` — CEFR level `a1…c2`. Optional; missing counts as `a1`. The round pool only draws from unlocked levels.
- `exception: true` — the word breaks its rule (red chip); must carry a `note`. If the word matches an ending rule *and* a semantic group and both fail, the note must mention **both** rules (true exception).
- `mnemo` — optional short memory hook (e.g. *Wasser*: "An element — like das Feuer, das Eis, das Gold."), shown in gold under the rule/exception chip. Not a rule — just an easy-to-memorize explanation; collect more as they're found.
- `genders` — optional; the word legitimately takes more than one article (Duden prints e.g. *der oder das Laptop*). `g` stays the article the game teaches; the value is shown under the translation on the reveal card ("both articles are correct").
- `compound: true, head: '<Word>'` — the word is a compound noun; `head` is its head word (the part that carries the gender, always the *last* part — *Fahrrad* = Fahrr + **Rad**, *Arbeit* + s + **platz**). Compound nouns take the gender of the head word, so the reveal card shows it. Detection is `wordslib.find_compound` (split into two dictionary words, plain or with a linking letter — Fugen-s *Arbeit*+s+**platz**, -n *Familie*+n+**fest**, -en *Student*+en+**wohnung**, -es *Bund*+es+**tag**); words whose first part is a verb stem (Fahrrad) can't be auto-split and are marked manually. The first part may be a non-playable `part` entry, so verb stems (*Fahr-*), adjectives (*Haupt-*), prepositions (*Aus-*) and inflected forms (*kranken*, *kassen* = kasse+n) split too — *Krankenhaus* = kranken + **Haus**.

  A compound noun takes its gender from the head — so it never falls back to its own (conflicting) ending rule and is never turned into an exception against it. If the head carries a fitting rule it inherits it; otherwise the compound is rule-less (its chip shows "compound of the X"). This is why *das Rathaus* stays gender-clear as a compound of **das Haus**, even though it ends in -us. Some "ending" rules are really compound rules in disguise — *der_tag* was folded into day words as compounds of **der Tag** (head) plus the `der_days` semantic group for the day names.

  Note on Fugen-*n*: the `+n` in a compound (Familie + n + Fest) is handled a plain word/part ending in the inflected form — either by a Fugen-n pass of `find_compound` (requires both parts to be dictionary words, e.g. *Kundendienst* = kunde + n + **dienst**), or by an explicit inflected `part` when the plain split would otherwise fail (*kassen* for *Kassenzettel*).
- `part: true` — a non-playable compound building block (e.g. *kranken* in *Krankenhaus*, *aus* in *Ausland*, *weihnacht* in *Weihnachtsbaum*). It carries only `w` and `en`, has no article/gender of its own, is never drawn in a round (filtered out of the pool in `game.js`), and exists only so `find_compound` can split the word. The **head** of a compound must always be a playable noun.

Invariants (enforced by `tools/validate_words.py`):

- ending rules: the assigned rule must be the word's **longest-ending match** (same logic as the game's `splitByEnding`)
- semantic rules: the word must be a member of the group in `tools/semantic_groups.py`, and a word in a group must not be rule-less
- tie-break: when ending rule and semantic group agree on gender, the ending rule is assigned; when only one fits the word's gender, that one wins
- compound words: the head must exist in words.js (and be a playable noun — never a `part`), `g` must equal the head's `g`, and a non-exception word may only carry a rule that fits its gender. The head's rule wins over the word's own ending rule; a head that is itself an exception propagates no rule, and a compound never falls back to its own (conflicting) ending rule — it is rule-less instead.
- non-exception: `g` equals the rule's gender; exception: `g` differs from it
- no duplicate words, no plurals (the game teaches singular nouns)

## rules.js format

`id`, `gender`, `endings` (array, or `null` for non-ending rules), `formula` (short label, e.g. `-ung → die`), `description`, `cost` (shop price; ignored when `unlockedByDefault`), `unlockedByDefault`, optional `examples`. The shop auto-generates examples from non-exception words of the rule in words.js, so every rule should own words there. A semantic rule may carry `preferred: true` (used by `die_adjectival`) — this lets the semantic rule win the tie-break over an *agreeing* ending rule, so words like `Bekannte` show the adjectival rule chip instead of `-e → die`.

Two kinds of rules (61 total: 32 ending + 29 semantic group rules):

- **ending rules** (`endings: [...]`) — 2 per gender unlocked from the start, the rest purchasable.
- **semantic group rules** (`endings: null`) — noun categories ("drinks → der", "hotels → das", …). Membership is NOT stored in words.js — it lives in `tools/semantic_groups.py` (rule id → set of words). words.js only references the rule id.

## Tools (Python 3, no dependencies)

```sh
python3 tools/validate_words.py            # validate words.js + rules.js — run after editing data
python3 tools/ingest_words.py              # dry run: parse ../../words/<level>.txt, show what would be added
python3 tools/ingest_words.py --write      # append the new words to words.js, grouped by level
python3 tools/assign_rules.py              # dry run: what a (re)assignment of rule ids would change
python3 tools/assign_rules.py --write      # apply it (surgical edits; hand-written notes are kept)
python3 tools/check_genders.py             # cross-check genders against duden.de (--words/--limit to scope)
```

- `ingest_words.py` reads `german – english` list lines out of `../../words/a1.txt … c2.txt` (skips prose, phrases and example sentences; handles `der X / die Y` compounds and `word, plural` parts; `SKIP_WORDS` excludes known plurals), assigns `level` from the file name, marks compound nouns and determines the rule on the fly (`wordslib.desired_state`: own ending match, own semantic group, or the head word's rule, with the tie-break), and dedupes against existing words. It is idempotent — a second run finds nothing. The `!` lines in the dry-run output are auto-generated exceptions to review.
- `assign_rules.py` re-derives every word's rule/exception/note/compound from rules.js + semantic_groups.py (e.g. after a semantic group grows or a new head word is added). Manual `compound` marks (verb-stem first parts like *Fahrrad*) are kept as-is. It iterates the state until it settles, so a head word that receives its rule in this very run is still inheritable by compounds listed earlier in the file. Run it, review the dry run, then `--write`, then `validate_words.py`.
- `validate_words.py` exits 1 on errors: wrong/missing rule assignment (ending AND semantic, including tie-break violations), compound invariants (head exists, head's gender, inherited rule fits), gender contradictions, duplicates, unknown rule ids, bad levels, and (when node or bun is on PATH) JS syntax.
- `check_genders.py` fetches `duden.de/rechtschreibung/<Wort>` for every playable word and compares the article in the page `<h1>` with the gender in words.js. Slugs are ASCII transliterations (Schlüssel → `Schluessel`, Änderung → `Aenderung`). Words Duden does not know (404 — e.g. suffixed slugs like `Mutter_Frau`) or failing requests are skipped, never guessed. Dual-gender lemmas (`der oder das`) match when words.js uses any of the printed articles. Results cache in `tools/cache/duden_genders.json` (saved per word, so runs resume after interruption); exit 1 on any mismatch.
- `wordslib.py` holds the shared rules.js/words.js parsers, the rule matcher, the compound-word split (`find_compound`), and the rule decision incl. tie-break and head inheritance (`assign_rule`, `desired_state`) — extend it instead of duplicating that logic in new scripts.

## No test framework

Verification = `tools/validate_words.py` for the data, opening `index.html` in a browser for the game (internet required for the CDN), and quick `bun -e` / node snippets for engine logic (stub `window` to load `words.js`/`rules.js` standalone).
