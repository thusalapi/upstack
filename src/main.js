import * as THREE from 'three';
import { Character, makeFigure } from './character.js';
import { makeSky, makeClouds, makeIsland, Furniture, makePad, makeStone, makeStep } from './world.js';
import { THEMES, ISLANDS, CHAPTERS, simlish } from './content.js';
import { initAudio, sfx, babble, toggleMute } from './audio.js';

const params = new URLSearchParams(location.search);
const START_CHAPTER = Math.min(3, parseInt(params.get('chapter') || '0', 10) || 0);
const DEBUG_FAST = params.has('fast');
const DT_CAP = params.has('test') ? 0.25 : 0.05;

// ======================================================================
// Renderer, scene, camera
// ======================================================================
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe8ff, 70, 160);
makeSky(scene);
const clouds = makeClouds(scene, -14, 26);

const hemi = new THREE.HemisphereLight(0xeaf6ff, 0x9a8a70, 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -16;
sun.shadow.camera.right = 16;
sun.shadow.camera.top = 16;
sun.shadow.camera.bottom = -16;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

let zoom = innerWidth < 820 ? 1.0 : 1.45;
let camAngle = Math.PI / 4;
let camAngleTarget = camAngle;
const camTarget = new THREE.Vector3();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 400);
let shake = 0;
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  const aspect = innerWidth / innerHeight;
  const h = 9.5 / zoom;
  camera.left = -h * aspect;
  camera.right = h * aspect;
  camera.top = h;
  camera.bottom = -h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ======================================================================
// Game state
// ======================================================================
const state = {
  started: false,
  speed: 1,
  chapter: START_CHAPTER,
  time: 8 * 60, // minutes
  day: 1,
  needs: { energy: 85, coffee: 70, focus: 80, confidence: 60 },
  progress: [0, 0, 0, 0],
  stepsBuilt: [0, 0, 0],
  stats: { dodged: 0, hits: 0, lessons: 0, spirals: 0 },
  queue: [],
  ended: false,
  newcomer: null,
  tutorial: { rockSeen: false, landSeen: false },
};
const NEED_META = [
  ['energy', '⚡ Energy'],
  ['coffee', '☕ Coffee'],
  ['focus', '🎯 Focus'],
  ['confidence', '💪 Confidence'],
];

const islands = [];
const entities = []; // clickable things
const pickables = []; // meshes for raycasting
const colliders = []; // {pos, r, island, entity}
const rocks = [];
const critics = [];
const stairs = []; // per chapter i: { A, B, steps: [], ghosts: [], slots: [] }

function islandPos(i) {
  return new THREE.Vector3(...ISLANDS[i].c);
}

// ======================================================================
// Build world
// ======================================================================
function angleDist(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

function registerEntity(ent) {
  entities.push(ent);
  ent.group.traverse((o) => {
    if (o.isMesh) {
      o.userData.entity = ent;
      pickables.push(o);
    }
  });
  return ent;
}

function buildIsland(i) {
  const def = ISLANDS[i];
  const theme = THEMES[i];
  const C = islandPos(i);
  const g = makeIsland(def.r, theme);
  g.position.copy(C);
  scene.add(g);
  islands.push({ group: g, center: C, r: def.r, y: C.y });

  // stair angles (to next / from previous)
  const avoid = [];
  if (i < ISLANDS.length - 1) {
    const n = islandPos(i + 1);
    avoid.push(Math.atan2(n.z - C.z, n.x - C.x));
  }
  if (i > 0) {
    const p = islandPos(i - 1);
    avoid.push(Math.atan2(p.z - C.z, p.x - C.x));
  }
  const camFront = Math.PI / 4;
  const slots = [];
  for (let a = Math.PI * 0.6; a < Math.PI * 1.98; a += 0.04) {
    if (avoid.some((b) => angleDist(a, b) < 0.6)) continue;
    if (angleDist(a, camFront) < 1.1) continue;
    slots.push(a);
  }
  const chapter = CHAPTERS[i];
  const objs = chapter.objects;
  const picks = objs.map((_, k) => slots[Math.round(((k + 0.5) * slots.length) / objs.length - 0.5)]);
  objs.forEach((kind, k) => {
    const a = picks[k];
    const R = kind === 'bed' ? 5.0 : 5.3;
    const pos = new THREE.Vector3(C.x + Math.cos(a) * R, C.y, C.z + Math.sin(a) * R);
    const yaw = Math.atan2(C.x - pos.x, C.z - pos.z);
    placeFurniture(kind, i, pos, yaw, theme);
  });
  // decor: rug in center, back walls, front trees
  const rug = Furniture.rug(theme.accent2);
  rug.position.set(C.x, C.y, C.z);
  rug.scale.setScalar(1.4);
  scene.add(rug);
  for (const a of [Math.PI * 1.0, Math.PI * 1.5]) {
    if (avoid.some((b) => angleDist(a, b) < 0.8)) continue;
    const w = Furniture.lowWall(5, theme.wall);
    w.position.set(C.x + Math.cos(a) * 6.9, C.y, C.z + Math.sin(a) * 6.9);
    w.rotation.y = Math.atan2(C.x - w.position.x, C.z - w.position.z);
    scene.add(w);
  }
  for (let k = 0; k < 4; k++) {
    const a = camFront + (k - 1.5) * 0.55;
    if (avoid.some((b) => angleDist(a, b) < 0.5)) continue;
    const t = Furniture.tree([0x56b870, 0x6cc36b, 0x4aa36a, 0x8fd16b][k]);
    t.position.set(C.x + Math.cos(a) * (def.r - 0.7), C.y, C.z + Math.sin(a) * (def.r - 0.7));
    t.scale.setScalar(0.7 + Math.random() * 0.3);
    scene.add(t);
  }
  if (i === 3) {
    const f = Furniture.flag(0xff6b6b);
    f.position.set(C.x + 2.5, C.y, C.z - 2.5);
    scene.add(f);
    islands[i].flag = f;
  }
}

function standPoint(pos, yaw, dist) {
  return new THREE.Vector3(pos.x + Math.sin(yaw) * dist, pos.y, pos.z + Math.cos(yaw) * dist);
}

function placeFurniture(kind, isl, pos, yaw, theme) {
  const ch = CHAPTERS[isl];
  let group;
  let ent;
  const add = (g) => {
    g.position.copy(pos);
    g.rotation.y = yaw;
    scene.add(g);
    return g;
  };
  switch (kind) {
    case 'bed': {
      group = add(Furniture.bed(theme));
      // bed is entered from its +X side; rotate so +X side faces the center
      group.rotation.y = yaw - Math.PI / 2;
      const side = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), group.rotation.y);
      const stand = pos.clone().addScaledVector(side, 1.15);
      const foot = new THREE.Vector3(0, 0, 0.95).applyAxisAngle(new THREE.Vector3(0, 1, 0), group.rotation.y).add(pos);
      foot.y = pos.y + 0.6;
      ent = {
        name: 'Bed',
        kind,
        group,
        island: isl,
        stand,
        faceYaw: yaw + Math.PI,
        actions: () => [
          act('Sleep', '😴', { state: 'sleep', lie: true, seat: { pos: foot, yaw: group.rotation.y }, until: () => state.needs.energy >= 99, rates: { energy: 9, focus: 1.5, coffee: -0.3 }, bubble: '💤' }),
          act('Power nap', '🛌', { state: 'sleep', lie: true, seat: { pos: foot, yaw: group.rotation.y }, duration: 7, rates: { energy: 8, focus: 1 }, bubble: '💤' }),
        ],
      };
      colliders.push({ pos: pos.clone(), r: 1.25, island: isl });
      break;
    }
    case 'desk': {
      group = add(Furniture.desk(theme, isl === 3 ? 0xffd166 : 0x7fd6ff));
      const seatPos = standPoint(pos, yaw, 0.82);
      ent = {
        name: isl === 3 ? 'Portfolio Desk' : 'Desk',
        kind,
        group,
        island: isl,
        stand: standPoint(pos, yaw, 1.45),
        faceYaw: yaw + Math.PI,
        actions: () => {
          const list = [
            act(ch.task.label, ch.task.icon, {
              state: 'type',
              seat: { pos: seatPos, yaw: yaw + Math.PI, seatH: 0.04 },
              work: 1,
              until: () => state.progress[isl] >= 100,
              rates: { energy: -1.2, focus: -1.6, coffee: -0.5 },
              bubble: ch.task.icon,
              disabled: state.progress[isl] >= 100 ? 'Done!' : null,
            }),
          ];
          if (isl < 3)
            list.push(
              act('Read tech Twitter', '📱', {
                state: 'type',
                seat: { pos: seatPos, yaw: yaw + Math.PI, seatH: 0.04 },
                duration: 6,
                rates: { confidence: -1.2, focus: -1.5 },
                bubble: '😬',
                done: () => toast('😬', 'Comparing yourself to everyone online. That did not help.', 'bad'),
              })
            );
          return list;
        },
      };
      colliders.push({ pos: pos.clone(), r: 0.9, island: isl });
      break;
    }
    case 'coffee': {
      group = add(Furniture.coffee(theme));
      ent = {
        name: 'Coffee Station',
        kind,
        group,
        island: isl,
        stand: standPoint(pos, yaw, 0.85),
        faceYaw: yaw + Math.PI,
        actions: () => [
          act('Drink coffee', '☕', { state: 'drink', duration: 5, rates: { coffee: 18, focus: 2 }, bubble: '☕' }),
          act('Make green tea', '🍵', { state: 'drink', duration: 6, rates: { coffee: 6, focus: 5, confidence: 0.5 }, bubble: '🍵' }),
        ],
      };
      colliders.push({ pos: pos.clone(), r: 0.75, island: isl });
      break;
    }
    case 'beanbag': {
      group = add(Furniture.beanbag(theme));
      const seat = { pos: pos.clone(), yaw, seatH: 0.12 };
      ent = {
        name: 'Chill Corner',
        kind,
        group,
        island: isl,
        stand: standPoint(pos, yaw, 0.95),
        faceYaw: yaw,
        actions: () => [
          act('Listen to lo-fi', '🎧', { state: 'chill', seat, duration: 9, rates: { focus: 7, confidence: 0.6 }, bubble: '🎵' }),
          act('Remember why you started', '🌱', { state: 'sit', seat, duration: 7, rates: { confidence: 4, focus: 1 }, bubble: '🌱' }),
        ],
      };
      colliders.push({ pos: pos.clone(), r: 0.75, island: isl });
      break;
    }
    case 'bookshelf':
    case 'whiteboard': {
      group = add(kind === 'bookshelf' ? Furniture.bookshelf(theme) : Furniture.whiteboard());
      const alt = ch.alt && ch.alt.obj === kind ? ch.alt : null;
      ent = {
        name: kind === 'bookshelf' ? 'Bookshelf' : 'Whiteboard',
        kind,
        group,
        island: isl,
        stand: standPoint(pos, yaw, 0.95),
        faceYaw: yaw + Math.PI,
        actions: () => {
          const list = [];
          if (alt) {
            const capped = alt.cap && state.progress[isl] >= alt.cap;
            list.push(
              act(alt.label, alt.icon, {
                state: 'think',
                work: alt.rate,
                cap: alt.cap,
                until: () => state.progress[isl] >= (alt.cap || 100),
                rates: { energy: -0.6, focus: -0.9 },
                bubble: alt.icon,
                disabled: state.progress[isl] >= 100 ? 'Done!' : capped ? alt.capMsg : null,
              })
            );
          }
          list.push(act('Browse', '👀', { state: 'think', duration: 4, rates: { focus: 1.5 }, bubble: '🤔' }));
          return list;
        },
      };
      colliders.push({ pos: pos.clone(), r: 0.8, island: isl });
      break;
    }
    case 'trophy': {
      group = add(Furniture.trophy());
      ent = {
        name: 'Trophy',
        kind,
        group,
        island: isl,
        stand: standPoint(pos, yaw, 1.0),
        faceYaw: yaw + Math.PI,
        actions: () => [act('Celebrate', '🎉', { state: 'cheer', duration: 4, rates: { confidence: 4 }, bubble: '🎉' })],
      };
      colliders.push({ pos: pos.clone(), r: 0.6, island: isl });
      break;
    }
  }
  if (ent) registerEntity(ent);
}

function act(label, icon, def) {
  return { label, icon, def, disabled: def.disabled || null };
}

// ---------- stairs ----------
function buildStairs(i) {
  const C0 = islandPos(i);
  const C1 = islandPos(i + 1);
  const dir = new THREE.Vector3(C1.x - C0.x, 0, C1.z - C0.z).normalize();
  const A = C0.clone().addScaledVector(dir, ISLANDS[i].r - 0.6);
  const B = C1.clone().addScaledVector(dir, -(ISLANDS[i + 1].r - 0.6));
  const n = CHAPTERS[i].steps;
  const yaw = Math.atan2(dir.x, dir.z);
  const slots = [];
  const ghosts = [];
  const group = new THREE.Group();
  scene.add(group);
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false });
  for (let k = 0; k < n; k++) {
    const f = (k + 1) / (n + 1);
    const p = A.clone().lerp(B, f);
    p.y = THREE.MathUtils.lerp(C0.y, C1.y, f) - 0.18;
    slots.push(p);
    const gm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 1.0), ghostMat);
    gm.position.copy(p);
    gm.rotation.y = yaw;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(gm.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
    gm.add(edges);
    group.add(gm);
    ghosts.push(gm);
  }
  // landing pads
  for (const P of [A, B]) {
    const pad = makeStep(0xcfc6b8);
    pad.position.copy(P);
    pad.position.y -= 0.16;
    pad.rotation.y = yaw;
    group.add(pad);
  }
  const st = { A, B, yaw, dir, slots, ghosts, steps: [], group, i };
  const ent = {
    name: 'The Way Up',
    kind: 'stairs',
    group,
    island: i,
    stand: A.clone().addScaledVector(dir, -0.9),
    faceYaw: yaw,
    actions: () => {
      const need = n - state.stepsBuilt[i];
      const ready = need <= 0 && state.progress[i] >= 100;
      let why = null;
      if (need > 0) why = `Needs ${need} more lesson stone${need > 1 ? 's' : ''}`;
      else if (state.progress[i] < 100) why = `First: ${CHAPTERS[i].milestone.toLowerCase()}`;
      if (state.chapter !== i) why = 'You already climbed this';
      return [act('Climb up', '🧗', { climb: i, disabled: ready && state.chapter === i ? null : why })];
    },
  };
  registerEntity(ent);
  st.entity = ent;
  stairs[i] = st;
}

// ---------- critics ----------
function spawnCritics(i) {
  const ch = CHAPTERS[i];
  const C = islandPos(i);
  const R = ISLANDS[i].r + 2.6;
  for (let k = 0; k < ch.critics; k++) {
    const side = k % 2 ? 1 : -1;
    const a = Math.PI / 4 + side * (1.0 + Math.floor(k / 2) * 0.42);
    const pos = new THREE.Vector3(C.x + Math.cos(a) * R, C.y + 1.4, C.z + Math.sin(a) * R);
    const pad = makePad(THEMES[i]);
    pad.position.copy(pos);
    scene.add(pad);
    // doubts are shadowy, half-there figures: voices, not people
    const fig = makeFigure([0x6b6f85, 0x7a6f85, 0x5f7085, 0x85706b][k % 4]);
    fig.traverse((o) => {
      if (o.isMesh) {
        o.material = o.material.clone();
        o.material.transparent = true;
        o.material.opacity = 0.62;
      }
    });
    fig.position.copy(pos);
    scene.add(fig);
    const ent = {
      name: 'Doubt',
      kind: 'critic',
      group: fig,
      island: i,
      stand: C.clone().add(new THREE.Vector3(Math.cos(a) * (ISLANDS[i].r - 1.2), 0, Math.sin(a) * (ISLANDS[i].r - 1.2))),
      faceYaw: Math.atan2(pos.x - C.x, pos.z - C.z),
      actions: () => [
        act('Tune it out', '🎧', { state: 'idle', duration: 1.5, rates: { confidence: 2 }, say: 'Not today.', bubble: '🎧' }),
        act('Wave it off', '👋', { state: 'wave', duration: 2.5, rates: { confidence: 1 }, bubble: '👋', done: () => critic.confused = 2.5 }),
      ],
    };
    const critic = { fig, pad, pos, island: i, cooldown: 0, throwT: -1, ent, active: true, confused: 0, bob: Math.random() * 6 };
    registerEntity(ent);
    critics.push(critic);
  }
}

// ======================================================================
// Player
// ======================================================================
const player = new Character();
const plumbob = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.16, 0),
  new THREE.MeshStandardMaterial({ color: 0x37d67a, emissive: 0x1aa055, emissiveIntensity: 0.6, roughness: 0.3, transparent: true, opacity: 0.92 })
);
plumbob.scale.y = 1.7;
const P = {
  pos: new THREE.Vector3(),
  yaw: 0,
  island: START_CHAPTER,
  mode: 'free', // free | moving | acting | climbing | stunned | spiral | passedout | cutscene
  target: null,
  pendingAction: null,
  action: null,
  stunT: 0,
  vel: new THREE.Vector3(),
  run: false,
  climb: null,
};
const keys = new Set();

// ======================================================================
// UI: labels, bubbles, toasts, pie menu, needs, queue, goals
// ======================================================================
const labelsEl = document.getElementById('labels');
const labels = new Set();
function addLabel(el, getPos, offsetY = 0) {
  el.classList.add('lbl');
  labelsEl.appendChild(el);
  const L = { el, getPos, offsetY };
  labels.add(L);
  return L;
}
function removeLabel(L) {
  if (!L) return;
  L.el.remove();
  labels.delete(L);
}
const _v = new THREE.Vector3();
function updateLabels() {
  for (const L of labels) {
    const p = L.getPos();
    if (!p) continue;
    _v.copy(p);
    _v.y += L.offsetY;
    _v.project(camera);
    const x = (_v.x * 0.5 + 0.5) * innerWidth;
    const y = (-_v.y * 0.5 + 0.5) * innerHeight;
    L.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }
}

let playerBubble = null;
let playerBubbleT = 0;
function bubble(icon, text = simlish(2), kind = 'thought', dur = 2.6) {
  if (playerBubble) removeLabel(playerBubble);
  const el = document.createElement('div');
  el.className = `bubble ${kind}`;
  el.innerHTML = `<span class="ico">${icon}</span>${text ? `<span class="sim">${text}</span>` : ''}`;
  playerBubble = addLabel(el, () => P.pos, player.lyingTarget > 0.5 ? 1.7 : 2.75);
  playerBubbleT = dur;
  babble(3 + Math.floor(Math.random() * 3), 1.1);
}
function speech(getPos, text, dur = 2.2, offset = 2.0) {
  const el = document.createElement('div');
  el.className = 'bubble speech';
  el.textContent = text;
  const L = addLabel(el, getPos, offset);
  setTimeout(() => removeLabel(L), dur * 1000);
  return L;
}
function floatText(pos, text, color = '#fff') {
  const el = document.createElement('div');
  el.className = 'float-txt';
  el.style.color = color;
  el.textContent = text;
  const p = pos.clone();
  const L = addLabel(el, () => p, 2.2);
  setTimeout(() => removeLabel(L), 1400);
}

const toastsEl = document.getElementById('toasts');
function toast(icon, html, kind = '', dur = 6) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="ti">${icon}</span><div>${html}</div>`;
  toastsEl.appendChild(el);
  while (toastsEl.children.length > 3) toastsEl.firstChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 400);
  }, dur * 1000);
}

// needs UI
const needsEl = document.getElementById('needs');
const needEls = {};
for (const [k, label] of NEED_META) {
  const d = document.createElement('div');
  d.className = 'need';
  d.innerHTML = `<div class="nl"><span>${label}</span><span class="nv"></span></div><div class="nb"><div></div></div>`;
  needsEl.appendChild(d);
  needEls[k] = d;
}
function needColor(v) {
  if (v > 60) return 'linear-gradient(90deg,#2fc46c,#5fe39a)';
  if (v > 30) return 'linear-gradient(90deg,#e6a91f,#f6c445)';
  return 'linear-gradient(90deg,#d63c3c,#ef6a5a)';
}
function moodInfo() {
  const n = state.needs;
  const avg = (n.energy + n.coffee + n.focus + n.confidence * 1.5) / 4.5;
  if (P.mode === 'spiral') return ['Doubting', '#d63c3c', 0xef5350];
  if (avg > 68) return ['Inspired', '#1f9d55', 0x37d67a];
  if (avg > 45) return ['Focused', '#1f9d55', 0x37d67a];
  if (avg > 28) return ['Tense', '#c98a00', 0xf6c445];
  return ['Struggling', '#d63c3c', 0xef5350];
}
const moodEl = document.getElementById('mood');
const plumbobMini = document.getElementById('plumbobMini');
const clockEl = document.getElementById('clock');
function updateNeedsUI() {
  for (const [k] of NEED_META) {
    const v = state.needs[k];
    const d = needEls[k];
    const bar = d.querySelector('.nb > div');
    bar.style.width = `${v}%`;
    bar.style.background = needColor(v);
    d.classList.toggle('low', v < 20);
  }
  const [m, css, hex] = moodInfo();
  moodEl.textContent = m;
  moodEl.style.color = css;
  plumbobMini.style.background = '#' + hex.toString(16).padStart(6, '0');
  plumbob.material.color.setHex(hex);
  plumbob.material.emissive.setHex(hex).multiplyScalar(0.5);
  const h = Math.floor(state.time / 60) % 24;
  const mm = Math.floor(state.time % 60);
  clockEl.textContent = `Day ${state.day} · ${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// goals
const goalChapter = document.getElementById('goalChapter');
const goalSub = document.getElementById('goalSub');
const goalList = document.getElementById('goalList');
function updateGoals() {
  const i = state.chapter;
  const ch = CHAPTERS[i];
  goalChapter.textContent = ch.title;
  goalSub.textContent = ch.sub;
  const prog = Math.floor(state.progress[i]);
  const rows = [];
  rows.push(`<div class="goal-row ${prog >= 100 ? 'done' : ''}"><span class="chk">${prog >= 100 ? '✓' : ''}</span><span class="gt">${ch.milestone}</span><span>${prog}%</span></div><div class="goal-bar"><div style="width:${prog}%"></div></div>`);
  if (i < 3) {
    const b = state.stepsBuilt[i];
    rows.push(`<div class="goal-row ${b >= ch.steps ? 'done' : ''}"><span class="chk">${b >= ch.steps ? '✓' : ''}</span><span class="gt">Turn setbacks into lessons</span><span>${b}/${ch.steps}</span></div>`);
    rows.push(`<div class="goal-row"><span class="chk"></span><span class="gt">Climb to the next level</span></div>`);
  } else {
    rows.push(`<div class="goal-row ${state.newcomer?.helped ? 'done' : ''}"><span class="chk">${state.newcomer?.helped ? '✓' : ''}</span><span class="gt">${state.progress[3] >= 100 ? 'Someone is climbing behind you…' : '???'}</span></div>`);
  }
  goalList.innerHTML = rows.join('');
}

// queue UI
const queueEl = document.getElementById('queue');
function updateQueueUI() {
  const items = [];
  if (P.action) items.push({ ...P.action, current: true });
  else if (P.pendingAction) items.push({ ...P.pendingAction, current: true });
  for (const q of state.queue) items.push(q);
  queueEl.innerHTML = '';
  items.forEach((it, idx) => {
    const d = document.createElement('div');
    d.className = 'q-item' + (it.current ? ' current' : '');
    let ring = '';
    if (it.current && P.action) {
      const pr = P.action.progressFrac ?? 0;
      const C = 2 * Math.PI * 33;
      ring = `<svg viewBox="0 0 76 76" width="76" height="76"><circle cx="38" cy="38" r="33" fill="none" stroke="#37d67a" stroke-width="5" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pr)}" stroke-linecap="round"/></svg>`;
    }
    d.innerHTML = `${ring}<span>${it.icon}</span><span class="x">✕</span>${it.current ? `<span class="ql">${it.label}</span>` : ''}`;
    d.title = it.label + ' (click to cancel)';
    d.onclick = () => {
      sfx.click();
      if (it.current) cancelAction(true);
      else state.queue.splice(idx - 1, 1);
      updateQueueUI();
    };
    queueEl.appendChild(d);
  });
}

// pie menu
const pieEl = document.getElementById('pie');
let pieOpen = null;
function openPie(ent, x, y) {
  const list = ent.actions();
  pieEl.innerHTML = '';
  pieEl.classList.remove('hidden');
  const cx = Math.min(Math.max(x, 140), innerWidth - 140);
  const cy = Math.min(Math.max(y, 110), innerHeight - 110);
  const title = document.createElement('div');
  title.className = 'pie-title';
  title.textContent = ent.name;
  title.style.left = cx + 'px';
  title.style.top = cy + 'px';
  pieEl.appendChild(title);
  const n = list.length;
  const R = n <= 2 ? 72 : 88;
  list.forEach((a, k) => {
    const ang = -Math.PI / 2 + (n === 1 ? 0 : (k / n) * Math.PI * 2) + (n === 2 ? 0 : 0);
    const ox = n === 2 ? 0 : Math.cos(ang) * R * 1.35;
    const oy = n === 2 ? (k === 0 ? -56 : 56) : Math.sin(ang) * R;
    const b = document.createElement('div');
    b.className = 'opt' + (a.disabled ? ' disabled' : '');
    b.style.left = cx + ox + 'px';
    b.style.top = cy + oy + 'px';
    b.style.animationDelay = k * 0.04 + 's';
    b.innerHTML = `<span>${a.icon}</span><span>${a.label}${a.disabled ? `<br><span class="why">${a.disabled}</span>` : ''}</span>`;
    b.onclick = (e) => {
      e.stopPropagation();
      if (a.disabled) {
        sfx.click();
        return;
      }
      sfx.open();
      closePie();
      queueAction(ent, a);
    };
    pieEl.appendChild(b);
  });
  pieOpen = ent;
  sfx.open();
}
function closePie() {
  pieEl.classList.add('hidden');
  pieEl.innerHTML = '';
  pieOpen = null;
}

// ======================================================================
// Actions
// ======================================================================
function queueAction(ent, a) {
  const item = { ent, label: a.label, icon: a.icon, def: a.def };
  if (!P.action && !P.pendingAction && (P.mode === 'free' || P.mode === 'moving')) {
    goDo(item);
  } else if (state.queue.length < 3) {
    state.queue.push(item);
  }
  updateQueueUI();
}

function goDo(item) {
  if (item.def.climb !== undefined) {
    P.pendingAction = item;
    setMoveTarget(item.ent.stand);
    return;
  }
  P.pendingAction = item;
  const stand = item.ent.kind === 'rock' ? approachPoint(item.ent.pos, 0.75) : item.ent.stand;
  setMoveTarget(stand);
}

function approachPoint(target, dist) {
  const d = P.pos.clone().sub(target);
  d.y = 0;
  if (d.lengthSq() < 0.001) d.set(1, 0, 0);
  d.normalize().multiplyScalar(dist);
  return target.clone().add(d).setY(islands[P.island].y);
}

function setMoveTarget(p) {
  P.target = p.clone();
  P.mode = 'moving';
  const dist = P.pos.distanceTo(p);
  P.run = dist > 5;
}

function startAction(item) {
  const def = item.def;
  P.pendingAction = null;
  if (def.climb !== undefined) {
    startClimb(def.climb);
    return;
  }
  if (def.rock) {
    if (item.ent.rock.dying || item.ent.rock.grabbed) {
      nextInQueue();
      return;
    }
    P.action = { ...item, t: 0, progressFrac: 0 };
    P.mode = 'acting';
    faceTowards(item.ent.pos);
    return;
  }
  const ent = item.ent;
  // pre-checks for work
  if (def.work) {
    const low = lowNeed();
    if (low) {
      bubble(low[1], null);
      toast(low[1], `Too drained to work. <b>${low[0]}</b> is too low.`, 'bad', 4);
      nextInQueue();
      return;
    }
  }
  P.action = { ...item, t: 0, progressFrac: 0 };
  P.mode = 'acting';
  if (def.seat) {
    P.pos.copy(def.seat.pos);
    P.yaw = def.seat.yaw;
  } else {
    P.yaw = ent.faceYaw;
  }
  player.setState(def.state || 'idle', { seat: def.seat?.seatH ?? 0 });
  player.lyingTarget = def.lie ? 1 : 0;
  if (def.bubble) bubble(def.bubble);
  if (def.say) speech(() => P.pos, def.say, 1.8, 2.4);
  updateQueueUI();
}

function lowNeed() {
  const n = state.needs;
  if (n.energy < 8) return ['Energy', '😴'];
  if (n.coffee < 6) return ['Coffee', '☕'];
  if (n.focus < 8) return ['Focus', '😵‍💫'];
  return null;
}

function finishAction(completed = true) {
  const a = P.action;
  if (!a) return;
  P.action = null;
  if (a.def.seat) P.pos.copy(a.ent.stand);
  player.lyingTarget = 0;
  player.setState('idle');
  P.mode = 'free';
  if (completed && a.def.done) a.def.done();
  updateQueueUI();
}

function cancelAction(clearQueue = false) {
  if (P.action) finishAction(false);
  P.pendingAction = null;
  if (P.mode === 'moving') P.mode = 'free';
  P.target = null;
  if (clearQueue) state.queue.length = 0;
  updateQueueUI();
}

function nextInQueue() {
  P.mode = 'free';
  updateQueueUI();
  const next = state.queue.shift();
  if (next) {
    // re-evaluate disabled state
    if (next.def.climb !== undefined || next.ent.kind === 'rock' || !next.def.disabled) goDo(next);
  }
  updateQueueUI();
}

function updateAction(dt) {
  const a = P.action;
  const def = a.def;
  a.t += dt;
  const i = a.ent.island;
  if (def.rock) {
    // pick up the rock and turn it into a lesson
    const k = Math.min(1, a.t / 1.3);
    player.setState('pickup', { k });
    a.progressFrac = k;
    if (a.t > 0.65 && !a.ent.grabbed) {
      a.ent.grabbed = true;
      convertRock(a.ent);
    }
    if (a.t >= 1.3) {
      finishAction(true);
      nextInQueue();
    }
    return;
  }
  // rates
  if (def.rates) for (const k in def.rates) addNeed(k, def.rates[k] * dt);
  if (def.work) {
    const n = state.needs;
    const eff = THREE.MathUtils.clamp(((n.energy + n.coffee + n.focus) / 300) * 1.25 + n.confidence / 400, 0.35, 1.35);
    const rate = (DEBUG_FAST ? 25 : 3.4) * def.work * eff;
    state.progress[i] = Math.min(def.cap || 100, state.progress[i] + rate * dt);
    a.progressFrac = state.progress[i] / 100;
    if (Math.random() < dt * 0.15) bubble(def.bubble);
    const low = lowNeed();
    if (low) {
      bubble(low[1], null);
      toast(low[1], `Had to stop. <b>${low[0]}</b> is too low.`, 'bad', 4);
      finishAction(false);
      nextInQueue();
      return;
    }
    if (state.progress[i] >= 100) {
      finishAction(true);
      milestoneDone(i);
      return;
    }
    if (def.cap && state.progress[i] >= def.cap) {
      finishAction(true);
      bubble('🤷', null);
      toast('📺', CHAPTERS[i].alt.capMsg, '', 5);
      nextInQueue();
      return;
    }
    updateGoals();
  } else if (def.duration) {
    a.progressFrac = Math.min(1, a.t / def.duration);
  } else if (def.until) {
    a.progressFrac = def.rates?.energy ? state.needs.energy / 100 : 0;
  }
  if ((def.duration && a.t >= def.duration) || (def.until && def.until() && !def.work)) {
    finishAction(true);
    nextInQueue();
  }
  if (def.state === 'sleep' && Math.random() < dt * 0.3) sfx.snore();
}

function addNeed(k, v) {
  state.needs[k] = THREE.MathUtils.clamp(state.needs[k] + v, 0, 100);
}

function faceTowards(p) {
  P.yaw = Math.atan2(p.x - P.pos.x, p.z - P.pos.z);
}

// ======================================================================
// Rocks
// ======================================================================
const ringGeo = new THREE.RingGeometry(0.82, 1, 32);
function throwRock(critic) {
  const i = critic.island;
  const ch = CHAPTERS[i];
  const isl = islands[i];
  const boulder = Math.random() < ch.boulderChance;
  const radius = boulder ? 1.35 : 0.9;
  // target: player's predicted position with a little jitter
  const lead = P.vel.clone().multiplyScalar(ch.flight * 0.45);
  const to = P.pos.clone().add(lead);
  to.x += (Math.random() - 0.5) * 1.2;
  to.z += (Math.random() - 0.5) * 1.2;
  const off = to.clone().sub(isl.center).setY(0);
  if (off.length() > isl.r - 1) off.setLength(isl.r - 1);
  to.copy(isl.center).add(off);
  to.y = isl.y;
  const [text, lesson] = ch.rocks[Math.floor(Math.random() * ch.rocks.length)];
  const from = critic.fig.position.clone();
  from.y += 1.6;
  const mesh = makeStone(boulder ? 0.55 : 0.32, boulder ? 0x7d7470 : 0x8d8a86);
  mesh.position.copy(from);
  scene.add(mesh);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(to).setY(to.y + 0.04);
  ring.scale.setScalar(0.2);
  scene.add(ring);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.18, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2;
  fill.position.copy(ring.position).setY(to.y + 0.035);
  fill.scale.setScalar(radius);
  scene.add(fill);
  const el = document.createElement('div');
  el.className = 'rock-lbl flying';
  el.textContent = text;
  const rock = { mesh, ring, fill, from, to, t: 0, dur: ch.flight * (boulder ? 1.15 : 1), text, lesson, landed: false, radius, boulder, island: i, pos: to.clone(), spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, 0) };
  rock.label = addLabel(el, () => rock.mesh.position, boulder ? 0.9 : 0.6);
  rocks.push(rock);
  speech(() => critic.fig.position, /[?!.]$/.test(text) ? text : text + '!', 1.6, 2.1);
  babble(3, 0.7);
  sfx.whoosh();
  if (!state.tutorial.rockSeen) {
    state.tutorial.rockSeen = true;
    toast('⚠️', '<b>Incoming setback!</b> Step out of the <b>red circle</b> before it lands. WASD is fastest.', 'bad', 7);
  }
}

function updateRocks(dt) {
  for (let k = rocks.length - 1; k >= 0; k--) {
    const r = rocks[k];
    if (r.landed) {
      if (r.dying) {
        r.dieT += dt;
        r.mesh.scale.setScalar(Math.max(0.01, 1 - r.dieT * 2));
        if (r.dieT > 0.5) {
          scene.remove(r.mesh);
          rocks.splice(k, 1);
        }
      }
      continue;
    }
    r.t += dt;
    const f = Math.min(1, r.t / r.dur);
    const h = 3.5 + r.from.distanceTo(r.to) * 0.15;
    r.mesh.position.lerpVectors(r.from, r.to, f);
    r.mesh.position.y += Math.sin(f * Math.PI) * h + (r.boulder ? 0.35 : 0.2) * f;
    r.mesh.rotation.x += r.spin.x * dt;
    r.mesh.rotation.y += r.spin.y * dt;
    r.ring.scale.setScalar(0.2 + f * (r.radius - 0.2));
    r.ring.material.opacity = 0.5 + Math.sin(r.t * 20) * 0.3;
    if (f >= 1) landRock(r);
  }
}

function landRock(r) {
  r.landed = true;
  scene.remove(r.ring);
  scene.remove(r.fill);
  r.mesh.position.copy(r.to);
  r.mesh.position.y += r.boulder ? 0.35 : 0.2;
  sfx.thud();
  shake = Math.max(shake, r.boulder ? 0.35 : 0.18);
  const d = Math.hypot(P.pos.x - r.to.x, P.pos.z - r.to.z);
  if (d < r.radius && P.island === r.island && P.mode !== 'climbing' && P.mode !== 'cutscene') {
    getHit(r);
  } else if (d < r.radius + 1.8 && P.island === r.island) {
    state.stats.dodged++;
    addNeed('confidence', 1.5);
    floatText(P.pos, 'Dodged!', '#7dffb0');
    if (Math.random() < 0.35) bubble('😎');
  }
  // become a clickable landed rock
  r.label.el.classList.remove('flying');
  r.label.el.textContent = '🪨 ' + r.text;
  const ent = {
    name: `"${r.text}"`,
    kind: 'rock',
    group: r.mesh,
    island: r.island,
    pos: r.to.clone(),
    rock: r,
    actions: () => {
      const i = r.island;
      const full = state.stepsBuilt[i] >= CHAPTERS[i].steps;
      return [
        act('Turn into a lesson', '💡', { rock: true }),
        act('Kick it away', '🦶', { rock: true, kick: true, disabled: null }),
      ].map((a) => (full && !a.def.kick ? { ...a, label: 'Learn from it', icon: '💡' } : a));
    },
  };
  r.ent = ent;
  r.label.el.onclick = (e) => {
    e.stopPropagation();
    openPie(ent, e.clientX, e.clientY);
  };
  registerEntity(ent);
  if (!state.tutorial.landSeen && state.chapter === 0) {
    state.tutorial.landSeen = true;
    setTimeout(() => toast('💡', 'Setbacks stay where they land. <b>Click one</b> and choose <b>Turn into a lesson</b>. Each lesson becomes a stone step toward the next level.', 'good', 9), 900);
  }
  // cap landed rocks
  const landed = rocks.filter((x) => x.landed && !x.dying && !x.grabbed);
  if (landed.length > 7) crumble(landed[0]);
}

function crumble(r) {
  r.dying = true;
  r.dieT = 0;
  removeEntity(r.ent);
  removeLabel(r.label);
}

function removeEntity(ent) {
  if (!ent) return;
  const idx = entities.indexOf(ent);
  if (idx >= 0) entities.splice(idx, 1);
  for (let k = pickables.length - 1; k >= 0; k--) if (pickables[k].userData.entity === ent) pickables.splice(k, 1);
  if (pieOpen === ent) closePie();
  state.queue = state.queue.filter((q) => q.ent !== ent);
}

function getHit(r) {
  state.stats.hits++;
  sfx.hit();
  shake = 0.5;
  addNeed('confidence', r.boulder ? -18 : -11);
  addNeed('focus', -6);
  floatText(P.pos, r.boulder ? '-18 Confidence' : '-11 Confidence', '#ffb3b3');
  if (P.action) finishAction(false);
  P.pendingAction = null;
  P.target = null;
  state.queue.length = 0;
  P.mode = 'stunned';
  P.stunT = 1.0;
  player.setState('hit');
  bubble('😖', simlish(1), 'thought', 1.8);
  updateQueueUI();
}

function convertRock(ent) {
  const r = ent.rock;
  const def = P.action.def;
  removeEntity(ent);
  removeLabel(r.label);
  if (def.kick) {
    r.dying = true;
    r.dieT = 0;
    addNeed('confidence', 1);
    bubble('🦶', 'Bye.');
    return;
  }
  const i = r.island;
  state.stats.lessons++;
  addNeed('confidence', 7);
  sfx.chime();
  if (state.stepsBuilt[i] < CHAPTERS[i].steps) {
    const slot = stairs[i].slots[state.stepsBuilt[i]];
    state.stepsBuilt[i]++;
    flyToStep(r, slot, i);
    toast('💡', `<b>"${r.text}"</b> became a lesson:<br>${r.lesson}`, 'good', 7);
    if (state.stepsBuilt[i] === CHAPTERS[i].steps) setTimeout(() => checkClimbReady(i), 1600);
  } else {
    r.dying = true;
    r.dieT = 0;
    toast('📖', `Lesson kept: ${r.lesson}`, 'good', 5);
  }
  bubble('💡', simlish(2));
  updateGoals();
}

const flying = [];
function flyToStep(r, slot, i) {
  r.grabbed = true;
  flying.push({ r, from: r.mesh.position.clone(), to: slot.clone(), t: 0, i });
}
function updateFlying(dt) {
  for (let k = flying.length - 1; k >= 0; k--) {
    const f = flying[k];
    f.t += dt;
    const u = Math.min(1, f.t / 1.2);
    f.r.mesh.position.lerpVectors(f.from, f.to, u);
    f.r.mesh.position.y += Math.sin(u * Math.PI) * 4;
    f.r.mesh.rotation.y += dt * 8;
    if (u >= 1) {
      scene.remove(f.r.mesh);
      rocks.splice(rocks.indexOf(f.r), 1);
      const st = stairs[f.i];
      const step = makeStep(0xbdb5a8);
      step.position.copy(f.to);
      step.rotation.y = st.yaw;
      step.scale.setScalar(0.01);
      step.userData.grow = 0;
      st.group.add(step);
      st.steps.push(step);
      const gi = st.steps.length - 1;
      if (st.ghosts[gi]) st.ghosts[gi].visible = false;
      step.traverse((o) => {
        if (o.isMesh) {
          o.userData.entity = st.entity;
          pickables.push(o);
        }
      });
      sfx.stone();
      shake = Math.max(shake, 0.12);
      flying.splice(k, 1);
    }
  }
  for (const st of stairs) {
    if (!st) continue;
    for (const s of st.steps) {
      if (s.userData.grow < 1) {
        s.userData.grow = Math.min(1, s.userData.grow + 0.016 * 4);
        const g = s.userData.grow;
        s.scale.setScalar(Math.max(0.01, g < 0.6 ? g / 0.6 * 1.15 : 1.15 - (g - 0.6) / 0.4 * 0.15));
      }
    }
  }
}

function milestoneDone(i) {
  sfx.fanfare();
  addNeed('confidence', 20);
  player.setState('cheer');
  P.mode = 'cutscene';
  P.stunT = 2.4;
  bubble('🎉', simlish(2), 'thought', 2.4);
  toast('🏆', `<b>Milestone:</b> ${CHAPTERS[i].milestone}!`, 'gold', 6);
  updateGoals();
  if (i === 3) {
    setTimeout(spawnNewcomer, 3500);
  } else setTimeout(() => checkClimbReady(i), 2600);
}

function checkClimbReady(i) {
  if (state.chapter !== i) return;
  if (state.stepsBuilt[i] >= CHAPTERS[i].steps && state.progress[i] >= 100) {
    toast('🧗', '<b>The way up is open.</b> Click the stairs and choose <b>Climb up</b>.', 'gold', 8);
    stairs[i].ready = true;
  } else if (state.stepsBuilt[i] >= CHAPTERS[i].steps) {
    toast('🪜', `The stairs are built. Now <b>${CHAPTERS[i].milestone.toLowerCase()}</b> at your desk.`, '', 6);
  } else if (state.progress[i] >= 100) {
    const need = CHAPTERS[i].steps - state.stepsBuilt[i];
    toast('🪨', `Milestone done. You still need <b>${need}</b> more lesson stone${need > 1 ? 's' : ''}. Funny how you now need the setbacks.`, '', 7);
  }
}

// ======================================================================
// Climbing & chapters
// ======================================================================
function startClimb(i) {
  const st = stairs[i];
  P.mode = 'climbing';
  P.climb = { i, t: 0, from: st.A.clone(), to: st.B.clone(), y0: islands[i].y, y1: islands[i + 1].y };
  P.climb.dur = P.climb.from.distanceTo(P.climb.to) / 2.4;
  P.yaw = st.yaw;
  player.setState('walk');
  state.queue.length = 0;
  updateQueueUI();
  // critics fade, leftover rocks crumble
  for (const c of critics) if (c.island === i) c.active = false;
  for (const r of rocks) {
    if (r.island !== i) continue;
    if (r.landed && !r.dying && !r.grabbed) crumble(r);
    else if (!r.landed) {
      scene.remove(r.ring, r.fill);
      r.landed = true;
      r.dying = true;
      r.dieT = 0;
      removeLabel(r.label);
    }
  }
  toast('🌤️', 'As you climb, the doubts get quieter.', '', 5);
}

function updateClimb(dt) {
  const c = P.climb;
  c.t += dt;
  const f = Math.min(1, c.t / c.dur);
  P.pos.lerpVectors(c.from, c.to, f);
  P.pos.y = THREE.MathUtils.lerp(c.y0, c.y1, f);
  if (f >= 1) {
    P.mode = 'free';
    P.island = c.i + 1;
    P.climb = null;
    player.setState('idle');
    enterChapter(c.i + 1);
  }
}

function enterChapter(i) {
  state.chapter = i;
  P.island = i;
  const ch = CHAPTERS[i];
  sfx.fanfare();
  toast('⭐', `<b>${ch.title}</b><br>${ch.sub}`, 'gold', 7);
  if (i < 3) {
    spawnCritics(i);
    setTimeout(() => toast('🎯', `Goal: <b>${ch.milestone.toLowerCase()}</b> and build <b>${ch.steps}</b> lesson stones.${i > 0 ? ' The setbacks get tougher up here.' : ''}`, '', 8), i === 0 ? 22000 : 1800);
    state.throwClock = 6;
  } else {
    setTimeout(() => toast('🌄', 'No setbacks up here. Just you, a desk and the view. <b>Publish your portfolio</b>.', 'good', 8), 1500);
  }
  updateGoals();
}

// newcomer & ending
function spawnNewcomer() {
  const st = stairs[2];
  const fig = makeFigure(0x4f8cff, 0xf1c27d);
  fig.userData.brows.forEach((b) => (b.visible = false));
  const p = st.slots[st.slots.length - 2].clone();
  p.y += 0.18;
  fig.position.copy(p);
  fig.rotation.y = st.yaw;
  scene.add(fig);
  const ent = {
    name: 'A newcomer',
    kind: 'newcomer',
    group: fig,
    island: 3,
    stand: st.B.clone().addScaledVector(st.dir, 0.6),
    faceYaw: st.yaw + Math.PI,
    actions: () => [
      act('Keep climbing alone', '🚶', { disabled: 'Someone once helped you too.' }),
      act('Offer a hand', '🤝', { state: 'offer', duration: 2.4, done: helpNewcomer }),
    ],
  };
  registerEntity(ent);
  state.newcomer = { fig, ent, helped: false, t: 0 };
  speech(() => fig.position, 'Is it worth it?', 3, 2.0);
  toast('👤', 'Someone is climbing the steps you built. They look tired. <b>Click them</b>.', 'gold', 10);
  updateGoals();
}

function helpNewcomer() {
  const n = state.newcomer;
  n.helped = true;
  removeEntity(n.ent);
  n.climbing = true;
  n.from = n.fig.position.clone();
  n.to = stairs[2].B.clone().addScaledVector(stairs[2].dir, 1.2).add(new THREE.Vector3(0.8, 0, 0));
  n.to.y = islands[3].y;
  updateGoals();
  speech(() => n.fig.position, 'Thank you!', 2.5, 2.0);
  setTimeout(() => {
    P.mode = 'cutscene';
    player.setState('cheer');
    bubble('💚', simlish(2), 'thought', 3);
    sfx.fanfare();
  }, 1500);
  setTimeout(showEnding, 4200);
}

function showEnding() {
  state.ended = true;
  const s = state.stats;
  document.getElementById('endStory').innerHTML =
    'You could have kept those lessons to yourself. Instead, you passed them on.<br>This is my story in tech, and it is still being written.';
  document.getElementById('endStats').innerHTML = `
    <div><b>${s.lessons}</b>lessons learned</div>
    <div><b>${s.dodged}</b>rocks dodged</div>
    <div><b>${s.hits}</b>hits taken</div>
    <div><b>${state.day}</b>${state.day === 1 ? 'day' : 'days'}</div>
    <div><b>${s.spirals}</b>doubt spiral${s.spirals === 1 ? '' : 's'}</div>
    <div><b>1</b>person helped</div>`;
  document.getElementById('ending').classList.remove('hidden');
}

// ======================================================================
// Input
// ======================================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || !state.started || state.ended) return;
  if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) return;
  downAt = null;
  handleClick(e.clientX, e.clientY);
});
renderer.domElement.addEventListener(
  'wheel',
  (e) => {
    zoom = THREE.MathUtils.clamp(zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.6, 2.6);
    resize();
  },
  { passive: true }
);

function handleClick(x, y) {
  if (pieOpen) {
    closePie();
    return;
  }
  mouse.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  for (const h of hits) {
    const ent = h.object.userData.entity;
    if (!ent) continue;
    if (ent.kind === 'critic' || ent.kind === 'newcomer' || ent.island === P.island || ent.kind === 'stairs') {
      if (ent.kind === 'stairs' && ent.island !== P.island) continue;
      openPie(ent, x, y);
      return;
    }
  }
  // floor
  const floor = islands[P.island].group.userData.pick;
  const fh = raycaster.intersectObject(floor, false)[0];
  if (fh && canControl()) {
    sfx.click();
    cancelAction(true);
    setMoveTarget(fh.point.clone().setY(islands[P.island].y));
    spawnClickMarker(fh.point);
  }
}

function canControl() {
  return ['free', 'moving', 'acting'].includes(P.mode);
}

const marker = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.35, 24), new THREE.MeshBasicMaterial({ color: 0x37d67a, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
marker.rotation.x = -Math.PI / 2;
marker.visible = false;
scene.add(marker);
let markerT = 0;
function spawnClickMarker(p) {
  marker.position.copy(p).setY(p.y + 0.05);
  marker.visible = true;
  markerT = 0;
}

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    keys.add(k);
    e.preventDefault();
  }
  if (!state.started) return;
  if (k === ' ') {
    setSpeed(state.speed === 0 ? 1 : 0);
    e.preventDefault();
  }
  if (k === '1' || k === '2' || k === '3') setSpeed(+k);
  if (k === 'q') camAngleTarget += Math.PI / 4;
  if (k === 'e') camAngleTarget -= Math.PI / 4;
  if (k === 'escape') closePie();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

document.querySelectorAll('#controls [data-speed]').forEach((b) => (b.onclick = () => setSpeed(+b.dataset.speed)));
function setSpeed(s) {
  state.speed = s;
  document.querySelectorAll('#controls [data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === s));
  sfx.click();
}
document.getElementById('mute').onclick = (e) => {
  e.currentTarget.textContent = toggleMute() ? '🔇' : '🔊';
};
document.getElementById('helpBtn').onclick = () => {
  toast('❓', 'Click the floor or use <b>WASD</b> to move. Click objects for actions. Dodge red circles. Click landed setbacks to turn them into lesson stones. <b>Q/E</b> rotate, scroll to zoom.', '', 9);
};
document.getElementById('againBtn').onclick = () => location.reload();

// ======================================================================
// Simulation step
// ======================================================================
const _dir = new THREE.Vector3();
function simulate(dt) {
  // clock
  state.time += dt * 4;
  if (state.time >= 24 * 60) {
    state.time -= 24 * 60;
    state.day++;
  }
  // base needs decay
  const busy = P.action?.def;
  if (P.mode !== 'cutscene' && state.chapter < 4) {
    if (!busy || !busy.rates || busy.rates.energy === undefined) addNeed('energy', -0.45 * dt);
    if (!busy || busy.state !== 'drink') addNeed('coffee', -0.7 * dt);
    if (!busy || !busy.rates || busy.rates.focus === undefined) addNeed('focus', -0.3 * dt * (state.needs.coffee < 20 ? 2 : 1));
  }

  // stun / spiral / passedout timers
  if (P.mode === 'stunned' || P.mode === 'cutscene') {
    P.stunT -= dt;
    if (P.stunT <= 0 && !state.ended && !(state.newcomer?.helped)) {
      P.mode = 'free';
      player.setState('idle');
      nextInQueue();
    }
  } else if (P.mode === 'spiral') {
    P.stunT -= dt;
    if (P.stunT <= 0) {
      P.mode = 'free';
      state.needs.confidence = 30;
      player.setState('idle');
      bubble('💪', 'Again.');
      toast('💪', 'You got back up. That is the whole trick.', 'good', 5);
    }
  } else if (P.mode === 'passedout') {
    P.stunT -= dt;
    addNeed('energy', 5 * dt);
    if (P.stunT <= 0) {
      P.mode = 'free';
      player.lyingTarget = 0;
      player.setState('idle');
    }
  }

  // collapse conditions
  if (state.needs.confidence <= 0 && ['free', 'moving', 'acting'].includes(P.mode)) {
    if (P.action) finishAction(false);
    cancelAction(true);
    P.mode = 'spiral';
    P.stunT = 5;
    state.stats.spirals++;
    player.setState('sad');
    sfx.sad();
    bubble('🌧️', simlish(1), 'thought', 4);
    toast('🌧️', '<b>Doubt spiral.</b> Too many rocks landed. Everyone has days like this.', 'bad', 6);
  } else if (state.needs.energy <= 0 && ['free', 'moving', 'acting'].includes(P.mode)) {
    cancelAction(true);
    P.mode = 'passedout';
    P.stunT = 5;
    player.setState('sleep');
    player.lyingTarget = 1;
    bubble('💤', null, 'thought', 4);
    toast('😵', '<b>Passed out from exhaustion.</b> Sleep is part of the job.', 'bad', 6);
  }

  // movement
  P.vel.set(0, 0, 0);
  let kx = 0;
  let kz = 0;
  if (keys.has('w') || keys.has('arrowup')) kz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) kz += 1;
  if (keys.has('a') || keys.has('arrowleft')) kx -= 1;
  if (keys.has('d') || keys.has('arrowright')) kx += 1;
  if ((kx || kz) && canControl()) {
    if (P.action || P.pendingAction || state.queue.length) cancelAction(true);
    // camera-relative
    const fwd = new THREE.Vector3(-Math.cos(camAngle), 0, -Math.sin(camAngle));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    _dir.set(0, 0, 0).addScaledVector(fwd, -kz).addScaledVector(right, kx).normalize();
    moveBy(_dir, 5.2, dt);
    P.mode = 'free';
    P.target = null;
    player.setState('run');
  } else if (P.mode === 'moving' && P.target) {
    _dir.copy(P.target).sub(P.pos).setY(0);
    const d = _dir.length();
    if (d < 0.12) {
      P.pos.x = P.target.x;
      P.pos.z = P.target.z;
      P.target = null;
      P.mode = 'free';
      player.setState('idle');
      if (P.pendingAction) startAction(P.pendingAction);
      else nextInQueue();
    } else {
      _dir.normalize();
      const sp = P.run ? 4.6 : 2.6;
      const before = P.pos.clone();
      moveBy(_dir, Math.min(sp, d / dt), dt, P.pendingAction?.ent);
      const moved = before.distanceTo(P.pos);
      P.stuckT = moved < sp * dt * 0.25 ? (P.stuckT || 0) + dt : 0;
      if (P.stuckT > 0.6) {
        P.stuckT = 0;
        P.target = null;
        P.mode = 'free';
        player.setState('idle');
        if (P.pendingAction) startAction(P.pendingAction);
      }
      player.setState(P.run ? 'run' : 'walk');
    }
  } else if (P.mode === 'acting' && P.action) {
    updateAction(dt);
  } else if (P.mode === 'climbing') {
    updateClimb(dt);
  } else if (P.mode === 'free') {
    if (player.state === 'walk' || player.state === 'run') player.setState('idle');
    if (!P.action && !P.pendingAction && state.queue.length) nextInQueue();
    // autonomy: complain about low needs
    if (Math.random() < dt * 0.12) {
      const n = state.needs;
      if (n.energy < 25) bubble('😴');
      else if (n.coffee < 25) bubble('☕');
      else if (n.focus < 25) bubble('😵‍💫');
      else if (n.confidence < 25) bubble('🌧️');
    }
  }

  // critics
  updateCritics(dt);
  updateRocks(dt);
  updateFlying(dt);
  updateNewcomer(dt);
}

function moveBy(dir, speed, dt, targetEnt) {
  const step = dir.clone().multiplyScalar(speed * dt);
  const next = P.pos.clone().add(step);
  // colliders
  for (const c of colliders) {
    if (c.island !== P.island) continue;
    const dx = next.x - c.pos.x;
    const dz = next.z - c.pos.z;
    const d = Math.hypot(dx, dz);
    const allow = targetEnt && targetEnt.group && targetEnt.group.position.distanceTo(c.pos) < 0.1 ? 0.3 : 0;
    const rr = c.r - allow;
    if (d < rr && d > 0.0001) {
      next.x = c.pos.x + (dx / d) * rr;
      next.z = c.pos.z + (dz / d) * rr;
    }
  }
  // island bounds
  const isl = islands[P.island];
  const off = next.clone().sub(isl.center).setY(0);
  if (off.length() > isl.r - 0.6) off.setLength(isl.r - 0.6);
  next.copy(isl.center).add(off);
  next.y = isl.y;
  P.vel.copy(next).sub(P.pos).divideScalar(Math.max(dt, 1e-4));
  P.pos.copy(next);
  if (dir.lengthSq() > 0) P.yaw = lerpAngle(P.yaw, Math.atan2(dir.x, dir.z), Math.min(1, dt * 14));
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function updateCritics(dt) {
  const i = state.chapter;
  const ch = CHAPTERS[i];
  for (const c of critics) {
    c.bob += dt;
    c.fig.position.y = c.pos.y + Math.sin(c.bob * 2) * 0.05;
    if (!c.active) {
      c.fig.scale.lerp(new THREE.Vector3(0.6, 0.6, 0.6), dt);
      c.fig.userData.armPivot.rotation.x *= 0.9;
      continue;
    }
    const yaw = Math.atan2(P.pos.x - c.fig.position.x, P.pos.z - c.fig.position.z);
    c.fig.rotation.y = lerpAngle(c.fig.rotation.y, yaw, Math.min(1, dt * 5));
    if (c.confused > 0) {
      c.confused -= dt;
      c.fig.rotation.z = Math.sin(c.confused * 6) * 0.1;
      continue;
    }
    c.fig.rotation.z = 0;
    if (c.island !== i || P.island !== i || P.mode === 'climbing' || state.ended) continue;
    if (c.throwT >= 0) {
      c.throwT += dt;
      const arm = c.fig.userData.armPivot;
      if (c.throwT < 0.45) arm.rotation.x = -2.6 * (c.throwT / 0.45);
      else arm.rotation.x = THREE.MathUtils.lerp(-2.6, 0.8, Math.min(1, (c.throwT - 0.45) / 0.15));
      if (c.throwT >= 0.5 && !c.thrown) {
        c.thrown = true;
        throwRock(c);
      }
      if (c.throwT > 0.9) {
        c.throwT = -1;
        arm.rotation.x = 0;
      }
    } else {
      arm0(c);
    }
  }
  // global pacing: one critic at a time
  state.throwClock = (state.throwClock ?? 4) - dt;
  if (i < 3 && state.throwClock <= 0 && P.island === i && P.mode !== 'climbing' && !state.ended) {
    const active = critics.filter((c) => c.island === i && c.active && c.throwT < 0 && c.confused <= 0);
    const inFlight = rocks.filter((r) => !r.landed).length;
    if (active.length && inFlight < 3) {
      const c = active[Math.floor(Math.random() * active.length)];
      c.throwT = 0;
      c.thrown = false;
    }
    // easier when struggling
    const ease = state.needs.confidence < 25 ? 1.6 : 1;
    state.throwClock = ch.interval * ease * (0.7 + Math.random() * 0.6);
  }
}
function arm0(c) {
  c.fig.userData.armPivot.rotation.x *= 0.9;
}

function updateNewcomer(dt) {
  const n = state.newcomer;
  if (!n) return;
  n.t += dt;
  if (n.climbing) {
    n.ct = (n.ct || 0) + dt;
    const f = Math.min(1, n.ct / 1.4);
    n.fig.position.lerpVectors(n.from, n.to, f);
    n.fig.position.y += Math.sin(f * Math.PI) * 0.4;
    if (f >= 1) {
      n.fig.rotation.y = Math.atan2(P.pos.x - n.fig.position.x, P.pos.z - n.fig.position.z);
      n.fig.position.y = n.to.y + Math.abs(Math.sin(n.t * 7)) * 0.15;
      n.fig.userData.armPivot.rotation.x = -2.8;
      n.fig.userData.armPivotL.rotation.x = -2.8;
    }
  } else {
    n.fig.userData.armPivot.rotation.x = -0.4 + Math.sin(n.t * 2) * 0.2;
  }
}

// ======================================================================
// Render loop
// ======================================================================
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const rawDt = Math.min(DT_CAP, clock.getDelta());
  const dt = rawDt * state.speed;
  if (state.started && dt > 0) simulate(dt);

  // character transform
  player.root.position.copy(P.pos);
  player.root.rotation.y = P.yaw;
  if (dt > 0 || !state.started) player.update(state.started ? dt : rawDt);
  plumbob.position.set(P.pos.x, P.pos.y + 2.25 + Math.sin(performance.now() / 500) * 0.05, P.pos.z);
  if (player.lyingTarget > 0.5) plumbob.position.y = P.pos.y + 1.4;
  plumbob.rotation.y += rawDt * 2;

  // camera follow
  camAngle += (camAngleTarget - camAngle) * Math.min(1, rawDt * 6);
  camTarget.lerp(new THREE.Vector3(P.pos.x, P.pos.y + 0.8, P.pos.z), Math.min(1, rawDt * 4));
  const off = new THREE.Vector3(Math.cos(camAngle) * 30, 26, Math.sin(camAngle) * 30);
  camera.position.copy(camTarget).add(off);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - rawDt * 1.5);
  }
  camera.lookAt(camTarget);
  sun.position.copy(camTarget).add(new THREE.Vector3(10, 22, 6));
  sun.target.position.copy(camTarget);

  // ambience
  clouds.children.forEach((c) => {
    c.position.z += c.userData.speed * rawDt;
    if (c.position.z > 20) c.position.z = -85;
  });
  for (const isl of islands) if (isl.flag) isl.flag.userData.flag.rotation.y = Math.sin(performance.now() / 400) * 0.2;
  for (const st of stairs) {
    if (!st) continue;
    const glow = st.ready && state.chapter === st.i;
    st.ghosts.forEach((g) => (g.material.opacity = glow ? 0 : 0.18 + Math.sin(performance.now() / 300) * 0.08));
    if (glow) st.steps.forEach((s) => s.children[0].material.emissive?.setHex(0x332200));
  }
  if (marker.visible) {
    markerT += rawDt;
    marker.scale.setScalar(1 + markerT * 2);
    marker.material.opacity = 1 - markerT * 2;
    if (markerT > 0.5) marker.visible = false;
  }
  if (playerBubble) {
    playerBubbleT -= rawDt;
    if (playerBubbleT <= 0) {
      removeLabel(playerBubble);
      playerBubble = null;
    }
  }
  if (state.started) {
    uiTick += rawDt;
    if (uiTick > 0.2) {
      uiTick = 0;
      updateNeedsUI();
      if (P.action) updateQueueUI();
    }
  }
  updateLabels();
  renderer.render(scene, camera);
}
let uiTick = 0;

// ======================================================================
// Boot
// ======================================================================
for (let i = 0; i < ISLANDS.length; i++) buildIsland(i);
for (let i = 0; i < 3; i++) buildStairs(i);
// pre-build earlier chapters when starting later (debug)
for (let i = 0; i < START_CHAPTER; i++) {
  state.progress[i] = 100;
  state.stepsBuilt[i] = CHAPTERS[i].steps;
  stairs[i].slots.forEach((s, k) => {
    const step = makeStep(0xbdb5a8);
    step.position.copy(s);
    step.rotation.y = stairs[i].yaw;
    step.userData.grow = 1;
    stairs[i].group.add(step);
    stairs[i].steps.push(step);
    stairs[i].ghosts[k].visible = false;
  });
}
P.pos.copy(islands[START_CHAPTER].center);
P.pos.z += 1.5;
P.pos.x += 1.5;
P.yaw = Math.PI / 4;
camTarget.copy(P.pos);
scene.add(player.root, plumbob);
requestAnimationFrame(frame);

const startBtn = document.getElementById('startBtn');
const loadPct = document.getElementById('loadPct');
player
  .load('./me.glb', (f) => (loadPct.textContent = Math.round(f * 100) + '%'))
  .then(() => {
    startBtn.disabled = false;
    startBtn.textContent = 'Start climbing';
    window.__ready = true;
  })
  .catch((err) => {
    console.error(err);
    startBtn.textContent = 'Could not load the model';
  });

startBtn.onclick = () => {
  initAudio();
  sfx.chime();
  document.getElementById('intro').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  state.started = true;
  enterChapter(START_CHAPTER);
  if (START_CHAPTER === 0) {
    setTimeout(() => toast('👋', '<b>Welcome to Ground Zero.</b> Click the floor to walk, or use <b>WASD</b>.', '', 7), 3000);
    setTimeout(() => toast('🛏️', 'Watch your <b>needs</b> (bottom left). Click the bed, coffee or chill corner to refill them.', '', 8), 9000);
    setTimeout(() => toast('💻', 'Click the <b>desk</b> to start coding your first project.', '', 8), 15000);
    state.throwClock = 20;
  }
  updateNeedsUI();
  updateGoals();
  bubble('👋', simlish(2));
  window.__game = { state, P, entities, rocks, stairs, openPie, handleClick, camera, critics, queueAction };
};
