/* ============================================================
   THE LAST GLADIATOR — audio.js
   WebAudio synth. No assets: every sound is generated (osc +
   filtered noise through gain envelopes). The AudioContext is
   created lazily on the first user gesture (browser autoplay
   policy) — call Sfx.unlock() from a pointerdown.
   Respects save.muted at play time (mute toggles live).
   ============================================================ */

var Sfx = (function () {
  var ctx = null;
  var master = null;
  var noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // shared white-noise buffer (2 s)
    var len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    return true;
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function live() {
    if (save && save.muted) return false;
    if (!ensure()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  // ---- primitives -------------------------------------------------

  // Simple oscillator blip with pitch glide + amplitude envelope.
  function tone(freq, opts) {
    if (!live()) return;
    var o = opts || {};
    var t0 = ctx.currentTime + (o.at || 0);
    var dur = o.dur || 0.2;
    var type = o.type || 'sine';
    var peak = o.vol || 0.3;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  // Filtered noise burst (hits, impacts, whooshes).
  function noise(opts) {
    if (!live()) return;
    var o = opts || {};
    var t0 = ctx.currentTime + (o.at || 0);
    var dur = o.dur || 0.25;
    var peak = o.vol || 0.3;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = o.rate || 1;
    var f = ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.freq || 800, t0);
    if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.slide), t0 + dur);
    f.Q.value = o.q || 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0, rnd() * 1.2); src.stop(t0 + dur + 0.05);
  }

  // ---- named sounds -----------------------------------------------

  var S = {
    unlock: unlock,

    click: function () { tone(660, { type: 'triangle', dur: 0.06, vol: 0.12 }); },

    coin: function () {
      tone(1244, { type: 'square', dur: 0.09, vol: 0.08 });
      tone(1865, { type: 'square', dur: 0.18, vol: 0.08, at: 0.07 });
    },
    buy: function () {
      tone(523, { type: 'triangle', dur: 0.1, vol: 0.15 });
      tone(784, { type: 'triangle', dur: 0.14, vol: 0.15, at: 0.08 });
    },
    deny: function () { tone(180, { type: 'sawtooth', dur: 0.15, vol: 0.12, slide: 90 }); },

    swing: function () {
      noise({ dur: 0.18, filter: 'bandpass', freq: 900, slide: 2200, vol: 0.22, q: 2, rate: 0.7 });
    },
    hit: function () {
      noise({ dur: 0.12, freq: 300, slide: 90, vol: 0.4 });
      tone(110, { type: 'sine', dur: 0.12, vol: 0.35, slide: 55 });
    },
    hitHeavy: function () {
      noise({ dur: 0.18, freq: 220, slide: 60, vol: 0.5 });
      tone(80, { type: 'sine', dur: 0.2, vol: 0.45, slide: 40 });
    },
    block: function () {
      noise({ dur: 0.08, filter: 'highpass', freq: 2500, vol: 0.2 });
      tone(340, { type: 'square', dur: 0.07, vol: 0.12, slide: 180 });
      tone(210, { type: 'triangle', dur: 0.1, vol: 0.15 });
    },
    crack: function () {
      noise({ dur: 0.07, filter: 'bandpass', freq: 1600, vol: 0.3, q: 3 });
      tone(180, { type: 'triangle', dur: 0.06, vol: 0.15, slide: 120 });
    },
    breakShield: function () {
      noise({ dur: 0.4, freq: 500, slide: 100, vol: 0.45 });
      noise({ dur: 0.25, filter: 'highpass', freq: 3000, vol: 0.2, at: 0.03 });
      tone(90, { type: 'sine', dur: 0.3, vol: 0.3, slide: 45 });
    },
    dodge: function () {
      noise({ dur: 0.14, filter: 'bandpass', freq: 1400, slide: 3200, vol: 0.14, q: 2, rate: 1.4 });
    },
    rest: function () { // a deep, spent breath
      noise({ dur: 0.55, filter: 'bandpass', freq: 420, slide: 240, vol: 0.12, q: 1.2, rate: 0.8 });
      tone(150, { type: 'sine', dur: 0.45, vol: 0.07, slide: 95 });
    },
    shatter: function () { // ice shatter
      noise({ dur: 0.5, filter: 'highpass', freq: 4000, vol: 0.35, rate: 1.6 });
      tone(2093, { type: 'sine', dur: 0.3, vol: 0.12, slide: 880 });
      tone(1568, { type: 'sine', dur: 0.4, vol: 0.1, at: 0.04, slide: 620 });
    },

    cast: function () {
      tone(880, { type: 'sine', dur: 0.25, vol: 0.14, slide: 1320 });
      tone(1320, { type: 'sine', dur: 0.3, vol: 0.1, at: 0.06, slide: 1980 });
    },
    fire: function () {
      noise({ dur: 0.5, freq: 700, slide: 200, vol: 0.45 });
      tone(150, { type: 'sawtooth', dur: 0.35, vol: 0.12, slide: 60 });
    },
    water: function () {
      noise({ dur: 0.7, freq: 900, slide: 300, vol: 0.35 });
      tone(220, { type: 'sine', dur: 0.5, vol: 0.15, slide: 110 });
    },
    earth: function () {
      noise({ dur: 0.8, freq: 160, slide: 50, vol: 0.55 });
      tone(55, { type: 'sine', dur: 0.7, vol: 0.4, slide: 35 });
    },
    wind: function () {
      noise({ dur: 0.6, filter: 'bandpass', freq: 1800, slide: 4200, vol: 0.2, q: 1.5, rate: 0.9 });
    },
    lightning: function () {
      noise({ dur: 0.1, freq: 4000, slide: 400, vol: 0.5, rate: 1.8 });
      tone(90, { type: 'sawtooth', dur: 0.25, vol: 0.2, slide: 40, at: 0.05 });
      noise({ dur: 0.5, freq: 300, slide: 80, vol: 0.25, at: 0.08 });
    },
    ice: function () {
      tone(1976, { type: 'sine', dur: 0.35, vol: 0.12, slide: 988 });
      tone(2489, { type: 'sine', dur: 0.4, vol: 0.08, at: 0.05, slide: 1244 });
      noise({ dur: 0.3, filter: 'highpass', freq: 5000, vol: 0.12 });
    },
    heal: function () {
      tone(523, { type: 'sine', dur: 0.2, vol: 0.14 });
      tone(659, { type: 'sine', dur: 0.25, vol: 0.14, at: 0.1 });
      tone(784, { type: 'sine', dur: 0.35, vol: 0.14, at: 0.2 });
    },
    shadow: function () {
      tone(320, { type: 'sine', dur: 0.5, vol: 0.15, slide: 80 });
      noise({ dur: 0.4, freq: 250, slide: 60, vol: 0.12, at: 0.1 });
    },
    stun: function () {
      tone(880, { type: 'triangle', dur: 0.1, vol: 0.12 });
      tone(660, { type: 'triangle', dur: 0.1, vol: 0.12, at: 0.12 });
      tone(440, { type: 'triangle', dur: 0.16, vol: 0.12, at: 0.24 });
    },
    rage: function () {
      tone(90, { type: 'sawtooth', dur: 0.5, vol: 0.2, slide: 180 });
      noise({ dur: 0.4, freq: 400, slide: 900, vol: 0.15, at: 0.1 });
    },
    horn: function () { // announcer trumpet
      tone(392, { type: 'sawtooth', dur: 0.4, vol: 0.12 });
      tone(392, { type: 'sawtooth', dur: 0.4, vol: 0.12, at: 0.0 });
      tone(523, { type: 'sawtooth', dur: 0.7, vol: 0.14, at: 0.42 });
    },
    roar: function (big) { // crowd (scaled by the crowd-volume slider)
      var cv = (save && typeof save.crowdVol === 'number') ? clamp(save.crowdVol, 0, 1) : 1;
      if (cv <= 0) return;
      noise({ dur: big ? 1.4 : 0.8, freq: 500, slide: 250, vol: (big ? 0.3 : 0.18) * cv, rate: 0.5 });
      noise({ dur: big ? 1.1 : 0.6, filter: 'bandpass', freq: 900, slide: 500, vol: (big ? 0.14 : 0.07) * cv, q: 1, at: 0.1 });
    },
    victory: function () {
      var seq = [523, 659, 784, 1047];
      for (var i = 0; i < seq.length; i++) tone(seq[i], { type: 'triangle', dur: 0.3, vol: 0.16, at: i * 0.16 });
      tone(1319, { type: 'triangle', dur: 0.6, vol: 0.16, at: 0.64 });
      S.roar(true);
    },
    defeat: function () {
      var seq = [392, 349, 311, 262];
      for (var j = 0; j < seq.length; j++) tone(seq[j], { type: 'triangle', dur: 0.4, vol: 0.16, at: j * 0.24 });
      S.roar(false);
    },
    draw: function () {
      tone(440, { type: 'triangle', dur: 0.3, vol: 0.14 });
      tone(440, { type: 'triangle', dur: 0.4, vol: 0.14, at: 0.35 });
    },
    discover: function () {
      tone(784, { type: 'sine', dur: 0.15, vol: 0.15 });
      tone(1047, { type: 'sine', dur: 0.15, vol: 0.15, at: 0.12 });
      tone(1568, { type: 'sine', dur: 0.4, vol: 0.15, at: 0.24 });
    },
    title: function () {
      var seq = [659, 784, 988, 1319];
      for (var i = 0; i < seq.length; i++) tone(seq[i], { type: 'triangle', dur: 0.25, vol: 0.16, at: i * 0.12 });
    },
  };

  return S;
})();

/* Ambient bed: a low crowd murmur that breathes, plus battle
   drums when a fight is on. Both run through one loop graph so
   they can be faded in/out together. */
var Ambience = (function () {
  var ctx = null, master = null;
  var crowdGain = null, drumGain = null, drumTimer = null;
  var crowdSrc = null, crowdLfoGain = null;
  var CROWD_BASE = 0.16, CROWD_LFO_BASE = 0.05; // the murmur level at 100% crowd volume
  var _crowdVol = 1;                            // 0..1, set via setCrowdVolume

  // scale the live crowd murmur (the battle drums are left untouched)
  function applyCrowdVol() {
    var v = clamp(_crowdVol, 0, 1);
    if (crowdGain) crowdGain.gain.value = CROWD_BASE * v;
    if (crowdLfoGain) crowdLfoGain.gain.value = CROWD_LFO_BASE * v;
  }
  function setCrowdVolume(v) {
    _crowdVol = (typeof v === 'number') ? v : 1;
    applyCrowdVol();
  }

  function start() {
    if (crowdGain) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // crowd: looping filtered noise, slowly LFO'd
    var len = ctx.sampleRate * 3;
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var v = 0;
    for (var i = 0; i < len; i++) { v = v * 0.98 + (rnd() * 2 - 1) * 0.02; d[i] = v; }
    crowdSrc = ctx.createBufferSource();
    crowdSrc.buffer = buf; crowdSrc.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 0.6;
    crowdGain = ctx.createGain();
    crowdGain.gain.value = CROWD_BASE;
    var lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    crowdLfoGain = ctx.createGain();
    crowdLfoGain.gain.value = CROWD_LFO_BASE;
    lfo.connect(crowdLfoGain); crowdLfoGain.connect(crowdGain.gain);
    crowdSrc.connect(f); f.connect(crowdGain); crowdGain.connect(master);
    crowdSrc.start(); lfo.start();
    applyCrowdVol();

    drumGain = ctx.createGain();
    drumGain.gain.value = 0;
    drumGain.connect(master);

    if (ctx.state === 'suspended') ctx.resume();
    // fade in
    master.gain.setTargetAtTime(0.7, ctx.currentTime, 1.5);
  }

  function setBattle(on) {
    if (!ctx || !drumGain) return;
    drumGain.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, on ? 0.2 : 0.5);
    if (on && !drumTimer) {
      drumTimer = setInterval(function () {
        if (save && save.muted) return;
        if (ctx.state === 'suspended') return;
        var t0 = ctx.currentTime;
        var o = ctx.createOscillator();
        var g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(95, t0);
        o.frequency.exponentialRampToValueAtTime(40, t0 + 0.22);
        g.gain.setValueAtTime(0.5, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
        o.connect(g); g.connect(drumGain);
        o.start(t0); o.stop(t0 + 0.3);
      }, 620);
    } else if (!on && drumTimer) {
      clearInterval(drumTimer);
      drumTimer = null;
    }
  }

  function stop() {
    if (!ctx) return;
    if (drumTimer) { clearInterval(drumTimer); drumTimer = null; }
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
    var old = ctx;
    setTimeout(function () { try { old.close(); } catch (e) { /* noop */ } }, 2500);
    ctx = null; master = null; crowdGain = null; drumGain = null; crowdSrc = null; crowdLfoGain = null;
  }

  return { start: start, setBattle: setBattle, stop: stop, setCrowdVolume: setCrowdVolume };
})();
