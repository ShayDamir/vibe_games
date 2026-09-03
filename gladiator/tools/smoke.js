// The Last Gladiator — headless smoke test (run: bun gladiator/tools/smoke.js)
// Stubs the DOM, three.js, Sfx, Ambience and Scene, evals data/combat/game,
// boots the game, then plays real battles through the keydown handler while
// asserting on the log, reward math, chant, last stand, mage cooldown and the
// trickster. All timers run at 2% speed so a full battle takes ~1 s of wall
// time. Any unhandled promise rejection or failed assertion exits non-zero.
// NOTE: no 'use strict' here on purpose — the game files are plain scripts
// and must leak their globals (save, combat, Game) out of the eval.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---------- timers: the whole world runs 50x faster ----------
const realSetTimeout = setTimeout;
global.setTimeout = (fn, ms) => realSetTimeout(fn, Math.max(1, (ms || 0) * 0.02));

// ---------- DOM stub ----------
function makeEl(id) {
  const cls = new Set();
  const e = {
    id, children: [], style: {}, title: '', disabled: false, className: '', hidden: false,
    _innerHTML: '', textContent: '',
    offsetWidth: 0, scrollTop: 0, scrollHeight: 0, _handlers: {},
    classList: {
      add: (c) => cls.add(c), remove: (c) => cls.delete(c),
      toggle: (c, on) => { if (on === undefined) { if (cls.has(c)) cls.delete(c); else cls.add(c); } else if (on) cls.add(c); else cls.delete(c); },
      contains: (c) => cls.has(c),
    },
    get firstChild() { return this.children[0] || null; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    set innerHTML(v) { this._innerHTML = v; if (v === '') this.children.length = 0; },
    get innerHTML() { return this._innerHTML; },
    addEventListener(type, fn) { (this._handlers[type] = this._handlers[type] || []).push(fn); },
    dispatch(type) { (this._handlers[type] || []).forEach((fn) => fn({ target: this, stopPropagation() {} })); },
    querySelector(sel) {
      if (sel === '.log-collapsed') {
        for (const c of this.children) if ((c.className || '').indexOf('log-collapsed') !== -1) return c;
        return null;
      }
      return null;
    },
    closest() { return null; },
  };
  return e;
}
const winHandlers = {};
const actionBtns = ['attack', 'dodge', 'defend', 'cast', 'chant'].map((a) => ({
  getAttribute: (k) => (k === 'data-act' ? a : null),
  classList: makeEl('act-' + a).classList,
}));
global.window = { addEventListener: (t, fn) => { (winHandlers[t] = winHandlers[t] || []).push(fn); } };
const cache = {};
global.document = {
  getElementById: (id) => (cache[id] = cache[id] || makeEl(id)),
  createElement: (tag) => makeEl(tag),
  querySelectorAll: (sel) => (sel === '#action-bar .act-btn' ? actionBtns : []),
};
const $id = (id) => document.getElementById(id);
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
global.confirm = () => false;
global.location = { reload() {} };

// ---------- three.js / scene / audio stubs ----------
class Vector3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } }
global.THREE = { Vector3 };
global.Sfx = new Proxy({}, { get: () => () => {} });
global.Ambience = { start() {}, setBattle() {}, stop() {}, setCrowdVolume() {} };
const P = () => Promise.resolve();
const moodCalls = [];
const telegraphCalls = [];
let deathCalls = 0;
global.Scene = {
  initScene() {}, sceneStart: P, rebuildEnemyVisual() {}, buildPlayerView() {}, enemyPos() { return -3.9; },
  playerDie() { deathCalls++; return P; },
  setMood(m) { moodCalls.push(m); },
  foeTelegraph(k) { telegraphCalls.push(k); },
  eAnim: { attack() {}, hurt() {}, defend() {}, dodge() {}, die() {}, cast() {}, stun() {}, rest() {} },
  handAttack() {}, setEnemyAura() {}, dodgeLean() {}, removeIceShell() {},
  fxSwingStreak: P, fxImpact() {}, fxBlock() {}, fxShieldBreak() {}, fxShatter: P,
  fxSpellProjectile: P, fxWater: P, fxEarth: P, fxWind: P, fxIce: P,
  fxHeal() {}, fxHealAt() {}, fxHitFoe() {}, fxShadowPuff() {}, fxStun() {},
  fxRage() {}, fxConfetti() {}, fxHitPlayer() {}, fxIceShell() {}, ghostAt() {},
  crowdRoar() {}, floatWorld() {}, floatMe() {}, triggerSlowmo() {},
  updateEnemyShieldVisual() {}, removeEnemyShieldMesh() {},
};

process.on('unhandledRejection', (e) => { console.error('UNHANDLED REJECTION:', e && e.stack || e); process.exit(2); });

// ---------- load the game ----------
eval(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'combat.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8'));

const sleep = (ms) => new Promise((r) => realSetTimeout(r, ms));
const keydown = (k) => (winHandlers.keydown || []).forEach((fn) => fn({ key: k }));
const assert = (cond, msg) => { if (!cond) throw new Error('ASSERT: ' + msg); };
// deterministic input stream: the battle RNG is seeded per section (seedRng)
// and the player's action picks come from their own PRNG, so a full smoke run
// is reproducible — random play used to flake the "at least one victory" check
const inputRnd = mulberry32(987654321);
const logText = () => $id('log').children.map((c) => c._innerHTML || '').join('\n');
let globalCollapsed = false; // set by playBattle when a '…' fold appears in any battle

(async () => {
  (winHandlers.DOMContentLoaded || []).forEach((fn) => fn());
  $id('btn-start').dispatch('click');
  assert($id('screen-hub').classList.contains('on'), 'hub visible after intro');

  // ---------- play one battle to a result, with random-ish actions ----------
  // Returns { title, chant, phial, nan } — the flags are captured *during*
  // the battle. The log trims at 46 lines, so an early event (round-1 chant,
  // an early phial heal) is gone from #log by the end of a long fight; we
  // must observe it live, not read the final log.
  async function playBattle(useChant) {
    $id('btn-fight').dispatch('click');
    const t0 = Date.now();
    let chantUsed = false, sawChantLine = false, sawPhial = false, sawNaN = false, sawCollapsed = false;
    while (Date.now() - t0 < 60000) {
      const lt = logText();
      if (!sawChantLine && lt.includes('chant the')) sawChantLine = true;
      if (!sawPhial && lt.includes('phial')) sawPhial = true;
      if (!sawNaN && lt.includes('NaN')) sawNaN = true;
      if ($id('log').querySelector('.log-collapsed')) { sawCollapsed = true; globalCollapsed = true; }
      if ($id('screen-result').classList.contains('on'))
        return { title: $id('result-title').textContent, chant: sawChantLine, phial: sawPhial, nan: sawNaN, collapsed: sawCollapsed };
      const bar = $id('action-bar');
      const menu = $id('scroll-menu');
      if (bar.classList.contains('on') && !menu.classList.contains('on')) {
        if (useChant && !chantUsed && !$id('chant-btn').hidden) {
          keydown('q');
          // wait for the menu to actually open (q is refused when stamina < 18)
          let opened = false;
          for (let w = 0; w < 20 && !opened; w++) {
            if (menu.classList.contains('on')) opened = true;
            else await sleep(15);
          }
          const grid = $id('scroll-grid');
          const fire = grid.children[0]; // SCROLL_ORDER starts with fire
          if (opened && fire && !fire.className.includes('empty')) { fire.dispatch('click'); chantUsed = true; }
          else keydown('escape'); // refused or no fire scroll — retry next round
          await sleep(120);
          continue;
        }
        const r = inputRnd();
        keydown(r < 0.6 ? 'a' : r < 0.75 ? 'd' : r < 0.9 ? 's' : 'r');
      }
      await sleep(25);
    }
    throw new Error('battle did not end in 60 s');
  }

  // ---------- 1. early battles + reward math + soft checks ----------
  seedRng(20260907); // pin the battle RNG: enemy rolls, events and combat are replayable (this seed draws twice in the first 10 battles)
  save.weapons = ['fists', 'sword'];
  save.equipped.weapon = 'sword';
  let sawDefeat = false, sawEventChip = false, sawMageTell = false, sawCollapsed = false;
  let victories = 0;
  for (let i = 0; i < 10 && !sawDefeat; i++) {
    const before = save.coins;
    const lv = save.wins + 1;
    const r = await playBattle(false);
    const title = r.title;
    if (r.nan) throw new Error('NaN leaked into the battle log');
    if (r.collapsed) sawCollapsed = true;
    if (!sawEventChip && logText().includes('Arena event:')) {
      const chip = $id('event-chip');
      if (!chip.hidden && chip.textContent.length > 0) sawEventChip = true;
    }
    if (!sawMageTell && logText().includes('gathers power')) sawMageTell = true;
    if (title === 'VICTORY' || title === 'MUTUAL SLAUGHTER — YOU LIVE') {
      victories++;
      const reward = save.coins - before;
      const base = 24 + lv * 9;
      // headroom: +25% crowd event, streak bonus, title mult, Heart of the Sand x1.5
      const lo = base - 2, hi = Math.round((base + 2 * Math.max(0, save.streak - 1) + base * 0.25) * 1.75);
      assert(reward >= lo && reward <= hi, 'reward ' + reward + ' out of band for level ' + lv + ' (base ' + base + ')');
    } else if (title === 'DEFEAT') {
      sawDefeat = true;
      assert(deathCalls >= 1, 'playerDie (death cam) was not triggered on defeat');
      // last stand must be offered on a plain defeat
      assert(!$id('btn-laststand').hidden, 'last stand button shown on defeat');
      const lsBefore = save.coins;
      $id('btn-laststand').dispatch('click');
      const rls = await playBattle(false);
      if (rls.nan) throw new Error('NaN leaked into the last-stand battle log');
      const lsTitle = rls.title;
      if (lsTitle === 'VICTORY' || lsTitle === 'MUTUAL SLAUGHTER — YOU LIVE') {
        const base = 24 + lv * 9;
        const reward = save.coins - lsBefore;
        // a full win is at most ~(base + streak + event) * title — halved it
        // must stay under the plain base
        assert(reward < base, 'last stand reward ' + reward + ' not halved (base ' + base + ')');
      }
      assert($id('btn-laststand').hidden, 'no last stand offered after a last stand');
      $id('btn-continue').dispatch('click');
      break;
    } else {
      assert(title === 'DRAW', 'unexpected result title ' + title);
      // the split purse: a draw must pay at least the 25% floor (no damage,
      // no arcana, no event, no titles) and never more than the full ceiling
      // (0.7 base purse + 0.3 base spectacle + 25% crowd event, x1.1 titles)
      const dr = save.coins - before;
      const db = 24 + lv * 9;
      assert(dr >= Math.round(db * 0.25) - 1, 'draw paid less than the 25% purse floor: ' + dr + ' (base ' + db + ')');
      assert(dr <= Math.round(db * 1.0 * 1.25 * 1.1) + 2, 'draw paid more than the purse ceiling: ' + dr + ' (base ' + db + ')');
      if (dr === 0) throw new Error('a draw paid zero — the split purse is dead');
      console.log('draw purse OK (+' + dr + ' at level ' + lv + ')');
    }
    $id('btn-continue').dispatch('click');
  }
  assert(victories >= 1, 'no victories in 10 battles');
  console.log('early battles OK (' + victories + ' wins, event chip ' + (sawEventChip ? 'seen' : 'not seen') + ', mage tell ' + (sawMageTell ? 'seen' : 'not seen') + ', log collapse ' + (sawCollapsed ? 'seen' : 'not seen') + ')');

  // ---------- 2. chant (Chanting training + a fire scroll) ----------
  save.train.chanting = 1;
  save.scrolls.fire = 2;
  save.equipped.weapon = 'sword';
  const r2 = await playBattle(true);
  assert(r2.chant, 'chant was never used in battle');
  $id('btn-continue').dispatch('click');
  console.log('chant OK (battle ended: ' + r2.title + ')');

  // ---------- 3. unit checks (no battle needed) ----------
  // mage spell cooldown ticks down at round end
  combat.reset();
  let mage = null;
  for (let i = 0; i < 200 && !mage; i++) {
    const f = combat.makeEnemy(6);
    if (f.arch === 'mage') mage = f;
  }
  assert(mage, 'no mage rolled in 200 enemies (L6)');
  combat.setFoe(mage);
  mage.spellCd = 2;
  combat.tickDots();
  assert(mage.spellCd === 1, 'spellCd did not tick 2 -> 1, got ' + mage.spellCd);
  combat.tickDots();
  assert(mage.spellCd === 0, 'spellCd did not tick 1 -> 0, got ' + mage.spellCd);
  console.log('mage cooldown OK');

  // trickster: present at 8+, never a champion
  let sawTrickster = false, champTrickster = false;
  for (let i = 0; i < 400; i++) {
    const f = combat.makeEnemy(8);
    if (f.arch === 'trickster') { sawTrickster = true; assert(!f.champion, 'champion trickster at level 8'); }
  }
  for (let i = 0; i < 400; i++) {
    const f = combat.makeEnemy(10);
    if (f.champion) champTrickster = (champTrickster || f.arch === 'trickster');
  }
  assert(sawTrickster, 'no trickster rolled at level 8');
  assert(!champTrickster, 'trickster appeared as a champion');
  console.log('trickster OK');

  // mood is set on every battle, always a known mood
  assert(moodCalls.length >= 1, 'Scene.setMood never called');
  assert(moodCalls.every((m) => m === 'dusk' || m === 'night' || m === 'bloodmoon'), 'unknown mood passed to setMood');
  console.log('mood OK (' + moodCalls.length + ' calls)');

  // ---------- 3b. enemy telegraphs ----------
  // the foe pre-commits at round start (foeCommit) from visible state only, and
  // game.js flashes that intent as a windup glow. The combat side must always
  // yield a valid intent; the scene side must only ever get known kinds.
  const validIntent = { idle: 1, rest: 1, attack: 1, defend: 1, dodge: 1, cast: 1 };
  combat.reset();
  for (let lv = 1; lv <= 12; lv += 3) {
    const f = combat.makeEnemy(lv);
    combat.setFoe(f);
    combat.beginRound();
    combat.foeCommit();
    assert(f.committed && validIntent[f.committed.type], 'foeCommit produced an invalid intent at level ' + lv + ': ' + JSON.stringify(f.committed));
  }
  assert(telegraphCalls.length >= 1, 'Scene.foeTelegraph was never called during the battles');
  assert(telegraphCalls.every((k) => k === 'none' || k === 'attack' || k === 'defend' || k === 'dodge' || k === 'cast'), 'unknown telegraph kind passed to Scene.foeTelegraph');
  console.log('telegraph OK (' + telegraphCalls.length + ' calls)');

  // ---------- 4. a level-5 battle: the night sky + chant reset ----------
  // section 2 used the chant, so if the per-battle reset is broken the
  // chant button stays hidden and this battle never chants
  save.wins = 4; // force level 5 (a night battle, a champion)
  const r4 = await playBattle(true);
  assert(r4.title === 'VICTORY' || r4.title === 'DEFEAT' || r4.title === 'DRAW' || r4.title === 'MUTUAL SLAUGHTER — YOU LIVE', 'unexpected title ' + r4.title);
  assert(moodCalls[moodCalls.length - 1] === 'night', 'level 5 battle should set the night mood, got ' + moodCalls[moodCalls.length - 1]);
  // section 2 already used the chant, so a fresh battle only chants if the
  // per-battle reset works (captured live — the log trims long battles)
  assert(r4.chant, 'chant was not available in a fresh battle (chantUsed not reset)');
  $id('btn-continue').dispatch('click');

  // ---------- 5. Tortoise Aegis: a successful block steadies the bearer ----------
  save.shields = save.shields.concat(['aegis']);
  save.shieldDur.aegis = 6;
  save.equipped.shield = 'aegis';
  save.equipped.weapon = 'sword';
  combat.reset();
  const aegisFoe = combat.makeEnemy(3);
  combat.setFoe(aegisFoe);
  const meA = combat.me;
  const baseDodge = combat.dodgeChance(meA);
  meA.state.frozen = 1;      // a frozen fighter cannot dodge — the block is guaranteed
  meA.defending = true;
  combat.resolveAttack(aegisFoe, meA, { round: 1, event: null, firstStriker: 'foe', whetUsed: true });
  meA.state.frozen = 0;
  assert(meA.state.aegis === 2, 'aegis block did not grant the steady, got ' + meA.state.aegis);
  assert(combat.dodgeChance(meA) === Math.min(95, baseDodge + 25), 'aegis steady missing from the dodge roll: ' + combat.dodgeChance(meA) + ' vs base ' + baseDodge);
  combat.tickDots();
  assert(meA.state.aegis === 1, 'aegis steady did not decay');
  console.log('aegis OK');

  // ---------- 6. the healer's phial: auto-heal below 30% ----------
  save.relics.push('flask');
  save.wins = 8; // level 9: a hammer foe that will drop the player below 30%
  save.equipped.weapon = 'fists';
  save.equipped.shield = null;
  let phialSeen = false;
  for (let i = 0; i < 4 && !phialSeen; i++) {
    const r6 = await playBattle(false);
    const t6 = r6.title;
    assert(t6 === 'VICTORY' || t6 === 'DEFEAT' || t6 === 'DRAW' || t6 === 'MUTUAL SLAUGHTER — YOU LIVE', 'unexpected title ' + t6);
    if (r6.nan) throw new Error('NaN leaked into the phial battle log');
    phialSeen = r6.phial;
    $id('btn-continue').dispatch('click');
  }
  assert(phialSeen, 'the phial never triggered across 4 battles at level 9');
  console.log('phial OK');

  // ---------- 7. the new arcana (engine unit checks) ----------
  // Cauterize: fire on a stunned foe sets it ablaze
  combat.reset();
  let cRes = null, cFoe = null, tries = 0;
  do {
    cFoe = combat.makeEnemy(5);
    combat.setFoe(cFoe);
    cFoe.state.stun = 1;
    cRes = combat.resolveSpell(combat.me, cFoe, 'fire');
    tries++;
  } while (cRes.dodged && tries < 40);
  assert(!cRes.dodged, 'cauterize test: fire was dodged 40 times in a row');
  assert(cFoe.state.burn && cFoe.state.burn.turns === 3, 'cauterize did not set the burn');
  assert(cRes.combos.indexOf('cauterize') !== -1, 'cauterize combo not recorded');
  console.log('cauterize OK');

  // Featherfall: dodging a foe spell marks the next attack +25%
  const fMe = combat.me;
  fMe.dodgeBase = 999; // dodge roll clamps at 95 — retry until it slips
  let feRes = null, tries2 = 0;
  do {
    const fFoe = combat.makeEnemy(5);
    combat.setFoe(fFoe);
    feRes = combat.resolveFoeSpell(fFoe, fMe, 'fire');
    tries2++;
  } while (!feRes.dodged && tries2 < 60);
  assert(feRes.dodged, 'featherfall test: a 95% dodge failed 60 times in a row');
  assert(fMe.state.feather === true, 'featherfall did not mark the next attack');
  assert(feRes.combos.indexOf('featherfall') !== -1, 'featherfall combo not recorded');
  fMe.dodgeBase = 15;
  combat.foe.state.frozen = 1; // the foe cannot dodge — the strike must land
  combat.resolveAttack(fMe, combat.foe, { round: 9, event: null, firstStriker: 'me', whetUsed: true });
  assert(fMe.state.feather === false, 'feather was not consumed on the attack');
  console.log('featherfall OK');

  // Mirror Ward: tower shield + enchanted robe reflect a foe spell at full strength
  save.armors = save.armors.concat(['magic']);
  save.equipped.armor = 'magic';
  save.shields = save.shields.concat(['tower']);
  save.shieldDur.tower = 4;
  save.equipped.shield = 'tower';
  combat.reset();
  const mMe = combat.me;
  const mFoe = combat.makeEnemy(5);
  combat.setFoe(mFoe);
  mMe.defending = true;
  mMe.state.frozen = 1; // a frozen fighter cannot dodge — the block is guaranteed
  const mRes = combat.resolveFoeSpell(mFoe, mMe, 'fire');
  assert(mRes.blocked, 'mirror ward test: the spell was not blocked');
  assert(mRes.counters.length === 1 && mRes.counters[0].reason === 'mirror', 'mirror counter missing');
  assert(mRes.counters[0].dmg === mFoe.spellPower, 'mirror did not reflect the full spell power: ' + mRes.counters[0].dmg + ' vs ' + mFoe.spellPower);
  assert(mRes.combos.indexOf('mirrorward') !== -1, 'mirrorward combo not recorded');
  console.log('mirrorward OK');

  // ---------- 8. seeded RNG: reproducible battles ----------
  // same seed -> identical rng sequence and identical enemy generation, so a
  // ?seed= battle replays exactly.
  seedRng(20260902);
  const sd1 = [rnd(), rnd(), rnd()].map((x) => x.toFixed(6)).join(',');
  seedRng(20260902);
  const sd2 = [rnd(), rnd(), rnd()].map((x) => x.toFixed(6)).join(',');
  assert(sd1 === sd2, 'same seed must yield the same rng sequence');
  const mkSeededFoe = (s) => { seedRng(s); return combat.makeEnemy(5); };
  const fA = mkSeededFoe(5150), fB = mkSeededFoe(5150);
  assert(fA.arch === fB.arch && fA.name === fB.name && fA.hp === fB.hp && fA.weapon === fB.weapon,
    'same seed must generate the same enemy');
  console.log('seed OK');

  // the log fold is a soft QoL check (like the mage tell): it only fires once a
  // battle accumulates >10 non-damage lines in a row, which long battles do.
  console.log('log collapse ' + (globalCollapsed ? 'seen' : 'not seen'));
  console.log('\nSMOKE OK');
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e && e.stack || e); process.exit(1); });
