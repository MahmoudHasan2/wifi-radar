/* =========================================================
   Emberline RF-9 — cinematic scanner demo
   ---------------------------------------------------------
   EVERYTHING HERE IS A SCRIPTED SIMULATION.
   - The silhouettes are procedurally drawn shapes.
   - Target attributes are fixed strings from SCENARIOS below.
   - Wi-Fi readings are generated locally with noise functions.
   - The webcam (optional) is only drawn as a background image;
     it is never analysed, recorded, stored or transmitted.
   ========================================================= */
(() => {
  'use strict';

  /* ---------------- utilities ---------------- */

  const $ = (sel, root = document) => root.querySelector(sel);
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const rand = (a, b) => a + Math.random() * (b - a);
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const gray = (v) => { const g = v | 0; return `rgb(${g},${g},${g})`; };
  const MONO = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace';

  const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let reducedMotion = !!(motionQuery && motionQuery.matches);
  if (motionQuery) {
    const onMotionChange = (e) => { reducedMotion = e.matches; };
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
    else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);
  }

  /* ---------------- scenario scripts (fictional data) ---------------- */

  const SCENARIOS = {
    1: {
      id: 1, tag: 'TGT-01', name: 'SCENARIO 1',
      countdown: 3, acquire: 1.2, active: 15, exit: 3,
      motion: 'walk', female: false, heightCm: 175,
      profile: { sex: 'MALE', age: '30–35', height: '175 cm', weight: '70–75 kg', status: 'SIMULATED TRACKING' },
    },
    2: {
      id: 2, tag: 'TGT-02', name: 'SCENARIO 2',
      countdown: 0, acquire: 0, active: 10, exit: 1,
      motion: 'room', female: true, heightCm: 168,
      profile: { sex: 'FEMALE', age: '22', height: '168 cm', weight: '55 kg', status: 'SIMULATED TRACKING' },
    },
  };
  const PROFILE_KEYS = ['sex', 'age', 'height', 'weight', 'status'];

  /* ---------------- DOM ---------------- */

  const els = {
    app: $('#app'),
    stage: $('#stage'),
    thermal: $('#thermalCanvas'),
    countdown: $('#countdown'), cdNum: $('#cdNum'), cdRing: $('#cdRing'),
    stageMsg: $('#stageMsg'), stageMsgTitle: $('#stageMsgTitle'), stageMsgSub: $('#stageMsgSub'),
    statePill: $('#statePill'), statusDetail: $('#statusDetail'), progressFill: $('#progressFill'), statusTimer: $('#statusTimer'),
    hudFrame: $('#hudFrame'),
    chipScan: $('#chipScan'), chipView: $('#chipView'), chipCam: $('#chipCam'), chipAudio: $('#chipAudio'), clock: $('#clock'),
    camPanel: $('#camPanel'), video: $('#video'), camPlaceholder: $('#camPlaceholder'), camIndicator: $('#camIndicator'),
    camError: $('#camError'), btnCamStart: $('#btnCamStart'), btnCamStop: $('#btnCamStop'),
    targetPanel: $('#targetPanel'),
    tMotion: $('#tMotion'), tTrack: $('#tTrack'), tPos: $('#tPos'),
    gauge: $('#gaugeCanvas'), wave: $('#waveCanvas'), spec: $('#specCanvas'), radar: $('#radarCanvas'),
    qBars: [...document.querySelectorAll('#qBars i')], qLabel: $('#qLabel'), qPct: $('#qPct'),
    snrVal: $('#snrVal'), ppsVal: $('#ppsVal'), pktTotal: $('#pktTotal'),
    sweepFill: $('#sweepFill'), sweepPct: $('#sweepPct'), packetLog: $('#packetLog'), netInfo: $('#netInfo'),
    btnScan: $('#btnScan'), btnReset: $('#btnReset'), btnView: $('#btnView'), btnFull: $('#btnFull'),
    btnSound: $('#btnSound'), btnHelp: $('#btnHelp'),
    help: $('#help'), reveal: $('#reveal'), btnHelpClose: $('#btnHelpClose'), toast: $('#toast'),
  };
  const fieldEls = {};
  document.querySelectorAll('[data-f]').forEach((n) => { fieldEls[n.dataset.f] = n; });

  /* ---------------- app state ---------------- */

  const state = {
    scanning: true,
    scanView: true,
    muted: false,
    scenario: null, // runtime object of the active scenario, or null
    clean: false, // prank mode: on-screen simulation labels hidden (key P)
  };
  /** Returns the labelled text normally, or the plain text in prank mode. */
  const L = (simText, cleanText) => (state.clean ? cleanText : simText);

  /* =========================================================
     AUDIO (WebAudio, synthesized — no files)
     ========================================================= */

  const sfx = (() => {
    let ctx = null;
    let master = null;
    const live = new Set();

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try {
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = 0.16;
          master.connect(ctx.destination);
        } catch (e) { ctx = null; return null; }
      }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }

    function tone(f0, f1, dur, type = 'sine', vol = 0.5, delay = 0) {
      if (state.muted) return;
      const c = ensure();
      if (!c) return;
      const t0 = c.currentTime + delay;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t0);
      if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.03);
      live.add(osc);
      osc.onended = () => { live.delete(osc); osc.disconnect(); g.disconnect(); };
    }

    return {
      unlock: ensure,
      tick: () => tone(880, null, 0.09, 'square', 0.16),
      sweep: () => { tone(220, 1600, 1.1, 'sawtooth', 0.08); tone(110, 760, 1.1, 'sine', 0.22); },
      lock: () => { tone(1480, null, 0.07, 'square', 0.16); tone(1980, null, 0.09, 'square', 0.16, 0.09); },
      ping: () => tone(1250, 1170, 0.16, 'sine', 0.12),
      lost: () => tone(900, 180, 0.6, 'triangle', 0.16),
      blip: () => tone(640, null, 0.05, 'square', 0.07),
      stopAll: () => { live.forEach((o) => { try { o.stop(); } catch (e) { /* already stopped */ } }); live.clear(); },
    };
  })();

  /* =========================================================
     CANVAS SURFACES
     ========================================================= */

  function makeSurface(canvas, maxDpr = 2) {
    const s = { canvas, ctx: canvas.getContext('2d'), w: 1, h: 1, dpr: 1, maxDpr };
    resizeSurface(s);
    return s;
  }

  function resizeSurface(s) {
    const r = s.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, s.maxDpr);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w !== s.w || h !== s.h || dpr !== s.dpr || s.canvas.width === 300) {
      s.w = w; s.h = h; s.dpr = dpr;
      s.canvas.width = Math.round(w * dpr);
      s.canvas.height = Math.round(h * dpr);
    }
    s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const surf = {
    thermal: makeSurface(els.thermal, 2),
    cam: makeSurface(els.camPlaceholder, 1.5),
    gauge: makeSurface(els.gauge),
    wave: makeSurface(els.wave),
    spec: makeSurface(els.spec),
    radar: makeSurface(els.radar),
  };

  function resizeAll() {
    Object.values(surf).forEach(resizeSurface);
    if (!rafId) renderOnce();
  }

  /* =========================================================
     HEAT FIELD (low-res greyscale "temperature" buffer)
     Values 0–255 are mapped to an ironbow palette each frame.
     ========================================================= */

  const FW = 320;
  const FH = 200;
  const FLOOR = 156; // kept well inside the visible band when the field is cropped to wide panels

  const heat = document.createElement('canvas');
  heat.width = FW; heat.height = FH;
  const hctx = heat.getContext('2d', { willReadFrequently: true });

  const FILTER_OK = (() => {
    if (!('filter' in hctx)) return false;
    hctx.filter = 'blur(2px)';
    const ok = hctx.filter === 'blur(2px)';
    hctx.filter = 'none';
    return ok;
  })();

  function setBlur(c, px) {
    if (FILTER_OK) c.filter = px > 0 ? `blur(${px.toFixed(1)}px)` : 'none';
    else { c.shadowColor = 'rgba(180,180,180,0.6)'; c.shadowBlur = px * 1.6; }
  }
  function clearBlur(c) {
    if (FILTER_OK) c.filter = 'none';
    c.shadowBlur = 0;
  }

  const LUT = (() => {
    const stops = [
      [0.00, [4, 5, 10]], [0.12, [16, 10, 34]], [0.26, [48, 10, 78]], [0.40, [116, 16, 92]],
      [0.54, [196, 30, 48]], [0.66, [240, 84, 14]], [0.78, [255, 146, 22]], [0.90, [255, 206, 84]],
      [1.00, [255, 248, 226]],
    ];
    const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const f = i / 255;
      let k = 0;
      while (k < stops.length - 2 && f > stops[k + 1][0]) k++;
      const [f0, c0] = stops[k];
      const [f1, c1] = stops[k + 1];
      const t = clamp((f - f0) / (f1 - f0), 0, 1);
      lut[i * 3] = lerp(c0[0], c1[0], t);
      lut[i * 3 + 1] = lerp(c0[1], c1[1], t);
      lut[i * 3 + 2] = lerp(c0[2], c1[2], t);
    }
    return lut;
  })();

  const NOISE = (() => {
    const n = new Int8Array(8192);
    for (let i = 0; i < n.length; i++) n[i] = Math.round(rand(-7, 7));
    return n;
  })();

  /** Static "wall cross-section": studs, a warm pipe, cabling, an outlet. */
  const AMBIENT = (() => {
    const c = document.createElement('canvas');
    c.width = FW; c.height = FH;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, FH);
    bg.addColorStop(0, gray(27)); bg.addColorStop(0.7, gray(32)); bg.addColorStop(1, gray(42));
    g.fillStyle = bg;
    g.fillRect(0, 0, FW, FH);

    setBlur(g, 3);
    g.fillStyle = gray(40);
    [18, 98, 178, 258].forEach((x) => g.fillRect(x, 0, 9, FH));
    g.fillStyle = gray(36);
    g.fillRect(0, 96, FW, 6);

    setBlur(g, 2);
    g.strokeStyle = gray(98);
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(-5, 38); g.lineTo(226, 38);
    g.quadraticCurveTo(236, 38, 236, 48); g.lineTo(236, 132);
    g.stroke();
    g.strokeStyle = gray(54);
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(62, 0); g.lineTo(62, 146); g.stroke();

    setBlur(g, 3);
    g.fillStyle = gray(80);
    g.fillRect(57, 146, 10, 13);

    clearBlur(g);
    const duct = g.createRadialGradient(292, 10, 2, 292, 10, 64);
    duct.addColorStop(0, 'rgba(78,78,78,1)'); duct.addColorStop(1, 'rgba(78,78,78,0)');
    g.fillStyle = duct;
    g.fillRect(220, 0, 100, 80);
    const floor = g.createLinearGradient(0, FLOOR - 6, 0, FH);
    floor.addColorStop(0, 'rgba(60,60,60,0)'); floor.addColorStop(1, 'rgba(60,60,60,0.9)');
    g.fillStyle = floor;
    g.fillRect(0, FLOOR - 6, FW, FH - FLOOR + 6);
    return c;
  })();

  /** Low-frequency cloudy noise drawn with a slow drift for sensor "breathing". */
  const CLOUDS = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 40;
    const g = c.getContext('2d');
    const img = g.createImageData(c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rand(0, 64);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  })();

  function colorizeHeat(t) {
    const img = hctx.getImageData(0, 0, FW, FH);
    const d = img.data;
    const off = reducedMotion ? 0 : ((t * 997) | 0) & 8191;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      let v = d[i] + NOISE[(j + off) & 8191];
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      const o = v * 3;
      d[i] = LUT[o]; d[i + 1] = LUT[o + 1]; d[i + 2] = LUT[o + 2]; d[i + 3] = 255;
    }
    hctx.putImageData(img, 0, 0);
  }

  /* =========================================================
     PROCEDURAL FIGURES
     ========================================================= */

  const figHeight = (def) => FH * 0.46 * (def.heightCm / 175);

  // Scenario 1 walking speed profile (fractions of field width per second).
  const WALK = { v1: 0.1, v2: 0.07, vExit: 0.12, x0: -0.09 };
  function walkSpeed(t) {
    if (t < 4.5) return WALK.v1;
    if (t < 6.0) return WALK.v1 * (1 - smooth((t - 4.5) / 1.5));
    if (t < 9.5) return 0;
    if (t < 10.9) return WALK.v2 * smooth((t - 9.5) / 1.4);
    if (t < 15) return WALK.v2;
    return lerp(WALK.v2, WALK.vExit, smooth((t - 15) / 0.6));
  }
  // Scenario 2: walk to a table, stop and wipe it, turn, walk back.
  const ROOM = { x0: 0.36, v: 0.06, turnAt: 7.3 };
  function roomSpeed(t) {
    if (t < 2.6) return ROOM.v;
    if (t < 3.3) return ROOM.v * (1 - smooth((t - 2.6) / 0.7));
    if (t < ROOM.turnAt) return 0;
    if (t < ROOM.turnAt + 0.7) return -ROOM.v * smooth((t - ROOM.turnAt) / 0.7);
    return -ROOM.v;
  }

  /** Integrates a speed profile into a lookup table of x positions. */
  function buildPath(speedFn, x0, duration) {
    const step = 1 / 120;
    const n = Math.ceil(duration / step) + 2;
    const xs = new Float32Array(n);
    let x = x0;
    for (let i = 0; i < n; i++) { xs[i] = x; x += speedFn(i * step) * step; }
    return { xs, step };
  }
  function samplePath(path, t) {
    const f = clamp(t / path.step, 0, path.xs.length - 1.001);
    const i = f | 0;
    return lerp(path.xs[i], path.xs[i + 1], f - i);
  }
  const WALK_PATH = buildPath(walkSpeed, WALK.x0, 19);
  const ROOM_PATH = buildPath(roomSpeed, ROOM.x0, 12);

  /**
   * Builds a simple articulated pose in heat-field coordinates.
   * o: { cx, h, female, amp (0..1 walk), facing (0 side .. 1 front), walk (gait phase),
   *      dir, t, sway, headTurn, armIdle:[left,right] }
   */
  function buildPose(o) {
    const h = o.h;
    const female = !!o.female;
    const amp = o.amp || 0;
    const facing = o.facing == null ? 1 : o.facing;
    const dir = o.dir || 1;
    const ph = o.walk || 0;
    const t = o.t || 0;
    const sway = o.sway || 0;
    const armIdle = o.armIdle || [0, 0];
    const lean = o.lean || 0;
    const bend = o.bend || 0;

    const bob = -Math.cos(ph * 2) * 0.009 * h * amp;
    const top = FLOOR - h + bob;
    const Y = (f) => top + f * h;
    const breath = Math.sin(t * TAU / 4.2);
    const wide = lerp(0.58, 1, facing);

    const shW = (female ? 0.098 : 0.124) * h * wide;
    const waistW = (female ? 0.062 : 0.086) * h * wide;
    const hipW = (female ? 0.096 : 0.08) * h * wide;
    const hipX = o.cx + sway;
    const shX = o.cx + sway * 0.45 + lean;
    const headR = (female ? 0.058 : 0.062) * h;
    const head = {
      x: shX + sway * 0.15 + (o.headTurn || 0) * h * 0.012 + dir * (1 - facing) * 0.014 * h,
      y: Y(0.068) + bend * 0.07 * h,
      r: headR,
    };
    const shY = Y(0.185) - breath * 0.003 * h + bend * 0.06 * h;
    const waistY = Y(0.38);
    const hipY = Y(0.53);

    const thigh = 0.235 * h;
    const shin = 0.232 * h;
    const legs = [-1, 1].map((s) => {
      const p = ph + (s > 0 ? 0 : Math.PI);
      const a1 = amp * 0.42 * Math.sin(p) * dir + s * 0.03 * facing * (1 - amp);
      const bend = amp * 0.7 * Math.max(0, Math.cos(p));
      const a2 = a1 - bend * dir;
      const hip = { x: hipX + s * hipW * 0.55, y: hipY };
      const knee = { x: hip.x + Math.sin(a1) * thigh, y: hip.y + Math.cos(a1) * thigh };
      const ankle = { x: knee.x + Math.sin(a2) * shin, y: knee.y + Math.cos(a2) * shin };
      const foot = { x: ankle.x + dir * (1 - facing) * 0.05 * h + s * facing * 0.016 * h, y: ankle.y + 0.012 * h };
      return { hip, knee, ankle, foot };
    });

    const upper = 0.16 * h;
    const fore = 0.15 * h;
    const arms = [-1, 1].map((s, i) => {
      const p = ph + (s > 0 ? Math.PI : 0);
      let a1 = amp * 0.36 * Math.sin(p) * dir + s * ((female ? 0.07 : 0.09) + armIdle[i]) * facing;
      let a2 = a1 + dir * (1 - facing) * (0.18 + amp * 0.3 * Math.max(0, Math.sin(p))) - s * 0.03 * facing + s * armIdle[i] * 0.6;
      const ov = o.armPose && o.armPose[i];
      if (ov && ov.w > 0) { a1 = lerp(a1, ov.a1 * dir, ov.w); a2 = lerp(a2, ov.a2 * dir, ov.w); }
      const sh = { x: shX + s * shW * 0.9, y: shY + 0.012 * h };
      const elbow = { x: sh.x + Math.sin(a1) * upper, y: sh.y + Math.cos(a1) * upper };
      const wrist = { x: elbow.x + Math.sin(a2) * fore, y: elbow.y + Math.cos(a2) * fore };
      return { sh, elbow, wrist };
    });

    return { h, female, head, shX, shY, shW, waistY, waistW, hipX, hipY, hipW, legs, arms,
      chest: { x: lerp(shX, hipX, 0.25), y: Y(0.29) } };
  }

  function seg(c, a, b, w) {
    c.lineWidth = w;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  }

  /** Draws the body as greyscale "temperature" shapes. k scales limb widths. */
  function drawSilhouette(c, P, k, tone) {
    const h = P.h;
    c.lineCap = 'round';
    c.lineJoin = 'round';

    c.strokeStyle = gray(tone.limb);
    for (const L of P.legs) {
      seg(c, L.hip, L.knee, (P.female ? 0.086 : 0.084) * h * k);
      seg(c, L.knee, L.ankle, 0.06 * h * k);
    }
    c.strokeStyle = gray(tone.ext);
    for (const L of P.legs) seg(c, L.ankle, L.foot, 0.036 * h * k);

    c.strokeStyle = gray(tone.limb);
    for (const A of P.arms) {
      seg(c, A.sh, A.elbow, 0.05 * h * k);
      seg(c, A.elbow, A.wrist, 0.04 * h * k);
    }
    c.fillStyle = gray(tone.ext);
    for (const A of P.arms) { c.beginPath(); c.arc(A.wrist.x, A.wrist.y, 0.026 * h * k, 0, TAU); c.fill(); }

    // torso
    const wm = lerp(P.shX, P.hipX, 0.6);
    const kk = (k - 1) * 0.04 * h;
    c.fillStyle = gray(tone.core);
    c.beginPath();
    c.moveTo(P.shX - P.shW - kk, P.shY);
    c.quadraticCurveTo(P.shX, P.shY - 0.02 * h - kk, P.shX + P.shW + kk, P.shY);
    c.quadraticCurveTo(wm + P.waistW * 1.15 + kk, P.waistY - 0.05 * h, wm + P.waistW + kk, P.waistY);
    c.quadraticCurveTo(P.hipX + P.hipW * 1.05 + kk, P.hipY - 0.06 * h, P.hipX + P.hipW + kk, P.hipY + 0.02 * h);
    c.lineTo(P.hipX - P.hipW - kk, P.hipY + 0.02 * h);
    c.quadraticCurveTo(P.hipX - P.hipW * 1.05 - kk, P.hipY - 0.06 * h, wm - P.waistW - kk, P.waistY);
    c.quadraticCurveTo(wm - P.waistW * 1.15 - kk, P.waistY - 0.05 * h, P.shX - P.shW - kk, P.shY);
    c.closePath();
    c.fill();
    for (const A of P.arms) { c.beginPath(); c.arc(A.sh.x, A.sh.y, 0.04 * h * k, 0, TAU); c.fill(); }

    // neck
    c.strokeStyle = gray(tone.core);
    seg(c, { x: P.head.x, y: P.head.y + P.head.r * 0.6 }, { x: P.shX, y: P.shY }, 0.045 * h * k);

    // hair (cooler mass) then head
    if (P.female) {
      c.fillStyle = gray(tone.hair);
      c.beginPath();
      c.ellipse(P.head.x, P.head.y + P.head.r * 0.85, P.head.r * 1.18 * k, P.head.r * 1.9, 0, 0, TAU);
      c.fill();
    }
    c.fillStyle = gray(tone.core);
    c.beginPath();
    c.ellipse(P.head.x, P.head.y, P.head.r * k * 0.92, P.head.r * k * 1.08, 0, 0, TAU);
    c.fill();
  }

  function drawFigure(c, P, alpha) {
    if (alpha <= 0.002) return;
    const h = P.h;
    c.save();
    c.globalAlpha = alpha;
    // 1) warm halo
    setBlur(c, h * 0.06);
    drawSilhouette(c, P, 1.7, { core: 140, limb: 124, ext: 108, hair: 104 });
    // 2) body
    setBlur(c, h * 0.016);
    drawSilhouette(c, P, 1, { core: 212, limb: 194, ext: 166, hair: 150 });
    // 3) hot spots: face, neck, chest, armpits
    setBlur(c, h * 0.035);
    c.fillStyle = gray(255);
    c.beginPath(); c.ellipse(P.head.x, P.head.y + P.head.r * 0.15, P.head.r * 0.72, P.head.r * 0.78, 0, 0, TAU); c.fill();
    c.fillStyle = gray(244);
    c.beginPath(); c.ellipse(P.chest.x, P.chest.y, P.shW * 0.62, h * 0.085, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(P.shX, P.shY - 0.01 * h, 0.03 * h, 0.03 * h, 0, 0, TAU); c.fill();
    clearBlur(c);
    c.restore();
  }

  function poseBounds(P) {
    let x0 = P.shX - P.shW;
    let x1 = P.shX + P.shW;
    const pts = [P.head];
    P.legs.forEach((l) => pts.push(l.knee, l.ankle, l.foot));
    P.arms.forEach((a) => pts.push(a.elbow, a.wrist));
    for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; }
    const minW = P.h * 0.3;
    const cx = (x0 + x1) / 2;
    const half = Math.max((x1 - x0) / 2, minW / 2) + P.h * 0.05;
    const top = P.head.y - P.head.r - P.h * 0.05;
    const bottom = FLOOR + P.h * 0.03;
    return { x: cx - half, y: top, w: half * 2, h: bottom - top };
  }

  /** Scenario 1: walk in from the left, pause and look around, continue, exit right. */
  function walkFigure(rt, tm, phase, pt) {
    const def = rt.def;
    const h = figHeight(def);
    const xN = samplePath(WALK_PATH, tm);
    const v = walkSpeed(tm);
    const amp = clamp(v / WALK.v1, 0, 1);
    const facing = 1 - smooth(amp * 1.25);
    const cx = xN * FW;
    const stride = 0.42 * h;
    const look = tm > 5.6 && tm < 10.4
      ? Math.sin((tm - 5.6) * 1.35) * smooth((tm - 5.6) / 0.8) * (1 - smooth((tm - 9.4) / 0.9))
      : 0;
    const pose = buildPose({
      cx, h, female: false, amp, facing, dir: 1, walk: (cx / stride) * TAU, t: tm,
      headTurn: look * 1.6, sway: Math.sin(tm * 1.1) * 0.006 * h * facing,
    });

    let alpha = 1;
    let overlay = 1;
    if (phase === 'active') alpha = smooth(pt / 0.5);
    if (phase === 'exit') {
      alpha = 1 - smooth((pt - 1.2) / (def.exit - 1.2));
      overlay = 1 - smooth(pt / 1.3);
    }
    const edgeVis = Math.min(smooth((cx + 10) / 30), smooth((FW + 10 - cx) / 30));
    overlay *= edgeVis;
    return { pose, alpha, overlay, speed: v, motion: 0.25 + amp * 0.75, nx: clamp(xN, 0, 1),
      moving: v > 0.01 ? 'WALKING' : (Math.abs(look) > 0.2 ? 'STATIONARY · HEAD TURN' : 'STATIONARY') };
  }

  /** Table used in scenario 2, placed just ahead of where the figure stops. */
  const TABLE = (() => {
    const h = figHeight(SCENARIOS[2]);
    const stopX = samplePath(ROOM_PATH, 5) * FW;
    return { x0: stopX + 0.17 * h, x1: stopX + 0.85 * h, top: FLOOR - 0.5 * h, h };
  })();

  function drawTable(c, alpha, wipeHeat) {
    c.save();
    c.globalAlpha = alpha;
    setBlur(c, 1.2);
    c.fillStyle = gray(78);
    c.fillRect(TABLE.x0, TABLE.top, TABLE.x1 - TABLE.x0, 3);
    c.fillRect(TABLE.x0 + 3, TABLE.top + 3, 3, FLOOR - TABLE.top - 3);
    c.fillRect(TABLE.x1 - 6, TABLE.top + 3, 3, FLOOR - TABLE.top - 3);
    if (wipeHeat > 0.01) {
      // faint residual warmth where the surface was wiped
      setBlur(c, 3);
      c.globalAlpha = alpha * wipeHeat;
      c.fillStyle = gray(120);
      c.beginPath();
      c.ellipse(TABLE.x0 + TABLE.h * 0.12, TABLE.top + 1, TABLE.h * 0.1, 2.5, 0, 0, TAU);
      c.fill();
    }
    clearBlur(c);
    c.restore();
  }

  /** Scenario 2: walks across the room to a table, wipes it, turns and walks back. */
  function roomFigure(rt, tm, phase, pt) {
    const def = rt.def;
    const h = figHeight(def);
    const xN = samplePath(ROOM_PATH, tm);
    const v = roomSpeed(tm);
    const amp = clamp(Math.abs(v) / ROOM.v, 0, 1);
    const dir = tm < ROOM.turnAt ? 1 : -1;
    const wipe = smooth((tm - 3.1) / 0.5) * (1 - smooth((tm - 6.8) / 0.5));
    const turn = Math.exp(-Math.pow((tm - ROOM.turnAt) / 0.35, 2));
    const facing = clamp(lerp(0.1, 0.25, wipe) + turn * 0.75 - amp * 0.1, 0, 1);
    const cx = xN * FW;
    const st = tm * 4.2;
    const armPose = [null, { a1: 0.65 + 0.28 * Math.sin(st), a2: 0.95 + 0.22 * Math.cos(st), w: wipe }];
    const pose = buildPose({
      cx, h, female: true, amp, facing, dir, walk: (cx / (0.42 * h)) * TAU, t: tm,
      lean: dir * wipe * 0.06 * h + Math.sin(st) * wipe * 0.012 * h,
      bend: wipe, headTurn: wipe * Math.sin(tm * 0.9) * 0.4, armPose,
    });

    let alpha = 1;
    if (phase === 'active') alpha = smooth(pt / 0.6);
    if (phase === 'exit') alpha = 1 - smooth(pt / def.exit);
    const wipeHeat = clamp((tm - 3.4) / 3, 0, 1) * (1 - clamp((tm - 7.5) / 2.5, 0, 1) * 0.6);
    return { pose, alpha, overlay: alpha, speed: Math.abs(v), motion: 0.3 + amp * 0.4 + wipe * 0.3, nx: clamp(xN, 0, 1),
      table: alpha, wipeHeat,
      moving: wipe > 0.5 ? 'WIPING SURFACE' : turn > 0.5 ? 'TURNING' : amp > 0.1 ? 'WALKING' : 'STATIONARY' };
  }

  /* =========================================================
     SCENARIO ENGINE
     All timing derives from performance.now() inside the single
     render loop — no setTimeout chains, so nothing can duplicate.
     ========================================================= */

  function phaseOf(def, e) {
    let t = e;
    if (t < def.countdown) return ['countdown', t];
    t -= def.countdown;
    if (t < def.acquire) return ['acquire', t];
    t -= def.acquire;
    if (t < def.active) return ['active', t];
    t -= def.active;
    if (t < def.exit) return ['exit', t];
    return ['done', t];
  }

  const totalDuration = (def) => def.countdown + def.acquire + def.active + def.exit;

  function startScenario(id) {
    const def = SCENARIOS[id];
    if (!def) return;
    if (!state.scanView) { toast('Scan view is off · press V to enable it first'); return; }
    stopScenario(null, true); // cancel & clean any previous scenario first
    if (!state.scanning) setScanning(true);
    sfx.unlock();
    state.scenario = {
      def,
      start: performance.now(),
      phase: null,
      lastCount: -1,
      nextPing: 0,
      lockStart: null,
      box: null,
      trail: [],
      trailAt: 0,
      decodeStart: 0,
      decoded: true,
      lastFigure: null,
    };
    refreshControls();
    startLoop();
  }

  /** Cancels the active scenario immediately. Returns true if one was running. */
  function stopScenario(reason, quiet) {
    if (!state.scenario) return false;
    state.scenario = null;
    sfx.stopAll();
    showCountdown(false);
    clearProfile();
    if (reason) setStatus('STANDBY', reason, 'standby');
    if (!quiet) sfx.lost();
    refreshControls();
    if (!rafId) renderOnce();
    return true;
  }

  function finishScenario() {
    state.scenario = null;
    clearProfile();
    showCountdown(false);
    setStatus('STANDBY', L('Scene complete · awaiting operator', 'Target lost · awaiting operator'), 'standby');
    refreshControls();
  }

  function onPhaseEnter(rt, phase, now) {
    const d = rt.def;
    switch (phase) {
      case 'countdown':
        showCountdown(true);
        setStatus('COUNTDOWN', L(`${d.name} · scripted scene starting`, 'Initiating sweep'), 'countdown');
        break;
      case 'acquire':
        showCountdown(false);
        setStatus('ACQUIRING', L('Simulated sweep in progress', 'Sweep in progress'), 'acquire');
        sfx.sweep();
        break;
      case 'active':
        showCountdown(false);
        setStatus('TRACKING', L(`${d.name} · simulated tracking · fictional data`, 'Target locked · tracking'), 'tracking');
        showProfile(rt, now);
        rt.nextPing = now + 900;
        break;
      case 'exit':
        setStatus('SIGNAL FADE', d.motion === 'walk' ? L('Target leaving simulated field', 'Target leaving field') : L('Scene ending · clearing overlays', 'Signal lost'), 'acquire');
        els.targetPanel.classList.add('is-fading');
        sfx.lost();
        break;
      default:
        break;
    }
  }

  /** Advances the active scenario; returns per-frame info, or null when it ended. */
  function updateScenario(rt, now, dt) {
    const def = rt.def;
    const e = (now - rt.start) / 1000;
    const [phase, pt] = phaseOf(def, e);

    if (phase !== rt.phase) {
      rt.phase = phase;
      if (phase === 'done') { finishScenario(); return null; }
      onPhaseEnter(rt, phase, now);
    }

    if (phase === 'countdown') {
      const n = Math.ceil(def.countdown - pt);
      if (n !== rt.lastCount) { rt.lastCount = n; els.cdNum.textContent = String(n); sfx.tick(); }
      els.cdRing.style.strokeDashoffset = String(339.29 * (pt % 1));
    }

    let fig = null;
    if (phase === 'active' || phase === 'exit') {
      const tm = phase === 'active' ? pt : def.active + pt;
      fig = def.motion === 'walk' ? walkFigure(rt, tm, phase, pt) : roomFigure(rt, tm, phase, pt);
      fig.bounds = poseBounds(fig.pose);
      fig.trackTime = tm;

      // smoothed tracking box
      if (!rt.box) rt.box = { ...fig.bounds };
      else {
        const k = 1 - Math.exp(-dt * 9);
        rt.box.x = lerp(rt.box.x, fig.bounds.x, k);
        rt.box.y = lerp(rt.box.y, fig.bounds.y, k);
        rt.box.w = lerp(rt.box.w, fig.bounds.w, k);
        rt.box.h = lerp(rt.box.h, fig.bounds.h, k);
      }
      if (rt.lockStart == null && fig.overlay > 0.3 && phase === 'active') { rt.lockStart = now; sfx.lock(); }
      fig.lockT = rt.lockStart == null ? 0 : (now - rt.lockStart) / 1000;

      // footprint trail (scenario 1)
      if (def.motion === 'walk' && now >= rt.trailAt) {
        rt.trailAt = now + 220;
        rt.trail.push({ x: fig.pose.hipX, born: now });
        if (rt.trail.length > 36) rt.trail.shift();
      }
      if (phase === 'active' && rt.lockStart != null && now >= rt.nextPing) { rt.nextPing = now + 1400; sfx.ping(); }
    }

    return { rt, phase, pt, e, fig, total: totalDuration(def) };
  }

  /* =========================================================
     THERMAL PANEL RENDERING
     ========================================================= */

  function coverMap(w, h) {
    const k = Math.max(w / FW, h / FH);
    return { k, ox: (w - FW * k) / 2, oy: (h - FH * k) / 2 };
  }

  function drawCameraIntoHeat() {
    const v = els.video;
    if (!cam.stream || v.readyState < 2 || !v.videoWidth) return;
    const k = Math.max(FW / v.videoWidth, FH / v.videoHeight);
    const w = v.videoWidth * k;
    const h = v.videoHeight * k;
    hctx.save();
    hctx.globalAlpha = FILTER_OK ? 0.6 : 0.35;
    if (FILTER_OK) hctx.filter = 'grayscale(1) contrast(1.15) brightness(0.6)';
    hctx.drawImage(v, (FW - w) / 2, (FH - h) / 2, w, h);
    hctx.restore();
  }

  function drawThermal(t, fi) {
    const s = surf.thermal;
    const c = s.ctx;
    const w = s.w;
    const h = s.h;
    c.clearRect(0, 0, w, h);

    if (!state.scanView) {
      // view disabled: nothing of the scene, just an empty dark frame
      c.fillStyle = '#060608';
      c.fillRect(0, 0, w, h);
      return;
    }

    // ---- build the heat field ----
    hctx.save();
    hctx.globalAlpha = 1;
    hctx.globalCompositeOperation = 'source-over';
    hctx.drawImage(AMBIENT, 0, 0);
    hctx.globalAlpha = 0.22;
    hctx.imageSmoothingEnabled = true;
    const drift = reducedMotion ? 0 : t;
    hctx.drawImage(CLOUDS, -FW * 0.5 + Math.sin(drift * 0.05) * FW * 0.45, -FH * 0.5 + Math.cos(drift * 0.037) * FH * 0.45, FW * 2, FH * 2);
    hctx.restore();
    drawCameraIntoHeat();
    if (fi && fi.fig && fi.fig.table) drawTable(hctx, fi.fig.table, fi.fig.wipeHeat);
    if (fi && fi.fig) drawFigure(hctx, fi.fig.pose, fi.fig.alpha);
    colorizeHeat(t);

    // ---- blit to screen ----
    const m = coverMap(w, h);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(heat, m.ox, m.oy, FW * m.k, FH * m.k);

    drawStageGrid(c, w, h, t);
    if (state.scanning) {
      const busy = fi && (fi.phase === 'active' || fi.phase === 'exit');
      drawSweep(c, w, h, t, busy ? 0.35 : 1);
    }
    if (fi && fi.phase === 'acquire') drawAcquire(c, w, h, fi.pt, fi.rt.def.acquire, t);
    if (fi && fi.fig) drawTargetOverlay(c, w, h, m, fi, t);

    // vignette
    const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = vg;
    c.fillRect(0, 0, w, h);
  }

  function drawStageGrid(c, w, h, t) {
    c.save();
    const step = Math.max(40, Math.round(w / 16));
    c.strokeStyle = 'rgba(255,170,80,0.06)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = step; x < w; x += step) { c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, h); }
    for (let y = step; y < h; y += step) { c.moveTo(0, Math.round(y) + 0.5); c.lineTo(w, Math.round(y) + 0.5); }
    c.stroke();

    // top bearing ruler
    c.strokeStyle = 'rgba(255,190,120,0.45)';
    c.fillStyle = 'rgba(255,200,140,0.55)';
    c.font = `9px ${MONO}`;
    c.textAlign = 'center';
    c.beginPath();
    for (let i = 0; i <= 40; i++) {
      const x = w * 0.2 + (w * 0.6 * i) / 40;
      const major = i % 10 === 0;
      c.moveTo(x + 0.5, 36); c.lineTo(x + 0.5, 36 + (major ? 8 : 4));
      if (major) c.fillText(`${(i - 20) * 2}°`, x, 56);
    }
    c.stroke();

    // left range ruler
    c.textAlign = 'left';
    c.beginPath();
    for (let i = 0; i <= 20; i++) {
      const y = h * 0.18 + (h * 0.64 * i) / 20;
      const major = i % 5 === 0;
      c.moveTo(12, y + 0.5); c.lineTo(12 + (major ? 8 : 4), y + 0.5);
      if (major) c.fillText(`${(8 - i * 0.4).toFixed(0)}m`, 24, y + 3);
    }
    c.stroke();

    // centre cross
    const cx = w / 2;
    const cy = h / 2;
    c.strokeStyle = 'rgba(255,200,140,0.35)';
    c.beginPath();
    c.moveTo(cx - 14, cy + 0.5); c.lineTo(cx - 5, cy + 0.5);
    c.moveTo(cx + 5, cy + 0.5); c.lineTo(cx + 14, cy + 0.5);
    c.moveTo(cx + 0.5, cy - 14); c.lineTo(cx + 0.5, cy - 5);
    c.moveTo(cx + 0.5, cy + 5); c.lineTo(cx + 0.5, cy + 14);
    c.stroke();

    // frame brackets
    const L = 26;
    const p = 8;
    c.strokeStyle = 'rgba(255,179,71,0.55)';
    c.lineWidth = 1.5;
    brackets(c, p, p, w - p * 2, h - p * 2, L);
    c.restore();
  }

  function brackets(c, x, y, w, h, L) {
    c.beginPath();
    c.moveTo(x, y + L); c.lineTo(x, y); c.lineTo(x + L, y);
    c.moveTo(x + w - L, y); c.lineTo(x + w, y); c.lineTo(x + w, y + L);
    c.moveTo(x + w, y + h - L); c.lineTo(x + w, y + h); c.lineTo(x + w - L, y + h);
    c.moveTo(x + L, y + h); c.lineTo(x, y + h); c.lineTo(x, y + h - L);
    c.stroke();
  }

  function drawSweep(c, w, h, t, intensity) {
    if (reducedMotion) return;
    const period = 3.6;
    const p = (t % period) / period;
    const x = p * (w + 160) - 80;
    const g = c.createLinearGradient(x - 140, 0, x, 0);
    g.addColorStop(0, 'rgba(255,150,40,0)');
    g.addColorStop(1, `rgba(255,170,60,${0.1 * intensity})`);
    c.fillStyle = g;
    c.fillRect(x - 140, 0, 140, h);
    c.fillStyle = `rgba(255,214,150,${0.5 * intensity})`;
    c.fillRect(x, 0, 1.5, h);
  }

  function drawAcquire(c, w, h, pt, dur, t) {
    const p = smooth(pt / dur);
    const x = p * w;
    c.save();
    const g = c.createLinearGradient(x - 90, 0, x + 10, 0);
    g.addColorStop(0, 'rgba(79,227,255,0)');
    g.addColorStop(0.9, 'rgba(79,227,255,0.22)');
    g.addColorStop(1, 'rgba(79,227,255,0)');
    c.fillStyle = g;
    c.fillRect(x - 90, 0, 100, h);
    c.fillStyle = 'rgba(180,245,255,0.9)';
    c.fillRect(x, 0, 2, h);

    // flickering candidate boxes
    if (!reducedMotion) {
      const n = 4;
      c.strokeStyle = 'rgba(79,227,255,0.5)';
      c.lineWidth = 1;
      for (let i = 0; i < n; i++) {
        const seed = Math.floor(t * 8) + i * 17;
        const bx = ((seed * 73) % 100) / 100 * w * 0.8 + w * 0.1;
        const by = ((seed * 41) % 100) / 100 * h * 0.5 + h * 0.2;
        if (bx < x) c.strokeRect(bx, by, 28 + (seed % 30), 36 + (seed % 24));
      }
    }
    c.font = `600 12px ${MONO}`;
    c.textAlign = 'center';
    c.fillStyle = 'rgba(79,227,255,0.95)';
    c.fillText(L('ACQUIRING · SIMULATED SWEEP', 'ACQUIRING'), w / 2, h * 0.32);
    c.font = `10px ${MONO}`;
    c.fillStyle = 'rgba(200,240,255,0.7)';
    c.fillText(`${Math.round(p * 100)}%`, w / 2, h * 0.32 + 18);
    c.restore();
  }

  function drawTargetOverlay(c, w, h, m, fi, t) {
    const { fig, rt } = fi;
    const a = fig.overlay;
    if (a <= 0.01 || !rt.box) return;
    const fx = (x) => m.ox + x * m.k;
    const fy = (y) => m.oy + y * m.k;

    const lk = 1 - smooth(fig.lockT / 0.55);
    const grow = lk * 70;
    const x = fx(rt.box.x) - grow;
    const y = fy(rt.box.y) - grow;
    const bw = rt.box.w * m.k + grow * 2;
    const bh = rt.box.h * m.k + grow * 2;
    if (x > w || x + bw < 0) return;

    const flick = lk > 0.02 && !reducedMotion ? (Math.sin(t * 80) > 0 ? 1 : 0.35) : 1;
    const amber = '#ffb347';
    const cyan = '#4fe3ff';

    c.save();
    c.globalAlpha = a * flick;

    // box
    c.fillStyle = 'rgba(255,140,40,0.045)';
    c.fillRect(x, y, bw, bh);
    c.setLineDash([3, 5]);
    c.strokeStyle = 'rgba(255,179,71,0.35)';
    c.lineWidth = 1;
    c.strokeRect(x + 0.5, y + 0.5, bw, bh);
    c.setLineDash([]);
    c.strokeStyle = amber;
    c.lineWidth = 2;
    c.shadowColor = 'rgba(255,150,40,0.7)';
    c.shadowBlur = 8;
    brackets(c, x, y, bw, bh, Math.min(bw, bh) * 0.18);
    c.shadowBlur = 0;

    // label
    const label = `${rt.def.tag} · ${rt.def.profile.sex}${L(' · SIM', '')}`;
    c.font = `600 11px ${MONO}`;
    c.textAlign = 'left';
    const tw = c.measureText(label).width + 12;
    const ly = Math.max(y - 18, 4);
    c.fillStyle = amber;
    c.fillRect(x, ly, tw, 15);
    c.fillStyle = '#160d04';
    c.fillText(label, x + 6, ly + 11);
    c.font = `10px ${MONO}`;
    c.fillStyle = amber;
    c.fillText(`${L('SIMULATED TRACKING', 'TRACKING')} · T+${fig.trackTime.toFixed(1)}s`, x + tw + 8, ly + 11);

    // crosshair lines to the frame
    const P = fig.pose;
    const rx = fx(P.chest.x);
    const ry = fy(P.chest.y);
    const R = clamp(bw * 0.4, 18, 64);
    c.strokeStyle = 'rgba(79,227,255,0.2)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, ry + 0.5); c.lineTo(rx - R * 1.25, ry + 0.5);
    c.moveTo(rx + R * 1.25, ry + 0.5); c.lineTo(w, ry + 0.5);
    c.moveTo(rx + 0.5, 0); c.lineTo(rx + 0.5, ry - R * 1.25);
    c.moveTo(rx + 0.5, ry + R * 1.25); c.lineTo(rx + 0.5, h);
    c.stroke();
    c.fillStyle = cyan;
    c.font = `9.5px ${MONO}`;
    c.fillText(`X ${fig.nx.toFixed(3)}`, rx + 5, h - 34);
    c.fillText(`Y ${(P.chest.y / FH).toFixed(3)}`, 44, ry - 5);

    // reticle
    const spin = reducedMotion ? 0 : t * 0.9;
    c.strokeStyle = cyan;
    c.lineWidth = 1.5;
    c.shadowColor = 'rgba(79,227,255,0.7)';
    c.shadowBlur = 6;
    for (let i = 0; i < 4; i++) {
      const s0 = spin + (i * TAU) / 4;
      c.beginPath(); c.arc(rx, ry, R, s0, s0 + TAU / 4 - 0.45); c.stroke();
    }
    c.shadowBlur = 0;
    c.lineWidth = 1;
    c.globalAlpha = a * flick * 0.6;
    c.beginPath(); c.arc(rx, ry, R * 0.55, -spin * 1.6, -spin * 1.6 + TAU * 0.8); c.stroke();
    c.globalAlpha = a * flick;
    c.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = (i * TAU) / 4;
      c.moveTo(rx + Math.cos(ang) * R * 0.72, ry + Math.sin(ang) * R * 0.72);
      c.lineTo(rx + Math.cos(ang) * R * 1.15, ry + Math.sin(ang) * R * 1.15);
    }
    c.stroke();
    c.fillStyle = cyan;
    c.beginPath(); c.arc(rx, ry, 2, 0, TAU); c.fill();

    if (rt.def.motion === 'walk') drawWalkMarkers(c, fx, fy, fig, rt, t);
    else drawJointMarkers(c, fx, fy, fig, x, bw, t);
    c.restore();
  }

  function drawWalkMarkers(c, fx, fy, fig, rt, t) {
    const now = performance.now();
    const gy = fy(FLOOR + 2);
    c.fillStyle = '#ff7a1a';
    for (const p of rt.trail) {
      const age = (now - p.born) / 8000;
      if (age >= 1) continue;
      c.globalAlpha = fig.overlay * (1 - age) * 0.8;
      c.fillRect(fx(p.x) - 1.5, gy - 1.5, 3, 3);
    }
    c.globalAlpha = fig.overlay;
    // heading vector
    if (fig.speed > 0.01) {
      const x0 = fx(fig.pose.hipX);
      const len = 30 + fig.speed * 500;
      c.strokeStyle = '#4fe3ff';
      c.setLineDash([4, 4]);
      c.lineDashOffset = reducedMotion ? 0 : -t * 20;
      c.beginPath(); c.moveTo(x0, gy); c.lineTo(x0 + len, gy); c.stroke();
      c.setLineDash([]);
      c.beginPath(); c.moveTo(x0 + len, gy); c.lineTo(x0 + len - 7, gy - 4); c.lineTo(x0 + len - 7, gy + 4); c.closePath();
      c.fillStyle = '#4fe3ff'; c.fill();
      c.font = `9.5px ${MONO}`;
      c.fillText(L('HEADING (SIM)', 'HEADING'), x0 + len + 6, gy + 3);
    }
  }

  function drawJointMarkers(c, fx, fy, fig, bx, bw, t) {
    const P = fig.pose;
    const pts = [
      ['HEAD', P.head], ['L.SH', P.arms[0].sh], ['R.SH', P.arms[1].sh],
      ['L.HIP', P.legs[0].hip], ['R.HIP', P.legs[1].hip],
      ['L.KN', P.legs[0].knee], ['R.KN', P.legs[1].knee],
      ['L.HD', P.arms[0].wrist], ['R.HD', P.arms[1].wrist],
    ];
    c.strokeStyle = '#4fe3ff';
    c.fillStyle = '#4fe3ff';
    c.lineWidth = 1;
    const pulse = reducedMotion ? 1 : 0.75 + 0.25 * Math.sin(t * 5);
    for (const [, p] of pts) {
      const x = fx(p.x);
      const y = fy(p.y);
      const r = 3.5 * pulse;
      c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.stroke();
    }
    // skeleton links
    c.globalAlpha *= 0.4;
    c.beginPath();
    const link = (a, b) => { c.moveTo(fx(a.x), fy(a.y)); c.lineTo(fx(b.x), fy(b.y)); };
    link(P.arms[0].sh, P.arms[1].sh); link(P.legs[0].hip, P.legs[1].hip);
    link(P.arms[0].sh, P.legs[0].hip); link(P.arms[1].sh, P.legs[1].hip);
    link(P.legs[0].hip, P.legs[0].knee); link(P.legs[1].hip, P.legs[1].knee);
    link(P.arms[0].sh, P.arms[0].wrist); link(P.arms[1].sh, P.arms[1].wrist);
    c.stroke();
    c.globalAlpha /= 0.4;

    // leader labels on the right of the box
    const lx = bx + bw + 12;
    c.font = `9.5px ${MONO}`;
    c.textAlign = 'left';
    [['HEAD', P.head], ['TORSO', P.chest], ['PELVIS', { x: P.hipX, y: P.hipY }]].forEach(([name, p], i) => {
      const x = fx(p.x);
      const y = fy(p.y);
      const ty = fy(P.head.y) + i * 34;
      c.globalAlpha = fig.overlay * 0.6;
      c.beginPath(); c.moveTo(x + 4, y); c.lineTo(lx - 4, ty - 3); c.stroke();
      c.globalAlpha = fig.overlay;
      c.fillText(`${name}${L(' · SIM', '')}`, lx, ty);
    });
  }

  /* =========================================================
     SIMULATED WI-FI TELEMETRY
     ========================================================= */

  const WAVE_N = 240;
  const SPEC_N = 56;
  const sim = {
    rssi: -55, rssiT: -55, noise: -93, snr: 38, quality: 0.85,
    pps: 280, total: 0, nextPkt: 0, frame: 0,
    wave: [new Float32Array(WAVE_N), new Float32Array(WAVE_N), new Float32Array(WAVE_N)],
    waveHead: 0, waveAcc: 0,
    spec: new Float32Array(SPEC_N), peak: new Float32Array(SPEC_N),
    sweep: 0,
    lastReadout: 0,
    fps: 60,
  };
  const CHANNELS = [[5180, 0.82, 'CH36'], [5220, 0.42], [5260, 0.28], [5300, 0.16]];
  const CLUTTER = Array.from({ length: 14 }, () => ({ a: rand(0, TAU), r: rand(0.25, 0.95) }));
  const SWEEP_PERIOD = 6;

  function resetSim() {
    sim.total = 0;
    sim.wave.forEach((a) => a.fill(0));
    sim.spec.fill(0);
    sim.peak.fill(0);
    els.packetLog.textContent = '';
  }

  function updateSim(t, dt, fi) {
    const presence = fi && fi.fig ? fi.fig.alpha : 0;
    const motion = fi && fi.fig ? fi.fig.motion : 0;

    sim.rssiT += (Math.random() - 0.5) * dt * 7;
    sim.rssiT += (-54 + Math.sin(t * 0.21) * 2.5 - sim.rssiT) * dt * 0.4;
    const jitter = presence * (Math.sin(t * 7.3) * 2.2 + (Math.random() - 0.5) * 2.6) * motion;
    sim.rssi = lerp(sim.rssi, sim.rssiT + jitter, 1 - Math.exp(-dt * 6));
    sim.noise = -93 + Math.sin(t * 0.17) * 1.4;
    sim.snr = sim.rssi - sim.noise;
    sim.quality = clamp((sim.rssi + 90) / 45, 0, 1);
    sim.pps = lerp(sim.pps, 260 + Math.sin(t * 0.6) * 40 + presence * 120 + rand(-15, 15), 1 - Math.exp(-dt * 3));
    sim.total += sim.pps * dt;
    sim.sweep = (t % SWEEP_PERIOD) / SWEEP_PERIOD;

    // waveform samples (90 / s)
    sim.waveAcc += dt * 90;
    while (sim.waveAcc >= 1) {
      sim.waveAcc -= 1;
      const ts = t - sim.waveAcc / 90;
      for (let k = 0; k < 3; k++) {
        const base = 0.32 * Math.sin(ts * (1.7 + k * 0.55) + k * 1.9) + 0.16 * Math.sin(ts * (4.3 + k) + k) + (Math.random() - 0.5) * 0.08;
        const pert = presence * (0.3 * Math.sin(ts * (8 + k * 2.3)) * (0.4 + motion) + (Math.random() - 0.5) * 0.35 * motion);
        sim.wave[k][sim.waveHead] = base + pert;
      }
      sim.waveHead = (sim.waveHead + 1) % WAVE_N;
    }

    // spectrum
    const kS = 1 - Math.exp(-dt * 14);
    for (let i = 0; i < SPEC_N; i++) {
      const f = 5160 + (i / (SPEC_N - 1)) * 180;
      let v = 0.06 + Math.random() * 0.05;
      for (let c = 0; c < CHANNELS.length; c++) {
        const [cf, lvl] = CHANNELS[c];
        const d = (f - cf) / 9;
        const shape = 1 / (1 + d * d * d * d * d * d);
        const burst = 0.82 + 0.18 * Math.sin(t * (2.1 + c * 1.3) + c) + (Math.random() < 0.04 ? 0.15 : 0);
        v += shape * lvl * burst * (c === 0 ? 1 + presence * 0.12 * Math.sin(t * 11) : 1);
      }
      sim.spec[i] = lerp(sim.spec[i], clamp(v, 0, 1), kS);
      sim.peak[i] = Math.max(sim.peak[i] - dt * 0.18, sim.spec[i]);
    }
  }

  function drawGauge(t) {
    const s = surf.gauge;
    const c = s.ctx;
    const w = s.w;
    const h = s.h;
    c.clearRect(0, 0, w, h);
    const cx = w / 2;
    const r = Math.max(10, Math.min(w * 0.42, h * 0.46));
    const cy = h * 0.52;
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    const frac = clamp((sim.rssi + 100) / 70, 0, 1);

    c.lineCap = 'butt';
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(255,170,80,0.08)';
    c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke();

    const segs = 30;
    for (let i = 0; i < segs; i++) {
      const f0 = i / segs;
      const f1 = (i + 1) / segs;
      if (f0 > frac) break;
      c.strokeStyle = f0 < 0.3 ? '#ff4433' : f0 < 0.55 ? '#ff7a1a' : '#ffb347';
      c.beginPath(); c.arc(cx, cy, r, lerp(a0, a1, f0) + 0.012, lerp(a0, a1, f1) - 0.012); c.stroke();
    }

    c.lineWidth = 1;
    c.strokeStyle = 'rgba(255,200,140,0.5)';
    c.fillStyle = 'rgba(255,200,140,0.55)';
    c.font = `8.5px ${MONO}`;
    c.textAlign = 'center';
    for (let db = -100; db <= -30; db += 10) {
      const a = lerp(a0, a1, (db + 100) / 70);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      c.beginPath(); c.moveTo(cx + ca * (r - 7), cy + sa * (r - 7)); c.lineTo(cx + ca * (r - 12), cy + sa * (r - 12)); c.stroke();
      if (db % 20 === 0 && r > 40) c.fillText(String(db), cx + ca * (r - 21), cy + sa * (r - 21) + 3);
    }

    const an = lerp(a0, a1, frac);
    c.strokeStyle = '#ece3d2';
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(an) * (r - 9), cy + Math.sin(an) * (r - 9)); c.stroke();
    c.fillStyle = '#ffb347';
    c.beginPath(); c.arc(cx, cy, 3, 0, TAU); c.fill();

    c.fillStyle = '#ece3d2';
    c.font = `600 ${Math.round(clamp(r * 0.34, 11, 22))}px ${MONO}`;
    c.fillText(sim.rssi.toFixed(0), cx, cy + r * 0.62);
    c.fillStyle = 'rgba(141,132,115,1)';
    c.font = `8.5px ${MONO}`;
    c.fillText(L('dBm · SIMULATED', 'dBm'), cx, Math.min(cy + r * 0.62 + 13, h - 2));
  }

  function drawWave() {
    const s = surf.wave;
    const c = s.ctx;
    const w = s.w;
    const h = s.h;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,170,80,0.07)';
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < 8; i++) { const x = Math.round((w * i) / 8) + 0.5; c.moveTo(x, 0); c.lineTo(x, h); }
    for (let i = 1; i < 4; i++) { const y = Math.round((h * i) / 4) + 0.5; c.moveTo(0, y); c.lineTo(w, y); }
    c.stroke();

    const colors = ['255,179,71', '255,122,26', '79,227,255'];
    for (let k = 2; k >= 0; k--) {
      const arr = sim.wave[k];
      const yOff = h / 2 + (k - 1) * h * 0.1;
      c.beginPath();
      for (let i = 0; i < WAVE_N; i++) {
        const v = arr[(sim.waveHead + i) % WAVE_N];
        const x = (i / (WAVE_N - 1)) * w;
        const y = yOff - v * h * 0.3;
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      }
      c.strokeStyle = `rgba(${colors[k]},0.14)`;
      c.lineWidth = 4;
      c.stroke();
      c.strokeStyle = `rgba(${colors[k]},${k === 0 ? 0.95 : 0.6})`;
      c.lineWidth = 1.2;
      c.stroke();
    }
    c.fillStyle = 'rgba(141,132,115,0.9)';
    c.font = `8.5px ${MONO}`;
    c.textAlign = 'right';
    c.fillText(L('AMPLITUDE · SIMULATED SIGNAL', 'AMPLITUDE'), w - 4, h - 4);
  }

  function drawSpectrum() {
    const s = surf.spec;
    const c = s.ctx;
    const w = s.w;
    const h = s.h;
    c.clearRect(0, 0, w, h);
    const base = h - 14;
    const top = 10;
    const bw = w / SPEC_N;
    const grad = c.createLinearGradient(0, base, 0, top);
    grad.addColorStop(0, '#a3170f');
    grad.addColorStop(0.5, '#ff7a1a');
    grad.addColorStop(1, '#ffd27a');

    c.strokeStyle = 'rgba(255,170,80,0.07)';
    c.beginPath();
    for (let i = 1; i < 4; i++) { const y = Math.round(top + ((base - top) * i) / 4) + 0.5; c.moveTo(0, y); c.lineTo(w, y); }
    c.stroke();

    c.fillStyle = grad;
    for (let i = 0; i < SPEC_N; i++) {
      const v = sim.spec[i];
      const bh = v * (base - top);
      c.fillRect(i * bw + 1, base - bh, Math.max(1, bw - 2), bh);
    }
    c.fillStyle = '#4fe3ff';
    for (let i = 0; i < SPEC_N; i++) {
      const y = base - sim.peak[i] * (base - top);
      c.fillRect(i * bw + 1, y - 1, Math.max(1, bw - 2), 1.5);
    }

    c.fillStyle = 'rgba(141,132,115,0.95)';
    c.font = `8.5px ${MONO}`;
    c.textAlign = 'left'; c.fillText('5.16', 0, h - 2);
    c.textAlign = 'center'; c.fillText('5.25 GHz', w / 2, h - 2);
    c.textAlign = 'right'; c.fillText('5.34', w, h - 2);
    const chX = ((5180 - 5160) / 180) * w;
    c.textAlign = 'center';
    c.fillStyle = '#ffb347';
    c.fillText('CH36', chX, top - 1);
  }

  function drawRadar(t, fi) {
    const s = surf.radar;
    const c = s.ctx;
    const w = s.w;
    const h = s.h;
    c.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.max(10, Math.min(w, h) / 2 - 6);

    c.strokeStyle = 'rgba(255,170,80,0.16)';
    c.lineWidth = 1;
    for (let i = 1; i <= 4; i++) { c.beginPath(); c.arc(cx, cy, (R * i) / 4, 0, TAU); c.stroke(); }
    c.beginPath();
    c.moveTo(cx - R, cy); c.lineTo(cx + R, cy); c.moveTo(cx, cy - R); c.lineTo(cx, cy + R);
    c.stroke();
    c.beginPath();
    for (let i = 0; i < 36; i++) {
      const a = (i * TAU) / 36;
      const r0 = i % 3 === 0 ? R - 6 : R - 3;
      c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    }
    c.stroke();

    const sweepA = (t * (reducedMotion ? 0.5 : 1.6)) % TAU;
    if (state.scanning) {
      const steps = 22;
      for (let i = 0; i < steps; i++) {
        const a = sweepA - i * 0.045;
        c.fillStyle = `rgba(255,150,40,${(1 - i / steps) * 0.2})`;
        c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a - 0.047, a); c.closePath(); c.fill();
      }
      c.strokeStyle = 'rgba(255,214,150,0.85)';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(sweepA) * R, cy + Math.sin(sweepA) * R); c.stroke();
    }

    const fade = (ang) => { const age = (((sweepA - ang) % TAU) + TAU) % TAU / TAU; return 1 - age; };
    for (const p of CLUTTER) {
      const k = Math.pow(fade(p.a), 2) * 0.7;
      c.fillStyle = `rgba(255,170,80,${k})`;
      c.fillRect(cx + Math.cos(p.a) * p.r * R - 1, cy + Math.sin(p.a) * p.r * R - 1, 2, 2);
    }

    if (fi && fi.fig && fi.fig.overlay > 0.01) {
      const ang = -Math.PI / 2 + (fi.fig.nx - 0.5) * 1.5;
      const rr = 0.52 * R;
      const k = Math.max(0.35, Math.pow(fade(ang), 1.5)) * fi.fig.overlay;
      const x = cx + Math.cos(ang) * rr;
      const y = cy + Math.sin(ang) * rr;
      c.fillStyle = `rgba(255,68,51,${k})`;
      c.beginPath(); c.arc(x, y, 3.5, 0, TAU); c.fill();
      c.strokeStyle = `rgba(255,179,71,${k})`;
      c.beginPath(); c.arc(x, y, 7 + (reducedMotion ? 0 : (t * 8) % 6), 0, TAU); c.stroke();
      c.fillStyle = `rgba(255,179,71,${k})`;
      c.font = `8.5px ${MONO}`;
      c.textAlign = 'left';
      c.fillText(L('T1·SIM', 'T1'), x + 9, y - 6);
    }
  }

  const PKT_TYPES = ['QoS-DATA', 'QoS-DATA', 'QoS-DATA', 'ACK', 'ACK', 'BEACON', 'DATA', 'RTS', 'CTS', 'PROBE'];
  function updatePackets(now) {
    if (now < sim.nextPkt) return;
    sim.nextPkt = now + rand(90, 280);
    const d = new Date();
    const ts = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
    const type = PKT_TYPES[(Math.random() * PKT_TYPES.length) | 0];
    const tx = Math.random() < 0.3;
    const size = type === 'ACK' || type === 'RTS' || type === 'CTS' ? 14 + ((Math.random() * 6) | 0) : (60 + Math.random() * 1450) | 0;
    const li = document.createElement('li');
    if (tx) li.className = 'tx';
    li.textContent = `${ts} ${tx ? 'TX' : 'RX'} ${type.padEnd(8)} ${Math.round(sim.rssi + rand(-3, 3))}dBm ${size}B`;
    els.packetLog.appendChild(li);
    while (els.packetLog.children.length > 8) els.packetLog.removeChild(els.packetLog.firstChild);
  }

  function drawCamPlaceholder(t) {
    const s = surf.cam;
    const c = s.ctx;
    const w = s.w;
    const h = s.h;
    c.fillStyle = '#07080a';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,170,80,0.07)';
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x < w; x += 16) { c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, h); }
    for (let y = 0; y < h; y += 16) { c.moveTo(0, y + 0.5); c.lineTo(w, y + 0.5); }
    c.stroke();
    const n = reducedMotion ? 0 : 26;
    for (let i = 0; i < n; i++) {
      const y = Math.random() * h;
      c.fillStyle = `rgba(255,170,80,${Math.random() * 0.06})`;
      c.fillRect(0, y, w, 1 + Math.random() * 2);
    }
    const sy = reducedMotion ? h * 0.5 : ((t * 40) % (h + 40)) - 20;
    const g = c.createLinearGradient(0, sy - 20, 0, sy + 2);
    g.addColorStop(0, 'rgba(255,170,80,0)');
    g.addColorStop(1, 'rgba(255,170,80,0.12)');
    c.fillStyle = g;
    c.fillRect(0, sy - 20, w, 22);
  }

  /* =========================================================
     UI READOUTS
     ========================================================= */

  function setStatus(label, detail, tone) {
    els.statePill.textContent = label;
    els.statePill.dataset.tone = tone || 'standby';
    els.statusDetail.textContent = detail;
  }

  function showCountdown(on) {
    els.countdown.classList.toggle('is-visible', on);
    if (!on) els.cdRing.style.strokeDashoffset = '0';
  }

  function showProfile(rt, now) {
    PROFILE_KEYS.forEach((k) => { fieldEls[k].textContent = ''; });
    rt.decodeStart = now;
    rt.decoded = false;
    els.targetPanel.classList.remove('is-fading');
    els.targetPanel.classList.add('has-target');
  }

  function clearProfile() {
    els.targetPanel.classList.remove('has-target', 'is-fading');
    PROFILE_KEYS.forEach((k) => { fieldEls[k].textContent = ''; });
    els.tMotion.textContent = '';
    els.tTrack.textContent = '';
    els.tPos.textContent = '';
  }

  const GLYPHS = '#%&*+=/<>0123456789ABCDEFHKMNRSTXZ';
  const scramble = (n) => { let s = ''; for (let i = 0; i < n; i++) s += GLYPHS[(Math.random() * GLYPHS.length) | 0]; return s; };

  function decodeProfile(rt, now) {
    if (rt.decoded) return;
    const el = (now - rt.decodeStart) / 1000;
    let done = true;
    PROFILE_KEYS.forEach((k, i) => {
      const final = k === 'status' ? L(rt.def.profile.status, 'TRACKING') : rt.def.profile[k];
      const start = i * 0.12;
      const end = start + 0.45;
      const node = fieldEls[k];
      if (reducedMotion || el >= end) {
        if (node.textContent !== final) node.textContent = final;
      } else {
        done = false;
        const n = Math.floor(final.length * clamp((el - start) / (end - start), 0, 1));
        node.textContent = final.slice(0, n) + scramble(final.length - n);
      }
    });
    rt.decoded = done;
  }

  function updateReadouts(now, fi) {
    // continuous (every frame)
    if (fi) {
      const p = clamp(fi.e / fi.total, 0, 1);
      els.progressFill.style.transform = `scaleX(${p.toFixed(4)})`;
      if (fi.phase === 'active') decodeProfile(fi.rt, now);
    } else {
      els.progressFill.style.transform = 'scaleX(0)';
    }
    els.sweepFill.style.transform = `scaleX(${state.scanning ? sim.sweep.toFixed(4) : 0})`;

    // throttled text (~8 Hz)
    if (now - sim.lastReadout < 120) return;
    sim.lastReadout = now;

    if (fi) {
      let txt;
      if (fi.phase === 'countdown') txt = `T-${(fi.rt.def.countdown - fi.pt).toFixed(1)}s`;
      else if (fi.phase === 'active') txt = `${(fi.rt.def.active - fi.pt).toFixed(1)}s left`;
      else txt = `${Math.max(0, fi.total - fi.e).toFixed(1)}s`;
      els.statusTimer.textContent = txt;
      if (fi.fig) {
        els.tMotion.textContent = fi.fig.moving;
        els.tTrack.textContent = `${fi.fig.trackTime.toFixed(1)} s`;
        els.tPos.textContent = `X ${fi.fig.nx.toFixed(2)} · Y ${(fi.fig.pose.chest.y / FH).toFixed(2)} · FIELD COORDS`;
      }
    } else {
      els.statusTimer.textContent = state.scanning ? `${Math.round(sim.sweep * 100)}%` : '--.-s';
    }

    const q = sim.quality;
    const lit = Math.round(q * 5);
    els.qBars.forEach((b, i) => b.classList.toggle('on', i < lit));
    els.qLabel.textContent = q > 0.8 ? 'EXCELLENT' : q > 0.6 ? 'GOOD' : q > 0.4 ? 'FAIR' : 'WEAK';
    els.qPct.textContent = `${Math.round(q * 100)}%${L(' · SIM', '')}`;
    els.snrVal.textContent = `${sim.snr.toFixed(0)} dB`;
    els.ppsVal.textContent = state.scanning ? String(Math.round(sim.pps)) : '0';
    els.pktTotal.textContent = Math.floor(sim.total).toLocaleString('en-US');
    els.sweepPct.textContent = `${Math.round((state.scanning ? sim.sweep : 0) * 100)}%`;
    els.hudFrame.textContent = `FRM ${pad(sim.frame % 1000000, 6)} · ${Math.round(sim.fps)} FPS`;
  }

  function refreshControls() {
    els.app.classList.toggle('is-stopped', !state.scanning);
    els.app.classList.toggle('view-off', !state.scanView);

    els.btnScan.setAttribute('aria-pressed', String(state.scanning));
    $('.lbl', els.btnScan).textContent = state.scanning ? 'Stop scan' : 'Start scan';
    els.btnView.setAttribute('aria-pressed', String(state.scanView));
    $('.lbl', els.btnView).textContent = `Scan view: ${state.scanView ? 'on' : 'off'}`;
    els.btnSound.setAttribute('aria-pressed', String(!state.muted));
    $('.lbl', els.btnSound).textContent = `Sound: ${state.muted ? 'off' : 'on'}`;

    setChip(els.chipScan, state.scanning ? 'ACTIVE' : 'STOPPED', !state.scanning);
    setChip(els.chipView, state.scanView ? 'ON' : 'OFF', !state.scanView);
    setChip(els.chipAudio, state.muted ? 'MUTED' : 'ON', state.muted);

    if (!state.scanView) {
      showStageMsg('SCAN VIEW OFF', 'Targets & overlays hidden · press V to resume');
    } else if (!state.scanning) {
      showStageMsg('SCANNER IDLE', 'Press SPACE or Start scan');
    } else {
      els.stageMsg.hidden = true;
    }
  }

  function setChip(chip, value, off) {
    chip.querySelector('b').textContent = value;
    chip.classList.toggle('is-off', off);
  }

  function showStageMsg(title, sub) {
    els.stageMsgTitle.textContent = title;
    els.stageMsgSub.textContent = sub;
    els.stageMsg.hidden = false;
  }

  let toastTimer = 0;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
  }

  /* =========================================================
     MAIN LOOP (single requestAnimationFrame, guarded)
     ========================================================= */

  let rafId = 0;
  let lastNow = 0;

  function startLoop() {
    if (rafId) return;
    lastNow = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function frame(now) {
    rafId = 0;
    const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (dt > 0) sim.fps = lerp(sim.fps, 1 / dt, 0.05);
    renderAll(now, dt);
    if (state.scanning) rafId = requestAnimationFrame(frame);
  }

  function renderAll(now, dt) {
    const t = now / 1000;
    sim.frame++;
    let fi = null;
    if (state.scenario) fi = updateScenario(state.scenario, now, dt);
    if (state.scanning) updateSim(t, dt, fi);
    drawThermal(t, fi);
    drawGauge(t);
    drawWave();
    drawSpectrum();
    drawRadar(t, fi);
    if (!cam.stream) drawCamPlaceholder(t);
    if (state.scanning) updatePackets(now);
    updateReadouts(now, fi);
  }

  /** Draws a single frame while the loop is stopped (idle/frozen state). */
  function renderOnce() {
    renderAll(performance.now(), 0);
  }

  /* =========================================================
     SCANNING / VIEW / RESET / FULLSCREEN
     ========================================================= */

  function setScanning(on) {
    if (state.scanning === on) return;
    state.scanning = on;
    if (!on) {
      stopScenario(null, true);
      sfx.stopAll();
      setStatus('IDLE', 'Scanner stopped · animation loops halted', 'off');
      refreshControls();
      stopLoop();
      renderOnce();
    } else {
      setStatus('STANDBY', 'Sweeping · awaiting target', 'standby');
      refreshControls();
      sfx.blip();
      startLoop();
    }
  }

  function setScanView(on) {
    if (state.scanView === on) return;
    state.scanView = on;
    if (!on) {
      stopScenario(null, true);
      setStatus('VIEW OFF', 'Scan view disabled · targets hidden', 'off');
    } else {
      setStatus(state.scanning ? 'STANDBY' : 'IDLE', state.scanning ? 'Scan view restored · awaiting target' : 'Scanner stopped', state.scanning ? 'standby' : 'off');
    }
    refreshControls();
    if (!rafId) renderOnce();
  }

  function resetAll() {
    stopScenario(null, true);
    sfx.stopAll();
    state.scanView = true;
    resetSim();
    if (!state.scanning) setScanning(true);
    setStatus('STANDBY', 'System reset · awaiting operator', 'standby');
    refreshControls();
    toast('Reset · scanner in standby');
  }

  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

  function toggleFullscreen() {
    const root = document.documentElement;
    try {
      if (fsElement()) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        const req = root.requestFullscreen || root.webkitRequestFullscreen;
        if (!req) { toast('Fullscreen is not available in this browser'); return; }
        const p = req.call(root);
        if (p && p.catch) p.catch(() => toast('Fullscreen request was blocked'));
      }
    } catch (e) {
      toast('Fullscreen is not available here');
    }
  }

  function onFullscreenChange() {
    $('.lbl', els.btnFull).textContent = fsElement() ? 'Exit fullscreen' : 'Fullscreen';
    setTimeout(resizeAll, 60);
  }

  function setMuted(m) {
    state.muted = m;
    if (m) sfx.stopAll(); else sfx.blip();
    refreshControls();
  }

  function setClean(on) {
    state.clean = on;
    els.app.classList.toggle('clean', on);
    document.querySelectorAll('[data-clean]').forEach((n) => {
      if (n.dataset.sim == null) n.dataset.sim = n.textContent;
      n.textContent = on ? n.dataset.clean : n.dataset.sim;
    });
    if (state.scenario) state.scenario.decoded = false; // refresh the status value
    if (!rafId) renderOnce();
  }

  function toggleReveal(force) {
    const open = force == null ? els.reveal.hidden : force;
    if (open) stopScenario(null, true);
    els.reveal.hidden = !open;
  }

  function toggleHelp(force) {
    const open = force == null ? els.help.hidden : force;
    els.help.hidden = !open;
    if (open) els.btnHelpClose.focus();
  }

  /* =========================================================
     CAMERA (explicit, user-initiated, local preview only)
     ========================================================= */

  const cam = { stream: null, starting: false, cancel: false };

  function setCamUI(mode) {
    els.camPanel.classList.toggle('is-live', mode === 'live');
    els.camPanel.classList.toggle('is-requesting', mode === 'requesting');
    const label = mode === 'live' ? 'CAMERA LIVE · LOCAL' : mode === 'requesting' ? 'REQUESTING PERMISSION…' : 'CAMERA OFF';
    $('span', els.camIndicator).textContent = label;
    els.btnCamStart.disabled = mode !== 'off';
    els.btnCamStop.disabled = mode === 'off';
    setChip(els.chipCam, mode === 'live' ? 'LIVE' : 'OFF', mode !== 'live');
    els.chipCam.classList.toggle('is-live', mode === 'live');
  }

  function showCamError(msg) {
    els.camError.textContent = msg;
    els.camError.hidden = false;
  }
  function hideCamError() { els.camError.hidden = true; }

  function describeCamError(err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
      return 'Camera permission was denied. Allow camera access for this page in the browser\'s site settings, then click Start camera again. The demo works fully without a camera.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') {
      return 'No camera was found on this device. The demo continues with the standby background.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
      return 'The camera is busy or could not start (another app may be using it). Close other apps and try again.';
    }
    return `The camera could not be started${err && err.message ? ` (${err.message})` : ''}. The demo works without it.`;
  }

  function cameraUnavailableHint() {
    if (location.protocol === 'file:') {
      return 'This browser blocks the camera for pages opened as a local file. Start a local server (see README: python -m http.server 8000) and open http://localhost:8000.';
    }
    if (!window.isSecureContext) return 'The camera needs a secure page (https:// or http://localhost).';
    return 'This browser does not support camera access (getUserMedia).';
  }

  async function startCamera() {
    if (cam.stream || cam.starting) return;
    hideCamError();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showCamError(cameraUnavailableHint());
      return;
    }
    cam.starting = true;
    cam.cancel = false;
    setCamUI('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (cam.cancel) { stream.getTracks().forEach((tr) => tr.stop()); setCamUI('off'); return; }
      cam.stream = stream;
      els.video.srcObject = stream;
      stream.getVideoTracks().forEach((tr) => tr.addEventListener('ended', () => stopCamera('The camera was disconnected.')));
      try { await els.video.play(); } catch (e) { /* autoplay of muted video normally succeeds */ }
      setCamUI('live');
      toast('Camera preview on · local only, not recorded');
    } catch (err) {
      setCamUI('off');
      showCamError(describeCamError(err));
    } finally {
      cam.starting = false;
    }
  }

  function stopCamera(message) {
    if (cam.starting) cam.cancel = true;
    if (cam.stream) cam.stream.getTracks().forEach((tr) => tr.stop());
    cam.stream = null;
    els.video.pause();
    els.video.srcObject = null;
    if (!cam.starting) setCamUI('off');
    if (message) showCamError(message);
    if (!rafId) renderOnce();
  }

  /* =========================================================
     BROWSER NETWORK INFO (real API, very limited)
     ========================================================= */

  function readNetInfo() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    els.netInfo.title = 'The Network Information API only gives a rough connection class and throughput estimate. '
      + 'Browsers do not expose Wi-Fi signal strength, channels or packets, so every other reading in this panel is simulated.';
    if (!conn) {
      els.netInfo.textContent = `Browser network API: not exposed here · ${navigator.onLine ? 'online' : 'offline'}`;
      return;
    }
    const parts = [];
    if (conn.type) parts.push(conn.type.toUpperCase());
    if (conn.effectiveType) parts.push(`class ${conn.effectiveType.toUpperCase()}`);
    if (conn.downlink) parts.push(`~${conn.downlink} Mbps`);
    if (conn.rtt != null) parts.push(`~${conn.rtt} ms RTT`);
    els.netInfo.textContent = `Browser network API (real, coarse): ${parts.join(' · ') || 'no data'}`;
  }

  /* =========================================================
     INPUT
     ========================================================= */

  function isTypingTarget(el) {
    if (!el || el === document.body) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
      const nonText = ['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image'];
      return !nonText.includes((el.type || 'text').toLowerCase());
    }
    return false;
  }

  function onKeyDown(e) {
    if (isTypingTarget(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key;

    if (key === 'Escape') {
      if (!els.help.hidden) { toggleHelp(false); return; }
      if (!els.reveal.hidden) { toggleReveal(false); return; }
      if (fsElement()) { toggleFullscreen(); return; }
      if (stopScenario(L('Scenario stopped by operator', 'Tracking stopped by operator'), false)) e.preventDefault();
      return;
    }

    const isSpace = key === ' ' || key === 'Spacebar' || e.code === 'Space';
    if (isSpace) e.preventDefault(); // stop page scroll & button activation
    if (e.repeat) return; // held keys never re-trigger

    if (!els.help.hidden && key !== 'h' && key !== 'H' && key !== '?') return;

    switch (key) {
      case '1': startScenario(1); break;
      case '2': startScenario(2); break;
      case 'v': case 'V': setScanView(!state.scanView); break;
      case 'f': case 'F': toggleFullscreen(); break;
      case 'r': case 'R': resetAll(); break;
      case 'c': case 'C': if (cam.stream || cam.starting) stopCamera(); else startCamera(); break;
      case 'm': case 'M': setMuted(!state.muted); break;
      case 'h': case 'H': case '?': toggleHelp(); break;
      case 'p': case 'P': setClean(!state.clean); break;
      case 'x': case 'X': toggleReveal(); break;
      default:
        if (isSpace) setScanning(!state.scanning);
        break;
    }
  }

  // Prevent a focused button from also being "clicked" by Space on keyup.
  function onKeyUp(e) {
    if ((e.key === ' ' || e.code === 'Space') && e.target && e.target.tagName === 'BUTTON' && !isTypingTarget(e.target)) {
      e.preventDefault();
    }
  }

  function bind(btn, fn) {
    btn.addEventListener('click', (e) => {
      sfx.unlock();
      fn(e);
      // mouse clicks should not leave focus on the button (keeps Space for scanning)
      if (e.detail > 0) btn.blur();
    });
  }

  function init() {
    bind(els.btnScan, () => setScanning(!state.scanning));
    bind(els.btnReset, resetAll);
    bind(els.btnView, () => setScanView(!state.scanView));
    bind(els.btnFull, toggleFullscreen);
    bind(els.btnSound, () => setMuted(!state.muted));
    bind(els.btnHelp, () => toggleHelp());
    bind(els.btnHelpClose, () => toggleHelp(false));
    bind(els.btnCamStart, startCamera);
    bind(els.btnCamStop, () => stopCamera());
    els.help.addEventListener('click', (e) => { if (e.target === els.help) toggleHelp(false); });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    window.addEventListener('pagehide', () => { if (cam.stream) stopCamera(); sfx.stopAll(); });

    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(() => resizeAll());
      Object.values(surf).forEach((s) => ro.observe(s.canvas));
    } else {
      window.addEventListener('resize', resizeAll);
    }

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn && conn.addEventListener) conn.addEventListener('change', readNetInfo);
    window.addEventListener('online', readNetInfo);
    window.addEventListener('offline', readNetInfo);
    readNetInfo();

    const tickClock = () => {
      const d = new Date();
      els.clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };
    tickClock();
    setInterval(tickClock, 1000);

    setCamUI('off');
    setStatus('STANDBY', 'Sweeping · awaiting target', 'standby');
    refreshControls();
    startLoop();
  }

  // Small read-only hook for automated checks (no control surface).
  window.__scannerDebug = {
    get state() {
      const s = state.scenario;
      return {
        scanning: state.scanning, scanView: state.scanView, muted: state.muted, loopRunning: !!rafId,
        scenario: s ? { id: s.def.id, phase: s.phase, elapsed: (performance.now() - s.start) / 1000 } : null,
        camera: !!cam.stream,
      };
    },
  };

  init();
})();
