// Ball-by-ball game controller: ties match rules, physics, AI, rendering and input together
import * as THREE from 'three';
import { Human, skinFor, numberTexture } from './humans.js';
import * as P from './physics.js';
import * as R from './rules.js';
import * as AI from './ai.js';
import { isSpin, isPace } from './data.js';

const { PITCH, BALL_R } = P;
const BOWL_CAM = { pos: new THREE.Vector3(0, 3.6, -30), look: new THREE.Vector3(0, 0.7, -2.2), fov: 27 };
const SWING_T = 0.13; // time from swipe to bat arriving
const TIMING_MUL = { easy: 1.5, normal: 1.0, hard: 0.82, legend: 0.68 };
const AI_BOWL_ERR = { easy: 0.65, normal: 0.38, hard: 0.22, legend: 0.12 };
const METER_SPEED = { easy: 0.75, normal: 1.0, hard: 1.25, legend: 1.5 };

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx); // renderer, scene, camera, stadium, audio, ui, settings, getTeams, save
    this.humans = new Map();
    this.time = 0;
    this.phase = 'idle';
    this.camPos = BOWL_CAM.pos.clone(); this.camLook = BOWL_CAM.look.clone(); this.camFov = BOWL_CAM.fov;
    this.camMode = 'bowl';
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 12), new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.35 }));
    this.ballMesh.castShadow = true; this.scene.add(this.ballMesh); this.ballMesh.visible = false;
    const shTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(0,0,0,0.55)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: shTex, transparent: true, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2; this.scene.add(this.ballShadow); this.ballShadow.visible = false;
    // trail
    this.trailN = 24; this.trailPts = new Float32Array(this.trailN * 3);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(this.trailPts, 3));
    const tc = new Float32Array(this.trailN * 3); for (let i = 0; i < this.trailN; i++) { const a = 1 - i / this.trailN; tc.set([a, a, a], i * 3); }
    tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.trail.frustumCulled = false; this.scene.add(this.trail); this.trail.visible = false;
    // pitch target marker (bowling) & pitch marker (batting assist)
    this.target = this.makeMarker('#ffd23f', 0.22); this.scene.add(this.target); this.target.visible = false;
    this.pitchMark = this.makeMarker('#ffffff', 0.14); this.scene.add(this.pitchMark); this.pitchMark.visible = false;
    this.zones = this.makeZones(); this.scene.add(this.zones); this.zones.visible = false;
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.umpires = [this.makeUmpire(), this.makeUmpire()];
    this.umpires.forEach(u => this.scene.add(u.root));
    this.fieldPreset = 'Balanced';
    this.deliveryType = 'stock';
    this.aim = { u: 0.15, len: 6 };
    this.speedMul = 1;
  }

  makeMarker(col, r) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.7, r, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16, }) /* must out-pull the pitch polygonOffset in scene.js */);
    ring.rotation.x = -Math.PI / 2; g.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(r * 0.25, 16), ring.material); dot.rotation.x = -Math.PI / 2; g.add(dot);
    g.position.y = 0.02; g.renderOrder = 5;
    return g;
  }
  makeZones() {
    const g = new THREE.Group();
    const zones = [[0, 1.6, '#e8590c'], [1.6, 4, '#2f9e44'], [4, 7.5, '#1971c2'], [7.5, 12, '#c2255c']];
    for (const [a, b, c] of zones) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.05, b - a), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16 }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.015, -(a + b) / 2); g.add(m);
    }
    return g;
  }
  makeUmpire() {
    const h = new Human({ shirt: '#f2f2f0', pants: '#1d1f24', skin: '#c68642', head: 'hat', capColor: '#f2f2f0', trim: '#1d1f24', shoes: '#111', longSleeve: true });
    return h;
  }

  // ---------- setup ----------
  teamOf(pid) { return pid.split('_')[0]; }
  player(pid) { return R.findPlayer(this.getTeams(), pid); }
  kitFor(pid, role) {
    const teams = this.getTeams(); const t = teams[this.teamOf(pid)]; const p = this.player(pid);
    const test = this.m && this.m.format === 'TEST';
    const shirt = test ? '#f4f3ee' : t.kit[0], pants = test ? '#efeee6' : t.kit[2], trim = t.kit[1];
    return { shirt, pants, trim, skin: p.skin || skinFor(p.name, t.id), capColor: t.cap };
  }
  getHuman(pid, role) {
    const key = pid + ':' + role;
    if (this.humans.has(key)) return this.humans.get(key);
    const k = this.kitFor(pid, role); const p = this.player(pid); const t = this.getTeams()[this.teamOf(pid)];
    const test = this.m && this.m.format === 'TEST';
    const numTex = numberTexture(p.num, p.name, '#000', test ? t.cap : (t.kit[1] === '#FFFFFF' || t.kit[1] === '#ffffff' ? '#111' : '#ffffff'));
    const o = { ...k, numberTex: numTex };
    if (role === 'bat') Object.assign(o, { head: 'helmet', pads: true, gloves: true, bat: true });
    else if (role === 'keep') Object.assign(o, { head: 'helmet', pads: true, gloves: true, keeper: true });
    else Object.assign(o, { head: Math.random() < 0.6 || test ? 'cap' : 'bare', hair: p.hair || ['#1b120b', '#3b2416', '#6b4a2b', '#c9a15b', '#111'][(p.num || 0) % 5] });
    const h = new Human(o);
    h.pid = pid; h.role = role;
    this.humans.set(key, h);
    return h;
  }
  clearHumans() {
    for (const h of this.humans.values()) { this.scene.remove(h.root); }
    this.humans.clear();
  }

  // ---------- match control ----------
  startMatch(m) {
    this.m = m; this.practice = null;
    this.clearHumans();
    const teams = this.getTeams();
    this.stadium.setMode(this.settings.time, R.FORMATS[m.format].ball);
    this.stadium.colourCrowd(teams[m.teamIds[0]].kit[0], teams[m.teamIds[1]].kit[0]);
    this.ballMesh.material.color.set(m.format === 'TEST' ? '#a3121e' : '#f6f6f6');
    this.ui.showHUD(true);
    this.nextBall();
  }
  startPractice(cfg) {
    // cfg: { mode:'bat'|'bowl', batter, bowler, format }
    const teams = this.getTeams();
    const fake = R.newMatch({ format: cfg.format || 'T20', overs: 999, teamA: this.teamOf(cfg.batter), teamB: this.teamOf(cfg.bowler), xiA: [cfg.batter, ...teams[this.teamOf(cfg.batter)].players.filter(p => p.id !== cfg.batter).slice(0, 10).map(p => p.id)], xiB: [cfg.bowler, ...teams[this.teamOf(cfg.bowler)].players.filter(p => p.id !== cfg.bowler).slice(0, 10).map(p => p.id)], keeperA: null, keeperB: null, userTeam: cfg.mode === 'bat' ? 0 : 1}, teams);
    const kb = teams[this.teamOf(cfg.bowler)].players.find(p => p.role === 'WK' && fake.xi[1].includes(p.id));
    fake.keeper[1] = kb ? kb.id : fake.xi[1][fake.xi[1].length - 1];
    if (fake.keeper[1] === cfg.bowler) fake.keeper[1] = fake.xi[1][1];
    R.startInnings(fake, 0);
    R.setBowler(fake, cfg.bowler);
    this.m = fake;
    this.practice = { ...cfg, runs: 0, balls: 0, outs: 0, f4: 0, s6: 0, log: [] };
    this.clearHumans();
    this.stadium.setMode(this.settings.time, 'white');
    this.ballMesh.material.color.set('#f6f6f6');
    this.ui.showHUD(true);
    this.nextBall();
  }
  stop() { this.paused = false; this.phase = 'idle'; this.m = null; this.practice = null; this.clearHumans(); this.ballMesh.visible = false; this.ballShadow.visible = false; this.trail.visible = false; this.target.visible = false; this.zones.visible = false; this.ui.hideControls(); }

  userRole() {
    const inn = R.curInn(this.m);
    if (this.m.userTeam === inn.bat) return 'bat';
    if (this.m.userTeam === inn.bowl) return 'bowl';
    return 'none';
  }

  nextBall() {
    const m = this.m; if (!m) return;
    const inn = R.curInn(m);
    this.ui.updateHUD(m, this.practice);
    if (!this.practice) {
      if (m.result) { this.phase = 'idle'; this.ui.matchOver(m); return; }
      if (inn.done) { this.phase = 'idle'; this.handleInningsEnd(); return; }
      if (!inn.curBowler) {
        this.phase = 'idle';
        if (this.userRole() === 'bowl') {
          this.ui.pickBowler(m, (pid) => { R.setBowler(m, pid); this.save(); this.nextBall(); });
        } else {
          R.setBowler(m, R.aiPickBowler(m, this.getTeams()));
          this.ui.overBreak(m, () => this.nextBall());
        }
        return;
      }
    } else if (!inn.curBowler) R.setBowler(m, this.practice.bowler);
    this.setupBall();
  }

  handleInningsEnd() {
    const m = this.m;
    const nx = R.nextInnings(m);
    if (nx === null) { if (m.result) this.ui.matchOver(m); return; }
    if (typeof nx === 'object' && nx.followOnOption) {
      const leader = nx.leader;
      const decide = (enforce) => {
        m.followOn = enforce;
        R.startInnings(m, enforce ? 1 - leader : leader);
        this.clearHumans(); this.save();
        this.ui.inningsBreak(m, () => this.nextBall());
      };
      if (m.userTeam === leader) this.ui.followOn(m, decide);
      else decide(Math.random() < 0.7);
      return;
    }
    R.startInnings(m, nx);
    this.clearHumans(); this.save();
    this.ui.inningsBreak(m, () => this.nextBall());
  }

  // ---------- per ball ----------
  setupBall() {
    const m = this.m, inn = R.curInn(m);
    const teams = this.getTeams();
    this.stadium.resetStumps();
    this.ball = null; this.hit = null; this.field = null; this.runPlan = null; this.shot = null; this.outcome = null;
    this.swipe = null; this.meter = null; this.events = []; this.resolved = false; this.speedMul = 1;
    this.ballMesh.visible = false; this.ballShadow.visible = false; this.trail.visible = false; this.pitchMark.visible = false;
    this.striker = this.player(inn.striker); this.nonStriker = this.player(inn.nonStriker); this.bowler = this.player(inn.curBowler);
    this.s = this.striker.bat === 'L' ? -1 : 1;
    const spin = isSpin(this.bowler.style);
    this.spin = spin;
    // remove all humans then add needed
    for (const h of this.humans.values()) this.scene.remove(h.root);
    // batters
    this.hStriker = this.getHuman(this.striker.id, 'bat');
    this.hNon = this.getHuman(this.nonStriker.id, 'bat');
    this.hStriker.setMirror(this.s < 0); this.hNon.setMirror(this.nonStriker.bat === 'L');
    this.scene.add(this.hStriker.root, this.hNon.root);
    this.hStriker.root.position.set(-this.s * 0.42, 0, -1.02);
    this.hStriker.root.rotation.set(0, this.s > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    // bowler
    this.hBowler = this.getHuman(this.bowler.id, 'field');
    this.hBowler.setMirror(this.bowler.bowlHand === 'L');
    this.scene.add(this.hBowler.root);
    this.releaseSide = (this.bowler.bowlHand === 'L' ? 1 : -1);
    const kmh = { RF: 1, LF: 1, RFM: 0.85, LFM: 0.85, RM: 0.65, LM: 0.65 }[this.bowler.style] || 0.3;
    this.runLen = spin ? 6 : 8 + kmh * 14;
    this.runTime = spin ? 1.5 : 1.2 + kmh * 1.5;
    this.strideTime = 0.55;
    this.hBowler.root.position.set(this.releaseSide * 0.9, 0, -PITCH + P.CREASE - 0.6 - this.runLen);
    this.hBowler.root.rotation.set(0, 0, 0);
    this.hNon.root.position.set(-this.releaseSide * 2.3, 0, -PITCH + 0.6);
    this.hNon.root.rotation.set(0, 0, 0);
    // keeper
    const kid = m.keeper[inn.bowl] || m.xi[inn.bowl].find(p => p !== this.bowler.id);
    this.keeperId = kid;
    this.hKeeper = this.getHuman(kid, 'keep'); this.scene.add(this.hKeeper.root);
    const standUp = spin || (P.planDelivery({ style: this.bowler.style, bowlSkill: this.bowler.bowlSkill, bowlHand: 'R', type: 'stock', target: { u: 0, len: 6 }, offSign: 1 }).kmh < 118);
    this.keeperZ = standUp ? 0.9 : (kmh > 0.9 ? 17 : 14);
    this.hKeeper.root.position.set(0.3 * this.s, 0, this.keeperZ); this.hKeeper.root.rotation.set(0, Math.PI, 0);
    // fielders
    const others = m.xi[inn.bowl].filter(p => p !== this.bowler.id && p !== kid);
    const over = Math.floor(inn.balls / 6);
    const phase = m.overs ? (over >= m.overs * 0.8 ? 'death' : 'mid') : 'mid';
    const pos = P.fieldPositions(m.format === 'TEST' ? 'TEST' : m.format, spin, phase, this.s, this.userRole() === 'bowl' ? this.fieldPreset : (m.format === 'TEST' ? 'Attacking' : 'Balanced'));
    // assign best fielders to catching positions
    const sorted = others.map(id => this.player(id)).sort((a, b) => b.field - a.field);
    this.fielders = [];
    pos.forEach((fp, i) => {
      const p = sorted[i]; if (!p) return;
      const h = this.getHuman(p.id, 'field'); h.setMirror(false);
      this.scene.add(h.root);
      h.root.position.set(fp.x, 0, fp.z);
      h.root.lookAt(0, 0, -3);
      this.fielders.push({ h, p, home: new THREE.Vector3(fp.x, 0, fp.z), name: fp.name });
    });
    // umpires
    this.umpires[0].root.position.set(-this.releaseSide * 1.25, 0, -PITCH - 2.2); this.umpires[0].root.rotation.set(0, 0, 0);
    this.umpires[1].root.position.set(-this.s * 24, 0, -1.2); this.umpires[1].root.lookAt(0, 0, -1.2);
    this.setCam('bowl', true);
    // scoreboard screen
    const tn = teams[m.teamIds[inn.bat]].short;
    if (!this.practice) this.stadium.drawBoard({ l1: tn + (inn.target ? `  need ${Math.max(0, inn.target - inn.runs)}` : ''), l2: `${inn.runs}/${inn.wkts}`, l3: `${R.oversStr(inn.balls)} overs` });
    else this.stadium.drawBoard({ l1: 'NETS', l2: `${this.practice.runs}/${this.practice.outs}`, l3: `${this.practice.balls} balls` });

    this.t0 = this.time;
    const role = this.userRole();
    if (role === 'bowl') {
      this.phase = 'aim';
      this.aim = this.defaultAim(this.deliveryType);
      this.updateTargetMarker();
      this.target.visible = true;
      this.ui.showBowlControls(this);
    } else {
      this.phase = 'wait';
      this.waitUntil = this.time + 0.9;
      this.aiDel = AI.aiDelivery(m, this.bowler, this.striker, inn.balls);
      this.ui.showBatControls(this);
    }
    // length bands: always when bowling, and when batting with the pitch marker setting on
    this.zones.visible = role === 'bowl' || (role === 'bat' && this.settings.pitchMarker !== false);
    this.animateIdle();
  }

  defaultAim(type) {
    const d = { stock: [0.15, this.spin ? 4.6 : 6.2], out: [0.12, 6], in: [0.0, 5.5], cutter: [0.1, 6.5], slower: [0.12, 5.5], bouncer: [0.0, 10.6], yorker: [0.0, 1.1], flight: [0.1, 3.8], quick: [0.0, 5.2], arm: [0.0, 4.5], wrong: [0.1, 4.5] }[type] || [0.15, 6];
    return { u: d[0], len: d[1] };
  }
  updateTargetMarker() { this.target.position.set(this.aim.u * this.s, 0.02, -this.aim.len); }
  setAimFromScreen(nx, ny) {
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.groundPlane, p)) {
      const x = THREE.MathUtils.clamp(p.x, -1.6, 1.6), z = THREE.MathUtils.clamp(p.z, -12.5, -0.1);
      this.aim = { u: x * this.s, len: -z };
      this.updateTargetMarker();
    }
  }
  setDeliveryType(t) { this.deliveryType = t; this.aim = this.defaultAim(t); this.updateTargetMarker(); }

  // user pressed BOWL
  startRunUp() {
    if (this.phase !== 'aim') return;
    this.phase = 'runup'; this.t0 = this.time;
    this.target.visible = true;
    this.meter = { v: 0, dir: 1, locked: null, speed: METER_SPEED[this.settings.diffBowl] || 1 };
    this.ui.showMeter(true);
  }
  lockMeter() {
    if (!this.meter || this.meter.locked != null) return;
    this.meter.locked = this.meter.v;
    this.ui.meterLocked(this.meter.v);
    this.audio.click();
  }

  // ----- input: batting swipe -----
  onSwipe(dx, dy) {
    if (this.userRole() !== 'bat') return;
    if (!['wait', 'runup', 'flight'].includes(this.phase) || this.swipe || this.resolved) return;
    if (this.phase === 'wait') return;
    const len = Math.hypot(dx, dy); if (len < 1) return;
    // world direction follows the screen: right => -x, up (dy<0) => +z (up the screen, behind the batter), down => towards the bowler
    const wx = -dx / len, wz = -dy / len;
    const theta = Math.atan2(wx * this.s, -wz);
    const action = this.ui.shotMode || 'drive';
    this.swipe = { t: this.time - this.tRelease, theta, action, real: this.time };
    // swing animation starts now
    this.batAnim = { start: this.time, dur: action === 'defend' ? 0.5 : 0.42, shot: { theta, action, front: this.ball ? this.ball.front : true, short: this.ball ? this.ball.short : false } };
  }

  // ---------- main update ----------
  update(dt) {
    this.time += dt;
    const m = this.m; if (!m || this.phase === 'idle') { this.stadium.update(this.time, dt); return; }
    const sdt = dt * this.speedMul;
    const t = this.time;
    switch (this.phase) {
      case 'aim': this.animateIdle(); break;
      case 'wait': this.animateIdle(); if (t > this.waitUntil) { this.phase = 'runup'; this.t0 = t; } break;
      case 'runup': this.updateRunUp(); break;
      case 'flight': this.updateFlight(sdt); break;
      case 'live': this.updateLive(sdt); break;
      case 'dead': this.updateDead(sdt); break;
    }
    this.updateMeter(dt);
    this.updateCamera(dt);
    this.stadium.update(t, dt);
  }

  animateIdle() {
    const t = this.time;
    if (this.hStriker) this.hStriker.stance(t);
    if (this.hNon) this.hNon.idle(t);
    if (this.hKeeper) this.hKeeper.keeperCrouch(t, 0.3);
    if (this.hBowler && this.phase !== 'runup') this.hBowler.idle(t);
    for (const f of this.fielders || []) f.h.idle(t + f.home.x);
    this.umpires.forEach(u => u.idle(t));
  }

  updateMeter(dt) {
    const mt = this.meter; if (!mt) return;
    if (mt.locked == null) {
      mt.v += mt.dir * dt * 1.25 * mt.speed;
      if (mt.v > 1) { mt.v = 1; mt.dir = -1; } if (mt.v < 0) { mt.v = 0; mt.dir = 1; }
    }
    this.ui.updateMeter(mt.locked != null ? mt.locked : mt.v);
  }

  updateRunUp() {
    const t = this.time - this.t0;
    const hb = this.hBowler;
    const startZ = -PITCH + P.CREASE - 0.6 - this.runLen;
    const endZ = -PITCH + P.CREASE - 0.6;
    if (t < this.runTime) {
      const f = t / this.runTime;
      const e = f * (0.6 + 0.4 * f); // accelerate
      hb.root.position.z = startZ + (endZ - startZ) * e;
      hb.root.position.x = this.releaseSide * (0.9 - 0.35 * f);
      hb.run(t * (this.spin ? 9 : 12), this.spin ? 0.6 : 1);
      // fielders walk in during last part
      for (const fl of this.fielders) { fl.h.crouch(this.time, 0.25 + 0.2 * f); const dir = fl.home.clone().negate().setY(0).normalize(); fl.h.root.position.copy(fl.home).addScaledVector(dir, f * 1.5); }
      this.hKeeper.keeperCrouch(this.time, 0.6 + 0.4 * f);
      this.hStriker.stance(this.time);
      this.hNon.idle(this.time);
    } else {
      const p = (t - this.runTime) / this.strideTime;
      hb.root.position.z = endZ + Math.min(p, 1) * 0.6;
      hb.bowlAction(Math.min(p, 1), this.spin);
      if (p >= 0.62 && !this.ball) this.release();
      // non-striker backs up
      this.hNon.root.position.z = -PITCH + 0.4 + Math.max(0, p - 0.4) * 1.2;
    }
    if (this.ball) this.phase = 'flight';
  }

  release() {
    const m = this.m, inn = R.curInn(m);
    const role = this.userRole();
    let type, target, err, pace = 1, noBall = false;
    if (role === 'bowl') {
      type = this.deliveryType; target = { ...this.aim };
      const v = this.meter && this.meter.locked != null ? this.meter.locked : (0.5 + (Math.random() < 0.5 ? -1 : 1) * 0.45);
      err = Math.min(1, Math.abs(v - 0.5) / 0.45);
      if (this.meter && this.meter.locked == null) err = Math.max(err, 0.8);
      noBall = v > 0.955;
      pace = 1 - err * 0.25;
      this.ui.showMeter(false);
      this.meter = null;
      this.ui.timing(err < 0.12 ? 'PERFECT DELIVERY' : err < 0.4 ? 'GOOD' : err < 0.75 ? 'LOOSE' : 'WAYWARD', err < 0.12 ? 'good' : err < 0.4 ? 'ok' : 'bad');
    } else {
      type = this.aiDel.type; target = this.aiDel.target;
      err = AI_BOWL_ERR[this.diffBat()] ?? 0.35;
      if (role !== 'bat') err = 0.35;
      noBall = Math.random() < 0.006;
    }
    const ballAge = inn.balls / 6 % 80;
    const pl = P.planDelivery({ style: this.bowler.style, bowlSkill: this.bowler.bowlSkill, bowlHand: this.bowler.bowlHand, type, target, offSign: this.s, err, pace, ballAge });
    // release from bowler's hand position
    const hp = new THREE.Vector3(); this.hBowler.root.updateMatrixWorld(true); this.hBowler.handWorld('R', hp);
    const sim = P.simulateDelivery(pl, this.keeperZ);
    this.ball = { pl, sim, noBall, t: 0, front: pl.len < 4.8 || pl.fullToss, short: !pl.fullToss && pl.len > 7.8 };
    this.tRelease = this.time;
    this.ballMesh.visible = true; this.ballShadow.visible = true;
    this.trailIdx = 0; this.trailPts.fill(0); this.trail.visible = this.settings.trail !== false;
    if (this.batAnim && this.batAnim.shot) { this.batAnim.shot.front = this.ball.front; this.batAnim.shot.short = this.ball.short; }
    this.ui.speed(pl.kmh, pl.spin ? null : null);
    // AI batter decides
    if (role !== 'bat') {
      const c = sim.cross.contact;
      if (c) {
        const info = this.ballInfo(pl, sim);
        this.aiShot = AI.aiShot(m, this.striker, this.bowler, info, this.settings.diffBowl);
      } else this.aiShot = { action: 'leave' };
    } else this.aiShot = null;
    // pitch marker assist for user batting
    if (role === 'bat' && this.settings.pitchMarker && sim.bounce) {
      this.pitchMark.position.set(sim.bounce.x, 0.02, sim.bounce.z); this.pitchMark.visible = true;
      this.pitchMarkUntil = this.time + sim.bounce.t + 0.25;
    }
    if (role === 'bowl') this.target.visible = true;
  }

  ballInfo(pl, sim) {
    const c = sim.cross.contact; const s = this.s;
    const swingDisp = 0.5 * pl.swing * Math.pow((sim.bounce ? sim.bounce.t : 0.5), 2) * s;
    const st = sim.cross.stumps;
    return { u: c.x * s, y: c.y, len: pl.len, fullToss: pl.fullToss || !c.bounced, kmh: pl.kmh, spin: pl.spin, swingDisp, turnDisp: pl.dev * 0.12, uStumps: st ? st.x * s : 1 };
  }

  ballPosAt(t) { return P.sampleAt(this.ball.sim.samples, t); }

  updateFlight(dt) {
    const b = this.ball; b.t += dt;
    const sim = b.sim, c = sim.cross.contact;
    const p = this.ballPosAt(b.t);
    this.placeBall(p);
    // bowler follow through
    const ft = (this.time - this.t0 - this.runTime) / this.strideTime;
    if (ft < 1) this.hBowler.bowlAction(Math.min(1, ft), this.spin);
    else {
      // follow through, peeling away to the side so the view of the batter is clear
      const k = Math.min(1, (ft - 1) * 0.5);
      this.hBowler.run(this.time * 10, 0.7 * (1 - k));
      this.hBowler.root.position.z += dt * 4.5 * (1 - k);
      this.hBowler.root.position.x += dt * this.releaseSide * 3.2 * (1 - k * 0.5);
      this.hBowler.root.rotation.y = this.releaseSide * 0.6 * k;
    }
    if (this.pitchMark.visible && this.time > this.pitchMarkUntil) this.pitchMark.visible = false;
    if (sim.bounce && !b.bounced && b.t >= sim.bounce.t) { b.bounced = true; this.audio.bounce(); if (this.userRole() === 'bowl') this.target.visible = false; }
    // fielders crouch
    for (const fl of this.fielders) fl.h.crouch(this.time, 0.45);
    this.hKeeper.keeperCrouch(this.time, 1);
    // batter
    const role = this.userRole();
    if (role !== 'bat' && this.aiShot && !this.batAnim && c) {
      const a = this.aiShot;
      if (a.action === 'leave') {
        if (b.t > c.t - 0.3) this.batAnim = { start: this.time, dur: 0.6, leave: true };
      } else if (b.t >= c.t - SWING_T) {
        this.batAnim = { start: this.time, dur: a.action === 'defend' ? 0.5 : 0.42, shot: { theta: a.theta, action: a.action, front: b.front, short: b.short } };
      }
    }
    this.animateBatter();
    // contact resolution
    if (!this.resolved && c) {
      let tryAt = null;
      if (role === 'bat') {
        if (this.swipe) {
          const tHit = this.swipe.t + SWING_T;
          const w = this.timingWindow();
          const dtE = tHit - c.t;
          if (dtE < -4.5 * w) { if (b.t >= c.t) { this.resolved = true; this.swipeResult = 'EARLY'; this.ui.timing('TOO EARLY', 'bad'); } }
          else if (b.t >= Math.max(c.t, tHit)) tryAt = { dtE, w };
        } else if (b.t > c.t + 0.22) { this.resolved = true; }
      } else if (this.aiShot && this.aiShot.action !== 'leave' && b.t >= c.t) {
        tryAt = { ai: true };
      } else if (b.t >= c.t + 0.05) this.resolved = true;
      if (tryAt) this.resolveContact(tryAt, p);
    }
    if (this.phase !== 'flight') return;
    // missed ball: pad / stumps / keeper
    if (this.resolved && !this.missDone) {
      const pad = sim.cross.pad, st = sim.cross.stumps;
      if (!b.missA) b.missA = P.missAnalysis(sim, b.pl, this.m.format);
      const ma = b.missA;
      if (ma.hitsPad && pad && b.t >= pad.t) { this.missDone = true; this.audio.pad(); this.deadAfterMiss(ma, pad); return; }
      if (ma.bowled && st && b.t >= st.t) { this.missDone = true; this.deadAfterMiss(ma, st); return; }
    }
    if (b.t >= sim.duration) {
      if (!this.resolved) this.resolved = true;
      if (!b.missA) b.missA = P.missAnalysis(sim, b.pl, this.m.format);
      this.audio.gloves();
      this.deadAfterMiss(b.missA, null);
    }
  }

  diffBat() { return this.settings[this.spin ? 'diffBatSpin' : 'diffBatPace'] || 'normal'; }
  timingWindow() {
    const skill = this.striker.batSkill / 100;
    const thr = this.ball ? AI.threatOf(this.ballInfo(this.ball.pl, this.ball.sim)) : 0.5;
    // slower balls (spin) give more time to judge, so the window scales with flight time (~0.5s for a quick)
    const c = this.ball && this.ball.sim.cross.contact;
    const flight = c ? P.clamp(c.t / 0.55, 0.85, 1.6) : 1;
    return (0.022 + 0.03 * skill) * flight * (TIMING_MUL[this.diffBat()] || 1) * (1.15 - thr * 0.3) * (this.settings.batAssist ? 1.25 : 1);
  }

  resolveContact(tr, p) {
    this.resolved = true;
    const b = this.ball, sim = b.sim, c = sim.cross.contact, s = this.s;
    let q, action, theta, late;
    const uC = c.x * s, yC = c.y;
    if (tr.ai) {
      ({ q, action, theta, late } = this.aiShot);
    } else {
      action = this.swipe.action; theta = this.swipe.theta;
      const a = Math.abs(tr.dtE), w = tr.w;
      let tf; let lab;
      if (a < w) { tf = 1; lab = ['PERFECT', 'good']; }
      else if (a < 2.5 * w) { tf = 0.78 - (a - w) / (1.5 * w) * 0.2; lab = [tr.dtE < 0 ? 'SLIGHTLY EARLY' : 'SLIGHTLY LATE', 'ok']; }
      else if (a < 4.5 * w) { tf = 0.35 - (a - 2.5 * w) / (2 * w) * 0.2; lab = [tr.dtE < 0 ? 'EARLY' : 'LATE', 'bad']; }
      else { tf = 0; lab = [tr.dtE < 0 ? 'TOO EARLY' : 'TOO LATE', 'bad']; }
      const suit = P.suitability(theta, uC, yC, action);
      const thr = AI.threatOf(this.ballInfo(b.pl, sim));
      q = tf * (0.5 + 0.5 * suit) + (this.striker.batSkill - 75) / 220 - (thr - 0.5) * 0.12 + P.gauss() * 0.04;
      if (tf >= 0.75 && suit > 0.7) q = Math.max(q, 0.55);
      if (action === 'loft') q -= Math.max(0, thr - 0.45) * 0.3;
      if (tf === 0) q = 0;
      if (action === 'defend' && tf > 0.2) q = Math.max(q, 0.35);
      q = P.clamp(q, 0, 1);
      late = tr.dtE > 0;
      this.ui.timing(lab[0], lab[1]);
      if (suit < 0.5 && tf > 0.3) this.ui.timing(lab[0] + ' · POOR SHOT CHOICE', 'bad');
    }
    // reach check
    if (Math.abs(uC - 0.05) > 1.05 && action !== 'leave') q = Math.min(q, 0.1);
    const res = P.resolveContact({ action, theta, q, late, ballV: { x: c.vx, y: c.vy, z: c.vz }, offSign: s, batSkill: this.striker.batSkill });
    if (res.kind === 'miss') { return; }
    if (res.kind === 'edge' && res.inside) {
      // inside edge onto pad / stumps
      this.audio.edge();
      const st = sim.cross.stumps;
      if (st && Math.abs(st.x) < P.STUMP_HALF + 0.05 && Math.random() < 0.45) {
        b.missA = { bowled: true, playedOn: true };
        this.startHit(res, p, 0.4);
        this.playedOn = true;
        return;
      }
    }
    this.startHit(res, p, q);
  }

  startHit(res, p, q) {
    const b = this.ball;
    this.phase = 'live';
    this.hitT = 0; this.hitQ = q; this.zones.visible = false;
    if (res.kind === 'hit') this.audio.bat(q); else this.audio.edge();
    const p0 = { x: p.x, y: Math.max(p.y, 0.15), z: p.z };
    this.hit = P.simulateHit(p0, res.v);
    this.hit.kind = res.kind;
    // fielders (include keeper and bowler)
    const fl = this.fielders.map((f, i) => ({ idx: i, x: f.h.root.position.x, z: f.h.root.position.z, speed: 6.4 + (f.p.field - 70) * 0.04 - Math.max(0, f.p.age - 33) * 0.05, fld: f.p.field, keeper: false, ref: f }));
    fl.push({ idx: 'k', x: this.hKeeper.root.position.x, z: this.hKeeper.root.position.z, speed: 6, fld: this.player(this.keeperId).field, keeper: true, ref: { h: this.hKeeper, p: this.player(this.keeperId), home: this.hKeeper.root.position.clone() } });
    fl.push({ idx: 'b', x: this.hBowler.root.position.x, z: this.hBowler.root.position.z, speed: 5.5, fld: this.bowler.field, keeper: false, ref: { h: this.hBowler, p: this.bowler, home: this.hBowler.root.position.clone() } });
    for (const f of fl) f.start = new THREE.Vector3(f.x, 0, f.z);
    if (this.playedOn) {
      this.field = { kind: 'playedOn', t: 0.25 };
    } else {
      this.field = P.planFielding(this.hit, fl);
    }
    this.fieldList = fl;
    // runs
    const A = AI.aggression(this.m, this.striker);
    const speed = P.clamp((32 - this.striker.age) * 0.03 + (this.striker.role === 'BOWL' ? -0.05 : 0.05), -0.3, 0.3);
    if (this.field.kind === 'stop' || this.field.kind === 'drop') this.runPlan = P.planRuns(this.field, { speed, aggression: A });
    else this.runPlan = null;
    if (this.field.kind === 'catch') { this.events.push({ t: this.field.t, fn: () => { this.audio.gloves(); this.audio.roar(1.2); this.stadium.cheer = 1; } }); }
    this.camMode = (Math.hypot(res.v.x, res.v.z) > 9 || res.v.y > 6) ? 'follow' : 'bowl';
    // batter run animation timing
    this.liveEnd = null;
    this.ui.hideBatHint();
  }

  // position ball + shadow + trail
  placeBall(p) {
    this.ballMesh.position.set(p.x, p.y, p.z);
    this.ballShadow.position.set(p.x, 0.012, p.z);
    const s = 1 + p.y * 0.6; this.ballShadow.scale.set(s, s, 1); this.ballShadow.material.opacity = Math.max(0.15, 1 - p.y * 0.12);
    // trail shift
    this.trailPts.copyWithin(3, 0, (this.trailN - 1) * 3);
    this.trailPts[0] = p.x; this.trailPts[1] = p.y; this.trailPts[2] = p.z;
    if (this.trailIdx++ < 2) for (let i = 1; i < this.trailN; i++) { this.trailPts[i * 3] = p.x; this.trailPts[i * 3 + 1] = p.y; this.trailPts[i * 3 + 2] = p.z; }
    this.trail.geometry.attributes.position.needsUpdate = true;
  }

  animateBatter() {
    const ba = this.batAnim, h = this.hStriker;
    if (!ba) { h.stance(this.time); return; }
    const p = Math.min(1, (this.time - ba.start) / ba.dur);
    if (ba.leave) {
      // shoulder arms: lift bat high
      h.stance(this.time);
      h.gripAt(new THREE.Vector3(-0.15, 1.45 * Math.min(1, p * 2.5) + 0.8 * (1 - Math.min(1, p * 2.5)), 0.2), new THREE.Vector3(-0.6, 0.6, -0.3));
      return;
    }
    h.swing(p, ba.shot, this.time);
  }

  updateLive(dt) {
    this.hitT += dt;
    const T = this.hitT, f = this.field, H = this.hit;
    // events
    for (const e of this.events) if (!e.done && T >= e.t) { e.done = true; e.fn(); }
    this.animateBatter();
    this.hBowler.idle(this.time);
    // ball position
    let bp;
    if (f.kind === 'catch' && T >= f.t) {
      const hh = f.f.ref.h; hh.root.updateMatrixWorld(true);
      bp = hh.handWorld('R', new THREE.Vector3());
    } else if (f.kind === 'playedOn') {
      bp = P.sampleAt(H.samples, Math.min(T, 0.3));
      if (T >= 0.3 && !this.stumpsBroken) { this.stumpsBroken = true; this.stadium.breakStumps(0, 0, 10); this.audio.stumps(); }
    } else if ((f.kind === 'stop' || f.kind === 'drop') && T >= f.t) {
      bp = this.throwPos(T);
    } else {
      bp = P.sampleAt(H.samples, T);
      if (!this.firstBounceDone && H.firstBounce && T >= H.firstBounce.t) { this.firstBounceDone = true; }
    }
    this.placeBall(bp);
    // fielders movement
    this.animateFielders(T);
    // runners
    this.animateRunners(T);
    // completion
    if (this.liveEnd == null) {
      let end = null;
      if (f.kind === 'boundary') {
        if (T >= f.t) { end = f.t + 1.6; this.onBoundary(f.runs); }
      } else if (f.kind === 'catch') { if (T >= f.t) end = f.t + 2.2; }
      else if (f.kind === 'playedOn') { if (T >= 0.35) end = 2.4; }
      else {
        const rp = this.runPlan;
        const tThrowEnd = this.throwArrive();
        const tRuns = rp.runOut ? rp.tOut : (rp.runs ? rp.cum[rp.runs] : 0);
        if (T >= Math.max(tThrowEnd, tRuns)) end = Math.max(tThrowEnd, tRuns) + (rp.runOut ? 1.8 : 0.9);
        if (rp.runOut && T >= rp.tOut && !this.stumpsBroken) { this.stumpsBroken = true; this.stadium.breakStumps(rp.endIdx, 0.05, 6); this.audio.stumps(); this.audio.roar(1); this.stadium.cheer = 1; }
      }
      if (end != null) this.liveEnd = end;
    } else if (T >= this.liveEnd) {
      this.finishBall();
    }
  }

  throwStart() { return this.field.t + (this.field.f && this.field.f.keeper ? 0.15 : 0.35); }
  throwArrive() {
    const f = this.field, rp = this.runPlan;
    const end = rp.runOut ? rp.endIdx : rp.endIdx;
    const ez = end === 0 ? 0 : -PITCH;
    const d = Math.hypot(f.p.x, f.p.z - ez);
    return this.throwStart() + (d < 3 ? 0.4 : d / rp.throwSpeed + 0.25);
  }
  throwPos(T) {
    const f = this.field, rp = this.runPlan;
    const ts = this.throwStart(), ta = this.throwArrive();
    const ez = rp.endIdx === 0 ? 0 : -PITCH;
    const hh = f.f.ref.h;
    if (T < ts) { hh.root.updateMatrixWorld(true); return hh.handWorld('R', new THREE.Vector3()); }
    const k = Math.min(1, (T - ts) / Math.max(0.05, ta - ts));
    const from = new THREE.Vector3(f.p.x, 1.6, f.p.z), to = new THREE.Vector3(0.15, 0.8, ez - 0.4 * (ez === 0 ? -1 : 1));
    const pos = from.clone().lerp(to, k);
    pos.y += Math.sin(k * Math.PI) * Math.min(8, from.distanceTo(to) * 0.08);
    if (k >= 1 && !this.throwCaught) { this.throwCaught = true; this.audio.gloves(); }
    return pos;
  }

  animateFielders(T) {
    const f = this.field;
    for (const fl of this.fieldList) {
      const h = fl.ref.h;
      const chaser = f.f === fl || (f.kind === 'boundary' && f.chaser === fl);
      if (!chaser) {
        // watch the ball, small movement
        if (fl.keeper) {
          // keeper goes to stumps for throw
          if (this.runPlan && (this.runPlan.endIdx === 0) && T > this.field.t) { this.moveTo(h, fl.start, new THREE.Vector3(0.3 * this.s, 0, 0.8), T - this.field.t, 5); h.keeperCrouch(this.time, 0.4); }
          else h.keeperCrouch(this.time, 0.5);
        } else if (fl.idx === 'b') {
          if (this.runPlan && this.runPlan.endIdx === 1 && T > this.field.t) this.moveTo(h, fl.start, new THREE.Vector3(0.4, 0, -PITCH - 0.6), T - this.field.t, 5);
          h.idle(this.time);
        } else {
          h.crouch(this.time, Math.max(0, 0.45 - T * 0.4));
        }
        const bp = this.ballMesh.position; h.root.lookAt(bp.x, 0, bp.z);
        continue;
      }
      // chaser
      let target, tArr;
      if (f.kind === 'boundary') {
        const e = this.hit.samples[this.hit.samples.length - 1];
        target = new THREE.Vector3(e.x * 0.97, 0, e.z * 0.97 + P.FIELD_CZ * 0.03); tArr = f.t + 0.8;
      } else { target = new THREE.Vector3(f.p.x, 0, f.p.z); tArr = f.t; }
      const react = fl.keeper ? 0.12 : 0.28;
      const start = fl.start;
      const total = Math.max(0.01, tArr - react);
      const k = P.clamp((T - react) / total, 0, 1);
      // offset so hands meet ball: stand ~0.4m from ball line
      const pos = start.clone().lerp(target, k);
      h.root.position.copy(pos);
      const moving = k > 0 && k < 1 && start.distanceTo(target) > 0.6;
      if (T < f.t || f.kind === 'boundary') {
        if (moving) { h.root.lookAt(target.x, 0, target.z); h.run(this.time * 11, 1); }
        else { const bp = this.ballMesh.position; h.root.lookAt(bp.x, 0, bp.z); h.crouch(this.time, 0.5); }
        if (f.kind === 'catch' && T > f.t - 0.35) h.catchPose(1);
        if (f.dive && T > f.t - 0.3) h.dive(Math.min(1, (T - f.t + 0.3) / 0.3));
      } else if (f.kind === 'catch') {
        h.celebrate(this.time);
      } else if (f.kind === 'stop' || f.kind === 'drop') {
        const ts = this.throwStart();
        const ez = this.runPlan.endIdx === 0 ? 0 : -PITCH;
        h.root.lookAt(0, 0, ez);
        if (T < ts) h.crouch(this.time, 0.8);
        else h.throwAction(Math.min(1, (T - ts + 0.25) / 0.6));
      }
    }
  }
  moveTo(h, from, to, t, speed) {
    const d = from.distanceTo(to); const k = Math.min(1, t * speed / Math.max(d, 0.01));
    h.root.position.copy(from).lerp(to, k);
  }

  animateRunners(T) {
    const rp = this.runPlan;
    const sAt = -1.02, nAt = -PITCH + 0.4;
    const ends = [-1.1, -PITCH + 1.1];
    if (!rp || (rp.runs === 0 && !rp.runOut)) {
      if (this.field.kind === 'boundary' || this.field.kind === 'catch' || this.field.kind === 'playedOn') {
        if (T > 0.6) { this.hNon.idle(this.time); }
        if (this.field.kind === 'playedOn' || (this.field.kind === 'catch' && T > this.field.t)) { /* striker dejected */ if (T > 0.6) this.hStriker.dejected(this.time); }
      } else this.hNon.idle(this.time);
      return;
    }
    const nRuns = rp.runOut ? rp.runs + 1 : rp.runs;
    const startT = 0.25;
    const runner = (h, startEnd, xOff, isStriker) => {
      // run k goes from end (startEnd + k-1)%2 to (startEnd+k)%2
      const tt = T - startT;
      if (tt < 0) return false;
      let k = 0;
      while (k < nRuns && tt > rp.cum[k + 1] - startT * 0) k++;
      if (k >= nRuns) {
        const endIdx = (startEnd + nRuns) % 2;
        const outEnd = rp.runOut;
        h.root.position.set(xOff, 0, ends[endIdx]);
        if (outEnd && isStriker === this.runOutIsStriker()) { h.root.position.z = ends[endIdx] + (endIdx === 0 ? -1.4 : 1.4); h.dejected(this.time); }
        else h.idle(this.time);
        return true;
      }
      const a = (startEnd + k) % 2, b = (startEnd + k + 1) % 2;
      const seg0 = rp.cum[k], seg1 = rp.cum[k + 1];
      const f = P.clamp((tt - seg0) / (seg1 - seg0), 0, 1);
      h.root.position.set(xOff, 0, ends[a] + (ends[b] - ends[a]) * f);
      h.root.rotation.set(0, b === 1 ? Math.PI : 0, 0);
      h.run(this.time * 12, 1);
      return true;
    };
    const sm = this.hStriker.root.scale.x, nm = this.hNon.root.scale.x;
    if (!runner(this.hStriker, 0, -0.9 * this.s, true)) this.animateBatter();
    runner(this.hNon, 1, 0.9 * this.s, false);
    this.hStriker.root.scale.x = sm; this.hNon.root.scale.x = nm;
  }
  runOutIsStriker() {
    const rp = this.runPlan; const k = rp.runs + 1; // failed run number
    const strikerTo = k % 2 === 1 ? 1 : 0;
    return rp.endIdx === strikerTo;
  }

  onBoundary(runs) {
    if (this.boundaryDone) return; this.boundaryDone = true;
    this.audio.roar(runs === 6 ? 1.6 : 1.2, 3); this.stadium.cheer = 1;
    this.ui.banner(runs === 6 ? 'SIX!' : 'FOUR!', runs === 6 ? 'six' : 'four');
    this.stadium.drawBoard({ big: runs === 6 ? 'SIX' : 'FOUR', col: runs === 6 ? '#ff3d7f' : '#3dd6ff' });
  }

  deadAfterMiss(ma, at) {
    // decide outcome for a missed / left ball
    const b = this.ball;
    const o = { runs: 0, extra: null, boundary: 0, wicket: null };
    let banner = null, kind = null;
    if (ma.bowled) {
      this.stadium.breakStumps(0, at ? at.x : 0, 30); this.audio.stumps(); this.audio.roar(1.3); this.stadium.cheer = 1;
      o.wicket = { type: 'bowled', who: 'striker' }; banner = 'BOWLED!'; kind = 'out';
    } else if (ma.hitsPad) {
      this.audio.appeal();
      if (ma.lbw) { o.wicket = { type: 'lbw', who: 'striker' }; banner = 'OUT! LBW'; kind = 'out'; this.audio.roar(1.1); this.stadium.cheer = 0.8; }
      else { banner = ma.lbwClose ? 'NOT OUT · UMPIRE\'S CALL' : 'NOT OUT'; kind = 'info'; }
    } else if (this.spin && this.keeperZ < 2 && this.aiShotAttack() && Math.random() < 0.12) {
      o.wicket = { type: 'stumped', who: 'striker', fielder: this.keeperId }; banner = 'STUMPED!'; kind = 'out';
      this.stadium.breakStumps(0, 0, 3); this.audio.stumps();
    } else if (ma.wide) { o.extra = { type: 'wd', runs: 1 }; banner = 'WIDE'; kind = 'info'; this.signal = 'wd'; }
    if (b.noBall) {
      o.extra = { type: 'nb', runs: 1 }; banner = 'NO BALL' + (this.m.format !== 'TEST' ? ' · FREE HIT' : ''); kind = 'info'; this.signal = 'nb';
    }
    if (o.wicket && this.ui) this.ui.banner(banner, 'out');
    else if (banner) this.ui.banner(banner, kind);
    this.outcome = o;
    this.phase = 'dead'; this.deadT = 0; this.deadDur = o.wicket ? 2.6 : 1.4; this.zones.visible = false;
    this.camMode = 'bowl';
  }
  aiShotAttack() {
    if (this.userRole() === 'bat') return this.swipe && this.swipe.action !== 'defend';
    return this.aiShot && (this.aiShot.action === 'loft' || this.aiShot.action === 'drive');
  }

  finishBall() {
    const f = this.field; const b = this.ball;
    const o = { runs: 0, extra: null, boundary: 0, wicket: null };
    let banner = null, kind = 'info';
    if (f.kind === 'boundary') { o.runs = f.runs; o.boundary = f.runs; }
    else if (f.kind === 'catch') {
      const fid = f.f.ref.p.id;
      o.wicket = { type: 'caught', who: 'striker', fielder: fid };
      banner = 'CAUGHT! ' + this.short(f.f.ref.p.name); kind = 'out';
    } else if (f.kind === 'playedOn') { o.wicket = { type: 'bowled', who: 'striker' }; banner = 'PLAYED ON!'; kind = 'out'; this.audio.roar(1.1); }
    else {
      const rp = this.runPlan;
      o.runs = rp.runs;
      if (rp.runOut) {
        const fid = f.f.ref.p.id;
        o.wicket = { type: 'runout', who: this.runOutIsStriker() ? 'striker' : 'nonstriker', fielder: fid };
        banner = 'RUN OUT!'; kind = 'out';
      } else if (f.kind === 'drop') { banner = 'DROPPED!'; kind = 'info'; this.audio.groan(); }
      else if (rp.runs > 0) { banner = rp.runs + (rp.runs === 1 ? ' RUN' : ' RUNS'); kind = 'runs'; }
    }
    if (b.noBall) { o.extra = { type: 'nb', runs: 1 }; banner = (banner ? banner + ' · ' : '') + 'NO BALL'; this.signal = 'nb'; }
    if (banner && !this.boundaryDone) this.ui.banner(banner, kind);
    this.outcome = o;
    this.phase = 'dead'; this.deadT = 0; this.deadDur = 0.5;
  }

  updateDead(dt) {
    this.deadT += dt;
    if (this.signal) this.umpires[0].umpireSignal(this.signal, this.time);
    else if (this.outcome && this.outcome.wicket && this.outcome.wicket.type !== 'runout') { if (this.deadT > 0.6) this.umpires[0].umpireOut(this.time); }
    else if (this.outcome && this.outcome.boundary) this.umpires[0].umpireSignal(this.outcome.boundary, this.time);
    if (this.outcome && this.outcome.wicket) {
      this.hStriker.dejected(this.time);
      this.hBowler.celebrate(this.time);
    }
    if (this.deadT >= this.deadDur) this.commitBall();
  }

  commitBall() {
    if (this.phase !== 'dead') return;
    this.phase = 'idle';
    this.signal = null; this.boundaryDone = false; this.stumpsBroken = false; this.throwCaught = false; this.playedOn = false; this.missDone = false; this.firstBounceDone = false;
    this.batAnim = null; this.swipe = null;
    const o = this.outcome;
    if (this.practice) {
      const pr = this.practice;
      if (!(o.extra && o.extra.type === 'wd')) pr.balls++;
      pr.runs += o.runs; if (o.wicket) pr.outs++; if (o.boundary === 4) pr.f4++; if (o.boundary === 6) pr.s6++;
      pr.log.push(o.wicket ? 'W' : o.extra ? o.extra.type : String(o.runs)); if (pr.log.length > 12) pr.log.shift();
      setTimeout(() => this.nextBall(), 700);
      return;
    }
    const ev = R.applyBall(this.m, o);
    this.save();
    this.ui.updateHUD(this.m);
    if (o.wicket) this.ui.wicketCard(this.m, o);
    const go = () => this.nextBall();
    if (ev.matchDone || ev.inningsDone) setTimeout(go, 1200);
    else setTimeout(go, o.wicket ? 1300 : 600);
  }

  short(n) { const p = n.split(' '); return p[p.length - 1]; }

  // tap to skip
  skip() {
    if (this.phase === 'live' && this.hitT > 0.6) this.speedMul = 4;
    else if (this.phase === 'dead') this.deadT = this.deadDur;
  }

  // ---------- quick sim ----------
  simulate(mode) {
    // mode: 'over' | 'innings' | 'match'
    const m = this.m; if (!m || this.practice) return;
    AI.simulateMatch(m, this.getTeams(), mode);
    this.save();
    this.clearHumans();
    this.nextBall();
  }

  // ---------- camera ----------
  setCam(mode, snap) {
    this.camMode = mode;
    if (snap) { this.camPos.copy(BOWL_CAM.pos); this.camLook.copy(BOWL_CAM.look); this.camFov = BOWL_CAM.fov; }
  }
  updateCamera(dt) {
    let tp, tl, fov;
    const cam = this.settings.camera || 'broadcast';
    const base = cam === 'close' ? { pos: new THREE.Vector3(0, 2.4, -26), look: new THREE.Vector3(0, 0.8, -2), fov: 30 } : BOWL_CAM;
    if (this.camMode === 'follow' && (this.phase === 'live' || this.phase === 'dead')) {
      const b = this.ballMesh.position;
      const d = Math.hypot(b.x, b.z);
      tp = new THREE.Vector3(b.x * 0.35, 14 + d * 0.32, -26 + b.z * 0.3 - d * 0.1);
      tl = new THREE.Vector3(b.x, Math.max(0, b.y * 0.5), b.z);
      fov = 42;
      const k = 1 - Math.exp(-dt * 2.5);
      this.camPos.lerp(tp, k); this.camLook.lerp(tl, 1 - Math.exp(-dt * 6)); this.camFov += (fov - this.camFov) * k;
    } else {
      tp = base.pos; tl = base.look; fov = base.fov;
      const k = 1 - Math.exp(-dt * 3);
      this.camPos.lerp(tp, k); this.camLook.lerp(tl, k); this.camFov += (fov - this.camFov) * k;
    }
    // portrait: widen vertical fov a little on very tall screens
    const aspect = this.camera.aspect;
    const adj = aspect < 0.6 ? 1 + (0.6 - aspect) * 0.9 : 1;
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
    const f = this.camFov * adj;
    if (Math.abs(this.camera.fov - f) > 0.01) { this.camera.fov = f; this.camera.updateProjectionMatrix(); }
  }
}
