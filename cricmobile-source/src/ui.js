// DOM user interface: menus, HUD, modals, editor
import * as R from './rules.js';
import { ROLE_NAMES, STYLE_NAMES, isSpin, styleHand, CSV_HEADER, defaultXI, defaultKeeper } from './data.js';
import * as S from './series.js';
import { PACE_TYPES, SPIN_TYPES, spinVariationName, FIELD_PRESETS } from './physics.js';

const $ = (s, r = document) => r.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
const sur = n => { const p = n.split(' '); return p.length > 1 ? p.slice(1).join(' ') : n; };
const ovrClass = v => v >= 88 ? 'o-elite' : v >= 82 ? 'o-gold' : v >= 76 ? 'o-silver' : 'o-bronze';
const roleIcon = r => ({ BAT: '🏏', BAR: '🏏⚾', BWAR: '⚾🏏', BOWL: '⚾', WK: '🧤' }[r] || '');

export class UI {
  constructor(app) {
    this.app = app;
    this.root = $('#ui');
    this.shotMode = 'drive';
    this.buildHUD();
    this.bindTouch();
  }
  get game() { return this.app.game; }
  get teams() { return this.app.teams; }

  // ================= generic =================
  clearScreens() { $('#screens').innerHTML = ''; $('#screens').style.display = 'none'; }
  screen(content, cls = '') {
    const s = $('#screens'); s.innerHTML = ''; s.style.display = 'flex';
    const panel = h('div', { class: 'screen ' + cls }, content);
    s.append(panel); s.scrollTop = 0; return panel;
  }
  modal(title, body, buttons = [], opts = {}) {
    const wrap = h('div', { class: 'modal-wrap' + (opts.top ? ' top' : '') });
    const close = () => wrap.remove();
    const m = h('div', { class: 'modal ' + (opts.cls || '') }, title ? h('h2', {}, title) : null, body,
      buttons.length ? h('div', { class: 'btn-row' }, buttons.map(b => h('button', { class: 'btn ' + (b.cls || ''), onclick: () => { if (!b.keep) close(); b.fn && b.fn(); } }, b.label))) : null);
    wrap.append(m); $('#modals').append(wrap);
    return { close, el: m };
  }
  toast(text, ms = 1600) {
    const t = h('div', { class: 'toast' }, text); $('#modals').append(t); setTimeout(() => t.remove(), ms);
  }
  teamBadge(t, size = 44) {
    return h('div', { class: 'badge', style: `width:${size}px;height:${size}px;background:linear-gradient(135deg, ${t.kit[0]} 0 55%, ${t.kit[1]} 55% 100%);font-size:${size * 0.3}px` }, h('span', {}, t.short));
  }

  // ================= main menu =================
  mainMenu() {
    this.app.game.stop();
    this.showHUD(false);
    const hasSave = !!this.app.loadMatch();
    this.screen(h('div', { class: 'menu' },
      h('div', { class: 'logo' }, h('div', { class: 'logo-a' }, 'CRIC'), h('div', { class: 'logo-b' }, 'MOBILE')),
      h('div', { class: 'menu-btns' },
        hasSave ? h('button', { class: 'btn big gold', onclick: () => this.app.resumeMatch() }, '▶  Continue Match') : null,
        h('button', { class: 'btn big', onclick: () => this.setupFormat() }, '🏟  Play Match'),
        h('button', { class: 'btn big', onclick: () => this.app.series ? this.seriesHub() : this.seriesSetup() }, this.app.series ? '🏆  Continue Series' : '🏆  Series & Tournaments'),
        h('button', { class: 'btn big', onclick: () => this.practiceSetup() }, '🎯  Practice Nets'),
        h('button', { class: 'btn big', onclick: () => this.teamsScreen() }, '👥  Teams & Players'),
        h('button', { class: 'btn big', onclick: () => this.settingsScreen() }, '⚙️  Settings'),
        h('button', { class: 'btn big ghost', onclick: () => this.howToPlay() }, '❔  How to Play'),
      ),
      h('div', { class: 'foot' }, 'Offline · Personal use'),
    ), 'menu-screen');
  }

  howToPlay() {
    this.modal('How to play', h('div', { class: 'help' },
      h('h3', {}, '🏏 Batting'),
      h('p', {}, 'Pick a shot type at the bottom: DEFEND, DRIVE (along the ground) or LOFT (in the air).'),
      h('p', {}, 'SWIPE anywhere to play the shot as the ball arrives. The swipe direction is where the ball goes on screen: swipe DOWN to hit straight back past the bowler (towards you), LEFT / RIGHT for the sides, UP-left / UP-right to glance or cut behind square.'),
      h('p', {}, 'Timing is everything: swipe just as the ball reaches the batter. Choosing a shot that suits the line & length matters (cut/pull short balls, drive full balls, play straight to straight balls). Don\'t swipe to leave the ball, but beware of straight balls: you can be bowled or LBW.'),
      h('h3', {}, '⚾ Bowling'),
      h('p', {}, 'Choose a delivery, then DRAG on the pitch to move the yellow target (coloured bands show yorker, full, good and short lengths). Press BOWL, then TAP when the needle is in the green zone. Missing the green costs accuracy and pace; the far-right red is a NO BALL.'),
      h('h3', {}, '⏩ Other'),
      h('p', {}, 'Tap the screen during play to fast forward. Use the pause button (top right) for scorecards, field settings, declaring (Tests) or simulating overs. Matches are saved after every ball.'),
    ), [{ label: 'Got it', cls: 'gold' }], { cls: 'wide' });
  }

  // ================= match setup =================
  setupFormat() {
    const st = this.setup = { format: 'T20', overs: 20, time: 'day' };
    const oversOpts = { T20: [2, 5, 10, 20], ODI: [10, 20, 30, 50], TEST: [] };
    const render = () => {
      const fmtBtn = (f, label, sub) => h('button', { class: 'card-btn ' + (st.format === f ? 'sel' : ''), onclick: () => { st.format = f; st.overs = f === 'TEST' ? null : oversOpts[f][oversOpts[f].length - 1]; render(); } }, h('b', {}, label), h('small', {}, sub));
      this.screen(h('div', {},
        this.header('Match Setup', () => this.mainMenu()),
        h('div', { class: 'section' }, h('h3', {}, 'Format'),
          h('div', { class: 'grid3' }, fmtBtn('T20', 'T20', '20 overs'), fmtBtn('ODI', 'ODI', '50 overs'), fmtBtn('TEST', 'Test', '5 days'))),
        st.format !== 'TEST' ? h('div', { class: 'section' }, h('h3', {}, 'Overs per innings'),
          h('div', { class: 'chips' }, oversOpts[st.format].map(o => h('button', { class: 'chip ' + (st.overs === o ? 'sel' : ''), onclick: () => { st.overs = o; render(); } }, String(o))))) : h('div', { class: 'section note' }, 'Two innings each · 90 overs per day · 5 days · follow-on at 200 · declarations available from the pause menu'),
        this.diffRows(render),
        h('div', { class: 'section' }, h('h3', {}, 'Conditions'),
          h('div', { class: 'chips' }, [['day', '☀️ Day'], ['night', '🌙 Day/Night']].map(([k, l]) => h('button', { class: 'chip ' + (st.time === k ? 'sel' : ''), onclick: () => { st.time = k; render(); } }, l)))),
        h('div', { class: 'bottom-bar' }, h('button', { class: 'btn gold wide', onclick: () => this.pickTeams() }, 'Next: Teams →')),
      ));
    };
    render();
  }
  catChips(cur, fn) {
    const cats = [...new Set(Object.values(this.teams).map(t => t.cat || 'Custom'))];
    return h('div', { class: 'chips scroll' }, cats.map(c => h('button', { class: 'chip ' + (c === cur ? 'sel' : ''), onclick: () => fn(c) }, c)));
  }
  catIds(cat) { return Object.keys(this.teams).filter(id => (this.teams[id].cat || 'Custom') === cat); }
  diffRows(after) {
    const s = this.app.settings;
    return [['diffBatPace', 'Batting vs pace'], ['diffBatSpin', 'Batting vs spin'], ['diffBowl', 'Bowling']].map(([k, label]) => h('div', { class: 'section' }, h('h3', {}, label + ' difficulty'),
      h('div', { class: 'chips' }, [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard'], ['legend', 'Legend']].map(([v, l]) => h('button', { class: 'chip ' + ((s[k] || 'normal') === v ? 'sel' : ''), onclick: () => { s[k] = v; this.app.saveSettings(); after(); } }, l)))));
  }
  header(title, back) {
    return h('div', { class: 'hdr' }, back ? h('button', { class: 'icon-btn', onclick: back }, '‹') : h('span'), h('h1', {}, title), h('span'));
  }
  pickTeams() {
    const st = this.setup;
    st.cat = st.cat || 'International'; st.user = st.user || 'AUS'; st.opp = st.opp || 'IND';
    const render = () => {
      const ids = this.catIds(st.cat);
      const grid = (key) => h('div', { class: 'team-grid' }, ids.map(id => {
        const t = this.teams[id];
        const dis = (key === 'opp' && id === st.user) || (key === 'user' && id === st.opp);
        return h('button', { class: 'team-tile ' + (st[key] === id ? 'sel' : '') + (dis ? ' dis' : ''), onclick: () => { if (dis) return; st[key] = id; render(); } }, this.teamBadge(t, 40), h('span', {}, t.name), h('small', {}, 'OVR ' + this.teamOvr(t, st.format)));
      }));
      this.screen(h('div', {},
        this.header('Choose Teams', () => this.setupFormat()),
        this.catChips(st.cat, c => { st.cat = c; const ids = this.catIds(c); st.user = ids[0]; st.opp = ids[1]; render(); }),
        h('div', { class: 'section' }, h('h3', {}, 'Your team'), grid('user')),
        h('div', { class: 'section' }, h('h3', {}, 'Opponent'), grid('opp')),
        h('div', { class: 'bottom-bar' }, h('button', { class: 'btn gold wide', onclick: () => this.lineup() }, 'Next: Line-up →')),
      ));
    };
    render();
  }
  teamOvr(t, fmt) {
    const xi = this.defaultXI(t, fmt);
    const ps = xi.map(id => t.players.find(p => p.id === id));
    return Math.round(ps.reduce((a, p) => a + p.ovr, 0) / ps.length);
  }
  defaultXI(t, fmt) { return defaultXI(t, fmt); }
  defaultKeeper(t, xi, fmt) { return defaultKeeper(t, xi, fmt); }
  saveDefaultXI(t, fmt, xi, keeper) {
    for (const p of t.players) p.pos[fmt] = 0;
    xi.forEach((id, i) => t.players.find(p => p.id === id).pos[fmt] = i + 1);
    t.keepers = { ...t.keepers, [fmt]: keeper };
    this.app.saveTeams(); this.toast(`Default ${fmt === 'TEST' ? 'Test' : fmt} XI saved`);
  }
  // edit = { tid, fmt } edits a team's saved default XI instead of picking one for a match
  lineup(edit) {
    const st = edit ? { user: edit.tid, format: edit.fmt } : this.setup; const t = this.teams[st.user];
    st.xi = this.defaultXI(t, st.format); st.keeper = this.defaultKeeper(t, st.xi, st.format);
    let selected = null;
    const render = () => {
      const P = id => t.players.find(p => p.id === id);
      const row = (p, i, inXI) => h('div', { class: 'p-row ' + (selected === p.id ? 'sel' : '') + (inXI ? '' : ' bench'), onclick: () => {
        if (!selected) { selected = p.id; render(); return; }
        if (selected === p.id) { selected = null; render(); return; }
        const a = st.xi.indexOf(selected), b = st.xi.indexOf(p.id);
        if (a >= 0 && b >= 0) { st.xi[a] = p.id; st.xi[b] = selected; }
        else if (a >= 0) st.xi[a] = p.id; else if (b >= 0) st.xi[b] = selected;
        if (!st.xi.includes(st.keeper)) st.keeper = this.defaultKeeper(t, st.xi, st.format);
        selected = null; render();
      } },
        h('span', { class: 'p-num' }, inXI ? String(i + 1) : '–'),
        h('div', { class: 'p-main' }, h('b', {}, p.name + (st.keeper === p.id ? ' †' : '') + (inXI && i === 0 ? '' : '')), h('small', {}, `${ROLE_NAMES[p.role]} · ${p.bat}HB · ${p.style === '-' ? '—' : p.style}`)),
        h('span', { class: 'mini' }, 'BAT ' + p.batSkill), h('span', { class: 'mini' }, 'BWL ' + p.bowlSkill),
        h('span', { class: 'ovr ' + ovrClass(p.ovr) }, String(p.ovr)));
      const bench = t.players.filter(p => !st.xi.includes(p.id));
      this.screen(h('div', {},
        this.header(t.name + (edit ? ` · default ${st.format === 'TEST' ? 'Test' : st.format} XI` : ' XI'), () => edit ? this.squadScreen(edit.tid, edit.fmt) : st.seriesFix != null ? this.seriesHub() : this.pickTeams()),
        h('div', { class: 'note' }, 'Tap a player, then tap another to swap batting positions or bring in a bench player. † = wicket-keeper.'),
        h('div', { class: 'list' }, st.xi.map((id, i) => row(P(id), i, true))),
        h('div', { class: 'section' }, h('h3', {}, 'Wicket-keeper'),
          h('select', { class: 'sel-input', onchange: e => { st.keeper = e.target.value; render(); } }, st.xi.map(id => { const o = h('option', { value: id }, P(id).name); if (id === st.keeper) o.selected = true; return o; }))),
        h('h3', { class: 'sub' }, 'Bench'),
        h('div', { class: 'list' }, bench.map(p => row(p, 0, false))),
        edit ? h('div', { class: 'bottom-bar' }, h('button', { class: 'btn gold wide', onclick: () => { this.saveDefaultXI(t, st.format, st.xi, st.keeper); this.squadScreen(edit.tid, edit.fmt); } }, '💾 Save default XI'))
          : h('div', { class: 'bottom-bar' }, h('button', { class: 'btn', onclick: () => this.saveDefaultXI(t, st.format, st.xi, st.keeper) }, '💾 Save as default'), h('button', { class: 'btn gold wide', onclick: () => this.toss() }, 'Next: Toss →')),
      ));
    };
    render();
  }
  toss() {
    const st = this.setup;
    const opp = this.teams[st.opp];
    st.oppXI = this.defaultXI(opp, st.format); st.oppKeeper = this.defaultKeeper(opp, st.oppXI, st.format);
    const doToss = (call) => {
      const res = Math.random() < 0.5 ? 'Heads' : 'Tails';
      const won = res === call;
      const coin = h('div', { class: 'coin spin' }, res === 'Heads' ? 'H' : 'T');
      if (won) {
        this.modal('You won the toss!', h('div', { class: 'center' }, coin, h('p', {}, `It's ${res}. What will you do?`)), [
          { label: '🏏 Bat first', cls: 'gold', fn: () => this.begin(true) },
          { label: '⚾ Bowl first', fn: () => this.begin(false) },
        ]);
      } else {
        const batFirst = Math.random() < (st.format === 'TEST' ? 0.75 : 0.5);
        this.modal(opp.name + ' won the toss', h('div', { class: 'center' }, coin, h('p', {}, `It's ${res}. ${opp.name} elect to ${batFirst ? 'bat' : 'bowl'} first.`)), [
          { label: 'Start match', cls: 'gold', fn: () => this.begin(!batFirst) },
        ]);
      }
    };
    this.screen(h('div', {},
      this.header('Toss', () => this.lineup()),
      h('div', { class: 'toss' },
        h('div', { class: 'vs' }, this.teamBadge(this.teams[st.user], 70), h('b', {}, 'vs'), this.teamBadge(opp, 70)),
        h('p', {}, 'Call it!'),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn big gold', onclick: () => doToss('Heads') }, 'Heads'), h('button', { class: 'btn big', onclick: () => doToss('Tails') }, 'Tails')),
      )));
  }
  begin(userBatsFirst) {
    const st = this.setup;
    this.app.settings.time = st.time; this.app.saveSettings();
    const cfg = { format: st.format, overs: st.overs, teamA: st.user, teamB: st.opp, xiA: st.xi, xiB: st.oppXI, keeperA: st.keeper, keeperB: st.oppKeeper, userTeam: 0 };
    const m = R.newMatch(cfg, this.teams);
    m.time = st.time;
    m.toss = { userBatsFirst };
    if (st.seriesFix != null) { m.seriesFix = st.seriesFix; m.seriesId = this.app.series.id; }
    R.startInnings(m, userBatsFirst ? 0 : 1);
    this.clearScreens();
    this.app.startMatch(m);
  }

  // ================= series & tournaments =================
  seriesSetup() {
    const st = { key: 'TEST', count: 5 };
    const render = () => {
      const c = S.COMPS[st.key]; const ps = S.participants(st.key, this.teams);
      if (!ps.includes(st.user)) st.user = ps.includes('AUS') ? 'AUS' : ps[0];
      if (c.bilateral && (!ps.includes(st.opp) || st.opp === st.user)) st.opp = ps.find(id => id !== st.user && id === 'IND') || ps.find(id => id !== st.user);
      if (c.bilateral && !c.bilateral.includes(st.count)) st.count = c.dflt;
      const grid = key => h('div', { class: 'team-grid' }, ps.map(id => {
        const t = this.teams[id]; const dis = key === 'opp' ? id === st.user : (c.bilateral && id === st.opp);
        return h('button', { class: 'team-tile ' + (st[key] === id ? 'sel' : '') + (dis ? ' dis' : ''), onclick: () => { if (dis) return; st[key] = id; render(); } }, this.teamBadge(t, 40), h('span', {}, t.name), h('small', {}, 'OVR ' + this.teamOvr(t, c.format)));
      }));
      this.screen(h('div', {},
        this.header('Series & Tournaments', () => this.mainMenu()),
        h('div', { class: 'section' }, h('h3', {}, 'Competition'), h('div', { class: 'grid2' }, Object.entries(S.COMPS).map(([k, v]) => h('button', { class: 'card-btn ' + (st.key === k ? 'sel' : ''), onclick: () => { st.key = k; render(); } }, h('b', {}, v.name), h('small', {}, v.bilateral ? R.FORMATS[v.format].name + ' · ' + v.bilateral.join('/') + ' matches' : R.FORMATS[v.format].name))))),
        c.note ? h('div', { class: 'section note' }, c.note) : null,
        c.bilateral ? h('div', { class: 'section' }, h('h3', {}, 'Matches'), h('div', { class: 'chips' }, c.bilateral.map(n => h('button', { class: 'chip ' + (st.count === n ? 'sel' : ''), onclick: () => { st.count = n; render(); } }, String(n))))) : null,
        h('div', { class: 'section' }, h('h3', {}, 'Your team'), grid('user')),
        c.bilateral ? h('div', { class: 'section' }, h('h3', {}, 'Opponent'), grid('opp')) : null,
        h('div', { class: 'bottom-bar' }, h('button', { class: 'btn gold wide', onclick: () => { this.app.series = S.newSeries(st.key, st.user, st.opp, st.count, this.teams); this.app.saveSeries(); this.seriesHub(); } }, 'Start →')),
      ));
    };
    render();
  }
  seriesHub() {
    const s = this.app.series; if (!s) return this.seriesSetup();
    this.app.game.stop(); this.showHUD(false);
    const T = this.teams;
    const idx = S.advance(s, T); this.app.saveSeries();
    const f = idx >= 0 ? s.fixtures[idx] : null;
    const short = id => T[id] ? T[id].short : S.refLabel(id);
    const statLine = x => `${x.r} runs (HS ${x.hs}) · ${x.w} wkts`;
    const quit = () => { this.app.series = null; this.app.saveSeries(); this.mainMenu(); };
    const play = () => {
      this.setup = { format: s.format, overs: s.overs, time: s.format === 'TEST' ? 'day' : 'night', user: s.user, opp: f.a === s.user ? f.b : f.a, seriesFix: idx };
      this.lineup();
    };
    const sim = () => { const m = S.simFixture(s, f, T); S.record(s, f, m, T); this.app.saveSeries(); this.toast(f.res.text, 2500); this.seriesHub(); };
    const parts = [this.header(s.name, () => this.mainMenu())];
    if (s.bilateral) { const { w, d } = S.seriesScore(s); parts.push(h('p', { class: 'center big-note' }, `${T[s.user].short} ${w[s.user]} – ${w[s.opp]} ${T[s.opp].short}` + (d ? ` · ${d} drawn` : ''))); }
    if (s.done) {
      const champ = s.champion && T[s.champion];
      parts.push(h('div', { class: 'section center' }, champ ? this.teamBadge(champ, 70) : null,
        h('p', { class: 'big-note' }, s.bilateral ? (champ ? `${champ.name} win the series` : 'Series drawn') : `🏆 ${champ.name} are champions!`),
        s.pos ? h('div', { class: 'pom' }, h('small', {}, 'Player of the Series'), h('b', {}, s.stats[s.pos].name), h('span', {}, statLine(s.stats[s.pos]))) : null));
    } else {
      parts.push(h('div', { class: 'section' }, h('h3', {}, 'Next · ' + f.name),
        h('div', { class: 'vs' }, this.teamBadge(T[f.a], 56), h('b', {}, 'vs'), this.teamBadge(T[f.b], 56)),
        h('div', { class: 'btn-row' }, h('button', { class: 'btn gold', onclick: play }, '▶ Play'), h('button', { class: 'btn', onclick: sim }, '⏩ Simulate'))));
    }
    // points tables of the latest group stage
    for (let i = s.stage; i >= 0; i--) if (s.groups[i]) {
      for (const g of Object.keys(s.groups[i])) {
        const tb = h('table', { class: 'card' }, h('tr', {}, ['Team', 'P', 'W', 'L', 'NR', 'Pts', 'NRR'].map(x => h('th', {}, x))));
        S.table(s, i, g).forEach((r, k) => tb.append(h('tr', { style: r.id === s.user ? 'font-weight:800;color:var(--gold)' : '' }, h('td', {}, `${k + 1}. ${short(r.id)}`), ...[r.p, r.w, r.l, r.nr, r.pts, (r.nrr >= 0 ? '+' : '') + r.nrr.toFixed(2)].map(x => h('td', {}, String(x))))));
        parts.push(h('h3', { class: 'sub' }, S.COMPS[s.key].stages[i].name + (Object.keys(s.groups[i]).length > 1 ? ' · Group ' + g : '')), tb);
      }
      break;
    }
    const ko = s.fixtures.filter(x => x.ko);
    if (ko.length) parts.push(h('h3', { class: 'sub' }, 'Knockouts'), h('div', { class: 'list' }, ko.map(x => h('div', { class: 'p-row' }, h('div', { class: 'p-main' }, h('b', {}, `${x.name}: ${short(x.a)} v ${short(x.b)}`), h('small', {}, x.done ? x.res.score + ' · ' + x.res.text : 'To be played'))))));
    const done = s.fixtures.filter(x => x.done && !x.ko).slice(-8).reverse();
    if (done.length) parts.push(h('h3', { class: 'sub' }, 'Latest results'), h('div', { class: 'list' }, done.map(x => h('div', { class: 'p-row' }, h('div', { class: 'p-main' }, h('b', {}, `${short(x.a)} v ${short(x.b)} · ${x.name}`), h('small', {}, x.res.score + ' · ' + x.res.text))))));
    const lead = (k, fmt) => Object.values(s.stats).sort((a, b) => b[k] - a[k]).slice(0, 5).filter(x => x[k] > 0).map(x => h('div', { class: 'ln' }, h('span', {}, `${x.name} (${short(x.team)})`), h('b', {}, fmt(x))));
    if (Object.keys(s.stats).length) parts.push(h('h3', { class: 'sub' }, 'Most runs'), h('div', {}, lead('r', x => `${x.r} (HS ${x.hs})`)), h('h3', { class: 'sub' }, 'Most wickets'), h('div', {}, lead('w', x => `${x.w} wkts · ${x.rc} runs`)));
    parts.push(h('div', { class: 'section btn-col' }, s.done ? h('button', { class: 'btn gold', onclick: quit }, 'Finish') : h('button', { class: 'btn danger', onclick: () => this.confirm('Abandon this series?', quit) }, '🗑 Abandon series')));
    this.screen(h('div', {}, parts));
  }

  // ================= practice =================
  practiceSetup() {
    const st = { mode: 'bat', userTeam: 'AUS', oppTeam: 'IND', user: null, opp: null };
    const render = () => {
      const ut = this.teams[st.userTeam], ot = this.teams[st.oppTeam];
      const users = ut.players.filter(p => st.mode === 'bat' ? true : p.style !== '-').sort((a, b) => (st.mode === 'bat' ? b.batSkill - a.batSkill : b.bowlSkill - a.bowlSkill));
      const opps = ot.players.filter(p => st.mode === 'bat' ? p.style !== '-' : true).sort((a, b) => (st.mode === 'bat' ? b.bowlSkill - a.bowlSkill : b.batSkill - a.batSkill));
      if (!users.find(p => p.id === st.user)) st.user = users[0].id;
      if (!opps.find(p => p.id === st.opp)) st.opp = opps[0].id;
      const sel = (list, key, skill) => h('select', { class: 'sel-input', onchange: e => { st[key] = e.target.value; } }, list.map(p => { const o = h('option', { value: p.id }, `${p.name} (${skill(p)})`); if (p.id === st[key]) o.selected = true; return o; }));
      const teamSel = (key) => h('select', { class: 'sel-input', onchange: e => { st[key] = e.target.value; render(); } }, Object.values(this.teams).map(t => { const o = h('option', { value: t.id }, t.name); if (t.id === st[key]) o.selected = true; return o; }));
      this.screen(h('div', {},
        this.header('Practice Nets', () => this.mainMenu()),
        h('div', { class: 'section' }, h('div', { class: 'grid2' },
          h('button', { class: 'card-btn ' + (st.mode === 'bat' ? 'sel' : ''), onclick: () => { st.mode = 'bat'; render(); } }, h('b', {}, '🏏 Batting'), h('small', {}, 'Face an AI bowler')),
          h('button', { class: 'card-btn ' + (st.mode === 'bowl' ? 'sel' : ''), onclick: () => { st.mode = 'bowl'; render(); } }, h('b', {}, '⚾ Bowling'), h('small', {}, 'Bowl at an AI batter')))),
        h('div', { class: 'section' }, h('h3', {}, st.mode === 'bat' ? 'Your batter' : 'Your bowler'), teamSel('userTeam'), sel(users, 'user', p => st.mode === 'bat' ? 'BAT ' + p.batSkill : p.style + ' ' + p.bowlSkill)),
        h('div', { class: 'section' }, h('h3', {}, st.mode === 'bat' ? 'Opposition bowler' : 'Opposition batter'), teamSel('oppTeam'), sel(opps, 'opp', p => st.mode === 'bat' ? p.style + ' ' + p.bowlSkill : 'BAT ' + p.batSkill)),
        h('div', { class: 'bottom-bar' }, h('button', { class: 'btn gold wide', onclick: () => { this.clearScreens(); this.app.startPractice({ mode: st.mode, batter: st.mode === 'bat' ? st.user : st.opp, bowler: st.mode === 'bat' ? st.opp : st.user }); } }, 'Start Nets')),
      ));
    };
    render();
  }

  // ================= teams & editor =================
  teamsScreen(cat = this._teamsCat || 'International') {
    this._teamsCat = cat;
    this.screen(h('div', {},
      this.header('Teams & Players', () => this.mainMenu()),
      this.catChips(cat, c => this.teamsScreen(c)),
      h('div', { class: 'team-grid' }, this.catIds(cat).map(id => this.teams[id]).map(t => h('button', { class: 'team-tile', onclick: () => this.squadScreen(t.id) }, this.teamBadge(t, 40), h('span', {}, t.name), h('small', {}, t.players.length + ' players')))),
      h('div', { class: 'section' }, h('h3', {}, 'Data'),
        h('div', { class: 'btn-col' },
          h('button', { class: 'btn', onclick: () => this.importDialog() }, '⬇️ Import players (CSV / JSON)'),
          h('button', { class: 'btn', onclick: () => this.exportDialog() }, '⬆️ Export players (CSV)'),
          h('button', { class: 'btn danger', onclick: () => this.modal('Reset all players?', h('p', {}, 'This restores the built-in database and removes your edits.'), [{ label: 'Cancel' }, { label: 'Reset', cls: 'danger', fn: () => { this.app.resetTeams(); this.toast('Players reset'); this.teamsScreen(); } }]) }, '♻️ Reset to defaults'))),
    ));
  }
  squadScreen(tid, fmt = 'T20') {
    const t = this.teams[tid];
    const list = t.players.slice().sort((a, b) => (a.pos[fmt] || 99) - (b.pos[fmt] || 99) || b.ovr - a.ovr);
    this.screen(h('div', {},
      this.header(t.name, () => this.teamsScreen()),
      h('div', { class: 'chips center' }, ['T20', 'ODI', 'TEST'].map(f => h('button', { class: 'chip ' + (f === fmt ? 'sel' : ''), onclick: () => this.squadScreen(tid, f) }, f === 'TEST' ? 'Test' : f))),
      h('div', { class: 'list' }, list.map(p => h('div', { class: 'p-row', onclick: () => this.editPlayer(tid, p.id, fmt) },
        h('span', { class: 'p-num' }, p.pos[fmt] ? String(p.pos[fmt]) : '–'),
        h('div', { class: 'p-main' }, h('b', {}, `#${p.num} ${p.name}`), h('small', {}, `${ROLE_NAMES[p.role]} · ${p.bat}HB · ${STYLE_NAMES[p.style] || p.style} · ${p.age}y`)),
        h('span', { class: 'mini' }, 'BAT ' + p.batSkill), h('span', { class: 'mini' }, 'BWL ' + p.bowlSkill),
        h('span', { class: 'ovr ' + ovrClass(p.ovr) }, String(p.ovr))))),
      h('div', { class: 'bottom-bar' }, h('button', { class: 'btn', onclick: () => this.editPlayer(tid, null, fmt) }, '+ Add player'), h('button', { class: 'btn gold wide', onclick: () => this.lineup({ tid, fmt }) }, `✏️ Edit default ${fmt === 'TEST' ? 'Test' : fmt} XI`)),
    ));
  }
  editPlayer(tid, pid, fmt) {
    const t = this.teams[tid];
    const p = pid ? t.players.find(x => x.id === pid) : { id: tid + '_n' + Date.now(), name: 'New Player', num: 0, age: 25, role: 'BAT', bat: 'R', style: '-', bowlHand: 'R', ovr: 70, batSkill: 70, bowlSkill: 10, field: 70, pos: { T20: 0, ODI: 0, TEST: 0 } };
    const f = {};
    const inp = (k, label, type = 'number', val) => h('label', { class: 'fld' }, h('span', {}, label), f[k] = h('input', { type, value: val ?? p[k] }));
    const sel = (k, label, opts, val) => h('label', { class: 'fld' }, h('span', {}, label), f[k] = h('select', {}, Object.entries(opts).map(([v, l]) => { const o = h('option', { value: v }, l); if (v === (val ?? p[k])) o.selected = true; return o; })));
    const body = h('div', { class: 'form' },
      inp('name', 'Name', 'text'), inp('num', 'Shirt number'), inp('age', 'Age'), inp('ovr', 'Overall'), inp('batSkill', 'Batting'), inp('bowlSkill', 'Bowling'), inp('field', 'Fielding'),
      sel('role', 'Role', ROLE_NAMES), sel('bat', 'Batting hand', { R: 'Right', L: 'Left' }), sel('style', 'Bowling style', STYLE_NAMES),
      inp('pT20', 'T20 bat pos (0 = not in XI)', 'number', p.pos.T20), inp('pODI', 'ODI bat pos', 'number', p.pos.ODI), inp('pTEST', 'Test bat pos', 'number', p.pos.TEST));
    const save = () => {
      const n = v => Math.max(0, Math.min(99, parseInt(v, 10) || 0));
      Object.assign(p, { name: f.name.value.trim() || p.name, num: n(f.num.value), age: n(f.age.value), ovr: n(f.ovr.value), batSkill: n(f.batSkill.value), bowlSkill: n(f.bowlSkill.value), field: n(f.field.value), role: f.role.value, bat: f.bat.value, style: f.style.value });
      p.bowlHand = styleHand(p.style);
      p.pos = { T20: Math.min(11, n(f.pT20.value)), ODI: Math.min(11, n(f.pODI.value)), TEST: Math.min(11, n(f.pTEST.value)) };
      if (!pid) t.players.push(p);
      this.app.saveTeams(); this.toast('Saved'); this.squadScreen(tid, fmt);
    };
    const btns = [{ label: 'Cancel' }, { label: 'Save', cls: 'gold', fn: save }];
    if (pid) btns.unshift({ label: 'Delete', cls: 'danger', fn: () => { t.players = t.players.filter(x => x.id !== pid); this.app.saveTeams(); this.squadScreen(tid, fmt); } });
    this.modal(pid ? 'Edit player' : 'Add player', body, btns, { cls: 'wide' });
  }
  importDialog() {
    const ta = h('textarea', { class: 'ta', placeholder: CSV_HEADER + '\nAUS,Steve Smith,49,37,BAT,R,LB,90,91,28,86,0,0,4' });
    this.modal('Import players', h('div', {},
      h('p', { class: 'note' }, 'Paste CSV with this header (teams: ' + Object.keys(this.teams).join(', ') + ', or a new code). Players are matched by team + name and updated, new names are added. JSON from Export also works. Optional extra column: replace=1 on the first row replaces that team\'s whole squad.'),
      h('code', { class: 'code' }, CSV_HEADER), ta,
      h('label', { class: 'fld row' }, h('input', { type: 'checkbox', id: 'imp-replace' }), h('span', {}, 'Replace whole squads of teams in the import'))),
      [{ label: 'Cancel' }, { label: 'Import', cls: 'gold', fn: () => { const n = this.app.importPlayers(ta.value, $('#imp-replace') && $('#imp-replace').checked); this.toast(n >= 0 ? `Imported ${n} players` : 'Could not read data', 2500); this.teamsScreen(); } }], { cls: 'wide' });
  }
  exportDialog() {
    const csv = this.app.exportCSV();
    const ta = h('textarea', { class: 'ta' }); ta.value = csv;
    this.modal('Export players', h('div', {}, h('p', { class: 'note' }, 'Copy this CSV, edit it in a spreadsheet and import it back.'), ta), [
      { label: 'Copy', cls: 'gold', keep: true, fn: () => { ta.select(); try { navigator.clipboard.writeText(csv); } catch (e) { document.execCommand('copy'); } this.toast('Copied'); } }, { label: 'Close' }], { cls: 'wide' });
  }

  // ================= settings =================
  settingsScreen() {
    const s = this.app.settings;
    const tog = (k, label) => h('label', { class: 'fld row' }, h('span', {}, label), h('input', { type: 'checkbox', ...(s[k] ? { checked: '' } : {}), onchange: e => { s[k] = e.target.checked; this.app.saveSettings(); } }));
    const choice = (k, label, opts) => h('div', { class: 'section' }, h('h3', {}, label), h('div', { class: 'chips' }, opts.map(([v, l]) => h('button', { class: 'chip ' + (s[k] === v ? 'sel' : ''), onclick: () => { s[k] = v; this.app.saveSettings(); this.settingsScreen(); } }, l))));
    this.screen(h('div', {},
      this.header('Settings', () => this.mainMenu()),
      this.diffRows(() => this.settingsScreen()),
      choice('quality', 'Graphics quality', [['high', 'High'], ['medium', 'Medium'], ['low', 'Battery saver']]),
      choice('camera', 'Batting camera', [['broadcast', 'Broadcast'], ['close', 'Close']]),
      h('div', { class: 'section' },
        tog('sound', 'Sound effects'), tog('crowdNoise', 'Crowd noise'), tog('pitchMarker', 'Show pitch marker & lengths when batting'), tog('batAssist', 'Batting timing assist'), tog('trail', 'Ball trail')),
      h('p', { class: 'note' }, 'Graphics changes apply after reopening the app.'),
    ));
  }

  // ================= HUD =================
  buildHUD() {
    this.hud = h('div', { id: 'hud' },
      h('div', { class: 'sb' },
        h('div', { class: 'sb-top' }, h('div', { class: 'sb-team', id: 'sb-team' }), h('div', { class: 'sb-score', id: 'sb-score' }), h('div', { class: 'sb-overs', id: 'sb-overs' }), h('button', { class: 'pause', onclick: () => this.pauseMenu() }, 'II')),
        h('div', { class: 'sb-info', id: 'sb-info' }),
        h('div', { class: 'sb-players' }, h('div', { id: 'sb-bat1' }), h('div', { id: 'sb-bat2' }), h('div', { id: 'sb-bowl' })),
        h('div', { class: 'sb-over', id: 'sb-over' })),
      h('div', { id: 'banner' }), h('div', { id: 'timing' }), h('div', { id: 'speed' }),
      h('div', { id: 'meter' }, h('div', { class: 'm-bar' }, h('div', { class: 'm-z z1' }), h('div', { class: 'm-z z2' }), h('div', { class: 'm-z z3' }), h('div', { class: 'm-z z2' }), h('div', { class: 'm-z z1' }), h('div', { class: 'm-z z0' }), h('div', { class: 'm-needle', id: 'm-needle' })), h('div', { class: 'm-label' }, 'TAP IN THE GREEN')),
      h('div', { id: 'controls' }));
    this.root.append(this.hud);
    this.showHUD(false);
  }
  showHUD(v) { this.hud.style.display = v ? 'block' : 'none'; }
  updateHUD(m, practice) {
    if (!m) return;
    const inn = R.curInn(m); const teams = this.teams;
    const bt = teams[m.teamIds[inn.bat]];
    $('#sb-team').innerHTML = ''; $('#sb-team').append(this.teamBadge(bt, 30));
    if (practice) {
      $('#sb-score').textContent = `${practice.runs}/${practice.outs}`;
      $('#sb-overs').textContent = `${practice.balls} balls`;
      $('#sb-info').textContent = `NETS · 4s ${practice.f4} · 6s ${practice.s6} · SR ${practice.balls ? Math.round(practice.runs * 100 / practice.balls) : 0}`;
      const b = R.findPlayer(teams, inn.striker), bw = R.findPlayer(teams, inn.curBowler);
      $('#sb-bat1').innerHTML = `<b>● ${b.name}</b>`; $('#sb-bat2').textContent = '';
      $('#sb-bowl').innerHTML = `<span>${bw.name}</span> <small>${bw.style}</small>`;
      $('#sb-over').innerHTML = practice.log.map(x => `<i class="bl b${x}">${x === '0' ? '•' : x}</i>`).join('');
      return;
    }
    $('#sb-score').textContent = `${inn.runs}/${inn.wkts}`;
    $('#sb-overs').textContent = m.overs ? `${R.oversStr(inn.balls)}/${m.overs}` : R.oversStr(inn.balls);
    let info = '';
    if (m.format === 'TEST') {
      const tot = R.teamTotals(m); const lead = tot[inn.bat] - tot[inn.bowl];
      info = `Day ${R.testDay(m)} · Inns ${m.cur + 1}` + (m.cur > 0 ? ` · ${lead >= 0 ? 'Lead' : 'Trail'} ${Math.abs(lead)}` : '') + (inn.target ? ` · Target ${inn.target}` : '');
    } else if (inn.target) {
      const rr = R.requiredRate(m);
      info = `Target ${inn.target} · Need ${Math.max(0, rr.need)} off ${rr.balls} · RRR ${rr.rrr.toFixed(2)}`;
    } else info = `${bt.name} · RR ${inn.balls ? (inn.runs * 6 / inn.balls).toFixed(2) : '0.00'}` + (m.toss ? '' : '');
    if (inn.freeHit) info = '⚡ FREE HIT · ' + info;
    $('#sb-info').textContent = info;
    const bline = (pid, star) => { if (!pid) return ''; const s = inn.bs[pid]; return `<b>${star ? '● ' : ''}${sur(m.names[pid])}</b> ${s.r}<small>(${s.b})</small>`; };
    $('#sb-bat1').innerHTML = bline(inn.striker, true); $('#sb-bat2').innerHTML = bline(inn.nonStriker, false);
    if (inn.curBowler) { const b = inn.bw[inn.curBowler]; $('#sb-bowl').innerHTML = `<span>${sur(m.names[inn.curBowler])}</span> ${b.wkts}-${b.runs} <small>(${R.oversStr(b.balls)})</small>`; }
    $('#sb-over').innerHTML = inn.overBalls.map(x => `<i class="bl b${x.replace(/\d/g, '') || x}">${x === '0' ? '•' : x}</i>`).join('');
  }

  // ----- controls -----
  hideControls() { $('#controls').innerHTML = ''; this.showMeter(false); }
  showBatControls(game) {
    const c = $('#controls'); c.innerHTML = '';
    const seg = h('div', { class: 'seg' }, [['defend', 'DEFEND'], ['drive', 'DRIVE'], ['loft', 'LOFT']].map(([k, l]) => h('button', { class: 'seg-b ' + (this.shotMode === k ? 'sel' : ''), onpointerdown: (e) => { e.stopPropagation(); this.shotMode = k; [...seg.children].forEach(b => b.classList.toggle('sel', b.textContent === l)); } }, l)));
    c.append(h('div', { class: 'bat-hint', id: 'bat-hint' }, 'Swipe: ↓ straight · ← → sides · ↑ behind'), seg);
  }
  hideBatHint() { const e = $('#bat-hint'); if (e) e.style.opacity = 0; }
  showBowlControls(game) {
    const c = $('#controls'); c.innerHTML = '';
    const spin = game.spin;
    const types = spin ? SPIN_TYPES : PACE_TYPES;
    const chips = h('div', { class: 'chips scroll' }, Object.entries(types).map(([k, v]) => h('button', { class: 'chip ' + (game.deliveryType === k ? 'sel' : ''), onpointerdown: (e) => { e.stopPropagation(); game.setDeliveryType(k); [...chips.children].forEach(b => b.classList.toggle('sel', b.dataset.k === k)); }, 'data-k': k }, k === 'wrong' ? spinVariationName(game.bowler.style) : v.name)));
    if (!types[game.deliveryType]) game.setDeliveryType('stock');
    const fp = h('button', { class: 'chip', onpointerdown: (e) => { e.stopPropagation(); const i = FIELD_PRESETS.indexOf(game.fieldPreset); game.fieldPreset = FIELD_PRESETS[(i + 1) % FIELD_PRESETS.length]; fp.textContent = 'Field: ' + game.fieldPreset; game.setupBall(); } }, 'Field: ' + game.fieldPreset);
    const bowl = h('button', { class: 'btn gold bowl-btn', onpointerdown: (e) => { e.stopPropagation(); this.hideControls(); game.startRunUp(); } }, 'BOWL');
    c.append(h('div', { class: 'bat-hint' }, 'Drag on the pitch to aim · ' + game.bowler.name + ' · ' + (STYLE_NAMES[game.bowler.style] || '')), chips, h('div', { class: 'row-b' }, fp, bowl));
  }
  showMeter(v) { $('#meter').style.display = v ? 'block' : 'none'; if (v) { $('#meter').classList.remove('locked'); } }
  updateMeter(v) { $('#m-needle').style.left = (v * 100) + '%'; }
  meterLocked(v) { $('#meter').classList.add('locked'); }
  timing(text, cls) {
    const e = $('#timing'); e.textContent = text; e.className = 'show ' + cls;
    clearTimeout(this._tt); this._tt = setTimeout(() => e.className = '', 1300);
  }
  speed(kmh) { const e = $('#speed'); e.textContent = kmh + ' km/h'; e.className = 'show'; clearTimeout(this._st); this._st = setTimeout(() => e.className = '', 2200); }
  banner(text, kind) {
    const e = $('#banner'); e.textContent = text; e.className = ''; void e.offsetWidth; e.className = 'show ' + (kind || '');
    clearTimeout(this._bt); this._bt = setTimeout(() => e.className = '', 2000);
  }

  // ----- touch handling -----
  bindTouch() {
    const layer = $('#touch');
    let st = null;
    const norm = (e) => ({ x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 });
    layer.addEventListener('pointerdown', (e) => {
      const g = this.game; if (!g || !g.m) return;
      this.app.audio.init();
      st = { x: e.clientX, y: e.clientY, t: performance.now(), fired: false };
      if (g.phase === 'aim') { const n = norm(e); g.setAimFromScreen(n.x, n.y); }
      else if (g.phase === 'runup' && g.userRole() === 'bowl') g.lockMeter();
      layer.setPointerCapture && layer.setPointerCapture(e.pointerId);
    });
    layer.addEventListener('pointermove', (e) => {
      const g = this.game; if (!st || !g || !g.m) return;
      if (g.phase === 'aim') { const n = norm(e); g.setAimFromScreen(n.x, n.y); return; }
      const dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.fired && Math.hypot(dx, dy) > 22 && g.userRole() === 'bat') { st.fired = true; g.onSwipe(dx, dy); }
    });
    const up = (e) => {
      const g = this.game; if (!st || !g || !g.m) { st = null; return; }
      if (!st.fired && g.phase !== 'aim') {
        const dx = e.clientX - st.x, dy = e.clientY - st.y;
        if (Math.hypot(dx, dy) > 22 && g.userRole() === 'bat') g.onSwipe(dx, dy);
        else g.skip();
      }
      st = null;
    };
    layer.addEventListener('pointerup', up); layer.addEventListener('pointercancel', () => st = null);
  }

  // ----- in-match modals -----
  pickBowler(m, cb) {
    const inn = R.curInn(m);
    const list = m.xi[inn.bowl].map(id => R.findPlayer(this.teams, id)).filter(Boolean).sort((a, b) => b.bowlSkill - a.bowlSkill);
    const rows = list.map(p => {
      const b = inn.bw[p.id]; const ok = R.canBowl(m, p.id);
      const ov = b ? R.oversStr(b.balls) : '0.0';
      return h('div', { class: 'p-row ' + (ok ? '' : 'dis'), onclick: () => { if (!ok) return; md.close(); cb(p.id); } },
        h('div', { class: 'p-main' }, h('b', {}, p.name), h('small', {}, `${STYLE_NAMES[p.style] || '—'} · BWL ${p.bowlSkill}`)),
        h('span', { class: 'mini' }, b ? `${b.wkts}-${b.runs}` : '0-0'), h('span', { class: 'mini' }, `${ov}${m.overs ? '/' + m.maxBowlerOvers : ''} ov`),
        p.id === inn.lastOverBowler ? h('span', { class: 'mini warn' }, 'last over') : (p.id === m.keeper[inn.bowl] ? h('span', { class: 'mini warn' }, 'keeper') : null));
    });
    const over = Math.floor(inn.balls / 6) + 1;
    const md = this.modal(`Over ${over} · choose bowler`, h('div', {}, this.miniScore(m), h('div', { class: 'list' }, rows)), [], { cls: 'wide' });
  }
  miniScore(m) {
    const inn = R.curInn(m);
    return h('div', { class: 'mini-score' }, `${this.teams[m.teamIds[inn.bat]].short} ${inn.runs}/${inn.wkts} (${R.oversStr(inn.balls)})` + (inn.target ? ` · need ${inn.target - inn.runs}` : ''));
  }
  overBreak(m, cb) {
    const inn = R.curInn(m);
    const last = inn.overs[inn.overs.length - 1];
    if (!last) { cb(); return; }
    this.toast(`End of over ${inn.overs.length}: ${last.runs} run${last.runs === 1 ? '' : 's'} · ${this.teams[m.teamIds[inn.bat]].short} ${inn.runs}/${inn.wkts}`, 1700);
    setTimeout(cb, 900);
  }
  wicketCard(m, o) {
    const inn = R.curInn(m);
    const lastOut = inn.fow[inn.fow.length - 1]; if (!lastOut) return;
    const b = inn.bs[lastOut.pid];
    this.toast(`${m.names[lastOut.pid]} ${b.how} ${b.r} (${b.b}) · ${b.f4}x4 ${b.s6}x6`, 2600);
  }
  inningsBreak(m, cb) {
    const prev = m.innings[m.cur - 1]; const cur = R.curInn(m);
    const t = this.teams;
    let msg = '';
    if (m.format !== 'TEST') msg = `${t[m.teamIds[cur.bat]].name} need ${cur.target} to win from ${m.overs} overs`;
    else {
      const tot = R.teamTotals(m); const lead = tot[cur.bowl] - tot[cur.bat];
      msg = (m.followOn && m.cur === 2 ? `${t[m.teamIds[cur.bat]].name} follow on. ` : '') + (cur.target ? `${t[m.teamIds[cur.bat]].name} need ${cur.target} to win` : `${t[m.teamIds[cur.bat]].name} ${lead > 0 ? 'trail by ' + lead : lead < 0 ? 'lead by ' + -lead : 'level'}`);
    }
    this.modal('Innings break', h('div', {}, this.inningsSummary(m, prev), h('p', { class: 'center big-note' }, msg)), [
      { label: 'Scorecard', keep: true, fn: () => this.scorecard(m) }, { label: 'Continue', cls: 'gold', fn: cb }], { cls: 'wide' });
  }
  followOn(m, cb) {
    const lead = m.innings[0].runs - m.innings[1].runs;
    this.modal('Enforce the follow-on?', h('p', {}, `You lead by ${lead}. Make them bat again?`), [{ label: 'Bat again ourselves', fn: () => cb(false) }, { label: 'Enforce', cls: 'gold', fn: () => cb(true) }]);
  }
  inningsSummary(m, inn) {
    const t = this.teams[m.teamIds[inn.bat]];
    const bats = inn.order.filter(id => inn.bs[id].b > 0 || inn.bs[id].out).map(id => ({ id, ...inn.bs[id] })).sort((a, b) => b.r - a.r).slice(0, 3);
    const bowls = Object.entries(inn.bw).map(([id, b]) => ({ id, ...b })).sort((a, b) => b.wkts - a.wkts || a.runs - b.runs).slice(0, 3);
    return h('div', { class: 'inn-sum' },
      h('div', { class: 'inn-head' }, this.teamBadge(t, 34), h('b', {}, t.name), h('span', { class: 'big' }, `${inn.runs}/${inn.wkts}${inn.declared ? 'd' : ''}`), h('small', {}, `(${R.oversStr(inn.balls)} ov)`)),
      h('div', { class: 'two' }, h('div', {}, bats.map(b => h('div', { class: 'ln' }, h('span', {}, sur(m.names[b.id])), h('b', {}, `${b.r}${b.out ? '' : '*'} (${b.b})`)))),
        h('div', {}, bowls.map(b => h('div', { class: 'ln' }, h('span', {}, sur(m.names[b.id])), h('b', {}, `${b.wkts}-${b.runs}`))))));
  }
  scorecard(m) {
    const tabs = m.innings.map((inn, i) => inn);
    let cur = m.cur;
    const body = h('div', {});
    const render = () => {
      body.innerHTML = '';
      const inn = m.innings[cur]; const t = this.teams[m.teamIds[inn.bat]];
      body.append(h('div', { class: 'chips center' }, tabs.map((x, i) => h('button', { class: 'chip ' + (i === cur ? 'sel' : ''), onclick: () => { cur = i; render(); } }, `${this.teams[m.teamIds[x.bat]].short} ${x.runs}/${x.wkts}`))));
      const tb = h('table', { class: 'card' }, h('tr', {}, h('th', {}, 'Batter'), h('th', {}, ''), h('th', {}, 'R'), h('th', {}, 'B'), h('th', {}, '4s'), h('th', {}, '6s'), h('th', {}, 'SR')));
      inn.order.forEach(id => {
        const b = inn.bs[id];
        const status = b.out ? b.how : (id === inn.striker || id === inn.nonStriker) && !inn.done ? 'not out' : (b.b > 0 ? 'not out' : 'dnb');
        tb.append(h('tr', { class: status === 'dnb' ? 'dim' : '' }, h('td', {}, sur(m.names[id]) + (id === m.keeper[inn.bat] ? ' †' : '')), h('td', { class: 'how' }, status), h('td', {}, String(b.r)), h('td', {}, String(b.b)), h('td', {}, String(b.f4)), h('td', {}, String(b.s6)), h('td', {}, b.b ? (b.r * 100 / b.b).toFixed(0) : '-')));
      });
      const ex = inn.extras;
      const tot = h('div', { class: 'ln' }, h('span', {}, `Extras ${ex.w + ex.nb + ex.b + ex.lb} (w ${ex.w}, nb ${ex.nb}, b ${ex.b}, lb ${ex.lb})`), h('b', {}, `${inn.runs}/${inn.wkts}${inn.declared ? 'd' : ''} (${R.oversStr(inn.balls)})`));
      const bw = h('table', { class: 'card' }, h('tr', {}, h('th', {}, 'Bowler'), h('th', {}, 'O'), h('th', {}, 'M'), h('th', {}, 'R'), h('th', {}, 'W'), h('th', {}, 'Econ')));
      inn.bowlerOrder.forEach(id => { const b = inn.bw[id]; bw.append(h('tr', {}, h('td', {}, sur(m.names[id])), h('td', {}, R.oversStr(b.balls)), h('td', {}, String(b.maidens)), h('td', {}, String(b.runs)), h('td', {}, String(b.wkts)), h('td', {}, b.balls ? (b.runs * 6 / b.balls).toFixed(2) : '-'))); });
      const fow = h('p', { class: 'note' }, 'FoW: ' + inn.fow.map(f => `${f.wkt}-${f.score} (${sur(m.names[f.pid])}, ${f.over})`).join(', '));
      body.append(h('h3', { class: 'sub' }, t.name), tb, tot, inn.fow.length ? fow : null, bw);
    };
    render();
    this.modal('Scorecard', body, [{ label: 'Close', cls: 'gold' }], { cls: 'wide tall' });
  }
  pauseMenu() {
    const g = this.game, m = g.m; if (!m) return;
    const prac = !!g.practice;
    const inn = R.curInn(m);
    const userBat = !prac && m.userTeam === inn.bat;
    g.paused = true;
    const btn = (label, fn, cls = '') => h('button', { class: 'btn ' + cls, onclick: () => { g.paused = false; md.close(); fn(); } }, label);
    const items = [btn('▶ Resume', () => { }, 'gold')];
    if (!prac) {
      items.push(btn('📋 Scorecard', () => this.scorecard(m)));
      items.push(btn('⏩ Sim this over', () => g.simulate('over')));
      items.push(btn('⏭ Sim to end of innings', () => this.confirm('Simulate the rest of this innings?', () => g.simulate('innings'))));
      items.push(btn('🏁 Sim to end of match', () => this.confirm('Simulate the rest of the match?', () => g.simulate('match'))));
      if (m.format === 'TEST' && userBat && !inn.done) items.push(btn('✋ Declare innings', () => this.confirm('Declare now at ' + inn.runs + '/' + inn.wkts + '?', () => { R.declare(m); g.save(); g.clearHumans(); g.phase = 'idle'; g.nextBall(); })));
    }
    items.push(btn('🎚 Difficulty', () => { g.paused = true; const body = h('div', {}); const fill = () => body.replaceChildren(...this.diffRows(fill)); fill(); this.modal('Difficulty', body, [{ label: 'Done', cls: 'gold', fn: () => { g.paused = false; } }], { cls: 'wide' }); }));
    items.push(btn('🔊 Sound: ' + (this.app.settings.sound ? 'On' : 'Off'), () => { this.app.settings.sound = !this.app.settings.sound; this.app.audio.setOn(this.app.settings.sound); this.app.saveSettings(); }));
    items.push(btn(prac ? '🚪 Leave nets' : '💾 Save & quit', () => this.mainMenu(), 'ghost'));
    if (!prac) items.push(btn('🗑 Abandon match', () => this.confirm('Abandon this match? It cannot be resumed.', () => { this.app.clearMatch(); this.mainMenu(); }), 'danger'));
    const md = this.modal('Paused', h('div', { class: 'btn-col' }, items), []);
  }
  confirm(text, fn) { this.modal(text, null, [{ label: 'Cancel' }, { label: 'Yes', cls: 'gold', fn }]); }

  matchOver(m) {
    this.app.clearMatch();
    const inSeries = m.seriesFix != null;
    if (inSeries) this.app.recordSeriesMatch(m);
    const res = R.resultText(m, this.teams);
    const pom = this.playerOfMatch(m);
    const userWon = m.result.winner === m.userTeam;
    this.app.game.stadium.drawBoard({ l1: 'RESULT', l2: m.result.winner >= 0 ? this.teams[m.teamIds[m.result.winner]].short + ' WIN' : (m.result.by === 'tie' ? 'TIE' : 'DRAW'), l3: '' });
    if (userWon) { this.app.audio.roar(1.5, 4); this.app.game.stadium.cheer = 1; }
    this.modal(userWon ? '🏆 Victory!' : m.result.winner === -1 ? 'Match over' : 'Defeat', h('div', {},
      h('p', { class: 'center big-note' }, res),
      m.innings.map(inn => this.inningsSummary(m, inn)),
      pom ? h('div', { class: 'pom' }, h('small', {}, 'Player of the Match'), h('b', {}, m.names[pom.id]), h('span', {}, pom.line)) : null,
    ), [{ label: 'Scorecard', keep: true, fn: () => this.scorecard(m) }, inSeries ? { label: 'Continue series', cls: 'gold', fn: () => this.seriesHub() } : { label: 'Main menu', cls: 'gold', fn: () => this.mainMenu() }], { cls: 'wide tall' });
  }
  playerOfMatch(m) {
    const sc = {};
    const add = (id, v, line) => { sc[id] = sc[id] || { id, v: 0, bat: 0, w: 0, r: 0 }; sc[id].v += v; };
    for (const inn of m.innings) {
      for (const [id, b] of Object.entries(inn.bs)) { add(id, b.r + (b.r >= 50 ? 15 : 0) + (b.r >= 100 ? 25 : 0)); sc[id].bat += b.r; }
      for (const [id, b] of Object.entries(inn.bw)) { add(id, b.wkts * 22 - (m.overs ? Math.max(0, b.runs - b.balls * 1.2) * 0.3 : 0)); sc[id].w += b.wkts; sc[id].r += b.runs; }
    }
    const win = m.result.winner;
    let best = null;
    for (const s of Object.values(sc)) { const team = m.xi[0].includes(s.id) ? 0 : 1; const v = s.v * (team === win ? 1.25 : 1); if (!best || v > best.vv) best = { ...s, vv: v }; }
    if (!best) return null;
    best.line = [best.bat ? best.bat + ' runs' : '', best.w ? best.w + '/' + best.r : ''].filter(Boolean).join(' · ');
    return best;
  }
}
