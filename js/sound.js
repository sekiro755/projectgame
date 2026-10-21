/**
 * sound.js — короткие современные звуки, синтезированные через Web Audio API.
 * Никаких аудиофайлов: ноль килобайт ассетов и мгновенная загрузка.
 */
(function (global) {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = true;
  var suspended = false;
  var noiseBuf = null;

  /** Аудио можно запустить только после жеста пользователя */
  function unlock() {
    if (!ctx) {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.5;
        master.connect(ctx.destination);
        // Буфер белого шума для «шуршания» карт
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { ctx = null; return; }
    }
    if (ctx.state === 'suspended' && !suspended) ctx.resume().catch(function () {});
  }

  /** Простой тон с огибающей; slide — к какой частоте съехать */
  function tone(freq, dur, type, vol, delay, slide) {
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Шумовой всплеск через полосовой фильтр — звук скольжения карты */
  function noise(dur, freq, q, vol, delay, sweepTo) {
    var t = ctx.currentTime + (delay || 0);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  var SOUNDS = {
    tap: function () { tone(660, 0.05, 'sine', 0.15); },
    card: function () { noise(0.09, 2400, 0.8, 0.35, 0, 1200); tone(180, 0.05, 'triangle', 0.12, 0.05); },
    deal: function () { noise(0.05, 3000, 1, 0.18); },
    beat: function () { noise(0.07, 2800, 0.9, 0.3); tone(320, 0.06, 'triangle', 0.18, 0.04); },
    trump: function () { noise(0.08, 2600, 0.9, 0.3); tone(523, 0.09, 'triangle', 0.18, 0.03); tone(784, 0.14, 'triangle', 0.16, 0.08); },
    transfer: function () { noise(0.12, 900, 1.2, 0.25, 0, 4000); tone(440, 0.12, 'sine', 0.15, 0.02, 880); },
    bito: function () { noise(0.28, 600, 0.7, 0.3, 0, 5000); },
    take: function () { tone(330, 0.12, 'square', 0.08); tone(220, 0.2, 'square', 0.08, 0.1); },
    shuffle: function () { for (var i = 0; i < 7; i++) noise(0.05, 2500 + i * 150, 1, 0.15, i * 0.045); },
    coin: function () { tone(988, 0.08, 'square', 0.07); tone(1319, 0.22, 'square', 0.07, 0.07); },
    pop: function () { tone(400, 0.09, 'sine', 0.25, 0, 1200); },
    error: function () { tone(140, 0.12, 'square', 0.08); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.18, 'triangle', 0.2, i * 0.09); }); tone(1568, 0.35, 'sine', 0.12, 0.4); },
    lose: function () { [392, 370, 349].forEach(function (f, i) { tone(f, 0.28, 'sawtooth', 0.07, i * 0.26, f * 0.94); }); tone(262, 0.6, 'sawtooth', 0.07, 0.8, 200); },
    draw: function () { tone(523, 0.15, 'triangle', 0.18); tone(523, 0.25, 'triangle', 0.18, 0.18); },
    level: function () { [784, 988, 1175, 1568].forEach(function (f, i) { tone(f, 0.12, 'square', 0.06, i * 0.07); }); },
    turn: function () { tone(880, 0.07, 'sine', 0.1); tone(1175, 0.1, 'sine', 0.08, 0.06); }
  };

  global.Sound = {
    unlock: unlock,
    play: function (name) {
      if (!enabled || suspended || !ctx || !SOUNDS[name]) return;
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      try { SOUNDS[name](); } catch (e) { /* звук не критичен */ }
    },
    setEnabled: function (v) { enabled = !!v; },
    get enabled() { return enabled; },
    /** Пауза на время рекламы и сворачивания приложения */
    suspend: function () { suspended = true; if (ctx) ctx.suspend().catch(function () {}); },
    resume: function () { suspended = false; if (ctx) ctx.resume().catch(function () {}); }
  };
})(window);
