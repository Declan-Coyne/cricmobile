// CricMobile player database, built at load time from MalePlayers.csv (bundled as text by esbuild).
// Teams come from the CSV "Associated teams" column; only teams listed in TEAMS below are built.
// All values are editable in-game (Teams > tap player) or via CSV/JSON import.
import CSV from '../../MalePlayers.csv';

// CSV team name: [id, short, category, [shirt, trim, pants], cap]
const TEAMS = {
  'Australia': ['AUS', 'AUS', 'International', ['#F5C400', '#00653A', '#F5C400'], '#0B5B34'],
  'India': ['IND', 'IND', 'International', ['#1C4FA0', '#FF8C1A', '#13336B'], '#0E2E6E'],
  'England': ['ENG', 'ENG', 'International', ['#1B2A6B', '#D0103A', '#8DC8F0'], '#0E1A45'],
  'New Zealand': ['NZ', 'NZ', 'International', ['#111111', '#7FD1C7', '#2A2A2A'], '#0A0A0A'],
  'South Africa': ['SA', 'SA', 'International', ['#00744A', '#FFC52E', '#0A4F33'], '#06432A'],
  'West Indies': ['WI', 'WI', 'International', ['#7A0E35', '#FFC72C', '#5A0A27'], '#5A0A27'],
  'Pakistan': ['PAK', 'PAK', 'International', ['#0B6B2E', '#9BE15D', '#064A1F'], '#06401C'],
  'Sri Lanka': ['SL', 'SL', 'International', ['#123C8C', '#F8C51C', '#0B2A66'], '#0B2A66'],
  'Bangladesh': ['BAN', 'BAN', 'International', ['#006A4E', '#E83A3F', '#004D38'], '#004D38'],
  'Afghanistan': ['AFG', 'AFG', 'International', ['#1560BD', '#D32011', '#0D3F82'], '#0D3F82'],
  'Ireland': ['IRE', 'IRE', 'International', ['#169B62', '#FFFFFF', '#0E6B43'], '#0E6B43'],
  'Zimbabwe': ['ZIM', 'ZIM', 'International', ['#D40000', '#FCE300', '#9C0000'], '#9C0000'],
  'Scotland': ['SCO', 'SCO', 'International', ['#4B2C83', '#9AD4F5', '#2B1A55'], '#2B1A55'],
  'Netherlands': ['NED', 'NED', 'International', ['#FF6F00', '#1B3D8F', '#E35F00'], '#1B3D8F'],
  'United States of America': ['USA', 'USA', 'International', ['#1F3A93', '#D2232A', '#14275F'], '#14275F'],
  'Canada': ['CAN', 'CAN', 'International', ['#D80621', '#FFFFFF', '#A0041A'], '#A0041A'],
  'Namibia': ['NAM', 'NAM', 'International', ['#003580', '#D21034', '#00265C'], '#00265C'],
  'Nepal': ['NEP', 'NEP', 'International', ['#003893', '#DC143C', '#00276A'], '#DC143C'],
  'Oman': ['OMA', 'OMA', 'International', ['#C8102E', '#008000', '#8E0B20'], '#8E0B20'],
  'United Arab Emirates': ['UAE', 'UAE', 'International', ['#6E6F71', '#00843D', '#3F4042'], '#00843D'],
  'Italy': ['ITA', 'ITA', 'International', ['#0064AA', '#FFFFFF', '#004679'], '#004679'],
  'Papua New Guinea': ['PNG', 'PNG', 'International', ['#CE1126', '#FCD116', '#111111'], '#111111'],
  'Uganda': ['UGA', 'UGA', 'International', ['#FCDC04', '#111111', '#D90000'], '#111111'],
  'Hong Kong, China': ['HK', 'HK', 'International', ['#DE2910', '#FFFFFF', '#A51E0B'], '#A51E0B'],
  'Kenya': ['KEN', 'KEN', 'International', ['#006600', '#BB0000', '#111111'], '#111111'],
  'Malaysia': ['MAS', 'MAS', 'International', ['#FFCC00', '#010066', '#010066'], '#010066'],
  'Singapore': ['SIN', 'SIN', 'International', ['#EF3340', '#FFFFFF', '#B0202B'], '#B0202B'],
  'Thailand': ['THA', 'THA', 'International', ['#2D2A4A', '#A51931', '#1C1A30'], '#A51931'],
  'Qatar': ['QAT', 'QAT', 'International', ['#8A1538', '#FFFFFF', '#5E0E26'], '#5E0E26'],
  'Kuwait': ['KUW', 'KUW', 'International', ['#007A3D', '#CE1126', '#00532A'], '#00532A'],
  'Denmark': ['DEN', 'DEN', 'International', ['#C60C30', '#FFFFFF', '#8E0822'], '#8E0822'],
  'Germany': ['GER', 'GER', 'International', ['#1A1A1A', '#DD0000', '#111111'], '#FFCE00'],
  'Jersey': ['JER', 'JER', 'International', ['#C8102E', '#FFFFFF', '#8E0B20'], '#8E0B20'],
  'Bermuda': ['BER', 'BER', 'International', ['#0047AB', '#F4A6C6', '#00307A'], '#00307A'],
  'Vanuatu': ['VAN', 'VAN', 'International', ['#009543', '#D21034', '#006B30'], '#111111'],
  'Chennai Super Kings': ['CSK', 'CSK', 'IPL', ['#F9CD05', '#1C4FA0', '#1C4FA0'], '#F9CD05'],
  'Mumbai Indians': ['MI', 'MI', 'IPL', ['#004BA0', '#D1AB3E', '#003A7D'], '#004BA0'],
  'Bengaluru Crowns': ['BC', 'BC', 'IPL', ['#D71920', '#111111', '#111111'], '#D71920'],
  'Kolkata Knight Riders': ['KKR', 'KKR', 'IPL', ['#3A225D', '#D4AF37', '#2A1845'], '#3A225D'],
  'SunRisers Hyderabad': ['SRH', 'SRH', 'IPL', ['#FF822A', '#111111', '#111111'], '#FF822A'],
  'Rajasthan Royals': ['RR', 'RR', 'IPL', ['#EA1A85', '#254AA5', '#254AA5'], '#254AA5'],
  'Delhi Capitals': ['DC', 'DC', 'IPL', ['#17479E', '#EF1B23', '#0F3170'], '#17479E'],
  'Punjab Kings': ['PBKS', 'PBKS', 'IPL', ['#DD1F2D', '#C0C0C0', '#A0151F'], '#DD1F2D'],
  'Gujarat Titans': ['GT', 'GT', 'IPL', ['#1B2133', '#D9B44A', '#111520'], '#1B2133'],
  'Lucknow Super Giants': ['LSG', 'LSG', 'IPL', ['#0057E2', '#F28B00', '#003FA3'], '#0057E2'],
  'Perth Scorchers': ['PRS', 'PRS', 'BBL', ['#F26722', '#111111', '#111111'], '#F26722'],
  'Sydney Sixers': ['SYS', 'SYS', 'BBL', ['#E6007E', '#111111', '#111111'], '#E6007E'],
  'Sydney Thunder': ['SYT', 'SYT', 'BBL', ['#A2C83B', '#111111', '#111111'], '#A2C83B'],
  'Melbourne Stars': ['MLS', 'MLS', 'BBL', ['#00A651', '#111111', '#111111'], '#00A651'],
  'Melbourne Renegades': ['MLR', 'MLR', 'BBL', ['#E31B23', '#111111', '#111111'], '#E31B23'],
  'Brisbane Heat': ['BRH', 'BRH', 'BBL', ['#00A3AD', '#F0E000', '#007A82'], '#00A3AD'],
  'Adelaide Strikers': ['ADS', 'ADS', 'BBL', ['#0072CE', '#FFD100', '#00539A'], '#0072CE'],
  'Hobart Hurricanes': ['HBH', 'HBH', 'BBL', ['#6A2C91', '#111111', '#111111'], '#6A2C91'],
  'Lahore Qalandars': ['LHQ', 'LHQ', 'PSL', ['#00A650', '#E4002B', '#00733A'], '#00A650'],
  'Karachi Kings': ['KRK', 'KRK', 'PSL', ['#1C3F94', '#E4002B', '#132C6A'], '#1C3F94'],
  'Islamabad United': ['ISU', 'ISU', 'PSL', ['#E4002B', '#111111', '#111111'], '#E4002B'],
  'Peshawar Zalmi': ['PSZ', 'PSZ', 'PSL', ['#FDB913', '#111111', '#111111'], '#FDB913'],
  'Quetta Gladiators': ['QTG', 'QTG', 'PSL', ['#5B2A86', '#FDB913', '#3F1D5E'], '#5B2A86'],
  'Multan Sultans': ['MUS', 'MUS', 'PSL', ['#00A99D', '#84BD00', '#007A71'], '#00A99D'],
  'Hyderabad Kingsmen': ['HYK', 'HYK', 'PSL', ['#0B2545', '#E2B13C', '#081A31'], '#0B2545'],
  'Rawalpindiz': ['RWP', 'RWP', 'PSL', ['#B5121B', '#F2F2F2', '#7F0D13'], '#B5121B'],
  'Trinbago Knight Riders': ['TKR', 'TKR', 'CPL', ['#D71920', '#111111', '#111111'], '#D71920'],
  'Guyana Amazon Warriors': ['GAW', 'GAW', 'CPL', ['#00843D', '#F2C300', '#005C2A'], '#00843D'],
  'Barbados Tridents': ['BT', 'BT', 'CPL', ['#1B3D8F', '#F2C300', '#132B66'], '#1B3D8F'],
  'Jamaica Kingsmen': ['JK', 'JK', 'CPL', ['#111111', '#F2C300', '#111111'], '#00843D'],
  'St Kitts & Nevis Patriots': ['SKN', 'SKN', 'CPL', ['#E4002B', '#00843D', '#A0001E'], '#E4002B'],
  'St Lucia Kings': ['SLK', 'SLK', 'CPL', ['#0B4EA2', '#F2C300', '#083878'], '#0B4EA2'],
  'Antigua and Barbuda Falcons': ['ABF', 'ABF', 'CPL', ['#111111', '#D71920', '#111111'], '#D71920'],
  'Cape Town Heroes': ['CTH', 'CTH', 'SA20', ['#00539B', '#E4002B', '#003B6E'], '#00539B'],
  'Durban Dugongs': ['DD', 'DD', 'SA20', ['#00A3AD', '#1B2133', '#007A82'], '#1B2133'],
  'Eastern Cape Shine': ['ECS', 'ECS', 'SA20', ['#FF822A', '#111111', '#111111'], '#FF822A'],
  'Johannesburg Regents': ['JR', 'JR', 'SA20', ['#F9CD05', '#111111', '#111111'], '#F9CD05'],
  'Paarl Pride': ['PP', 'PP', 'SA20', ['#EA1A85', '#1B3D8F', '#1B3D8F'], '#EA1A85'],
  'Pretoria Power': ['PPW', 'PPW', 'SA20', ['#2B2A6E', '#E4002B', '#1D1C4D'], '#2B2A6E'],
  'Chittagong Charge': ['CHC', 'CHC', 'BPL', ['#0B4EA2', '#F2C300', '#083878'], '#0B4EA2'],
  'Comilla Conquerors': ['COM', 'COM', 'BPL', ['#E4002B', '#111111', '#111111'], '#E4002B'],
  'Dhaka Damagers': ['DHD', 'DHD', 'BPL', ['#111111', '#00A650', '#111111'], '#00A650'],
  'Khulna KingFish': ['KKF', 'KKF', 'BPL', ['#00A3AD', '#F26722', '#007A82'], '#00A3AD'],
  'Rajshahi Rams': ['RJR', 'RJR', 'BPL', ['#5B2A86', '#FDB913', '#3F1D5E'], '#5B2A86'],
  'Rangpur Road Warriors': ['RRW', 'RRW', 'BPL', ['#F26722', '#1B2133', '#1B2133'], '#F26722'],
  'Sylhet Stallions': ['SYL', 'SYL', 'BPL', ['#00843D', '#E4002B', '#005C2A'], '#00843D'],
  'Colombo Crusaders': ['CCR', 'CCR', 'LPL', ['#0B4EA2', '#E2B13C', '#083878'], '#0B4EA2'],
  'Dambulla Dragons': ['DBD', 'DBD', 'LPL', ['#E4002B', '#F2C300', '#A0001E'], '#E4002B'],
  'Galle Gorillas': ['GG', 'GG', 'LPL', ['#5B2A86', '#00A3AD', '#3F1D5E'], '#5B2A86'],
  'Jaffna Giants': ['JG', 'JG', 'LPL', ['#F9CD05', '#111111', '#111111'], '#F9CD05'],
  'Kandy Klashers': ['KDK', 'KDK', 'LPL', ['#00A650', '#111111', '#111111'], '#00A650'],
};

export const STYLE_NAMES = {
  RF: 'Right-arm fast', RFM: 'Right-arm fast-medium', RM: 'Right-arm medium',
  LF: 'Left-arm fast', LFM: 'Left-arm fast-medium', LM: 'Left-arm medium',
  OB: 'Right-arm off-break', LB: 'Right-arm leg-break', SLA: 'Slow left-arm orthodox',
  LWS: 'Left-arm wrist spin', '-': 'Does not bowl',
};
export const ROLE_NAMES = { BAT: 'Batter', BAR: 'Batting All-rounder', BWAR: 'Bowling All-rounder', BOWL: 'Bowler', WK: 'Wicket-keeper' };

export function styleHand(style) {
  if (!style || style === '-') return 'R';
  if (style === 'SLA' || style === 'LWS' || style[0] === 'L' && style !== 'LB') return 'L';
  return 'R';
}
export function isSpin(style) { return ['OB', 'LB', 'SLA', 'LWS'].includes(style); }
export function isPace(style) { return ['RF', 'RFM', 'RM', 'LF', 'LFM', 'LM'].includes(style); }

const ROLE_MAP = { 'Batter': 'BAT', 'Batting All-Rounder': 'BAR', 'Bowling All-Rounder': 'BWAR', 'Bowler': 'BOWL', 'Wicketkeeper': 'WK' };
const STYLE_MAP = { 'Finger Spin': ['OB', 'SLA'], 'Wrist Spin': ['LB', 'LWS'], 'Medium': ['RM', 'LM'], 'Fast-Medium': ['RFM', 'LFM'], 'Fast': ['RF', 'LF'] };
const SKIN = { Light: '#f1c9a5', Medium: '#d9a37e', Brown: '#a8754f', Dark: '#4a2f1d' };
const HAIR = { 'Black': '#111111', 'Dark brown': '#2e1d12', 'Brown': '#5a3a22', 'Light brown': '#8a6440', 'Auburn': '#7a3a1c', 'Blonde': '#d9b56a' };
const SLOT = { 'Opener': 0, 'Top Order': 1, 'Middle Order': 2, 'Lower Order': 3, 'Tailender': 4 };

function splitCSV(line) {
  const out = []; let cur = '', q = false;
  for (const c of line) { if (c === '"') q = !q; else if (c === ',' && !q) { out.push(cur.trim()); cur = ''; } else cur += c; }
  out.push(cur.trim()); return out;
}
const hash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
function age(dob) {
  const [d, m, y] = dob.split('/').map(Number); if (!y) return 25;
  const now = new Date(); let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return a;
}

const CARIB = ['West Indies', 'Barbados', 'Trinidad and Tobago', 'Jamaica', 'Guyana', 'Antigua and Barbuda', 'Saint Lucia', 'St Lucia', 'Saint Kitts and Nevis', 'St Kitts and Nevis', 'Grenada', 'Dominica', 'Saint Vincent and the Grenadines', 'St Vincent and the Grenadines'];
// League overseas limits per playing XI: [local nationalities, max overseas]
const OVERSEAS = { IPL: [['India'], 4], BBL: [['Australia'], 3], PSL: [['Pakistan'], 4], SA20: [['South Africa'], 4], BPL: [['Bangladesh'], 4], CPL: [CARIB, 4] };

// Best XI for a format, ordered by the CSV batting slot: keeper, 4 bowlers, 2 all-rounders, then best batters.
function pickXI(ps, slot, cat) {
  const xi = [];
  const [local, max] = OVERSEAS[cat] || [null, 11];
  const os = p => local && !local.includes(p.nat);
  const take = (pred, n, score, force) => {
    for (const p of ps.filter(p => !xi.includes(p) && pred(p)).sort((a, b) => score(b) - score(a))) {
      if (n <= 0) break;
      if (!force && os(p) && xi.filter(os).length >= max) continue;
      xi.push(p); n--;
    }
  };
  take(p => p.role === 'WK', 1, p => p.ovr);
  take(p => (p.role === 'BOWL' || p.role === 'BWAR') && isSpin(p.style), 1, p => p.bowlSkill); // every XI has a frontline spinner
  take(p => p.role === 'BOWL' || p.role === 'BWAR', 3, p => p.bowlSkill);
  take(p => p.role === 'BAR' || p.role === 'BWAR', 2, p => p.ovr);
  take(p => p.role !== 'BOWL', 4, p => p.batSkill);
  take(() => true, 11 - xi.length, p => p.ovr);
  take(() => true, 11 - xi.length, p => p.ovr, true); // not enough locals: ignore the limit
  return xi.sort((a, b) => a.slot[slot] - b.slot[slot] || b.batSkill - a.batSkill);
}

export function buildDefaultTeams() {
  const lines = CSV.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const H = splitCSV(lines[0]);
  const rows = lines.slice(1).map(l => { const f = splitCSV(l); const o = {}; H.forEach((k, i) => o[k] = f[i] || ''); return o; });
  // Unknown skin: weighted guess from the known skin tones of the same nationality (deterministic per name).
  const known = {};
  for (const r of rows) if (SKIN[r['Skin colour']]) (known[r.Nationality] = known[r.Nationality] || []).push(r['Skin colour']);
  const all = rows.map(r => r['Skin colour']).filter(s => SKIN[s]);
  const teams = {};
  for (const [name, [id, short, cat, kit, cap]] of Object.entries(TEAMS)) teams[id] = { id, name, short, cat, kit, cap, players: [] };
  // The CSV leaves some internationals (e.g. Nathan Lyon) off their national team: call up each country's 8 best unlisted nationals.
  const teamsOf = r => r['Associated teams'].split(';').map(s => s.trim());
  for (const [name, [, , cat]] of Object.entries(TEAMS)) {
    if (cat !== 'International') continue;
    const nats = name === 'West Indies' ? CARIB : [name];
    rows.filter(r => nats.includes(r.Nationality) && !teamsOf(r).includes(name) && +r.Overall >= 70)
      .sort((a, b) => b.Overall - a.Overall).slice(0, 8).forEach(r => (r.callUps = r.callUps || []).push(name));
  }
  for (const r of rows) {
    const name = (r['First name'] + ' ' + r['Last name']).trim();
    const pool = known[r.Nationality] || all;
    const skin = SKIN[r['Skin colour']] || SKIN[pool[hash(name) % pool.length]];
    const role = ROLE_MAP[r.Role] || 'BAT';
    const lefty = /^l/i.test(r['Bowling hand']);
    const st = STYLE_MAP[r['Bowling type']];
    const style = role === 'WK' || !st ? '-' : st[lefty ? 1 : 0];
    const ovr = +r.Overall || 60, a = age(r.DOB);
    for (const tn of [...teamsOf(r), ...(r.callUps || [])]) {
      const t = TEAMS[tn] && teams[TEAMS[tn][0]]; if (!t) continue;
      t.players.push({
        id: t.id + '_' + t.players.length, name, num: +r['Player number'] || 0, age: a, role,
        bat: /^l/i.test(r['Batting hand']) ? 'L' : 'R', style, bowlHand: style === '-' ? (lefty ? 'L' : 'R') : styleHand(style),
        ovr, batSkill: +r['Batting OVR'] || 30, bowlSkill: +r['Bowling OVR'] || 10,
        // shortcut: the CSV has no fielding rating, so it is derived from overall + age; add a column to override.
        field: Math.max(40, Math.min(95, Math.round(ovr * 0.85 + (30 - a) * 0.5 + 12))),
        skin, hair: HAIR[r['Hair colour']] || HAIR.Black, nat: r.Nationality,
        slot: { short: SLOT[r['Batting position (short form)']] ?? 2, long: SLOT[r['Batting position (long form)']] ?? 2 },
        pos: { T20: 0, ODI: 0, TEST: 0 },
      });
    }
  }
  for (const id of Object.keys(teams)) {
    const t = teams[id];
    if (t.players.length < 11) { delete teams[id]; continue; }
    for (const [fmt, slot] of [['T20', 'short'], ['ODI', 'short'], ['TEST', 'long']]) pickXI(t.players, slot, t.cat).forEach((p, i) => p.pos[fmt] = i + 1);
    t.players.forEach(p => { delete p.slot; delete p.nat; });
  }
  return teams;
}

export function defaultXI(t, fmt) {
  let xi = t.players.filter(p => p.pos[fmt] > 0).sort((a, b) => a.pos[fmt] - b.pos[fmt]).map(p => p.id);
  if (xi.length < 11) {
    const rest = t.players.filter(p => !xi.includes(p.id)).sort((a, b) => b.ovr - a.ovr);
    while (xi.length < 11 && rest.length) xi.push(rest.shift().id);
  }
  return xi.slice(0, 11);
}
export function defaultKeeper(t, xi, fmt) {
  if (t.keepers && xi.includes(t.keepers[fmt])) return t.keepers[fmt]; // saved from the default XI editor
  const ps = xi.map(id => t.players.find(p => p.id === id));
  const wks = ps.filter(p => p.role === 'WK');
  if (wks.length) return wks[wks.length - 1].id;
  return ps.sort((a, b) => b.field - a.field)[0].id;
}

export const CSV_HEADER = 'team,name,number,age,role,bat_hand,bowl_style,overall,batting,bowling,fielding,t20_pos,odi_pos,test_pos';
