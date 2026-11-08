// 効果音。音のファイルは使わず、Web Audio でその場で合成する。
// 音の組み合わせ（キット）を4つ用意し、URL の ?se=clay|porcelain|wheel|toy で切り替える（試聴は sound.html）。
//  touch: 指で形を変えている間の音（指の速さで強くなる、続く音）
//  hit:   投げた壺が壁や床にぶつかった音（割れる前）
//  crack: 割れた瞬間の音
//  tick:  破片どうし・床にぶつかる小さな音
//  land:  次の筒が降ってきて着地した音

let ctx = null, out = null, noise = null, kit = null, kitId = null, loop = null;
let level = 0, target = 0, tone = 0.5, spinning = false, lastTick = 0;
const R = (a, b) => a + Math.random() * (b - a);

export function unlock() {                        // 押したときにしか音を出せない端末があるので、最初のタップで呼ぶ
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4;
    out = ctx.createGain(); out.gain.value = 0.8;
    out.connect(comp); comp.connect(ctx.destination);
    const n = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    if (kit) buildLoop();
  }
  if (ctx.state !== 'running') ctx.resume();
}
const ready = () => ctx && ctx.state === 'running';

// ---- 部品 ----
function dest(pan) {
  if (!pan || !ctx.createStereoPanner) return out;
  const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(out); return p;
}
function env(g, t0, a, d, peak) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}
// ざらっとした音（ノイズをフィルターで削る）
function burst({ t = 0, type = 'bandpass', f = 1000, f2 = 0, q = 1, a = 0.002, d = 0.1, g = 0.5, pan = 0 }) {
  const t0 = ctx.currentTime + t, s = ctx.createBufferSource();
  s.buffer = noise; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t0); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + a + d);
  const gn = ctx.createGain(); env(gn, t0, a, d, g);
  s.connect(fl); fl.connect(gn); gn.connect(dest(pan));
  s.start(t0, Math.random() * 1.8); s.stop(t0 + a + d + 0.05);
}
// 澄んだ音（正弦波などを鳴らして減衰させる）
function ping({ t = 0, f = 1000, f2 = 0, type = 'sine', a = 0.001, d = 0.2, g = 0.3, pan = 0 }) {
  const t0 = ctx.currentTime + t, o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + a + d);
  const gn = ctx.createGain(); env(gn, t0, a, d, g);
  o.connect(gn); gn.connect(dest(pan));
  o.start(t0); o.stop(t0 + a + d + 0.05);
}
// 器を叩いた音（倍音が整数倍でない、鐘のような鳴り）
function bowl(f, d, g, pan, t = 0) {
  [1, 2.32, 4.25, 6.63].forEach((m, i) => ping({ t, f: f * m, d: d / (1 + i * 0.8), g: g / (1 + i * 0.7), pan }));
}
const PENTA = [0, 2, 4, 7, 9];
function note(i, base = 220) { return base * Math.pow(2, (Math.floor(i / 5) * 12 + PENTA[((i % 5) + 5) % 5]) / 12); }

// ---- キット ----
export const KITS = {
  clay: {
    name: 'Terracotta', ja: '素焼き',
    desc: 'しっとりした土をこする低い音。割れると「ゴソッ」と鈍くくずれる',
    loop: { type: 'lowpass', f0: 260, f1: 1000, q: 0.9, g: 0.7 },
    hit(s, pan) { ping({ f: 160, f2: 60, d: 0.16, g: 0.55 * s, pan }); burst({ type: 'lowpass', f: 1000, d: 0.07, g: 0.4 * s, pan }); },
    crack(s, pan) {
      ping({ f: 140, f2: 45, d: 0.32, g: 0.7 * s, pan });
      burst({ type: 'lowpass', f: 2400, f2: 400, d: 0.4, g: 0.6 * s, pan });
      for (let i = 0; i < 14; i++) burst({ t: R(0, 0.35) * R(0.3, 1), f: R(600, 2600), q: 3, d: R(0.02, 0.07), g: R(0.15, 0.4) * s, pan: pan + R(-0.4, 0.4) });
    },
    tick(s, pan) { burst({ f: R(900, 2200), q: 2.5, d: R(0.02, 0.04), g: 0.3 * s, pan }); },
    land(s) { ping({ f: 120, f2: 55, d: 0.16, g: 0.5 * s }); burst({ type: 'lowpass', f: 700, d: 0.06, g: 0.3 * s }); },
  },
  porcelain: {
    name: 'Porcelain', ja: '磁器',
    desc: '釉薬の上を指がすべる細い音。ぶつかると「コーン」、割れると高くきらめく',
    loop: { type: 'bandpass', f0: 1500, f1: 3600, q: 1.8, g: 0.45 },
    hit(s, pan) { bowl(R(620, 760), 0.8, 0.22 * s, pan); burst({ type: 'highpass', f: 3500, d: 0.02, g: 0.2 * s, pan }); },
    crack(s, pan) {
      burst({ type: 'highpass', f: 2500, d: 0.14, g: 0.55 * s, pan });
      ping({ f: 200, f2: 80, d: 0.12, g: 0.35 * s, pan });
      for (let i = 0; i < 22; i++) ping({ t: R(0, 0.4) * R(0.15, 1), f: R(2200, 7500), d: R(0.04, 0.4), g: R(0.04, 0.13) * s, pan: pan + R(-0.5, 0.5) });
    },
    tick(s, pan) { ping({ f: R(3000, 6800), d: R(0.04, 0.14), g: 0.13 * s, pan }); },
    land(s) { bowl(R(420, 480), 0.5, 0.18 * s, 0); },
  },
  wheel: {
    name: 'Wheel', ja: 'ろくろ',
    desc: 'ろくろが低くうなり、触ると回転に合わせて「シュッ、シュッ」。割れると重い陶器が砕ける',
    loop: { type: 'bandpass', f0: 300, f1: 1500, q: 1.1, g: 0.8, am: 2 * 1.6 / (Math.PI * 2), hum: true },
    hit(s, pan) { ping({ f: 220, f2: 140, d: 0.1, g: 0.45 * s, pan }); burst({ f: 1800, q: 1.5, d: 0.05, g: 0.35 * s, pan }); },
    crack(s, pan) {
      ping({ f: 95, f2: 38, d: 0.45, g: 0.8 * s, pan });
      burst({ type: 'lowpass', f: 3500, f2: 300, d: 0.7, g: 0.5 * s, pan });
      for (let i = 0; i < 26; i++) burst({ t: R(0, 0.6) * R(0.2, 1), f: R(1200, 5000), q: 4, d: R(0.015, 0.05), g: R(0.1, 0.35) * s, pan: pan + R(-0.6, 0.6) });
    },
    tick(s, pan) { burst({ f: R(1800, 4200), q: 4, d: R(0.015, 0.03), g: 0.3 * s, pan }); },
    land(s) { ping({ f: 90, f2: 45, d: 0.22, g: 0.6 * s }); },
  },
  toy: {
    name: 'Scale', ja: '音階',
    desc: '触った所の太さで音の高さが変わる（細いほど高い）。割れると音がこぼれ落ちる',
    loop: { tonal: true, g: 0.22 },
    hit(s, pan) { const f = note(Math.floor(R(5, 10))); ping({ f, type: 'triangle', d: 0.35, g: 0.3 * s, pan }); ping({ f: f * 2, d: 0.2, g: 0.1 * s, pan }); },
    crack(s, pan) {
      burst({ type: 'bandpass', f: 1800, q: 0.8, d: 0.05, g: 0.5 * s, pan });
      let i = 16;
      for (let k = 0; k < 12; k++) { i -= Math.floor(R(1, 3)); ping({ t: k * 0.055, f: note(i), type: 'triangle', d: 0.4, g: 0.22 * s, pan: pan + R(-0.5, 0.5) }); }
    },
    tick(s, pan) { ping({ f: note(Math.floor(R(10, 18))), d: 0.09, g: 0.12 * s, pan }); },
    land(s) { ping({ f: note(0, 110), type: 'triangle', d: 0.3, g: 0.35 * s }); },
  },
};
export const KIT_IDS = Object.keys(KITS);

export function setKit(id) {
  kitId = KIT_IDS.includes(id) ? id : 'clay'; kit = KITS[kitId];
  if (ctx) buildLoop();
  return kitId;
}
export function getKit() { return kitId; }

// ---- 触っている間の続く音 ----
function buildLoop() {
  if (loop) loop.stop();
  const L = kit.loop, g = ctx.createGain(); g.gain.value = 0; g.connect(out);
  const nodes = []; let src, fl = null, hum = null;
  if (L.tonal) {
    src = ctx.createOscillator(); src.type = 'triangle'; src.frequency.value = 330;
    const vib = ctx.createOscillator(), vd = ctx.createGain(); vib.frequency.value = 5.5; vd.gain.value = 4;
    vib.connect(vd); vd.connect(src.frequency); vib.start(); nodes.push(vib);
    src.connect(g);
  } else {
    src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    fl = ctx.createBiquadFilter(); fl.type = L.type; fl.Q.value = L.q; fl.frequency.value = L.f0;
    src.connect(fl);
    if (L.am) {                                   // ろくろの回転に合わせて、こする音を強弱させる
      const am = ctx.createGain(), lfo = ctx.createOscillator(), dep = ctx.createGain();
      am.gain.value = 0.55; dep.gain.value = 0.45; lfo.frequency.value = L.am;
      lfo.connect(dep); dep.connect(am.gain); lfo.start(); nodes.push(lfo);
      fl.connect(am); am.connect(g);
    } else fl.connect(g);
  }
  src.start(); nodes.push(src);
  if (L.hum) {                                    // ろくろのモーターの低いうなり（回っている間だけ）
    hum = ctx.createGain(); hum.gain.value = 0; hum.connect(out);
    [55, 110, 165].forEach((f, i) => { const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.value = f; og.gain.value = [1, 0.5, 0.2][i]; o.connect(og); og.connect(hum); o.start(); nodes.push(o); });
  }
  loop = { g, fl, src, hum, L, stop() { nodes.forEach(n => { try { n.stop(); } catch (_) {} }); g.disconnect(); if (hum) hum.disconnect(); } };
}

// 指の速さ（0〜1）と、音階キットの高さ（0 = 低い 〜 1 = 高い）
export function touch(speed, tn) { target = Math.max(target, Math.min(1, speed)); if (tn != null) tone = Math.min(1, Math.max(0, tn)); }
export function setSpinning(on) { spinning = on; }
export function update(dt) {                      // 毎フレーム呼ぶ。指が止まると音もすっと消える
  if (!ready() || !loop) return;
  level += (target - level) * (1 - Math.exp(-dt * 25));
  target *= Math.exp(-dt * 10);
  const L = loop.L, t = ctx.currentTime;
  loop.g.gain.setTargetAtTime(level * L.g, t, 0.03);
  if (loop.fl) loop.fl.frequency.setTargetAtTime(L.f0 + (L.f1 - L.f0) * level, t, 0.05);
  if (L.tonal) loop.src.frequency.setTargetAtTime(note(Math.round(tone * 12), 196), t, 0.015);
  if (loop.hum) loop.hum.gain.setTargetAtTime(spinning ? 0.035 : 0, t, 0.25);
}

// ---- 一回鳴る音 ----
export function hit(s, pan = 0) { if (ready()) kit.hit(Math.min(1, s), pan); }
export function crack(s, pan = 0) { if (ready()) { kit.crack(Math.min(1, s), pan); lastTick = ctx.currentTime + 0.12; } }
export function tick(s, pan = 0) {                // 破片はたくさんぶつかるので、間隔をあけて間引く
  if (!ready() || ctx.currentTime - lastTick < 0.035) return;
  lastTick = ctx.currentTime; kit.tick(Math.min(1, s), pan);
}
export function land(s) { if (ready()) kit.land(Math.min(1, s)); }
