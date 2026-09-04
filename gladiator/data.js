/* ============================================================
   THE LAST GLADIATOR — data.js
   Static game data: weapons, armor, shields, scrolls, hidden
   combos, titles, training, archetypes, arena events, enemy
   names — plus tiny math helpers and the save bootstrap.
   No engine code here; other files only read from this one.
   ============================================================ */

var SAVE_KEY = 'last_gladiator_save_v1';
var MAX_ROUND = 25;      // a battle ends in a draw after this many rounds
var FOE_POS = -3.9;      // z coordinate where the foe stands

// ------------------------------------------------ stamina
// Every action spends stamina; each round all fighters recover a little
// passively. Rest is a full action: a big stamina gain, but no offense,
// no shield and no dodge bonus. Both fighters' stamina is visible, so a
// spent foe telegraphs his next move — the arena is a chessboard.
// Heavy arms are slow: the tier table is the heart of the system.
var STAMINA = {
  max: 100,                          // the standard well
  champMax: 100,                     // champions run on the same well — their edge is steel, not lungs
  regen: 3,                          // passive recovery per round (even while stunned)
  rest: 40,                          // what the Rest action grants
  dodge: 15,
  defend: 8,
  cast: 18,
  attackByTier: [10, 13, 16, 18, 22, 20, 24], // fists .. axe
};

// ------------------------------------------------ weapons
// tier 0..6: fists / club / sword / staff / hammer / spear / axe.
// `leg` items are legendary: same slot, special effect, big price.
var WEAPONS = {
  fists:      { name: 'Bare Fists',        icon: '✊', tier: 0, dmg: 8,  cost: 0,   desc: 'Your hands. Better than nothing. 8 dmg.' },
  club:       { name: 'Wooden Club',       icon: '🏏', tier: 1, dmg: 12, cost: 20,  desc: 'A trusty piece of oak. 12 dmg.' },
  sword:      { name: 'Iron Sword',        icon: '⚔️', tier: 2, dmg: 16, cost: 45,  desc: "The gladiator's classic. 16 dmg." },
  staff:      { name: 'Oak Staff',         icon: '🪄', tier: 3, dmg: 18, cost: 70,  desc: 'Heavy and blunt. 18 dmg.' },
  hammer:     { name: 'Iron Hammer',       icon: '🔨', tier: 4, dmg: 22, cost: 100, desc: 'Crushes bone and shield alike. 22 dmg.' },
  spear:      { name: 'War Spear',         icon: '🔱', tier: 5, dmg: 24, cost: 140, desc: 'Reach and thrust. 24 dmg.' },
  axe:        { name: 'Battle Axe',        icon: '🪓', tier: 6, dmg: 28, cost: 190, desc: 'The heaviest of common arms. 28 dmg.' },
  stormclub:  { name: 'Thunder Club',      icon: '🏏', tier: 1, dmg: 14, cost: 130, leg: true, desc: 'LEGENDARY · 14 dmg. 25% chance to stun the foe for a round.' },
  flamesword: { name: 'Flamebrand',        icon: '⚔️', tier: 2, dmg: 18, cost: 260, leg: true, desc: 'LEGENDARY · 18 dmg. Hits set the foe ablaze: 4 fire dmg for 3 rounds.' },
  stormstaff: { name: 'Stormcaller Staff', icon: '🪄', tier: 3, dmg: 20, cost: 320, leg: true, desc: 'LEGENDARY · 20 dmg. 20% chance to stun the foe for a round.' },
  seishammer: { name: 'Seismic Hammer',    icon: '🔨', tier: 4, dmg: 25, cost: 420, leg: true, desc: 'LEGENDARY · 25 dmg. 20% chance: the foe cannot dodge for 2 rounds.' },
  venomsp:    { name: 'Venomfang Spear',   icon: '🔱', tier: 5, dmg: 26, cost: 520, leg: true, desc: 'LEGENDARY · 26 dmg. Poison: 2 dmg for 3 rounds.' },
  bersaxe:    { name: 'Berserker Axe',     icon: '🪓', tier: 6, dmg: 32, cost: 650, leg: true, desc: 'LEGENDARY · 32 dmg. Deals +50% damage while your HP is below 30%.' },
};

// ------------------------------------------------ armor
// reduction: % less physical damage taken. dodge: % added to the passive dodge (the Dodge action adds its own bonus on top).
var ARMORS = {
  leather: { name: 'Leather Armor',  icon: '🧥', reduction: 10, dodge: 12,  cost: 30,  desc: '+12% dodge chance · −10% damage taken' },
  iron:    { name: 'Iron Plate',     icon: '⚙️', reduction: 30, dodge: -12, cost: 70,  desc: '−30% damage taken · −12% dodge chance (heavy)' },
  dragon:  { name: 'Dragon Hide',    icon: '🐉', reduction: 20, dodge: 12,  cost: 150, desc: '+12% dodge · −20% damage taken · your fire spells deal +50% damage' },
  magic:   { name: 'Enchanted Robe', icon: '🧙', reduction: 15, dodge: 0,   cost: 120, desc: '−15% damage taken · all scroll damage +2' },
};

// ------------------------------------------------ shields
// A shield gives a full block. Every weapon strike that is blocked
// chips 1 use (fists never chip). At 0 uses the shield shatters.
var SHIELDS = {
  wooden: { name: 'Wooden Shield', icon: '🪵', dur: 3, cost: 15, desc: 'Full block. Weapon strikes chip it. 3 uses.' },
  iron:   { name: 'Iron Shield',   icon: '🛡️', dur: 5, cost: 40, desc: 'Full block. Weapon strikes chip it. 5 uses.' },
  tower:  { name: 'Tower Shield', icon: '🏰', dur: 4, cost: 90, desc: 'Full block. Weapon strikes chip it. 4 uses. Blocks hit back (see Arcana).' },
  aegis:  { name: 'Tortoise Aegis', icon: '🐢', dur: 3, cost: 420, leg: true, desc: 'LEGENDARY · Full block, 3 blocks per battle. Slow to lift, unkillable — it shatters in the sand and reforms whole before your next fight. Every successful block steadies you: +25% dodge for 2 rounds.' },
};

// ------------------------------------------------ relics
// One-off keepsakes that live in your satchel forever and act on their own
// once per battle. No equipping, no satchel slots.
var RELICS = {
  flask: { name: 'Phial of the Healer', icon: '🧪', cost: 300, desc: 'Once per battle: the first time you drop below 30% HP, a hidden hand tosses you a phial — restore 30 HP.' },
};
var RELIC_ORDER = ['flask'];

// ------------------------------------------------ scrolls
// Magic ignores armor. Special effects land on a successful cast
// (a dodged or shield-absorbed spell does nothing).
var SCROLLS = {
  fire:      { name: 'Scroll of Fire',      icon: '🔥', color: 0xff7a2f, dmg: 18, cost: 25, desc: 'Fireball: 18 damage. Ignores armor.' },
  water:     { name: 'Scroll of Water',     icon: '💧', color: 0x3f9dff, dmg: 6,  cost: 30, desc: 'Tsunami: 6 damage. The foe cannot attack next round, and is left soaked.' },
  earth:     { name: 'Scroll of Earth',     icon: '⛰️', color: 0xb07a42, dmg: 10, cost: 35, desc: 'Earthquake: 10 damage. The foe cannot attack next round.' },
  wind:      { name: 'Scroll of Wind',      icon: '💨', color: 0xcfe8ef, dmg: 8,  cost: 30, desc: 'Gale: 8 damage. The foe’s next attack deals 25% less.' },
  lightning: { name: 'Scroll of Lightning', icon: '⚡', color: 0xffe95e, dmg: 26, cost: 50, desc: 'Lightning bolt: 26 damage. Ignores armor.' },
  ice:       { name: 'Scroll of Ice',       icon: '❄️', color: 0x9fe8ff, dmg: 10, cost: 40, desc: 'Frost: 10 damage. The foe is frozen: next attack −50%, cannot dodge.' },
  life:      { name: 'Scroll of Life',      icon: '✨', color: 0x7dffa8, heal: 22, cost: 45, desc: 'Green light mends you: restore 22 HP. You are defenseless while casting.' },
  shadow:    { name: 'Scroll of Shadow',    icon: '🌑', color: 0x8a8fa8, dmg: 0, cost: 55, desc: 'The foe’s next attack vanishes into shadow — it will miss. Spells still reach them.' },
};
var SCROLL_ORDER = ['fire', 'water', 'earth', 'wind', 'lightning', 'ice', 'life', 'shadow'];

// ------------------------------------------------ hidden combos
// Never listed in the shop. When a combo first succeeds for the
// player, a discovery toast appears and it is recorded in the save;
// the Armory → Arcana page then shows it. `how` is the discovery hint
// shown after it is found.
var COMBOS = {
  iceShatter: {
    name: 'Ice Shatter', icon: '🧊',
    how: 'Strike a frozen foe with a heavy weapon (hammer, spear or axe tier).',
    msg: 'A frozen foe is brittle — heavy weapons (tier 4+) shatter it for DOUBLE damage!',
  },
  conductor: {
    name: 'Conductor', icon: '⚡',
    how: 'Soak the foe with Water, then strike with Lightning.',
    msg: 'Water conducts electricity — lightning hits a soaked foe for DOUBLE damage and stuns it!',
  },
  dragonfire: {
    name: 'Dragonfire', icon: '🐉',
    how: 'Wield the Flamebrand while wearing Dragon Hide.',
    msg: 'The dragon’s essence ignites your blade — its strikes now burn like fire and IGNORE armor!',
  },
  warded: {
    name: 'Warded Block', icon: '🛡️',
    how: 'Defend with a shield while wearing the Enchanted Robe.',
    msg: 'Your runes drink the incoming magic and hurl HALF of it right back at the caster!',
  },
  jab: {
    name: 'Counter Jab', icon: '💨',
    how: 'Dodge successfully against a gale- or frost-weakened foe.',
    msg: 'You slip past a weakened foe and land a vicious counter jab — 5 damage!',
  },
  ram: {
    name: 'Battering Ram', icon: '🏰',
    how: 'Block an attack with a Tower Shield.',
    msg: 'The tower shield rams the attacker — blocking deals 8 recoil damage to them!',
  },
  boil: {
    name: 'Boiling Venom', icon: '☠️',
    how: 'Set a poisoned foe on fire.',
    msg: 'Fire boils the venom — a poisoned, burning foe suffers DOUBLE poison every round!',
  },
  ironcalm: {
    name: 'Iron Composure', icon: '⚙️',
    how: 'Wear Iron Plate when hit by an earthquake.',
    msg: 'Iron plate absorbs the tremor — earthquakes deal no damage to you, only the stun!',
  },
  cauterize: {
    name: 'Cauterize', icon: '🩸',
    how: 'Hit a stunned foe with the Scroll of Fire.',
    msg: 'Fire seals a stunned foe shut — a fire spell on a stunned foe also sets it ablaze (4 fire dmg for 3 rounds)!',
  },
  featherfall: {
    name: 'Featherfall', icon: '🪶',
    how: 'Dodge an enemy spell.',
    msg: 'You slip past the incoming magic, light as air — dodging an enemy spell makes your next attack deal +25% damage!',
  },
  mirrorward: {
    name: 'Mirror Ward', icon: '🪞',
    how: 'Block an enemy spell with a Tower Shield while wearing the Enchanted Robe.',
    msg: 'The tower shield and the runes align like a mirror — the spell bounces back at FULL strength!',
  },
  heartsand: {
    name: 'Heart of the Sand', icon: '❤️',
    how: 'Win a battle in which you were below 25% HP at some point.',
    msg: 'Rome salutes the unbroken — a victory won from below 25% HP pays +50% coins!',
  },
};
var COMBO_ORDER = ['iceShatter', 'conductor', 'dragonfire', 'warded', 'jab', 'ram', 'boil', 'ironcalm', 'cauterize', 'featherfall', 'mirrorward', 'heartsand'];

// ------------------------------------------------ gear sets ("bonds")
// A matching weapon + armor pair grants a hidden PASSIVE bonus (unlike the
// arcana above, which proc on events). The point: give outclassed gear a second
// life — a bonded mid-tier kit that stands with a higher one. Player-only (foes
// never bond). Hidden like arcana: the codex shows ❓ until the pair is first
// equipped together ("forged"), which fires a toast + Sfx.discover.
// `bonus` fields are declarative and applied by combat.js freshFighter():
//   maxHp (flat) · dmgFlat (flat dmg) · dmgPct (% dmg) · reduction (% less taken)
//   dodge (% passive evasion) · atkCost (flat, applied in actionCost)
var SETS = {
  brawler: {
    weapon: 'fists', armor: 'leather',
    name: 'Bare-Knuckle Brawler', icon: '✊',
    how: 'Fight with your bare fists while wearing Leather Armor.',
    msg: 'Fists and soft leather make a storm: +12% dodge, and your bare-knuckle attacks cost 3 less stamina.',
    bonus: { dodge: 12, atkCost: -3 },
  },
  skirmisher: {
    weapon: 'club', armor: 'leather',
    name: 'Oak Skirmisher', icon: '🏏',
    how: 'Swing a Wooden Club while wearing Leather Armor.',
    msg: 'A chunk of oak and light hide — the club punches above its weight: +5 damage and +6% dodge.',
    bonus: { dmgFlat: 5, dodge: 6 },
  },
  vanguard: {
    weapon: 'sword', armor: 'iron',
    name: 'Iron Vanguard', icon: '⚔️',
    how: 'Wield an Iron Sword while wearing Iron Plate.',
    msg: 'An honest blade and a knight’s plate: +6 damage, +15 max HP, and 10% less damage on top of the plate.',
    bonus: { dmgFlat: 6, maxHp: 15, reduction: 10 },
  },
  channeler: {
    weapon: 'staff', armor: 'magic',
    name: 'Rune Channeler', icon: '🪄',
    how: 'Carry an Oak Staff while wearing the Enchanted Robe.',
    msg: 'The staff hums with the robe’s magic: +4 damage and +10 max HP while the runes course through your arms.',
    bonus: { dmgFlat: 4, maxHp: 10 },
  },
  crusher: {
    weapon: 'hammer', armor: 'dragon',
    name: 'Dragon Crusher', icon: '🔨',
    how: 'Raise an Iron Hammer while wearing Dragon Hide.',
    msg: 'Dragon scales over a hammer fist: +3 damage, 8% less damage taken and +10 max HP — a wall that swings back.',
    bonus: { dmgFlat: 3, reduction: 8, maxHp: 10 },
  },
};
var SET_ORDER = ['brawler', 'skirmisher', 'vanguard', 'channeler', 'crusher'];

// ------------------------------------------------ titles (vertical milestones, auto-earned by wins)
var TITLES = [
  { wins: 3,  name: 'Tribune’s Pick',     bonus: '+10 max HP',            maxHp: 10 },
  { wins: 5,  name: 'Arena Veteran',      bonus: '+10% coins earned',     coinsPct: 10 },
  { wins: 8,  name: 'Pride of Capua',     bonus: '+5% dodge chance',      dodge: 5 },
  { wins: 12, name: 'Gladiator Primus',   bonus: '+10 max HP',            maxHp: 10 },
  { wins: 16, name: 'Legend of the Sand', bonus: '+10% damage dealt',     dmgPct: 10 },
];

// ------------------------------------------------ training (horizontal progression, bought with coins)
var TRAININGS = {
  condition: {
    name: 'Conditioning', icon: '💪', max: 10, base: 40, step: 15,
    desc: '+10 max HP per rank. The crowd adores a fighter who refuses to stay down.',
  },
  footwork: {
    name: 'Footwork', icon: '👣', max: 3, base: 60, step: 25,
    desc: '+4% base dodge per rank. Sand underfoot, eyes on the blade.',
  },
  secondwind: {
    name: 'Second Wind', icon: '❤️', max: 1, base: 120, step: 0,
    desc: 'Once per battle: the first time you drop below 25% HP, you burst back with +25 HP.',
  },
  chanting: {
    name: 'Chanting', icon: '🗣️', max: 1, base: 200, step: 0,
    desc: 'Once per battle: chant a scroll in a free slot — you cast it AND still take your normal action.',
  },
};

// ------------------------------------------------ enemy archetypes (distinct AI personalities)
var ARCHETYPES = {
  brute:     { name: 'Brute',      icon: '🪓', desc: 'Huge, armored, hits like a landslide.' },
  duelist:   { name: 'Duelist',    icon: '🤺', desc: 'Lean and quick — always on the move.' },
  mage:      { name: 'Arena Mage', icon: '🧙', desc: 'Trains with the sages. Rolls with spells.' },
  wall:      { name: 'Wall',       icon: '🏰', desc: 'All shield and plate. Hard to crack.' },
  trickster: { name: 'Trickster',  icon: '🃏', desc: 'Masked and unpredictable. Every move could be any move — you cannot read him.' },
};

// ------------------------------------------------ random arena events (35% of battles)
var EVENTS = {
  bloodlust: { name: 'BLOODLUST',    desc: 'The crowd demands blood — the first attack of every round deals +30% damage.' },
  whetstone: { name: 'WHETSTONES',   desc: 'Your weapon gleams — your very first attack of the battle deals +50% damage.' },
  crowdgold: { name: 'CROWD FAVORITE', desc: 'Rome adores you — coins from this battle are +25%.' },
  cracked:   { name: 'CRACKED WALLS', desc: 'The old arena groans — every shield chip costs 1 extra use.' },
};

// ------------------------------------------------ flavor
var FIRST_NAMES = ['Crixus', 'Verus', 'Gannicus', 'Flamma', 'Priscus', 'Taurus', 'Spiculus', 'Carmesina', 'Flavius', 'Atticus', 'Varro', 'Cassian', 'Drusus', 'Magnus', 'Titus', 'Corvus', 'Glauco', 'Neaera', 'Sabina', 'Octavia', 'Brutus', 'Cato', 'Laetus', 'Severus'];
var EPITHETS = ['the Unbroken', 'of the Northern Sands', 'the Red', 'Ironhand', 'the Laughing', 'Bloodfang', 'the Quiet', 'Stonefist', 'the Cruel', 'Two-Blades', 'the Wandering', 'of Capua', 'the Young', 'Bonebreaker', 'the Silent', 'Sandsoul', 'the Merciless', 'Ashborn', 'the Unyielding', 'Nightfang'];
var WIN_FLAVOR = [
  'The sand drinks deep — your name echoes across the arena.',
  'The crowd roars. The money-changer counts out your gold.',
  'You stand alone on the sand. Rome bows its head.',
  'Another falls. The crowd wants more — and they get you.',
  'The referee waves the white flag. You live to fight tomorrow.',
];
var LOSE_FLAVOR = [
  'The sand is cold. The crowd’s cheers are for someone else today.',
  'Your knees give way. The purse keeps what it has.',
  'Darkness takes the arena. Gladiators always rise again.',
  'The surgeon’s saw is quick. Your legend is not over.',
];
var DRAW_FLAVOR = [
  'Neither man falls. The emperors split the purse at the marble table.',
  'Twenty-five rounds and no blood. The money-changer still counts you some gold.',
  'The crowd is unimpressed by the stalemate — but the purse is not empty.',
];
var ANNOUNCE_NORMAL = [
  'The sand awaits.',
  'The crowd leans forward…',
  'Trumpets sound over the sand.',
  'Blood for the arena!',
  'The gates groan open.',
];

// ------------------------------------------------ tiny math helpers (shared by all modules)
var rnd = Math.random;
function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, k) { return a + (b - a) * k; }
function easeOutCubic(k) { return 1 - Math.pow(1 - k, 3); }
function easeInCubic(k) { return k * k * k; }
function weightedPick(opts) { // opts: [[key, weight], ...]
  var tot = 0, i;
  for (i = 0; i < opts.length; i++) tot += opts[i][1];
  var r = rnd() * tot;
  for (i = 0; i < opts.length; i++) { r -= opts[i][1]; if (r <= 0) return opts[i][0]; }
  return opts[opts.length - 1][0];
}

// ---- seedable RNG (reproducible battles / daily-arena challenge) ----
// mulberry32: tiny, fast, good-enough PRNG. Seeding it makes every battle
// deterministic — enemy generation, the foe AI and all combat rolls go through
// the global rnd, so the same seed + same choices replay identically.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// FNV-1a: fold a string seed (e.g. a date like "2026-09-02") into 32 bits.
function hashSeed(str) {
  var h = 2166136261 >>> 0, i;
  for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// Reassign the global rnd to a seeded PRNG. A finite number is used as-is;
// anything else is hashed. Returns the seeded function.
function seedRng(seed) {
  var a = (typeof seed === 'number' && isFinite(seed)) ? (seed | 0) : hashSeed(String(seed));
  rnd = mulberry32(a);
  return rnd;
}

// ------------------------------------------------ derived stats (player, from save)
function maxHpOf() {
  var hp = 100 + (save.train.condition || 0) * 10;
  TITLES.forEach(function (t) { if (save.wins >= t.wins && t.maxHp) hp += t.maxHp; });
  return hp;
}
function baseDodgeOf() {
  // passive evasion only — the Dodge ACTION adds its own big bonus in combat.js
  var d = 15 + (save.train.footwork || 0) * 4;
  TITLES.forEach(function (t) { if (save.wins >= t.wins && t.dodge) d += t.dodge; });
  return d;
}
function dmgPctOf() {
  var p = 0;
  TITLES.forEach(function (t) { if (save.wins >= t.wins && t.dmgPct) p += t.dmgPct; });
  return p;
}
function coinsMult() {
  var m = 1;
  TITLES.forEach(function (t) { if (save.wins >= t.wins && t.coinsPct) m += t.coinsPct / 100; });
  return m;
}
// The gear set ("bond") currently forged by the equipped weapon + armor, or null.
function activeSetKey() {
  var w = save.equipped.weapon, a = save.equipped.armor;
  for (var i = 0; i < SET_ORDER.length; i++) {
    var k = SET_ORDER[i];
    if (SETS[k].weapon === w && SETS[k].armor === a) return k;
  }
  return null;
}
function currentTitle() {
  var t = null;
  TITLES.forEach(function (x) { if (save.wins >= x.wins) t = x; });
  return t;
}
function nextTitle() {
  for (var i = 0; i < TITLES.length; i++) if (save.wins < TITLES[i].wins) return TITLES[i];
  return null;
}

// ------------------------------------------------ save bootstrap
function defaultSave() {
  return {
    v: 1, coins: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0,
    weapons: ['fists'], armors: [], shields: [], shieldDur: {},
    equipped: { weapon: 'fists', armor: null, shield: null },
    scrolls: { fire: 0, water: 0, earth: 0, wind: 0, lightning: 0, ice: 0, life: 0, shadow: 0 },
    train: { condition: 0, footwork: 0, secondwind: 0, chanting: 0 },
    relics: [],
    discovered: [],
    discoveredSets: [],
    muted: false, seenIntro: false,
    crowdVol: 1, // 0..1 — scales the crowd murmur + roars (the "reduce crowd volume" slider)
  };
}
var save = (function () {
  try {
    var raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    var s = Object.assign(defaultSave(), JSON.parse(raw));
    s.train = Object.assign({ condition: 0, footwork: 0, secondwind: 0, chanting: 0 }, s.train || {});
    s.scrolls = Object.assign(defaultSave().scrolls, s.scrolls || {});
    if (!Array.isArray(s.relics)) s.relics = [];
    if (!Array.isArray(s.discoveredSets)) s.discoveredSets = [];
    if (typeof s.crowdVol !== 'number') s.crowdVol = 1;
    return s;
  } catch (e) { return defaultSave(); }
})();
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ }
}
