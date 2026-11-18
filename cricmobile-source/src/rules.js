// Match state + laws of the game (pure data, JSON-serialisable for save/resume)
import { isSpin } from './data.js';

export const FORMATS = {
  T20: { name: 'T20', overs: 20, innings: 1, maxBowlerFrac: 0.2, ball: 'white' },
  ODI: { name: 'ODI', overs: 50, innings: 1, maxBowlerFrac: 0.2, ball: 'white' },
  TEST: { name: 'Test', overs: null, innings: 2, maxBowlerFrac: 1, ball: 'red' },
};
export const TEST_OVERS_PER_DAY = 90;
export const TEST_DAYS = 5;

export function newMatch(cfg, teams) {
  // cfg: { format, overs, teamA, teamB, xiA, xiB, userTeam (0|1|-1 for none), practice }
  const f = FORMATS[cfg.format];
  const overs = cfg.format === 'TEST' ? null : (cfg.overs || f.overs);
  const m = {
    v: 1, id: Date.now(),
    format: cfg.format, overs,
    maxBowlerOvers: overs ? Math.max(1, Math.ceil(overs * f.maxBowlerFrac)) : 999,
    teamIds: [cfg.teamA, cfg.teamB],
    xi: [cfg.xiA.slice(), cfg.xiB.slice()],
    names: {},
    styles: {},
    keeper: [cfg.keeperA, cfg.keeperB],
    captain: [cfg.xiA[0], cfg.xiB[0]],
    userTeam: cfg.userTeam,
    innings: [], cur: -1, result: null, totalBalls: 0,
    toss: null, followOn: false,
  };
  for (const t of [0, 1]) for (const pid of m.xi[t]) {
    const p = findPlayer(teams, pid);
    m.names[pid] = p ? p.name : pid;
    m.styles[pid] = p ? p.style : '-';
  }
  return m;
}

export function findPlayer(teams, pid) {
  const tid = pid.split('_')[0];
  const t = teams[tid];
  return t ? t.players.find(p => p.id === pid) : null;
}

export function startInnings(m, batTeam) {
  const bowlTeam = 1 - batTeam;
  const order = m.xi[batTeam].slice();
  const inn = {
    bat: batTeam, bowl: bowlTeam, runs: 0, wkts: 0, balls: 0,
    extras: { w: 0, nb: 0, b: 0, lb: 0 },
    order, bs: {}, striker: order[0], nonStriker: order[1], nextIn: 2,
    bw: {}, bowlerOrder: [], curBowler: null, lastOverBowler: null,
    overBalls: [], overRuns: 0, fow: [], partnership: { runs: 0, balls: 0 },
    target: null, declared: false, done: false, freeHit: false, overs: [],
  };
  for (const pid of order) inn.bs[pid] = { r: 0, b: 0, f4: 0, s6: 0, out: null, how: '' };
  m.innings.push(inn);
  m.cur = m.innings.length - 1;
  // target for limited overs 2nd innings / test 4th innings
  if (m.format !== 'TEST' && m.cur === 1) inn.target = m.innings[0].runs + 1;
  if (m.format === 'TEST' && m.cur === 3) {
    const tot = teamTotals(m);
    inn.target = tot[bowlTeam] - tot[batTeam] + 1;
  }
  return inn;
}

export function curInn(m) { return m.innings[m.cur]; }

export function teamTotals(m) {
  const t = [0, 0];
  for (const inn of m.innings) t[inn.bat] += inn.runs;
  return t;
}

// Australian style: wickets/runs, e.g. 3/150
export const score = (runs, wkts) => `${wkts}/${runs}`;

export function oversStr(balls) { return Math.floor(balls / 6) + '.' + (balls % 6); }

export function canBowl(m, pid) {
  const inn = curInn(m);
  if (pid === inn.lastOverBowler) return false;
  if (pid === m.keeper[inn.bowl]) return false;
  const b = inn.bw[pid];
  const overs = b ? Math.floor(b.balls / 6) : 0;
  return overs < m.maxBowlerOvers;
}

export function setBowler(m, pid) {
  const inn = curInn(m);
  inn.curBowler = pid;
  if (!inn.bw[pid]) { inn.bw[pid] = { balls: 0, runs: 0, wkts: 0, maidens: 0, wd: 0, nb: 0 }; inn.bowlerOrder.push(pid); }
  inn.overBalls = []; inn.overRuns = 0;
}

export function needsBowler(m) {
  const inn = curInn(m);
  return !inn.done && !inn.curBowler;
}

// outcome: { runs, extra: null|{type:'wd'|'nb'|'lb'|'b', runs}, boundary: 0|4|6,
//   wicket: null|{type, fielder, who:'striker'|'nonstriker'} }
export function applyBall(m, o) {
  const inn = curInn(m);
  const bw = inn.bw[inn.curBowler];
  const st = inn.bs[inn.striker];
  const ev = { overDone: false, inningsDone: false, matchDone: false, label: '' };
  const isWide = o.extra && o.extra.type === 'wd';
  const isNb = o.extra && o.extra.type === 'nb';
  const legal = !isWide && !isNb;
  let total = (o.runs || 0) + (o.extra ? o.extra.runs : 0);
  const wasFreeHit = inn.freeHit;

  // extras
  if (o.extra) {
    inn.extras[o.extra.type] += o.extra.runs;
    if (isWide) bw.wd += 1;
    if (isNb) bw.nb += 1;
  }
  // bowler conceded: off bat + wides + no-balls (not byes / leg byes)
  bw.runs += (o.runs || 0) + ((isWide || isNb) ? o.extra.runs : 0);
  inn.runs += total;
  inn.overRuns += (isWide || isNb) ? o.extra.runs + (o.runs || 0) : (o.runs || 0);
  inn.partnership.runs += total;

  if (!isWide) {
    st.b += 1; inn.partnership.balls += 1;
    st.r += o.runs || 0;
    if (o.boundary === 4) st.f4++;
    if (o.boundary === 6) st.s6++;
  }
  if (legal) { inn.balls += 1; bw.balls += 1; m.totalBalls += 1; }

  // label for over strip
  let lab = '';
  if (isWide) lab = (o.extra.runs > 1 ? (o.extra.runs - 1) : '') + 'wd';
  else if (isNb) lab = (o.runs ? o.runs : '') + 'nb';
  else if (o.extra && (o.extra.type === 'lb' || o.extra.type === 'b')) lab = o.extra.runs + o.extra.type;
  else lab = String(o.runs || 0);

  // free hit handling (limited overs)
  inn.freeHit = m.format !== 'TEST' && isNb ? true : (isWide ? inn.freeHit : false);

  // wicket
  if (o.wicket && !((wasFreeHit || isNb) && o.wicket.type !== 'runout')) {
    const w = o.wicket;
    const outPid = w.who === 'nonstriker' ? inn.nonStriker : inn.striker;
    const ob = inn.bs[outPid];
    ob.out = w.type;
    ob.how = howOut(m, w, inn.curBowler);
    if (w.type !== 'runout') bw.wkts += 1;
    inn.wkts += 1;
    inn.fow.push({ pid: outPid, score: inn.runs, wkt: inn.wkts, over: oversStr(inn.balls) });
    inn.partnership = { runs: 0, balls: 0 };
    lab = 'W';
    // odd runs completed before run-out swap ends
    if (o.runs % 2 === 1) swapStrike(inn);
    const outIsStriker = (w.who === 'nonstriker') ? (o.runs % 2 === 1) : (o.runs % 2 === 0) ;
    if (inn.wkts >= 10 || inn.nextIn >= inn.order.length) {
      inn.done = true;
      if (outIsStriker) inn.striker = null; else inn.nonStriker = null;
    } else {
      const nb = inn.order[inn.nextIn++];
      if (w.type === 'runout') {
        if (outPid === inn.striker) inn.striker = nb; else inn.nonStriker = nb;
      } else {
        inn.striker = nb;
      }
    }
  } else {
    const ran = (o.runs || 0) + ((o.extra && o.extra.type !== 'nb' && o.extra.type !== 'wd') ? o.extra.runs : 0) + (isWide ? o.extra.runs - 1 : 0);
    if (ran % 2 === 1) swapStrike(inn);
  }
  inn.overBalls.push(lab);
  ev.label = lab;

  // over end
  if (!inn.done && legal && inn.balls % 6 === 0) {
    ev.overDone = true;
    if (inn.overRuns === 0 && inn.overBalls.every(x => x === '0' || x === 'W' || /lb|b$/.test(x))) bw.maidens++;
    inn.overs.push({ bowler: inn.curBowler, balls: inn.overBalls.slice(), runs: inn.overRuns });
    inn.lastOverBowler = inn.curBowler;
    inn.curBowler = null;
    swapStrike(inn);
  }

  // innings end checks
  if (inn.target && inn.runs >= inn.target) inn.done = true;
  if (m.overs && inn.balls >= m.overs * 6) inn.done = true;
  if (inn.wkts >= 10) inn.done = true;
  if (m.format === 'TEST' && m.totalBalls >= TEST_DAYS * TEST_OVERS_PER_DAY * 6) inn.done = true;

  if (inn.done) {
    if (!ev.overDone && inn.overBalls.length) inn.overs.push({ bowler: inn.curBowler, balls: inn.overBalls.slice(), runs: inn.overRuns });
    ev.inningsDone = true;
    const r = checkResult(m);
    if (r) { m.result = r; ev.matchDone = true; }
  }
  return ev;
}

function swapStrike(inn) { const t = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = t; }

function sur(m, pid) { const n = m.names[pid] || '?'; const parts = n.split(' '); return parts.length > 1 ? parts.slice(1).join(' ') : n; }

function howOut(m, w, bowler) {
  const b = sur(m, bowler);
  switch (w.type) {
    case 'bowled': return 'b ' + b;
    case 'lbw': return 'lbw b ' + b;
    case 'caught': return w.fielder === bowler ? 'c & b ' + b : (w.fielder === m.keeper[curInn(m).bowl] ? 'c †' : 'c ') + sur(m, w.fielder) + ' b ' + b;
    case 'stumped': return 'st †' + sur(m, w.fielder) + ' b ' + b;
    case 'runout': return 'run out (' + sur(m, w.fielder) + ')';
    case 'hitwicket': return 'hit wicket b ' + b;
  }
  return 'out';
}

export function declare(m) {
  const inn = curInn(m);
  inn.declared = true; inn.done = true;
  if (inn.overBalls.length) inn.overs.push({ bowler: inn.curBowler, balls: inn.overBalls.slice(), runs: inn.overRuns });
  const r = checkResult(m);
  if (r) m.result = r;
}

function teamName(m, t, teams) { return teams ? teams[m.teamIds[t]].name : m.teamIds[t]; }

// returns null if match continues
export function checkResult(m) {
  const inn = curInn(m);
  if (!inn.done) return null;
  if (m.format !== 'TEST') {
    if (m.cur === 0) return null;
    const a = m.innings[0], b = m.innings[1];
    if (b.runs >= b.target) return { winner: b.bat, by: 'wkts', margin: 10 - b.wkts, ballsLeft: m.overs * 6 - b.balls };
    if (b.runs === b.target - 1) return { winner: -1, by: 'tie' };
    return { winner: a.bat, by: 'runs', margin: a.runs - b.runs };
  }
  // Test
  const tot = teamTotals(m);
  const timeUp = m.totalBalls >= TEST_DAYS * TEST_OVERS_PER_DAY * 6;
  if (m.cur === 3) {
    if (inn.target && inn.runs >= inn.target) return { winner: inn.bat, by: 'wkts', margin: 10 - inn.wkts };
    if (inn.wkts >= 10 || (inn.declared)) {
      if (tot[inn.bat] === tot[inn.bowl]) return { winner: -1, by: 'tie' };
      return { winner: inn.bowl, by: 'runs', margin: tot[inn.bowl] - tot[inn.bat] };
    }
    return { winner: -1, by: 'draw' };
  }
  if (timeUp) return { winner: -1, by: 'draw' };
  if (m.cur === 2) {
    // innings victory: team that batted twice still behind
    const twice = inn.bat; const once = 1 - twice;
    if (tot[twice] < tot[once] && (inn.wkts >= 10)) return { winner: once, by: 'inns', margin: tot[once] - tot[twice] };
  }
  return null;
}

export function resultText(m, teams) {
  const r = m.result; if (!r) return '';
  if (r.by === 'tie') return 'Match tied';
  if (r.by === 'draw') return 'Match drawn';
  const n = teamName(m, r.winner, teams);
  if (r.by === 'wkts') return `${n} won by ${r.margin} wicket${r.margin === 1 ? '' : 's'}` + (r.ballsLeft ? ` (${r.ballsLeft} balls left)` : '');
  if (r.by === 'runs') return `${n} won by ${r.margin} run${r.margin === 1 ? '' : 's'}`;
  if (r.by === 'inns') return `${n} won by an innings and ${r.margin} run${r.margin === 1 ? '' : 's'}`;
  return '';
}

// Who bats next after an innings completes. Returns team index, or null if match over.
// For Tests may need follow-on decision: returns {needFollowOnDecision:true, team}
export function nextInnings(m) {
  if (m.result) return null;
  if (m.format !== 'TEST') return m.cur === 0 ? 1 - m.innings[0].bat : null;
  if (m.cur === 0) return 1 - m.innings[0].bat;
  if (m.cur === 1) {
    const lead = m.innings[0].runs - m.innings[1].runs;
    if (lead >= 200) return { followOnOption: true, leader: m.innings[0].bat };
    return m.innings[0].bat;
  }
  if (m.cur === 2) return 1 - m.innings[2].bat;
  return null;
}

export function testDay(m) {
  const overs = Math.floor(m.totalBalls / 6);
  return Math.min(TEST_DAYS, Math.floor(overs / TEST_OVERS_PER_DAY) + 1);
}
export function oversLeftInMatch(m) {
  return Math.max(0, TEST_DAYS * TEST_OVERS_PER_DAY - m.totalBalls / 6);
}

export function requiredRate(m) {
  const inn = curInn(m);
  if (!inn || !inn.target || !m.overs) return null;
  const need = inn.target - inn.runs; const balls = m.overs * 6 - inn.balls;
  return { need, balls, rrr: balls > 0 ? (need * 6 / balls) : 99 };
}

// Pick a bowler for AI-controlled bowling side
export function aiPickBowler(m, teams) {
  const inn = curInn(m);
  const pool = m.xi[inn.bowl].map(pid => findPlayer(teams, pid)).filter(p => p && p.style !== '-' && canBowl(m, p.id));
  if (!pool.length) {
    // emergency: anyone not keeper / last bowler
    const any = m.xi[inn.bowl].filter(pid => canBowl(m, pid));
    return any[0] || m.xi[inn.bowl].find(p => p !== inn.lastOverBowler);
  }
  const over = Math.floor(inn.balls / 6);
  const total = m.overs || 90;
  const phase = m.overs ? (over < total * 0.3 ? 'new' : over >= total * 0.8 ? 'death' : 'mid') : (inn.balls < 180 ? 'new' : 'mid');
  let best = null, bestScore = -1e9;
  for (const p of pool) {
    const b = inn.bw[p.id];
    const used = b ? b.balls / 6 : 0;
    let s = p.bowlSkill;
    const spin = isSpin(p.style);
    if (phase === 'new' && !spin) s += 10;
    if (phase === 'new' && spin) s -= 12;
    if (phase === 'mid' && spin) s += 6;
    if (phase === 'death' && !spin) s += 6;
    if (m.format === 'TEST') {
      // spell management: fatigue after ~6 overs in a row
      const spell = recentSpell(inn, p.id);
      s -= spell * 4;
      if (spin && m.cur >= 2) s += 8;
    } else {
      // save overs for death for top quicks
      const remain = m.maxBowlerOvers - used;
      if (phase !== 'death' && !spin && remain <= 1 && p.bowlSkill > 82) s -= 15;
    }
    s += Math.random() * 6;
    if (s > bestScore) { bestScore = s; best = p; }
  }
  return best.id;
}

function recentSpell(inn, pid) {
  let n = 0;
  for (let i = inn.overs.length - 1; i >= 0 && i >= inn.overs.length - 16; i--) if (inn.overs[i].bowler === pid) n++;
  return n;
}

// AI declaration logic in Tests (when AI batting)
export function aiShouldDeclare(m) {
  if (m.format !== 'TEST') return false;
  const inn = curInn(m);
  const tot = teamTotals(m);
  const lead = tot[inn.bat] - tot[inn.bowl];
  const left = oversLeftInMatch(m);
  if (m.cur === 0) return inn.runs > 600 || (inn.runs > 500 && inn.balls > 900);
  if (m.cur === 1) return lead > 250 && inn.balls > 700;
  if (m.cur === 2) {
    if (lead > 450) return true;
    if (lead > 300 && left < 110) return true;
    if (lead > 220 && left < 80) return true;
  }
  return false;
}
