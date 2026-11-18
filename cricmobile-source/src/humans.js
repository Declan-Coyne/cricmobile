// Procedural low-poly cricketers with simple IK-driven animation
import * as THREE from 'three';

const geoCache = {};
function geo(key, make) { return geoCache[key] || (geoCache[key] = make()); }
const matCache = {};
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!matCache[k]) matCache[k] = new THREE.MeshStandardMaterial({ color, roughness: opts.r ?? 0.75, metalness: opts.m ?? 0, ...(opts.e ? { emissive: opts.e } : {}) });
  return matCache[k];
}
const SKINS = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#a8754f', '#6b4226', '#d9a37e', '#4a2f1d'];
export function skinFor(name, teamId) {
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const bias = { AUS: [0, 0, 6, 1, 2], ENG: [0, 0, 6, 1, 3], NZ: [0, 0, 6, 1, 2], IRE: [0, 0, 0, 6], IND: [2, 4, 3, 1, 6], PAK: [1, 2, 4, 6, 6], SL: [3, 4, 2, 5], BAN: [2, 4, 3, 5], AFG: [6, 1, 2, 4], WI: [5, 7, 3, 5, 7], SA: [0, 5, 7, 2, 6, 3], ZIM: [5, 7, 0, 5, 7] }[teamId] || [0, 1, 2, 3, 4, 5];
  return SKINS[bias[h % bias.length]];
}

function capsule(r, len, m) { const g = geo('cap' + r + len, () => new THREE.CapsuleGeometry(r, len, 4, 10)); const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; return mesh; }
function box(w, h, d, m) { const g = geo('box' + w + h + d, () => new THREE.BoxGeometry(w, h, d)); const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; return mesh; }
function sphere(r, m, seg = 14) { const g = geo('sph' + r + seg, () => new THREE.SphereGeometry(r, seg, seg - 4)); const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; return mesh; }

const UP = 0.29, LO = 0.28; // arm bone lengths
const THIGH = 0.45, SHIN = 0.45;

export class Human {
  // o: { shirt, pants, skin, trim, head:'cap'|'helmet'|'hat'|'bare', capColor, pads, gloves, keeper, bat, numberTex }
  constructor(o) {
    this.o = o;
    const root = this.root = new THREE.Group();
    const shirt = mat(o.shirt, { r: 0.8 }), pants = mat(o.pants, { r: 0.85 }), skin = mat(o.skin, { r: 0.6 });
    const trim = mat(o.trim || o.shirt);
    const shoe = mat(o.shoes || '#f2f2f2', { r: 0.5 });
    this.hips = new THREE.Group(); this.hips.position.y = 0.98; root.add(this.hips);
    const pelvis = capsule(0.15, 0.08, pants); pelvis.rotation.z = Math.PI / 2; pelvis.scale.set(1, 1, 0.8); this.hips.add(pelvis);
    this.chest = new THREE.Group(); this.chest.position.y = 0.08; this.hips.add(this.chest);
    const torso = capsule(0.165, 0.34, shirt); torso.position.y = 0.27; torso.scale.set(1.1, 1, 0.72); this.chest.add(torso);
    const collar = box(0.18, 0.03, 0.1, trim); collar.position.set(0, 0.52, 0.06); this.chest.add(collar);
    if (o.numberTex) {
      const back = new THREE.Mesh(geo('numplane', () => new THREE.PlaneGeometry(0.22, 0.22)), new THREE.MeshStandardMaterial({ map: o.numberTex, transparent: true, roughness: 0.8 }));
      back.position.set(0, 0.32, -0.125); back.rotation.y = Math.PI; this.chest.add(back); this.numPlane = back;
    }
    this.neck = new THREE.Group(); this.neck.position.y = 0.56; this.chest.add(this.neck);
    const neckM = capsule(0.05, 0.06, skin); neckM.position.y = 0.03; this.neck.add(neckM);
    this.head = new THREE.Group(); this.head.position.y = 0.1; this.neck.add(this.head);
    const headM = sphere(0.105, skin); headM.scale.set(0.95, 1.08, 1); headM.position.y = 0.06; this.head.add(headM);
    const hair = sphere(0.108, mat(o.hair || '#2a1c12', { r: 0.9 })); hair.scale.set(0.98, 0.6, 1.0); hair.position.set(0, 0.12, -0.01); this.head.add(hair);
    if (o.head === 'helmet') {
      const hm = mat(o.capColor || '#1b2a6b', { r: 0.35, m: 0.2 });
      const shell = sphere(0.13, hm, 16); shell.scale.set(1, 0.9, 1.08); shell.position.set(0, 0.11, -0.005); this.head.add(shell);
      const peak = box(0.2, 0.015, 0.09, hm); peak.position.set(0, 0.11, 0.12); peak.rotation.x = -0.2; this.head.add(peak);
      const grillM = mat('#c9ccd1', { r: 0.3, m: 0.8 });
      for (let i = 0; i < 3; i++) { const bar = box(0.2, 0.008, 0.008, grillM); bar.position.set(0, 0.02 - i * 0.035, 0.125 - i * 0.004); this.head.add(bar); }
      const vb = box(0.008, 0.1, 0.008, grillM); vb.position.set(0, -0.01, 0.128); this.head.add(vb);
    } else if (o.head === 'cap' || o.head === 'hat') {
      const cm = mat(o.capColor || '#123', { r: 0.8 });
      const crown = sphere(0.112, cm); crown.scale.set(1, 0.62, 1.04); crown.position.set(0, 0.125, 0); this.head.add(crown);
      if (o.head === 'cap') { const peak = box(0.16, 0.012, 0.1, cm); peak.position.set(0, 0.125, 0.12); this.head.add(peak); }
      else { const brim = new THREE.Mesh(geo('brim', () => new THREE.CylinderGeometry(0.2, 0.2, 0.012, 20)), cm); brim.position.y = 0.12; brim.castShadow = true; this.head.add(brim); }
    }
    // arms
    this.arms = {};
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;  // left = +x
      const sh = new THREE.Group(); sh.position.set(0.215 * sx, 0.47, 0); this.chest.add(sh);
      const ua = capsule(0.055, UP - 0.08, shirt); ua.position.y = -UP / 2; sh.add(ua);
      const el = new THREE.Group(); el.position.y = -UP; sh.add(el);
      const fa = capsule(0.045, LO - 0.07, o.longSleeve ? shirt : skin); fa.position.y = -LO / 2; el.add(fa);
      const hand = new THREE.Group(); hand.position.y = -LO; el.add(hand);
      const handM = o.gloves ? box(0.085, 0.11, 0.085, mat(o.keeper ? '#e8e8e8' : '#f5f5f5', { r: 0.6 })) : sphere(0.045, skin, 10);
      if (o.keeper) handM.scale.set(1.6, 1.4, 1.4);
      handM.position.y = -0.04; hand.add(handM);
      this.arms[side] = { sh, el, hand };
    }
    // legs
    this.legs = {};
    const padM = mat('#f4f4f2', { r: 0.7 });
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const hp = new THREE.Group(); hp.position.set(0.095 * sx, -0.02, 0); this.hips.add(hp);
      const th = capsule(0.075, THIGH - 0.12, pants); th.position.y = -THIGH / 2; hp.add(th);
      const kn = new THREE.Group(); kn.position.y = -THIGH; hp.add(kn);
      const sh = capsule(0.06, SHIN - 0.1, pants); sh.position.y = -SHIN / 2; kn.add(sh);
      if (o.pads) {
        const pad = box(0.15, 0.5, 0.1, padM); pad.position.set(0, -0.2, 0.06); kn.add(pad);
        const roll = box(0.15, 0.1, 0.12, padM); roll.position.set(0, 0.04, 0.07); kn.add(roll);
      }
      const ft = new THREE.Group(); ft.position.y = -SHIN; kn.add(ft);
      const shoeM = box(0.1, 0.07, 0.26, shoe); shoeM.position.set(0, -0.0, 0.06); ft.add(shoeM);
      this.legs[side] = { hp, kn, ft };
    }
    // bat
    if (o.bat) {
      this.bat = new THREE.Group();
      const handle = new THREE.Mesh(geo('handle', () => new THREE.CylinderGeometry(0.017, 0.017, 0.3, 8)), mat('#202020', { r: 0.9 }));
      handle.position.y = -0.1; handle.castShadow = true; this.bat.add(handle);
      const blade = box(0.108, 0.56, 0.04, mat('#e9cf98', { r: 0.55 }));
      blade.position.y = -0.53; this.bat.add(blade);
      const spine = box(0.05, 0.5, 0.02, mat('#d9bb7f', { r: 0.6 })); spine.position.set(0, -0.53, -0.025); this.bat.add(spine);
      const sticker = box(0.11, 0.12, 0.041, mat(o.trim || '#c00', { r: 0.5 })); sticker.position.y = -0.36; this.bat.add(sticker);
      root.add(this.bat);
      this.batTip = new THREE.Object3D(); this.batTip.position.y = -0.75; this.bat.add(this.batTip);
    }
    this.root.traverse(c => { if (c.isMesh) c.receiveShadow = false; });
    this.t = 0;
    this.pose = {};
    this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._q = new THREE.Quaternion();
  }

  setMirror(m) { this.root.scale.x = m ? -1 : 1; if (this.numPlane) this.numPlane.scale.x = m ? -1 : 1; }

  // ----- basic joint posing -----
  resetJoints() {
    this.hips.rotation.set(0, 0, 0); this.hips.position.set(0, 0.98, 0);
    this.chest.rotation.set(0, 0, 0); this.head.rotation.set(0, 0, 0); this.neck.rotation.set(0, 0, 0);
    for (const s of ['L', 'R']) {
      const a = this.arms[s]; a.sh.rotation.set(0, 0, s === 'L' ? 0.08 : -0.08); a.sh.quaternion.setFromEuler(a.sh.rotation); a.el.rotation.set(0, 0, 0);
      const l = this.legs[s]; l.hp.rotation.set(0, 0, 0); l.kn.rotation.set(0, 0, 0); l.ft.rotation.set(0, 0, 0);
    }
  }

  // Two-bone IK: place hand at target (in chest-local coords); elbow bends towards pole
  armIK(side, target) {
    const a = this.arms[side];
    const S = a.sh.position;
    const d = new THREE.Vector3().copy(target).sub(S);
    let len = THREE.MathUtils.clamp(d.length(), 0.08, UP + LO - 0.002);
    d.normalize();
    const cosS = (UP * UP + len * len - LO * LO) / (2 * UP * len);
    const sOff = Math.acos(THREE.MathUtils.clamp(cosS, -1, 1));
    const pole = new THREE.Vector3(side === 'L' ? 0.5 : -0.5, -1, -0.35);
    const n = pole.sub(d.clone().multiplyScalar(pole.dot(d)));
    if (n.lengthSq() < 1e-6) n.set(0, 0, -1);
    n.normalize();
    const u = d.clone().multiplyScalar(Math.cos(sOff)).add(n.clone().multiplyScalar(Math.sin(sOff)));
    const E = S.clone().add(u.clone().multiplyScalar(UP));
    const w = new THREE.Vector3().copy(target).sub(E).normalize();
    const Y = u.clone().negate();
    let Z = w.clone().sub(u.clone().multiplyScalar(w.dot(u)));
    if (Z.lengthSq() < 1e-6) Z = n.clone(); 
    Z.normalize().negate();
    const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
    Z.crossVectors(X, Y).normalize();
    const M = new THREE.Matrix4().makeBasis(X, Y, Z);
    a.sh.quaternion.setFromRotationMatrix(M);
    a.el.rotation.set(Math.acos(THREE.MathUtils.clamp(u.dot(w), -1, 1)), 0, 0);
  }

  legPose(side, hip, knee, ankle = 0, abd = 0) {
    const l = this.legs[side]; l.hp.rotation.set(hip, 0, abd); l.kn.rotation.set(knee, 0, 0); l.ft.rotation.set(ankle, 0, 0);
  }
  armPose(side, shX, shZ, el) {
    const a = this.arms[side]; a.sh.rotation.set(shX, 0, shZ); a.sh.quaternion.setFromEuler(a.sh.rotation); a.el.rotation.set(el, 0, 0);
  }

  // ----- animations -----
  idle(t) {
    this.resetJoints();
    const b = Math.sin(t * 2) * 0.015;
    this.chest.rotation.x = b;
    this.armPose('L', 0.05, 0.12, -0.15); this.armPose('R', 0.05, -0.12, -0.15);
    if (this.bat) this.holdBatDown();
  }
  crouch(t, depth = 0.5) {
    this.resetJoints();
    const d = depth;
    this.hips.position.y = 0.98 - 0.32 * d;
    this.hips.rotation.x = 0.35 * d;
    this.chest.rotation.x = 0.15 * d;
    this.legPose('L', -0.9 * d, 1.5 * d, -0.6 * d, 0.25 * d);
    this.legPose('R', -0.9 * d, 1.5 * d, -0.6 * d, -0.25 * d);
    this.armPose('L', -0.8 * d, 0.2, -0.6 * d); this.armPose('R', -0.8 * d, -0.2, -0.6 * d);
    this.head.rotation.x = -0.3 * d;
  }
  keeperCrouch(t, depth = 1) {
    this.crouch(t, depth);
    this.armPose('L', -1.0, 0.1, -0.4); this.armPose('R', -1.0, -0.1, -0.4);
  }
  run(phase, speed = 1) {
    this.resetJoints();
    const s = Math.sin(phase), c = Math.cos(phase);
    const amp = 0.55 + 0.35 * speed;
    this.hips.position.y = 0.96 + Math.abs(c) * 0.05 * speed;
    this.hips.rotation.y = s * 0.12;
    this.chest.rotation.x = 0.18 * speed; this.chest.rotation.y = -s * 0.2;
    this.legPose('L', -s * amp, Math.max(0, -c) * 1.4 * speed + 0.25, 0.2);
    this.legPose('R', s * amp, Math.max(0, c) * 1.4 * speed + 0.25, 0.2);
    this.armPose('L', s * amp * 0.9, 0.1, -1.1); this.armPose('R', -s * amp * 0.9, -0.1, -1.1);
    if (this.bat) this.carryBat(phase);
  }
  holdBatDown() {
            this.gripAt(new THREE.Vector3(-0.05, 0.95, 0.3), new THREE.Vector3(0.1, -1, 0.15));
  }
  carryBat(phase) {
    this.placeBat(new THREE.Vector3(-0.25, 1.0 + Math.sin(phase) * 0.05, 0.1), new THREE.Vector3(0.2, -0.5, 0.9));
  }
  // place bat with handle at root-local position hp, blade direction dir (root-local)
  placeBat(hp, dir) {
    if (!this.bat) return;
    this.bat.position.copy(hp);
    this.bat.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
  }

  // ----- batting -----
  // shot frame: local +x = towards bowler, +z = off side (facing), batter right-handed (mirror for left)
  stance(t) {
    this.resetJoints();
    this.hips.position.set(0, 0.9, 0);
    this.hips.rotation.set(0.25, 0, 0);
    this.chest.rotation.set(0.15, 0.25, 0);
    this.head.rotation.set(-0.15, 0.95, 0);
    this.legPose('L', -0.25, 0.45, -0.15, 0.18); this.legs.L.hp.position.x = 0.15;
    this.legPose('R', -0.25, 0.45, -0.15, -0.18); this.legs.R.hp.position.x = -0.15;
    this.legs.L.hp.rotation.z = 0.2; this.legs.R.hp.rotation.z = -0.2;
    const tap = Math.max(0, Math.sin(t * 3)) * 0.04;
    const hp = new THREE.Vector3(0.02, 0.8 + tap, 0.33);
    const dir = new THREE.Vector3(-0.25, -1, 0.12);
    this.gripAt(hp, dir);
  }
  // Grip bat handle at hp (root local) with blade direction dir
  gripAt(hp, dir) {
    this.placeBat(hp, dir);
    this.root.updateMatrixWorld(true);
    // targets in chest space
    const inv = this.chest.matrixWorld.clone().invert();
    const top = this.bat.localToWorld(new THREE.Vector3(0, 0.02, 0)).applyMatrix4(inv);
    const low = this.bat.localToWorld(new THREE.Vector3(0, -0.12, 0)).applyMatrix4(inv);
    this.armIK('L', top, 1); this.armIK('R', low, 1);
  }
  // p: 0..1 progress through swing, shot: {theta, action, short:boolean, front:boolean}
  swing(p, shot, t) {
    this.resetJoints();
    const th = shot.theta || 0;
    const cx = Math.cos(th), sz = Math.sin(th);
    const front = shot.front;
    // stride
    const stride = THREE.MathUtils.smoothstep(p, 0, 0.45);
    const crouch = 0.9 - (shot.short ? 0 : 0.08 * stride);
    this.hips.position.set((front ? 0.28 : -0.18) * stride, crouch, 0);
    this.hips.rotation.set(0.25 + (front ? 0.15 : 0) * stride, -0.2 * stride * Math.sign(th || 1), 0);
    if (front) {
      this.legPose('L', -0.25 - 0.55 * stride, 0.45 + 0.25 * stride, -0.15, 0.2);
      this.legPose('R', -0.25 + 0.35 * stride, 0.45 + 0.35 * stride, 0.2, -0.2);
    } else {
      this.legPose('L', -0.25 + 0.2 * stride, 0.45 - 0.1 * stride, 0, 0.2);
      this.legPose('R', -0.25 - 0.2 * stride, 0.45 + 0.1 * stride, -0.1, -0.2);
    }
    this.legs.L.hp.position.x = 0.15; this.legs.R.hp.position.x = -0.15;
    this.head.rotation.set(-0.2, 0.95 - 0.3 * stride, 0);
    // keyframes for handle position & bat direction
    const K = [];
    K.push([0, new THREE.Vector3(0.02, 0.8, 0.33), new THREE.Vector3(-0.25, -1, 0.12)]);
    K.push([0.3, new THREE.Vector3(-0.28, 1.28, 0.22), new THREE.Vector3(-0.75, 0.85, -0.2)]);
    if (shot.action === 'defend') {
      K.push([0.62, new THREE.Vector3(0.25 + 0.05 * cx, 0.72, 0.36 + 0.05 * sz), new THREE.Vector3(0.35, -1, 0.05 + 0.2 * sz)]);
      K.push([1, new THREE.Vector3(0.27, 0.74, 0.36), new THREE.Vector3(0.3, -1, 0.05)]);
    } else if (shot.short) {
      // pull / cut horizontal bat
      K.push([0.62, new THREE.Vector3(0.18, 1.2, 0.42), new THREE.Vector3(cx * 0.3 + 0.1, -0.15, sz >= 0 ? 1 : -1)]);
      K.push([1, new THREE.Vector3(0.1, 1.45, sz >= 0 ? 0.5 : -0.2), new THREE.Vector3(-0.6, 0.5, sz >= 0 ? -0.8 : -0.9)]);
    } else {
      const loft = shot.action === 'loft';
      K.push([0.62, new THREE.Vector3(0.24 + 0.12 * cx, 0.78, 0.38 + 0.12 * sz), new THREE.Vector3(0.45 * cx, -1, 0.45 * sz)]);
      K.push([1, new THREE.Vector3(0.05 + 0.25 * cx, loft ? 1.62 : 1.48, 0.15 + 0.2 * sz), new THREE.Vector3(-0.7 + 0.2 * cx, 0.7, -0.5 + 0.3 * sz)]);
    }
    let i = 0; while (i < K.length - 2 && p > K[i + 1][0]) i++;
    const a = K[i], b = K[i + 1];
    const f = THREE.MathUtils.clamp((p - a[0]) / (b[0] - a[0]), 0, 1);
    const e = f * f * (3 - 2 * f);
    const hp = a[1].clone().lerp(b[1], e);
    const dir = a[2].clone().lerp(b[2], e);
    this.chest.rotation.set(0.15, 0.25 - (p > 0.3 ? (p - 0.3) * 0.9 : -p * 0.6) * (shot.action === 'defend' ? 0.2 : 1), 0);
    this.gripAt(hp, dir);
  }

  // ----- bowling (right-arm; mirror for left-arm) -----
  // p: 0..1 through delivery stride; release at p=0.62
  bowlAction(p, spin) {
    this.resetJoints();
    const e = (x) => THREE.MathUtils.clamp(x, 0, 1);
    // body: gather (0-0.3), coil (0.3-0.5), release (0.62), follow through (to 1)
    const coil = e(p / 0.45);
    const rel = e((p - 0.45) / 0.25);
    const ft = e((p - 0.62) / 0.38);
    this.hips.position.y = 0.98 + Math.sin(e(p / 0.4) * Math.PI) * 0.25 - ft * 0.12;
    this.hips.rotation.y = (-0.9 * coil + 1.3 * rel) * (spin ? 0.6 : 1);
    this.chest.rotation.y = (-0.6 * coil + 0.9 * rel) * (spin ? 0.6 : 1);
    this.chest.rotation.x = -0.25 * coil + 0.75 * rel + 0.2 * ft;
    this.chest.rotation.z = 0.25 * coil - 0.35 * rel;
    // bowling arm (R): rotates from down-back to over the top to down-front
    const armAng = p < 0.3 ? 0.4 * (p / 0.3) : 0.4 + (Math.PI * 1.75 - 0.4) * e((p - 0.3) / 0.55);
    this.armPose('R', armAng, -0.15, 0);
    // front arm (L): reaches up then pulls down
    const la = p < 0.45 ? -Math.PI * 0.95 * coil : -Math.PI * 0.95 + (Math.PI * 1.1) * e((p - 0.45) / 0.3);
    this.armPose('L', la, 0.15, -0.2);
    // legs: front leg (L) plants at ~0.5
    const st = e((p - 0.2) / 0.3);
    this.legPose('L', -0.9 * st + 0.4 * ft, 0.6 * (1 - st) + 0.1, 0.1);
    this.legPose('R', 0.6 * st - 1.0 * ft, 0.9 * st + 0.4 * ft, 0.3);
    this.head.rotation.y = -0.4 * coil + 0.5 * rel;
  }
  handWorld(side, out) { return this.arms[side].hand.getWorldPosition(out); }

  throwAction(p) {
    this.resetJoints();
    const e = THREE.MathUtils.clamp;
    const back = e(p / 0.5, 0, 1), fw = e((p - 0.5) / 0.3, 0, 1);
    this.chest.rotation.y = -0.8 * back + 1.3 * fw;
    this.chest.rotation.x = 0.2 * fw;
    this.armPose('R', 0.8 * back + 0.5 - (2.6 * fw), -0.9 + 0.6 * fw, -0.6 * (1 - fw));
    this.armPose('L', -1.2 * back + 0.6 * fw, 0.4, -0.3);
    this.legPose('L', -0.5 * back, 0.3, 0); this.legPose('R', 0.3 * back, 0.4, 0);
  }
  catchPose(p) {
    this.resetJoints();
    this.armPose('L', -2.2, 0.25, -0.3); this.armPose('R', -2.2, -0.25, -0.3);
    this.head.rotation.x = -0.4;
  }
  celebrate(t) {
    this.resetJoints();
    const j = Math.abs(Math.sin(t * 7));
    this.hips.position.y = 0.98 + j * 0.12;
    this.armPose('L', -2.8, 0.4, 0); this.armPose('R', -2.8 + Math.sin(t * 9) * 0.3, -0.4, 0);
    this.legPose('L', -0.3 * j, 0.6 * j); this.legPose('R', -0.3 * j, 0.6 * j);
  }
  dejected(t) {
    this.resetJoints();
    this.chest.rotation.x = 0.35; this.head.rotation.x = 0.5;
    this.armPose('L', 0, 0.1, -0.2); this.armPose('R', 0, -0.1, -0.2);
    if (this.bat) this.placeBat(new THREE.Vector3(-0.2, 0.95, 0.2), new THREE.Vector3(0.2, -1, 0.3));
  }
  dive(p) {
    this.resetJoints();
    this.hips.position.y = 0.98 - 0.7 * p;
    this.hips.rotation.z = 1.3 * p;
    this.armPose('L', -2.6, 0.2, 0); this.armPose('R', -2.6, -0.2, 0);
    this.legPose('L', 0.2, 0.3); this.legPose('R', -0.2, 0.5);
  }
  umpireOut(t) {
    this.resetJoints();
    this.armPose('R', -2.9, -0.05, 0); this.armPose('L', 0, 0.1, 0);
  }
  umpireSignal(kind, t) {
    this.resetJoints();
    if (kind === 6) { this.armPose('L', -3.0, 0.1, 0); this.armPose('R', -3.0, -0.1, 0); }
    else if (kind === 4) { const w = Math.sin(t * 6) * 0.6; this.armPose('R', -1.5 + w, -0.3, 0); this.armPose('L', 0, 0.1, 0); }
    else if (kind === 'wd') { this.armPose('L', 0, 1.5, 0); this.armPose('R', 0, -1.5, 0); }
    else if (kind === 'nb') { this.armPose('R', 0, -1.5, 0); this.armPose('L', 0, 0.1, 0); }
    else this.idle(t);
  }
}

export function numberTexture(num, name, color, textColor) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = textColor; g.textAlign = 'center';
  g.font = 'bold 22px -apple-system, Helvetica, Arial';
  const sur = (name.split(' ').slice(-1)[0] || '').toUpperCase().slice(0, 10);
  g.fillText(sur, 64, 28);
  g.font = 'bold 84px -apple-system, Helvetica, Arial';
  g.fillText(String(num), 64, 112);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
