/* Soundeffekte – Web-Audio-Synthese plus optional eigene Audiodateien (pro Benutzer am Server gespeichert). */
const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null, roll = null, spinLoop = null;
  let muted = false;
  try { muted = localStorage.getItem("muted") === "1"; } catch (e) {}

  const cfg = { tick: "ratchet", win: "fanfare", roll: true, volume: 0.6 };
  let season = "none";
  const custom = { tick: null, win: null };       // AudioBuffer
  const customRaw = { tick: null, win: null };    // ArrayBuffer (vor dem Dekodieren)

  function ac() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = cfg.volume; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      for (const k of ["tick", "win"]) if (customRaw[k]) decode(k);
    }
    if (ctx.state === "suspended") ctx.resume();
    keepAlive(4);
    return ctx;
  }

  // Ein laufender AudioContext hält den Audio-Thread dauerhaft aktiv (kostet CPU/Akku, auch wenn es still ist).
  // Daher nach ein paar Sekunden Stille pausieren; beim nächsten Ton wird er automatisch fortgesetzt.
  let idleTimer = null, aliveUntil = 0;
  function keepAlive(sec) {
    aliveUntil = Math.max(aliveUntil, performance.now() + sec * 1000);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function check() {
      if (!ctx || ctx.state !== "running") return;
      if (roll || spinLoop || performance.now() < aliveUntil) { idleTimer = setTimeout(check, 1000); return; }
      ctx.suspend().catch(() => {});
    }, Math.max(0, aliveUntil - performance.now()) + 50);
  }

  async function decode(kind) {
    const raw = customRaw[kind]; if (!raw || !ctx) return;
    try { custom[kind] = await ctx.decodeAudioData(raw.slice(0)); }
    catch (e) { console.warn("Audiodatei nicht lesbar", e); custom[kind] = null; }
  }

  function tone(freq, t0, dur, { type = "sine", vol = 0.25, attack = 0.005, glideTo = null, filter = null } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = o;
    if (filter) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filter; o.connect(f); node = f; }
    node.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(t0, dur, { vol = 0.2, type = "bandpass", freq = 2000, q = 1, freqTo = null, attack = null } = {}) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (attack ?? Math.min(0.05, dur / 3)));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  function playBuffer(buf, { vol = 1, rate = 1, when = null } = {}) {
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf; s.playbackRate.value = rate; g.gain.value = vol;
    s.connect(g); g.connect(master); s.start(when ?? ctx.currentTime);
    keepAlive(buf.duration / Math.max(0.1, rate) + 1);
    return { s, g };
  }

  const play = fn => { if (muted || !ac()) return; fn(ctx.currentTime); };
  // eigene Datei: kurz (< 0,6 s) = wird bei jedem Feld abgespielt, länger = läuft während der Drehung mit
  const customTickIsLoop = () => custom.tick && custom.tick.duration >= 0.6;

  /* ---------- Klick-Varianten ---------- */
  const TICKS = {
    // Kunststoff-Lamelle, die über die Stifte schnalzt – der typische Glücksrad-Sound
    ratchet(t, sp) {
      noise(t, 0.028, { vol: 0.55, type: "bandpass", freq: 1400 + sp * 700, q: 2.2, attack: 0.002 });
      noise(t + 0.004, 0.05, { vol: 0.18, type: "lowpass", freq: 700, q: 0.7, attack: 0.003 });
      tone(240 + sp * 90, t, 0.045, { type: "square", vol: 0.05, filter: 1200, attack: 0.002 });
    },
    // tiefer Holz-Klick
    wood(t, sp) {
      noise(t, 0.04, { vol: 0.3, freq: 900 + sp * 500, q: 3 });
      tone(320 + sp * 160, t, 0.06, { type: "triangle", vol: 0.22, glideTo: 180 + sp * 80 });
    },
    // Spielshow: Metallstift + Klappe
    show(t, sp) {
      tone(610, t, 0.12, { type: "sine", vol: 0.14, attack: 0.002 });
      tone(1530, t, 0.07, { type: "sine", vol: 0.06, attack: 0.002 });
      noise(t, 0.03, { vol: 0.35, freq: 2600, q: 1.5, attack: 0.002 });
      tone(150 + sp * 50, t + 0.005, 0.05, { type: "triangle", vol: 0.15 });
    },
    // sanft für ruhige Klassen
    soft(t, sp) {
      tone(520 + sp * 120, t, 0.05, { type: "sine", vol: 0.12, attack: 0.003 });
    },
  };

  /* ---------- Halloween ---------- */
  function vibrato(o, t, rate, depth, dur) {
    const l = ctx.createOscillator(), g = ctx.createGain();
    l.frequency.value = rate; g.gain.value = depth; l.connect(g); g.connect(o.frequency); l.start(t); l.stop(t + dur + .1);
  }
  function voice(freq, t, dur, { type = "sine", vol = .2, to = null, vib = 0, rate = 6, filter = null } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    if (vib) vibrato(o, t, rate, vib, dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(.25, dur / 3)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    let n = o; if (filter) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filter; o.connect(f); n = f; }
    n.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
  }
  const SPOOKY = {
    // Gruselorgel in d-Moll + Donnergrollen + Theremin
    win(t) {
      noise(t, 2.2, { vol: .35, type: "lowpass", freq: 180, q: .7, attack: .3 });
      [146.83, 174.61, 220, 293.66].forEach(f => voice(f, t + .05, 1.9, { type: "sawtooth", vol: .07, vib: 2, rate: 5, filter: 1400 }));
      [[440, 415.3], [415.3, 392], [392, 369.99]].forEach(([a, b], i) => voice(a, t + .1 + i * .18, .2, { type: "square", vol: .05, to: b, filter: 1800 }));
      voice(880, t + .7, 1.4, { vol: .08, to: 520, vib: 18, rate: 7 });
    },
    removed(t) {   // Geist entwischt: Fauchen nach oben + Glitzern
      noise(t, .6, { vol: .25, freq: 600, freqTo: 6000, q: 3 });
      [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => tone(f, t + .25 + i * .08, .5, { type: "sine", vol: .16 }));
    },
    kept(t) {      // zwei Turmglocken
      [0, .55].forEach(d => { tone(146.83, t + d, 1.4, { type: "sine", vol: .3 }); tone(146.83 * 2.4, t + d, .9, { type: "sine", vol: .08 }); });
    },
    added(t) {     // Gespenst: „Buuuuh“
      voice(330, t, 1.5, { vol: .22, to: 196, vib: 14, rate: 5.5, filter: 1200 });
      voice(165, t + .05, 1.5, { type: "triangle", vol: .1, to: 98, vib: 7, rate: 5.5 });
      noise(t, 1.4, { vol: .06, type: "bandpass", freq: 700, q: 1.5, attack: .4 });
    },
  };

  /* ---------- Weihnachten ---------- */
  function sleighBells(t, dur, vol = .12) {
    for (let x = 0; x < dur; x += .11) {
      noise(t + x, .07, { vol: vol * (0.6 + Math.random() * .4), type: "highpass", freq: 6500, q: .8, attack: .002 });
      tone(2600 + Math.random() * 900, t + x, .06, { type: "sine", vol: vol * .4, attack: .002 });
    }
  }
  function bell(f, t, d = 1.2, v = .2) {
    tone(f, t, d, { type: "sine", vol: v, attack: .003 }); tone(f * 2.76, t, d * .5, { type: "sine", vol: v * .25, attack: .003 });
    tone(f * 5.4, t, d * .25, { type: "sine", vol: v * .1, attack: .003 });
  }
  const XMAS = {
    // Schellen + „Jingle Bells“ (E E E – E E E – E G C D E)
    win(t) {
      sleighBells(t, 2.2);
      const E = 659.25, G = 783.99, C = 523.25, D = 587.33, q = .17;
      [[E, 0], [E, 1], [E, 2], [E, 4], [E, 5], [E, 6], [E, 8], [G, 9], [C, 10], [D, 11], [E, 12]]
        .forEach(([f, k]) => bell(f, t + .1 + k * q, k === 12 ? 1.4 : .45, .18));
    },
    removed(t) { [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(f, t + i * .09, .9, .14)); sleighBells(t, .7, .08); },
    kept(t) { bell(523.25, t, 1.3, .2); bell(392, t + .35, 1.5, .2); },
    added(t) {   // „Ho ho ho“
      [0, .32, .64].forEach(d => {
        tone(110, t + d, .26, { type: "sawtooth", vol: .16, filter: 600, glideTo: 92 });
        noise(t + d, .2, { vol: .07, type: "bandpass", freq: 500, q: 2 });
      });
    },
  };

  /* ---------- Gewinn-Varianten ---------- */
  const WINS = {
    fanfare(t) {
      noise(t, 0.9, { vol: 0.3, type: "highpass", freq: 5000, q: 0.5 });
      tone(110, t, 0.35, { type: "sine", vol: 0.5, glideTo: 50 });
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, t + 0.08 + i * 0.09, 0.5, { type: "triangle", vol: 0.22 }));
      [523.25, 659.25, 783.99].forEach(f => tone(f, t + 0.5, 0.9, { type: "sawtooth", vol: 0.06, filter: 2200 }));
    },
    ding(t) {
      [[880, .3, 1.8], [880 * 2.76, .08, 0.9], [880 * 5.4, .04, 0.5]].forEach(([f, v, d]) => tone(f, t, d, { vol: v, attack: 0.003 }));
      [[1318.5, .22, 1.6], [1318.5 * 2.76, .06, 0.8]].forEach(([f, v, d]) => tone(f, t + 0.18, d, { vol: v, attack: 0.003 }));
    },
    applause(t) {
      for (let i = 0; i < 70; i++) {
        const at = t + Math.random() * 2.2 * Math.sqrt(Math.random());
        noise(at, 0.06, { vol: 0.12 * (1 - (at - t) / 2.6), type: "bandpass", freq: 900 + Math.random() * 1800, q: 1.2, attack: 0.002 });
      }
      tone(110, t, 0.3, { type: "sine", vol: 0.35, glideTo: 55 });
    },
    none() {},
  };

  return {
    TICKS: Object.keys(TICKS), WINS: Object.keys(WINS),
    get muted() { return muted; },
    get config() { return { ...cfg }; },
    hasCustom(kind) { return !!customRaw[kind]; },
    customInfo(kind) { return custom[kind] ? custom[kind].duration : null; },
    setSeason(s) { season = s; },
    configure(c) {
      Object.assign(cfg, c || {});
      if (master) master.gain.value = cfg.volume;
    },
    async setCustom(kind, arrayBuffer) {
      customRaw[kind] = arrayBuffer; custom[kind] = null;
      if (arrayBuffer && ac()) await decode(kind);
      return custom[kind] ? custom[kind].duration : null;
    },
    toggle() { muted = !muted; try { localStorage.setItem("muted", muted ? "1" : "0"); } catch (e) {} if (muted) { this.rollStop(); this.spinStop(); } return muted; },
    unlock() { ac(); },

    /** Drehbeginn / Geschwindigkeit / Ende – für lange eigene Dateien (Tonhöhe folgt der Geschwindigkeit) */
    spinStart() {
      if (muted || !ac() || cfg.tick !== "custom" || !customTickIsLoop()) return;
      this.spinStop();
      const { s, g } = playBuffer(custom.tick, { vol: 1 });
      s.loop = true; spinLoop = { s, g };
    },
    spinSpeed(sp) {
      if (!spinLoop) return;
      const t = ctx.currentTime;
      spinLoop.s.playbackRate.setTargetAtTime(0.55 + 0.6 * sp, t, 0.05);
      spinLoop.g.gain.setTargetAtTime(Math.max(0.05, Math.min(1, 0.25 + sp)), t, 0.05);
    },
    spinStop() {
      if (!spinLoop || !ctx) return;
      const r = spinLoop, t = ctx.currentTime; spinLoop = null;
      r.g.gain.cancelScheduledValues(t); r.g.gain.setTargetAtTime(0.0001, t, 0.06); r.s.stop(t + 0.4);
    },

    /** Klick des Zeigers an einer Segmentgrenze; speed 0..1 */
    tick(speed = 0.5, preset) {
      const kind = preset || cfg.tick;
      play(t => {
        if (kind === "custom") {
          if (custom.tick && !customTickIsLoop()) playBuffer(custom.tick, { vol: 0.5 + 0.5 * speed, rate: 0.92 + Math.random() * 0.12 });
          else if (!custom.tick) TICKS.ratchet(t, speed);
        } else (TICKS[kind] || TICKS.ratchet)(t, speed);
      });
    },

    /** Trommelwirbel während der spannenden Schlussphase */
    rollStart(duration) {
      if (muted || !cfg.roll || !ac()) return;
      this.rollStop();
      const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 420; f.Q.value = 0.9;
      const trem = ctx.createGain(); trem.gain.value = 0.5;
      const lfo = ctx.createOscillator(); lfo.frequency.setValueAtTime(14, t); lfo.frequency.linearRampToValueAtTime(24, t + duration);
      const lfoG = ctx.createGain(); lfoG.gain.value = 0.5; lfo.connect(lfoG); lfoG.connect(trem.gain);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.4);
      g.gain.linearRampToValueAtTime(0.34, t + duration);
      s.connect(f); f.connect(trem); trem.connect(g); g.connect(master);
      s.start(t); lfo.start(t);
      roll = { s, lfo, g };
    },
    rollStop() {
      if (!roll || !ctx) return;
      const t = ctx.currentTime, r = roll; roll = null;
      r.g.gain.cancelScheduledValues(t); r.g.gain.setTargetAtTime(0.0001, t, 0.03);
      r.s.stop(t + 0.2); r.lfo.stop(t + 0.2);
    },

    win(preset) {
      const kind = preset || cfg.win;
      play(t => {
        if (kind === "custom") { if (custom.win) playBuffer(custom.win); else WINS.fanfare(t); }
        else if (season === "halloween" && kind !== "none" && !preset) SPOOKY.win(t);
        else if (season === "christmas" && kind !== "none" && !preset) XMAS.win(t);
        else (WINS[kind] || WINS.fanfare)(t);
      });
    },
    removed() { if (season === "halloween") return play(t => SPOOKY.removed(t)); if (season === "christmas") return play(t => XMAS.removed(t)); play(t => [783.99, 1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(f, t + i * 0.07, 0.45, { type: "sine", vol: 0.2 }))); },
    kept() { if (season === "halloween") return play(t => SPOOKY.kept(t)); if (season === "christmas") return play(t => XMAS.kept(t)); play(t => { tone(659.25, t, 0.22, { type: "triangle", vol: 0.2 }); tone(659.25, t + 0.18, 0.3, { type: "triangle", vol: 0.2 }); }); },
    added() {
      if (season === "halloween") return play(t => SPOOKY.added(t));
      if (season === "christmas") return play(t => XMAS.added(t));
      play(t => [392, 370, 349.2, 329.6].forEach((f, i) =>
        tone(f, t + i * 0.28, i === 3 ? 0.9 : 0.3, { type: "sawtooth", vol: 0.12, filter: 900, glideTo: i === 3 ? 300 : null })));
    },
    shuffle() {
      play(t => {
        noise(t, 0.6, { vol: 0.3, freq: 400, freqTo: 4000, q: 2 });
        for (let i = 0; i < 8; i++) tone(500 + Math.random() * 900, t + 0.05 + i * 0.06, 0.05, { type: "triangle", vol: 0.08 });
      });
    },
    pop() { play(t => tone(500, t, 0.15, { type: "sine", vol: 0.3, glideTo: 1100 })); },
    click() { play(t => tone(900, t, 0.05, { type: "triangle", vol: 0.08 })); },

    /** Vorschau: simuliert ein auslaufendes Rad (ca. 3 s) */
    preview(preset) {
      if (muted || !ac()) return;
      const kind = preset || cfg.tick;
      if (kind === "custom" && customTickIsLoop()) {
        this.spinStart(); let sp = 1; const iv = setInterval(() => { sp *= 0.9; this.spinSpeed(sp); if (sp < 0.08) { clearInterval(iv); this.spinStop(); } }, 100);
        return;
      }
      let t = 0, gap = 0.045;
      while (t < 3.2) { const sp = Math.max(0, 1 - t / 3.2), at = t; setTimeout(() => this.tick(sp, kind), at * 1000); t += gap; gap *= 1.09; }
    },
  };
})();
