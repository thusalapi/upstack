import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Procedural animation for a Ready Player Me / Mixamo-style rig.
// Each pose gives per-bone rotations expressed in character space (T-pose frame),
// which are converted into each bone's local frame using the parent's rest orientation.

const BONES = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm',
  'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg',
];
// child used to measure each aimed bone's rest direction
const AIM_CHILD = {
  LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot',
};
// frame each aimed direction is expressed in (so arms follow the chest, legs follow the hips)
const AIM_FRAME = {
  LeftArm: 'Spine2', LeftForeArm: 'Spine2', RightArm: 'Spine2', RightForeArm: 'Spine2',
  LeftUpLeg: 'Hips', LeftLeg: 'Hips', RightUpLeg: 'Hips', RightLeg: 'Hips',
};

const _e = new THREE.Euler();
function rq(x = 0, y = 0, z = 0) {
  _e.set(x, y, z, 'XYZ');
  return new THREE.Quaternion().setFromEuler(_e);
}
// direction in character space: +X = character's left, +Y = up, +Z = forward
function v(x, y, z) {
  return new THREE.Vector3(x, y, z).normalize();
}
function lerpV(a, b, k) {
  return a.clone().lerp(b, k).normalize();
}
// leg helper: thigh angle a (forward +), knee bend b (>=0)
function leg(p, side, a, b, spread = 0) {
  p[side + 'UpLeg'] = v(spread, -Math.cos(a), Math.sin(a));
  p[side + 'Leg'] = v(spread * 0.5, -Math.cos(a - b), Math.sin(a - b));
}

export function poseFor(state, t, extra = {}) {
  const p = {};
  const s = Math.sin;
  let lift = 0;
  let lean = 0;
  // defaults: relaxed standing
  leg(p, 'Left', 0, 0, 0.04);
  leg(p, 'Right', 0, 0, -0.04);
  const relaxed = () => {
    p.LeftArm = v(0.16, -1, -0.02 + s(t * 1.6) * 0.02);
    p.LeftForeArm = v(0.08, -1, 0.18);
    p.RightArm = v(-0.16, -1, -0.02 + s(t * 1.6) * 0.02);
    p.RightForeArm = v(-0.08, -1, 0.18);
  };
  relaxed();
  const sitLegs = () => {
    leg(p, 'Left', Math.PI / 2, Math.PI / 2, 0.06);
    leg(p, 'Right', Math.PI / 2, Math.PI / 2, -0.06);
    lift = -0.45 + (extra.seat ?? 0);
  };
  switch (state) {
    case 'walk':
    case 'run': {
      const run = state === 'run';
      const w = t * (run ? 12 : 8.5);
      const sw = run ? 0.75 : 0.5;
      const kb = run ? 1.4 : 0.9;
      leg(p, 'Left', s(w) * sw, Math.max(0, s(w + 1.7)) * kb, 0.03);
      leg(p, 'Right', -s(w) * sw, Math.max(0, -s(w + 1.7)) * kb, -0.03);
      const as = run ? 0.9 : 0.5;
      p.LeftArm = v(0.15, -1, -s(w) * as);
      p.RightArm = v(-0.15, -1, s(w) * as);
      p.LeftForeArm = v(0.05, run ? -0.3 : -1, run ? 1 : 0.35 - s(w) * 0.3);
      p.RightForeArm = v(-0.05, run ? -0.3 : -1, run ? 1 : 0.35 + s(w) * 0.3);
      p.Spine = rq(run ? 0.15 : 0.04, s(w) * 0.07);
      p.Hips = rq(0, -s(w) * 0.08);
      lift = Math.abs(s(w)) * (run ? 0.06 : 0.03) - 0.02;
      break;
    }
    case 'type': {
      sitLegs();
      p.LeftArm = v(0.22, -0.8, 0.5);
      p.RightArm = v(-0.22, -0.8, 0.5);
      p.LeftForeArm = v(-0.2, 0.05 + s(t * 17) * 0.06, 1);
      p.RightForeArm = v(0.2, 0.05 + s(t * 19 + 1) * 0.06, 1);
      p.Head = rq(0.12 + s(t * 0.9) * 0.05, s(t * 0.6) * 0.1);
      p.Spine = rq(0.1);
      break;
    }
    case 'sit': {
      sitLegs();
      p.LeftForeArm = v(0.05, -0.2, 1);
      p.RightForeArm = v(-0.05, -0.2, 1);
      break;
    }
    case 'chill': {
      sitLegs();
      leg(p, 'Left', 1.3, 1.0, 0.15);
      leg(p, 'Right', 1.3, 1.0, -0.15);
      p.LeftArm = v(0.45, -0.9, -0.1);
      p.RightArm = v(-0.45, -0.9, -0.1);
      p.LeftForeArm = v(0.1, -0.4, 1);
      p.RightForeArm = v(-0.1, -0.4, 1);
      p.Spine = rq(-0.25);
      p.Head = rq(s(t * 4.4) * 0.12 - 0.05, 0, s(t * 2.2) * 0.06);
      break;
    }
    case 'sad': {
      leg(p, 'Left', 2.2, 2.6, 0.08);
      leg(p, 'Right', 2.2, 2.6, -0.08);
      lift = -0.55 + (extra.seat ?? 0);
      p.LeftArm = v(0.15, -0.5, 0.8);
      p.RightArm = v(-0.15, -0.5, 0.8);
      p.LeftForeArm = v(-0.8, 0.1, 0.5);
      p.RightForeArm = v(0.8, 0.1, 0.5);
      p.Spine = rq(0.45);
      p.Spine1 = rq(0.2);
      p.Head = rq(0.5 + s(t * 1.5) * 0.05);
      break;
    }
    case 'sleep': {
      p.LeftArm = v(0.12, -1, 0.05);
      p.RightArm = v(-0.12, -1, 0.05);
      p.LeftForeArm = v(-0.3, -0.6, 0.6);
      p.RightForeArm = v(-0.1, -1, 0.1);
      p.Head = rq(0, 0.35);
      p.Spine = rq(s(t * 1.2) * 0.025);
      leg(p, 'Left', 0.15, 0.3, 0.05);
      break;
    }
    case 'drink': {
      const phase = (t % 2.4) / 2.4;
      const up = phase < 0.55 ? Math.sin((phase / 0.55) * Math.PI) : 0;
      p.RightArm = lerpV(v(-0.25, -0.8, 0.55), v(-0.3, -0.5, 0.8), up);
      p.RightForeArm = lerpV(v(0.3, 0.6, 0.7), v(0.35, 0.9, 0.1), up);
      p.Head = rq(-up * 0.3);
      break;
    }
    case 'pickup': {
      const k = Math.sin(Math.min(1, extra.k ?? 0) * Math.PI);
      leg(p, 'Left', 1.3 * k, 2.2 * k, 0.12);
      leg(p, 'Right', 1.3 * k, 2.2 * k, -0.12);
      p.Spine = rq(0.6 * k);
      p.LeftArm = lerpV(v(0.16, -1, 0), v(0.1, -0.6, 0.8), k);
      p.RightArm = lerpV(v(-0.16, -1, 0), v(-0.1, -0.6, 0.8), k);
      p.LeftForeArm = lerpV(v(0.08, -1, 0.18), v(-0.1, -0.9, 0.4), k);
      p.RightForeArm = lerpV(v(-0.08, -1, 0.18), v(0.1, -0.9, 0.4), k);
      lift = -0.42 * k;
      break;
    }
    case 'hit': {
      p.LeftArm = v(0.5, -0.1, 0.8);
      p.RightArm = v(-0.5, -0.1, 0.8);
      p.LeftForeArm = v(-0.6, 0.8, 0.2);
      p.RightForeArm = v(0.6, 0.8, 0.2);
      p.Spine = rq(-0.3);
      p.Head = rq(0.25, 0, 0.2);
      leg(p, 'Left', 0.3, 0.4, 0.06);
      lift = -0.03;
      break;
    }
    case 'cheer': {
      const b = Math.abs(s(t * 7));
      p.LeftArm = v(0.45, 1, 0.05);
      p.RightArm = v(-0.45, 1, 0.05);
      p.LeftForeArm = v(0.2 + b * 0.15, 1, 0);
      p.RightForeArm = v(-0.2 - b * 0.15, 1, 0);
      p.Head = rq(-0.2);
      lift = b * 0.12;
      break;
    }
    case 'think': {
      p.RightArm = v(-0.15, -0.75, 0.55);
      p.RightForeArm = v(0.3, 0.9, 0.25);
      p.LeftArm = v(0.1, -0.85, 0.4);
      p.LeftForeArm = v(-0.95, 0.05, 0.3);
      p.Head = rq(-0.12, 0, 0.12);
      break;
    }
    case 'offer': {
      p.RightArm = v(-0.1, -0.45, 1);
      p.RightForeArm = v(-0.02, -0.35, 1);
      p.Spine = rq(0.4);
      p.Head = rq(0.25);
      leg(p, 'Left', -0.2, 0.2, 0.06);
      leg(p, 'Right', 0.5, 0.9, -0.06);
      lift = -0.08;
      break;
    }
    case 'wave': {
      p.RightArm = v(-0.85, 0.55, 0.1);
      p.RightForeArm = v(-0.3 + s(t * 10) * 0.45, 1, 0.1);
      p.Head = rq(0, 0, s(t * 2) * 0.08);
      break;
    }
    default: {
      p.Spine = rq(s(t * 1.6) * 0.02, 0, s(t * 0.5) * 0.015);
      p.Head = rq(s(t * 0.7) * 0.04, s(t * 0.33) * 0.25);
    }
  }
  return { bones: p, lift, lean };
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const _vd = new THREE.Vector3();

export class Character {
  constructor() {
    this.root = new THREE.Group(); // position + yaw
    this.body = new THREE.Group(); // pose-level offsets (lie down etc.)
    this.root.add(this.body);
    this.bones = {};
    this.state = 'idle';
    this.extra = {};
    this.t = 0;
    this.lyingTarget = 0;
    this.lying = 0;
  }

  async load(url, onProgress) {
    const loader = new GLTFLoader();
    const gltf = await new Promise((res, rej) =>
      loader.load(url, res, (e) => e.total && onProgress?.(e.loaded / e.total), rej)
    );
    const model = gltf.scene;
    const all = {};
    model.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
      }
      if (o.isBone && !all[o.name]) all[o.name] = o;
    });
    model.updateMatrixWorld(true);
    const inv = new THREE.Quaternion();
    model.getWorldQuaternion(inv).invert();
    const wq = (b) => { const q = new THREE.Quaternion(); b.getWorldQuaternion(q); return q.premultiply(inv); };
    const wp = (b) => { const p = new THREE.Vector3(); b.getWorldPosition(p); return model.worldToLocal(p); };
    // ordered list: every bone in the hierarchy (parents before children)
    this.order = [];
    this.info = new Map();
    const hips = all.Hips;
    hips.traverse((b) => {
      if (!b.isBone) return;
      this.order.push(b);
      const inf = { restW: wq(b), restL: b.quaternion.clone(), parentRestW: wq(b.parent), name: b.name, delta: new THREE.Quaternion() };
      if (AIM_CHILD[b.name] && all[AIM_CHILD[b.name]]) {
        inf.restDir = wp(all[AIM_CHILD[b.name]]).sub(wp(b)).normalize();
      }
      this.info.set(b, inf);
    });
    for (const n of BONES) this.bones[n] = all[n];
    this.allBones = all;
    this.model = model;
    this.body.add(model);
    return this;
  }

  setState(state, extra = {}) {
    this.state = state;
    this.extra = extra;
  }

  update(dt) {
    if (!this.order) return;
    this.t += dt;
    const { bones, lift, lean } = poseFor(this.state, this.t, this.extra);
    const k = 1 - Math.pow(0.001, dt * (this.state === 'walk' || this.state === 'run' ? 2.2 : 1.1));
    const deltas = new Map();
    for (const b of this.order) {
      const inf = this.info.get(b);
      const pd = deltas.get(b.parent) || _qa.identity().clone();
      let d;
      const tgt = bones[inf.name];
      if (tgt && tgt.isVector3 && inf.restDir) {
        const frame = this.allBones[AIM_FRAME[inf.name]];
        const fd = (frame && deltas.get(frame)) || new THREE.Quaternion();
        _vd.copy(tgt).applyQuaternion(fd);
        d = new THREE.Quaternion().setFromUnitVectors(inf.restDir, _vd);
      } else if (tgt && tgt.isQuaternion) {
        d = pd.clone().multiply(tgt);
      } else {
        d = pd.clone();
      }
      deltas.set(b, d);
      // local = (pd * parentRestW)^-1 * (d * restW)
      _qb.copy(pd).multiply(inf.parentRestW).invert();
      _qc.copy(d).multiply(inf.restW);
      _qb.multiply(_qc);
      b.quaternion.slerp(_qb, k);
    }
    this.lying += (this.lyingTarget - this.lying) * Math.min(1, dt * 4);
    this.body.position.y += (lift - this.body.position.y) * Math.min(1, dt * 10);
    this.body.rotation.x = -Math.PI / 2 * this.lying + lean;
  }
}

// Simple low-poly "person" for critics and the newcomer.
export function makeFigure(color = 0x6b6f85, headColor = 0x9a9db0) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
  const hmat = new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.7, flatShading: true });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 3, 8), mat);
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), hmat);
  head.position.y = 1.45;
  const armPivot = new THREE.Group();
  armPivot.position.set(0.32, 1.12, 0);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.45, 2, 6), mat);
  arm.position.y = -0.28;
  armPivot.add(arm);
  const armPivotL = new THREE.Group();
  armPivotL.position.set(-0.32, 1.12, 0);
  const armL = arm.clone();
  armPivotL.add(armL);
  // angry brows
  const browMat = new THREE.MeshBasicMaterial({ color: 0x222233 });
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.02), browMat);
  b1.position.set(0.08, 1.52, 0.22);
  b1.rotation.z = -0.4;
  const b2 = b1.clone();
  b2.position.x = -0.08;
  b2.rotation.z = 0.4;
  g.add(body, head, armPivot, armPivotL, b1, b2);
  g.userData = { armPivot, armPivotL, head, brows: [b1, b2], body };
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}
