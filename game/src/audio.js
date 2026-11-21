// Neon Harbor Nights — audio.js
// All sound is synthesised with WebAudio: no audio files, no network.
// The context stays locked until the first user gesture (menu click).
window.NHN = window.NHN || {};

NHN.audio = (function () {
  var ctx = null, master = null;
  var engineNodes = null, sirenNodes = null;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }

  function env(gain, t0, peak, dur) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }

  function tone(freq, dur, type, peak, slideTo) {
    if (!ctx) return;
    var t0 = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    env(g, t0, peak || 0.16, dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, peak, filterFreq) {
    if (!ctx) return;
    var t0 = ctx.currentTime;
    var len = Math.max(1, (ctx.sampleRate * dur) | 0);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource(); src.buffer = buf;
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 1800;
    var g = ctx.createGain(); g.gain.value = peak || 0.3;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  var sfx = {
    click:  function () { tone(660, 0.07, 'square', 0.10); },
    shot:   function () { noise(0.14, 0.5, 2600); tone(150, 0.1, 'sawtooth', 0.22, 60); },
    dryFire:function () { tone(1200, 0.04, 'square', 0.08); },
    reload: function () { tone(300, 0.06, 'square', 0.12); setTimeout(function () { tone(520, 0.06, 'square', 0.12); }, 130); },
    crash:  function () { noise(0.3, 0.42, 700); tone(90, 0.25, 'sawtooth', 0.2, 40); },
    pickup: function () { tone(880, 0.1, 'sine', 0.2); setTimeout(function () { tone(1320, 0.14, 'sine', 0.2); }, 80); },
    chime:  function () { tone(1046, 0.12, 'sine', 0.18); setTimeout(function () { tone(1568, 0.18, 'sine', 0.18); }, 100); },
    hurt:   function () { tone(200, 0.16, 'sawtooth', 0.2, 90); },
    busted: function () { tone(392, 0.22, 'square', 0.16); setTimeout(function () { tone(311, 0.22, 'square', 0.16); }, 200); setTimeout(function () { tone(262, 0.4, 'square', 0.16); }, 400); },
    jingle: function () { // mission complete: little rising figure
      var notes = [523, 659, 784, 1046];
      for (var i = 0; i < notes.length; i++) {
        (function (f, k) { setTimeout(function () { tone(f, 0.22, 'triangle', 0.22); }, k * 120); })(notes[i], i);
      }
    }
  };

  // Continuous engine loop while driving; rate follows speed.
  var engine = {
    start: function () {
      if (!ctx || engineNodes) return;
      var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'square';
      o.frequency.value = 55; o2.frequency.value = 28;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      g.gain.value = 0.0;
      o.connect(f); o2.connect(f); f.connect(g); g.connect(master);
      o.start(); o2.start();
      engineNodes = { o: o, o2: o2, g: g };
    },
    setRate: function (t) { // t in 0..1
      if (!engineNodes) return;
      var f = 50 + t * 130;
      engineNodes.o.frequency.value = f;
      engineNodes.o2.frequency.value = f * 0.5;
      engineNodes.g.gain.value = 0.05 + t * 0.06;
    },
    stop: function () {
      if (!engineNodes) return;
      try { engineNodes.o.stop(); engineNodes.o2.stop(); } catch (e) {}
      engineNodes = null;
    }
  };

  // Two-tone police siren while wanted and police are near.
  var siren = {
    start: function () {
      if (!ctx || sirenNodes) return;
      var o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 800;
      lfo.type = 'square'; lfo.frequency.value = 0.9;
      lg.gain.value = 160;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.value = 0.035;
      o.connect(g); g.connect(master);
      o.start(); lfo.start();
      sirenNodes = { o: o, lfo: lfo, g: g };
    },
    stop: function () {
      if (!sirenNodes) return;
      try { sirenNodes.o.stop(); sirenNodes.lfo.stop(); } catch (e) {}
      sirenNodes = null;
    }
  };

  return { unlock: unlock, sfx: sfx, engine: engine, siren: siren,
           ready: function () { return !!ctx; } };
})();
