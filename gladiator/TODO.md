# The Last Gladiator — TODO

Backlog. Tick items off as they land (move under Done).

## Balance

## Content

- [x] Arena decoration variety per 5-levels (night battles, blood-moon champions).
- [x] More legendary gear: a slow shield (parry +25% dodge), a potion flask (one auto-heal per battle).
- [x] 12 arcana instead of 8 — candidates: burn-on-stun "Cauterize", wind-then-dodge "Featherfall", tower-warded double reflect.

## Polish

- [x] **Player death cam**: mirror the foe's fall — the camera tips over as you fall, ends looking at the arena ceiling/sky, lights fade and everything goes dark before the defeat screen. (Loved the foe's falling animation; give the player one too.)
- [x] Enemy telegraphs: a brief windup glow per archetype so the AI's habit is readable (chess depth, less luck).
- [x] Screen shake on Ice Shatter is camera-only; add a sand burst under the foe's feet.
- [x] The log keeps 46 lines forever during a battle — collapse stale lines into "…" after ~10 without damage.
- [ ] Mobile: touch layout for the action bar (it fits, but test on a small phone; consider bigger hit areas for the scroll grid).
- [ ] Accessibility: respect `prefers-reduced-motion` (skip slow-mo and big shakes).
- [ ] Persist the battle log across the result screen (it's cleared on the next battle — fine, but keep it visible on the result screen).
- [ ] Mute is per-install only; add a "reduce crowd volume" slider.

## Tech

- [x] Extract the headless smoke test into `tools/smoke.js` (bun) so balance changes can be checked without a browser.
- [ ] Seedable RNG option for reproducible battles (debug + future daily-arena challenge).
- [ ] Guard: if the three.js CDN is unreachable, show a friendly overlay instead of a dead canvas.

## Done

- [x] Core loop: simultaneous turns, 4 actions, dots, 8 hidden combos, 4 archetypes + reactive AI, champions with rage.
- [x] Economy: coins, weapons (7+6 legendary), armor, consumable shields with persistent durability, scroll satchel, 3 training tracks, 5 titles, 4 arena events.
- [x] Presentation: three.js Colosseum (crowd, torches, gate, walk-in), first-person hands, full FX set, announcer, slow-mo, WebAudio SFX + crowd ambience.
- [x] Progression persistence + discovery codex (Arcana page) + first-time discovery toasts.
- [x] Headless verification: combat sim (thousands of fights) + full-flow DOM-stub smoke test.
- [x] Time-rewind: on defeat/draw, shield durability + consumed scrolls are restored; only wins consume. Grinding a level is economically free.
- [x] Playtest curve (sim-verified): fresh player first dies to the L5 champion (~battle 5–8); champions sit at ~35–45% for a prepared player (L5 43 / L10 42 / L15 48). Levers: common HP `50+level*10` + `+2%/lvl` dmg, champions flat ×1.05 HP + legendary (no dmg ramp) + 35% Dragon roll (walls keep iron), tower shield 4 uses, Venomfang poison 2/turn.
- [x] Mage cooldown tell: the mage's `spellCd` now actually ticks down at round end (was never decremented — he could cast once per fight), and one round before a recast he shows a ✨ "gathers power" log line + a pulsing status icon.
- [x] Second cast slot: **Chanting** training (200, once per battle) — a free cast slot that resolves a scroll and still takes your normal action (`Q` / Chant button, never while stunned).
- [x] Arena events surface as a persistent HUD chip under the round indicator (Whetstone dims to "used" once spent; all four events shown).
- [x] **Trickster** archetype (level 8+, weight 2): weighted-random actions with an occasional flash of insight — unreadable by design. 22 passive dodge, no shield, white mask rig. Never a champion (re-rolled) — a champion trickster measured 12–20% win rate, far below the 35–45% band.
- [x] **Last Stand**: on defeat the result screen offers one final fight — a fresh same-level foe at 50% HP for half the gold (`L` / button). No second offer after a lost last stand; losses still rewind consumables.
- [x] **Arena moods** (per 5-levels): dusk → night (L5/10/15…) → blood-moon (L10/20…) — regenerated sky, sun↔moon, fog/lighting/torch retune via `Scene.setMood()` in `scene.js`.
- [x] `tools/smoke.js` (bun): headless full-flow smoke — stubs DOM/THREE/Sfx/Scene, evals the game, plays real battles at 50× timer speed and asserts on rewards, chant, last stand, mage cooldown, trickster and mood. `bun gladiator/tools/smoke.js`.
- [x] **Bug fixes found by the smoke test**: victory gold was never actually added to `save.coins` (rewards were computed and shown but not credited), and after a Chant `state.busy` stayed `true` so keyboard input dead (only clicks worked) — `askPlayer()` now clears it.
- [x] **Legendary gear II**: **Tortoise Aegis** 🐢 shield (420, 6 uses) — every successful block grants +25% dodge for 2 rounds (`aegis` state in `combat.js`, procs through `res.procs`); **Relics** shop tab with the **Phial of the Healer** 🧪 (300) — once per battle the first drop below 30% HP auto-restores 30 (`save.relics[]`, triggered in `runRounds`, 🧪 icon on the player panel while armed).
- [x] **Arcana II (12 total)**: **Cauterize** (fire a stunned foe → it burns 4/round ×3), **Featherfall** (dodge an enemy spell → next attack +25%, `feather` state), **Mirror Ward** (Enchanted Robe + Tower Shield → reflect the *full* enemy spell back, upgrades Warded Block's half), **Heart of the Sand** (win a battle you dipped below 25% HP in → +50% coins, `state.lowHpEver`, applied after title mult / before last-stand halving). Each has its own proc/counter animation + log line; `tools/smoke.js` gained deterministic engine unit checks for the three state-based ones.
- [x] **Player death cam**: on defeat `Scene.playerDie()` — the first-person camera sinks to the sand and tips over, ending staring at the arena sky; the lights gutter out and a `#blackout` overlay fades the frame to black over ~2.5 s, then the DEFEAT screen appears on top of the dark (`endBattle` delays it 2.6 s). Reset in `sceneStart()` for the next fight.
- [x] **Enemy telegraphs**: the foe now **pre-commits** his plan at round start (`combat.foeCommit()`, called after `beginRound`) from visible state only — your stamina + recent actions, never your hidden current pick — and a brief colored **windup glow** (`Scene.foeTelegraph`) flashes that intent (red attack / blue defend / green dodge / purple cast), pulsing ~1.1 s then fading. Tricksters never telegraph (the unreadable one). The AI is unchanged (it only ever used visible state), so champion win rates are preserved; the glow is pure information for the player.
