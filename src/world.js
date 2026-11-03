import * as THREE from 'three';

// ---------- materials ----------
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    const { flat, ...rest } = opts;
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, flatShading: !!flat, ...rest }));
  }
  return matCache.get(key);
}

function box(w, h, d, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 16, opts) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------- sky ----------
export function makeSky(scene) {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#4aa8ff');
  g.addColorStop(0.55, '#a9dcff');
  g.addColorStop(1, '#fff1d6');
  x.fillStyle = g;
  x.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  scene.background = t;
}

export function makeClouds(scene, minY, maxY) {
  const group = new THREE.Group();
  const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 26; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + Math.random() * 1.2, 0), cm);
      s.position.set(j * 1.4 - n * 0.7, Math.random() * 0.6, Math.random() * 1.2);
      s.scale.y = 0.6;
      c.add(s);
    }
    const side = i % 2 ? 1 : -1;
    c.position.set(side * (17 + Math.random() * 30), minY + Math.random() * (maxY - minY), 10 - Math.random() * 90);
    c.userData.speed = 0.2 + Math.random() * 0.4;
    group.add(c);
  }
  scene.add(group);
  return group;
}

// ---------- islands ----------
export function makeIsland(radius, theme) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.97, 0.6, 10), mat(theme.grass, { flat: true }));
  top.position.y = -0.3;
  top.receiveShadow = true;
  g.add(top);
  const dirt = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.97, radius * 0.25, radius * 0.9, 10), mat(theme.dirt, { flat: true }));
  dirt.position.y = -0.6 - radius * 0.45;
  dirt.receiveShadow = true;
  g.add(dirt);
  // hanging rocks
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + Math.random() * 0.8, 0), mat(theme.dirt, { flat: true }));
    const a = Math.random() * Math.PI * 2;
    r.position.set(Math.cos(a) * radius * 0.5, -radius * 0.6 - Math.random() * 2, Math.sin(a) * radius * 0.5);
    g.add(r);
  }
  // floor area (Sims-style tiles)
  const floorR = radius * 0.78;
  const floorTex = makeTileTexture(theme.floorA, theme.floorB);
  floorTex.repeat.set(floorR, floorR);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(floorR, 10), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  floor.receiveShadow = true;
  g.add(floor);
  // walkable pick surface
  const pick = new THREE.Mesh(new THREE.CircleGeometry(radius - 0.4, 24), new THREE.MeshBasicMaterial({ visible: false }));
  pick.rotation.x = -Math.PI / 2;
  pick.position.y = 0.02;
  pick.userData.floor = true;
  g.add(pick);
  g.userData.pick = pick;
  // grass tufts & flowers around the rim
  for (let i = 0; i < 28; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = floorR + 0.3 + Math.random() * (radius - floorR - 0.6);
    const t = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 4), mat(theme.tuft, { flat: true }));
    t.position.set(Math.cos(a) * rr, 0.17, Math.sin(a) * rr);
    g.add(t);
    if (Math.random() < 0.35) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), mat([0xff7aa2, 0xffd166, 0xffffff, 0x9b8cff][i % 4]));
      f.position.set(t.position.x + 0.1, 0.3, t.position.z);
      g.add(f);
    }
  }
  return g;
}

function makeTileTexture(a, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = a;
  x.fillRect(0, 0, 64, 64);
  x.fillStyle = b;
  x.fillRect(0, 0, 32, 32);
  x.fillRect(32, 32, 32, 32);
  x.strokeStyle = 'rgba(0,0,0,0.08)';
  x.strokeRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// ---------- furniture ----------
// Every builder returns a group facing +Z (the side the player uses).
export const Furniture = {
  bed(theme) {
    const g = new THREE.Group();
    g.add(box(1.4, 0.35, 2.3, 0x8a5a3c, 0, 0.2, 0));
    g.add(box(1.3, 0.22, 2.2, 0xf4f1ea, 0, 0.48, 0));
    g.add(box(1.32, 0.12, 1.4, theme.accent, 0, 0.6, 0.38));
    g.add(box(0.8, 0.14, 0.4, 0xffffff, 0, 0.66, -0.85));
    g.add(box(1.4, 0.9, 0.12, 0x8a5a3c, 0, 0.45, -1.15));
    // bed is used from its side, rotate later by caller
    return g;
  },
  desk(theme, screenColor = 0x7fd6ff) {
    const g = new THREE.Group();
    g.add(box(1.6, 0.08, 0.8, 0xc49a6c, 0, 0.78, 0));
    for (const [x, z] of [[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.32], [0.72, 0.32]]) g.add(box(0.07, 0.78, 0.07, 0x5b4636, x, 0.39, z));
    // laptop
    g.add(box(0.6, 0.03, 0.4, 0x3a3f4b, 0, 0.84, 0.08));
    const scr = box(0.6, 0.4, 0.03, 0x3a3f4b, 0, 1.04, -0.13);
    scr.rotation.x = -0.15;
    g.add(scr);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.34), new THREE.MeshBasicMaterial({ color: screenColor }));
    glow.position.set(0, 1.04, -0.11);
    glow.rotation.x = -0.15;
    g.add(glow);
    g.userData.screen = glow;
    // mug & lamp
    g.add(cyl(0.05, 0.05, 0.1, theme.accent, 0.6, 0.87, 0.15));
    g.add(cyl(0.02, 0.02, 0.4, 0x333333, -0.62, 1.0, -0.2));
    g.add(cyl(0.05, 0.13, 0.12, 0xffd166, -0.62, 1.2, -0.2));
    // chair
    const ch = new THREE.Group();
    ch.add(box(0.55, 0.08, 0.55, 0x2f3440, 0, 0.48, 0));
    ch.add(box(0.55, 0.6, 0.08, 0x2f3440, 0, 0.8, 0.27));
    ch.add(cyl(0.04, 0.04, 0.44, 0x666666, 0, 0.24, 0));
    ch.add(cyl(0.25, 0.25, 0.04, 0x444444, 0, 0.03, 0));
    ch.position.z = 0.75;
    g.add(ch);
    return g;
  },
  coffee(theme) {
    const g = new THREE.Group();
    g.add(box(1.2, 0.9, 0.6, 0xe9e4da, 0, 0.45, 0));
    g.add(box(1.24, 0.06, 0.64, 0x8a5a3c, 0, 0.93, 0));
    const m = box(0.4, 0.5, 0.35, 0x2b2b2b, -0.2, 1.21, -0.05);
    g.add(m);
    g.add(box(0.3, 0.1, 0.05, 0xff5252, -0.2, 1.3, 0.13, { emissive: 0xff2222, emissiveIntensity: 0.6 }));
    g.add(cyl(0.06, 0.05, 0.12, 0xffffff, 0.3, 1.02, 0.05));
    g.add(cyl(0.06, 0.05, 0.12, theme.accent, 0.45, 1.02, -0.1));
    return g;
  },
  beanbag(theme) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), mat(theme.accent2, { flat: true }));
    b.scale.set(1, 0.6, 1);
    b.position.y = 0.32;
    b.castShadow = true;
    g.add(b);
    // radio with speaker
    g.add(box(0.5, 0.3, 0.2, 0x6c5ce7, 0.9, 0.15, -0.3));
    g.add(cyl(0.09, 0.09, 0.03, 0x222222, 0.8, 0.17, -0.19).rotateX(Math.PI / 2));
    g.add(cyl(0.09, 0.09, 0.03, 0x222222, 1.0, 0.17, -0.19).rotateX(Math.PI / 2));
    // plant
    g.add(cyl(0.18, 0.14, 0.35, 0xd17a4a, -0.95, 0.18, -0.25));
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 4), mat(0x3fae5a, { flat: true }));
      l.position.set(-0.95 + Math.sin(i * 1.3) * 0.1, 0.65, -0.25 + Math.cos(i * 1.3) * 0.1);
      l.rotation.z = Math.sin(i * 1.3) * 0.4;
      l.rotation.x = Math.cos(i * 1.3) * 0.4;
      g.add(l);
    }
    return g;
  },
  whiteboard() {
    const g = new THREE.Group();
    g.add(box(1.6, 1.0, 0.06, 0xffffff, 0, 1.4, 0));
    g.add(box(1.7, 0.06, 0.1, 0x9aa3b2, 0, 0.88, 0.02));
    g.add(box(0.06, 1.0, 0.06, 0x9aa3b2, -0.7, 0.45, 0));
    g.add(box(0.06, 1.0, 0.06, 0x9aa3b2, 0.7, 0.45, 0));
    // scribbles
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 160;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 256, 160);
    x.strokeStyle = '#2b6cb0';
    x.lineWidth = 4;
    x.font = 'bold 22px monospace';
    x.fillStyle = '#2b6cb0';
    x.fillText('O(n log n)', 20, 40);
    x.fillStyle = '#e53e3e';
    x.fillText('tree.invert()', 20, 80);
    x.strokeRect(150, 95, 40, 40);
    x.beginPath();
    x.moveTo(190, 115);
    x.lineTo(230, 115);
    x.stroke();
    x.fillStyle = '#2f855a';
    x.fillText('STAR', 20, 130);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.92), new THREE.MeshBasicMaterial({ map: tex }));
    p.position.set(0, 1.4, 0.035);
    g.add(p);
    return g;
  },
  bookshelf(theme) {
    const g = new THREE.Group();
    g.add(box(1.2, 1.8, 0.4, 0x8a5a3c, 0, 0.9, 0));
    const colors = [0xe76f51, 0x2a9d8f, 0xe9c46a, 0x264653, 0xf4a261, theme.accent];
    for (let r = 0; r < 3; r++) {
      g.add(box(1.1, 0.04, 0.36, 0x6b4430, 0, 0.35 + r * 0.55, 0.03));
      let x = -0.48;
      while (x < 0.45) {
        const w = 0.06 + Math.random() * 0.06;
        const h = 0.3 + Math.random() * 0.15;
        g.add(box(w, h, 0.28, colors[Math.floor(Math.random() * colors.length)], x + w / 2, 0.37 + r * 0.55 + h / 2, 0.04));
        x += w + 0.01;
      }
    }
    return g;
  },
  trophy() {
    const g = new THREE.Group();
    g.add(box(0.8, 0.9, 0.8, 0xf4f1ea, 0, 0.45, 0));
    const gold = { metalness: 0.8, roughness: 0.25 };
    g.add(cyl(0.12, 0.18, 0.12, 0xffc83d, 0, 0.96, 0, 12, gold));
    g.add(cyl(0.04, 0.04, 0.25, 0xffc83d, 0, 1.14, 0, 8, gold));
    g.add(cyl(0.28, 0.1, 0.35, 0xffc83d, 0, 1.43, 0, 12, gold));
    return g;
  },
  flag(color) {
    const g = new THREE.Group();
    g.add(cyl(0.04, 0.04, 3, 0xdddddd, 0, 1.5, 0));
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7, 8, 2), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide }));
    f.position.set(0.55, 2.6, 0);
    g.add(f);
    g.userData.flag = f;
    return g;
  },
  tree(color = 0x56b870) {
    const g = new THREE.Group();
    g.add(cyl(0.1, 0.15, 0.8, 0x7a5235, 0, 0.4, 0, 6));
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), mat(color, { flat: true }));
    c.position.y = 1.2;
    c.castShadow = true;
    g.add(c);
    return g;
  },
  lowWall(len, color) {
    const g = new THREE.Group();
    g.add(box(len, 0.7, 0.15, color, 0, 0.35, 0));
    g.add(box(len, 0.06, 0.2, 0xffffff, 0, 0.72, 0));
    return g;
  },
  rug(color) {
    const r = new THREE.Mesh(new THREE.CircleGeometry(1.2, 20), mat(color));
    r.rotation.x = -Math.PI / 2;
    r.position.y = 0.02;
    r.receiveShadow = true;
    return r;
  },
};

// floating pad for critics
export function makePad(theme) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.3, 0.9, 6), mat(theme.dirt, { flat: true }));
  top.position.y = -0.45;
  top.receiveShadow = true;
  g.add(top);
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.8, 0.1, 6), mat(0x8c8fa3, { flat: true }));
  grass.position.y = -0.03;
  g.add(grass);
  return g;
}

// stone used for rocks and stair steps
export function makeStone(size = 0.35, color = 0x8d8a86) {
  const geo = new THREE.DodecahedronGeometry(size, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) * (0.85 + Math.random() * 0.3), pos.getY(i) * (0.7 + Math.random() * 0.3), pos.getZ(i) * (0.85 + Math.random() * 0.3));
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function makeStep(color = 0xb9b2a6) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(1.7, 0.35, 1.0, 2, 1, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + (Math.random() - 0.5) * 0.05);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return g;
}
