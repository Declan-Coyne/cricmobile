import * as THREE from 'three';
import { buildDefaultTeams, styleHand, CSV_HEADER } from './data.js';
import { Stadium } from './scene.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import * as R from './rules.js';
import * as S from './series.js';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

// In the iPhone app: fetch newer game builds published as GitHub release assets. Applied the next time the app opens.
const UPDATE_BASE = 'https://github.com/Declan-Coyne/cricmobile/releases/latest/download/';
async function checkForUpdate(ui) {
  try {
    await CapacitorUpdater.notifyAppReady(); // tells the updater this build started fine (else it rolls back)
    const r = await CapacitorHttp.get({ url: UPDATE_BASE + 'version.json' });
    const remote = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    if (r.status !== 200 || !(+remote.build > __BUILD__)) return;
    const b = await CapacitorUpdater.download({ url: UPDATE_BASE + 'bundle.zip', version: '1.0.' + remote.build });
    await CapacitorUpdater.next({ id: b.id });
    ui.toast('Update downloaded · close and reopen CricMobile to play it', 4000);
  } catch (e) { console.warn('update check failed', e); } // offline or GitHub unreachable: keep playing the current build
}

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } },
};

const DEFAULT_SETTINGS = { diffBatPace: 'normal', diffBatSpin: 'normal', diffBowl: 'normal', quality: 'high', camera: 'broadcast', sound: true, crowdNoise: true, pitchMarker: true, batAssist: false, trail: true, time: 'day' };

class App {
  constructor() {
    const saved = LS.get('cm_settings', {}), d = saved.difficulty; // older saves had one difficulty for everything
    this.settings = { ...DEFAULT_SETTINGS, ...(d ? { diffBatPace: d, diffBatSpin: d, diffBowl: d } : {}), ...saved };
    this.teams = LS.get('cm_teams', null) || buildDefaultTeams();
    this.series = LS.get('cm_series', null);
    this.audio = new Audio(); this.audio.setOn(this.settings.sound); this.audio.setCrowd(this.settings.crowdNoise);
    this.initRenderer();
    this.stadium = new Stadium(this.scene, this.settings.quality);
    this.ui = new UI(this);
    this.game = new Game({ renderer: this.renderer, scene: this.scene, camera: this.camera, stadium: this.stadium, audio: this.audio, ui: this.ui, settings: this.settings, getTeams: () => this.teams, save: () => this.saveMatch() });
    this.ui.mainMenu();
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveMatch(); });
    const unlock = () => { this.audio.init(); };
    // iOS only lets audio start on touchend/click, not pointerdown
    for (const ev of ['pointerdown', 'touchend', 'click']) window.addEventListener(ev, unlock, { passive: true });
    const ld = document.getElementById('loading'); if (ld) ld.remove();
    if (Capacitor.isNativePlatform()) checkForUpdate(this.ui);
  }
  initRenderer() {
    const q = this.settings.quality;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: q !== 'low', powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, q === 'high' ? 2.5 : q === 'medium' ? 2 : 1.25));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = q !== 'low'; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('app').prepend(r.domElement);
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#c9dcf0', 250, 520);
    this.camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.3, 1200); // larger near plane = better depth precision, less flicker
    this.camera.position.set(0, 40, -120);
    const resize = () => { r.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); };
    window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  }
  frame() {
    const now = performance.now(); let dt = (now - this.last) / 1000; this.last = now; dt = Math.min(dt, 1 / 20);
    if (this.game.m) { if (!this.game.paused) this.game.update(dt); else this.stadium.update(this.game.time, dt); }
    else {
      // menu flyover
      this.game.time += dt; this.stadium.update(this.game.time, dt);
      const t = this.game.time * 0.05;
      this.camera.position.set(Math.sin(t) * 55, 22 + Math.sin(t * 0.7) * 6, -10 + Math.cos(t) * 55);
      this.camera.lookAt(0, 2, -10);
      if (this.camera.fov !== 50) { this.camera.fov = 50; this.camera.updateProjectionMatrix(); }
    }
    this.scene.fog.color.set(this.stadium.night ? '#0b1428' : '#c9dcf0');
    this.renderer.render(this.scene, this.camera);
  }

  // ----- persistence -----
  saveSettings() { LS.set('cm_settings', this.settings); this.audio.setOn(this.settings.sound); this.audio.setCrowd(this.settings.crowdNoise); }
  saveTeams() { LS.set('cm_teams', this.teams); }
  resetTeams() { LS.del('cm_teams'); this.teams = buildDefaultTeams(); }
  saveMatch() { if (this.game.m && !this.game.practice && !this.game.m.result) LS.set('cm_match', this.game.m); }
  loadMatch() { return LS.get('cm_match', null); }
  clearMatch() { LS.del('cm_match'); }

  saveSeries() { if (this.series) LS.set('cm_series', this.series); else LS.del('cm_series'); }
  recordSeriesMatch(m) {
    const s = this.series, f = s && s.id === m.seriesId && s.fixtures[m.seriesFix];
    if (f) { S.record(s, f, m, this.teams); this.saveSeries(); }
  }
  startMatch(m) { this.audio.init(); this.game.startMatch(m); this.saveMatch(); }
  resumeMatch() {
    const m = this.loadMatch(); if (!m) return;
    this.ui.clearScreens();
    this.audio.init();
    this.settings.time = m.time || this.settings.time;
    this.game.startMatch(m);
  }
  startPractice(cfg) { this.audio.init(); this.game.startPractice(cfg); }

  // ----- import / export -----
  exportCSV() {
    const rows = [CSV_HEADER];
    for (const t of Object.values(this.teams)) for (const p of t.players)
      rows.push([t.id, p.name, p.num, p.age, p.role, p.bat, p.style, p.ovr, p.batSkill, p.bowlSkill, p.field, p.pos.T20, p.pos.ODI, p.pos.TEST].map(v => String(v).includes(',') ? `"${v}"` : v).join(','));
    return rows.join('\n');
  }
  importPlayers(text, replace) {
    text = (text || '').trim(); if (!text) return -1;
    try {
      if (text[0] === '{') {
        const obj = JSON.parse(text);
        for (const [id, t] of Object.entries(obj)) if (t.players) this.teams[id] = t;
        this.saveTeams(); return Object.values(obj).reduce((a, t) => a + (t.players ? t.players.length : 0), 0);
      }
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      const split = l => { const out = []; let cur = '', q = false; for (const c of l) { if (c === '"') q = !q; else if ((c === ',' || c === '\t' || c === ';') && !q) { out.push(cur.trim()); cur = ''; } else cur += c; } out.push(cur.trim()); return out; };
      let header = split(lines[0]).map(s => s.toLowerCase().replace(/[^a-z0-9]/g, '_'));
      let start = 1;
      if (!header.includes('name')) { header = CSV_HEADER.split(','); start = 0; }
      const idx = k => { const alts = { team: ['team', 'country', 'nation'], name: ['name', 'player'], number: ['number', 'num', 'no', 'shirt', 'shirt_no', 'jersey'], age: ['age'], role: ['role', 'player_role'], bat_hand: ['bat_hand', 'batting_hand', 'bats', 'bat'], bowl_style: ['bowl_style', 'bowling_style', 'style', 'bowling'], overall: ['overall', 'ovr', 'rating'], batting: ['batting', 'bat_skill', 'batting_skill', 'batting_rating'], bowling: ['bowling', 'bowl_skill', 'bowling_skill', 'bowling_rating'], fielding: ['fielding', 'field', 'fld'], t20_pos: ['t20_pos', 't20', 't20_position'], odi_pos: ['odi_pos', 'odi', 'odi_position'], test_pos: ['test_pos', 'test', 'test_position'] }[k] || [k]; for (const a of alts) { const i = header.indexOf(a); if (i >= 0) return i; } return -1; };
      const I = {}; for (const k of CSV_HEADER.split(',')) I[k] = idx(k);
      const roleMap = r => { r = (r || '').toUpperCase().replace(/[^A-Z]/g, ''); if (['BAT', 'BATTER', 'BATSMAN'].includes(r)) return 'BAT'; if (['WK', 'WICKETKEEPER', 'KEEPER', 'WKBAT', 'WICKETKEEPERBATTER'].includes(r)) return 'WK'; if (['BAR', 'BATAR', 'BATTINGALLROUNDER', 'BATALLROUND', 'BATALLROUNDER'].includes(r)) return 'BAR'; if (['BWAR', 'BOWLAR', 'BOWLINGALLROUNDER', 'BOWLALLROUND', 'BOWLALLROUNDER', 'AR', 'ALLROUNDER'].includes(r)) return 'BWAR'; if (['BOWL', 'BOWLER'].includes(r)) return 'BOWL'; return 'BAT'; };
      const styleMap = s => { s = (s || '-').toUpperCase().replace(/\s+/g, ''); const ok = ['RF', 'RFM', 'RM', 'LF', 'LFM', 'LM', 'OB', 'LB', 'SLA', 'LWS', '-']; if (ok.includes(s)) return s; if (s.includes('OFF')) return 'OB'; if (s.includes('LEG')) return 'LB'; if (s.includes('ORTHODOX')) return 'SLA'; if (s.includes('WRIST') || s.includes('CHINAMAN')) return 'LWS'; if (s.startsWith('LEFT') || s.startsWith('L')) return s.includes('MED') ? (s.includes('FAST') ? 'LFM' : 'LM') : 'LF'; if (s.startsWith('RIGHT') || s.startsWith('R')) return s.includes('MED') ? (s.includes('FAST') ? 'RFM' : 'RM') : 'RF'; return '-'; };
      const cleared = new Set(); let n = 0;
      for (let li = start; li < lines.length; li++) {
        const f = split(lines[li]);
        const g = k => I[k] >= 0 ? f[I[k]] : undefined;
        const tid = (g('team') || '').toUpperCase(); const name = g('name'); if (!tid || !name) continue;
        if (!this.teams[tid]) this.teams[tid] = { id: tid, name: tid, short: tid.slice(0, 3), cat: 'Custom', kit: ['#334', '#ccc', '#223'], cap: '#223', players: [] };
        const t = this.teams[tid];
        if (replace && !cleared.has(tid)) { t.players = []; cleared.add(tid); }
        let p = t.players.find(x => x.name.toLowerCase() === name.toLowerCase());
        if (!p) { p = { id: tid + '_i' + Date.now().toString(36) + li, name, num: 0, age: 25, role: 'BAT', bat: 'R', style: '-', bowlHand: 'R', ovr: 70, batSkill: 70, bowlSkill: 10, field: 70, pos: { T20: 0, ODI: 0, TEST: 0 } }; t.players.push(p); }
        const num = v => { const x = parseInt(v, 10); return isNaN(x) ? undefined : x; };
        const set = (k, v) => { if (v !== undefined && v !== '') p[k] = v; };
        set('num', num(g('number'))); set('age', num(g('age')));
        if (g('role')) p.role = roleMap(g('role'));
        if (g('bat_hand')) p.bat = /^l/i.test(g('bat_hand')) ? 'L' : 'R';
        if (g('bowl_style')) { p.style = styleMap(g('bowl_style')); p.bowlHand = styleHand(p.style); }
        set('ovr', num(g('overall'))); set('batSkill', num(g('batting'))); set('bowlSkill', num(g('bowling'))); set('field', num(g('fielding')));
        const pos = { ...p.pos };
        if (num(g('t20_pos')) !== undefined) pos.T20 = num(g('t20_pos'));
        if (num(g('odi_pos')) !== undefined) pos.ODI = num(g('odi_pos'));
        if (num(g('test_pos')) !== undefined) pos.TEST = num(g('test_pos'));
        p.pos = pos;
        n++;
      }
      this.saveTeams();
      return n;
    } catch (e) { console.error(e); return -1; }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try { window.app = new App(); }
  catch (e) { const ld = document.getElementById('loading'); if (ld) ld.textContent = 'Error: ' + e.message; console.error(e); }
});
