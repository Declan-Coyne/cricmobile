// Series & tournaments: fixtures, standings, knockouts. Pure JSON-serialisable data, saved by main.js.
import * as R from './rules.js';
import { simulateMatch } from './ai.js';
import { defaultXI, defaultKeeper } from './data.js';

// Knockout refs: 'A1' = group A winner of the previous stage, 'W:<fixture>' / 'L:<fixture>' = winner / loser of a knockout fixture.
const PLAYOFFS = [['Qualifier 1', 'A1', 'A2'], ['Eliminator', 'A3', 'A4'], ['Qualifier 2', 'L:Qualifier 1', 'W:Eliminator'], ['Final', 'W:Qualifier 1', 'W:Qualifier 2']];
const SEMIS = (a, b, c, d) => [['Semi-final 1', a, b], ['Semi-final 2', c, d], ['Final', 'W:Semi-final 1', 'W:Semi-final 2']];
// T20 leagues: round robin (games = matches per team, else every pair `rounds` times), then the IPL-style top-4 playoffs.
const league = (name, cat, games, note) => ({ name, cat, format: 'T20', note, stages: [{ name: 'League', groups: 'cat', rounds: 2, games }, { name: 'Playoffs', ko: PLAYOFFS }] });

export const COMPS = {
  TEST: { name: 'Test Series', format: 'TEST', bilateral: [2, 3, 5], dflt: 5 },
  ODI: { name: 'ODI Series', format: 'ODI', bilateral: [3, 5], dflt: 3 },
  T20I: { name: 'T20I Series', format: 'T20', bilateral: [3, 5], dflt: 3 },
  ODIWC: {
    name: 'ODI World Cup', format: 'ODI', note: '10 teams · everyone plays everyone · top 4 to the semi-finals',
    stages: [{ name: 'League', groups: { A: ['IND', 'SA', 'AUS', 'NZ', 'PAK', 'AFG', 'ENG', 'BAN', 'SL', 'NED'] }, rounds: 1 }, { name: 'Knockouts', ko: SEMIS('A1', 'A4', 'A2', 'A3') }],
  },
  T20WC: {
    name: 'T20 World Cup', format: 'T20', note: '20 teams · 4 groups of 5 · top 2 to the Super 8 · semis · final',
    stages: [
      { name: 'Group stage', groups: { A: ['IND', 'PAK', 'USA', 'NED', 'NAM'], B: ['AUS', 'SL', 'IRE', 'ZIM', 'OMA'], C: ['ENG', 'WI', 'SCO', 'NEP', 'ITA'], D: ['SA', 'NZ', 'AFG', 'CAN', 'UAE'] }, rounds: 1 },
      { name: 'Super 8', groups: { 1: ['A1', 'B2', 'C1', 'D2'], 2: ['B1', 'A2', 'D1', 'C2'] }, rounds: 1 },
      { name: 'Knockouts', ko: SEMIS('11', '22', '21', '12') },
    ],
  },
  IPL: league('IPL', 'IPL', 14, '10 teams · 14 league games each · Qualifiers, Eliminator & Final'),
  BBL: league('Big Bash League', 'BBL', 10, '8 teams · 10 league games each · Qualifier, Knockout, Challenger & Final'),
  PSL: league('PSL', 'PSL', 10, '8 teams · 10 league games each · top-4 playoffs'),
  SA20: league('SA20', 'SA20', null, '6 teams · double round robin · top-4 playoffs'),
  CPL: league('CPL', 'CPL', null, 'Double round robin · top-4 playoffs'),
  BPL: league('BPL', 'BPL', null, 'Double round robin · top-4 playoffs'),
  LPL: league('LPL', 'LPL', null, '5 teams · double round robin · top-4 playoffs'),
};

export function participants(key, teams) {
  const c = COMPS[key];
  if (c.bilateral) return Object.keys(teams).filter(id => teams[id].cat === 'International');
  const g = c.stages[0].groups;
  return (g === 'cat' ? Object.keys(teams).filter(id => teams[id].cat === c.cat) : Object.values(g).flat()).filter(id => teams[id]);
}

function roundRobin(ids, cycles) {
  const t = ids.slice(); if (t.length % 2) t.push(null); // null = bye
  const n = t.length, rounds = [];
  for (let c = 0; c < cycles; c++) {
    const arr = t.slice();
    for (let r = 0; r < n - 1; r++) {
      const rd = [];
      for (let i = 0; i < n / 2; i++) { const a = arr[i], b = arr[n - 1 - i]; if (a && b) rd.push(c % 2 ? [b, a] : [a, b]); }
      rounds.push(rd);
      arr.splice(1, 0, arr.pop());
    }
  }
  return rounds;
}

export function newSeries(key, user, opp, count, teams) {
  const c = COMPS[key];
  const s = { id: Date.now(), key, name: c.name, format: c.format, overs: R.FORMATS[c.format].overs, user, fixtures: [], stage: 0, groups: [], tables: {}, stats: {}, done: false, champion: null };
  if (c.bilateral) {
    s.bilateral = true; s.opp = opp;
    s.name = `${teams[user].short} v ${teams[opp].short} · ${count}-match ${c.name}`;
    for (let i = 0; i < count; i++) s.fixtures.push({ name: (c.format === 'TEST' ? 'Test ' : 'Match ') + (i + 1), a: user, b: opp, stage: 0 });
  } else startStage(s, teams, 0);
  return s;
}

function startStage(s, teams, i) {
  const st = COMPS[s.key].stages[i]; s.stage = i;
  if (st.ko) { st.ko.forEach(([name, a, b]) => s.fixtures.push({ name, a: resolve(s, a), b: resolve(s, b), stage: i, ko: true })); return; }
  const groups = st.groups === 'cat' ? { A: participants(s.key, teams) } : st.groups;
  const multi = Object.keys(groups).length > 1;
  s.groups[i] = {};
  const fx = [];
  for (const [g, refs] of Object.entries(groups)) {
    const ids = refs.map(r => resolve(s, r)).filter(id => teams[id]);
    s.groups[i][g] = ids;
    let rounds = roundRobin(ids, st.games ? 2 : st.rounds);
    if (st.games) rounds = rounds.slice(0, st.games);
    rounds.forEach((rd, ri) => rd.forEach(([a, b]) => fx.push({ name: `${st.name}${multi ? ' · Group ' + g : ''} · Round ${ri + 1}`, a, b, stage: i, group: g, round: ri })));
  }
  fx.sort((x, y) => x.round - y.round); // interleave groups round by round
  s.fixtures.push(...fx);
}

function resolve(s, ref) {
  if (!ref) return ref;
  const ko = /^([WL]):(.+)$/.exec(ref);
  if (ko) { const f = s.fixtures.find(x => x.name === ko[2]); return f && f.done ? (ko[1] === 'W' ? f.res.w : (f.res.w === f.a ? f.b : f.a)) : ref; }
  const g = /^(.+)(\d)$/.exec(ref); // team ids never contain digits
  return g && s.tables[g[1]] ? s.tables[g[1]][+g[2] - 1] : ref;
}
export function refLabel(ref) {
  const ko = /^([WL]):(.+)$/.exec(ref);
  return ko ? (ko[1] === 'W' ? 'Winner ' : 'Loser ') + ko[2] : ref;
}

// Sim every AI fixture up to the user's next one. Returns that fixture's index, or -1 when the series is over.
export function advance(s, teams) {
  for (let guard = 0; guard < 5000; guard++) {
    const i = s.fixtures.findIndex(x => !x.done);
    if (i < 0) {
      const stages = COMPS[s.key].stages;
      if (!s.bilateral && s.stage + 1 < stages.length) {
        s.tables = {};
        for (const g of Object.keys(s.groups[s.stage] || {})) s.tables[g] = table(s, s.stage, g).map(r => r.id);
        startStage(s, teams, s.stage + 1); continue;
      }
      finish(s, teams); return -1;
    }
    const f = s.fixtures[i];
    f.a = resolve(s, f.a); f.b = resolve(s, f.b);
    if (f.a === s.user || f.b === s.user) return i;
    record(s, f, simFixture(s, f, teams), teams);
  }
  return -1;
}

export function makeMatch(s, f, teams) {
  const A = teams[f.a], B = teams[f.b];
  const xiA = defaultXI(A, s.format), xiB = defaultXI(B, s.format);
  const m = R.newMatch({ format: s.format, overs: s.overs, teamA: f.a, teamB: f.b, xiA, xiB, keeperA: defaultKeeper(A, xiA, s.format), keeperB: defaultKeeper(B, xiB, s.format), userTeam: -1 }, teams);
  R.startInnings(m, Math.random() < 0.5 ? 0 : 1);
  return m;
}
export function simFixture(s, f, teams) { const m = makeMatch(s, f, teams); simulateMatch(m, teams); return m; }

export function record(s, f, m, teams) {
  if (f.done) return;
  const r = m.result;
  let w = r && r.winner >= 0 ? m.teamIds[r.winner] : null;
  let text = R.resultText(m, teams) || 'No result';
  // shortcut: knockout ties go to a coin-flip "Super Over" instead of a played one.
  if (!w && f.ko) { w = Math.random() < 0.5 ? f.a : f.b; text += ` · ${teams[w].short} win the Super Over`; }
  const side = id => {
    let runs = 0, balls = 0;
    for (const inn of m.innings) if (m.teamIds[inn.bat] === id) { runs += inn.runs; balls += m.overs && inn.wkts >= 10 ? m.overs * 6 : inn.balls; }
    return [runs, balls];
  };
  const [ra, ba] = side(f.a), [rb, bb] = side(f.b);
  f.res = { w, text, score: m.innings.map(i => `${teams[m.teamIds[i.bat]].short} ${i.runs}/${i.wkts}${i.declared ? 'd' : ''}`).join(' · '), ra, ba, rb, bb };
  f.done = true;
  for (const inn of m.innings) {
    const st = id => s.stats[id] = s.stats[id] || { name: m.names[id], team: id.split('_')[0], r: 0, hs: 0, w: 0, rc: 0 };
    for (const [id, b] of Object.entries(inn.bs)) if (b.b || b.out) { const x = st(id); x.r += b.r; x.hs = Math.max(x.hs, b.r); }
    for (const [id, b] of Object.entries(inn.bw)) { const x = st(id); x.w += b.wkts; x.rc += b.runs; }
  }
}

// Points table: win 2, tie / draw / no result 1. Sorted by points then net run rate.
export function table(s, stage, g) {
  const rows = {};
  for (const id of s.groups[stage][g]) rows[id] = { id, p: 0, w: 0, l: 0, nr: 0, pts: 0, rf: 0, bf: 0, rag: 0, bag: 0 };
  for (const f of s.fixtures) {
    if (f.stage !== stage || f.group !== g || !f.done) continue;
    const A = rows[f.a], B = rows[f.b];
    A.p++; B.p++;
    if (f.res.w === f.a) { A.w++; B.l++; A.pts += 2; } else if (f.res.w === f.b) { B.w++; A.l++; B.pts += 2; } else { A.nr++; B.nr++; A.pts++; B.pts++; }
    A.rf += f.res.ra; A.bf += f.res.ba; A.rag += f.res.rb; A.bag += f.res.bb;
    B.rf += f.res.rb; B.bf += f.res.bb; B.rag += f.res.ra; B.bag += f.res.ba;
  }
  for (const r of Object.values(rows)) r.nrr = (r.bf ? r.rf * 6 / r.bf : 0) - (r.bag ? r.rag * 6 / r.bag : 0);
  return Object.values(rows).sort((a, b) => b.pts - a.pts || b.nrr - a.nrr || b.w - a.w);
}

export function seriesScore(s) {
  const w = { [s.user]: 0, [s.opp]: 0 }; let d = 0;
  for (const f of s.fixtures) if (f.done) { if (f.res.w) w[f.res.w]++; else d++; }
  return { w, d };
}

function finish(s, teams) {
  s.done = true;
  if (s.bilateral) { const { w } = seriesScore(s); s.champion = w[s.user] > w[s.opp] ? s.user : w[s.opp] > w[s.user] ? s.opp : null; }
  else s.champion = s.fixtures[s.fixtures.length - 1].res.w;
  const best = Object.entries(s.stats).sort(([, a], [, b]) => (b.r + b.w * 20) - (a.r + a.w * 20))[0];
  s.pos = best ? best[0] : null;
}
