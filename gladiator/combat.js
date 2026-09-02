/* ============================================================
   THE LAST GLADIATOR — combat.js
   Pure rules engine. No DOM, no three.js. Resolves simultaneous
    rounds: attacks, dodges, defends, spells, dots, all 12 hidden
    combos, plus enemy archetypes and the reactive AI.

    Public API:
      combat.me / combat.foe     the two fighters of the current fight
      freshFighter()             build the player fighter from save
      makeEnemy(level)           build a scaling enemy (archetype, gear)
      foeCommit()                foe pre-commits his plan (round start, visible state)
      enemyChoose(playerAction)  record your action, return the foe's committed plan
      resolveAttack(att, def, ctx) → result
      resolveSpell(caster, target, element) → result
      tickDots()                 end-of-round burn/poison → results
      actionCost(f, type) / canAct(f, type) / payAction(f, type)  stamina
      commonWeaponFor(level) / legendaryWeaponFor(slot)
   ============================================================ */

var combat = (function () {
  'use strict';

  var me = null, foe = null;

  // ---------- fighter factory ----------

  // Time-based states are round counters set to 2 when applied: they
  // tick down at the end of the casting round, stay live for the next
  // full round, and can be consumed earlier by their effect.
  function baseState() {
    return {
      stun: 0,          // rounds unable to act (ticks at the START of a round)
      soaked: 0,        // live rounds of soak (conductor fuel)
      frozen: 0,        // live rounds: cannot dodge; own attack -50% (consumed); heavy hits x2 (consumed)
      wind: false,      // next attack -25% (consumed on the attempt)
      shadow: false,    // next physical attack misses (consumed on the attempt)
       rooted: 0,        // live rounds: cannot dodge (Seismic Hammer)
       ward: 0,          // live rounds: +30% dodge (mage self-buff)
       aegis: 0,         // live rounds: +25% dodge (Tortoise Aegis parry)
       feather: false,   // next attack +25% (Featherfall; consumed on the attempt)
       burn: null,       // {dmg, turns}
       poison: null,     // {dmg, turns, doubled}
     };
  }

  function freshFighter() {
    var w = save.equipped.weapon;
    var a = save.equipped.armor;
    var s = save.equipped.shield;
    var f = {
      side: 'me',
      name: 'You',
      weapon: w,
      armor: a || null,
      shield: s || null,
      shieldDur: s ? (save.shieldDur[s] != null ? save.shieldDur[s] : SHIELDS[s].dur) : 0,
      champion: false,
      arch: null,
      rage: false,
      committed: null,
      state: baseState(),
      spellCd: 0,
    };
    f.maxHp = maxHpOf();
    f.hp = f.maxHp; // a gladiator always enters the arena at full strength
    f.stamina = STAMINA.max;
    f.maxStamina = STAMINA.max;
    f.dmgBase = WEAPONS[w].dmg * (1 + dmgPctOf() / 100);
    f.reduction = a ? ARMORS[a].reduction : 0;
    f.dodgeBase = clamp(baseDodgeOf() + (a ? ARMORS[a].dodge : 0), 5, 95);
    return f;
  }

  // ---------- enemy generation ----------

  var COMMON_BY_LEVEL = [
    [1, 1, 'fists'], [2, 2, 'club'], [3, 4, 'sword'], [5, 6, 'staff'],
    [7, 9, 'hammer'], [10, 12, 'spear'], [13, 99, 'axe'],
  ];
  var LEGENDARY_BY_SLOT = { 1: 'stormclub', 2: 'flamesword', 3: 'stormstaff', 4: 'seishammer', 5: 'venomsp', 6: 'bersaxe' };

  // One weapon ladder for all physical archetypes, tuned to track the player's
  // coin curve: at each level the foe's tier ≈ the tier a greedy player can
  // afford at that level, which is what keeps the win rate pinned near 50%.
  // Archetype "flavor" lives in the damage multiplier in makeEnemy, not here.
  function commonWeaponFor(level) {
    var tiers = [[1, 1, 'club'], [2, 4, 'sword'], [5, 7, 'staff'], [8, 10, 'hammer'], [11, 13, 'spear'], [14, 999, 'axe']];
    for (var i = 0; i < tiers.length; i++) {
      if (level >= tiers[i][0] && level <= tiers[i][1]) return tiers[i][2];
    }
    return 'axe';
  }

  function legendaryWeaponFor(slot) { return LEGENDARY_BY_SLOT[slot] || 'bersaxe'; }

  function pickArchetype(level) {
    var opts;
    if (level <= 2) opts = [['brute', 3], ['duelist', 4], ['wall', 3]];
    else if (level <= 5) opts = [['brute', 3], ['duelist', 3], ['mage', 2], ['wall', 2]];
    else if (level <= 7) opts = [['brute', 3], ['duelist', 3], ['mage', 3], ['wall', 3]];
    else opts = [['brute', 3], ['duelist', 3], ['mage', 3], ['wall', 3], ['trickster', 2]];
    return weightedPick(opts);
  }

  function makeEnemy(level) {
    var champion = level % 5 === 0;
    var arch = pickArchetype(level);
    // the trickster is a mystery of the lower ranks — champions are known stars
    if (champion && arch === 'trickster') arch = pickArchetype(Math.min(level, 7));
    var weapon = (arch === 'mage') ? 'staff' : commonWeaponFor(level);
    if (champion) weapon = legendaryWeaponFor(WEAPONS[weapon].tier);

    var armor = null;
    if (arch === 'brute') armor = level >= 9 ? (rnd() < 0.5 ? 'dragon' : 'iron') : level >= 5 ? 'iron' : 'leather';
    else if (arch === 'wall') armor = level >= 4 ? 'iron' : 'leather';
    else if (arch === 'duelist') armor = level >= 3 ? 'leather' : null;
    else if (arch === 'trickster') armor = level >= 10 ? 'leather' : null;
    // walls keep their iron plate (a tank you can hit); other champions may roll Dragon Hide
  if (champion && armor && arch !== 'wall') armor = rnd() < 0.35 ? 'dragon' : armor;
    if (champion && !armor && arch !== 'mage') armor = 'leather';

    var shield = null;
    // no shields before level 3: fists can't chip them, so a walled early foe
    // would be unkillable by a bare-knuckle rookie
    if (arch === 'wall') shield = level >= 9 ? 'tower' : level >= 5 ? 'iron' : level >= 3 ? 'wooden' : null;
    else if (arch === 'duelist' && level >= 8 && rnd() < 0.3) shield = 'iron';

    // champions: a bigger HP pool + the legendary weapon. The legendary
    // already carries their level, so champions do NOT get the common
    // damage ramp (see below) — double-dipping both made level 10 a wall.
    var champHp = champion ? 1.05 : 1;
    var hp = Math.round((50 + level * 10) * champHp);
    // passive evasion only; the AI's Dodge action adds +55 on top in dodgeChance
    var dodgeBase = { brute: 10, duelist: 20, mage: 12, wall: 8, trickster: 22 }[arch] + (champion ? 5 : 0);
    if (armor) dodgeBase += ARMORS[armor].dodge;

    var f = {
      side: 'foe',
      name: pick(FIRST_NAMES) + ' ' + pick(EPITHETS),
      level: level,
      arch: arch,
      champion: champion,
      weapon: weapon,
      armor: armor,
      shield: shield,
       shieldDur: shield ? SHIELDS[shield].dur : 0,
       rage: false,
       committed: null,
       spellCd: 0,
       state: baseState(),
       maxHp: hp,
      hp: hp,
      stamina: champion ? STAMINA.champMax : STAMINA.max,
      maxStamina: champion ? STAMINA.champMax : STAMINA.max,
      spellPower: Math.round(10 + level * 1.3),
    };
    // archetype flavor: brutes hit like trucks, walls swing lazily, mages lean
    // on their spells (their staff is just there in a pinch)
    var flavor = { brute: 1.12, duelist: 0.92, wall: 0.88, mage: 0.8, trickster: 1.0 }[arch];
    // champions skip the level ramp — their legendary is already the upgrade
    var ramp = champion ? 1 : (1 + level * 0.02);
    f.dmgBase = WEAPONS[weapon].dmg * ramp * flavor;
    f.reduction = armor ? ARMORS[armor].reduction : 0;
    f.dodgeBase = clamp(dodgeBase, 5, 95);
    return f;
  }

  // ---------- helpers ----------

  // Passive evasion (dodgeBase) + a big bonus when the fighter CHOSE Dodge
  // this round + the mage's ward buff + the aegis parry steady.
  // Frozen/rooted foes cannot dodge.
  function dodgeChance(f) {
    if (f.state.frozen > 0 || f.state.rooted > 0) return 0;
    var d = f.dodgeBase + (f.dodging ? 55 : 0) + (f.state.ward > 0 ? 30 : 0) + (f.state.aegis > 0 ? 25 : 0);
    return clamp(d, 5, 95);
  }

  function hpPct(f) { return f.hp / f.maxHp; }

  // ---------- stamina ----------
  // Heavy arms are slow: attack cost follows the weapon tier table.
  // Rest costs nothing and grants STAMINA.rest instead.

  function actionCost(f, type) {
    if (type === 'attack') {
      var c = STAMINA.attackByTier[WEAPONS[f.weapon].tier];
      return c != null ? c : STAMINA.attackByTier[2];
    }
    if (type === 'dodge') return STAMINA.dodge;
    if (type === 'defend') return STAMINA.defend;
    if (type === 'cast') return STAMINA.cast;
    return 0;
  }

  function canAct(f, type) {
    return type === 'rest' ? true : f.stamina >= actionCost(f, type);
  }

  function payAction(f, type) {
    if (type === 'rest') f.stamina = Math.min(f.maxStamina, f.stamina + STAMINA.rest);
    else f.stamina = Math.max(0, f.stamina - actionCost(f, type));
  }

  function variance() { return 0.9 + rnd() * 0.2; }

  function addCombos(res, id) {
    if (res.combos.indexOf(id) === -1) res.combos.push(id);
  }

  function newResult(kind, from) {
    return { kind: kind, from: from, dmg: 0, heal: 0, dodged: false, blocked: false, parried: false, miss: false,
             shieldHit: false, shieldBroken: false, combos: [], procs: [], counters: [] };
  }

  // ---------- enemy AI (a little chess) ----------
  // The foe plays the same stamina game you do: he reads YOUR visible
  // stamina to judge whether this round is safe, then follows his
  // archetype personality — but only within what his own stamina allows.

  var lastPlayerActions = [];

  // pick by weights, but only among actions the fighter can afford;
  // a fighter who can afford nothing rests
  function pickAffordable(f, opts) {
    var usable = [];
    for (var i = 0; i < opts.length; i++) if (canAct(f, opts[i][0])) usable.push(opts[i]);
    if (!usable.length) return 'rest';
    return weightedPick(usable);
  }

  // The foe commits to a plan at the START of the round, from what he can see —
  // your stamina and your recent actions. He never sees your current hidden
  // choice (that's what makes the rounds simultaneous). The windup glow in the
  // scene shows this committed intent, so a sharp eye can read the AI's habits.
  function foeCommit() {
    var f = foe;
    if (!f || f.hp <= 0) { f.committed = { type: 'idle' }; return f.committed; }

    // can the player strike this round? (his stamina is visible to the foe)
    var pCanAttack = !!me && !me.skipRound && canAct(me, 'attack');

    // completely spent: only an honest rest is left
    if (!canAct(f, 'attack') && !canAct(f, 'defend') && !canAct(f, 'dodge') && !canAct(f, 'cast')) { f.committed = { type: 'rest' }; return f.committed; }

    // champion rage: no more thinking, only violence (rest if too spent)
    if (f.champion && f.rage) { f.committed = canAct(f, 'attack') ? { type: 'attack' } : { type: 'rest' }; return f.committed; }

    var prev = lastPlayerActions[lastPlayerActions.length - 1]; // your action last round (visible)

    if (f.arch === 'mage') {
      if (f.spellCd <= 0 && canAct(f, 'cast')) {
        var cast = rnd() < (f.hp < f.maxHp * 0.55 ? 0.62 : 0.45);
        if (cast) {
          var spell;
          if (f.hp < f.maxHp * 0.45 && rnd() < 0.4) spell = 'life';
          else if (rnd() < 0.5) spell = 'fire';
          else if (rnd() < 0.6) spell = 'earth';
          else spell = 'ward';
          f.spellCd = 2;
          f.committed = { type: 'cast', spell: spell };
          return f.committed;
        }
      }
      // on cooldown: gather stamina while the round is safe, otherwise swing
      if (!pCanAttack && canAct(f, 'rest') && f.stamina < f.maxStamina * 0.5 && rnd() < 0.6) { f.committed = { type: 'rest' }; return f.committed; }
      f.committed = canAct(f, 'attack') ? { type: 'attack' } : { type: 'rest' };
      return f.committed;
    }

    if (f.arch === 'trickster') {
      // the unreadable one: mostly pure chaos, with an occasional flash of
      // insight — you cannot build a read on him, that is the whole point
      if (prev === 'attack' && rnd() < 0.4 && canAct(f, 'defend')) { f.committed = { type: 'defend' }; return f.committed; }
      if (rnd() < 0.55) { f.committed = { type: pickAffordable(f, [['attack', 45], ['dodge', 30], ['defend', 25]]) }; return f.committed; }
      f.committed = { type: pickAffordable(f, [['attack', 70], ['dodge', 15], ['defend', 15]]) };
      return f.committed;
    }

    // the player can't attack: a safe beat — press it
    if (!pCanAttack) {
      if (canAct(f, 'attack') && rnd() < 0.85) { f.committed = { type: 'attack' }; return f.committed; }
      f.committed = canAct(f, 'defend') ? { type: 'defend' } : { type: 'rest' };
      return f.committed;
    }

    // the player CAN attack: archetype personality, stamina-gated
    var t;
    if (f.arch === 'brute') {
      t = pickAffordable(f, [['attack', 78], ['defend', 12], ['dodge', 10]]);
    } else if (f.arch === 'duelist') {
      // quick to the blade; if you kept dodging him, he presses harder
      var atk = prev === 'dodge' ? 74 : 56;
      t = pickAffordable(f, [['attack', atk], ['dodge', 28], ['defend', 100 - atk - 28]]);
    } else { // wall
      // reads your attacks: two strikes in a row make him brace
      if (prev === 'attack') t = pickAffordable(f, [['defend', 62], ['attack', 30], ['dodge', 8]]);
      else t = pickAffordable(f, [['defend', 34], ['attack', 58], ['dodge', 8]]);
    }
    f.committed = { type: t };
    return f.committed;
  }

  function enemyChoose(playerAction) {
    lastPlayerActions.push(playerAction);
    if (lastPlayerActions.length > 3) lastPlayerActions.shift();
    return (foe && foe.committed) || { type: 'attack' };
  }

  // ---------- melee resolution ----------
  // ctx: { round, firstStriker: 'me'|'foe', whetUsed: bool (mutable) }

  function resolveAttack(att, def, ctx) {
    var res = newResult('attack', att.side);

    // shadow: the attacker's blow vanished into the dark
    if (att.state.shadow) {
      att.state.shadow = false;
      res.miss = true;
      return res;
    }

    // dodge
    if (rnd() * 100 < dodgeChance(def)) {
      res.dodged = true;
      // Counter Jab: slip past a weakened foe and jab
      if (def.side === 'me' && (att.state.wind || att.state.frozen > 0)) {
        att.hp = Math.max(0, att.hp - 5);
        res.counters.push({ who: 'me', dmg: 5, reason: 'jab' });
        addCombos(res, 'jab');
      }
      return res;
    }

    // damage
    var dmg = att.dmgBase * variance();
    var heavy = WEAPONS[att.weapon].tier >= 4;

    // Berserker Axe
    if (att.side === 'me' && att.weapon === 'bersaxe' && hpPct(att) < 0.3) dmg *= 1.5;
    // champion rage
    if (att.champion && att.rage) dmg *= 1.3;
    // weakened attacker states (consumed on the attempt)
    if (att.state.wind) { dmg *= 0.75; att.state.wind = false; }
    if (att.state.frozen > 0) { dmg *= 0.5; att.state.frozen = 0; }
    // Featherfall: light as air after slipping past the magic
    if (att.side === 'me' && att.state.feather) { dmg *= 1.25; att.state.feather = false; }
    // events
    if (ctx.event === 'bloodlust' && ctx.firstStriker === att.side) dmg *= 1.3;
    if (ctx.event === 'whetstone' && att.side === 'me' && !ctx.whetUsed) { dmg *= 1.5; ctx.whetUsed = true; }

    // armor reduction (Dragonfire: Flamebrand + Dragon Hide ignores armor)
    var ignoreArmor = att.side === 'me' && att.weapon === 'flamesword' && att.armor === 'dragon';
    if (ignoreArmor) addCombos(res, 'dragonfire');
    else dmg *= 1 - (def.reduction || 0) / 100;

    // Ice Shatter: a frozen foe is brittle — heavy weapons double it
    var shatter = def.state.frozen > 0 && heavy;

    // defend
    if (def.defending) {
      if (def.shield && def.shieldDur > 0) {
        res.blocked = true;
        dmg = 0;
        res.shieldHit = true;
        var wasTower = def.shield === 'tower';
        var wasAegis = def.shield === 'aegis';
        if (WEAPONS[att.weapon].tier > 0) {
          var chip = 1 + (ctx.event === 'cracked' ? 1 : 0);
          def.shieldDur -= chip;
          if (def.shieldDur <= 0) {
            def.shieldDur = 0;
            def.shield = null;
            res.shieldBroken = true;
          }
        }
        // Battering Ram: a tower shield hits back
        if (def.side === 'me' && wasTower) {
          att.hp = Math.max(0, att.hp - 8);
          res.counters.push({ who: 'me', dmg: 8, reason: 'ram' });
          addCombos(res, 'ram');
        }
        // Tortoise Aegis: a steady block steadies the bearer
        if (def.side === 'me' && wasAegis) {
          def.state.aegis = 2;
          res.procs.push('aegis');
        }
      } else {
        res.parry = true;
        dmg *= 0.5;
      }
    }

    // Ice Shatter lands only on a hit that actually connects
    if (shatter && !res.blocked) {
      dmg *= 2;
      def.state.frozen = 0;
      addCombos(res, 'iceShatter');
    }

    dmg = Math.max(1, Math.round(dmg));
    if (!res.blocked) def.hp = Math.max(0, def.hp - dmg);
    res.dmg = res.blocked ? 0 : dmg;

    // weapon procs on a landed hit (blocked hits do nothing)
    if (!res.blocked && !res.dodged) {
      var w = att.weapon;
      if (w === 'flamesword') { def.state.burn = { dmg: 4, turns: 3 }; res.procs.push('burn'); }
      else if (w === 'venomsp') { def.state.poison = { dmg: 2, turns: 3 }; res.procs.push('poison'); }
      else if (w === 'stormclub' && rnd() < 0.25) { def.state.stun = 1; res.procs.push('stun'); }
      else if (w === 'stormstaff' && rnd() < 0.20) { def.state.stun = 1; res.procs.push('stun'); }
      else if (w === 'seishammer' && rnd() < 0.20) { def.state.rooted = 2; res.procs.push('rooted'); }
    }

    return res;
  }

  // ---------- spell resolution ----------

  function resolveSpell(caster, target, element) {
    var res = newResult('spell', caster.side);
    var sc = SCROLLS[element];

    // dodge (spells can be slipped past — unless frozen/rooted)
    if (rnd() * 100 < dodgeChance(target)) {
      res.dodged = true;
      return res;
    }

    var dmg = 0;
    if (element === 'life') {
      // heal the caster; you are defenseless while the chant is spoken
      var amount = sc.heal;
      caster.hp = Math.min(caster.maxHp, caster.hp + amount);
      res.heal = amount;
      return res;
    }
    if (element === 'shadow') {
      target.state.shadow = true;
      res.procs.push('shadow');
      return res;
    }

    dmg = sc.dmg;
    // caster bonuses
    if (caster.armor === 'magic') dmg += 2;
    if (caster.armor === 'dragon' && element === 'fire') dmg *= 1.5;

    // Conductor: lightning through a soaked foe
    if (element === 'lightning' && target.state.soaked > 0) {
      dmg *= 2;
      target.state.soaked = 0;
      target.state.stun = 1;
      res.procs.push('stun');
      addCombos(res, 'conductor');
    }

    // defend (a shield fully blocks magic; magic never chips wood or iron)
    if (target.defending) {
      if (target.shield && target.shieldDur > 0) {
        res.blocked = true;
        dmg = 0;
      } else {
        res.parry = true;
        dmg *= 0.5;
      }
    }

    dmg = Math.max(0, Math.round(dmg));
    if (!res.blocked) target.hp = Math.max(0, target.hp - dmg);
    res.dmg = res.blocked ? 0 : dmg;

    // effects land only on an unblocked cast
    if (!res.blocked) {
      if (element === 'fire') {
        // Boiling Venom: fire boils the venom
        if (target.state.poison) {
          target.state.poison.doubled = true;
          addCombos(res, 'boil');
        }
        // Cauterize: fire seals a stunned foe
        if (target.state.stun > 0) {
          target.state.burn = { dmg: 4, turns: 3 };
          res.procs.push('burn', 'cauterize');
          addCombos(res, 'cauterize');
        }
      }
      if (element === 'water') { target.state.stun = 1; target.state.soaked = 2; res.procs.push('stun', 'soaked'); }
      if (element === 'earth') { target.state.stun = 1; res.procs.push('stun'); }
      if (element === 'wind') { target.state.wind = true; res.procs.push('wind'); }
      if (element === 'ice') { target.state.frozen = 2; res.procs.push('frozen'); }
    }

    return res;
  }

  // ---------- foe spells (Arena Mages) ----------
  // Mages don't use scrolls; they know four innate spells. No control
  // over the player except earth's stun — so your plan never derailed.

  function resolveFoeSpell(caster, target, spell) {
    var res = newResult('spell', 'foe');

    if (spell === 'ward') {
      caster.state.ward = 2;
      res.procs.push('ward');
      return res;
    }
    if (spell === 'life') {
      var amt = Math.round(caster.spellPower * 1.2);
      caster.hp = Math.min(caster.maxHp, caster.hp + amt);
      res.heal = amt;
      res.procs.push('heal');
      return res;
    }

    var raw = spell === 'fire' ? caster.spellPower : Math.round(caster.spellPower * 0.7);

    // the player can dodge or block the magic
    if (rnd() * 100 < dodgeChance(target)) {
      res.dodged = true;
      // Featherfall: slipping past the magic leaves you light as air
      if (target.side === 'me') {
        target.state.feather = true;
        res.procs.push('feather');
        addCombos(res, 'featherfall');
      }
      return res;
    }
    var dmg = raw;
    // Iron Composure: iron plate drinks the tremor
    if (spell === 'earth' && target.armor === 'iron') {
      dmg = 0;
      addCombos(res, 'ironcalm');
    }
    if (target.defending) {
      if (target.shield && target.shieldDur > 0) {
        res.blocked = true;
        dmg = 0;
        // Warded Block: enchanted runes drink the magic and hurl half back;
        // a Tower Shield behind the robe mirrors it at full strength
        if (target.side === 'me' && target.armor === 'magic') {
          var mirror = target.shield === 'tower';
          var back = Math.max(1, Math.round(raw * (mirror ? 1 : 0.5)));
          caster.hp = Math.max(0, caster.hp - back);
          res.counters.push({ who: 'me', dmg: back, reason: mirror ? 'mirror' : 'warded' });
          addCombos(res, mirror ? 'mirrorward' : 'warded');
        }
      } else {
        res.parry = true;
        dmg *= 0.5;
      }
    }

    dmg = Math.max(0, Math.round(dmg));
    if (!res.blocked) target.hp = Math.max(0, target.hp - dmg);
    res.dmg = res.blocked ? 0 : dmg;

    if (!res.blocked && spell === 'earth') {
      target.state.stun = 1;
      res.procs.push('stun');
    }
    return res;
  }

  // ---------- end of round: dots + state decay ----------

  function tickDots() {
    var results = [];
    [me, foe].forEach(function (f) {
      if (!f || f.hp <= 0) return;
      ['burn', 'poison'].forEach(function (k) {
        var dot = f.state[k];
        if (dot) {
          var d = dot.dmg * (k === 'poison' && dot.doubled ? 2 : 1);
          f.hp = Math.max(0, f.hp - d);
          results.push({ who: f.side, kind: k, dmg: d });
          dot.turns -= 1;
          if (dot.turns <= 0) f.state[k] = null;
        }
      });
    });
    // round counters decay at end of round (stun is ticked at round START
    // in beginRound so a freshly stunned fighter skips the next round)
    [me, foe].forEach(function (f) {
      if (!f) return;
      if (f.state.soaked > 0) f.state.soaked -= 1;
      if (f.state.frozen > 0) f.state.frozen -= 1;
      if (f.state.rooted > 0) f.state.rooted -= 1;
      if (f.state.ward > 0) f.state.ward -= 1;
      if (f.state.aegis > 0) f.state.aegis -= 1;
      if (f.side === 'foe' && f.spellCd > 0) f.spellCd -= 1;
    });
    return results;
  }

  function beginRound() {
    [me, foe].forEach(function (f) {
      if (!f) return;
      f.defending = false;
      f.dodging = false;
      f.skipRound = false;
      if (f.state.stun > 0) {
        f.skipRound = true;
        f.state.stun -= 1;
      }
      // breath recovers even a stunned fighter
      f.stamina = Math.min(f.maxStamina, f.stamina + STAMINA.regen);
    });
  }

  function reset() {
    me = freshFighter();
    foe = null;
    lastPlayerActions = [];
  }

  return {
    get me() { return me; },
    get foe() { return foe; },
    setFoe: function (f) { foe = f; },
    reset: reset,
    freshFighter: freshFighter,
    makeEnemy: makeEnemy,
    foeCommit: foeCommit,
    enemyChoose: enemyChoose,
    resolveAttack: resolveAttack,
    resolveSpell: resolveSpell,
    resolveFoeSpell: resolveFoeSpell,
    tickDots: tickDots,
    beginRound: beginRound,
    commonWeaponFor: commonWeaponFor,
    legendaryWeaponFor: legendaryWeaponFor,
    dodgeChance: dodgeChance,
    actionCost: actionCost,
    canAct: canAct,
    payAction: payAction,
  };
})();
