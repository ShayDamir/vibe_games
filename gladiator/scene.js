/* ============================================================
   THE LAST GLADIATOR — scene.js
   three.js r128 (global THREE from CDN). Owns the whole visual
   world: the dusk Colosseum, the instanced crowd, torches, the
   enemy rig, the first-person player hands, all VFX, floating
   text, camera work and the main animation loop.

   Public API (used by game.js / combat.js):
     initScene()                  build renderer/scene, start loop
     sceneStart()                 fly-in camera + foe walk-in → Promise
     rebuildEnemyVisual()         rebuild foe rig from combat.foe
     buildPlayerView()            build hands/weapon/shield from save
     enemyPos()                   current foe z (for aiming)
      eAnim = {attack, hurt, defend, dodge, die, cast, stun, rest}
     handAttack(kind)             'slash' | 'stab' | 'swing' | 'cast'
     setEnemyAura(kind)           'none' | 'rage' | 'frozen' shell mgmt
     fx* (see below) — timed fx return a Promise resolving at the
                          "contact" moment; the rest are fire-and-forget
   ============================================================ */

var Scene = (function () {
  'use strict';

  var renderer = null, scene = null, camera = null, clock = null;
  var running = false;

  // ---------- camera state ----------
  var camBase = new THREE.Vector3(0, 1.72, 0.35);
  var camLook = new THREE.Vector3(0, 1.38, FOE_POS);
  var shake = 0;
  var camYaw = 0, camRoll = 0;                 // dodge lean (decay)
  var fly = null;                              // {from, to, t, dur, done}
  var deathCam = null;                         // {t, fallDur, fadeDur, black, amb0, key0, fill0, resolve}

  // ---------- time ----------
  var timeScale = 1, timeScaleTarget = 1, slowmoUntil = 0;

  // ---------- crowd ----------
  var crowdMesh = null, crowdData = [], cheer = 0;

  // ---------- torches ----------
  var torches = [];

  // ---------- arena mood (dusk / night / bloodmoon) ----------
  var env = null, moon = null;

  // ---------- fx pools ----------
  var fxList = [];   // {update(dt,t):bool-alive}
  var floats = [];   // floating texts

  // ---------- player view ----------
  var viewGroup = null, handR = null, weaponMesh = null, shieldMesh = null;
  var handAnim = null; // {kind, t, dur}
  var castGlow = null;

  // ---------- enemy ----------
  var enemy = {
    group: null, body: null, parts: {}, aura: null, telegraph: null, telegraphT: 0,
    anim: 'idle', animT: 0,
    recoil: 0, sidestep: 0,
    alive: true,
  };
  var enemyShieldMesh = null;
  var stunStars = null;

  // ==================================================================
  //  canvas texture helpers
  // ==================================================================
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  function sandTexture() {
    return canvasTex(512, 512, function (g, w, h) {
      g.fillStyle = '#c8a86e';
      g.fillRect(0, 0, w, h);
      for (var i = 0; i < 9000; i++) {
        var v = rnd() * 46 - 23;
        g.fillStyle = 'rgba(' + (160 + v) + ',' + (132 + v) + ',' + (80 + v) + ',0.5)';
        g.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
      // faint footstep scuffs
      g.strokeStyle = 'rgba(120,95,55,0.15)';
      for (var j = 0; j < 40; j++) {
        g.beginPath();
        var x = rnd() * w, y = rnd() * h;
        g.arc(x, y, 8 + rnd() * 26, 0, Math.PI * 2);
        g.stroke();
      }
    });
  }

  function stoneTexture() {
    return canvasTex(256, 256, function (g, w, h) {
      g.fillStyle = '#8d7f6a';
      g.fillRect(0, 0, w, h);
      var rows = 8, cols = 4;
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var off = (r % 2) * (w / cols / 2);
          var v = rnd() * 26 - 13;
          g.fillStyle = 'rgb(' + (135 + v) + ',' + (122 + v) + ',' + (100 + v) + ')';
          g.fillRect(c * (w / cols) + off + 2, r * (h / rows) + 2, w / cols - 4, h / rows - 4);
        }
      }
      for (var i = 0; i < 700; i++) {
        g.fillStyle = 'rgba(60,50,38,' + (rnd() * 0.25) + ')';
        g.fillRect(rnd() * w, rnd() * h, 2, 2);
      }
    });
  }

  function glowTex(colorInner, colorOuter) {
    return canvasTex(128, 128, function (g, w, h) {
      var grd = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      grd.addColorStop(0, colorInner);
      grd.addColorStop(1, colorOuter);
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    });
  }

  function textSprite(text, color, size, stroke) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    var g = c.getContext('2d');
    g.font = 'bold ' + (size || 44) + 'px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (stroke !== false) {
      g.lineWidth = 7;
      g.strokeStyle = 'rgba(20,10,5,0.85)';
      g.strokeText(text, 128, 48);
    }
    g.fillStyle = color || '#ffffff';
    g.fillText(text, 128, 48);
    var t = new THREE.CanvasTexture(c);
    var m = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false });
    var s = new THREE.Sprite(m);
    s.scale.set(1.6, 0.6, 1);
    return s;
  }

  function emojiSprite(emoji, size) {
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var g = c.getContext('2d');
    g.font = '96px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, 64, 70);
    var t = new THREE.CanvasTexture(c);
    var m = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false });
    var s = new THREE.Sprite(m);
    s.scale.set(size || 0.8, size || 0.8, 1);
    return s;
  }

  // ==================================================================
  //  environment
  // ==================================================================
  function buildEnvironment() {
    scene.fog = new THREE.FogExp2(0x2a1f33, 0.028);

    // sky dome (dusk gradient)
    var sky = new THREE.Mesh(
      new THREE.SphereGeometry(70, 20, 14),
      new THREE.MeshBasicMaterial({
        map: canvasTex(64, 512, function (g, w, h) {
          var grd = g.createLinearGradient(0, 0, 0, h);
          grd.addColorStop(0.0, '#141b3a');
          grd.addColorStop(0.45, '#4a2d55');
          grd.addColorStop(0.72, '#a4502e');
          grd.addColorStop(0.85, '#e08a3c');
          grd.addColorStop(1.0, '#f2b25c');
          g.fillStyle = grd;
          g.fillRect(0, 0, w, h);
        }),
        side: THREE.BackSide,
        fog: false
      })
    );
    scene.add(sky);

    // sun glow low on the horizon (swapped for a moon by setMood)
    var sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex('rgba(255,214,150,1)', 'rgba(255,150,60,0)'),
      blending: THREE.AdditiveBlending, fog: false, depthWrite: false
    }));
    sun.position.set(-38, 4, -30);
    sun.scale.set(26, 26, 1);
    scene.add(sun);

    // the moon — hidden until setMood('night' | 'bloodmoon')
    moon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex('rgba(220,230,255,1)', 'rgba(150,180,255,0)'),
      blending: THREE.AdditiveBlending, fog: false, depthWrite: false
    }));
    moon.visible = false;
    scene.add(moon);

    // lights
    var amb = new THREE.AmbientLight(0x55425e, 0.75);
    scene.add(amb);
    var dusk = new THREE.DirectionalLight(0xff9a4a, 1.15);
    dusk.position.set(-9, 11, 6);
    dusk.castShadow = true;
    dusk.shadow.mapSize.set(1024, 1024);
    dusk.shadow.camera.left = -12; dusk.shadow.camera.right = 12;
    dusk.shadow.camera.top = 12; dusk.shadow.camera.bottom = -12;
    scene.add(dusk);
    var fill = new THREE.DirectionalLight(0x7a6aa8, 0.35);
    fill.position.set(8, 6, -8);
    scene.add(fill);

    env = { sky: sky, sun: sun, amb: amb, key: dusk, fill: fill };

    // sand floor
    var sandTex = sandTexture();
    sandTex.repeat.set(4, 4);
    var sand = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshLambertMaterial({ map: sandTex })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.receiveShadow = true;
    scene.add(sand);

    // outer dark ground
    var outer = new THREE.Mesh(
      new THREE.CircleGeometry(70, 32),
      new THREE.MeshLambertMaterial({ color: 0x2c2333 })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.02;
    scene.add(outer);

    var stone = stoneTexture();
    stone.repeat.set(6, 1);

    // arena wall
    var wall = new THREE.Mesh(
      new THREE.CylinderGeometry(8.6, 8.6, 1.5, 48, 1, true),
      new THREE.MeshLambertMaterial({ map: stone, side: THREE.DoubleSide })
    );
    wall.position.y = 0.75;
    wall.castShadow = true;
    scene.add(wall);

    // tiered seating (three stepped rings)
    var tiers = [
      { r: 11.4, h: 1.0, y: 1.9 },
      { r: 13.6, h: 1.0, y: 2.9 },
      { r: 15.8, h: 1.0, y: 3.9 },
    ];
    tiers.forEach(function (t) {
      var s = stone.clone();
      s.repeat.set(14, 1);
      var ring = new THREE.Mesh(
        new THREE.CylinderGeometry(t.r, t.r - 1.1, t.h, 48, 1, true),
        new THREE.MeshLambertMaterial({ map: s, side: THREE.DoubleSide })
      );
      ring.position.y = t.y;
      scene.add(ring);
    });

    // outer curtain wall
    var s2 = stone.clone();
    s2.repeat.set(30, 4);
    var curtain = new THREE.Mesh(
      new THREE.CylinderGeometry(17.5, 17.5, 9, 48, 1, true),
      new THREE.MeshLambertMaterial({ map: s2, side: THREE.DoubleSide })
    );
    curtain.position.y = 4.5;
    scene.add(curtain);

    // enemy gate arch (behind foe)
    var archMat = new THREE.MeshLambertMaterial({ map: stone.clone() });
    var archL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.4, 0.9), archMat);
    archL.position.set(-1.6, 2.2, -8.2);
    var archR = archL.clone();
    archR.position.x = 1.6;
    var archTop = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.9, 0.9), archMat);
    archTop.position.set(0, 4.6, -8.2);
    scene.add(archL, archR, archTop);

    // torches around the wall
    var flameTex = glowTex('rgba(255,240,190,1)', 'rgba(255,110,20,0)');
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2 + 0.4;
      var x = Math.cos(a) * 8.3, z = Math.sin(a) * 8.3;
      var g = new THREE.Group();
      var pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, 1.7, 6),
        new THREE.MeshLambertMaterial({ color: 0x4a3524 })
      );
      pole.position.y = 0.85;
      var flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      flame.position.y = 1.95;
      flame.scale.set(0.8, 1.1, 1);
      g.add(pole, flame);
      g.position.set(x, 1.5, z);
      scene.add(g);
      var rec = { flame: flame, light: null, phase: rnd() * 10, base: g.position.y };
      if (i < 3) {
        rec.light = new THREE.PointLight(0xff8c3a, 0.9, 12, 2);
        rec.light.position.set(0, 2.0, 0);
        g.add(rec.light);
      }
      torches.push(rec);
    }
  }

  var MOODS = {
    dusk: {
      sky: [[0, '#141b3a'], [0.45, '#4a2d55'], [0.72, '#a4502e'], [0.85, '#e08a3c'], [1, '#f2b25c']],
      fog: 0x2a1f33, amb: [0x55425e, 0.75], key: [0xff9a4a, 1.15], fill: [0x7a6aa8, 0.35],
      moon: null, torch: 0.9,
    },
    night: {
      sky: [[0, '#020409'], [0.5, '#0a1226'], [0.8, '#16233f'], [1, '#243a5c']],
      fog: 0x0d1220, amb: [0x2c3a5e, 0.55], key: [0x7a90c8, 0.45], fill: [0x3a4a7a, 0.45],
      moon: { pos: [26, 18, -40], scale: 7, color: 'rgba(220,230,255,1)', glow: 'rgba(150,180,255,0)' },
      torch: 1.6,
    },
    bloodmoon: {
      sky: [[0, '#0a0308'], [0.5, '#1c0a14'], [0.8, '#3a1220'], [1, '#5c1c24']],
      fog: 0x1c0a12, amb: [0x4a2030, 0.6], key: [0xc8504a, 0.55], fill: [0x7a3a4a, 0.4],
      moon: { pos: [20, 12, -38], scale: 13, color: 'rgba(255,130,100,1)', glow: 'rgba(255,60,40,0)' },
      torch: 1.7,
    },
  };

  function setMood(mood) {
    if (!env) return;
    if (!MOODS[mood]) mood = 'dusk';
    var m = MOODS[mood];
    var tex = canvasTex(64, 512, function (g, w, h) {
      var grd = g.createLinearGradient(0, 0, 0, h);
      for (var i = 0; i < m.sky.length; i++) grd.addColorStop(m.sky[i][0], m.sky[i][1]);
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    });
    env.sky.material.map = tex;
    env.sky.material.needsUpdate = true;
    scene.fog.color.setHex(m.fog);
    env.amb.color.setHex(m.amb[0]); env.amb.intensity = m.amb[1];
    env.key.color.setHex(m.key[0]); env.key.intensity = m.key[1];
    env.fill.color.setHex(m.fill[0]); env.fill.intensity = m.fill[1];
    env.sun.visible = !m.moon;
    if (m.moon) {
      moon.material.map = glowTex(m.moon.color, m.moon.glow);
      moon.material.needsUpdate = true;
      moon.position.set(m.moon.pos[0], m.moon.pos[1], m.moon.pos[2]);
      moon.scale.set(m.moon.scale, m.moon.scale, 1);
      moon.visible = true;
    } else {
      moon.visible = false;
    }
    for (var t = 0; t < torches.length; t++) if (torches[t].light) torches[t].light.intensity = m.torch;
  }

  function buildCrowd() {
    var geo = new THREE.BoxGeometry(0.3, 0.55, 0.28);
    geo.translate(0, 0.275, 0);
    var mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    var n = 460;
    crowdMesh = new THREE.InstancedMesh(geo, mat, n);
    var palette = [0x9c4a3a, 0x3a6b8f, 0xc2a24b, 0x7a4a8f, 0x5d8f4a, 0xa86a2f, 0x888a94, 0xb5533c];
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (var i = 0; i < n; i++) {
      var tier = i % 3;
      var ang = rnd() * Math.PI * 2;
      var r = 9.3 + tier * 2.15 + rnd() * 1.5;
      var y = [1.5, 2.5, 3.5][tier];
      var sc = 0.8 + rnd() * 0.5;
      p.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
      q.setFromEuler(new THREE.Euler(0, ang + Math.PI, 0));
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      crowdMesh.setMatrixAt(i, m);
      crowdMesh.setColorAt(i, new THREE.Color(palette[i % palette.length]));
      crowdData.push({ r: r, a: ang, y: y, sc: sc, phase: rnd() * 10 });
    }
    crowdMesh.instanceMatrix.needsUpdate = true;
    if (crowdMesh.instanceColor) crowdMesh.instanceColor.needsUpdate = true;
    scene.add(crowdMesh);
  }

  // ==================================================================
  //  enemy rig
  // ==================================================================
  function box(w, h, d, color, emissive) {
    var m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color: color, emissive: emissive || 0x000000 })
    );
    m.castShadow = true;
    return m;
  }

  var WEAPON_COLORS = {
    club: 0x8a6a3a, sword: 0xb8c4d0, staff: 0x7a5a32,
    hammer: 0x9aa4b0, spear: 0xb0b8c4, axe: 0xa8b0bc,
    stormclub: 0x6a4ab0, flamesword: 0xd07030, stormstaff: 0x5080c0,
    seishammer: 0x807060, venomsp: 0x50a050, bersaxe: 0x803030,
  };

  function makeWeaponMesh(key) {
    var w = WEAPONS[key];
    var col = WEAPON_COLORS[key] || 0x888888;
    var g = new THREE.Group();
    var em = w.leg ? new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.55 })
                   : new THREE.MeshLambertMaterial({ color: col });
    var wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });
    function add(mesh, x, y, z, rx) {
      mesh.position.set(x || 0, y || 0, z || 0);
      if (rx) mesh.rotation.x = rx;
      g.add(mesh);
      return mesh;
    }
    var B = function (ww, hh, dd, mat) { var b = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, dd), mat); b.castShadow = true; return b; };
    var C = function (rt, rb, hh, mat, seg) { var b = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, hh, seg || 8), mat); b.castShadow = true; return b; };
    switch (key) {
      case 'fists': break;
      case 'club': case 'stormclub':
        add(C(0.045, 0.06, 0.95, w.leg ? em : wood), 0, -0.45, 0);
        add(C(0.09, 0.11, 0.3, w.leg ? em : wood), 0, -0.95, 0);
        break;
      case 'sword': case 'flamesword':
        add(C(0.03, 0.03, 0.22, wood), 0, -0.1, 0);
        add(B(0.16, 0.045, 0.05, em), 0, -0.24, 0);
        add(B(0.075, 0.85, 0.028, em), 0, -0.7, 0);
        break;
      case 'staff': case 'stormstaff':
        add(C(0.04, 0.045, 1.25, w.leg ? em : wood), 0, -0.55, 0);
        if (w.leg) add(B(0.09, 0.2, 0.09, em), 0, -1.12, 0);
        break;
      case 'hammer': case 'seishammer':
        add(C(0.04, 0.045, 0.9, wood), 0, -0.42, 0);
        add(B(0.3, 0.22, 0.2, em), 0, -0.95, 0);
        break;
      case 'spear': case 'venomsp':
        add(C(0.028, 0.028, 1.7, wood), 0, -0.8, 0);
        var tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 8), em);
        tip.castShadow = true; tip.position.y = -1.8;
        g.add(tip);
        break;
      case 'axe': case 'bersaxe':
        add(C(0.04, 0.045, 0.95, wood), 0, -0.45, 0);
        add(B(0.34, 0.24, 0.05, em), 0.16, -0.92, 0);
        break;
    }
    if (w.leg) {
      var glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex('rgba(255,255,255,0.9)', 'rgba(255,180,60,0)'),
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      glow.scale.set(0.9, 0.9, 1);
      glow.position.y = -0.7;
      g.add(glow);
    }
    return g;
  }

  function makeShieldMesh(key, big) {
    var g = new THREE.Group();
    var mats = {
      wooden: new THREE.MeshLambertMaterial({ color: 0x8a6a3a }),
      iron: new THREE.MeshLambertMaterial({ color: 0x8a94a4 }),
      tower: new THREE.MeshLambertMaterial({ color: 0x6a5a40 }),
      aegis: new THREE.MeshLambertMaterial({ color: 0x4a7a5a }),
    };
    var m = mats[key] || mats.wooden;
    m.userData.baseColor = m.color.clone();
    if (big && key === 'tower') {
      var s = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.1), m);
      s.castShadow = true;
      g.add(s);
    } else if (big) {
      var s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 20), m);
      s2.rotation.x = Math.PI / 2;
      s2.castShadow = true;
      g.add(s2);
    } else {
      // player's first-person shield
      var s3 = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 18), m);
      s3.rotation.x = Math.PI / 2;
      g.add(s3);
      var boss = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.09, 10),
        new THREE.MeshLambertMaterial({ color: 0xd8b04a }));
      boss.rotation.x = Math.PI / 2;
      boss.position.z = 0.03;
      g.add(boss);
    }
    return g;
  }

  function resetEnemyTransforms() {
    var E = enemy;
    E.group.position.set(0, 0, FOE_POS);
    E.body.rotation.set(0, 0, 0);
    E.body.position.set(0, 0, 0);
    E.recoil = 0; E.sidestep = 0;
    E.anim = 'idle'; E.animT = 0;
    E.alive = true;
    if (enemyShieldMesh) enemyShieldMesh.visible = true;
    if (stunStars) { scene.remove(stunStars); stunStars = null; }
    if (enemy.aura) { enemy.aura.parent.remove(enemy.aura); enemy.aura = null; }
    if (enemy.telegraph) { enemy.telegraph.parent.remove(enemy.telegraph); enemy.telegraph = null; }
  }

  function buildEnemyRig(foe) {
    var E = enemy;
    // clear old
    if (E.group) scene.remove(E.group);
    E.parts = {};
    E.group = new THREE.Group();
    E.body = new THREE.Group();
    E.group.add(E.body);

    var skin = 0xb08a62;
    var arch = foe.arch;
    var armorKey = foe.armor;
    var armorCol = armorKey === 'iron' ? 0x8a94a4 : armorKey === 'dragon' ? 0x4a7a4a
      : armorKey === 'magic' ? 0x5a4a8a : 0x9a7a4a;
    var scale = arch === 'brute' ? 1.28 : arch === 'duelist' ? 0.92 : arch === 'wall' ? 1.1 : arch === 'trickster' ? 0.95 : 1.0;

    // legs
    ['L', 'R'].forEach(function (side) {
      var hip = new THREE.Group();
      hip.position.set(0.16 * (side === 'R' ? 1 : -1), 0.95, 0);
      var leg = box(0.17, 0.95, 0.22, arch === 'mage' ? 0x4a3a6a : skin);
      leg.position.y = -0.475;
      hip.add(leg);
      E.body.add(hip);
      E.parts['hip' + side] = hip;
    });

    // torso (robe for mages, plate otherwise)
    if (arch === 'mage') {
      var robe = new THREE.Mesh(
        new THREE.ConeGeometry(0.55, 1.5, 10),
        new THREE.MeshLambertMaterial({ color: 0x4a3a6a, emissive: 0x1a0a2a })
      );
      robe.position.y = 1.25;
      robe.castShadow = true;
      E.body.add(robe);
    } else {
      var torso = box(0.66, 0.8, 0.36, armorCol);
      torso.position.y = 1.35;
      E.body.add(torso);
      // straps / belt
      var belt = box(0.7, 0.12, 0.4, 0x4a3020);
      belt.position.y = 1.02;
      E.body.add(belt);
      if (armorKey === 'iron' || arch === 'brute' || arch === 'wall') {
        var chest = box(0.5, 0.4, 0.06, 0xa8b0bc);
        chest.position.set(0, 1.5, 0.19);
        E.body.add(chest);
      }
    }

    // shoulders + arms
    ['L', 'R'].forEach(function (side) {
      var sh = new THREE.Group();
      sh.position.set(0.42 * (side === 'R' ? 1 : -1), 1.68, 0);
      var pauldron = box(0.26, 0.2, 0.3, armorCol);
      sh.add(pauldron);
      var arm = box(0.15, 0.72, 0.19, arch === 'mage' ? 0x4a3a6a : skin);
      arm.position.y = -0.42;
      sh.add(arm);
      E.body.add(sh);
      E.parts['arm' + side] = sh;
    });

    // head + helm
    var head = box(0.3, 0.34, 0.3, skin);
    head.position.y = 2.06;
    E.body.add(head);
    E.parts.head = head;
    if (arch === 'mage') {
      var hat = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.5, 8),
        new THREE.MeshLambertMaterial({ color: 0x5a4a8a }));
      hat.position.y = 2.42;
      hat.castShadow = true;
      E.body.add(hat);
    } else if (arch === 'trickster') {
      // the white mask — no helm, so the face (or rather, the not-face) shows
      var mask = box(0.3, 0.3, 0.06, 0xe8e0d0);
      mask.position.set(0, 2.04, 0.15);
      E.body.add(mask);
    } else {
      var helm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: armorCol }));
      helm.position.y = 2.12;
      helm.castShadow = true;
      E.body.add(helm);
      if (foe.champion) {
        var hornGeo = new THREE.ConeGeometry(0.05, 0.3, 6);
        var hornMat = new THREE.MeshLambertMaterial({ color: 0xd8b04a, emissive: 0x4a3000 });
        var h1 = new THREE.Mesh(hornGeo, hornMat);
        h1.position.set(-0.18, 2.28, 0); h1.rotation.z = 0.5;
        var h2 = new THREE.Mesh(hornGeo, hornMat);
        h2.position.set(0.18, 2.28, 0); h2.rotation.z = -0.5;
        E.body.add(h1, h2);
      }
    }

    // weapon in right hand
    var wpn = makeWeaponMesh(foe.weapon);
    wpn.position.y = -0.78;
    wpn.rotation.x = 0.35;
    E.parts.armR.add(wpn);

    // shield on left arm
    if (foe.shield) {
      enemyShieldMesh = makeShieldMesh(foe.shield, true);
      enemyShieldMesh.position.set(0.05, -0.55, 0.28);
      E.parts.armL.add(enemyShieldMesh);
    } else {
      enemyShieldMesh = null;
    }

    E.body.scale.setScalar(scale);
    resetEnemyTransforms();
    scene.add(E.group);
  }

  // ==================================================================
  //  player first-person view
  // ==================================================================
  function buildPlayerView() {
    if (!viewGroup) {
      viewGroup = new THREE.Group();
      camera.add(viewGroup);
    }
    viewGroup.position.set(0, 0, 0);
    // clear
    while (viewGroup.children.length) viewGroup.remove(viewGroup.children[0]);
    weaponMesh = null; shieldMesh = null;

    var skin = new THREE.MeshLambertMaterial({ color: 0xb08a62 });

    // right hand + weapon
    handR = new THREE.Group();
    handR.position.set(0.34, -0.34, -0.78);
    handR.rotation.set(0.25, -0.15, 0.1);
    var fore = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), skin);
    fore.position.z = 0.25;
    var palm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.13, 0.18), skin);
    handR.add(fore, palm);
    var wk = save.equipped.weapon;
    weaponMesh = makeWeaponMesh(wk);
    weaponMesh.scale.setScalar(wk === 'spear' || wk === 'venomsp' ? 0.7 : 0.55);
    weaponMesh.position.set(0, 0.02, -0.18);
    weaponMesh.rotation.x = 1.25; // tip forward, slightly down
    handR.add(weaponMesh);
    viewGroup.add(handR);

    // left hand + shield
    var handL = new THREE.Group();
    handL.position.set(-0.46, -0.36, -0.82);
    handL.rotation.set(0.2, 0.2, -0.08);
    var foreL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.45), skin);
    foreL.position.z = 0.22;
    handL.add(foreL);
    var sk = save.equipped.shield;
    if (sk) {
      shieldMesh = makeShieldMesh(sk, false);
      shieldMesh.position.set(0, 0.1, -0.05);
      shieldMesh.scale.setScalar(sk === 'tower' ? 1.15 : 1);
      handL.add(shieldMesh);
    }
    viewGroup.add(handL);

    // cast glow (hidden by default)
    castGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex('rgba(255,255,255,0.95)', 'rgba(160,120,255,0)'),
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    castGlow.scale.set(0.01, 0.01, 1);
    castGlow.position.set(0, 0, -0.1);
    handR.add(castGlow);

    viewGroup.visible = true;
  }

  function handAttack(kind) {
    handAnim = { kind: kind, t: 0, dur: kind === 'stab' ? 0.42 : kind === 'swing' ? 0.5 : 0.4 };
  }

  // ==================================================================
  //  generic fx machinery
  // ==================================================================
  function addFx(update, life) {
    var f = { update: update, life: life || 1, t: 0 };
    fxList.push(f);
    return f;
  }

  function sparks(pos, color, count, speed, size, gravity, life, additive) {
    var meshes = [];
    for (var i = 0; i < count; i++) {
      var s = size * (0.6 + rnd() * 0.8);
      var m = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          depthWrite: false
        })
      );
      m.position.copy(pos);
      var v = new THREE.Vector3(
        (rnd() - 0.5) * speed,
        (rnd() - 0.2) * speed,
        (rnd() - 0.5) * speed
      );
      scene.add(m);
      meshes.push({ m: m, v: v });
    }
    var L = life || 0.6;
    var grav = gravity === undefined ? 9 : gravity;
    var entry = addFx(function (f, dt) {
      for (var i = 0; i < meshes.length; i++) {
        var o = meshes[i];
        o.v.y -= grav * dt;
        o.m.position.addScaledVector(o.v, dt);
        o.m.material.opacity = Math.max(0, 1 - entry.t / L);
      }
      return entry.t >= L;
    }, L);
  }

  // expanding ring on the ground
  function ringPulse(pos, color, maxR, life) {
    var m = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 40),
      new THREE.MeshBasicMaterial({ color: color, transparent: true, side: THREE.DoubleSide, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.copy(pos);
    m.position.y += 0.03;
    scene.add(m);
    addFx(function (f, dt) {
      var k = f.t / (life || 0.5);
      m.scale.setScalar(0.2 + easeOutCubic(k) * maxR);
      m.material.opacity = 1 - k;
      return k >= 1;
    }, life || 0.5);
  }

  // a geyser of sand kicked up from the ground (a shockwave landing) —
  // tan particles burst up and out from `pos`'s x/z and fall back down
  function sandBurst(pos, count, life) {
    var meshes = [];
    for (var i = 0; i < count; i++) {
      var s = 0.05 + rnd() * 0.1;
      var m = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshBasicMaterial({ color: 0xcbb489, transparent: true, depthWrite: false })
      );
      m.position.set(pos.x + (rnd() - 0.5) * 0.55, 0.04, pos.z + (rnd() - 0.5) * 0.55);
      m.material.opacity = 0.9;
      var v = new THREE.Vector3((rnd() - 0.5) * 2.4, 2.6 + rnd() * 3.4, (rnd() - 0.5) * 2.4);
      scene.add(m);
      meshes.push({ m: m, v: v });
    }
    var L = life || 0.7;
    var entry = addFx(function (f, dt) {
      for (var i = 0; i < meshes.length; i++) {
        var o = meshes[i];
        o.v.y -= 11 * dt;
        o.m.position.addScaledVector(o.v, dt);
        if (o.m.position.y < 0.02) { o.m.position.y = 0.02; o.v.y *= -0.22; o.v.x *= 0.6; o.v.z *= 0.6; }
        o.m.material.opacity = Math.max(0, 0.9 * (1 - entry.t / L));
      }
      return entry.t >= L;
    }, L);
  }

  // ==================================================================
  //  enemy animations (eAnim)
  // ==================================================================
  var eAnim = {
    attack: function () { enemy.anim = 'attack'; enemy.animT = 0; },
    hurt: function (heavy) {
      if (enemy.anim === 'die') return;
      enemy.anim = 'hurt'; enemy.animT = 0;
      enemy.recoil = heavy ? 0.3 : 0.18;
    },
    defend: function () { if (enemy.anim !== 'die') { enemy.anim = 'defend'; enemy.animT = 0; } },
    dodge: function (dir) { if (enemy.anim !== 'die') { enemy.anim = 'dodge'; enemy.animT = 0; enemy.sidestep = (dir || (rnd() < 0.5 ? -1 : 1)) * 0.7; } },
    cast: function () { enemy.anim = 'cast'; enemy.animT = 0; },
    die: function () { if (enemy.anim !== 'die') { enemy.anim = 'die'; enemy.animT = 0; } },
    stun: function () { if (enemy.anim !== 'die') { enemy.anim = 'stun'; enemy.animT = 0; } },
    rest: function () { if (enemy.anim !== 'die') { enemy.anim = 'rest'; enemy.animT = 0; } },
  };

  function updateEnemy(dt, t) {
    var E = enemy;
    if (!E.group) return;
    var p = E.parts;
    E.animT += dt;

    // decays
    E.recoil = Math.max(0, E.recoil - dt * 1.4);
    E.sidestep *= Math.pow(0.02, dt);

    var armR = p.armR, armL = p.armL;
    var idleSway = Math.sin(t * 2.1) * 0.04;
    var breathe = Math.sin(t * 2.6) * 0.012;

    if (E.anim === 'idle' || E.anim === 'stun') {
      if (armR) armR.rotation.x = lerp(armR.rotation.x, -0.25 + idleSway, dt * 8);
      if (armL) armL.rotation.x = lerp(armL.rotation.x, -0.2 + idleSway, dt * 8);
      E.body.rotation.x = lerp(E.body.rotation.x, 0, dt * 8);
      E.body.position.y = breathe;
      if (E.anim === 'stun') {
        E.body.rotation.z = Math.sin(t * 9) * 0.08;
        E.body.position.y = 0;
      }
    } else if (E.anim === 'attack') {
      // windup 0-0.22, strike 0.22-0.38, recover
      var k = E.animT;
      if (k < 0.22) armR && (armR.rotation.x = lerp(armR.rotation.x, -2.3, dt * 18));
      else if (k < 0.38) armR && (armR.rotation.x = lerp(armR.rotation.x, 0.7, dt * 30));
      else armR && (armR.rotation.x = lerp(armR.rotation.x, -0.25, dt * 8));
      if (E.animT > 0.62) E.anim = 'idle';
    } else if (E.anim === 'hurt') {
      E.body.rotation.x = lerp(E.body.rotation.x, -0.3, dt * 20);
      if (E.animT > 0.3) E.anim = 'idle';
    } else if (E.anim === 'defend') {
      if (armL) {
        armL.rotation.x = lerp(armL.rotation.x, -1.1, dt * 16);
        armL.rotation.z = lerp(armL.rotation.z, -0.5, dt * 16);
      }
      if (E.animT > 0.8) E.anim = 'idle';
    } else if (E.anim === 'dodge') {
      if (E.animT > 0.4) E.anim = 'idle';
    } else if (E.anim === 'cast') {
      if (armR) armR.rotation.x = lerp(armR.rotation.x, -1.9, dt * 10);
      if (armL) armL.rotation.x = lerp(armL.rotation.x, -1.7, dt * 10);
      if (E.animT > 0.9) E.anim = 'idle';
    } else if (E.anim === 'rest') {
      // crouch low, chest heaving
      var br = Math.sin(t * 4.2);
      E.body.position.y = lerp(E.body.position.y, -0.14, dt * 6);
      E.body.rotation.x = lerp(E.body.rotation.x, 0.2 + br * 0.03, dt * 6);
      if (armR) armR.rotation.x = lerp(armR.rotation.x, -0.55 + br * 0.06, dt * 6);
      if (armL) armL.rotation.x = lerp(armL.rotation.x, -0.5 + br * 0.06, dt * 6);
      if (E.animT > 0.6) E.anim = 'idle';
    } else if (E.anim === 'die') {
      var dk = Math.min(1, E.animT / 0.9);
      E.body.rotation.x = -Math.PI / 2 * easeInCubic(dk);
      E.body.position.y = -0.25 * easeInCubic(dk);
    }

    // apply recoil / sidestep to group
    E.group.position.z = FOE_POS + E.recoil;
    E.group.position.x = E.sidestep;
    E.group.rotation.y = -E.sidestep * 0.3;
  }

  // ==================================================================
  //  public fx (melee)
  // ==================================================================
  function fxSwingStreak(kind) {
    // swoosh arc between player and foe; resolves at the "contact" moment
    return new Promise(function (resolve) {
      var isStab = kind === 'stab', isSwing = kind === 'swing';
      var mat = new THREE.MeshBasicMaterial({
        color: isSwing ? 0xfff2c0 : 0xdfeaff,
        transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
      });
      var geo = new THREE.TorusGeometry(isStab ? 0.34 : 0.62, isStab ? 0.02 : 0.055, 8, 26, Math.PI * (isStab ? 0.5 : 0.9));
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, 1.35, FOE_POS * 0.55);
      mesh.rotation.y = Math.PI / 2;
      mesh.rotation.x = isSwing ? -0.9 : 0;
      scene.add(mesh);
      var contact = isStab ? 0.16 : 0.13;
      var L = isStab ? 0.34 : 0.3;
      addFx(function (f, dt) {
        var k = f.t / L;
        mesh.rotation.x -= dt * (isStab ? 1.5 : 9);
        mesh.scale.setScalar(0.7 + k * 0.7);
        mesh.material.opacity = k < contact / L ? 0.9 : 0.9 * (1 - (k - contact / L) / (1 - contact / L));
        if (f.t >= contact && !f._done) { f._done = true; Sfx.swing(); }
        if (f.t >= contact && !f._res) { f._res = true; resolve(); }
        if (k >= 1) { scene.remove(mesh); mat.dispose(); geo.dispose(); return true; }
      }, L);
    });
  }

  function foeChest() {
    var E = enemy;
    var s = E.group && E.parts && E.parts.head ? E.group.scale.x || 1 : 1;
    // scale lives on E.body; approximate chest world pos
    var scale = 1;
    if (E.group) {
      var f = combat.foe;
      scale = f && f.arch === 'brute' ? 1.28 : f && f.arch === 'duelist' ? 0.92 : f && f.arch === 'wall' ? 1.1 : 1;
    }
    return new THREE.Vector3(E.group ? E.group.position.x : 0, 1.4 * scale, enemyPos());
  }

  function fxImpact(kind) {
    var heavy = kind === 'heavy', shatter = kind === 'shatter';
    var pos = foeChest();
    sparks(pos, shatter ? 0xcfeeff : heavy ? 0xffb060 : 0xffe0a0, shatter ? 46 : heavy ? 30 : 18, heavy ? 6 : 4.5, 0.06, 9, 0.65, true);
    ringPulse(pos, shatter ? 0xcfeeff : 0xffc070, shatter ? 2.6 : 1.5, 0.5);
    flashLight(pos, shatter ? 0xcfeeff : 0xffa050, shatter ? 3 : 1.6, 0.22);
    if (heavy) addShake(0.12);
  }

  function fxBlock() {
    var pos = new THREE.Vector3(-0.4, -0.2, -1.1);
    // sparks in front of camera (screen space)
    var wp = new THREE.Vector3();
    camera.localToWorld(wp.copy(pos));
    sparks(wp, 0xd8e2f0, 14, 3.5, 0.05, 7, 0.45, true);
    ringPulse(wp, 0xaac0e0, 0.8, 0.35);
    addShake(0.05);
  }

  function fxShieldBreak() {
    var E = enemy;
    if (!E.group || !enemyShieldMesh) return;
    var wp = new THREE.Vector3();
    enemyShieldMesh.getWorldPosition(wp);
    sparks(wp, 0x9a7a4a, 26, 4.5, 0.08, 8, 0.9);
    if (enemyShieldMesh.parent) enemyShieldMesh.visible = false;
    Sfx.crack();
  }

  function fxShatter() {
    // ice shatter on the foe
    return new Promise(function (resolve) {
      var pos = foeChest();
      var shell = enemyIceShell;
      if (shell && shell.parent) shell.parent.remove(shell);
      enemyIceShell = null;
      var pos2 = new THREE.Vector3(enemy.group ? enemy.group.position.x : 0, 0.2, enemyPos());
      var L = 0.55;
      addFx(function (f, dt) {
        var k = f.t / L;
        if (!f._done) {
          f._done = true;
          sparks(pos, 0xcfeeff, 54, 7, 0.07, 10, 0.8, true);
          ringPulse(pos2, 0xcfeeff, 3, 0.7);
          sandBurst(pos2, 46, 0.8);
          flashLight(pos, 0xcfeeff, 3, 0.3);
          addShake(0.16);
          Sfx.shatter();
        }
        if (f.t > L * 0.45 && !f._res) { f._res = true; resolve(); }
        return k >= 1;
      }, L);
    });
  }

  // ==================================================================
  //  spell fx
  // ==================================================================
  var spellColors = {};
  Object.keys(SCROLLS).forEach(function (k) { spellColors[k] = SCROLLS[k].color; });

  function fxSpellProjectile(element, fromPlayer) {
    return new Promise(function (resolve) {
      var color = spellColors[element] || 0xffffff;
      var head = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
        color: color, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      }));
      head.scale.set(0.55, 0.55, 1);
      var start = fromPlayer
        ? new THREE.Vector3(0.25, 1.35, -0.4)
        : new THREE.Vector3(0, 1.5, enemyPos());
      var end = fromPlayer ? foeChest() : new THREE.Vector3(0, 1.2, 0.3);
      var L = 0.34;
      scene.add(head);
      addFx(function (f, dt) {
        var k = f.t / L;
        head.position.lerpVectors(start, end, easeInCubic(Math.min(1, k)));
        if (rnd() < 0.85) {
          var s = 0.05;
          var m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s),
            new THREE.MeshBasicMaterial({ color: color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
          m.position.copy(head.position).add(new THREE.Vector3((rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.3));
          scene.add(m);
          var life2 = 0.3;
          addFx(function (g, dt2) {
            m.material.opacity = 1 - g.t / life2;
            if (g.t >= life2) { scene.remove(m); return true; }
          }, life2);
        }
        if (k >= 1) {
          scene.remove(head);
          flashLight(end, color, 2, 0.25);
          sparks(end, color, 18, 4, 0.05, 5, 0.5, true);
          resolve();
          return true;
        }
      }, L);
    });
  }

  function flashLight(pos, color, intensity, life) {
    var l = new THREE.PointLight(color, intensity, 9, 2);
    l.position.copy(pos);
    scene.add(l);
    addFx(function (f, dt) {
      l.intensity = intensity * (1 - f.t / life);
      if (f.t >= life) { scene.remove(l); return true; }
    }, life);
  }

  function fxWater() {
    return new Promise(function (resolve) {
      var L = 0.85;
      // rolling wall of water
      var wallMat = new THREE.MeshLambertMaterial({
        color: 0x3f9dff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false
      });
      var wall = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 3, 28, 1, true, Math.PI / 2 - 0.7, 1.4), wallMat);
      wall.position.set(0, 0, -8);
      scene.add(wall);
      addFx(function (f, dt) {
        var k = f.t / L;
        wall.position.z = lerp(-8.5, FOE_POS + 1.6, easeInCubic(Math.min(1, k)));
        wall.position.y = 0.6 + Math.sin(f.t * 9) * 0.15;
        wallMat.opacity = k < 0.7 ? 0.75 : 0.75 * (1 - (k - 0.7) / 0.3);
        if (!f._done && k > 0.55) {
          f._done = true;
          var pos = foeChest();
          sparks(pos, 0x7fc4ff, 34, 5, 0.06, 8, 0.7, true);
          ringPulse(new THREE.Vector3(0, 0, enemyPos()), 0x7fc4ff, 3, 0.8);
          Sfx.water();
        }
        if (!f._res && k > 0.55) { f._res = true; resolve(); }
        if (k >= 1) { scene.remove(wall); wallMat.dispose(); return true; }
      }, L);
    });
  }

  function fxEarth() {
    return new Promise(function (resolve) {
      var L = 1.0;
      addShake(0.3);
      // cracks
      var mat = new THREE.LineBasicMaterial({ color: 0x4a3520, transparent: true });
      var lines = [];
      for (var i = 0; i < 9; i++) {
        var pts = [];
        var a = rnd() * Math.PI * 2;
        var r0 = 0.4, r1 = 2.5 + rnd() * 3;
        var mx = Math.cos(a) * (r0 + (r1 - r0) * 0.5), mz = Math.sin(a) * (r0 + (r1 - r0) * 0.5);
        pts.push(new THREE.Vector3(0, 0.03, 0));
        pts.push(new THREE.Vector3(mx * 0.7 + (rnd() - 0.5), 0.04, mz * 0.7 + (rnd() - 0.5)));
        pts.push(new THREE.Vector3(Math.cos(a) * r1, 0.03, Math.sin(a) * r1));
        var geo = new THREE.BufferGeometry().setFromPoints(pts);
        var line = new THREE.Line(geo, mat);
        scene.add(line);
        lines.push(line);
      }
      addFx(function (f, dt) {
        var k = f.t / L;
        if (!f._done && k > 0.18) {
          f._done = true;
          Sfx.earth();
          addShake(0.22);
          var pos = foeChest();
          sparks(pos, 0xb07a42, 36, 5.5, 0.09, 7, 0.8);
          ringPulse(new THREE.Vector3(0, 0, enemyPos()), 0xb07a42, 3.4, 0.9);
        }
        if (!f._res && k > 0.35) { f._res = true; resolve(); }
        mat.opacity = 1 - k;
        if (k >= 1) { lines.forEach(function (l) { scene.remove(l); l.geometry.dispose(); }); mat.dispose(); return true; }
      }, L);
    });
  }

  function fxWind() {
    return new Promise(function (resolve) {
      var L = 0.7;
      var meshes = [];
      for (var i = 0; i < 26; i++) {
        var m = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.02, 0.35),
          new THREE.MeshBasicMaterial({ color: 0xcfe8ef, transparent: true, opacity: 0.9, depthWrite: false })
        );
        var a = rnd() * Math.PI * 2;
        m.position.set(Math.cos(a) * (1 + rnd() * 2), 0.6 + rnd() * 1.6, enemyPos() + Math.sin(a) * (1 + rnd() * 2));
        scene.add(m);
        meshes.push({ m: m, a: a, r: 1 + rnd() * 2, sp: 4 + rnd() * 5, y: m.position.y });
      }
      addFx(function (f, dt) {
        var k = f.t / L;
        for (var i = 0; i < meshes.length; i++) {
          var o = meshes[i];
          o.a += dt * o.sp / o.r;
          o.m.position.x = Math.cos(o.a) * o.r;
          o.m.position.z = enemyPos() + Math.sin(o.a) * o.r;
          o.m.position.y = o.y + Math.sin(f.t * 6 + i) * 0.15;
          o.m.lookAt(0, o.y, enemyPos());
          o.m.material.opacity = 0.9 * (1 - k);
        }
        if (!f._done && k > 0.4) {
          f._done = true;
          Sfx.wind();
          var pos = foeChest();
          sparks(pos, 0xcfe8ef, 16, 4, 0.05, 2, 0.6, true);
        }
        if (!f._res && k > 0.5) { f._res = true; resolve(); }
        if (k >= 1) { meshes.forEach(function (o) { scene.remove(o.m); o.m.material.dispose(); }); return true; }
      }, L);
    });
  }

  var enemyIceShell = null;

  function fxIce() {
    return new Promise(function (resolve) {
      var L = 0.7;
      var pos = foeChest();
      addFx(function (f, dt) {
        var k = f.t / L;
        if (!f._done && k > 0.4) {
          f._done = true;
          Sfx.ice();
          sparks(pos, 0x9fe8ff, 30, 5, 0.06, 6, 0.8, true);
          ringPulse(new THREE.Vector3(0, 0, enemyPos()), 0x9fe8ff, 2.4, 0.7);
        }
        if (!f._res && k > 0.5) { f._res = true; resolve(); }
        return k >= 1;
      }, L);
    });
  }

  function fxIceShell() {
    if (enemyIceShell) return;
    var E = enemy;
    if (!E.group) return;
    var scale = 1;
    var f = combat.foe;
    if (f) scale = f.arch === 'brute' ? 1.65 : f.arch === 'duelist' ? 1.2 : f.arch === 'wall' ? 1.45 : 1.35;
    enemyIceShell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.05, 1),
      new THREE.MeshBasicMaterial({ color: 0x9fe8ff, wireframe: true, transparent: true, opacity: 0.5 })
    );
    enemyIceShell.scale.set(scale, scale * 1.5, scale);
    enemyIceShell.position.y = 1.3 * (f && f.arch === 'brute' ? 1.28 : 1);
    E.body.add(enemyIceShell);
  }

  function removeIceShell(silent) {
    if (enemyIceShell) {
      if (enemyIceShell.parent) enemyIceShell.parent.remove(enemyIceShell);
      enemyIceShell = null;
      if (!silent) Sfx.ice();
    }
  }

  function fxHeal() {
    // green sparkles rising around the player (camera space)
    var L = 0.9;
    var meshes = [];
    for (var i = 0; i < 22; i++) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05),
        new THREE.MeshBasicMaterial({ color: 0x7dffa8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set((rnd() - 0.5) * 1.4, -0.5 + rnd() * 0.8, -1.2);
      camera.add(m);
      meshes.push({ m: m, sp: 0.6 + rnd() });
    }
    addFx(function (f, dt) {
      var k = f.t / L;
      for (var i = 0; i < meshes.length; i++) {
        var o = meshes[i];
        o.m.position.y += dt * o.sp;
        o.m.material.opacity = 1 - k;
      }
      if (k >= 1) { meshes.forEach(function (o) { camera.remove(o.m); o.m.material.dispose(); }); return true; }
    }, L);
  }

  function fxHealAt(pos) {
    // green sparkles at a world position (e.g. an enemy mage healing)
    var L = 0.9;
    var meshes = [];
    for (var i = 0; i < 18; i++) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05),
        new THREE.MeshBasicMaterial({ color: 0x7dffa8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set(pos.x + (rnd() - 0.5), pos.y + rnd() * 1.4, pos.z + (rnd() - 0.5));
      scene.add(m);
      meshes.push({ m: m, sp: 0.5 + rnd() * 0.7 });
    }
    var entry = addFx(function (dt) {
      for (var i = 0; i < meshes.length; i++) {
        meshes[i].m.position.y += dt * meshes[i].sp;
        meshes[i].m.material.opacity = 1 - entry.t / L;
      }
      if (entry.t >= L) { meshes.forEach(function (o) { scene.remove(o.m); o.m.material.dispose(); }); return true; }
    }, L);
  }

  function fxShadowPuff() {
    var pos = foeChest();
    var L = 0.8;
    var meshes = [];
    for (var i = 0; i < 16; i++) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: 0x2a2438, transparent: true, opacity: 0.9, depthWrite: false }));
      var a = rnd() * Math.PI * 2;
      m.position.set(pos.x + Math.cos(a) * 0.8, 0.3 + rnd() * 1.6, pos.z + Math.sin(a) * 0.8);
      scene.add(m);
      meshes.push({ m: m });
    }
    addFx(function (f, dt) {
      var k = f.t / L;
      meshes.forEach(function (o) {
        o.m.material.opacity = 0.9 * (1 - k);
        o.m.scale.setScalar(1 + k * 1.4);
      });
      if (k >= 1) { meshes.forEach(function (o) { scene.remove(o.m); o.m.material.dispose(); }); return true; }
    }, L);
  }

  function fxStun(target) {
    // orbiting star sprites (target: 'foe' | 'me')
    var g = new THREE.Group();
    for (var i = 0; i < 3; i++) {
      var s = textSprite('✦', '#ffe95e', 40, false);
      s.scale.set(0.35, 0.35, 1);
      s.userData.a = i * Math.PI * 2 / 3;
      g.add(s);
    }
    var L = 1.6;
    addFx(function (f, dt) {
      var k = f.t / L;
      g.children.forEach(function (s) {
        s.userData.a += dt * 5;
        s.position.set(Math.cos(s.userData.a) * 0.5, 0.35 + Math.sin(s.userData.a * 2) * 0.08, Math.sin(s.userData.a) * 0.5);
        s.material.opacity = 1 - k;
      });
      if (k >= 1) { scene.remove(g); return true; }
    }, L);
    if (target === 'me') {
      camera.add(g);
      g.position.set(0, 0.5, -1.6);
    } else {
      var pos = foeChest();
      g.position.set(pos.x, pos.y + 0.9, pos.z);
      scene.add(g);
    }
  }

  function fxRage() {
    var pos = foeChest();
    sparks(pos, 0xff4030, 40, 6, 0.07, 4, 0.9, true);
    ringPulse(new THREE.Vector3(0, 0, enemyPos()), 0xff4030, 2.8, 0.8);
    Sfx.rage();
    setEnemyAura('rage');
  }

  function setEnemyAura(kind) {
    var E = enemy;
    if (enemy.aura) { enemy.aura.parent.remove(enemy.aura); enemy.aura = null; }
    if (kind === 'none' || !E.group) return;
    var color = kind === 'rage' ? 'rgba(255,60,30,0.8)' : kind === 'frozen' ? 'rgba(150,220,255,0.8)' : 'rgba(255,220,120,0.8)';
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex(color, 'rgba(0,0,0,0)'),
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true
    }));
    glow.scale.set(2.6, 2.6, 1);
    glow.position.y = 1.3;
    E.body.add(glow);
    enemy.aura = glow;
  }

  // Windup tell: a colored glow the foe flashes at the START of a round,
  // before you commit — his committed intent (readable habit, chess depth).
  // Persists (pulsing) until the next call or 'none'; the trickster never
  // telegraphs. Distinct from the persistent rage/frozen aura.
  function foeTelegraph(kind) {
    var E = enemy;
    if (enemy.telegraph) { enemy.telegraph.parent.remove(enemy.telegraph); enemy.telegraph = null; }
    if (kind === 'none' || !E.body) return;
    var colors = {
      attack: 'rgba(255,80,40,0.85)',
      defend: 'rgba(80,170,255,0.85)',
      dodge: 'rgba(120,255,150,0.85)',
      cast: 'rgba(205,120,255,0.85)',
    };
    var c = colors[kind];
    if (!c) return;
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex(c, 'rgba(0,0,0,0)'),
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true
    }));
    glow.scale.set(3.1, 3.1, 1);
    glow.position.y = 1.15;
    E.body.add(glow);
    enemy.telegraph = glow;
    enemy.telegraphT = 0;
  }

  function fxConfetti() {
    var colors = [0xd8b04a, 0xc04030, 0x4070c0, 0x40a060, 0xe0e0e0];
    var L = 3.2;
    var meshes = [];
    for (var i = 0; i < 90; i++) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.03),
        new THREE.MeshBasicMaterial({ color: pick(colors), transparent: true }));
      m.position.set((rnd() - 0.5) * 16, 8 + rnd() * 4, (rnd() - 0.5) * 16);
      m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      scene.add(m);
      meshes.push({ m: m, vy: 1 + rnd() * 1.5, vx: (rnd() - 0.5) * 1.2, spin: (rnd() - 0.5) * 6 });
    }
    addFx(function (f, dt) {
      for (var i = 0; i < meshes.length; i++) {
        var o = meshes[i];
        o.m.position.y -= o.vy * dt;
        o.m.position.x += o.vx * dt;
        o.m.rotation.x += o.spin * dt;
        o.m.rotation.y += o.spin * dt;
        if (o.m.position.y < 0.05) o.m.position.y = 0.05;
      }
      if (f.t > L - 0.6) meshes.forEach(function (o) { o.m.material.opacity = Math.max(0, (L - f.t) / 0.6); });
      return f.t >= L;
    }, L);
  }

  function fxHitPlayer() {
    // red vignette flash + shake
    var L = 0.5;
    var m = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 3.6),
      new THREE.MeshBasicMaterial({ color: 0xd02020, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false })
    );
    m.position.set(0, 0, -1.6);
    m.renderOrder = 999;
    camera.add(m);
    addShake(0.14);
    addFx(function (f, dt) {
      var k = f.t / L;
      m.material.opacity = 0.45 * (1 - k);
      if (k >= 1) { camera.remove(m); m.material.dispose(); return true; }
    }, L);
  }

  function ghostAt(pos, emoji) {
    var s = emojiSprite(emoji, 1.1);
    s.position.copy(pos);
    scene.add(s);
    var L = 0.4;
    addFx(function (f, dt) {
      var k = f.t / L;
      s.material.opacity = 1 - k;
      s.scale.setScalar(1.1 + k * 0.9);
      if (k >= 1) { scene.remove(s); return true; }
    }, L);
  }

  function crowdRoar(big) {
    cheer = big ? 1 : 0.6;
    Sfx.roar(big);
  }

  // ---------- floating text ----------
  function floatWorld(text, pos, color, scale) {
    var s = textSprite(text, color || '#ffffff', 40);
    s.position.copy(pos);
    s.scale.multiplyScalar(scale || 1);
    scene.add(s);
    var L = 1.25;
    addFx(function (f, dt) {
      var k = f.t / L;
      s.position.y += dt * 0.9;
      s.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      if (k >= 1) { scene.remove(s); s.material.map.dispose(); s.material.dispose(); return true; }
    }, L);
  }

  function floatMe(text, color) {
    var s = textSprite(text, color || '#ffffff', 44);
    s.position.set(0, -0.55, -2.1);
    s.renderOrder = 998;
    camera.add(s);
    var L = 1.2;
    addFx(function (f, dt) {
      var k = f.t / L;
      s.position.y += dt * 0.5;
      s.material.opacity = k > 0.55 ? 1 - (k - 0.55) / 0.45 : 1;
      if (k >= 1) { camera.remove(s); s.material.map.dispose(); s.material.dispose(); return true; }
    }, L);
  }

  function triggerSlowmo(scale, dur) {
    timeScaleTarget = scale || 0.25;
    slowmoUntil = performance.now() + (dur || 900);
  }

  // ---------- camera helpers ----------
  function addShake(amt) { shake = Math.min(0.5, shake + amt); }

  function flyCamera(from, to, dur, done) {
    fly = { from: from.clone(), to: to.clone(), t: 0, dur: dur, done: done || null };
  }

  // the player's death cam: the camera tips over as you fall, ends staring
  // at the arena sky, the lights gutter out and the frame fades to black.
  // Resolves when it is fully dark — the defeat screen should appear then.
  function playerDie() {
    return new Promise(function (resolve) {
      if (deathCam) { if (deathCam.resolve) deathCam.resolve(); resolve(); return; }
      var black = document.getElementById('blackout');
      if (black) black.style.opacity = '0';
      deathCam = {
        t: 0, fallDur: 1.5, fadeDur: 1.0, resolve: resolve, black: black,
        amb0: env ? env.amb.intensity : 1,
        key0: env ? env.key.intensity : 1,
        fill0: env ? env.fill.intensity : 1
      };
    });
  }

  function sceneStart() {
    return new Promise(function (resolve) {
      deathCam = null; // a new battle undoes the death cam
      var black = document.getElementById('blackout');
      if (black) black.style.opacity = '0'; // fade back from the previous defeat
      if (viewGroup) { viewGroup.visible = false; viewGroup.position.set(0, 0, 0); }
      // foe walks in from the gate
      var E = enemy;
      if (E.group) {
        E.group.position.z = -13;
        E.group.position.x = 0;
        E.walkIn = { from: -13, to: FOE_POS, t: 0, dur: 2.0 };
      }
      flyCamera(new THREE.Vector3(0, 6.5, 7.5), camBase.clone(), 1.9, function () {
        if (viewGroup) viewGroup.visible = true;
        resolve();
      });
    });
  }

  // ==================================================================
  //  main loop
  // ==================================================================
  function tick() {
    if (!running) return;
    requestAnimationFrame(tick);
    var rawDt = clock.getDelta();
    var dt = Math.min(rawDt, 0.05);
    var t = clock.elapsedTime;

    // slow-mo easing
    if (performance.now() > slowmoUntil) timeScaleTarget = 1;
    timeScale += (timeScaleTarget - timeScale) * Math.min(1, dt * 7);
    var d = dt * timeScale;

    // ---- camera: death cam > fly > idle ----
    if (deathCam) {
      var dc = deathCam;
      dc.t += rawDt;
      // the fall: sink to the sand, tip over, end staring at the sky
      var fk = Math.min(1, dc.t / dc.fallDur);
      var fe = easeInCubic(fk);
      camera.position.set(0, lerp(1.72, 0.36, fe), 0.35);
      camera.lookAt(new THREE.Vector3(0, lerp(1.38, 9, fe), lerp(FOE_POS, 1.4, fe)));
      camera.rotateZ(0.5 * fe); // the body tips over
      if (viewGroup) viewGroup.position.y = -1.1 * fe; // hands drop out of view
      // the lights gutter out as you go down
      if (env) {
        env.amb.intensity = dc.amb0 * (1 - 0.6 * fe);
        env.key.intensity = dc.key0 * (1 - 0.6 * fe);
        env.fill.intensity = dc.fill0 * (1 - 0.6 * fe);
      }
      // fade to black once the fall has landed
      if (dc.t >= dc.fallDur && dc.black) {
        dc.black.style.opacity = String(Math.min(1, (dc.t - dc.fallDur) / dc.fadeDur));
      }
      if (dc.t >= dc.fallDur + dc.fadeDur) {
        deathCam = null;
        if (dc.resolve) dc.resolve();
      }
    } else if (fly) {
      fly.t += rawDt;
      var k = Math.min(1, fly.t / fly.dur);
      camera.position.lerpVectors(fly.from, fly.to, easeOutCubic(k));
      if (k >= 1) {
        var done = fly.done;
        fly = null;
        if (done) done();
      }
    } else {
      // base + breathing bob + dodge lean
      var bobY = Math.sin(t * 1.7) * 0.02, bobX = Math.sin(t * 0.9) * 0.012;
      camYaw *= Math.pow(0.005, rawDt);
      camRoll *= Math.pow(0.005, rawDt);
      shake = Math.max(0, shake - rawDt * (shake * 3 + 0.08));
      camera.position.set(camBase.x + bobX, camBase.y + bobY, camBase.z);
      camera.position.x += (rnd() - 0.5) * shake;
      camera.position.y += (rnd() - 0.5) * shake;
      camera.lookAt(camLook);
      camera.rotateY(camYaw);
      camera.rotateZ(camRoll);
    }

    // foe walk-in
    var E = enemy;
    if (E.walkIn) {
      E.walkIn.t += rawDt;
      var wk = Math.min(1, E.walkIn.t / E.walkIn.dur);
      E.group.position.z = lerp(E.walkIn.from, E.walkIn.to, easeOutCubic(wk));
      E.group.position.x = Math.sin(wk * Math.PI * 4) * 0.15;
      // walking leg swing
      var sw = Math.sin(E.walkIn.t * 11) * 0.5;
      if (E.parts.hipL) E.parts.hipL.rotation.x = sw;
      if (E.parts.hipR) E.parts.hipR.rotation.x = -sw;
      if (wk >= 1) { E.walkIn = null; E.group.position.x = 0; }
    }

    updateEnemy(d, t);

    // player hand anim
    if (handAnim && handR) {
      handAnim.t += d;
      var ha = handAnim, k2 = ha.t / ha.dur;
      var rest = { x: 0.25, y: -0.15, z: 0.1 };
      if (ha.kind === 'cast') {
        handR.position.z = lerp(-0.78, -0.95, Math.min(1, k2 * 2));
        if (castGlow) {
          var gs = k2 < 0.5 ? k2 * 2 : 1 - (k2 - 0.5) * 2;
          castGlow.scale.set(0.5 * gs + 0.01, 0.5 * gs + 0.01, 1);
        }
        if (k2 >= 1) handAnim = null;
      } else {
        var w = weaponMesh;
        if (w) {
          var restX = 1.25;
          if (ha.kind === 'stab') {
            var push = k2 < 0.4 ? easeInCubic(k2 / 0.4) : 1 - easeOutCubic(Math.min(1, (k2 - 0.4) / 0.4));
            handR.position.z = -0.78 - push * 0.55;
            w.rotation.x = lerp(restX, 1.57, push); // level out into the thrust
          } else {
            // slash / swing: raise over the shoulder, then cut down forward
            var windup = ha.kind === 'swing' ? 2.9 : 2.7;
            var strike = ha.kind === 'swing' ? 0.35 : 0.65;
            if (k2 < 0.35) {
              w.rotation.x = lerp(restX, windup, easeInCubic(k2 / 0.35));
            } else if (k2 < 0.6) {
              w.rotation.x = lerp(windup, strike, easeOutCubic((k2 - 0.35) / 0.25));
            } else {
              w.rotation.x = lerp(strike, restX, easeOutCubic((k2 - 0.6) / 0.4));
            }
            w.rotation.z = Math.sin(k2 * Math.PI) * (ha.kind === 'swing' ? -0.35 : -0.2);
          }
        }
        if (ha.kind !== 'stab' || k2 >= 1) handR.position.z = -0.78;
        if (k2 >= 1) { handAnim = null; if (castGlow) castGlow.scale.set(0.01, 0.01, 1); }
      }
    }

    // dodge lean is set externally via dodgeLean()
    // crowd
    updateCrowd(d, t);

    // torches
    for (var i = 0; i < torches.length; i++) {
      var tc = torches[i];
      var fl = 0.8 + Math.sin(t * 11 + tc.phase) * 0.12 + rnd() * 0.08;
      tc.flame.scale.set(0.8 * fl, 1.1 * fl, 1);
      if (tc.light) tc.light.intensity = 0.8 * fl + 0.15;
    }

    // aura pulse
    if (enemy.aura) enemy.aura.material.opacity = 0.55 + Math.sin(t * 6) * 0.25;
    // windup telegraph: a brief, fast pulse — readable if you watch the foe,
    // then it fades (not a permanent status). The tell, not the whole answer.
    if (enemy.telegraph) {
      enemy.telegraphT += dt;
      var LT = 1.1, FD = 0.4;
      if (enemy.telegraphT >= LT) {
        enemy.telegraph.parent.remove(enemy.telegraph);
        enemy.telegraph = null;
      } else {
        var pulse = 0.45 + Math.sin(enemy.telegraphT * 10) * 0.35;
        if (enemy.telegraphT > LT - FD) pulse *= (LT - enemy.telegraphT) / FD;
        enemy.telegraph.material.opacity = pulse;
        var ts = 3.1 + Math.sin(enemy.telegraphT * 10) * 0.25;
        enemy.telegraph.scale.set(ts, ts, 1);
      }
    }

    // fx
    for (var j = fxList.length - 1; j >= 0; j--) {
      var f = fxList[j];
      f.t += d;
      if (f.update(f, d, t)) fxList.splice(j, 1);
    }

    renderer.render(scene, camera);
  }

  function updateCrowd(dt, t) {
    if (!crowdMesh) return;
    cheer = Math.max(0, cheer - dt * 0.35);
    var amp = 0.02 + cheer * 0.09;
    var speed = 1.2 + cheer * 3.2;
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (var i = 0; i < crowdData.length; i++) {
      var c = crowdData[i];
      p.set(Math.cos(c.a) * c.r, c.y + Math.abs(Math.sin(t * speed + c.phase)) * amp, Math.sin(c.a) * c.r);
      q.setFromEuler(new THREE.Euler(0, c.a + Math.PI, 0));
      s.set(c.sc, c.sc, c.sc);
      m.compose(p, q, s);
      crowdMesh.setMatrixAt(i, m);
    }
    crowdMesh.instanceMatrix.needsUpdate = true;
  }

  function dodgeLean(dir) {
    camYaw = -dir * 0.22;
    camRoll = -dir * 0.07;
    if (viewGroup) {
      viewGroup.position.x = dir * 0.12;
      setTimeout(function () { if (viewGroup) viewGroup.position.x = 0; }, 260);
    }
  }

  // ==================================================================
  //  init + public API
  // ==================================================================
  function initScene() {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.copy(camBase);
    scene.add(camera);
    clock = new THREE.Clock();

    buildEnvironment();
    buildCrowd();

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    running = true;
    tick();
  }

  function enemyPos() {
    return enemy.group ? enemy.group.position.z : FOE_POS;
  }

  return {
    initScene: initScene,
    sceneStart: sceneStart,
    playerDie: playerDie,
    setMood: setMood,
    rebuildEnemyVisual: function () { if (combat && combat.foe) buildEnemyRig(combat.foe); },
    buildPlayerView: buildPlayerView,
    enemyPos: enemyPos,
    eAnim: eAnim,
    handAttack: handAttack,
    setEnemyAura: setEnemyAura,
    foeTelegraph: foeTelegraph,
    dodgeLean: dodgeLean,
    removeIceShell: function () { removeIceShell(false); },

    fxSwingStreak: fxSwingStreak,
    fxImpact: fxImpact,
    fxBlock: fxBlock,
    fxShieldBreak: fxShieldBreak,
    fxShatter: fxShatter,
    fxSpellProjectile: fxSpellProjectile,
    fxWater: fxWater,
    fxEarth: fxEarth,
    fxWind: fxWind,
    fxIce: fxIce,
    fxHeal: fxHeal,
    fxHealAt: fxHealAt,
    fxHitFoe: fxImpact,
    fxShadowPuff: fxShadowPuff,
    fxStun: fxStun,
    fxRage: fxRage,
    fxConfetti: fxConfetti,
    fxHitPlayer: fxHitPlayer,
    fxIceShell: fxIceShell,
    ghostAt: ghostAt,
    crowdRoar: crowdRoar,
    floatWorld: floatWorld,
    floatMe: floatMe,
    triggerSlowmo: triggerSlowmo,
    updateEnemyShieldVisual: function (dur, max) {
      if (!enemyShieldMesh) return;
      var k = max > 0 ? dur / max : 1;
      var dim = k < 0.35 ? 0.5 : k < 0.7 ? 0.75 : 1;
      enemyShieldMesh.traverse(function (o) {
        if (o.material && o.material.userData.baseColor) {
          o.material.color.copy(o.material.userData.baseColor).multiplyScalar(dim);
        }
      });
    },
    removeEnemyShieldMesh: function () {
      if (enemyShieldMesh) enemyShieldMesh.visible = false;
    },
  };
})();
