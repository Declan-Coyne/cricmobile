// Ball physics, contact model, fielding & running.
// World: striker's stumps at z=0, bowler's stumps at z=-PITCH. Ball travels +z on delivery.
// x: for a right-handed batter off side is +x (offSign = +1), left-hander offSign = -1.
import { isSpin } from './data.js';

export const G = 9.81;
export const BALL_R = 0.036;
export const PITCH = 20.12;
export const CREASE = 1.22;
export const STUMP_HALF = 0.114;
export const STUMP_H = 0.711;
export const FIELD_CZ = -PITCH / 2;
export const BOUNDARY_R = 66;
const AIR_K = 0.0092;           // quadratic drag coefficient (per metre)
const GROUND_A = 0.27, GROUND_B = 1.0; // rolling deceleration: a*v + b

export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export function distToCentre(x, z) { const dz = z - FIELD_CZ; return Math.sqrt(x * x + dz * dz); }

// ---------------- Deliveries ----------------
export const PACE_TYPES = {
  stock: { name: 'Stock', short: 'STK' },
  out: { name: 'Outswing', short: 'OUT' },
  in: { name: 'Inswing', short: 'IN' },
  cutter: { name: 'Cutter', short: 'CUT' },
  slower: { name: 'Slower', short: 'SLW' },
  bouncer: { name: 'Bouncer', short: 'BNC' },
  yorker: { name: 'Yorker', short: 'YRK' },
};
export const SPIN_TYPES = {
  stock: { name: 'Stock', short: 'STK' },
  flight: { name: 'Flighted', short: 'FLT' },
  quick: { name: 'Quicker', short: 'QCK' },
  arm: { name: 'Arm ball', short: 'ARM' },
  wrong: { name: 'Variation', short: 'VAR' },
};
export function spinVariationName(style) {
  return { OB: 'Doosra', LB: 'Googly', SLA: 'Arm ball', LWS: 'Googly' }[style] || 'Variation';
}

const BASE_KMH = { RF: 143, RFM: 135, RM: 126, LF: 141, LFM: 134, LM: 125, OB: 86, LB: 84, SLA: 85, LWS: 82, '-': 110 };

// spin turn sign relative to off side (+1 = turns towards off side, i.e. away from right-hander)
function turnDir(style) { return { OB: -1, LB: 1, SLA: 1, LWS: -1 }[style] || 0; }

// d: { style, bowlSkill, bowlHand, type, target:{u,len}, offSign, err (0..1 meter error), pace (0..1 meter power), round:false }
export function planDelivery(d) {
  const spin = isSpin(d.style);
  const skill = d.bowlSkill / 100;
  const s = d.offSign;
  let kmh = BASE_KMH[d.style] || 120;
  kmh += (skill - 0.8) * 18 + rnd(-2.5, 2.5);
  kmh *= 0.94 + 0.06 * (d.pace == null ? 1 : d.pace);
  let swing = 0, dev = 0, cor = spin ? 0.42 : 0.5, fric = spin ? 0.78 : 0.86, extraH = 0;
  const t = d.type;
  if (!spin) {
    const swingMag = (1.2 + 2.2 * skill) * (d.ballAge != null ? clamp(1.3 - d.ballAge / 25, 0.35, 1.3) : 1);
    if (t === 'stock') { swing = rnd(-0.5, 0.5); dev = rnd(-0.45, 0.45) * (0.5 + skill); }
    if (t === 'out') { swing = s * swingMag; dev = rnd(-0.2, 0.3) * s; kmh -= 2; }
    if (t === 'in') { swing = -s * swingMag; dev = rnd(-0.3, 0.2) * s; kmh -= 2; }
    if (t === 'cutter') { dev = (Math.random() < 0.5 ? 1 : -1) * s * (0.6 + 0.8 * skill); kmh -= 12; }
    if (t === 'slower') { kmh *= 0.8; extraH = 0.05; swing = rnd(-0.4, 0.4); }
    if (t === 'bouncer') { kmh += 2; cor = 0.58; }
    if (t === 'yorker') { kmh += 1; }
  } else {
    const turn = (0.5 + 0.7 * skill) * turnDir(d.style); // ~15-30cm of turn by the time it reaches the bat
    if (t === 'stock') { dev = turn * s; }
    if (t === 'flight') { dev = turn * s * 1.25; kmh -= 8; extraH = 0.25; swing = s * turnDir(d.style) * -0.5; }
    if (t === 'quick') { dev = turn * s * 0.55; kmh += 9; }
    if (t === 'arm') { dev = 0; swing = turnDir(d.style) * s * -0.6; kmh += 5; }
    if (t === 'wrong') { dev = -turn * s * 0.9; }
    dev += rnd(-0.12, 0.12);
  }
  // accuracy scatter
  const acc = (1 - skill);
  const errMul = 0.45 + 2.2 * (d.err || 0);
  let len = d.target.len + gauss() * (0.08 + 0.75 * acc) * errMul;
  let u = d.target.u + gauss() * (0.035 + 0.3 * acc) * errMul;
  len = clamp(len, -0.5, 14);
  const fullToss = len < 0.35;
  const v = kmh / 3.6;
  const releaseSide = (d.bowlHand === 'L' ? 1 : -1) * (d.round ? -1 : 1);
  const p0 = { x: releaseSide * 0.55, y: spin ? 2.0 : 2.15 + skill * 0.1, z: -PITCH + CREASE + 0.25 };
  let x1 = u * s;
  let z1 = -len, y1 = BALL_R;
  if (fullToss) { z1 = -0.9; y1 = rnd(0.6, 1.1); }
  const D = z1 - p0.z;
  const vz = v * 0.985;
  const T = D / vz;
  const vy = (y1 - p0.y + 0.5 * G * T * T) / T + extraH;
  const vx = (x1 - p0.x - 0.5 * swing * T * T) / T;
  return { p0, v0: { x: vx, y: vy, z: vz }, swing, dev, cor, fric, kmh: Math.round(kmh), len, u, fullToss, style: d.style, type: t, spin, offSign: s };
}

// Simulate a delivery from release until it passes the keeper.
export function simulateDelivery(pl, keeperZ) {
  const dt = 1 / 240;
  const p = { ...pl.p0 }, v = { ...pl.v0 };
  const out = { samples: [], bounce: null, cross: {} };
  let t = 0, bounced = false, step = 0;
  const lenGuess = pl.fullToss ? 0 : pl.len;
  const zc = lenGuess < 3.2 ? -1.35 : lenGuess < 6 ? -1.0 : -0.55;
  out.zc = zc;
  const watch = [['contact', zc], ['pad', zc + 0.35], ['stumps', 0]];
  while (t < 3 && p.z < keeperZ + 1) {
    const prevZ = p.z, prevY = p.y, prevX = p.x;
    if (!bounced) v.x += pl.swing * dt;
    v.y -= G * dt;
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    if (p.y <= BALL_R && v.y < 0) {
      p.y = BALL_R;
      if (!bounced) {
        bounced = true;
        out.bounce = { t, x: p.x, z: p.z };
        v.y = -v.y * pl.cor; v.z *= pl.fric; v.x = v.x * 0.92 + pl.dev;
      } else { v.y = -v.y * 0.35; v.z *= 0.75; v.x *= 0.75; }
    }
    t += dt;
    for (const [k, z] of watch) {
      if (!out.cross[k] && prevZ < z && p.z >= z) {
        const f = (z - prevZ) / (p.z - prevZ);
        out.cross[k] = { t: t - dt + f * dt, x: prevX + (p.x - prevX) * f, y: prevY + (p.y - prevY) * f, z, vx: v.x, vy: v.y, vz: v.z, bounced };
      }
    }
    if (step++ % 2 === 0) out.samples.push({ t, x: p.x, y: p.y, z: p.z });
  }
  out.duration = t;
  return out;
}

export function sampleAt(samples, t) {
  if (!samples.length) return { x: 0, y: 0, z: 0 };
  if (t <= samples[0].t) return samples[0];
  let lo = 0, hi = samples.length - 1;
  if (t >= samples[hi].t) return samples[hi];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].t <= t) lo = mid; else hi = mid; }
  const a = samples[lo], b = samples[hi]; const f = (t - a.t) / (b.t - a.t);
  return { t, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, air: a.air };
}

// Analyse a missed / left delivery: pad, stumps, wide
export function missAnalysis(sim, pl, format) {
  const s = pl.offSign;
  const pad = sim.cross.pad, st = sim.cross.stumps;
  const res = { hitsPad: false, bowled: false, lbw: false, lbwClose: false, wide: false };
  if (pad) {
    const u = pad.x * s;
    if (u > -0.24 && u < 0.07 && pad.y < 0.75) {
      res.hitsPad = true;
      // LBW rules
      const bounceU = sim.bounce ? sim.bounce.x * s : 0;
      const pitchedOutsideLeg = sim.bounce && bounceU < -(STUMP_HALF + BALL_R);
      const inLine = Math.abs(pad.x) < STUMP_HALF + BALL_R + 0.02;
      if (st && !pitchedOutsideLeg && inLine) {
        const hitting = Math.abs(st.x) < STUMP_HALF + BALL_R && st.y < STUMP_H + BALL_R;
        const clear = Math.abs(st.x) < STUMP_HALF - 0.02 && st.y < STUMP_H - 0.04;
        if (clear) res.lbw = true;
        else if (hitting) { res.lbwClose = true; res.lbw = Math.random() < 0.5; }
      }
      return res;
    }
  }
  if (st) {
    if (Math.abs(st.x) < STUMP_HALF + BALL_R && st.y < STUMP_H + BALL_R) { res.bowled = true; return res; }
    const u = st.x * s;
    const lo = format !== 'TEST';
    if (lo && (u > 0.9 || u < -0.55)) res.wide = true;
    if (!lo && (u > 1.25 || u < -1.1)) res.wide = true;
    if (lo && st.y > 1.9) res.wide = true;
  }
  return res;
}

// Natural shot direction (theta, off-positive radians; 0 = straight back) for a ball
export function naturalAngle(ballU, ballY) {
  if (ballY > 0.95) return ballU > 0.12 ? 1.55 : -1.35; // cut / pull
  return clamp(ballU * 1.9, -1.25, 1.3);
}

// Suitability of chosen direction thetaS for this ball (0..1)
export function suitability(thetaS, ballU, ballY, action) {
  const tn = naturalAngle(ballU, ballY);
  let m = Math.abs(thetaS - tn);
  // straight-bat shots are reasonably safe to straight balls
  if (Math.abs(ballU) < 0.2 && Math.abs(thetaS) < 0.45 && ballY < 0.95) m = Math.min(m, 0.3);
  if (action === 'defend') m *= 0.4;
  // playing across the line to full straight balls is dangerous
  return clamp(1 - Math.max(0, m - 0.45) / 1.6, 0.15, 1);
}

// Convert shot to initial ball velocity.  Returns { kind:'miss'|'edge'|'hit', v, inside }
export function resolveContact(o) {
  // o: { action, theta, q, late(bool), ballV:{x,y,z}, offSign, batSkill, power }
  const s = o.offSign;
  const ballSpeed = Math.hypot(o.ballV.x, o.ballV.y, o.ballV.z);
  if (o.q < 0.12) return { kind: 'miss' };
  if (o.q < 0.27) {
    const r = Math.random();
    if (r < 0.28) return { kind: 'edge', inside: true, v: dirVec(-(Math.PI - rnd(0.3, 1.2)), ballSpeed * 0.3, -0.08, s) };
    if (o.late || r < 0.75) {
      // outside edge, flies behind on off side
      const th = Math.PI - rnd(0.15, 0.85);
      const sp = ballSpeed * rnd(0.45, 0.75);
      const up = rnd(-0.06, 0.18);
      return { kind: 'edge', v: dirVec(th, sp, up, s) };
    }
    // leading edge / top edge
    if (o.action === 'loft' || Math.random() < 0.5) return { kind: 'edge', v: dirVec(o.theta + rnd(-0.7, 0.7), rnd(10, 18), rnd(0.55, 1.1), s) };
    return { kind: 'edge', v: dirVec(rnd(0.6, 1.5), rnd(9, 16), rnd(0.2, 0.5), s) };
  }
  const q = o.q;
  const pow = (o.power != null ? o.power : o.batSkill) / 100;
  const theta = o.theta + gauss() * (1 - q) * 0.45;
  let speed, up;
  if (o.action === 'defend') { speed = 2.5 + 4 * q; up = -0.15; }
  else if (o.action === 'drive') {
    speed = 15 + 20 * q + (pow - 0.75) * 9 + ballSpeed * 0.12;
    up = -0.07 + (1 - q) * (1 - q) * rnd(0, 0.55) + (Math.random() < 0.06 ? 0.08 : 0);
  } else {
    speed = 17 + 23 * q + (pow - 0.75) * 12 + ballSpeed * 0.08;
    up = 0.4 + (1 - q) * rnd(0.15, 0.75);
  }
  speed = Math.max(3, speed);
  return { kind: 'hit', v: dirVec(theta, speed, up, s) };
}

// theta off-positive, 0 = straight down the ground towards bowler (-z); up = launch angle (rad)
export function dirVec(theta, speed, up, s) {
  const h = Math.cos(up) * speed;
  return { x: Math.sin(theta) * s * h, y: Math.sin(up) * speed, z: -Math.cos(theta) * h };
}

// Simulate a hit ball until it stops, crosses rope, or 12s.
export function simulateHit(p0, v0) {
  const dt = 1 / 120;
  const p = { ...p0 }, v = { ...v0 };
  const samples = [];
  let t = 0, bounced = false, rolling = false, boundary = 0, tBoundary = null, firstBounce = null;
  samples.push({ t: 0, x: p.x, y: p.y, z: p.z, air: true });
  while (t < 14) {
    if (!rolling) {
      const sp = Math.hypot(v.x, v.y, v.z);
      v.x -= AIR_K * sp * v.x * dt; v.y -= AIR_K * sp * v.y * dt + G * dt; v.z -= AIR_K * sp * v.z * dt;
      p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
      if (p.y <= BALL_R && v.y < 0) {
        p.y = BALL_R;
        if (!bounced) { bounced = true; firstBounce = { t, x: p.x, z: p.z }; }
        if (Math.abs(v.y) > 1.6) { const k = Math.abs(v.y) > 8 ? 0.62 : 0.82; v.y = -v.y * 0.32; v.x *= k; v.z *= k; }
        else { v.y = 0; rolling = true; }
      }
    } else {
      const sp = Math.hypot(v.x, v.z);
      if (sp < 0.15) { v.x = v.z = 0; samples.push({ t, x: p.x, y: p.y, z: p.z, air: false }); break; }
      const ns = Math.max(0, sp - (GROUND_A * sp + GROUND_B) * dt);
      v.x *= ns / sp; v.z *= ns / sp;
      p.x += v.x * dt; p.z += v.z * dt;
    }
    t += dt;
    samples.push({ t, x: p.x, y: p.y, z: p.z, air: !bounced });
    if (distToCentre(p.x, p.z) > BOUNDARY_R) { boundary = bounced ? 4 : 6; tBoundary = t; break; }
  }
  return { samples, boundary, tBoundary, firstBounce, duration: t, end: { ...p } };
}

// --------------- Fielding ---------------
// fielders: [{ idx, x, z, speed, fld, keeper }]
export function planFielding(hit, fielders) {
  const S = hit.samples;
  let best = null;
  for (const f of fielders) {
    const react = f.keeper ? 0.12 : 0.28;
    const reach = f.keeper ? 1.6 : 1.25;
    let missUntil = -1;
    for (let i = 1; i < S.length; i++) {
      const b = S[i];
      if (b.t < missUntil) continue;
      if (b.t < react + 0.05) continue;
      if (f.keeper && b.z < S[i - 1].z && b.t < 1.2) continue; // ball moving away from keeper
      if (best && b.t >= best.t) break;
      if (b.y > 3.0) continue;
      const d = Math.hypot(b.x - f.x, b.z - f.z);
      const need = Math.max(0, d - reach);
      const avail = Math.max(0, b.t - react) * f.speed;
      if (need > avail) continue;
      // ball speed here
      const a = S[i - 1];
      const bs = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / Math.max(1e-4, b.t - a.t);
      const effort = avail > 0 ? need / avail : (need > 0 ? 1 : 0);
      if (b.air && b.y > 0.12) {
        if (b.y > 2.6 && !f.keeper) continue;
        // catch chance
        let pc = 0.93 + (f.fld - 78) / 150 - Math.max(0, bs - 18) * 0.012 - effort * 0.22 - (need > 0.6 ? 0.08 : 0);
        if (b.y < 0.35) pc -= 0.18;
        if (f.keeper) pc += 0.04;
        pc = clamp(pc, 0.08, 0.98);
        const caught = Math.random() < pc;
        best = { kind: caught ? 'catch' : 'drop', f, t: b.t, p: { x: b.x, y: b.y, z: b.z }, pc, i };
        break;
      } else if (b.y <= 1.4) {
        // ground stop
        let ps = 0.97 + (f.fld - 78) / 200 - Math.max(0, bs - 16) * 0.025 - effort * 0.3;
        if (need < 0.3) ps += 0.1;
        ps = clamp(ps, 0.1, 0.995);
        if (Math.random() < ps) { best = { kind: 'stop', f, t: b.t, p: { x: b.x, y: b.y, z: b.z }, i, dive: need > 0.4 && effort > 0.8 }; break; }
        missUntil = b.t + 0.5;
      }
    }
  }
  if (hit.boundary && (!best || best.t > hit.tBoundary)) {
    return { kind: 'boundary', runs: hit.boundary, t: hit.tBoundary, chaser: nearestChaser(hit, fielders) };
  }
  if (!best) {
    // ball stopped without fielder getting to it before stop: nearest fielder retrieves
    const e = hit.end; let nf = null, nd = 1e9;
    for (const f of fielders) { const d = Math.hypot(e.x - f.x, e.z - f.z); if (d < nd) { nd = d; nf = f; } }
    const tArrive = Math.max(hit.duration, 0.3 + nd / nf.speed);
    return { kind: 'stop', f: nf, t: tArrive, p: { x: e.x, y: BALL_R, z: e.z }, i: S.length - 1 };
  }
  if (best.kind === 'drop') {
    best.t += 0.7; // fumble then gather
  }
  return best;
}

function nearestChaser(hit, fielders) {
  const e = hit.samples[hit.samples.length - 1];
  let nf = null, nd = 1e9;
  for (const f of fielders) { if (f.keeper) continue; const d = Math.hypot(e.x - f.x, e.z - f.z); if (d < nd) { nd = d; nf = f; } }
  return nf;
}

// Running between wickets. Returns { runs, runOut:bool, outEnd, throwEnd, tThrow, tArrive, runTimes[] }
export function planRuns(field, opts) {
  // opts: { speedStriker, speedNon, aggression, isKeeperStop }
  const first = 2.85 - opts.speed * 0.6;
  const next = 2.5 - opts.speed * 0.5;
  const pick = field.t + (field.f && field.f.keeper ? 0.15 : 0.35);
  const throwSpeed = 27 + (field.f ? (field.f.fld - 75) * 0.15 : 0);
  const ends = [{ x: 0, z: 0 }, { x: 0, z: -PITCH }];
  const cum = [0];
  for (let n = 1; n <= 4; n++) cum[n] = first + (n - 1) * next;
  // run n ends at: odd -> striker reaches bowler end (z=-PITCH); keeper end danger for non-striker too.
  const arrive = (endIdx) => {
    const e = ends[endIdx];
    const d = Math.hypot(field.p.x - e.x, field.p.z - e.z);
    return pick + (d < 3 ? 0.4 : d / throwSpeed + 0.25);
  };
  // fielder throws to the end that is most dangerous; batter safe if completes before arrival
  let runs = 0;
  for (let n = 1; n <= 4; n++) {
    const tArr = Math.min(arrive(0), arrive(1));
    const slack = tArr - cum[n];
    if (slack > 0.3) runs = n;
    else if (slack > -0.25 && Math.random() < opts.aggression * 0.35 && n <= 3) {
      // risky run
      const out = slack + gauss() * 0.25 < 0;
      if (out) return { runs: n - 1, runOut: true, tOut: tArr, cum, pick, throwSpeed, endIdx: arrive(0) < arrive(1) ? 0 : 1 };
      runs = n; break;
    } else break;
  }
  if (field.f && field.f.keeper && runs > 0 && Math.hypot(field.p.x, field.p.z) < 6) runs = Math.min(runs, 1);
  // choose throw end: the end the batter is running to on last run
  const endIdx = runs % 2 === 1 ? 1 : 0;
  return { runs, runOut: false, cum, pick, throwSpeed, endIdx: runs === 0 ? (Math.abs(field.p.z) < Math.abs(field.p.z + PITCH) ? 0 : 1) : endIdx };
}

// Field placements: returns 9 positions (excluding bowler & keeper) as {name, u, z} with u off-positive.
const POS = {
  slip1: [1.2, 16], slip2: [2.2, 15.6], slip3: [3.2, 15], gully: [6.5, 11], point: [20, -2], backPoint: [19, 6],
  cover: [18, -12], extraCover: [14, -18], midOff: [8, -24], midOn: [-8, -24], midWicket: [-18, -10],
  squareLeg: [-20, -1], fineLeg: [-25, 50], shortFine: [-10, 14], thirdMan: [22, 46], longOn: [-22, -68],
  longOff: [22, -68], deepCover: [52, -30], deepMid: [-52, -32], deepSquare: [-58, -4], deepPoint: [58, -2],
  cowCorner: [-46, -50], shortLeg: [-3.2, -2], sillyPoint: [3, -2.5], legSlip: [-1.8, 12], deepFine: [-36, 48], sweeper: [56, -40],
  legGully: [-6, 9], fly: [-30, 40],
};
const FIELDS = {
  T20: {
    pace: ['slip1', 'point', 'cover', 'midOff', 'midOn', 'midWicket', 'deepSquare', 'fineLeg', 'thirdMan'],
    spin: ['point', 'cover', 'midOff', 'midOn', 'midWicket', 'deepMid', 'longOn', 'longOff', 'deepSquare'],
    death: ['point', 'extraCover', 'deepCover', 'longOff', 'longOn', 'deepMid', 'deepSquare', 'fineLeg', 'thirdMan'],
  },
  ODI: {
    pace: ['slip1', 'slip2', 'gully', 'point', 'cover', 'midOff', 'midOn', 'squareLeg', 'fineLeg'],
    spin: ['slip1', 'point', 'cover', 'midOff', 'midOn', 'midWicket', 'deepMid', 'longOn', 'deepPoint'],
    death: ['point', 'cover', 'longOff', 'longOn', 'deepMid', 'deepSquare', 'deepCover', 'fineLeg', 'thirdMan'],
  },
  TEST: {
    pace: ['slip1', 'slip2', 'slip3', 'gully', 'point', 'cover', 'midOff', 'midOn', 'fineLeg'],
    spin: ['slip1', 'shortLeg', 'sillyPoint', 'point', 'cover', 'midOff', 'midOn', 'midWicket', 'deepSquare'],
    death: ['slip1', 'gully', 'point', 'cover', 'midOff', 'midOn', 'squareLeg', 'fineLeg', 'thirdMan'],
  },
};
export const FIELD_PRESETS = ['Attacking', 'Balanced', 'Defensive'];

export function fieldPositions(format, spin, phase, offSign, preset) {
  const F = FIELDS[format];
  let key = spin ? 'spin' : 'pace';
  if (preset === 'Defensive' || phase === 'death') key = format === 'TEST' && !spin ? 'death' : (spin ? 'spin' : 'death');
  if (preset === 'Defensive' && spin) key = 'spin';
  let names = F[key].slice();
  if (preset === 'Attacking' && !spin) names = FIELDS.TEST.pace.slice();
  if (preset === 'Attacking' && spin) names = FIELDS.TEST.spin.slice();
  if (preset === 'Defensive' && spin) names = ['point', 'deepCover', 'longOff', 'longOn', 'deepMid', 'deepSquare', 'midWicket', 'cover', 'fineLeg'];
  return names.map(n => ({ name: n, x: POS[n][0] * offSign, z: POS[n][1] }));
}

export function posLabel(name) {
  return name.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).replace('1', '').replace('2', '').replace('3', '');
}
