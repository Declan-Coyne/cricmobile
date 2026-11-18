// AI: bowler delivery selection, batter shot selection, aggression, quick-sim
import { isSpin } from './data.js';
import { curInn, requiredRate, oversLeftInMatch, teamTotals } from './rules.js';
import * as R from './rules.js';
import { clamp, rnd, gauss, naturalAngle } from './physics.js';

export function aggression(m, batter) {
  const inn = curInn(m);
  let a;
  if (m.format === 'T20') {
    const ov = inn.balls / 6, tot = m.overs;
    a = ov < tot * 0.3 ? 0.68 : ov < tot * 0.8 ? 0.6 : 0.88;
  } else if (m.format === 'ODI') {
    const ov = inn.balls / 6, tot = m.overs;
    a = ov < tot * 0.2 ? 0.45 : ov < tot * 0.8 ? 0.36 : 0.75;
  } else {
    a = 0.14;
    const tot = teamTotals(m);
    const lead = tot[inn.bat] - tot[inn.bowl];
    if (m.cur === 2 && lead > 200) a = 0.4;
    if (m.cur === 3 && inn.target) {
      const need = inn.target - inn.runs; const left = oversLeftInMatch(m);
      if (left > 0 && need / left > 4.5) a = 0.12; // block for a draw
      else if (left > 0 && need / left > 3) a = 0.35;
    }
  }
  const rr = requiredRate(m);
  if (rr && m.format !== 'TEST') {
    const crr = m.format === 'T20' ? 8.5 : 5.5;
    a += clamp((rr.rrr - crr) * 0.05, -0.2, 0.3);
  }
  // wickets in hand restrain
  if (m.format !== 'TEST' && inn.wkts >= 7) a -= 0.08;
  if (batter) {
    const bs = inn.bs[batter.id];
    if (bs && bs.b < 6) a -= 0.08;
    if (batter.batSkill < 45) a += 0.15;
  }
  return clamp(a, 0.05, 0.98);
}

// ---------- AI bowler ----------
export function aiDelivery(m, bowler, batter, ballNo) {
  const spin = isSpin(bowler.style);
  const inn = curInn(m);
  const death = m.overs && inn.balls / 6 >= m.overs * 0.8;
  const r = Math.random();
  let type = 'stock', len = 6, u = 0.15;
  if (!spin) {
    if (death) {
      if (r < 0.35) { type = 'yorker'; len = 1.0; u = 0.05; }
      else if (r < 0.55) { type = 'slower'; len = 5.5; u = 0.2; }
      else if (r < 0.7) { type = 'bouncer'; len = 10.8; u = 0.0; }
      else { type = 'stock'; len = rnd(4.5, 6.5); u = rnd(0.25, 0.6); }
    } else {
      if (r < 0.28) { type = 'out'; len = rnd(5, 7); u = rnd(0.12, 0.35); }
      else if (r < 0.42) { type = 'in'; len = rnd(4.5, 6.5); u = rnd(-0.05, 0.15); }
      else if (r < 0.5) { type = 'bouncer'; len = rnd(10, 11.5); u = rnd(-0.1, 0.2); }
      else if (r < 0.56) { type = 'yorker'; len = 1.1; u = 0.0; }
      else if (r < 0.63) { type = 'cutter'; len = rnd(5.5, 7.5); u = rnd(0.05, 0.3); }
      else if (r < 0.68 && m.format !== 'TEST') { type = 'slower'; len = rnd(5, 7); u = 0.15; }
      else { type = 'stock'; len = rnd(5.5, 7.5); u = rnd(0.08, 0.32); }
    }
  } else {
    if (r < 0.5) { type = 'stock'; len = rnd(3.8, 5.2); u = rnd(-0.05, 0.25); }
    else if (r < 0.65) { type = 'flight'; len = rnd(3, 4.2); u = rnd(0.05, 0.3); }
    else if (r < 0.78) { type = 'quick'; len = rnd(4.5, 5.8); u = rnd(-0.05, 0.12); }
    else if (r < 0.88) { type = 'arm'; len = rnd(4, 5.2); u = rnd(-0.05, 0.1); }
    else { type = 'wrong'; len = rnd(3.8, 5); u = rnd(0, 0.25); }
    if (death) len -= 0.5;
  }
  // test match: more patience, fourth/fifth stump channel
  if (m.format === 'TEST' && !spin && type !== 'bouncer') u += 0.08;
  return { type, target: { u, len } };
}

// ---------- AI batter ----------
// info: { u (line at bat, off-positive), y (height at bat), len, fullToss, kmh, swing, dev, spin, wide }
export function threatOf(info) {
  let L;
  const len = info.fullToss ? -1 : info.len;
  if (len < 0) L = 0.1;
  else if (len < 1.5) L = Math.abs(info.uStumps) < 0.2 ? 0.9 : 0.35;
  else if (len < 3) L = 0.35;
  else if (len < 4.3) L = info.spin ? 0.8 : 0.7;
  else if (len < 7.5) L = info.spin ? 0.6 : 1;
  else if (len < 9.5) L = 0.5;
  else L = (info.y > 1.2 && info.y < 1.9) ? 0.7 : 0.3;
  const u = info.u;
  let Ln;
  if (u > 0.08 && u < 0.5) Ln = 1;
  else if (Math.abs(u) <= 0.08) Ln = 0.85;
  else if (u >= 0.5 && u < 0.75) Ln = 0.55;
  else if (u >= 0.75) Ln = 0.2;
  else Ln = 0.3;
  const mv = clamp((Math.abs(info.swingDisp || 0) + Math.abs(info.turnDisp || 0)) * 0.9, 0, 0.3);
  const pace = info.spin ? 0.05 : clamp((info.kmh - 120) / 30, 0, 1) * 0.15;
  return clamp(0.1 + 0.6 * L * Ln + mv + pace, 0, 1);
}

const DIFF_AI_BAT = { easy: -0.08, normal: 0, hard: 0.05, legend: 0.1 };

export function aiShot(m, batter, bowler, info, level = 'normal') {
  const A = aggression(m, batter);
  const T = threatOf(info);
  const u = info.u;
  const userBowling = m.userTeam === curInn(m).bowl;
  const diff = userBowling ? (DIFF_AI_BAT[level] || 0) : 0;
  // leave?
  const leaveP = m.format === 'TEST' ? 0.85 : m.format === 'ODI' ? 0.45 : 0.15;
  if (u > 0.42 && !info.fullToss && !(info.len > 8.5 && A > 0.5) && Math.random() < leaveP * (1 - A * 0.5)) return { action: 'leave' };
  if (info.y > 1.55 && Math.random() < 0.6 - A * 0.3) return { action: 'leave' }; // duck the bouncer
  // shot choice
  const goodBall = T > 0.62;
  let attackP = clamp(A * (1.35 - T), 0.03, 0.97);
  if (info.fullToss || (info.len > 1.4 && info.len < 3 && Math.abs(u) < 0.6) || (info.len > 8.5 && info.y < 1.3)) attackP += 0.25;
  let action = Math.random() < attackP ? 'drive' : 'defend';
  if (action === 'drive') {
    let loftP = A * A * 0.62;
    if (info.fullToss || info.len < 3 || info.len > 8) loftP += 0.15;
    if (m.format === 'TEST') loftP *= 0.25;
    if (Math.random() < loftP) action = 'loft';
  }
  let theta = naturalAngle(u, info.y) + gauss() * 0.3;
  if (action === 'defend') theta = clamp(u * 0.9, -0.6, 0.6);
  // quality
  let mu = 0.64 + 0.34 * (batter.batSkill - 75) / 25 - 0.42 * (T - 0.5) - 0.1 * (bowler.bowlSkill - 80) / 20 + diff;
  if (action === 'loft') mu -= 0.06 + (goodBall ? 0.1 : 0);
  if (action === 'defend') mu += 0.18;
  const bs = curInn(m).bs[batter.id];
  if (bs && bs.b < 8) mu -= 0.05; // not set yet
  if (bs && bs.b > 40) mu += 0.04;
  let q = clamp(mu + gauss() * 0.2, 0, 1);
  return { action, theta, q, late: Math.random() < 0.6 };
}

// ---------- Quick simulation of a ball ----------
const BASE = {
  T20: { dot: 0.35, 1: 0.35, 2: 0.075, 3: 0.006, 4: 0.13, 6: 0.055, W: 0.046, wd: 0.035, nb: 0.006 },
  ODI: { dot: 0.5, 1: 0.32, 2: 0.06, 3: 0.006, 4: 0.094, 6: 0.016, W: 0.021, wd: 0.028, nb: 0.004 },
  TEST: { dot: 0.74, 1: 0.14, 2: 0.035, 3: 0.008, 4: 0.056, 6: 0.003, W: 0.0112, wd: 0.006, nb: 0.004 },
};

export function simBall(m, batter, bowler, fielders, keeperId) {
  const B = { ...BASE[m.format] };
  const A = aggression(m, batter);
  const baseA = m.format === 'T20' ? 0.65 : m.format === 'ODI' ? 0.42 : 0.14;
  const d = (batter.batSkill - bowler.bowlSkill) / 28;
  const ag = (A - baseA) * 2.2;
  B.W *= Math.exp(-0.55 * d + 0.7 * ag);
  if (batter.batSkill < 45) B.W *= 1.35;
  if (batter.batSkill < 30) B.W *= 1.3;
  B[4] *= Math.exp(0.35 * d + 0.45 * ag);
  B[6] *= Math.exp(0.5 * d + 0.9 * ag);
  B[1] *= Math.exp(0.15 * d + 0.15 * ag);
  B.wd *= 1.6 - bowler.bowlSkill / 120;
  let tot = 0; for (const k in B) if (k !== 'dot') tot += B[k];
  B.dot = Math.max(0.05, 1 - tot);
  let r = Math.random() * (tot + B.dot);
  let key = 'dot';
  for (const k of ['W', 'wd', 'nb', 6, 4, 3, 2, 1]) { if (r < B[k]) { key = String(k); break; } r -= B[k]; }
  const o = { runs: 0, extra: null, boundary: 0, wicket: null };
  if (key === 'dot') return o;
  if (key === 'wd') { o.extra = { type: 'wd', runs: Math.random() < 0.08 ? 5 : 1 }; return o; }
  if (key === 'nb') { o.extra = { type: 'nb', runs: 1 }; o.runs = Math.random() < 0.3 ? 1 : 0; return o; }
  if (key === 'W') {
    const spin = isSpin(bowler.style);
    const rr = Math.random();
    let type;
    if (spin) type = rr < 0.5 ? 'caught' : rr < 0.68 ? 'lbw' : rr < 0.84 ? 'bowled' : rr < 0.93 ? 'stumped' : 'runout';
    else type = rr < 0.6 ? 'caught' : rr < 0.76 ? 'bowled' : rr < 0.93 ? 'lbw' : 'runout';
    let fielder = null;
    if (type === 'caught') {
      const pr = Math.random();
      if (!spin && pr < 0.32) fielder = keeperId;
      else if (pr < 0.4) fielder = bowler.id;
      else fielder = fielders[Math.floor(Math.random() * fielders.length)];
    }
    if (type === 'stumped') fielder = keeperId;
    if (type === 'runout') fielder = fielders[Math.floor(Math.random() * fielders.length)];
    o.wicket = { type, fielder, who: type === 'runout' && Math.random() < 0.4 ? 'nonstriker' : 'striker' };
    if (type === 'runout') o.runs = Math.random() < 0.5 ? 1 : 0;
    return o;
  }
  o.runs = +key;
  if (key === '4' || key === '6') o.boundary = +key;
  return o;
}

// Quick-sim until mode is reached: 'over' | 'innings' | 'match'. The user's batting side never auto-declares.
export function simulateMatch(m, teams, mode = 'match') {
  const P = id => R.findPlayer(teams, id);
  const startOverBalls = curInn(m).balls;
  let guard = 0;
  while (!m.result && guard++ < 20000) {
    const inn = curInn(m);
    if (inn.done) {
      if (mode !== 'match') break;
      const nx = R.nextInnings(m);
      if (nx === null) break;
      if (typeof nx === 'object') { const enforce = Math.random() < 0.7; m.followOn = enforce; R.startInnings(m, enforce ? 1 - nx.leader : nx.leader); }
      else R.startInnings(m, nx);
      continue;
    }
    if (!inn.curBowler) {
      if (mode === 'over' && inn.balls > startOverBalls) break;
      R.setBowler(m, R.aiPickBowler(m, teams));
    }
    if (m.format === 'TEST' && R.aiShouldDeclare(m) && m.userTeam !== inn.bat) { R.declare(m); continue; }
    R.applyBall(m, simBall(m, P(inn.striker), P(inn.curBowler), m.xi[inn.bowl], m.keeper[inn.bowl]));
    if (mode === 'over' && !inn.curBowler) break;
    if (mode === 'innings' && inn.done) break;
  }
}
