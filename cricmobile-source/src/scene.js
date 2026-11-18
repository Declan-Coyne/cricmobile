// Stadium construction
import * as THREE from 'three';
import { PITCH, CREASE, BOUNDARY_R, FIELD_CZ, STUMP_HALF, STUMP_H } from './physics.js';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function noise(g, w, h, n, a, cols) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[i % cols.length]; g.globalAlpha = a * Math.random();
    const s = 1 + Math.random() * 3; g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  g.globalAlpha = 1;
}

export class Stadium {
  constructor(scene, quality) {
    this.scene = scene; this.q = quality;
    this.group = new THREE.Group(); scene.add(this.group);
    this.buildSky(); this.buildLights(); this.buildGround(); this.buildPitch(); this.buildStumps();
    this.buildBoundary(); this.buildStands(); this.buildFloodlights(); this.buildScreens();
    this.setMode('day', 'white');
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(500, 32, 16);
    this.skyU = { top: { value: new THREE.Color('#2f6fd0') }, hor: { value: new THREE.Color('#cfe5ff') }, sun: { value: new THREE.Vector3(0.4, 0.6, -0.7).normalize() }, night: { value: 0 }, time: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `
        varying vec3 vP; uniform vec3 top; uniform vec3 hor; uniform vec3 sun; uniform float night; uniform float time;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
        float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*n(p); p*=2.03; a*=0.5;} return v; }
        void main(){
          float y = max(vP.y, 0.0);
          vec3 col = mix(hor, top, pow(y, 0.55));
          float sd = max(dot(vP, sun), 0.0);
          col += (1.0-night) * (vec3(1.0,0.9,0.7)*pow(sd, 64.0)*0.8 + vec3(1.0,0.8,0.6)*pow(sd,6.0)*0.15);
          vec2 cp = vP.xz / (vP.y + 0.15) * 2.0 + vec2(time*0.01, 0.0);
          float c = smoothstep(0.5, 0.85, fbm(cp*1.3));
          vec3 cc = mix(vec3(1.0), vec3(0.25,0.3,0.4), night);
          col = mix(col, cc, c * 0.75 * smoothstep(0.02, 0.25, y) * (1.0 - night*0.7));
          if (night > 0.5) { float st = step(0.996, h(floor(vP.xz*300.0/(vP.y+0.3)))); col += st*0.6*smoothstep(0.2,0.6,y); }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(geo, m); this.sky.frustumCulled = false; this.group.add(this.sky);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xdcecff, 0x3d5a2a, 0.9); this.group.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff3e0, 2.6);
    sun.position.set(45, 90, -35); sun.target.position.set(0, 0, FIELD_CZ * 0.5);
    sun.castShadow = true;
    const sz = this.q === 'high' ? 2048 : 1024; // 4096 cost a lot of GPU heat for little visible gain
    sun.shadow.mapSize.set(sz, sz);
    const c = sun.shadow.camera; c.left = -75; c.right = 75; c.top = 75; c.bottom = -75; c.near = 10; c.far = 260;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    this.group.add(sun, sun.target);
    // fill light near the pitch for night look
    this.fill = new THREE.DirectionalLight(0xffffff, 0); this.fill.position.set(-40, 70, 40); this.group.add(this.fill);
  }

  buildGround() {
    const S = 2048, M = 180; // texture covers M x M metres centred on field centre
    const px = (m) => (m / M) * S;
    const tex = canvasTex(S, S, (g, w, h) => {
      // base
      g.fillStyle = '#3f8a2e'; g.fillRect(0, 0, w, h);
      // mowing stripes parallel to pitch
      const stripe = 7.5;
      for (let i = -12; i < 12; i++) {
        g.fillStyle = i % 2 ? '#4a9a35' : '#3b8129';
        g.fillRect(w / 2 + px(i * stripe), 0, px(stripe), h);
      }
      // cross hatch subtle
      for (let i = -12; i < 12; i++) { g.fillStyle = 'rgba(255,255,255,0.035)'; if (i % 2) g.fillRect(0, h / 2 + px(i * stripe), w, px(stripe)); }
      noise(g, w, h, 90000, 0.25, ['#2d6b1f', '#5bb043', '#3a7d2a', '#6cbf52']);
      // square (other strips)
      g.fillStyle = 'rgba(190,200,120,0.09)'; g.fillRect(w / 2 - px(11), h / 2 - px(15), px(22), px(30));
      for (let i = -4; i <= 4; i++) { if (i === 0) continue; g.fillStyle = 'rgba(200,190,130,0.07)'; g.fillRect(w / 2 + px(i * 3.05) - px(1.5), h / 2 - px(12), px(3.0), px(24)); }
      // inner circle (30-yard) : two semicircles of r=27.43 from each set of stumps joined by straight lines
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = px(0.12); g.setLineDash([px(1.2), px(1.6)]);
      const r = px(27.43), cz = h / 2, half = px(PITCH / 2);
      g.beginPath();
      g.arc(w / 2, cz - half, r, Math.PI, 0); g.lineTo(w / 2 + r, cz + half); g.arc(w / 2, cz + half, r, 0, Math.PI); g.closePath(); g.stroke();
      g.setLineDash([]);
      // worn outfield near edge
      const grd = g.createRadialGradient(w / 2, h / 2, px(BOUNDARY_R - 2), w / 2, h / 2, px(BOUNDARY_R + 12));
      grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(20,40,10,0.35)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    tex.anisotropy = 16;
    const geo = new THREE.CircleGeometry(M / 2, 128);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    // detail texture via second repeat (noise) using onBeforeCompile-free approach: overlay mesh
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, FIELD_CZ); ground.receiveShadow = true;
    // orientation: canvas y maps to -z after rotation; stripes vertical in canvas => along z
    this.group.add(ground); this.ground = ground;
    // grass detail overlay
    const det = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, w, h); noise(g, w, h, 12000, 0.9, ['#c4c4c4', '#ffffff', '#d6d6d6', '#e0e0e0']); }, [110, 110]);
    det.colorSpace = THREE.NoColorSpace;
    const detM = new THREE.MeshBasicMaterial({ map: det, transparent: true, opacity: 1, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    const detMesh = new THREE.Mesh(geo, detM); detMesh.rotation.x = -Math.PI / 2; detMesh.position.set(0, 0.005, FIELD_CZ); this.group.add(detMesh);
  }

  buildPitch() {
    const W = 3.05, L = 24, S = 2048;
    const ppm = S / L;
    const tex = canvasTex(256, S, (g, w, h) => {
      const sx = w / W;
      g.fillStyle = '#cdb98a'; g.fillRect(0, 0, w, h);
      noise(g, w, h, 30000, 0.35, ['#b8a26f', '#dccb9e', '#a8925f', '#e6d6ad', '#9c8a5a']);
      // grass tinge on edges
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(90,140,60,0.45)'); gr.addColorStop(0.15, 'rgba(90,140,60,0.0)'); gr.addColorStop(0.85, 'rgba(90,140,60,0.0)'); gr.addColorStop(1, 'rgba(90,140,60,0.45)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // worn areas at both ends
      for (const zc of [2, L - 2]) {
        const y = zc * ppm;
        const rg = g.createRadialGradient(w / 2, y, 5, w / 2, y, 2.2 * ppm);
        rg.addColorStop(0, 'rgba(140,110,70,0.55)'); rg.addColorStop(1, 'rgba(140,110,70,0)');
        g.fillStyle = rg; g.fillRect(0, y - 2.5 * ppm, w, 5 * ppm);
        for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(110,85,50,0.25)'; g.beginPath(); g.ellipse(w / 2 + (Math.random() - 0.5) * w * 0.6, y + (Math.random() - 0.5) * 3 * ppm, 6, 12, 0, 0, 7); g.fill(); }
      }
      // creases
      g.fillStyle = '#ffffff';
      const lw = 0.05 * ppm;
      const ends = [(L - PITCH) / 2, (L + PITCH) / 2];
      ends.forEach((sz, k) => {
        const dir = k === 0 ? 1 : -1;
        const pop = sz + dir * CREASE;
        g.fillRect(w / 2 - 1.32 * sx, sz * ppm - lw / 2, 2.64 * sx, lw); // bowling crease
        g.fillRect(0, pop * ppm - lw / 2, w, lw); // popping crease
        const ry0 = Math.min(sz - dir * 1.0, pop), ry1 = Math.max(sz - dir * 1.0, pop);
        for (const xr of [-1.32, 1.32]) g.fillRect(w / 2 + xr * sx - lw / 2, ry0 * ppm, lw, (ry1 - ry0) * ppm);
        for (const xr of [-0.89, 0.89]) g.fillRect(w / 2 + xr * sx - lw / 4, (pop - 0.3) * ppm, lw / 2, 0.6 * ppm);
      });
    });
    tex.anisotropy = 16;
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(W, L), m);
    pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0.008, -PITCH / 2); pitch.receiveShadow = true;
    this.group.add(pitch); this.pitch = pitch;
    // canvas y=0 is at -z after rotation? PlaneGeometry v=1 at +y => after -90deg X rotation +y -> -z. canvas top (y=0) maps to v=1 => -z side.
  }

  buildStumps() {
    this.stumpSets = [];
    const sm = new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.5 });
    const bm = new THREE.MeshStandardMaterial({ color: '#f3efe6', roughness: 0.5 });
    this.stumpMat = sm;
    for (const z of [0, -PITCH]) {
      const g = new THREE.Group(); g.position.set(0, 0, z);
      const stumps = [], bails = [];
      for (const x of [-STUMP_HALF + 0.019, 0, STUMP_HALF - 0.019]) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, STUMP_H, 10), sm);
        s.position.set(x, STUMP_H / 2, 0); s.castShadow = true; g.add(s); stumps.push(s);
        s.userData.base = s.position.clone();
      }
      for (const x of [-0.057, 0.057]) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 6), bm);
        b.rotation.z = Math.PI / 2; b.position.set(x, STUMP_H + 0.01, 0); b.castShadow = true; g.add(b); bails.push(b);
        b.userData.base = b.position.clone();
      }
      this.group.add(g);
      this.stumpSets.push({ g, stumps, bails, anim: null });
    }
  }
  breakStumps(end, impactX, speed) {
    const set = this.stumpSets[end];
    set.anim = { t: 0, vel: set.stumps.map((s, i) => new THREE.Vector3((s.position.x - impactX) * 3 + (Math.random() - 0.5), 0, speed * 0.08 * (1 - Math.abs(s.position.x - impactX) * 4))), bv: set.bails.map(() => new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 2, speed * 0.15)) };
  }
  resetStumps() {
    for (const set of this.stumpSets) {
      set.anim = null;
      set.stumps.forEach(s => { s.position.copy(s.userData.base); s.rotation.set(0, 0, 0); });
      set.bails.forEach(b => { b.position.copy(b.userData.base); b.rotation.set(0, 0, Math.PI / 2); });
    }
  }
  updateStumps(dt) {
    for (const set of this.stumpSets) {
      const a = set.anim; if (!a) continue;
      a.t += dt; if (a.t > 2) continue;
      set.stumps.forEach((s, i) => {
        const v = a.vel[i]; const tilt = Math.min(1.3, a.t * Math.abs(v.z) * 2.2);
        s.rotation.x = tilt * Math.sign(v.z || 1); s.rotation.z = -v.x * 0.08 * Math.min(1, a.t * 4);
        s.position.y = s.userData.base.y - (1 - Math.cos(tilt)) * STUMP_H * 0.5;
        s.position.z = Math.sin(tilt) * STUMP_H * 0.5 * Math.sign(v.z || 1);
      });
      set.bails.forEach((b, i) => {
        const v = a.bv[i];
        v.y -= 9.8 * dt;
        b.position.addScaledVector(v, dt);
        if (b.position.y < 0.01) { b.position.y = 0.01; v.set(v.x * 0.5, Math.abs(v.y) * 0.3, v.z * 0.5); }
        b.rotation.x += dt * 12; b.rotation.y += dt * 8;
      });
    }
  }

  buildBoundary() {
    const curve = new THREE.EllipseCurve(0, 0, BOUNDARY_R, BOUNDARY_R, 0, Math.PI * 2);
    const pts = curve.getPoints(256).map(p => new THREE.Vector3(p.x, 0.07, p.y + FIELD_CZ));
    const path = new THREE.CatmullRomCurve3(pts, true);
    this.ropeMat = new THREE.MeshStandardMaterial({ color: '#f6f6f6', roughness: 0.6 });
    const rope = new THREE.Mesh(new THREE.TubeGeometry(path, 512, 0.09, 6, true), this.ropeMat);
    rope.castShadow = true; this.group.add(rope);
    // advertising boards (generic, LED style)
    const R = BOUNDARY_R + 4.5;
    this.adTex = canvasTex(4096, 128, (g, w, h) => this.drawAds(g, w, h, 0));
    this.adTex.wrapS = THREE.RepeatWrapping; this.adTex.repeat.set(-14, 1); // ~4m panels on a 0.9m board, matching the 4:1 drawn panel
    const adGeo = new THREE.CylinderGeometry(R, R, 0.9, 160, 1, true);
    const adMat = new THREE.MeshStandardMaterial({ map: this.adTex, emissive: '#ffffff', emissiveMap: this.adTex, emissiveIntensity: 0.55, side: THREE.DoubleSide, roughness: 0.5 });
    const ads = new THREE.Mesh(adGeo, adMat); ads.position.set(0, 0.45, FIELD_CZ); this.group.add(ads);
    this.ads = ads;
    // turf beyond boards and perimeter apron
    const apron = new THREE.Mesh(new THREE.RingGeometry(R, R + 8, 128), new THREE.MeshStandardMaterial({ color: '#2f6b25', roughness: 1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(0, 0.01, FIELD_CZ); apron.receiveShadow = true; this.group.add(apron);
  }
  drawAds(g, w, h, off) {
    const msgs = [['CRICMOBILE', '#0b1a3a', '#ffd23f'], ['SIX ZONE', '#c3002f', '#ffffff'], ['PLAY FAIR', '#004b8d', '#ffffff'], ['GO HARD', '#111111', '#3cf2a0'], ['SUMMER OF CRICKET', '#ffffff', '#003366'], ['BOUNDARY CAM', '#ff7a00', '#111'], ['THE GREAT GAME', '#2a0a4a', '#f5d0ff'], ['HOWZAT!', '#006b3c', '#fff']];
    const seg = w / msgs.length;
    msgs.forEach((m, i) => {
      g.fillStyle = m[1]; g.fillRect(i * seg, 0, seg, h);
      g.fillStyle = m[2]; g.font = 'bold 74px Helvetica, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const fit = Math.min(74, 74 * seg * 0.86 / g.measureText(m[0]).width); // shrink long slogans to fit their panel
      g.font = `bold ${Math.floor(fit)}px Helvetica, Arial`;
      g.fillText(m[0], i * seg + seg / 2, h / 2 + 4);
    });
  }

  buildStands() {
    const cz = FIELD_CZ;
    // lower tier profile (r, y)
    const R0 = BOUNDARY_R + 13;
    const prof = [];
    prof.push(new THREE.Vector2(R0 - 0.5, 0.05), new THREE.Vector2(R0, 0.05), new THREE.Vector2(R0, 2.2)); // lifted off the grass to avoid flicker
    const rows = 22, rd = 0.95, rh = 0.48;
    let r = R0, y = 2.2;
    const seatRows = [];
    for (let i = 0; i < rows; i++) { prof.push(new THREE.Vector2(r + rd, y)); seatRows.push([r + rd * 0.55, y]); r += rd; y += rh; prof.push(new THREE.Vector2(r, y)); }
    const lowerTop = { r, y };
    prof.push(new THREE.Vector2(r + 1.5, y), new THREE.Vector2(r + 1.5, y + 2.5), new THREE.Vector2(r + 3, y + 2.5));
    // upper tier
    r += 3; y += 2.5;
    const rows2 = 18; const R1 = r;
    for (let i = 0; i < rows2; i++) { prof.push(new THREE.Vector2(r + 1.0, y)); seatRows.push([r + 0.55, y]); r += 1.0; y += 0.62; prof.push(new THREE.Vector2(r, y)); }
    prof.push(new THREE.Vector2(r + 2, y), new THREE.Vector2(r + 2, y + 6), new THREE.Vector2(r + 4, 0));
    this.standOuter = { r, y };
    // seat texture
    const standMat = new THREE.MeshStandardMaterial({ color: '#8b95a3', roughness: 0.85, side: THREE.DoubleSide });
    const lathe = new THREE.LatheGeometry(prof, 160);
    const stands = new THREE.Mesh(lathe, standMat);
    stands.position.set(0, 0, cz); stands.receiveShadow = true; this.group.add(stands);
    // fascia band (lower tier front & between tiers) with colour
    const fasciaMat = new THREE.MeshStandardMaterial({ color: '#1c2b4a', roughness: 0.6, side: THREE.DoubleSide });
    const fascia = new THREE.Mesh(new THREE.CylinderGeometry(lowerTop.r + 1.52, lowerTop.r + 1.52, 2.5, 160, 1, true), fasciaMat);
    fascia.position.set(0, lowerTop.y + 1.25, cz); this.group.add(fascia);
    this.fasciaMat = fasciaMat;
    // roof canopy over upper tier
    const roofGeo = new THREE.RingGeometry(R1 - 4, this.standOuter.r + 3, 160, 1, 0, Math.PI * 2);
    const roofMat = new THREE.MeshStandardMaterial({ color: '#e8ecf2', roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
    const roof = new THREE.Mesh(roofGeo, roofMat); roof.rotation.x = -Math.PI / 2; roof.position.set(0, this.standOuter.y + 9, cz); this.group.add(roof);
    // roof underside lights strip
    this.roofLights = new THREE.Mesh(new THREE.TorusGeometry(R1 - 3.5, 0.25, 6, 160), new THREE.MeshBasicMaterial({ color: '#fffbe8' }));
    this.roofLights.rotation.x = Math.PI / 2; this.roofLights.position.set(0, this.standOuter.y + 8.7, cz); this.group.add(this.roofLights);
    // roof supports
    const colMat = new THREE.MeshStandardMaterial({ color: '#cfd5dd', roughness: 0.5, metalness: 0.4 });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, this.standOuter.y + 9, 8), colMat);
      c.position.set(Math.cos(a) * (this.standOuter.r + 1), (this.standOuter.y + 9) / 2, cz + Math.sin(a) * (this.standOuter.r + 1)); this.group.add(c);
    }
    // crowd (instanced)
    this.buildCrowd(seatRows, cz);
  }

  buildCrowd(seatRows, cz) {
    const dummy = new THREE.Object3D();
    const perRowDensity = this.q === 'high' ? 1.25 : 0.8; // people per metre
    const cols = ['#d93636', '#2b6fd6', '#f2c230', '#ffffff', '#1a1a1a', '#2f9e44', '#f08c00', '#7048e8', '#e64980', '#20c997', '#495057', '#ced4da', '#ffe066', '#0b7285'];
    const items = [];
    for (const [r, y] of seatRows) {
      const circ = 2 * Math.PI * r;
      const n = Math.floor(circ * perRowDensity);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.002;
        // empty patches & behind sightscreens
        const sx = Math.cos(a), sz = Math.sin(a);
        if (Math.abs(sx) < 0.09) continue; // sightscreen blocks (straight ends)
        if (Math.random() < 0.12) continue;
        items.push([r, y, a]);
      }
    }
    const body = new THREE.BoxGeometry(0.46, 0.62, 0.32); body.translate(0, 0.31, 0);
    const headG = new THREE.SphereGeometry(0.12, 6, 4); headG.translate(0, 0.75, 0);
    const im = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.9 }), items.length);
    const ih = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ roughness: 0.8 }), items.length);
    const c = new THREE.Color();
    const skins = ['#f1c9a5', '#e0ac69', '#c68642', '#8d5524', '#a8754f', '#6b4226'];
    items.forEach((it, i) => {
      const [r, y, a] = it;
      dummy.position.set(Math.cos(a) * r, y + 0.05, cz + Math.sin(a) * r);
      dummy.rotation.set(0, -a - Math.PI / 2, 0);
      dummy.scale.setScalar(0.92 + Math.random() * 0.18);
      dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); ih.setMatrixAt(i, dummy.matrix);
      c.set(cols[(Math.random() * cols.length) | 0]); c.multiplyScalar(0.75 + Math.random() * 0.3);
      im.setColorAt(i, c);
      c.set(skins[(Math.random() * skins.length) | 0]); ih.setColorAt(i, c);
    });
    im.instanceMatrix.needsUpdate = true; ih.instanceMatrix.needsUpdate = true;
    this.crowdHeads = ih; this.group.add(ih);
    this.crowd = im; this.crowdItems = items; this.crowdBase = items.map(it => it[1] + 0.05);
    this.crowdTeamA = null;
    this.group.add(im);
    this.cheer = 0;
  }
  colourCrowd(colA, colB) {
    const c = new THREE.Color();
    const base = ['#ffffff', '#222222', '#888888', '#d93636', '#2b6fd6', '#f2c230'];
    for (let i = 0; i < this.crowdItems.length; i++) {
      const r = Math.random();
      c.set(r < 0.38 ? colA : r < 0.62 ? colB : base[(Math.random() * base.length) | 0]);
      c.multiplyScalar(0.7 + Math.random() * 0.35);
      this.crowd.setColorAt(i, c);
    }
    this.crowd.instanceColor.needsUpdate = true;
  }
  updateCrowd(t, dt) {
    if (this.cheer <= 0.01) { if (this._crowdMoved) { this._crowdMoved = false; this.resetCrowd(); } return; }
    this.cheer = Math.max(0, this.cheer - dt * 0.25);
    const m = new THREE.Matrix4();
    const n = this.crowdItems.length;
    const step = this.q === 'high' ? 1 : 2;
    for (let i = (Math.floor(t * 60) % step); i < n; i += step) {
      this.crowd.getMatrixAt(i, m);
      const j = Math.max(0, Math.sin(t * 14 + i * 1.7)) * 0.35 * this.cheer;
      m.elements[13] = this.crowdBase[i] + j;
      this.crowd.setMatrixAt(i, m); this.crowdHeads.setMatrixAt(i, m);
    }
    this.crowd.instanceMatrix.needsUpdate = true; this.crowdHeads.instanceMatrix.needsUpdate = true; this._crowdMoved = true;
  }
  resetCrowd() {
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.crowdItems.length; i++) { this.crowd.getMatrixAt(i, m); m.elements[13] = this.crowdBase[i]; this.crowd.setMatrixAt(i, m); this.crowdHeads.setMatrixAt(i, m); }
    this.crowd.instanceMatrix.needsUpdate = true; this.crowdHeads.instanceMatrix.needsUpdate = true;
  }

  buildFloodlights() {
    this.floods = [];
    const poleM = new THREE.MeshStandardMaterial({ color: '#b9c0c8', metalness: 0.6, roughness: 0.4 });
    const panelTex = canvasTex(256, 128, (g, w, h) => { g.fillStyle = '#222'; g.fillRect(0, 0, w, h); for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { g.fillStyle = '#fffef5'; g.beginPath(); g.arc(16 + i * 32, 16 + j * 32, 12, 0, 7); g.fill(); } });
    this.floodMat = new THREE.MeshStandardMaterial({ map: panelTex, emissive: '#ffffff', emissiveMap: panelTex, emissiveIntensity: 0.3 });
    const glowTex = canvasTex(128, 128, (g, w, h) => { const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(255,255,240,1)'); rg.addColorStop(0.2, 'rgba(255,250,220,0.6)'); rg.addColorStop(1, 'rgba(255,250,220,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h); });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const R = this.standOuter.r + 6, H = 62;
      const x = Math.cos(a) * R, z = FIELD_CZ + Math.sin(a) * R;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, H, 8), poleM); pole.position.set(x, H / 2, z); this.group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 1), this.floodMat);
      head.position.set(x, H + 2, z); head.lookAt(0, 0, FIELD_CZ); this.group.add(head);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#fffbe0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      glow.scale.set(40, 26, 1); glow.position.set(x * 0.98, H + 2, FIELD_CZ + (z - FIELD_CZ) * 0.98); this.group.add(glow);
      this.floods.push({ head, glow });
    }
  }

  buildScreens() {
    // sightscreens at both ends
    this.sightMat = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.8 });
    for (const end of [1, -1]) {
      const z = FIELD_CZ + end * (BOUNDARY_R + 7.5);
      const s = new THREE.Mesh(new THREE.BoxGeometry(13, 6.5, 0.6), this.sightMat);
      s.position.set(0, 3.25, z); s.castShadow = true; this.group.add(s);
    }
    // big screen (scoreboard)
    this.boardCanvas = document.createElement('canvas'); this.boardCanvas.width = 1024; this.boardCanvas.height = 512;
    this.boardTex = new THREE.CanvasTexture(this.boardCanvas); this.boardTex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(30, 15), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false }));
    const a = Math.PI * 0.5 - 0.42; // behind striker end, off to one side
    const R = this.standOuter.r + 2;
    board.position.set(Math.cos(a) * R, this.standOuter.y + 4, FIELD_CZ + Math.sin(a) * R);
    board.lookAt(0, 10, FIELD_CZ); this.group.add(board);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(31.5, 16.5, 0.8), new THREE.MeshStandardMaterial({ color: '#15181d', roughness: 0.6 }));
    frame.position.copy(board.position); frame.quaternion.copy(board.quaternion); frame.translateZ(-0.45); this.group.add(frame);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(2, this.standOuter.y + 4, 2), frame.material); leg.position.set(board.position.x * 1.02, (this.standOuter.y - 4) / 2, FIELD_CZ + (board.position.z - FIELD_CZ) * 1.02); this.group.add(leg);
    this.drawBoard({ l1: 'CRICMOBILE', l2: 'WELCOME', l3: '' });
  }
  drawBoard({ l1, l2, l3, big, col }) {
    const g = this.boardCanvas.getContext('2d'); const w = 1024, h = 512;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#071229'); gr.addColorStop(1, '#0d2350');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = col || '#ffd23f'; g.fillRect(0, 0, w, 12); g.fillRect(0, h - 12, w, 12);
    g.textAlign = 'center'; g.fillStyle = '#fff';
    if (big) {
      g.font = '900 230px Helvetica, Arial'; g.fillStyle = col || '#ffd23f'; g.fillText(big, w / 2, h / 2 + 80);
    } else {
      g.font = 'bold 64px Helvetica, Arial'; g.fillStyle = '#9fc3ff'; g.fillText(l1 || '', w / 2, 110);
      g.font = '900 150px Helvetica, Arial'; g.fillStyle = '#fff'; g.fillText(l2 || '', w / 2, 290);
      g.font = 'bold 58px Helvetica, Arial'; g.fillStyle = '#ffd23f'; g.fillText(l3 || '', w / 2, 420);
    }
    this.boardTex.needsUpdate = true;
  }

  setMode(time, ball) {
    const night = time === 'night';
    this.night = night;
    this.skyU.night.value = night ? 1 : 0;
    this.skyU.top.value.set(night ? '#040814' : '#2f6fd0');
    this.skyU.hor.value.set(night ? '#18263f' : '#cfe5ff');
    this.hemi.intensity = night ? 0.4 : 0.9;
    this.hemi.groundColor.set(night ? '#1a2a14' : '#3d5a2a');
    this.hemi.color.set(night ? '#c8d6ff' : '#dcecff');
    this.sun.intensity = night ? 2.0 : 2.6;
    this.sun.color.set(night ? '#f4f6ff' : '#fff3e0');
    this.sun.position.set(night ? 20 : 45, night ? 110 : 90, night ? -10 : -35);
    this.fill.intensity = night ? 0.9 : 0;
    this.floodMat.emissiveIntensity = night ? 3 : 0.3;
    this.floods.forEach(f => f.glow.material.opacity = night ? 0.9 : 0);
    this.roofLights.material.color.set(night ? '#fffbe8' : '#c9cfd6');
    this.sightMat.color.set(ball === 'red' ? '#f2f2f2' : '#0e0e0e');
    this.ropeMat.color.set(ball === 'red' ? '#f6f6f6' : '#ffcc00');
  }

  update(t, dt) {
    this.skyU.time.value = t;
    this.adTex.offset.x = (t * 0.01) % 1;
    this.updateStumps(dt);
    this.updateCrowd(t, dt);
  }
}

