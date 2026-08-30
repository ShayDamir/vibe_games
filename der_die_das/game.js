/* ==========================================================================
   Der · Die · Das — game engine
   --------------------------------------------------------------------------
   All content lives in words.js (window.GERMAN_WORDS) and
   rules.js (window.GENDER_RULES). Extend those files to grow the
   dictionary and the shop — this file does not need to change.
   ========================================================================== */
(function () {
'use strict';

function fatal(msg) {
  document.getElementById('fatal-msg').textContent = msg;
  document.getElementById('overlay-fatal').classList.remove('hidden');
}
if (!window.THREE) {
  fatal('three.js failed to load from the CDN. Check your internet connection and reload the page.');
  return;
}

/* ============================ data & helpers ============================ */

const WORDS = window.GERMAN_WORDS || [];
const RULES = window.GENDER_RULES || [];
const RULE_BY_ID = {};
RULES.forEach(function (r) { RULE_BY_ID[r.id] = r; });
const WORD_BY_NAME = {};
WORDS.forEach(function (w) { WORD_BY_NAME[w.w.toLowerCase()] = w; });

/* CEFR word levels in unlock order. a1 is in play from the start;
   further levels are unlocked in the shop for CFG.levelCost, in order. */
const WORD_LEVELS = ['a1', 'a2', 'b1', 'b2', 'c1', 'c2'];

const G = {
  der: { name: 'DER', color: '#7dd3fc' },
  die: { name: 'DIE', color: '#f472b6' },
  das: { name: 'DAS', color: '#fde047' }
};

const esc = function (s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
};
const rand = function (a, b) { return a + Math.random() * (b - a); };
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* Split a word into (base, highlighted ending) using the rule's endings. */
function splitByEnding(text, endings) {
  if (!endings || !endings.length) return { base: text, end: '' };
  const lower = text.toLowerCase();
  let best = null;
  for (const e of endings) {
    const el = e.toLowerCase();
    if (lower.length > el.length && lower.endsWith(el) && (!best || el.length > best.length)) best = el;
  }
  if (!best) return { base: text, end: '' };
  const i = text.length - best.length;
  return { base: text.slice(0, i), end: text.slice(i) };
}

function highlightHTML(text, endings) {
  const parts = splitByEnding(text, endings);
  return esc(parts.base) + (parts.end ? '<span class="hl">' + esc(parts.end) + '</span>' : '');
}

/* Examples shown in the shop / rule popup: non-exception words of this rule. */
function exampleWords(rule, n) {
  let ex = WORDS.filter(function (w) { return w.rule === rule.id && !w.exception; }).map(function (w) { return w.w; });
  if (!ex.length && rule.examples) ex = rule.examples.slice();
  return ex.slice(0, n || 4);
}

/* CEFR level of a word; words without a level count as a1. */
function wordLevel(w) { return w.level || 'a1'; }

/* Words whose level and rule are unlocked. Words without a rule are always
   in play. When every level and rule is unlocked this is the full dictionary.
   Part words (part: true) are compound-word building blocks, not playable
   nouns — they are never in the pool. */
function availablePool() {
  const pool = WORDS.filter(function (w) {
    return !w.part &&
      save.unlockedLevels.indexOf(wordLevel(w)) !== -1 &&
      (!w.rule || (RULE_BY_ID[w.rule] && save.unlocked.indexOf(w.rule) !== -1));
  });
  return pool.length ? pool : WORDS.filter(function (w) { return !w.part; });
}

/* ============================ word levels & error recovery ============================ */

function levelWordCount(lvl) {
  return WORDS.filter(function (w) { return !w.part && wordLevel(w) === lvl; }).length;
}

/* The first level (in WORD_LEVELS order) that is not unlocked yet. */
function nextLockedLevel() {
  for (let i = 0; i < WORD_LEVELS.length; i++) {
    if (save.unlockedLevels.indexOf(WORD_LEVELS[i]) === -1) return WORD_LEVELS[i];
  }
  return null;
}

function buyLevel(lvl) {
  if (lvl !== nextLockedLevel() || save.coins < CFG.levelCost) return;
  save.coins -= CFG.levelCost;
  save.unlockedLevels.push(lvl);
  persist();
  Sfx.buy();
  renderShop();
  toast('LEVEL ' + lvl.toUpperCase() + ' UNLOCKED — ' + levelWordCount(lvl) + ' WORDS JOIN THE POOL', 'streak');
}

/* Back to the starting stage: level a1, default rules, 0 coins, no history. */
function resetToStart() {
  save.coins = 0;
  save.rounds = 0;
  save.bestStreak = 0;
  save.failures = [];
  save.unlockedLevels = ['a1'];
  save.unlocked = RULES.filter(function (r) { return r.unlockedByDefault; }).map(function (r) { return r.id; });
  persist();
}

/* The recent-failure list (last 10, newest first) feeds error recovery. */
function noteFailure(word) {
  const key = word.w.toLowerCase();
  save.failures = save.failures.filter(function (n) { return n !== key; });
  save.failures.unshift(key);
  if (save.failures.length > 10) save.failures.length = 10;
  persist();
}
function clearFailure(word) {
  const key = word.w.toLowerCase();
  if (save.failures.indexOf(key) === -1) return;
  save.failures = save.failures.filter(function (n) { return n !== key; });
  persist();
}

/* Up to CFG.maxRecovery random words from the failure list that are still in play. */
function pickRecovery(pool) {
  if (!save.failures.length) return [];
  const inPool = {};
  pool.forEach(function (w) { inPool[w.w.toLowerCase()] = w; });
  return shuffle(save.failures)
    .map(function (n) { return inPool[n.toLowerCase()]; })
    .filter(function (w) { return !!w; })
    .slice(0, CFG.maxRecovery);
}

/* ============================ config ============================ */

const CFG = {
  roundWords: 20,     // words per round
  maxNoRule: 3,       // max words without a rule in a single round
  maxRecovery: 3,     // max error-recovery words mixed into a round
  levelCost: 160,     // word-level unlock price (≈ 3 perfect 20-streak rounds)
  flightTime: 4.6,    // seconds a word is in play before it counts as missed
  revealTime: 2.7,    // seconds the rule popup stays visible
  gapTime: 0.5,       // pause between words
  startZ: -150,
  missZ: 4,
  pastZ: 20,
  camZ: 12,
  projSpeed: 140,
  hitDist: 2.6
};

/* hit resolution timing */
const ATTACH_TIME = 0.18;  // article glues to the left of the word
const PAINT_OK_TIME = 0.55;   // correct: word paints 0 → 100% in this time
const PAINT_BAD_TIME = 0.7;   // wrong: word paints 0 → 33% in this time, then explodes
const PAINT_FAIL_AT = 0.33;   // the wrong paint dies at 33% of the word length
const HOLD_TIME = 0.55;       // fully painted "der Lehrer" card is held on screen
const FADE_TIME = 0.3;        // ...before it fades out

/* ============================ persistence ============================ */

const SAVE_KEY = 'der_die_das_save_v1';
let save = { coins: 0, unlocked: [], rounds: 0, bestStreak: 0, unlockedLevels: ['a1'], failures: [] };
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      save.coins = Number(parsed.coins) || 0;
      save.rounds = Number(parsed.rounds) || 0;
      save.bestStreak = Number(parsed.bestStreak) || 0;
      save.unlocked = Array.isArray(parsed.unlocked) ? parsed.unlocked : [];
      save.unlockedLevels = Array.isArray(parsed.unlockedLevels) ? parsed.unlockedLevels.slice() : ['a1'];
      if (save.unlockedLevels.indexOf('a1') === -1) save.unlockedLevels.unshift('a1');
      save.failures = Array.isArray(parsed.failures)
        ? parsed.failures.filter(function (n) { return typeof n === 'string'; }).slice(0, 10)
        : [];
    }
  }
} catch (e) { /* fresh start */ }
RULES.forEach(function (r) {
  if (r.unlockedByDefault && save.unlocked.indexOf(r.id) === -1) save.unlocked.push(r.id);
});
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ }
}

/* ============================ audio ============================ */

const Sfx = {
  ctx: null,
  on: true,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.on = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  tone(f0, f1, dur, type, vol, delay) {
    if (!this.ctx || !this.on) return;
    delay = delay || 0; type = type || 'sine'; vol = vol || 0.2;
    try {
      const t = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(Math.max(1, f0), t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.03);
    } catch (e) { /* ignore */ }
  },
  shoot()    { this.tone(680, 240, 0.1, 'square', 0.1); },
  correct(streak) {
    const f = 620 + Math.min(streak, 12) * 26;
    this.tone(f, f, 0.07, 'triangle', 0.22);
    this.tone(f * 1.5, f * 1.5, 0.13, 'triangle', 0.22, 0.06);
  },
  streakUp() { this.tone(523, 1046, 0.28, 'sawtooth', 0.09, 0.12); },
  wrong()    { this.tone(170, 70, 0.3, 'sawtooth', 0.24); },
  miss()     { this.tone(300, 130, 0.22, 'sine', 0.1); },
  buy()      { [523, 659, 784, 1046].forEach(function (f, i) { Sfx.tone(f, f, 0.11, 'triangle', 0.15, i * 0.07); }); },
  roundEnd() { [392, 494, 587, 784].forEach(function (f, i) { Sfx.tone(f, f, 0.16, 'triangle', 0.13, i * 0.11); }); },
  click()    { this.tone(700, 520, 0.06, 'sine', 0.12); }
};

/* ============================ three.js world ============================ */

const sceneEl = document.getElementById('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  fatal('WebGL is not available in this browser. Try a modern desktop or mobile browser with hardware acceleration.');
  return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
sceneEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070312);
scene.fog = new THREE.FogExp2(0x0b0420, 0.0115);

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 500);
const CAM_BASE = new THREE.Vector3(0, 0.8, CFG.camZ);
const CAM_LOOK = new THREE.Vector3(0, 0.8, -120);
camera.position.copy(CAM_BASE);
camera.lookAt(CAM_LOOK);

/* ---- shared textures ---- */
function glowTex(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}
const dotTex = glowTex(128, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
const ringTex = (function () {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(255,255,255,1)';
  x.lineWidth = 10;
  x.shadowColor = 'rgba(255,255,255,0.9)';
  x.shadowBlur = 18;
  x.beginPath();
  x.arc(64, 64, 44, 0, Math.PI * 2);
  x.stroke();
  return new THREE.CanvasTexture(c);
})();

/* ---- synthwave backdrop: sun, stars, grid, rings ---- */
const sun = new THREE.Sprite(new THREE.SpriteMaterial({
  map: (function () {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,110,199,0.9)');
    g.addColorStop(0.45, 'rgba(255,140,120,0.4)');
    g.addColorStop(1, 'rgba(255,140,120,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 5; i++) x.fillRect(0, 128 + i * 18, 256, 4 + i * 2.4);
    return new THREE.CanvasTexture(c);
  })(),
  transparent: true, fog: false, depthWrite: false
}));
sun.scale.set(150, 150, 1);
sun.position.set(0, 16, -280);
scene.add(sun);

function starLayer(count, size, spread, opacity) {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rand(-spread, spread);
    pos[i * 3 + 1] = rand(-spread * 0.6, spread * 0.95);
    pos[i * 3 + 2] = rand(-320, 15);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({
    color: 0xbfd4ff, size: size, sizeAttenuation: false,
    transparent: true, opacity: opacity, fog: false, depthWrite: false
  });
  const p = new THREE.Points(g, m);
  scene.add(p);
  return p;
}
const starsFar = starLayer(500, 1.6, 160, 0.7);
const starsNear = starLayer(220, 2.4, 90, 0.9);

const gridFloor = new THREE.GridHelper(420, 64, 0x7c3aed, 0x3b0f70);
gridFloor.position.y = -2.4;
gridFloor.material.transparent = true;
gridFloor.material.opacity = 0.55;
scene.add(gridFloor);

const gridCeil = new THREE.GridHelper(420, 64, 0x7c3aed, 0x3b0f70);
gridCeil.position.y = 6.5;
gridCeil.material.transparent = true;
gridCeil.material.opacity = 0.28;
scene.add(gridCeil);

const rings = [];
const ringGeo = new THREE.TorusGeometry(9, 0.07, 8, 72);
for (let i = 0; i < 12; i++) {
  const mat = new THREE.MeshBasicMaterial({
    color: i % 2 ? 0xd946ef : 0x6d28d9,
    transparent: true, opacity: 0.4,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const m = new THREE.Mesh(ringGeo, mat);
  m.position.z = -i * 22;
  scene.add(m);
  rings.push(m);
}
const RING_SPEED = 26;
function updateRings(dt) {
  for (const r of rings) {
    r.position.z += RING_SPEED * dt;
    if (r.position.z > 16) r.position.z -= 12 * 22;
  }
}

/* ---- the three color guns ---- */
const GUN_POS = {
  der: new THREE.Vector3(-2.6, -1.7, 8.4),
  die: new THREE.Vector3(0, -1.7, 8.4),
  das: new THREE.Vector3(2.6, -1.7, 8.4)
};
const guns = {};
for (const g of ['der', 'die', 'das']) {
  const grp = new THREE.Group();
  const col = new THREE.Color(G[g].color);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.3, 0.9, 20),
    new THREE.MeshBasicMaterial({ color: 0x181233 })
  );
  body.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.42, 20),
    new THREE.MeshBasicMaterial({ color: col })
  );
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = -0.64;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dotTex, color: col, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  halo.scale.setScalar(1.1);
  halo.position.z = -0.7;
  grp.add(body);
  grp.add(tip);
  grp.add(halo);
  grp.position.copy(GUN_POS[g]);
  scene.add(grp);
  guns[g] = { grp: grp, halo: halo, pulse: 0 };
}

/* ---- word card: gray word, highlighted ending, article glues on the left,
        paint sweep left → right when an article hits ---- */
const CARD_W = 1024, CARD_H = 320;
const WORD_GRAY = '#98a1b6';
const ENDING_CYAN = '#22d3ee';
const fontStr = function (size) { return '700 ' + size + 'px Rubik, "Segoe UI", sans-serif'; };

function createCard() {
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return { canvas: c, ctx: c.getContext('2d'), tex: tex };
}

function drawCardFrame(x) {
  const W = CARD_W, H = CARD_H, r = 46;
  x.beginPath();
  x.moveTo(14 + r, 14);
  x.arcTo(W - 14, 14, W - 14, H - 14, r);
  x.arcTo(W - 14, H - 14, 14, H - 14, r);
  x.arcTo(14, H - 14, 14, 14, r);
  x.arcTo(14, 14, W - 14, 14, r);
  x.closePath();
  x.fillStyle = 'rgba(8,5,20,0.9)';
  x.fill();
  x.lineWidth = 8;
  x.strokeStyle = 'rgba(148,187,255,0.95)';
  x.shadowColor = 'rgba(120,170,255,0.85)';
  x.shadowBlur = 30;
  x.stroke();
  x.shadowBlur = 0;
}

function drawWordText(x, parts, wx, cy, size, baseColor, endColor) {
  x.font = fontStr(size);
  x.textBaseline = 'alphabetic';
  x.shadowColor = 'rgba(170,200,255,0.4)';
  x.shadowBlur = 14;
  x.fillStyle = baseColor;
  x.fillText(parts.base, wx, cy);
  if (parts.end) {
    const bw = x.measureText(parts.base).width;
    x.fillStyle = endColor;
    x.shadowColor = endColor;
    x.shadowBlur = 26;
    x.fillText(parts.end, wx + bw, cy);
    x.shadowBlur = 0;
    const ew = x.measureText(parts.end).width;
    x.strokeStyle = endColor;
    x.lineWidth = Math.max(6, size * 0.06);
    x.beginPath();
    x.moveTo(wx + bw, cy + size * 0.16);
    x.lineTo(wx + bw + ew, cy + size * 0.16);
    x.stroke();
  }
}

function fitSize(x, text) {
  x.font = fontStr(170);
  const w = x.measureText(text).width;
  return w > CARD_W - 150 ? Math.max(40, Math.floor(170 * (CARD_W - 150) / w)) : 170;
}

/* Re-draws the active word card:
   attach = 0..1 (article gluing in from the left)
   prog   = 0..1 (paint sweep over the word, in a.paintGender)            */
function drawCard(a, prog) {
  const x = a.card.ctx;
  const W = CARD_W, H = CARD_H;
  x.clearRect(0, 0, W, H);
  drawCardFrame(x);

  const word = a.word.w;
  const parts = splitByEnding(word, a.rule ? a.rule.endings : null);
  const hasArticle = !!a.article;
  const attach = hasArticle ? Math.min(1, a.articleT) : 0;

  const sizeNoArt = fitSize(x, word);
  const sizeWithArt = hasArticle ? fitSize(x, a.article + ' ' + word) : sizeNoArt;
  const size = Math.round(sizeNoArt + (sizeWithArt - sizeNoArt) * attach);

  x.font = fontStr(size);
  const artW = hasArticle ? x.measureText(a.article + ' ').width : 0;
  const wordW = x.measureText(word).width;
  const totalW = artW + wordW;
  const wordOnlyX = (W - wordW) / 2;
  const combinedStart = (W - totalW) / 2;
  const wordX = wordOnlyX + (combinedStart + artW - wordOnlyX) * attach;
  const cy = H / 2 + size * 0.34;

  /* base pass: gray word, cyan ending */
  drawWordText(x, parts, wordX, cy, size, WORD_GRAY, ENDING_CYAN);

  /* paint sweep: gender color fills the word from left to right */
  if (prog > 0) {
    const col = a.paintGender;
    x.save();
    x.beginPath();
    x.rect(wordX - 6, 0, (wordW + 12) * prog, H);
    x.clip();
    drawWordText(x, parts, wordX, cy, size, col, col);
    if (prog < 1) {
      const fx = wordX + wordW * prog;
      x.shadowColor = col;
      x.shadowBlur = 26;
      x.fillStyle = 'rgba(255,255,255,0.92)';
      x.fillRect(fx - 3, cy - size * 0.78, 6, size * 1.08);
    }
    x.restore();
  }

  /* the article, glued to the left of the word */
  if (hasArticle && attach > 0) {
    let ax = combinedStart;
    if (a.paint && !a.paint.correct) ax += Math.sin(a.paint.t * 34) * 6; /* wrong article struggles to stick */
    x.globalAlpha = attach;
    x.font = fontStr(size);
    x.textBaseline = 'alphabetic';
    x.fillStyle = G[a.article].color;
    x.shadowColor = G[a.article].color;
    x.shadowBlur = 28;
    x.fillText(a.article, ax, cy);
    x.globalAlpha = 1;
    x.shadowBlur = 0;
  }

  /* error-recovery label: this word cost the player points before */
  if (a.isRecovery) {
    const label = 'ERROR RECOVERY';
    x.font = '800 26px Orbitron, "Segoe UI", sans-serif';
    const tw = x.measureText(label).width;
    const bx = 30, by = 30, bw = tw + 34, bh = 44;
    x.beginPath();
    if (x.roundRect) x.roundRect(bx, by, bw, bh, 22); else x.rect(bx, by, bw, bh);
    x.fillStyle = 'rgba(239,68,68,0.18)';
    x.fill();
    x.lineWidth = 3;
    x.strokeStyle = 'rgba(248,113,113,0.95)';
    x.shadowColor = 'rgba(239,68,68,0.8)';
    x.shadowBlur = 14;
    x.stroke();
    x.shadowBlur = 0;
    x.fillStyle = '#fca5a5';
    x.textBaseline = 'middle';
    x.fillText(label, bx + 17, by + bh / 2 + 1);
    x.textBaseline = 'alphabetic';
  }
  a.card.tex.needsUpdate = true;
}

/* ============================ game state ============================ */

const GameState = {
  state: 'menu',      // menu | intro | fly | reveal | gap | roundend | shop
  stateT: 0,
  round: Math.max(1, save.rounds + 1),
  queue: [],
  idx: 0,             // words resolved this round
  streak: 0,
  roundStreak: 0,
  correct: 0, wrong: 0, missed: 0,
  roundCoins: 0,
  lastPoints: 0,
  shake: 0,
  time: 0,
  paused: false,
  shopPick: null,     // locked rules offered this shop visit, per gender
  recoverySet: null   // names of the error-recovery words in the current round
};

/* streak tiers: every 5-streak bumps the bonus AND speeds the words up */
const SPEED_TIER_STEP = 5;
const SPEED_MIN = 0.5;              // words never fly faster than 2x
function streakTier() { return Math.floor(GameState.streak / SPEED_TIER_STEP); }
function speedFactor() { return Math.max(SPEED_MIN, Math.pow(0.88, streakTier())); }
function setGameState(s) {
  GameState.state = s;
  GameState.stateT = 0;
}

/* ---- pause: freeze the round (space / ❚❚ button) so the rule card can be read ---- */
function setPaused(on) {
  if (GameState.paused === on) return;
  GameState.paused = on;
  ui.pauseBanner.classList.toggle('hidden', !on);
  ui.btnPause.classList.toggle('active', on);
}
function togglePause() {
  if (['intro', 'fly', 'reveal', 'gap'].indexOf(GameState.state) === -1) return;
  setPaused(!GameState.paused);
  Sfx.click();
}

/* ---- UI refs ---- */
const $ = function (id) { return document.getElementById(id); };
const ui = {
  hud: $('hud'), guns: $('guns'), reveal: $('reveal'), toasts: $('toasts'),
  intro: $('intro'), introRound: $('intro-round'), introSub: $('intro-sub'),
  damage: $('damage'),
  statRound: $('stat-round'), progressTxt: $('progress-txt'), progressFill: $('progress-fill'),
  statCoins: $('stat-coins'), coinVal: $('coin-val'),
  statStreak: $('stat-streak'), streakVal: $('streak-val'),
  statSpeed: $('stat-speed'), btnPause: $('btn-pause'), pauseBanner: $('pause-banner'),
  overlayMenu: $('overlay-menu'), overlayRoundend: $('overlay-roundend'),
  overlayShop: $('overlay-shop'), overlayRule: $('overlay-rule'),
  shopBody: $('shop-body'), rulePanel: $('rule-panel'), menuStats: $('menu-stats')
};
const show = function (el, on) { el.classList.toggle('hidden', !on); };

function updateHUD() {
  ui.statRound.textContent = 'ROUND ' + GameState.round;
  const inFlight = GameState.state === 'fly' && active && !active.resolved;
  const total = GameState.queue.length || CFG.roundWords;
  const shown = Math.min(GameState.idx + (inFlight ? 1 : 0), total);
  ui.progressTxt.textContent = 'WORD ' + shown + '/' + total;
  ui.progressFill.style.width = (shown / total * 100) + '%';
  ui.coinVal.textContent = save.coins;
  ui.streakVal.textContent = '×' + GameState.streak;
  ui.statStreak.classList.toggle('off', GameState.streak === 0);
  ui.statStreak.classList.toggle('hot', GameState.streak >= 5);
  const sf = speedFactor();
  ui.statSpeed.textContent = 'SPEED ×' + (1 / sf).toFixed(2).replace(/\.?0+$/, '') + 'x';
  ui.statSpeed.classList.toggle('hot', sf < 1);
}
function bumpCoins() {
  ui.statCoins.classList.remove('bump');
  void ui.statCoins.offsetWidth;
  ui.statCoins.classList.add('bump');
}
function toast(text, cls) {
  const d = document.createElement('div');
  d.className = 'toast' + (cls ? ' ' + cls : '');
  d.textContent = text;
  ui.toasts.appendChild(d);
  setTimeout(function () { d.remove(); }, 1500);
}
function floatScore(worldPos, text, color) {
  const v = worldPos.clone().project(camera);
  if (v.z > 1) return;
  const el = document.createElement('div');
  el.className = 'float-score';
  el.textContent = text;
  el.style.color = color;
  el.style.left = ((v.x * 0.5 + 0.5) * window.innerWidth) + 'px';
  el.style.top = ((-v.y * 0.5 + 0.5) * window.innerHeight) + 'px';
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 1000);
}

/* ============================ effects ============================ */

const projectiles = [];
const explosions = [];
const waves = [];

function fire(gender) {
  if (GameState.paused) return;
  Sfx.shoot();
  guns[gender].pulse = 1;
  const origin = GUN_POS[gender].clone();
  let dir;
  if (active && !active.resolved) {
    dir = leadTarget(origin, active.sprite.position, active.vel, CFG.projSpeed).sub(origin).normalize();
  } else {
    dir = new THREE.Vector3(0, 0.05, -1).normalize();
  }
  const mat = new THREE.SpriteMaterial({
    map: dotTex, color: new THREE.Color(G[gender].color),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const spr = new THREE.Sprite(mat);
  spr.scale.setScalar(0.85);
  spr.position.copy(origin);
  scene.add(spr);
  projectiles.push({
    spr: spr, dir: dir, vel: CFG.projSpeed, gender: gender,
    target: (active && !active.resolved) ? active : null,
    life: 3
  });
}

function leadTarget(from, to, toVel, speed) {
  let t = from.distanceTo(to) / speed;
  for (let i = 0; i < 2; i++) {
    const predicted = to.clone().add(toVel.clone().multiplyScalar(t));
    t = from.distanceTo(predicted) / speed;
  }
  return to.clone().add(toVel.clone().multiplyScalar(t));
}

function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const pr = projectiles[i];
    pr.spr.position.addScaledVector(pr.dir, pr.vel * dt);
    pr.life -= dt;
    let dead = pr.life <= 0 || pr.spr.position.z > CFG.pastZ + 14;
    const tgt = pr.target;
    if (!dead && tgt && !tgt.resolved && !tgt.gone) {
      if (pr.spr.position.distanceTo(tgt.sprite.position) < CFG.hitDist) {
        resolve(tgt.word.g === pr.gender ? 'correct' : 'wrong', pr.gender);
        dead = true;
      }
    }
    if (dead) {
      scene.remove(pr.spr);
      pr.spr.material.dispose();
      projectiles.splice(i, 1);
    }
  }
}

function explode(pos, colorHex, count, speed) {
  const n = count || 34;
  const posArr = new Float32Array(n * 3);
  const cols = new Float32Array(n * 3);
  const vel = new Float32Array(n * 3);
  const base = new THREE.Color(colorHex);
  for (let i = 0; i < n; i++) {
    posArr[i * 3] = pos.x; posArr[i * 3 + 1] = pos.y; posArr[i * 3 + 2] = pos.z;
    const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(4, speed || 14));
    vel[i * 3] = v.x; vel[i * 3 + 1] = v.y; vel[i * 3 + 2] = v.z;
    const shade = base.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.5);
    cols[i * 3] = shade.r; cols[i * 3 + 1] = shade.g; cols[i * 3 + 2] = shade.b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.PointsMaterial({
    map: dotTex, size: 0.5, vertexColors: true,
    transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const p = new THREE.Points(g, m);
  scene.add(p);
  explosions.push({ p: p, vel: vel, life: 0.9, max: 0.9 });
}

function updateExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const e = explosions[i];
    e.life -= dt;
    if (e.life <= 0) {
      scene.remove(e.p);
      e.p.geometry.dispose();
      e.p.material.dispose();
      explosions.splice(i, 1);
      continue;
    }
    const arr = e.p.geometry.attributes.position.array;
    for (let j = 0; j < arr.length; j += 3) {
      e.vel[j + 1] -= 9 * dt;
      arr[j] += e.vel[j] * dt;
      arr[j + 1] += e.vel[j + 1] * dt;
      arr[j + 2] += e.vel[j + 2] * dt;
    }
    e.p.geometry.attributes.position.needsUpdate = true;
    e.p.material.opacity = e.life / e.max;
  }
}

function shockwave(pos, colorHex) {
  const m = new THREE.SpriteMaterial({
    map: ringTex, color: new THREE.Color(colorHex),
    transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const s = new THREE.Sprite(m);
  s.position.copy(pos);
  scene.add(s);
  waves.push({ s: s, t: 0 });
}

function updateWaves(dt) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i];
    w.t += dt * 2.2;
    w.s.scale.setScalar(1.5 + w.t * 9);
    w.s.material.opacity = Math.max(0, 0.9 * (1 - w.t));
    if (w.t >= 1) {
      scene.remove(w.s);
      w.s.material.dispose();
      waves.splice(i, 1);
    }
  }
}

/* ============================ the flying word ============================ */

let active = null;
function totalFlight() {
  return CFG.flightTime * speedFactor() * (CFG.pastZ - CFG.startZ) / (CFG.missZ - CFG.startZ);
}

function spawnWord(word) {
  if (active) removeActive();
  const rule = RULE_BY_ID[word.rule];
  const card = createCard();
  const mat = new THREE.SpriteMaterial({ map: card.tex, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  const scaleW = 7.4;
  spr.scale.set(scaleW, scaleW * CARD_H / CARD_W, 1);
  spr.renderOrder = 20;
  const from = new THREE.Vector3(rand(-5, 5), rand(1.2, 3.2), CFG.startZ);
  const to = new THREE.Vector3(rand(-1.6, 1.6), rand(0.4, 1.6), CFG.pastZ);
  spr.position.copy(from);
  scene.add(spr);
  active = {
    sprite: spr, word: word, rule: rule, age: 0,
    from: from, to: to,
    vel: to.clone().sub(from).divideScalar(totalFlight()),
    resolved: false, outcome: null, gone: false,
    isRecovery: !!(GameState.recoverySet && GameState.recoverySet.has(word.w.toLowerCase())),
    card: card,
    article: null, articleT: 0,      // article glued to the left
    paint: null, paintGender: null,   // paint sweep { t, correct }
    holdT: 0
  };
  drawCard(active, 0);
  updateHUD();
}

function removeActive() {
  if (!active) return;
  scene.remove(active.sprite);
  active.sprite.material.map.dispose();
  active.sprite.material.dispose();
  active = null;
}

function updateActive(dt) {
  if (!active) return;
  const a = active;
  const p = a.sprite.position;

  /* keep flying (a miss fades out past the camera) */
  if (a.outcome === 'miss') {
    a.age += dt;
    const t = a.age / totalFlight();
    if (t >= 1) { if (!a.gone) { a.gone = true; removeActive(); } return; }
    p.lerpVectors(a.from, a.to, t);
    p.y += Math.sin(a.age * 2.2 + a.from.x) * 0.12 * (1 - t * 0.5);
    a.sprite.material.rotation = Math.sin(a.age * 1.6 + a.from.x * 2) * 0.05;
    a.sprite.material.opacity = Math.max(0, 1 - (p.z - CFG.missZ) / (CFG.pastZ - CFG.missZ));
    return;
  }

  /* still in flight */
  if (!a.resolved) {
    a.age += dt;
    const t = a.age / totalFlight();
    if (t >= 1) { if (!a.gone) { a.gone = true; removeActive(); } return; }
    p.lerpVectors(a.from, a.to, t);
    p.y += Math.sin(a.age * 2.2 + a.from.x) * 0.12 * (1 - t * 0.5);
    a.sprite.material.rotation = Math.sin(a.age * 1.6 + a.from.x * 2) * 0.05;
    if (p.z >= CFG.missZ) resolve('miss', null);
    return;
  }

  /* hit: frozen at the hit point — article glues on, word gets painted */
  if (a.article && a.articleT < 1) a.articleT = Math.min(1, a.articleT + dt / ATTACH_TIME);

  if (a.paint) {
    const pn = a.paint;
    pn.t += dt;
    if (pn.correct) {
      const prog = Math.min(1, pn.t / PAINT_OK_TIME);
      drawCard(a, prog);
      if (prog >= 1) {
        a.paint = null;
        a.holdT = 0;
        celebrateHit();
      }
    } else {
      const prog = Math.min(1, pn.t / PAINT_BAD_TIME) * PAINT_FAIL_AT;
      drawCard(a, prog);
      if (pn.t >= PAINT_BAD_TIME) {
        wrongExplode();
        return;
      }
    }
    return;
  }

  /* painted card is held on screen, then fades out */
  if (a.outcome === 'correct' && !a.paint) {
    a.holdT += dt;
    const pulse = 1 + Math.sin(a.holdT * 10) * 0.015;
    a.sprite.scale.set(7.4 * pulse, 7.4 * (CARD_H / CARD_W) * pulse, 1);
    const f = a.holdT - HOLD_TIME;
    if (f > 0) {
      a.sprite.material.opacity = Math.max(0, 1 - f / FADE_TIME);
      if (f >= FADE_TIME) {
        const word = a.word;
        removeActive();
        showReveal(word, 'correct');
        setGameState('reveal');
        updateHUD();
      }
    }
  }
}

/* ============================ reveal popup ============================ */

function showReveal(word, outcome) {
  const rule = RULE_BY_ID[word.rule];
  let badge;
  if (outcome === 'correct') {
    badge = '<span class="badge ok">CORRECT +' + GameState.lastPoints + '</span>';
  } else if (outcome === 'wrong') {
    badge = '<span class="badge bad">WRONG — IT IS ' + word.g.toUpperCase() + ' ' + esc(word.w) + '</span>';
  } else {
    badge = '<span class="badge miss">MISSED</span>';
  }
  let chip;
  if (word.exception && rule) {
    const txt = word.note || ('An exception to the ' + rule.formula + ' rule — memorize it!');
    chip = '<div class="chip chip-exception"><div class="chip-title">EXCEPTION</div><div class="chip-text">' + esc(txt) + '</div></div>';
  } else if (rule) {
    chip = '<div class="chip chip-' + word.g + '"><div class="chip-title">' + esc(rule.formula) + '</div><div class="chip-text">' + esc(rule.description) + '</div></div>';
  } else {
    const txt = word.note || 'No rule covers this word — memorize it with the article!';
    chip = '<div class="chip chip-exception"><div class="chip-title">NO RULE</div><div class="chip-text">' + esc(txt) + '</div></div>';
  }
  let compound = '';
  if (word.compound) {
    const head = WORD_BY_NAME[(word.head || '').toLowerCase()];
    if (head) {
      compound = '<div class="reveal-compound">compound word — gender of ' +
        '<span class="art art-' + head.g + '">' + head.g + '</span> ' + esc(head.w) + '</div>';
    }
  }
  const cls = outcome === 'correct' ? 'ok' : outcome === 'wrong' ? 'bad' : 'miss';
  ui.reveal.innerHTML =
    '<div class="reveal-card ' + cls + '">' +
      badge +
      '<div class="reveal-word"><span class="art art-' + word.g + '">' + word.g + '</span> ' + esc(word.w) + '</div>' +
      '<div class="reveal-en">' + esc(word.en) + '</div>' +
      compound +
      chip +
    '</div>';
  show(ui.reveal, true);
}
function hideReveal() { show(ui.reveal, false); }

/* ============================ resolution & scoring ============================ */

function resolve(outcome, hitGender) {
  if (!active || active.resolved) return;
  const a = active;
  a.resolved = true;
  a.outcome = outcome;
  const word = a.word;
  GameState.idx++;

  if (outcome === 'miss') {
    GameState.missed++;
    GameState.lastPoints = 0;
    noteFailure(word);
    Sfx.miss();
    toast('MISSED', 'miss');
    showReveal(word, 'miss');
    setGameState('reveal');
    updateHUD();
    return;
  }

  /* a hit: the article glues to the word from the left and the
     paint sweep starts — correct paints to 100%, wrong dies at 33% */
  a.article = hitGender;
  a.articleT = 0;
  a.paint = { t: 0, correct: outcome === 'correct' };
  a.paintGender = G[hitGender].color;
  drawCard(a, 0);

  if (outcome === 'correct') {
    GameState.streak++;
    GameState.roundStreak = Math.max(GameState.roundStreak, GameState.streak);
    const pts = (1 + Math.floor(GameState.streak / 5)) * (a.isRecovery ? 2 : 1);
    GameState.lastPoints = pts;
    GameState.correct++;
    GameState.roundCoins += pts;
    save.coins += pts;
    save.bestStreak = Math.max(save.bestStreak, GameState.streak);
    clearFailure(word);
    persist();
  } else {
    GameState.streak = 0;
    GameState.wrong++;
    GameState.lastPoints = 0;
    noteFailure(word);
  }
  updateHUD();
}

/* correct paint finished: the fully colored "der Lehrer" card celebrates */
function celebrateHit() {
  if (!active) return;
  const a = active;
  const pos = a.sprite.position;
  const word = a.word;
  explode(pos, G[word.g].color, 40, 16);
  shockwave(pos, G[word.g].color);
  floatScore(pos, '+' + GameState.lastPoints, G[word.g].color);
  Sfx.correct(GameState.streak);
  bumpCoins();
  if (a.isRecovery) {
    toast('ERROR RECOVERED — +' + GameState.lastPoints + ' (×2)', 'recovered');
  }
  if (GameState.streak % 5 === 0) {
    toast('STREAK ×' + GameState.streak + ' — BONUS UP · SPEED UP', 'streak');
    Sfx.streakUp();
  }
}

/* the wrong paint reached 33% of the word length — it cannot stick: it explodes */
function wrongExplode() {
  if (!active) return;
  const a = active;
  const pos = a.sprite.position;
  const word = a.word;
  explode(pos, 0xef4444, 52, 17);
  shockwave(pos, 0xef4444);
  floatScore(pos, '×', '#f87171');
  GameState.shake = 0.55;
  ui.damage.classList.remove('show');
  void ui.damage.offsetWidth;
  ui.damage.classList.add('show');
  Sfx.wrong();
  toast('STREAK LOST', 'bad');
  removeActive();
  showReveal(word, 'wrong');
  setGameState('reveal');
  updateHUD();
}

/* ============================ round flow ============================ */

function startRound() {
  const pool = availablePool();
  /* error recovery: words the player failed recently are mixed back in —
     getting them right this time is worth double */
  const recovery = pickRecovery(pool);
  const recSet = new Set();
  recovery.forEach(function (w) { recSet.add(w.w.toLowerCase()); });
  GameState.recoverySet = recSet;
  const rest = pool.filter(function (w) { return !recSet.has(w.w.toLowerCase()); });
  const noRuleCap = Math.max(0, CFG.maxNoRule - recovery.filter(function (w) { return !w.rule; }).length);
  const noRule = shuffle(rest.filter(function (w) { return !w.rule; })).slice(0, noRuleCap);
  const withRule = shuffle(rest.filter(function (w) { return w.rule; })).slice(0, CFG.roundWords - recovery.length - noRule.length);
  GameState.queue = shuffle(recovery.concat(withRule, noRule));
  GameState.idx = 0;
  GameState.streak = 0;
  GameState.roundStreak = 0;
  GameState.correct = 0;
  GameState.wrong = 0;
  GameState.missed = 0;
  GameState.roundCoins = 0;
  updateHUD();

  ui.introRound.textContent = 'ROUND ' + GameState.round;
  ui.introSub.textContent = pool.length + ' WORDS IN PLAY';
  show(ui.intro, true);
  ui.intro.classList.remove('show');
  void ui.intro.offsetWidth;
  ui.intro.classList.add('show');
  setGameState('intro');
}

function nextWord() {
  if (GameState.idx >= GameState.queue.length) { endRound(); return; }
  hideReveal();
  spawnWord(GameState.queue[GameState.idx]);
  setGameState('fly');
}

function endRound() {
  setPaused(false);
  hideReveal();
  save.rounds = GameState.round;
  persist();
  $('re-title').textContent = 'Round ' + GameState.round;
  $('re-correct').textContent = GameState.correct;
  $('re-wrong').textContent = GameState.wrong;
  $('re-missed').textContent = GameState.missed;
  $('re-streak').textContent = '×' + GameState.roundStreak;
  $('re-coins').textContent = '+' + GameState.roundCoins + ' coins';
  show(ui.overlayRoundend, true);
  setGameState('roundend');
  Sfx.roundEnd();
}

function nextRound() {
  GameState.round++;
  show(ui.overlayRoundend, false);
  show(ui.overlayShop, false);
  show(ui.overlayRule, false);
  startRound();
}

/* ============================ shop ============================ */

function openShop() {
  setPaused(false);
  GameState.shopPick = rollShopPick();
  renderShop();
  show(ui.overlayShop, true);
  setGameState('shop');
}

/* Each shop visit offers a fresh random selection: up to 2 locked rules per gender. */
function rollShopPick() {
  const pick = {};
  for (const gender of ['der', 'die', 'das']) {
    const locked = RULES.filter(function (r) { return r.gender === gender && save.unlocked.indexOf(r.id) === -1; });
    pick[gender] = shuffle(locked).slice(0, 2).map(function (r) { return r.id; });
  }
  return pick;
}

function renderShop() {
  const allRules = RULES.every(function (r) { return save.unlocked.indexOf(r.id) !== -1; });
  const allLevels = WORD_LEVELS.every(function (lvl) {
    return levelWordCount(lvl) === 0 || save.unlockedLevels.indexOf(lvl) !== -1;
  });
  let html = '<div class="shop-head"><h2>RULE SHOP</h2><div class="shop-coins"><span class="coin"></span>' + save.coins + '</div></div>';

  /* word levels: unlocked, next-to-unlock (purchasable) or locked */
  const nextLvl = nextLockedLevel();
  html += '<div class="shop-levels">';
  for (const lvl of WORD_LEVELS) {
    const count = levelWordCount(lvl);
    if (!count) continue;
    const unlocked = save.unlockedLevels.indexOf(lvl) !== -1;
    const isNext = lvl === nextLvl;
    html += '<div class="lvl' + (unlocked ? ' on' : isNext ? ' next' : '') + '">';
    html += '<div class="lvl-name">' + lvl.toUpperCase() + '</div>';
    html += '<div class="lvl-sub">' + count + ' WORDS</div>';
    if (unlocked) {
      html += '<div class="lvl-state">IN PLAY</div>';
    } else if (isNext) {
      html += '<button class="lvl-buy" data-level="' + lvl + '"' + (save.coins >= CFG.levelCost ? '' : ' disabled') + '>UNLOCK · ' + CFG.levelCost + '</button>';
    } else {
      html += '<div class="lvl-state">LOCKED</div>';
    }
    html += '</div>';
  }
  html += '</div>';

  html += '<p class="shop-offer">Fresh picks every visit — each gender offers up to 2 locked rules. Unlock one to reveal what it does.</p>';
  html += '<div class="shop-cols">';
  for (const gender of ['der', 'die', 'das']) {
    html += '<div class="shop-col col-' + gender + '"><h3>' + G[gender].name + '</h3>';
    const rules = RULES.filter(function (r) { return r.gender === gender; });
    const unlockedHere = rules.filter(function (r) { return save.unlocked.indexOf(r.id) !== -1; });
    const offered = (GameState.shopPick ? GameState.shopPick[gender] : []).map(function (id) {
      return RULE_BY_ID[id];
    }).filter(function (r) { return r && save.unlocked.indexOf(r.id) === -1; });
    for (const rule of offered) {
      html += '<div class="rule-card locked">';
      html += '<div class="rc-title">' + esc(rule.formula) + '</div>';
      html += '<div class="rc-locked">Content hidden — unlock to learn the rule.</div>';
      html += '<button class="buy" data-rule="' + rule.id + '"' + (save.coins >= rule.cost ? '' : ' disabled') + '>UNLOCK · ' + rule.cost + ' COINS</button>';
      html += '</div>';
    }
    for (const rule of unlockedHere) {
      html += '<div class="rule-card">';
      html += '<div class="rc-title">' + esc(rule.formula) + '</div>';
      html += '<div class="rc-desc">' + esc(rule.description) + '</div>';
      html += '<div class="rc-unlocked">UNLOCKED</div>';
      html += '</div>';
    }
    if (!offered.length && !unlockedHere.length) {
      html += '<div class="rc-locked">No rules for this gender yet.</div>';
    }
    if (!offered.length && unlockedHere.length) {
      html += '<div class="rc-locked">No more locked rules offered here.</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  html += '<div class="shop-foot">';
  html += (allRules && allLevels)
    ? '<p class="shop-note">Everything unlocked — the full dictionary is in play.</p>'
    : '<p class="shop-note">New words join the pool from the next round.</p>';
  html += '<div class="shop-actions">';
  html += '<button id="btn-shop-reset" class="btn ghost" title="Back to the start: level a1, starting rules only, 0 coins">RESET TO A1</button>';
  html += '<button id="btn-shop-next" class="btn primary">START ROUND ' + (GameState.round + 1) + '</button>';
  html += '</div>';
  html += '</div>';
  ui.shopBody.innerHTML = html;
}

ui.overlayShop.addEventListener('click', function (e) {
  const t = e.target;
  const lvlBtn = t.closest ? t.closest('.lvl-buy') : null;
  if (lvlBtn) { buyLevel(lvlBtn.getAttribute('data-level')); return; }
  const buyBtn = t.closest ? t.closest('.buy') : null;
  if (buyBtn) { buyRule(buyBtn.getAttribute('data-rule')); return; }
  if (t.id === 'btn-shop-reset' || (t.closest && t.closest('#btn-shop-reset'))) {
    if (!window.confirm('Reset everything and start from scratch? (level a1, starting rules only, 0 coins)')) return;
    if (!window.confirm('Really? Coins, rules, levels, streak records and the error-recovery list will be gone.')) return;
    Sfx.click();
    resetToStart();
    renderShop();
    updateHUD();
    toast('RESET — LEVEL A1, FRESH START', 'miss');
    return;
  }
  if (t.id === 'btn-shop-next' || (t.closest && t.closest('#btn-shop-next'))) {
    Sfx.click();
    nextRound();
  }
});

function buyRule(id) {
  const rule = RULE_BY_ID[id];
  if (!rule || save.unlocked.indexOf(id) !== -1 || save.coins < rule.cost) return;
  save.coins -= rule.cost;
  save.unlocked.push(id);
  persist();
  Sfx.buy();
  renderShop();
  showRulePopup(rule);
}

function showRulePopup(rule) {
  const items = exampleWords(rule, 5).map(function (w) {
    return '<div class="rule-ex-item"><span class="art art-' + rule.gender + '">' + rule.gender + '</span><span>' + highlightHTML(w, rule.endings) + '</span></div>';
  }).join('');
  ui.rulePanel.className = 'panel rule-panel p-' + rule.gender;
  ui.rulePanel.innerHTML =
    '<p class="rule-head">NEW RULE UNLOCKED</p>' +
    '<div class="rule-formula">' + esc(rule.formula) + '</div>' +
    '<p class="rule-desc">' + esc(rule.description) + '</p>' +
    (items ? '<div class="rule-ex-list">' + items + '</div>' : '') +
    '<p class="rule-note">These words join the pool from the next round.</p>' +
    '<button id="btn-rule-ok" class="btn primary mt">GOT IT</button>';
  show(ui.overlayRule, true);
  ui.rulePanel.querySelector('#btn-rule-ok').addEventListener('click', function () {
    Sfx.click();
    show(ui.overlayRule, false);
  });
}

/* ============================ menu ============================ */

function renderMenu() {
  const pool = availablePool();
  const unlockedCount = RULES.filter(function (r) { return save.unlocked.indexOf(r.id) !== -1; }).length;
  let maxLvl = 'a1';
  for (const lvl of WORD_LEVELS) {
    if (save.unlockedLevels.indexOf(lvl) !== -1) maxLvl = lvl;
  }
  ui.menuStats.innerHTML =
    '<b>' + save.coins + '</b> coins &nbsp;·&nbsp; level <b>' + maxLvl.toUpperCase() + '</b> &nbsp;·&nbsp; <b>' + unlockedCount + '/' + RULES.length + '</b> rules unlocked &nbsp;·&nbsp; <b>' + pool.length + '</b> words in play<br>' +
    (save.bestStreak ? 'best streak <b>×' + save.bestStreak + '</b> &nbsp;·&nbsp; ' : '') +
    (save.rounds ? 'rounds played <b>' + save.rounds + '</b>' : 'a fresh start');
}

$('btn-play').addEventListener('click', function () {
  Sfx.init();
  Sfx.resume();
  Sfx.click();
  const begin = function () {
    show(ui.overlayMenu, false);
    show(ui.hud, true);
    show(ui.guns, true);
    startRound();
  };
  if (document.fonts && document.fonts.ready && !fontsReady) {
    document.fonts.ready.then(begin);
  } else {
    begin();
  }
});

$('btn-reset').addEventListener('click', function () {
  if (!window.confirm('Reset all progress (coins, unlocked rules, rounds)?')) return;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  location.reload();
});

$('btn-shop').addEventListener('click', function () {
  Sfx.click();
  show(ui.overlayRoundend, false);
  openShop();
});
$('btn-next').addEventListener('click', function () {
  Sfx.click();
  nextRound();
});

/* ============================ input ============================ */

window.addEventListener('keydown', function (e) {
  if (e.repeat) return;
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    Sfx.init();
    Sfx.resume();
    togglePause();
    return;
  }
  if (GameState.paused) return;
  if (GameState.state === 'menu' || GameState.state === 'roundend' || GameState.state === 'shop') return;
  if (e.key === '1') fire('der');
  else if (e.key === '2') fire('die');
  else if (e.key === '3') fire('das');
});

ui.btnPause.addEventListener('click', function () {
  Sfx.init();
  Sfx.resume();
  togglePause();
});

document.querySelectorAll('.gun').forEach(function (btn) {
  const g = btn.getAttribute('data-g');
  btn.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    Sfx.init();
    Sfx.resume();
    if (GameState.state === 'menu' || GameState.state === 'roundend' || GameState.state === 'shop') return;
    fire(g);
    btn.classList.add('pressed');
    setTimeout(function () { btn.classList.remove('pressed'); }, 110);
  });
});

/* ============================ update & loop ============================ */

function update(dt) {
  if (GameState.paused) return;
  GameState.time += dt;

  updateRings(dt);

  const near = starsNear.geometry.attributes.position;
  for (let i = 0; i < near.count; i++) {
    let z = near.getZ(i) + 14 * dt;
    if (z > 15) z = -305;
    near.setZ(i, z);
  }
  near.needsUpdate = true;
  starsFar.rotation.z += dt * 0.004;

  for (const g of ['der', 'die', 'das']) {
    const gun = guns[g];
    gun.pulse = Math.max(0, gun.pulse - dt * 5);
    gun.halo.scale.setScalar(1.1 * (1 + gun.pulse * 0.5));
    gun.halo.material.opacity = 0.5 + gun.pulse * 0.5;
    gun.grp.scale.setScalar(1 + gun.pulse * 0.15);
  }

  updateProjectiles(dt);
  updateExplosions(dt);
  updateWaves(dt);
  updateActive(dt);

  switch (GameState.state) {
    case 'intro':
      GameState.stateT += dt;
      if (GameState.stateT >= 1.05) {
        show(ui.intro, false);
        spawnWord(GameState.queue[GameState.idx]);
        setGameState('fly');
      }
      break;
    case 'reveal':
      GameState.stateT += dt;
      if (GameState.stateT >= CFG.revealTime) {
        hideReveal();
        setGameState('gap');
      }
      break;
    case 'gap':
      GameState.stateT += dt;
      if (GameState.stateT >= CFG.gapTime) nextWord();
      break;
  }

  /* camera: gentle sway + shake */
  GameState.shake = Math.max(0, GameState.shake - dt * 1.6);
  const t = GameState.time;
  camera.position.set(
    CAM_BASE.x + Math.sin(t * 0.35) * 0.18,
    CAM_BASE.y + Math.sin(t * 0.52) * 0.12,
    CAM_BASE.z
  );
  if (GameState.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * GameState.shake * 0.6;
    camera.position.y += (Math.random() - 0.5) * GameState.shake * 0.6;
  }
  camera.lookAt(CAM_LOOK);
}

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* wait for the display font so the first word cards render crisply */
let fontsReady = false;
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(function () { fontsReady = true; });
} else {
  fontsReady = true;
}

renderMenu();
updateHUD();

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);
}
loop();

})();
