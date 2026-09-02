/* ============================================================
   THE LAST GLADIATOR — game.js
   Orchestration + UI: hub, armory (shop), battle flow with
   animation sequencing, discoveries, announcer, arena events,
   results, save handling and boot.
   ============================================================ */

var Game = (function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  var state = {
    screen: 'hub',
    busy: false,
    inBattle: false,
    round: 0,
    event: null,
    whetUsed: false,
    battleCombos: [],
    secondWindUsed: false,
    chantUsed: false,
    flaskUsed: false,
    lowHpEver: false,
    logLoose: 0,
    lastStand: false,
    rageShown: false,
    audioOn: false,
    myShield: null,        // the shield key at battle start (combat nulls it when it shatters)
    myShieldName: 'guard', // shield name at the start of the current round
    foeShieldName: 'guard',
    seed: null,            // when set (via ?seed=), every battle re-seeds the RNG so it replays identically
  };

  var actionResolver = null; // resolves when the player picks a battle action

  // ---------- small UI helpers ----------

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

  // Read the optional ?seed= query param. A number is returned as a number,
  // anything else as the decoded string (hashSeed folds it in seedRng).
  function getSeedParam() {
    try {
      var m = /[?&]seed=([^&]+)/.exec(window.location.search || '');
      if (m && m[1] !== '') {
        var raw = decodeURIComponent(m[1]);
        return (raw !== '' && !isNaN(raw) && isFinite(Number(raw))) ? Number(raw) : raw;
      }
    } catch (e) { /* private mode / no location */ }
    return null;
  }

  // A line that carries a bold token (<b>) is "pinned" — damage, combos,
  // shield breaks, events. Pinned lines are never collapsed. Between them the
  // loose chatter (defends, dodges, rests, tells) accumulates; once more than
  // LOG_LOOSE_GAP of it sits without a pinned line, the oldest folds into a
  // single '…' so the log stays focused on what mattered.
  var LOG_LOOSE_GAP = 10;

  function foldOldLoose(box) {
    var kids = Array.prototype.slice.call(box.children);
    var pIdx = -1;
    for (var i = kids.length - 1; i >= 0; i--) {
      if (kids[i].className.indexOf('log-pin') !== -1) { pIdx = i; break; }
    }
    var start = pIdx + 1;
    var marker = null;
    for (var m = start; m < kids.length; m++) {
      if (kids[m].className.indexOf('log-collapsed') !== -1) { marker = kids[m]; break; }
    }
    if (marker) {
      var t = marker.nextSibling;
      if (t && t.className.indexOf('log-pin') === -1 && t.className.indexOf('log-collapsed') === -1) {
        marker._count = (marker._count || 1) + 1;
        box.removeChild(t);
      }
    } else {
      for (var n = start; n < kids.length; n++) {
        if (kids[n].className.indexOf('log-pin') === -1) {
          kids[n].className = 'log-line log-collapsed';
          kids[n].innerHTML = '…';
          kids[n]._count = 1;
          break;
        }
      }
    }
  }

  function logLine(html, cls) {
    var box = $('log');
    var pinned = String(html).indexOf('<b>') !== -1;
    box.appendChild(el('div', 'log-line' + (cls ? ' ' + cls : '') + (pinned ? ' log-pin' : ''), html));
    if (pinned) {
      state.logLoose = 0;
    } else {
      state.logLoose += 1;
      if (state.logLoose > LOG_LOOSE_GAP) foldOldLoose(box);
    }
    while (box.children.length > 46) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  function showScreen(name) {
    state.screen = name;
    ['hub', 'shop', 'result'].forEach(function (s) {
      var e = $('screen-' + s);
      if (e) e.classList.toggle('on', s === name);
    });
    $('hud-battle').classList.toggle('on', name === 'battle');
    $('action-bar').classList.toggle('on', name === 'battle' && !state.busy && state.inBattle);
    // keep the battle log readable on top of the result screen
    $('log').classList.toggle('over-result', name === 'result');
  }

  function announcer(title, sub) {
    var a = $('announcer');
    $('announcer-title').textContent = title;
    $('announcer-sub').textContent = sub || '';
    a.classList.remove('on');
    void a.offsetWidth;
    a.classList.add('on');
    setTimeout(function () { a.classList.remove('on'); }, 2600);
  }

  var toastTimer = 0;
  function toast(icon, title, sub) {
    $('toast-icon').textContent = icon;
    $('toast-title').textContent = title;
    $('toast-sub').textContent = sub || '';
    $('toast').classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $('toast').classList.remove('on'); }, 4200);
  }

  // ---------- HUD ----------

  function updateHud() {
    $('coins').textContent = fmt(save.coins);
    var t = currentTitle();
    $('title-badge').textContent = t ? t.name : 'Hooded Novice';
    $('wins-streak').textContent = save.wins + ' wins · streak ' + save.streak;
    var next = nextTitle();
    $('next-title').textContent = next
      ? '🏅 ' + next.wins + ' wins: ' + next.name + ' (' + next.bonus + ')'
      : '🏅 You hold every title in Rome.';
  }

  var STATUS_ICONS = [
    ['stun', '⭐'],
    ['frozen', '❄️'],
    ['soaked', '💦'],
    ['wind', '💨'],
    ['shadow', '🌑'],
    ['rooted', '⛓️'],
    ['ward', '🔮'],
    ['aegis', '🐢'],
    ['burn', '🔥'],
    ['poison', '☠️'],
  ];

  function renderStatus(box, f) {
    box.innerHTML = '';
    STATUS_ICONS.forEach(function (s) {
      var k = s[0], n = f.state[k];
      var html = null;
      if (k === 'stun') { if (n > 0) html = s[1] + (n > 1 ? '×' + n : ''); }
      else if (k === 'frozen' || k === 'soaked' || k === 'rooted' || k === 'ward') { if (n > 0) html = s[1]; }
      else if (k === 'burn') { if (n) html = s[1] + n.turns; }
      else if (k === 'poison') { if (n) html = s[1] + (n.doubled ? '²' : ''); }
      else if (n) html = s[1];
      if (html != null) box.appendChild(el('span', 'st-icon', html));
    });
    if (f.rage) box.appendChild(el('span', 'st-icon rage', '😡'));
    if (f.side === 'foe' && f.arch === 'mage' && f.spellCd === 1) box.appendChild(el('span', 'st-icon gather', '✨'));
    if (f.side === 'me' && save.relics.indexOf('flask') !== -1 && !state.flaskUsed) box.appendChild(el('span', 'st-icon flask', '🧪'));
    if (f.shield && f.shieldDur > 0) box.appendChild(el('span', 'st-icon', '🛡️' + f.shieldDur));
  }

  var EVENT_CHIPS = {
    bloodlust: '🩸 BLOODLUST — first attack of every round +30%',
    whetstone: '🪨 WHETSTONES — your first attack +50%',
    crowdgold: '🎲 CROWD FAVORITE — coins from this battle +25%',
    cracked: '🧱 CRACKED WALLS — every shield chip costs +1 use',
  };

  function updateEventChip() {
    var chip = $('event-chip');
    if (!state.event || !state.inBattle) { chip.hidden = true; return; }
    var used = state.event === 'whetstone' && state.whetUsed;
    chip.textContent = EVENT_CHIPS[state.event] + (used ? ' (used)' : '');
    chip.classList.toggle('used', used);
    chip.hidden = false;
  }

  function updatePanels() {
    var me = combat.me, foe = combat.foe;
    if (!me || !foe) return;
    var mk = function (fill, text, f) {
      var pct = Math.max(0, f.hp / f.maxHp * 100);
      fill.style.width = pct + '%';
      fill.className = 'hp-fill' + (pct < 30 ? ' low' : pct < 60 ? ' mid' : '');
      text.textContent = Math.max(0, f.hp) + ' / ' + f.maxHp;
    };
    mk($('me-hp-fill'), $('me-hp-text'), me);
    mk($('foe-hp-fill'), $('foe-hp-text'), foe);
    var mkst = function (fill, text, f) {
      fill.style.width = Math.max(0, f.stamina / f.maxStamina * 100) + '%';
      text.textContent = Math.round(f.stamina) + ' / ' + f.maxStamina;
    };
    mkst($('me-st-fill'), $('me-st-text'), me);
    mkst($('foe-st-fill'), $('foe-st-text'), foe);
    renderStatus($('me-status'), me);
    renderStatus($('foe-status'), foe);
    $('round-ind').textContent = 'ROUND ' + state.round + ' / ' + MAX_ROUND;
    updateEventChip();
    $('chant-btn').hidden = !(save.train.chanting && !state.chantUsed);
    var btns = document.querySelectorAll('#action-bar .act-btn');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var act = b.getAttribute('data-act');
      b.classList.toggle('cant', act === 'chant' ? !canChant() : !combat.canAct(me, act));
    }
  }

  // ---------- discoveries ----------

  function discoverCombo(id) {
    if (save.discovered.indexOf(id) !== -1) return;
    save.discovered.push(id);
    persist();
    var c = COMBOS[id];
    state.battleCombos.push(id);
    Sfx.discover();
    toast(c.icon, 'ARCANUM DISCOVERED — ' + c.name, c.msg);
  }

  function noteCombos(res) {
    if (res && res.combos) res.combos.forEach(discoverCombo);
  }

  // ---------- hub ----------

  function renderHub() {
    updateHud();
    $('hub-stats').innerHTML =
      '<span>🪙 ' + fmt(save.coins) + '</span>' +
      '<span>⚔️ ' + save.wins + ' wins</span>' +
      '<span>💀 ' + save.losses + ' losses</span>' +
      '<span>🤝 ' + save.draws + ' draws</span>' +
      '<span>🔥 best streak ' + save.bestStreak + '</span>';
    var w = WEAPONS[save.equipped.weapon];
    var relics = '';
    save.relics.forEach(function (k) { relics += '<span>' + RELICS[k].icon + ' ' + RELICS[k].name + '</span>'; });
    $('hub-gear').innerHTML =
      '<span>' + w.icon + ' ' + w.name + '</span>' +
      (save.equipped.armor ? '<span>' + ARMORS[save.equipped.armor].icon + ' ' + ARMORS[save.equipped.armor].name + '</span>' : '') +
      (save.equipped.shield ? '<span>' + SHIELDS[save.equipped.shield].icon + ' ' + SHIELDS[save.equipped.shield].name + ' (' + (save.shieldDur[save.equipped.shield] || 0) + ' uses)</span>' : '') +
      relics;
  }

  // ---------- shop ----------

  var shopTab = 'weapons';

  function shopCard(opts) {
    var card = el('div', 'shop-card' + (opts.disabled ? ' disabled' : ''));
    card.appendChild(el('div', 'shop-icon', opts.icon));
    var body = el('div', 'shop-body');
    body.appendChild(el('div', 'shop-name', opts.name + (opts.tag ? ' <em class="tag">' + opts.tag + '</em>' : '')));
    body.appendChild(el('div', 'shop-desc', opts.desc));
    if (opts.extra) body.appendChild(el('div', 'shop-extra', opts.extra));
    card.appendChild(body);
    var btn = el('button', 'buy-btn');
    btn.textContent = opts.btn;
    if (opts.disabled) btn.disabled = true;
    btn.addEventListener('click', opts.onClick);
    card.appendChild(btn);
    return card;
  }

  function renderShop() {
    $('shop-coins').textContent = '🪙 ' + fmt(save.coins);
    var tabs = $('shop-tabs');
    tabs.innerHTML = '';
    [['weapons', '⚔️ Weapons'], ['gear', '🛡️ Armor & Shields'], ['scrolls', '📜 Scrolls'], ['training', '💪 Training'], ['relics', '🧪 Relics'], ['arcana', '🔮 Arcana']].forEach(function (t) {
      var b = el('button', 'tab' + (shopTab === t[0] ? ' active' : ''), t[1]);
      b.addEventListener('click', function () { shopTab = t[0]; Sfx.click(); renderShop(); });
      tabs.appendChild(b);
    });
    var body = $('shop-body');
    body.innerHTML = '';

    if (shopTab === 'weapons') {
      Object.keys(WEAPONS).forEach(function (k) {
        var w = WEAPONS[k];
        var owned = save.weapons.indexOf(k) !== -1;
        var equipped = save.equipped.weapon === k;
        body.appendChild(shopCard({
          icon: w.icon, name: w.name, tag: w.leg ? 'legendary' : null, desc: w.desc,
          btn: equipped ? '✓ equipped' : owned ? 'equip' : w.cost + ' 🪙',
          disabled: !owned && save.coins < w.cost,
          onClick: function () {
            if (equipped) return;
            if (!owned) { save.coins -= w.cost; save.weapons.push(k); Sfx.buy(); } else Sfx.click();
            save.equipped.weapon = k;
            persist();
            Scene.buildPlayerView();
            renderShop(); updateHud();
          },
        }));
      });
    }

    if (shopTab === 'gear') {
      Object.keys(ARMORS).forEach(function (k) {
        var a = ARMORS[k];
        var owned = save.armors.indexOf(k) !== -1;
        var equipped = save.equipped.armor === k;
        body.appendChild(shopCard({
          icon: a.icon, name: a.name, desc: a.desc,
          btn: equipped ? '✓ equipped' : owned ? 'equip' : a.cost + ' 🪙',
          disabled: !owned && save.coins < a.cost,
          onClick: function () {
            if (equipped) return;
            if (!owned) { save.coins -= a.cost; save.armors.push(k); Sfx.buy(); } else Sfx.click();
            save.equipped.armor = k;
            persist(); renderShop(); updateHud();
          },
        }));
      });
      body.appendChild(el('div', 'shop-sep', '— shields are consumables: they shatter in battle —'));
      Object.keys(SHIELDS).forEach(function (k) {
        var s = SHIELDS[k];
        var owned = save.shields.indexOf(k) !== -1;
        var dur = owned ? (save.shieldDur[k] || 0) : s.dur;
        var equipped = save.equipped.shield === k;
        body.appendChild(shopCard({
          icon: s.icon, name: s.name, desc: s.desc,
          extra: owned ? 'remaining uses: ' + dur + ' / ' + s.dur : null,
          btn: owned ? (dur > 0 ? (equipped ? '✓ equipped' : 'equip') : 'shattered — ' + s.cost + ' 🪙 for a new one') : s.cost + ' 🪙',
          disabled: !owned && save.coins < s.cost,
          onClick: function () {
            if (owned) {
              if (dur > 0) { save.equipped.shield = equipped ? null : k; Sfx.click(); }
              else if (save.coins >= s.cost) { save.coins -= s.cost; save.shieldDur[k] = s.dur; save.equipped.shield = k; Sfx.buy(); }
            } else {
              save.coins -= s.cost;
              save.shields.push(k);
              save.shieldDur[k] = s.dur;
              save.equipped.shield = k;
              Sfx.buy();
            }
            persist(); renderShop(); updateHud();
          },
        }));
      });
    }

    if (shopTab === 'scrolls') {
      SCROLL_ORDER.forEach(function (k) {
        var s = SCROLLS[k];
        var n = save.scrolls[k] || 0;
        body.appendChild(shopCard({
          icon: s.icon, name: s.name, desc: s.desc,
          extra: 'in satchel: ' + n,
          btn: s.cost + ' 🪙',
          disabled: save.coins < s.cost,
          onClick: function () {
            save.coins -= s.cost;
            save.scrolls[k] = (save.scrolls[k] || 0) + 1;
            Sfx.buy();
            persist(); renderShop(); updateHud();
          },
        }));
      });
    }

    if (shopTab === 'training') {
      Object.keys(TRAININGS).forEach(function (k) {
        var tr = TRAININGS[k];
        var rank = save.train[k] || 0;
        var maxed = rank >= tr.max;
        var cost = tr.base + rank * tr.step;
        var pips = '';
        for (var i = 0; i < tr.max; i++) pips += (i < rank ? '●' : '○') + ' ';
        body.appendChild(shopCard({
          icon: tr.icon, name: tr.name, desc: tr.desc,
          extra: 'rank ' + rank + ' / ' + tr.max + '  ' + pips,
          btn: maxed ? 'mastered' : cost + ' 🪙',
          disabled: maxed || save.coins < cost,
          onClick: function () {
            save.coins -= cost;
            save.train[k]++;
            Sfx.buy();
            persist(); renderShop(); updateHud();
          },
        }));
      });
    }

    if (shopTab === 'relics') {
      body.appendChild(el('div', 'shop-sep', 'One-off keepsakes. Bought once, they act on their own — once per battle.'));
      RELIC_ORDER.forEach(function (k) {
        var r = RELICS[k];
        var owned = save.relics.indexOf(k) !== -1;
        body.appendChild(shopCard({
          icon: r.icon, name: r.name, tag: 'relic', desc: r.desc,
          btn: owned ? '✓ carried' : r.cost + ' 🪙',
          disabled: owned || save.coins < r.cost,
          onClick: function () {
            if (owned) return;
            save.coins -= r.cost;
            save.relics.push(k);
            Sfx.buy();
            persist(); renderShop(); updateHud();
          },
        }));
      });
    }

    if (shopTab === 'arcana') {
      body.appendChild(el('div', 'shop-sep', 'Secrets of the arena. They reveal themselves only when you pull them off.'));
      COMBO_ORDER.forEach(function (k) {
        var c = COMBOS[k];
        var found = save.discovered.indexOf(k) !== -1;
        var card = el('div', 'shop-card arcana' + (found ? '' : ' locked'));
        card.appendChild(el('div', 'shop-icon', found ? c.icon : '❓'));
        var b2 = el('div', 'shop-body');
        b2.appendChild(el('div', 'shop-name', found ? c.name : '???'));
        b2.appendChild(el('div', 'shop-desc', found ? c.how : 'Undiscovered. Tinker with magic, steel and armor until it clicks.'));
        card.appendChild(b2);
        body.appendChild(card);
      });
    }
  }

  // ---------- battle: setup ----------

  function battleLevel() { return save.wins + 1; }

  async function startBattle() {
    if (state.busy || state.inBattle) return;
    state.inBattle = true;
    state.battleCombos = [];
    state.whetUsed = false;
    state.secondWindUsed = false;
    state.chantUsed = false;
    state.flaskUsed = false;
    state.lowHpEver = false;
    state.logLoose = 0;
    state.rageShown = false;
    state.round = 0;

    // seeded battle: re-seed every fight so the same seed replays identically
    if (state.seed !== null) seedRng(state.seed);

    // a shattered shield can't be brought to the sand
    if (save.equipped.shield && (save.shieldDur[save.equipped.shield] || 0) <= 0) {
      save.equipped.shield = null;
      persist();
    }

    var level = battleLevel();
    state.event = rnd() < 0.35 ? pick(Object.keys(EVENTS)) : null;
    state.myShield = save.equipped.shield;
    // the rewind ledger: what you brought into the sand
    state.shieldSnapshot = state.myShield ? (save.shieldDur[state.myShield] || 0) : 0;
    state.scrollSnapshot = Object.assign({}, save.scrolls);

    combat.reset();
    var foe = combat.makeEnemy(level);
    if (state.lastStand) foe.hp = Math.max(1, Math.ceil(foe.maxHp * 0.5)); // the last stand: he enters already broken
    combat.setFoe(foe);
    $('act-cost-attack').textContent = '−' + combat.actionCost(combat.me, 'attack');
    Scene.rebuildEnemyVisual();
    Scene.buildPlayerView();
    Scene.setEnemyAura('none');
    Scene.removeIceShell();

    $('foe-name').innerHTML = foe.name + (foe.champion ? ' <span class="champ">CHAMPION</span>' : '');
    $('log').innerHTML = '';
    showScreen('battle');
    logLine((state.lastStand ? '⚔️ <b>LAST STAND</b>' : '<b>Battle ' + level + '</b>') + ' — you face <b>' + foe.name + '</b>' + (foe.champion ? ' <em class="champ">CHAMPION</em>' : '') + ' <span class="dim">(' + ARCHETYPES[foe.arch].icon + ' ' + ARCHETYPES[foe.arch].name + ')</span>' + (state.lastStand ? ' — he enters at <b>half strength</b>, for <b>half the gold</b>' : ''), 'log-event');
    // arena variety: every 5th battle the sky turns to night, every 10th a blood moon
    var mood = level % 10 === 0 ? 'bloodmoon' : (level % 5 === 0 ? 'night' : 'dusk');
    Scene.setMood(mood);
    if (mood === 'night') logLine('🌙 The gates open under a cold starlight.', 'log-event');
    else if (mood === 'bloodmoon') logLine('🌑 A blood moon hangs over the arena. The crowd is silent.', 'log-event');
    if (state.event) logLine('⚡ Arena event: <b>' + EVENTS[state.event].name + '</b> — ' + EVENTS[state.event].desc, 'log-event');

    Sfx.horn();
    announcer((foe.champion ? '👑 ' : '⚔️ ') + foe.name.toUpperCase(),
      (state.lastStand ? 'LAST STAND · ' : 'LVL ' + level + ' · ') + ARCHETYPES[foe.arch].name + (state.event ? ' · ' + EVENTS[state.event].name : ''));
    await Scene.sceneStart();
    Scene.crowdRoar(false);
    Ambience.setBattle(true);
    updatePanels();

    await runRounds();
  }

  // ---------- battle: round loop ----------

  async function runRounds() {
    while (state.inBattle) {
      state.round++;
      if (state.round > MAX_ROUND) return endBattle('draw');
      combat.beginRound();
      // the foe commits to a plan NOW, from what he can see (your stamina,
      // your recent actions) — before you choose, so the round is fair
      combat.foeCommit();
      state.myShieldName = combat.me.shield ? SHIELDS[combat.me.shield].name.toLowerCase() : 'guard';
      state.foeShieldName = combat.foe.shield ? SHIELDS[combat.foe.shield].name.toLowerCase() : 'guard';
      updatePanels();

      var me = combat.me, foe = combat.foe;

      // the mage's tell: one round of gathering before his spell is back
      if (foe.arch === 'mage' && foe.spellCd === 1) logLine('✨ ' + foe.name + ' gathers power — his spell returns next round.', 'log-foe');

      // windup telegraph: a brief glow of the foe's committed intent — a
      // readable habit, chess depth. Tricksters never telegraph (the
      // unreadable one); a stunned foe can't act, so no tell either.
      var tKind = foe.skipRound ? 'none'
        : (foe.arch === 'trickster') ? 'none'
        : ({ attack: 'attack', defend: 'defend', dodge: 'dodge', cast: 'cast' })[foe.committed ? foe.committed.type : ''] || 'none';
      Scene.foeTelegraph(tKind);

      var playerAction = me.skipRound ? { type: 'stunned' } : await askPlayer();
      if (me.skipRound) {
        Sfx.stun();
        Scene.fxStun('me');
        logLine('⭐ You are stunned — your action is lost!', 'log-foe');
        await sleep(600);
      }

      // chanting: a free slot — cast a scroll, then still take your normal action
      if (playerAction.type === 'chant') {
        state.chantUsed = true;
        state.busy = true;
        $('action-bar').classList.remove('on');
        combat.payAction(me, 'cast');
        var chantRes = combat.resolveSpell(me, foe, playerAction.element);
        logLine('🗣️ You chant the ' + SCROLLS[playerAction.element].name + ' — your action is intact.', 'log-me');
        await playPlayerSpell(playerAction.element, chantRes);
        noteCombos(chantRes);
        updatePanels();
        if (foe.hp <= 0) return endBattle('win');
        playerAction = await askPlayer();
      }

      Scene.foeTelegraph('none'); // you've committed — the tell is spent
      var foeAction = foe.skipRound ? { type: 'stunned' } : combat.enemyChoose(playerAction.type);
      if (foe.skipRound) {
        Sfx.stun();
        Scene.fxStun('foe');
        Scene.eAnim.stun();
        logLine('⭐ ' + foe.name + ' is stunned and staggers in place!', 'log-me');
        await sleep(600);
      }

      if (playerAction.type === 'defend') me.defending = true;
      if (foeAction.type === 'defend') foe.defending = true;
      if (playerAction.type === 'dodge') me.dodging = true;
      if (foeAction.type === 'dodge') foe.dodging = true;
      // stamina is spent the moment the action is committed (a stunned
      // fighter does nothing and pays nothing)
      if (!me.skipRound) combat.payAction(me, playerAction.type);
      if (!foe.skipRound) combat.payAction(foe, foeAction.type);

      var pAtk = playerAction.type === 'attack' && !me.skipRound;
      var fAtk = foeAction.type === 'attack' && !foe.skipRound;
      var ctx = {
        round: state.round,
        event: state.event,
        firstStriker: (pAtk && fAtk) ? (rnd() < 0.5 ? 'me' : 'foe') : (pAtk ? 'me' : 'foe'),
        whetUsed: state.whetUsed,
      };

      state.busy = true;
      $('action-bar').classList.remove('on');

      var pRes = null, fRes = null;
      if (pAtk) pRes = combat.resolveAttack(me, foe, ctx);
      else if (playerAction.type === 'cast') pRes = combat.resolveSpell(me, foe, playerAction.element);
      if (fAtk) fRes = combat.resolveAttack(foe, me, ctx);
      else if (foeAction.type === 'cast') fRes = combat.resolveFoeSpell(foe, me, foeAction.spell);
      state.whetUsed = ctx.whetUsed;

      // ---- animate (player first, then the foe) ----
      if (pRes) { await playPlayerAction(playerAction, pRes); updatePanels(); }
      else if (playerAction.type === 'rest' && !me.skipRound) {
        Sfx.rest();
        Scene.floatMe('+' + STAMINA.rest + ' STAMINA', '#ffd24a');
        logLine('🌬️ You catch your breath (+' + STAMINA.rest + ' stamina) — wide open!', 'log-me');
        updatePanels();
        await sleep(380);
      }
      if (fRes) { await playFoeAction(foeAction, fRes); updatePanels(); }
      else if (foeAction.type === 'rest' && !foe.skipRound) {
        Scene.eAnim.rest();
        Sfx.rest();
        logLine('🌬️ ' + foe.name + ' is spent — he rests, recovering his strength.', 'log-foe');
        await sleep(420);
      }
      else if (foeAction.type === 'defend') {
        Scene.eAnim.defend();
        Sfx.block();
        logLine(foe.name + ' braces behind his ' + state.foeShieldName + '.', 'log-foe');
        await sleep(420);
      }
      else if (foeAction.type === 'dodge') {
        Scene.eAnim.dodge();
        Sfx.dodge();
        logLine(foe.name + ' backs out of reach, daring you to chase.', 'log-foe');
        await sleep(420);
      }
      if (playerAction.type === 'defend' && !me.skipRound) {
        logLine('You raise your guard' + (me.shield ? ' — the ' + state.myShieldName + ' up front' : ', bracing for the blow') + '.', 'log-me');
        await sleep(300);
      }
      if (playerAction.type === 'dodge' && !me.skipRound && !fRes) {
        logLine('You back away, ready to slip aside.', 'log-me');
        await sleep(300);
      }

      noteCombos(pRes);
      noteCombos(fRes);

      // end-of-round dots
      var dots = combat.tickDots();
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (d.who === 'foe') {
          Scene.fxHitFoe('light');
          Scene.floatWorld('-' + d.dmg + ' ' + d.kind, new THREE.Vector3(0, 1.2, Scene.enemyPos()), d.kind === 'burn' ? '#ff9040' : '#8fd060');
        } else {
          Scene.fxHitPlayer();
          Scene.floatMe('-' + d.dmg + ' ' + d.kind, d.kind === 'burn' ? '#ff9040' : '#8fd060');
        }
        logLine((d.kind === 'burn' ? '🔥 Fire burns the ' : '☠️ Poison seeps into the ') + (d.who === 'foe' ? 'foe' : 'gladiator') + ' for ' + d.dmg + '.', d.who === 'foe' ? 'log-me' : 'log-foe');
        await sleep(450);
      }
      updatePanels();

      // second wind
      if (save.train.secondwind && !state.secondWindUsed && me.hp > 0 && me.hp < me.maxHp * 0.25) {
        state.secondWindUsed = true;
        me.hp = Math.min(me.maxHp, me.hp + 25);
        Sfx.heal();
        Scene.fxHeal();
        Scene.floatMe('+25 SECOND WIND', '#7dffa8');
        logLine('❤️ Second Wind! You surge back with 25 HP.', 'log-me');
        updatePanels();
        await sleep(600);
      }

      // the healer's phial: a hidden hand, once per battle
      if (save.relics.indexOf('flask') !== -1 && !state.flaskUsed && me.hp > 0 && me.hp < me.maxHp * 0.3) {
        state.flaskUsed = true;
        me.hp = Math.min(me.maxHp, me.hp + 30);
        Sfx.heal();
        Scene.fxHeal();
        Scene.floatMe('+30 PHIAL', '#7dffa8');
        logLine('🧪 A hidden hand tosses you a phial — 30 HP restored. (The phial is spent.)', 'log-me');
        updatePanels();
        await sleep(600);
      }

      // champion rage
      if (foe.champion && !state.rageShown && foe.hp > 0 && foe.hp < foe.maxHp * 0.3) {
        state.rageShown = true;
        foe.rage = true;
        Scene.fxRage();
        logLine('😡 ' + foe.name + ' RAGES — his blows are fiercer!', 'log-foe');
        updatePanels();
        await sleep(700);
      }

      // visuals bookkeeping
      if (foe.shield) Scene.updateEnemyShieldVisual(foe.shieldDur, SHIELDS[foe.shield].dur);
      if (foe.state.frozen > 0) Scene.fxIceShell();
      else Scene.removeIceShell();

      // Heart of the Sand: a battle that ever touched the brink
      if (me.hp > 0 && me.hp < me.maxHp * 0.25) state.lowHpEver = true;

      // victory / defeat
      if (foe.hp <= 0 && me.hp <= 0) return endBattle('mutual');
      if (foe.hp <= 0) return endBattle('win');
      if (me.hp <= 0) return endBattle('lose');

      state.busy = false;
      $('action-bar').classList.add('on');
      await sleep(250);
    }
  }

  // ---------- battle: player input ----------

  function askPlayer() {
    state.busy = false;
    $('action-bar').classList.add('on');
    return new Promise(function (resolve) { actionResolver = resolve; });
  }

  function choosePlayerAction(action) {
    if (!actionResolver) return;
    var r = actionResolver;
    actionResolver = null;
    closeScrollMenu();
    r(action);
  }

  var scrollMode = 'cast'; // 'cast' (the action itself) or 'chant' (a free bonus cast)

  function canChant() {
    return save.train.chanting && !state.chantUsed && !!combat.me && combat.canAct(combat.me, 'cast');
  }

  function pickScroll(element) {
    if ((save.scrolls[element] || 0) <= 0) { Sfx.deny(); return; }
    save.scrolls[element]--;
    persist();
    choosePlayerAction(scrollMode === 'chant' ? { type: 'chant', element: element } : { type: 'cast', element: element });
  }

  function renderScrollMenu(mode) {
    scrollMode = mode || 'cast';
    var menu = $('scroll-menu');
    var grid = $('scroll-grid');
    $('scroll-menu-hint').textContent = scrollMode === 'chant' ? '🗣️ CHANT — a free slot: after this you still take your action.' : '';
    grid.innerHTML = '';
    var any = false;
    SCROLL_ORDER.forEach(function (k) {
      var s = SCROLLS[k];
      var n = save.scrolls[k] || 0;
      var b = el('button', 'scroll-btn' + (n ? '' : ' empty'),
        s.icon + '<span class="sc-count">' + n + '</span><span class="sc-name">' + s.name.replace('Scroll of ', '') + '</span>');
      b.title = s.desc;
      if (n) {
        any = true;
        b.addEventListener('click', function (e) { e.stopPropagation(); pickScroll(k); });
      }
      grid.appendChild(b);
    });
    if (!any) grid.appendChild(el('div', 'scroll-none', 'No scrolls in your satchel — buy some in the Armory.'));
    menu.classList.add('on');
  }

  function closeScrollMenu() { $('scroll-menu').classList.remove('on'); }

  // ---------- battle: animation of results ----------

  function weaponAnimKind(w) {
    if (w === 'spear' || w === 'venomsp') return 'stab';
    if (w === 'sword' || w === 'flamesword') return 'slash';
    return 'swing';
  }

  function foeAt(y) {
    return new THREE.Vector3(0, y, Scene.enemyPos());
  }

  async function playPlayerAction(action, res) {
    var me = combat.me, foe = combat.foe;
    if (action.type === 'cast') return playPlayerSpell(action.element, res);

    var kind = weaponAnimKind(me.weapon);
    Scene.handAttack(kind);
    await Scene.fxSwingStreak(kind); // resolves + swoosh at contact

    if (res.dodged) {
      Scene.eAnim.dodge();
      Sfx.dodge();
      Scene.floatWorld('DODGED', foeAt(1.9), '#9fe8ff');
      logLine(foe.name + ' slips out of the way!', 'log-foe');
      for (var c = 0; c < res.counters.length; c++) await playCounter(res.counters[c]);
      await sleep(380);
      return;
    }

    if (res.blocked) {
      Sfx.block();
      logLine('🛡️ ' + foe.name + ' blocks with his ' + state.foeShieldName + '!', 'log-foe');
      if (res.shieldBroken) {
        Scene.fxShieldBreak();
        Scene.removeEnemyShieldMesh();
        logLine('💥 His ' + state.foeShieldName + ' SHATTERS!', 'log-foe');
      } else {
        Scene.fxImpact('light');
      }
      for (var c2 = 0; c2 < res.counters.length; c2++) await playCounter(res.counters[c2]);
      await sleep(420);
      return;
    }

    // clean hit
    var isShatter = res.combos.indexOf('iceShatter') !== -1;
    var heavy = WEAPONS[me.weapon].tier >= 4;
    if (isShatter) {
      await Scene.fxShatter();
      logLine('🧊 <b>ICE SHATTER!</b> The frozen foe bursts apart — ' + res.dmg + ' damage!', 'log-me');
    } else {
      Scene.fxImpact(heavy ? 'heavy' : 'light');
      Sfx[heavy ? 'hitHeavy' : 'hit']();
      logLine((res.parry ? '🛡️ He braces — ' : 'You strike ') + foe.name + (res.parry ? ' — half damage, ' : ' for ') + '<b>' + res.dmg + '</b> damage.', 'log-me');
    }
    Scene.eAnim.hurt(heavy || isShatter);
    Scene.floatWorld('-' + res.dmg, foeAt(1.7), isShatter ? '#cfeeff' : heavy ? '#ffc060' : '#ffffff');

    for (var p = 0; p < res.procs.length; p++) await playProc('foe', res.procs[p]);
    for (var c3 = 0; c3 < res.counters.length; c3++) await playCounter(res.counters[c3]);
    await sleep(350);
  }

  async function playPlayerSpell(element, res) {
    var foe = combat.foe;
    Scene.handAttack('cast');
    Sfx.cast();
    await sleep(260);

    if (element === 'life') {
      Sfx.heal();
      Scene.fxHeal();
      Scene.floatMe('+' + res.heal + ' HP', '#7dffa8');
      logLine('✨ The Scroll of Life mends you for ' + res.heal + ' HP.', 'log-me');
      await sleep(500);
      return;
    }
    if (element === 'shadow') {
      Sfx.shadow();
      Scene.fxShadowPuff();
      logLine('🌑 Shadow wraps ' + foe.name + ' — his next attack will miss.', 'log-me');
      await playProc('foe', 'shadow');
      await sleep(420);
      return;
    }

    if (element === 'water') await Scene.fxWater();      // plays its own impact sound
    else if (element === 'earth') await Scene.fxEarth();
    else if (element === 'wind') await Scene.fxWind();
    else if (element === 'ice') await Scene.fxIce();
    else {
      await Scene.fxSpellProjectile(element, true);
      Sfx[element]();
    }

    if (res.dodged) {
      Sfx.dodge();
      Scene.floatWorld('DODGED', foeAt(1.9), '#9fe8ff');
      logLine(foe.name + ' rolls away from the ' + SCROLLS[element].name.toLowerCase() + '!', 'log-foe');
      await sleep(420);
      return;
    }
    if (res.blocked) {
      Sfx.block();
      Scene.floatWorld('BLOCKED', foeAt(1.9), '#d8e2f0');
      logLine('🛡️ His ' + state.foeShieldName + ' drinks the ' + SCROLLS[element].name.toLowerCase() + '.', 'log-foe');
      for (var c = 0; c < res.counters.length; c++) await playCounter(res.counters[c]);
      await sleep(420);
      return;
    }
    if (res.dmg > 0) {
      Scene.floatWorld('-' + res.dmg, foeAt(1.7), '#' + SCROLLS[element].color.toString(16).padStart(6, '0'));
      Scene.eAnim.hurt(element === 'lightning' || element === 'water');
      logLine(SCROLLS[element].icon + ' Your ' + SCROLLS[element].name + ' hits for <b>' + res.dmg + '</b>.', 'log-me');
    }
    for (var p = 0; p < res.procs.length; p++) await playProc('foe', res.procs[p]);
    for (var c2 = 0; c2 < res.counters.length; c2++) await playCounter(res.counters[c2]);
    await sleep(380);
  }

  async function playFoeAction(action, res) {
    var me = combat.me, foe = combat.foe;
    if (action.type === 'cast') return playFoeSpell(action.spell, res);

    Scene.ghostAt(foeAt(1.3), WEAPONS[foe.weapon].icon);
    Scene.eAnim.attack();
    await sleep(330);

    if (res.miss) {
      Sfx.shadow();
      Scene.floatWorld('MISSED', new THREE.Vector3(0, 1.6, 0.6), '#8a8fa8');
      logLine('🌑 ' + foe.name + ' swings — into empty shadow!', 'log-me');
      await sleep(420);
      return;
    }
    if (res.dodged) {
      Sfx.dodge();
      Scene.dodgeLean(rnd() < 0.5 ? 1 : -1);
      Scene.floatMe('DODGED!', '#9fe8ff');
      logLine('You sidestep ' + foe.name + "'s " + WEAPONS[foe.weapon].name.toLowerCase() + '!', 'log-me');
      for (var c = 0; c < res.counters.length; c++) await playCounter(res.counters[c]);
      await sleep(420);
      return;
    }
    if (res.blocked) {
      Sfx.block();
      Scene.fxBlock();
      logLine('🛡️ You block! The blow rings off your ' + state.myShieldName + '.', 'log-me');
      if (res.shieldBroken) {
        Sfx.breakShield();
        save.shieldDur[state.myShield] = 0;
        save.equipped.shield = null;
        persist();
        Scene.buildPlayerView();
        logLine('💥 Your ' + state.myShieldName + ' SHATTERS!', 'log-foe');
      }
      for (var c2 = 0; c2 < res.counters.length; c2++) await playCounter(res.counters[c2]);
      await sleep(420);
      return;
    }

    var heavy = WEAPONS[foe.weapon].tier >= 4;
    Sfx[heavy ? 'hitHeavy' : 'hit']();
    Scene.fxHitPlayer();
    Scene.floatMe('-' + res.dmg, '#ff8060');
    logLine((res.parry ? '🛡️ You brace — ' : '') + foe.name + (res.parry ? ' hits harder than expected, ' : ' hits you for ') + '<b>' + res.dmg + '</b> damage.', 'log-foe');
    for (var p = 0; p < res.procs.length; p++) await playProc('me', res.procs[p]);
    await sleep(400);
  }

  async function playFoeSpell(spell, res) {
    var foe = combat.foe;
    Scene.eAnim.cast();
    Sfx.cast();
    await sleep(380);

    if (spell === 'ward') {
      Scene.floatWorld('WARD', foeAt(2.1), '#b8a8ff');
      logLine('🔮 ' + foe.name + ' weaves a ward — he will be harder to hit.', 'log-foe');
      await sleep(420);
      return;
    }
    if (spell === 'life') {
      Sfx.heal();
      Scene.fxHealAt(foeAt(1.2));
      Scene.floatWorld('+' + res.heal, foeAt(1.8), '#7dffa8');
      logLine('✨ ' + foe.name + ' heals for ' + res.heal + '.', 'log-foe');
      await sleep(480);
      return;
    }

    if (spell === 'earth') {
      await Scene.fxEarth(); // plays its own impact sound
    } else {
      await Scene.fxSpellProjectile('fire', false);
      Sfx.fire();
    }

    if (res.dodged) {
      Sfx.dodge();
      Scene.floatMe('DODGED!', '#9fe8ff');
      logLine('You duck under his ' + (spell === 'fire' ? 'fireball' : 'tremor') + '!', 'log-me');
      await sleep(400);
      return;
    }
    if (res.blocked) {
      Sfx.block();
      Scene.fxBlock();
      logLine('🛡️ The spell crashes against your ' + state.myShieldName + '.', 'log-me');
      for (var c = 0; c < res.counters.length; c++) await playCounter(res.counters[c]);
      await sleep(420);
      return;
    }
    if (res.dmg > 0) {
      Sfx.hit();
      Scene.fxHitPlayer();
      Scene.floatMe('-' + res.dmg, '#ff8060');
      logLine((spell === 'fire' ? '🔥' : '⛰️') + ' His ' + (spell === 'fire' ? 'fireball' : 'earthquake') + ' hits you for <b>' + res.dmg + '</b>.', 'log-foe');
    }
    for (var p = 0; p < res.procs.length; p++) await playProc('me', res.procs[p]);
    await sleep(400);
  }

  async function playProc(who, kind) {
    var foe = combat.foe;
    switch (kind) {
      case 'burn':
        Scene.ghostAt(who === 'foe' ? foeAt(1.9) : new THREE.Vector3(0, 1.4, 0.5), '🔥');
        if (who === 'foe') { Sfx.fire(); Scene.floatWorld('BURNING', foeAt(1.9), '#ff9040'); logLine('🔥 ' + foe.name + ' catches fire!', 'log-me'); }
        else { Scene.floatMe('BURNING', '#ff9040'); logLine('🔥 You are on fire!', 'log-foe'); }
        break;
      case 'poison':
        Scene.ghostAt(who === 'foe' ? foeAt(1.9) : new THREE.Vector3(0, 1.4, 0.5), '☠️');
        if (who === 'foe') { Scene.floatWorld('POISONED', foeAt(1.9), '#8fd060'); logLine('☠️ Venom seeps into ' + foe.name + '!', 'log-me'); }
        else { Scene.floatMe('POISONED', '#8fd060'); logLine('☠️ You are poisoned!', 'log-foe'); }
        break;
      case 'stun':
        Sfx.stun();
        Scene.fxStun(who);
        if (who === 'foe') { Scene.floatWorld('STUNNED', foeAt(1.9), '#ffe95e'); logLine('⭐ ' + foe.name + ' is stunned — he cannot act next round!', 'log-me'); }
        else { Scene.floatMe('STUNNED', '#ffe95e'); logLine('⭐ You are stunned — you will skip your next round!', 'log-foe'); }
        break;
      case 'soaked':
        Scene.floatWorld('SOAKED', foeAt(1.9), '#7fc4ff');
        logLine('💦 ' + foe.name + ' is drenched to the bone…', 'log-me');
        break;
      case 'frozen':
        Scene.fxIceShell();
        Scene.floatWorld('FROZEN', foeAt(1.9), '#9fe8ff');
        logLine('❄️ ' + foe.name + ' is frozen solid — brittle and unable to dodge!', 'log-me');
        break;
      case 'wind':
        Scene.floatWorld('GALE-WEAKENED', foeAt(1.9), '#cfe8ef');
        logLine('💨 The gale steals ' + foe.name + "'s strength — his next attack is 25% weaker.", 'log-me');
        break;
      case 'shadow':
        Scene.floatWorld('SHADOWED', foeAt(1.9), '#8a8fa8');
        logLine('🌑 ' + foe.name + ' is wrapped in shadow — his next attack will miss.', 'log-me');
        break;
      case 'rooted':
        Scene.floatWorld('ROOTED', foeAt(1.9), '#b07a42');
        logLine('⛓️ The ground grips ' + foe.name + ' — he cannot dodge!', 'log-me');
        break;
      case 'aegis':
        if (who === 'me') { Scene.floatMe('STEADIED +25% DODGE', '#7dffb8'); logLine('🐢 Your Tortoise Aegis steadies you — +25% dodge for 2 rounds.', 'log-me'); }
        break;
      case 'cauterize':
        if (who === 'foe') { Scene.floatWorld('CAUTERIZED', foeAt(1.9), '#ff6a3a'); logLine('🩸 <b>CAUTERIZE!</b> The fire seals ' + foe.name + ' — a stunned foe burns for 3 rounds.', 'log-me'); }
        break;
      case 'feather':
        if (who === 'me') { Scene.floatMe('FEATHERFALL', '#cfe8ef'); logLine('🪶 <b>FEATHERFALL!</b> The magic whistles past — you are light as air. Your next attack deals +25% damage.', 'log-me'); }
        break;
      case 'ward':
      case 'heal':
        break;
    }
    await sleep(320);
  }

  async function playCounter(c) {
    var foe = combat.foe;
    if (c.reason === 'jab') {
      Scene.handAttack('stab');
      Sfx.hit();
      Scene.floatWorld('-' + c.dmg + ' COUNTER', foeAt(1.6), '#9fe8ff');
      Scene.eAnim.hurt(false);
      logLine('💨 <b>COUNTER JAB!</b> You slip past the weakened foe and land ' + c.dmg + ' damage!', 'log-me');
      await sleep(450);
    } else if (c.reason === 'ram') {
      Sfx.hitHeavy();
      Scene.floatWorld('-' + c.dmg + ' RECOIL', foeAt(1.6), '#ffd27a');
      Scene.eAnim.hurt(true);
      Scene.fxImpact('heavy');
      logLine('🏰 <b>BATTERING RAM!</b> Your tower shield crashes into ' + foe.name + ' for ' + c.dmg + '!', 'log-me');
      await sleep(450);
    } else if (c.reason === 'warded') {
      Sfx.lightning();
      Scene.floatWorld('-' + c.dmg + ' REFLECTED', foeAt(1.6), '#b8a8ff');
      Scene.eAnim.hurt(true);
      logLine('🔮 <b>WARDED BLOCK!</b> Your runes hurl ' + c.dmg + ' magic right back at the caster!', 'log-me');
      await sleep(450);
    } else if (c.reason === 'mirror') {
      Sfx.lightning();
      Scene.floatWorld('-' + c.dmg + ' MIRRORED', foeAt(1.6), '#ffffff');
      Scene.eAnim.hurt(true);
      logLine('🪞 <b>MIRROR WARD!</b> Shield and runes align — the full ' + c.dmg + ' magic bounces straight back!', 'log-me');
      await sleep(450);
    }
  }

  // ---------- battle: end ----------

  // A lost battle rewinds the sand: the scrolls you spent and the shield you
  // chipped come back, whole. Only a victory consumes. Losing costs nothing
  // but the round — grinding a level is free, which is what keeps a
  // stubborn rookie honest instead of broke.
  function rewindConsumables() {
    var scrollsBack = 0;
    Object.keys(state.scrollSnapshot || {}).forEach(function (k) {
      if (state.scrollSnapshot[k] > (save.scrolls[k] || 0)) {
        scrollsBack += state.scrollSnapshot[k] - save.scrolls[k];
        save.scrolls[k] = state.scrollSnapshot[k];
      }
    });
    var shieldBack = false;
    if (state.myShield && state.shieldSnapshot > 0) {
      if ((save.shieldDur[state.myShield] || 0) < state.shieldSnapshot) {
        save.shieldDur[state.myShield] = state.shieldSnapshot;
        shieldBack = true;
      }
      // a shattered shield is auto-unequipped before the next fight — the rewind repairs it
      if (!save.equipped.shield) {
        save.equipped.shield = state.myShield;
        shieldBack = true;
      }
    }
    return scrollsBack + (shieldBack ? 1 : 0);
  }

  function endBattle(kind) {
    state.inBattle = false;
    state.busy = false;
    actionResolver = null;
    Ambience.setBattle(false);

    var foe = combat.foe, me = combat.me;
    var rewound = 0;
    state.lastRewound = false;
    var reward = 0;
    var breakdown = [];
    if (kind === 'win' || kind === 'mutual') {
      var level = battleLevel(); // the level just fought (before the win is recorded)
      save.wins++;
      save.streak++;
      save.bestStreak = Math.max(save.bestStreak, save.streak);
      var base = 24 + level * 9;
      var streakBonus = 2 * Math.max(0, save.streak - 1);
      var eventBonus = state.event === 'crowdgold' ? Math.round((base + streakBonus) * 0.25) : 0;
      var titleMult = coinsMult();
      var hearts = state.lowHpEver;
      reward = Math.round((base + streakBonus + eventBonus) * titleMult);
      if (hearts) { reward = Math.round(reward * 1.5); discoverCombo('heartsand'); }
      var wasLastStand = state.lastStand;
      if (wasLastStand) { reward = Math.floor(reward / 2); }
      save.coins += reward;
      breakdown.push(wasLastStand ? '⚔️ last stand ' + base + ' (half gold)' : '⚔️ victory ' + base);
      if (streakBonus) breakdown.push('🔥 streak +' + streakBonus);
      if (eventBonus) breakdown.push('🎲 crowd favorite +' + eventBonus);
      if (titleMult > 1) breakdown.push('🏅 title ×' + titleMult.toFixed(2));
      if (hearts) breakdown.push('❤️ heart of the sand ×1.5');

      if (state.myShield && me.shield) save.shieldDur[state.myShield] = me.shieldDur;

      var t = TITLES.filter(function (x) { return x.wins === save.wins; })[0];
      if (t) {
        setTimeout(function () { Sfx.title(); toast('🏅', 'TITLE EARNED — ' + t.name, t.bonus); }, 1400);
      }
    } else if (kind === 'lose') {
      save.losses++;
      save.streak = 0;
      rewound = rewindConsumables();
    } else {
      save.draws++;
      rewound = rewindConsumables();
    }
    state.lastRewound = rewound > 0;
    var battleWasLastStand = state.lastStand;
    state.lastStand = false;
    persist();
    updateHud();

    if (kind === 'win' || kind === 'mutual') {
      Sfx.victory();
      Scene.crowdRoar(true);
      Scene.triggerSlowmo(0.3, 1100);
      Scene.eAnim.die();
      Scene.fxConfetti();
      logLine(kind === 'mutual' ? '⚖️ You both fall — but Rome crowns YOU, the last man standing!' : '🏆 ' + foe.name + ' collapses in the sand. You win!', 'log-event');
    } else if (kind === 'lose') {
      Sfx.defeat();
      Scene.triggerSlowmo(0.4, 900);
      Scene.playerDie(); // the camera falls with you, ends on the sky, fades to black
      logLine('💀 You fall…', 'log-event');
      if (rewound) logLine('⏪ The sand rewinds — your shield stands whole again, your scrolls are back in the satchel.', 'log-event');
    } else {
      Sfx.draw();
      logLine('🤝 The flag of peace waves. No blood, no gold.', 'log-event');
      if (rewound) logLine('⏪ The sand rewinds — your shield stands whole again, your scrolls are back in the satchel.', 'log-event');
    }

    // defeat waits out the death cam (fall + fade to black) before the screen
    var resultDelay = kind === 'draw' ? 1600 : 2600;
    setTimeout(function () { showResult(kind, reward, breakdown, battleWasLastStand); }, resultDelay);
  }

  function showResult(kind, reward, breakdown, wasLastStand) {
    var title, sub, flavor, cls;
    if (kind === 'win') { title = 'VICTORY'; cls = 'win'; flavor = pick(WIN_FLAVOR); sub = 'You defeat ' + combat.foe.name; }
    else if (kind === 'mutual') { title = 'MUTUAL SLAUGHTER — YOU LIVE'; cls = 'win'; flavor = 'You both hit the sand. The referee sees you up first. The crowd gives you the gold and the glory.'; sub = 'Together you fell — together you rose first'; }
    else if (kind === 'lose') { title = 'DEFEAT'; cls = 'lose'; flavor = pick(LOSE_FLAVOR); sub = combat.foe.name + ' stands over you'; }
    else { title = 'DRAW'; cls = 'draw'; flavor = pick(DRAW_FLAVOR); sub = 'No winner, no gold'; }

    $('result-title').textContent = title;
    $('result-title').className = 'result-title ' + cls;
    $('result-sub').textContent = sub;
    $('result-flavor').textContent = flavor;

    var extra = $('result-extra');
    extra.innerHTML = '';
    if (kind === 'win' || kind === 'mutual') {
      var r = el('div', 'reward');
      r.appendChild(el('div', 'reward-total', '🪙 +' + fmt(reward)));
      r.appendChild(el('div', 'reward-breakdown', breakdown.join(' · ')));
      extra.appendChild(r);
    }
    if ((kind === 'lose' || kind === 'draw') && state.lastRewound) {
      extra.appendChild(el('div', 'rewind-note', '⏪ The sand rewinds — your shield is whole and your scrolls returned. Nothing was lost. Try again.'));
    }
    if (state.battleCombos.length) {
      var c = el('div', 'result-combos');
      c.appendChild(el('div', 'rc-head', '🔮 Arcana discovered this battle:'));
      state.battleCombos.forEach(function (id) {
        c.appendChild(el('div', 'rc-line', COMBOS[id].icon + ' <b>' + COMBOS[id].name + '</b> — ' + COMBOS[id].msg));
      });
      extra.appendChild(c);
    }
    var next = nextTitle();
    if (next && (kind === 'win' || kind === 'mutual')) {
      extra.appendChild(el('div', 'result-next', '🏅 Next title at ' + next.wins + ' wins: <b>' + next.name + '</b> (' + next.bonus + ')'));
    }
    $('btn-laststand').hidden = !(kind === 'lose' && !wasLastStand);
    showScreen('result');
  }

  // ---------- input wiring ----------

  function wireInput() {
    window.addEventListener('keydown', function (e) {
      Sfx.unlock();
      var k = e.key.toLowerCase();
      if (state.screen === 'battle' && state.inBattle && !state.busy) {
        var me = combat.me;
        if (k === 'a' || k === '1') { if (combat.canAct(me, 'attack')) { Sfx.click(); choosePlayerAction({ type: 'attack' }); } else Sfx.deny(); }
        else if (k === 'd' || k === '2') { if (combat.canAct(me, 'dodge')) { Sfx.click(); Scene.dodgeLean(rnd() < 0.5 ? 1 : -1); choosePlayerAction({ type: 'dodge' }); } else Sfx.deny(); }
        else if (k === 's' || k === '3') { if (combat.canAct(me, 'defend')) { Sfx.click(); choosePlayerAction({ type: 'defend' }); } else Sfx.deny(); }
        else if (k === 'c' || k === '4') { if (combat.canAct(me, 'cast')) { Sfx.click(); renderScrollMenu('cast'); } else Sfx.deny(); }
        else if (k === 'q') { if (canChant()) { Sfx.click(); renderScrollMenu('chant'); } else Sfx.deny(); }
        else if (k === 'r' || k === '5') { Sfx.click(); choosePlayerAction({ type: 'rest' }); }
        else if (k === 'escape') closeScrollMenu();
      } else if (state.screen === 'hub') {
        if (k === 'enter' || k === 'f') startBattle();
        else if (k === 's') openShop();
      } else if (state.screen === 'shop') {
        if (k === 'escape' || k === 's') closeShop();
      } else if (state.screen === 'result') {
        if (k === 'enter') backToHub();
        else if (k === 'l' && !$('btn-laststand').hidden) { Sfx.click(); state.lastStand = true; startBattle(); }
      }
    });

    $('action-bar').addEventListener('click', function (e) {
      var t = e.target.closest('button[data-act]');
      if (!t) return;
      var act = t.getAttribute('data-act');
      if (act === 'chant') { if (canChant()) { Sfx.click(); renderScrollMenu('chant'); } else Sfx.deny(); return; }
      if (act !== 'rest' && !combat.canAct(combat.me, act)) { Sfx.deny(); return; }
      if (act === 'attack') { Sfx.click(); choosePlayerAction({ type: 'attack' }); }
      else if (act === 'dodge') { Sfx.click(); Scene.dodgeLean(rnd() < 0.5 ? 1 : -1); choosePlayerAction({ type: 'dodge' }); }
      else if (act === 'defend') { Sfx.click(); choosePlayerAction({ type: 'defend' }); }
      else if (act === 'cast') { Sfx.click(); renderScrollMenu('cast'); }
      else if (act === 'rest') { Sfx.click(); choosePlayerAction({ type: 'rest' }); }
    });

    $('btn-fight').addEventListener('click', startBattle);
    $('btn-shop').addEventListener('click', openShop);
    $('btn-shop-close').addEventListener('click', closeShop);
    $('btn-continue').addEventListener('click', backToHub);
    $('btn-laststand').addEventListener('click', function () {
      Sfx.click();
      state.lastStand = true;
      startBattle();
    });
    $('btn-reset').addEventListener('click', function () {
      if (confirm('Wipe your legend? All coins, gear, wins and arcana will be lost.') &&
          confirm('Really? The sand forgets no one, but it can forget you.')) {
        try { localStorage.removeItem(SAVE_KEY); } catch (err) { /* noop */ }
        location.reload();
      }
    });
    $('btn-mute').addEventListener('click', function () {
      save.muted = !save.muted;
      persist();
      $('btn-mute').textContent = save.muted ? '🔇' : '🔊';
      Sfx.click();
    });
    $('crowd-slider').addEventListener('input', function () {
      save.crowdVol = clamp((Number(this.value) || 0) / 100, 0, 1);
      persist();
      Ambience.setCrowdVolume(save.crowdVol);
    });
    $('btn-start').addEventListener('click', function () {
      save.seenIntro = true;
      persist();
      $('intro').classList.remove('on');
      Sfx.horn();
      renderHub();
      showScreen('hub');
    });

    window.addEventListener('pointerdown', function () {
      Sfx.unlock();
      if (!state.audioOn) {
        state.audioOn = true;
        Ambience.start();
      }
    });
  }

  function openShop() {
    Sfx.click();
    shopTab = 'weapons';
    renderShop();
    showScreen('shop');
  }

  function closeShop() {
    Sfx.click();
    renderHub();
    showScreen('hub');
  }

  function backToHub() {
    Sfx.click();
    renderHub();
    showScreen('hub');
    Scene.buildPlayerView();
  }

  // ---------- boot ----------

  // If three.js never loaded (no internet / blocked CDN), scene.js couldn't
  // build and Scene is gone. Rather than a dead canvas + console error, show a
  // friendly overlay with a reload button and stop booting.
  function showCdnError() {
    var e = $('cdn-error');
    if (e) e.classList.add('on');
    var r = $('btn-reload');
    if (r) r.addEventListener('click', function () { location.reload(); });
  }

  function boot() {
    if (typeof THREE === 'undefined' || typeof Scene === 'undefined' || typeof Scene.initScene !== 'function') {
      showCdnError();
      return;
    }
    // ?seed= → reproducible battles: re-seed the RNG now, and again at the start
    // of every battle so a given seed replays identically.
    var seed = getSeedParam();
    if (seed !== null) {
      state.seed = seed;
      seedRng(seed);
      var badge = $('seed-badge');
      badge.textContent = '🎲 ' + seed;
      badge.title = 'seeded RNG — every battle replays identically (seed: ' + seed + ')';
      badge.hidden = false;
    }
    Scene.initScene();
    Scene.buildPlayerView();
    $('btn-mute').textContent = save.muted ? '🔇' : '🔊';
    $('crowd-slider').value = Math.round(clamp(save.crowdVol, 0, 1) * 100);
    Ambience.setCrowdVolume(save.crowdVol);
    renderHub();
    wireInput();
    if (!save.seenIntro) $('intro').classList.add('on');
    else showScreen('hub');
  }

  window.addEventListener('DOMContentLoaded', boot);

  return { startBattle: startBattle, openShop: openShop, backToHub: backToHub };
})();
