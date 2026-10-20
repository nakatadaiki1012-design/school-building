import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ROOMS_RAW } from "./data.js";
import { FOOTPRINTS, OPEN_COURTS, STAIRS, WINGS, CATEGORIES, describe, SCHOOL, SITE, SITE_INFO, SITE_NOTE, AERIAL_ALIGN } from "./info.js";
import { buildFurniture, floorStyle, FLOOR_TEX } from "./furniture.js";
import { buildSite, createAerial } from "./site.js";

// ---------- 寸法（メートル） ----------
const CW = 1.5;   // 図面の1列の幅
const RH = 1.25;  // 図面の1行の奥行き
const FH = 3.6;   // 1フロアの高さ
const BAY = 3.0;  // 窓1つ分の幅
const C_MID = 36, R_MID = 35;
const X = (c) => (c - C_MID) * CW;
const Z = (r) => (r - R_MID) * RH;
const base = (f) => (f - 1) * FH;
const rectOf = (o) => ({ x0: X(o.c0), x1: X(o.c1 + 1), z0: Z(o.r0), z1: Z(o.r1 + 1) });
const key = (c, r) => c + "," + r;

// ---------- 部屋データ ----------
const ROOMS = ROOMS_RAW.map((r) => {
  const d = describe(r.name);
  return { ...r, ...d, kind: "room" };
});
STAIRS.forEach((s, i) => {
  s.floors.forEach((f) => {
    ROOMS.push({
      id: `F${f}-ST${i}`, name: s.name, floor: f, c0: s.c0, r0: s.r0, c1: s.c1, r1: s.r1,
      cat: "stairs", kind: "stairs",
      desc: `${s.floors.join("・")}階をつなぐ階段です。（位置は図面から読み取ったおおよその場所です）`,
    });
  });
});
ROOMS.forEach((r) => {
  const rc = rectOf(r);
  r.cx = (rc.x0 + rc.x1) / 2;
  r.cz = (rc.z0 + rc.z1) / 2;
  r.w = rc.x1 - rc.x0;
  r.d = rc.z1 - rc.z0;
  const ccx = (r.c0 + r.c1) / 2, ccr = (r.r0 + r.r1) / 2;
  r.wing = WINGS.find((w) => ccx >= w.area[0] && ccx <= w.area[2] + 1 && ccr >= w.area[1] && ccr <= w.area[3] + 1);
});
const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

// 表示用の短い名前
function shortName(r) {
  if (r.grade) return `${r.grade}-${r.cls}`;
  if (r.kind === "stairs") return "階段";
  return r.name
    .replace("みんなのトイレ", "みんなのWC")
    .replace("男子トイレ", "男子WC")
    .replace("女子トイレ", "女子WC")
    .replace("職員トイレ", "職員WC");
}

// ---------- 建物の輪郭（セルの集合） ----------
const OCC = {};
for (const f of [1, 2, 3]) {
  const m = new Map();
  for (const [c0, r0, c1, r1, style] of FOOTPRINTS[f]) {
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) if (!m.has(key(c, r))) m.set(key(c, r), style);
  }
  for (const [c0, r0, c1, r1] of OPEN_COURTS) {
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) m.delete(key(c, r));
  }
  OCC[f] = m;
}

// ---------- three.js の準備 ----------
const app = document.getElementById("viewer");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = "labels";
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = skyTexture();
scene.fog = new THREE.Fog(0xdfe9f2, 160, 420);

const persp = new THREE.PerspectiveCamera(45, 1, 0.5, 1000);
persp.position.set(55, 75, 95);
const ortho = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 500);
ortho.position.set(0, 200, 0.001);
ortho.up.set(0, 0, -1);

const controls3d = new OrbitControls(persp, labelRenderer.domElement);
controls3d.enableDamping = true;
controls3d.maxPolarAngle = Math.PI * 0.48;
controls3d.minDistance = 12;
controls3d.maxDistance = 260;
controls3d.target.set(0, 4, 0);

const controls2d = new OrbitControls(ortho, labelRenderer.domElement);
controls2d.enableRotate = false;
controls2d.screenSpacePanning = true;
controls2d.minZoom = 0.6;
controls2d.maxZoom = 8;
controls2d.enabled = false;
controls2d.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls2d.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };

scene.add(new THREE.HemisphereLight(0xdcebff, 0xa49c86, 1.0));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
sun.position.set(70, 110, 55);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -140, right: 140, top: 140, bottom: -140, near: 10, far: 400 });
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.04;
scene.add(sun);

// ---------- テクスチャ（窓・地面など）をその場で描く ----------
function canvasTex(w, h, draw, repeat = true) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function skyTexture() {
  return canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#7fb2e5");
    gr.addColorStop(0.55, "#cfe3f5");
    gr.addColorStop(1, "#eef3f6");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, false);
}

function noise(g, w, h, alpha, n = 1800) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() * 40 - 20;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 20 * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

// 1ベイ（幅3m × 高さ3.6m）分の外壁。px = 80 / m
const PX = 80;
function glass(g, x, y, w, h) {
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, "#5f7f9c");
  gr.addColorStop(0.45, "#2f4a63");
  gr.addColorStop(0.5, "#8fb0c8");
  gr.addColorStop(0.58, "#3a5772");
  gr.addColorStop(1, "#24394d");
  g.fillStyle = gr; g.fillRect(x, y, w, h);
}
function frame(g, x, y, w, h, t = 4) {
  g.strokeStyle = "#c3c8cc"; g.lineWidth = t; g.strokeRect(x, y, w, h);
}
const H = FH * PX, W = BAY * PX;
const yFromFloor = (m) => H - m * PX; // 床からの高さ(m) → canvas の y

const texSchool = canvasTex(W, H, (g) => {
  g.fillStyle = "#ece6d8"; g.fillRect(0, 0, W, H);
  noise(g, W, H, 0.08);
  // 床スラブの帯
  g.fillStyle = "#dcd5c6"; g.fillRect(0, yFromFloor(0.45), W, 0.45 * PX);
  g.fillStyle = "#cfc7b6"; g.fillRect(0, yFromFloor(0.45), W, 3);
  // 腰壁の目地
  g.fillStyle = "rgba(0,0,0,0.06)"; g.fillRect(0, yFromFloor(0.9) + 2, W, 2);
  // 窓
  const x = 0.2 * PX, w = 2.6 * PX, y = yFromFloor(3.05), h = 2.15 * PX;
  glass(g, x, y, w, h);
  g.fillStyle = "#c3c8cc";
  g.fillRect(x + w / 2 - 2, y, 4, h);           // 縦の桟
  g.fillRect(x, yFromFloor(2.45), w, 4);         // 欄間
  frame(g, x, y, w, h, 5);
  // 窓台の影
  g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x, y + h + 2, w, 4);
  // 柱
  g.fillStyle = "rgba(0,0,0,0.05)"; g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);
});

const texGymLow = canvasTex(W, H, (g) => {
  g.fillStyle = "#e3dccb"; g.fillRect(0, 0, W, H);
  noise(g, W, H, 0.08);
  g.fillStyle = "#d4ccba"; g.fillRect(0, yFromFloor(0.45), W, 0.45 * PX);
  // 地窓
  glass(g, 0.4 * PX, yFromFloor(1.0), 2.2 * PX, 0.45 * PX);
  frame(g, 0.4 * PX, yFromFloor(1.0), 2.2 * PX, 0.45 * PX, 3);
  // 縦のリブ
  g.fillStyle = "rgba(0,0,0,0.06)";
  for (let i = 0; i < 6; i++) g.fillRect(i * W / 6, 0, 2, yFromFloor(1.1));
});
const texGymHigh = canvasTex(W, H, (g) => {
  g.fillStyle = "#e3dccb"; g.fillRect(0, 0, W, H);
  noise(g, W, H, 0.08);
  const x = 0.3 * PX, w = 2.4 * PX, y = yFromFloor(3.2), h = 1.9 * PX;
  glass(g, x, y, w, h);
  g.fillStyle = "#c3c8cc"; g.fillRect(x + w / 3, y, 4, h); g.fillRect(x + 2 * w / 3, y, 4, h);
  frame(g, x, y, w, h, 5);
  g.fillStyle = "rgba(0,0,0,0.06)";
  for (let i = 0; i < 6; i++) g.fillRect(i * W / 6, yFromFloor(1.2), 2, 1.2 * PX);
});
const texHigh = canvasTex(W, H, (g) => {
  g.fillStyle = "#ece6d8"; g.fillRect(0, 0, W, H);
  noise(g, W, H, 0.08);
  g.fillStyle = "#dcd5c6"; g.fillRect(0, yFromFloor(0.45), W, 0.45 * PX);
  const x = 0.35 * PX, w = 2.3 * PX, y = yFromFloor(3.1), h = 1.4 * PX;
  glass(g, x, y, w, h);
  frame(g, x, y, w, h, 5);
});

const texGrass = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = "#7fa25a"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const l = 30 + Math.random() * 25;
    g.fillStyle = `hsl(${85 + Math.random() * 20},${35 + Math.random() * 15}%,${l}%)`;
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
});
texGrass.repeat.set(60, 60);

const texPaving = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = "#c9c4ba"; g.fillRect(0, 0, w, h);
  noise(g, w, h, 0.25, 4000);
  g.strokeStyle = "rgba(0,0,0,0.12)"; g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke();
    g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke();
  }
});

const texStairs = canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = "#9aa0a8"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#6f757d";
  for (let i = 0; i < 8; i++) g.fillRect(0, i * 8, w, 3);
});

const texRoofTop = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = "#b4b8b2"; g.fillRect(0, 0, w, h);
  noise(g, w, h, 0.08, 1500);
});

// ---------- 外壁を作る ----------
// 輪郭セルの集合から、外側に面した辺を探して壁の板にする
function boundarySegments(cells) {
  const segs = [];
  const dirs = [
    { dc: 0, dr: -1, n: [0, -1] }, // 北（図面の上）
    { dc: 0, dr: 1, n: [0, 1] },   // 南
    { dc: -1, dr: 0, n: [-1, 0] }, // 西
    { dc: 1, dr: 0, n: [1, 0] },   // 東
  ];
  const groups = new Map();
  for (const [k, style] of cells) {
    const [c, r] = k.split(",").map(Number);
    dirs.forEach((d, di) => {
      if (cells.has(key(c + d.dc, r + d.dr))) return;
      const horizontal = d.dr !== 0;
      const line = horizontal ? r + (d.dr > 0 ? 1 : 0) : c + (d.dc > 0 ? 1 : 0);
      const pos = horizontal ? c : r;
      const gk = `${di}|${line}|${style}`;
      if (!groups.has(gk)) groups.set(gk, { di, line, style, pos: [] });
      groups.get(gk).pos.push(pos);
    });
  }
  for (const g of groups.values()) {
    g.pos.sort((a, b) => a - b);
    let start = g.pos[0], prev = g.pos[0];
    const flush = (a, b) => {
      const d = dirs[g.di];
      let ax, az, bx, bz;
      if (d.dr !== 0) { ax = X(a); bx = X(b + 1); az = bz = Z(g.line); }
      else { az = Z(a); bz = Z(b + 1); ax = bx = X(g.line); }
      segs.push({ ax, az, bx, bz, n: d.n, style: g.style });
    };
    for (let i = 1; i < g.pos.length; i++) {
      if (g.pos[i] !== prev + 1) { flush(start, prev); start = g.pos[i]; }
      prev = g.pos[i];
    }
    flush(start, prev);
  }
  return segs;
}

// 外向きの面になるように壁の板をつくる
function wallGeometry(segs, y0, h, uScale = 1 / BAY) {
  const pos = [], uv = [], idx = [];
  for (const s of segs) {
    let { ax, az, bx, bz } = s;
    // (-dz, dx) が外向きになる向きにそろえる
    const dx = bx - ax, dz = bz - az;
    if (-dz * s.n[0] + dx * s.n[1] < 0) { [ax, bx] = [bx, ax]; [az, bz] = [bz, az]; }
    const len = Math.hypot(bx - ax, bz - az);
    const i = pos.length / 3;
    pos.push(ax, y0, az, bx, y0, bz, bx, y0 + h, bz, ax, y0 + h, az);
    const u = len * uScale;
    uv.push(0, 0, u, 0, u, 1, 0, 1);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// セルの集合を長方形の集まりにまとめる
function cellsToRects(set) {
  const rows = new Map();
  for (const k of set) {
    const [c, r] = k.split(",").map(Number);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(c);
  }
  const runsByRow = new Map();
  for (const [r, cs] of rows) {
    cs.sort((a, b) => a - b);
    const runs = [];
    let s = cs[0], p = cs[0];
    for (let i = 1; i < cs.length; i++) {
      if (cs[i] !== p + 1) { runs.push([s, p]); s = cs[i]; }
      p = cs[i];
    }
    runs.push([s, p]);
    runsByRow.set(r, runs);
  }
  const rects = [];
  const open = new Map(); // "c0,c1" -> rect
  const sortedRows = [...runsByRow.keys()].sort((a, b) => a - b);
  let lastRow = null;
  for (const r of sortedRows) {
    const next = new Map();
    for (const [c0, c1] of runsByRow.get(r)) {
      const k2 = c0 + "," + c1;
      const o = open.get(k2);
      if (o && lastRow === r - 1) { o.r1 = r; next.set(k2, o); open.delete(k2); }
      else { const nr = { c0, c1, r0: r, r1: r }; rects.push(nr); next.set(k2, nr); }
    }
    open.clear();
    for (const [k2, v] of next) open.set(k2, v);
    lastRow = r;
  }
  return rects;
}

const matPlain = new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 0.9, side: THREE.DoubleSide });
const matParapet = new THREE.MeshStandardMaterial({ color: 0xd9d3c5, roughness: 0.9, side: THREE.DoubleSide });
const matRoof = new THREE.MeshStandardMaterial({ map: texRoofTop, color: 0xffffff, roughness: 0.95 });
const matSlab = new THREE.MeshStandardMaterial({ color: 0xeeebe4, roughness: 0.95 });
const wallMat = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0.0 });
const MAT_WALL = {
  school: wallMat(texSchool),
  high: wallMat(texHigh),
  gym2: wallMat(texGymLow),
  gym3: wallMat(texGymHigh),
};

const layers = { exterior: {}, roofs: {}, cut: {}, slab: {}, rooms: {}, labels: {}, furniture: {} };
const y0OfFloor = (f) => base(f);
const buildingGroup = new THREE.Group();
scene.add(buildingGroup);

for (const f of [1, 2, 3]) {
  const segs = boundarySegments(OCC[f]);
  const ext = new THREE.Group();
  const byStyle = {};
  for (const s of segs) {
    const st = s.style === "gym" ? "gym" + f : s.style;
    (byStyle[st] ||= []).push(s);
  }
  for (const [st, list] of Object.entries(byStyle)) {
    const m = new THREE.Mesh(wallGeometry(list, base(f), FH), MAT_WALL[st] || MAT_WALL.school);
    m.castShadow = true; m.receiveShadow = true;
    ext.add(m);
  }
  layers.exterior[f] = ext;
  buildingGroup.add(ext);

  // 切断した壁（フロア表示用）
  const cut = new THREE.Mesh(wallGeometry(segs, base(f), 1.3), matPlain);
  cut.castShadow = true; cut.receiveShadow = true;
  layers.cut[f] = cut;
  buildingGroup.add(cut);

  // 屋上（上の階がない部分）
  const roofCells = new Set();
  for (const [k, st] of OCC[f]) {
    if (st === "gym" && f === 3) continue;
    if (f === 3 || !OCC[f + 1].has(k)) roofCells.add(k);
  }
  const roof = new THREE.Group();
  const roofGeos = cellsToRects(roofCells).map((r) => {
    const rc = rectOf(r);
    const g = new THREE.BoxGeometry(rc.x1 - rc.x0, 0.3, rc.z1 - rc.z0);
    g.translate((rc.x0 + rc.x1) / 2, base(f) + FH + 0.15, (rc.z0 + rc.z1) / 2);
    return g;
  });
  if (roofGeos.length) {
    const rm = new THREE.Mesh(mergeGeometries(roofGeos), matRoof);
    rm.receiveShadow = true; rm.castShadow = true;
    roof.add(rm);
    // パラペット（屋上のふち）
    const roofMap = new Map([...roofCells].map((k) => [k, "p"]));
    const psegs = boundarySegments(roofMap).filter((s) => {
      // となりに同じ階の建物があるところには作らない
      const mx = (s.ax + s.bx) / 2 + s.n[0] * 0.3, mz = (s.az + s.bz) / 2 + s.n[1] * 0.3;
      const c = Math.floor(mx / CW + C_MID), r = Math.floor(mz / RH + R_MID);
      return !OCC[f].has(key(c, r));
    });
    const pm = new THREE.Mesh(wallGeometry(psegs, base(f) + FH, 0.75), matParapet);
    pm.castShadow = true;
    roof.add(pm);
  }
  layers.roofs[f] = roof;
  buildingGroup.add(roof);

  // 床（フロア表示用）
  const slabCells = new Set();
  for (const [k, st] of OCC[f]) if (!(f === 3 && (st === "gym" || st === "high"))) slabCells.add(k);
  const slabGeos = cellsToRects(slabCells).map((r) => {
    const rc = rectOf(r);
    const g = new THREE.BoxGeometry(rc.x1 - rc.x0, 0.25, rc.z1 - rc.z0);
    g.translate((rc.x0 + rc.x1) / 2, base(f) - 0.1, (rc.z0 + rc.z1) / 2);
    return g;
  });
  const slab = new THREE.Mesh(mergeGeometries(slabGeos), matSlab);
  slab.receiveShadow = true;
  layers.slab[f] = slab;
  buildingGroup.add(slab);
}

// 3階にある卓球場・放送ブースの床だけは追加
// 体育館の屋根（切妻）
const gymRect = rectOf({ c0: 7, r0: 1, c1: 26, r1: 38 });
const gymRoof = (() => {
  const g = new THREE.Group();
  const y0 = 3 * FH, rise = 2.6, ov = 0.6;
  const w = gymRect.x1 - gymRect.x0, d = gymRect.z1 - gymRect.z0;
  const cx = (gymRect.x0 + gymRect.x1) / 2, cz = (gymRect.z0 + gymRect.z1) / 2;
  const half = w / 2 + ov;
  const slope = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.2 });
  const ribTex = canvasTex(64, 64, (c, W2, H2) => {
    c.fillStyle = "#9fb0bc"; c.fillRect(0, 0, W2, H2);
    c.fillStyle = "#7f909c"; for (let i = 0; i < 4; i++) c.fillRect(0, i * 16, W2, 3);
  });
  ribTex.repeat.set(1, d / 1.2);
  roofMat.map = ribTex;
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.25, d + ov * 2), roofMat);
    p.position.set(cx + side * half / 2, y0 + rise / 2, cz);
    p.rotation.z = -side * ang;
    p.castShadow = true; p.receiveShadow = true;
    g.add(p);
  }
  // 妻壁（三角の壁）
  const tri = new THREE.Shape();
  tri.moveTo(-w / 2, 0); tri.lineTo(w / 2, 0); tri.lineTo(0, rise); tri.closePath();
  for (const z of [gymRect.z0, gymRect.z1]) {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshStandardMaterial({ color: 0xe3dccb, side: THREE.DoubleSide }));
    m.position.set(cx, y0, z);
    m.castShadow = true;
    g.add(m);
  }
  return g;
})();
buildingGroup.add(gymRoof);

// ---------- 地面・植栽 ----------
const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ map: texGrass, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.25;
ground.receiveShadow = true;
scene.add(ground);

const bb = { x0: X(4), x1: X(70), z0: Z(-2), z1: Z(74) };
texPaving.repeat.set((bb.x1 - bb.x0) / 4, (bb.z1 - bb.z0) / 4);
const paving = new THREE.Mesh(new THREE.PlaneGeometry(bb.x1 - bb.x0, bb.z1 - bb.z0), new THREE.MeshStandardMaterial({ map: texPaving, roughness: 1 }));
paving.rotation.x = -Math.PI / 2;
paving.position.set((bb.x0 + bb.x1) / 2, -0.2, (bb.z0 + bb.z1) / 2);
paving.receiveShadow = true;
scene.add(paving);

// 光庭の芝生
for (const [c0, r0, c1, r1] of OPEN_COURTS) {
  const rc = rectOf({ c0, r0, c1, r1 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(rc.x1 - rc.x0, 0.1, rc.z1 - rc.z0), new THREE.MeshStandardMaterial({ map: texGrass, color: 0xbfe0a0 }));
  m.position.set((rc.x0 + rc.x1) / 2, -0.12, (rc.z0 + rc.z1) / 2);
  m.receiveShadow = true;
  scene.add(m);
}

// グラウンド・テニスコート・駐輪場
const site = buildSite(scene, SITE);
const aerial = createAerial(scene, SCHOOL);

// 木（建物のまわりに並べる。位置は雰囲気を出すための飾り）
const trees = new THREE.Group();
scene.add(trees);
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const spots = [];
  const ok = (x, z) => {
    const c = Math.floor(x / CW + C_MID), r = Math.floor(z / RH + R_MID);
    for (let dc = -3; dc <= 3; dc++) for (let dr = -3; dr <= 3; dr++) {
      for (const f of [1, 2]) if (OCC[f].has(key(c + dc, r + dr))) return false;
    }
    return site.isFree(x, z);
  };
  for (let i = 0; i < 400 && spots.length < 90; i++) {
    const side = Math.floor(rnd() * 4);
    let x, z;
    if (side === 0) { x = bb.x0 + rnd() * (bb.x1 - bb.x0); z = bb.z0 - 4 - rnd() * 14; }
    else if (side === 1) { x = bb.x0 + rnd() * (bb.x1 - bb.x0); z = bb.z1 + 4 + rnd() * 14; }
    else if (side === 2) { x = bb.x0 - 4 - rnd() * 14; z = bb.z0 + rnd() * (bb.z1 - bb.z0); }
    else { x = bb.x1 + 4 + rnd() * 14; z = bb.z0 + rnd() * (bb.z1 - bb.z0); }
    if (ok(x, z)) spots.push([x, z, 0.8 + rnd() * 0.6]);
  }
  // 中庭の木
  spots.push([X(53.5), Z(23.5), 0.6]);
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.25, 2.4, 6), new THREE.MeshStandardMaterial({ color: 0x6b4f35 }), spots.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 1), new THREE.MeshStandardMaterial({ color: 0x4f7d3a, roughness: 1, flatShading: true }), spots.length);
  const m4 = new THREE.Matrix4();
  spots.forEach(([x, z, s], i) => {
    m4.compose(new THREE.Vector3(x, 1.2 * s - 0.2, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    trunk.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 3.6 * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, i, 0)), new THREE.Vector3(s, s * 1.15, s));
    crown.setMatrixAt(i, m4);
  });
  trunk.castShadow = crown.castShadow = true;
  trees.add(trunk, crown);
}

// ---------- 部屋（フロア表示） ----------
const pickables = [];
const matPartition = new THREE.MeshStandardMaterial({ color: 0xfaf8f3, roughness: 0.9 });
for (const f of [1, 2, 3]) {
  const grp = new THREE.Group();
  const lbl = new THREE.Group();
  const walls = [];
  for (const r of ROOMS.filter((x) => x.floor === f)) {
    const y = base(f);
    const isOpen = r.cat === "open";
    const isCourt = /光庭/.test(r.name);
    const color = new THREE.Color(CATEGORIES[r.cat].color);
    // 床の模様（木の床・タイル・畳・体育館のコート）
    let map = r.kind === "stairs" ? texStairs : null;
    let tint = color;
    if (!isOpen && r.kind !== "stairs") {
      const st = floorStyle(r.name);
      map = FLOOR_TEX[st].clone();
      map.needsUpdate = true;
      if (st === "gym") { map.center.set(0.5, 0.5); map.rotation = Math.PI / 2; tint = new THREE.Color(0xffffff); }
      else if (st === "tatami") { map.repeat.set(r.w / 3.6, r.d / 3.6); tint = new THREE.Color(0xffffff); }
      else if (st === "tile") map.repeat.set(r.w / 1.2, r.d / 1.2);
      else map.repeat.set(r.w / 4, r.d / 4);
    }
    const mat = new THREE.MeshStandardMaterial({
      color: tint, roughness: 0.85,
      map,
      transparent: isOpen, opacity: isCourt ? 0.0 : isOpen ? 0.35 : 1,
      depthWrite: !isOpen,
    });
    const th = /ステージ/.test(r.name) ? 1.0 : 0.14; // ステージは高くする
    const tile = new THREE.Mesh(new THREE.BoxGeometry(r.w - 0.14, th, r.d - 0.14), mat);
    tile.position.set(r.cx, y + 0.01 + th / 2, r.cz);
    tile.receiveShadow = true;
    tile.userData.room = r;
    r.mesh = tile;
    r.baseColor = color.clone();
    grp.add(tile);
    pickables.push(tile);

    if (!isCourt && r.kind !== "stairs") {
      const t = 0.14, h = isOpen ? 1.0 : 1.25;
      const rc = rectOf(r);
      for (const [w, d, x, z] of [
        [r.w, t, r.cx, rc.z0], [r.w, t, r.cx, rc.z1],
        [t, r.d, rc.x0, r.cz], [t, r.d, rc.x1, r.cz],
      ]) {
        const g = new THREE.BoxGeometry(w, h, d);
        g.translate(x, y + h / 2, z);
        walls.push(g);
      }
    }

    // ラベル
    const div = document.createElement("div");
    const small = r.w < 4.2 || r.d < 3;
    div.className = `room-label cat-${r.cat}${small ? " small" : ""}${r.grade ? " hr" : ""}${r.kind === "stairs" ? " stairs" : ""}`;
    div.textContent = shortName(r);
    if (r.d > r.w * 1.6 && small && !r.grade) div.classList.add("vertical");
    div.addEventListener("pointerdown", (e) => e.stopPropagation());
    div.addEventListener("click", (e) => { e.stopPropagation(); selectRoom(r, { fly: false }); });
    const obj = new CSS2DObject(div);
    obj.position.set(r.cx, y + 1.6, r.cz);
    r.label = div;
    lbl.add(obj);
  }
  if (walls.length) {
    const pm = new THREE.Mesh(mergeGeometries(walls), matPartition);
    pm.castShadow = true; pm.receiveShadow = true;
    grp.add(pm);
  }
  // 家具
  const furn = buildFurniture(ROOMS.filter((x) => x.floor === f && x.kind === "room"), y0OfFloor(f));
  layers.furniture[f] = furn;
  grp.add(furn);
  layers.rooms[f] = grp;
  layers.labels[f] = lbl;
  scene.add(grp, lbl);
}

// 棟のラベル（外観表示）
const wingLabels = new THREE.Group();
for (const w of WINGS) {
  const div = document.createElement("div");
  div.className = "wing-label";
  div.textContent = w.name;
  div.addEventListener("pointerdown", (e) => e.stopPropagation());
  div.addEventListener("click", (e) => { e.stopPropagation(); showWing(w); });
  const obj = new CSS2DObject(div);
  const [c0, r0, c1, r1] = w.area;
  const top = w.id === "wg" ? 3 * FH + 4 : 3 * FH + 2.5;
  obj.position.set((X(c0) + X(c1 + 1)) / 2, top, (Z(r0) + Z(r1 + 1)) / 2);
  wingLabels.add(obj);
}
// まわりの施設のラベル
for (const it of SITE_INFO) {
  const cfg = SITE[it.key];
  if (!cfg) continue;
  const div = document.createElement("div");
  div.className = "wing-label site";
  div.textContent = it.name;
  div.addEventListener("pointerdown", (e) => e.stopPropagation());
  div.addEventListener("click", (e) => { e.stopPropagation(); showSite(it); });
  const obj = new CSS2DObject(div);
  obj.position.set(cfg.x, 5, cfg.z);
  wingLabels.add(obj);
}
scene.add(wingLabels);

// ---------- 表示の切り替え ----------
const state = { floor: 0, view: "3d", selected: null };

// ラベル（HTML）はグループごと消しても残ることがあるので、1つずつ切り替える
function setLabelsVisible(group, v) {
  group.visible = v;
  group.children.forEach((o) => { o.visible = v; });
}
const visibleDeep = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

function applyMode() {
  const f = state.floor;
  for (const k of [1, 2, 3]) {
    const below = f === 0 || k < f;
    layers.exterior[k].visible = below;
    layers.roofs[k].visible = below;
    layers.cut[k].visible = k === f;
    layers.slab[k].visible = k === f;
    layers.rooms[k].visible = k === f;
    setLabelsVisible(layers.labels[k], k === f && labelsOn);
  }
  gymRoof.visible = f === 0;
  setLabelsVisible(wingLabels, f === 0 && labelsOn);
  document.querySelectorAll(".floor-btn").forEach((b) => b.classList.toggle("active", Number(b.dataset.floor) === f));
  document.querySelectorAll(".view-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  document.getElementById("view-toggle").classList.toggle("disabled", f === 0);
  const floorNote = document.getElementById("floor-note");
  floorNote.textContent = f === 0 ? "外観：棟の名前をクリックすると、その建物の案内が出ます" : `${f}階：部屋をクリックすると紹介が出ます`;
}

function useCamera() {
  const is2d = state.view === "2d" && state.floor !== 0;
  controls3d.enabled = !is2d;
  controls2d.enabled = is2d;
  return is2d ? ortho : persp;
}

function setFloor(f, { keepCamera = false } = {}) {
  state.floor = f;
  if (f === 0) state.view = "3d";
  applyMode();
  useCamera();
  if (!keepCamera) {
    if (f === 0) flyTo(new THREE.Vector3(80, 95, 135), new THREE.Vector3(18, 0, 8));
    else if (state.view === "3d") flyTo(new THREE.Vector3(10, base(f) + 85, 70), new THREE.Vector3(0, base(f), 4));
    else fit2d();
  }
}

function setView(v) {
  if (state.floor === 0) return;
  state.view = v;
  applyMode();
  useCamera();
  if (v === "2d") fit2d();
  else flyTo(new THREE.Vector3(10, base(state.floor) + 85, 70), new THREE.Vector3(0, base(state.floor), 4));
}

function fit2d() {
  controls2d.target.set(X(36), 0, Z(35));
  ortho.position.set(X(36), 200, Z(35) + 0.001);
  ortho.zoom = 1;
  resize();
  controls2d.update();
}

// カメラをなめらかに動かす
let anim = null;
function flyTo(pos, target, ms = 700) {
  const c = state.view === "2d" && state.floor !== 0 ? null : persp;
  if (!c) return;
  // 縦長の画面（スマホ）では少し離れて全体が入るようにする
  if (persp.aspect < 1) pos = pos.clone().sub(target).multiplyScalar(Math.min(1.7, 1 / persp.aspect)).add(target);
  anim = { t0: performance.now(), ms, p0: c.position.clone(), t0v: controls3d.target.clone(), p1: pos, t1: target };
}

// ---------- 選択と情報パネル ----------
const panel = document.getElementById("panel");
const panelBody = document.getElementById("panel-body");

function nearest(r, test) {
  let best = null, bd = Infinity;
  for (const o of ROOMS) {
    if (o.floor !== r.floor || o === r || !test(o)) continue;
    const d = Math.hypot(o.cx - r.cx, o.cz - r.cz);
    if (d < bd) { bd = d; best = o; }
  }
  return best ? { room: best, dist: Math.round(bd / 5) * 5 || 5 } : null;
}

function roomLink(o, extra = "") {
  return `<button class="link" data-room="${o.id}">${o.name}</button>${extra}`;
}

function selectRoom(r, { fly = true } = {}) {
  if (state.selected?.mesh) {
    state.selected.mesh.material.emissive.setHex(0x000000);
    state.selected.label?.classList.remove("selected");
  }
  state.selected = r;
  if (state.floor !== r.floor) setFloor(r.floor, { keepCamera: true });
  r.mesh.material.emissive.setHex(0x553300);
  r.label?.classList.add("selected");
  if (fly) {
    if (state.view === "2d") {
      controls2d.target.set(r.cx, 0, r.cz);
      ortho.position.set(r.cx, 200, r.cz + 0.001);
      ortho.zoom = Math.max(ortho.zoom, 1.6);
      ortho.updateProjectionMatrix();
    } else {
      flyTo(new THREE.Vector3(r.cx + 10, base(r.floor) + 26, r.cz + 26), new THREE.Vector3(r.cx, base(r.floor), r.cz));
    }
  }
  const cat = CATEGORIES[r.cat];
  const toiletM = nearest(r, (o) => /男子トイレ|みんなのトイレ/.test(o.name));
  const toiletF = nearest(r, (o) => /女子トイレ|みんなのトイレ/.test(o.name));
  const stairs = nearest(r, (o) => o.kind === "stairs");
  const nearby = [];
  if (r.cat !== "toilet") {
    if (toiletM) nearby.push(`<li>🚹 ${roomLink(toiletM.room, ` <span class="dist">約${toiletM.dist}m</span>`)}</li>`);
    if (toiletF && toiletF.room !== toiletM?.room) nearby.push(`<li>🚺 ${roomLink(toiletF.room, ` <span class="dist">約${toiletF.dist}m</span>`)}</li>`);
  }
  if (stairs && r.kind !== "stairs") nearby.push(`<li>🪜 ${roomLink(stairs.room, ` <span class="dist">約${stairs.dist}m</span>`)}</li>`);
  const sameFloor = r.kind === "stairs"
    ? `<p class="muted">この階段で行ける階：${STAIRS.find((s) => s.name === r.name).floors.map((f) => `<button class="link" data-floor="${f}">${f}階</button>`).join(" ")}</p>`
    : "";
  panelBody.innerHTML = `
    <div class="chip" style="--c:${cat.color}">${cat.label}</div>
    <h2>${r.name}</h2>
    <p class="where">${r.floor}階${r.wing ? `・<button class="link" data-wing="${r.wing.id}">${r.wing.name}</button>` : ""}</p>
    <p class="desc">${r.desc || "（紹介文はまだありません）"}</p>
    ${sameFloor}
    ${nearby.length ? `<h3>近くにあるもの</h3><ul class="nearby">${nearby.join("")}</ul>` : ""}
    <p class="share"><button class="link" id="copy-link">🔗 この部屋へのリンクをコピー</button></p>
  `;
  openPanel();
  history.replaceState(null, "", `#room=${r.id}`);
}

function showWing(w) {
  const rooms = ROOMS.filter((r) => r.wing === w && r.kind === "room" && r.cat !== "open");
  const byFloor = [1, 2, 3].map((f) => {
    const list = rooms.filter((r) => r.floor === f).sort((a, b) => a.name.localeCompare(b.name, "ja"));
    if (!list.length) return "";
    return `<h3>${f}階</h3><div class="room-chips">${list.map((r) => `<button class="room-chip" data-room="${r.id}" style="--c:${CATEGORIES[r.cat].color}">${r.name}</button>`).join("")}</div>`;
  }).join("");
  panelBody.innerHTML = `
    <div class="chip" style="--c:#c7d2dc">建物</div>
    <h2>${w.name}</h2>
    <p class="desc">${w.note}</p>
    ${byFloor}
  `;
  openPanel();
  const [c0, r0, c1, r1] = w.area;
  const cx = (X(c0) + X(c1 + 1)) / 2, cz = (Z(r0) + Z(r1 + 1)) / 2;
  flyTo(new THREE.Vector3(cx + 30, 45, cz + 45), new THREE.Vector3(cx, 5, cz));
}

function showSite(it) {
  const cfg = SITE[it.key];
  panelBody.innerHTML = `
    <div class="chip" style="--c:#cfe3c4">屋外の施設</div>
    <h2>${it.name}</h2>
    <p class="desc">${it.desc}</p>
    <p class="muted">${SITE_NOTE}</p>
  `;
  openPanel();
  flyTo(new THREE.Vector3(cfg.x + 25, 40, cfg.z + 45), new THREE.Vector3(cfg.x, 0, cfg.z));
}

function openPanel() { panel.classList.add("open"); }
function closePanel() {
  panel.classList.remove("open");
  if (state.selected?.mesh) {
    state.selected.mesh.material.emissive.setHex(0x000000);
    state.selected.label?.classList.remove("selected");
  }
  state.selected = null;
  history.replaceState(null, "", location.pathname + location.search);
}

panel.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.room) selectRoom(ROOM_BY_ID[t.dataset.room]);
  else if (t.dataset.wing) showWing(WINGS.find((w) => w.id === t.dataset.wing));
  else if (t.dataset.floor) setFloor(Number(t.dataset.floor));
  else if (t.id === "copy-link") {
    navigator.clipboard?.writeText(location.href).then(() => { t.textContent = "✅ コピーしました"; });
  } else if (t.id === "panel-close") closePanel();
});

// ---------- クリック判定 ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let down = null;
labelRenderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
labelRenderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(ndc, useCamera());
  if (state.floor === 0) {
    // 外観：建物をクリックしたら、その棟の案内
    const hit = ray.intersectObjects(buildingGroup.children, true).find((h) => visibleDeep(h.object));
    if (hit) {
      const p = hit.point;
      const c = p.x / CW + C_MID, r = p.z / RH + R_MID;
      const w = WINGS.find((w) => c >= w.area[0] - 0.5 && c <= w.area[2] + 1.5 && r >= w.area[1] - 0.5 && r <= w.area[3] + 1.5);
      if (w) showWing(w);
    }
    return;
  }
  const hits = ray.intersectObjects(pickables.filter((m) => m.userData.room.floor === state.floor), false);
  if (hits.length) selectRoom(hits[0].object.userData.room, { fly: false });
});

// ---------- 検索 ----------
const search = document.getElementById("search");
const results = document.getElementById("results");
const norm = (s) => s.normalize("NFKC").toLowerCase().replace(/\s/g, "").replace(/[ー－‐-]/g, "-");
search.addEventListener("input", () => {
  const q = norm(search.value);
  if (!q) { results.hidden = true; return; }
  const list = ROOMS.filter((r) => r.kind === "room" && r.cat !== "open")
    .filter((r) => {
      const n = norm(r.name);
      const alt = r.grade ? `${r.grade}-${r.cls}${r.grade}年${r.cls}組` : "";
      return n.includes(q) || alt.includes(q) || norm(CATEGORIES[r.cat].label).includes(q);
    })
    .slice(0, 30);
  results.innerHTML = list.length
    ? list.map((r) => `<li><button data-room="${r.id}"><span class="dot" style="background:${CATEGORIES[r.cat].color}"></span>${r.name}<span class="fl">${r.floor}階${r.wing ? "・" + r.wing.name : ""}</span></button></li>`).join("")
    : `<li class="none">見つかりませんでした</li>`;
  results.hidden = false;
});
results.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-room]");
  if (!b) return;
  results.hidden = true;
  search.value = "";
  search.blur();
  selectRoom(ROOM_BY_ID[b.dataset.room]);
});
document.addEventListener("click", (e) => { if (!e.target.closest(".search-box")) results.hidden = true; });

// ---------- ボタン類 ----------
document.querySelectorAll(".floor-btn").forEach((b) => b.addEventListener("click", () => { closePanel(); setFloor(Number(b.dataset.floor)); }));
document.querySelectorAll(".view-btn").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
let labelsOn = true;
document.getElementById("labels-toggle").addEventListener("change", (e) => { labelsOn = e.target.checked; applyMode(); });
document.getElementById("furniture-toggle").addEventListener("change", (e) => {
  for (const f of [1, 2, 3]) layers.furniture[f].visible = e.target.checked;
});

// ---------- 航空写真 ----------
const ALIGN_KEY = "asao-aerial-align";
let align = { ...AERIAL_ALIGN };
try { Object.assign(align, JSON.parse(localStorage.getItem(ALIGN_KEY) || "{}")); } catch { /* 保存なし */ }
aerial.setAlign(align);
const aerialBtn = document.getElementById("aerial-btn");
const alignPanel = document.getElementById("align-panel");
const aerialMsg = document.getElementById("aerial-msg");
function setAerial(on) {
  aerial.holder.visible = on;
  ground.visible = paving.visible = trees.visible = site.group.visible = !on;
  aerialBtn.classList.toggle("active", on);
  document.body.classList.toggle("aerial-on", on);
  document.getElementById("aerial-credit").hidden = !on;
  if (!on) { alignPanel.hidden = true; return; }
  aerialMsg.textContent = "航空写真を読み込み中…";
  aerial.load().then(() => { aerialMsg.textContent = ""; })
    .catch(() => { aerialMsg.textContent = "航空写真を読み込めませんでした（インターネット接続を確認してください）"; });
}
aerialBtn.addEventListener("click", () => setAerial(!aerial.holder.visible));
document.getElementById("align-open").addEventListener("click", () => { alignPanel.hidden = !alignPanel.hidden; });
const alignInputs = alignPanel.querySelectorAll("input[type=range]");
function showAlign() {
  alignInputs.forEach((inp) => {
    inp.value = align[inp.name];
    inp.nextElementSibling.textContent = Number(align[inp.name]).toFixed(inp.name === "scale" ? 2 : 1);
  });
  document.getElementById("align-code").textContent = `rot: ${align.rot}, x: ${align.x}, z: ${align.z}, scale: ${align.scale}`;
}
alignInputs.forEach((inp) => inp.addEventListener("input", () => {
  align[inp.name] = Number(inp.value);
  aerial.setAlign(align);
  showAlign();
  try { localStorage.setItem(ALIGN_KEY, JSON.stringify(align)); } catch { /* 保存できない環境 */ }
}));
document.getElementById("align-reset").addEventListener("click", () => {
  align = { ...AERIAL_ALIGN };
  aerial.setAlign(align);
  showAlign();
  try { localStorage.removeItem(ALIGN_KEY); } catch { /* 保存できない環境 */ }
});
showAlign();

// 凡例
document.getElementById("legend-list").innerHTML = Object.values(CATEGORIES)
  .map((c) => `<li><span class="dot" style="background:${c.color}"></span>${c.label}</li>`).join("");

// 地図・学校情報
const mapDlg = document.getElementById("map-dialog");
document.getElementById("map-btn").addEventListener("click", () => {
  const frame = document.getElementById("gmap");
  if (!frame.src) frame.src = `https://maps.google.com/maps?q=${SCHOOL.lat},${SCHOOL.lng}&t=k&z=18&hl=ja&output=embed`;
  mapDlg.showModal();
});
document.getElementById("school-info").innerHTML = `
  <dl>
    <dt>所在地</dt><dd>${SCHOOL.address}</dd>
    <dt>電話</dt><dd>${SCHOOL.tel}</dd>
    <dt>アクセス</dt><dd>${SCHOOL.access}</dd>
  </dl>
  <p><a href="https://www.google.com/maps/search/?api=1&query=${SCHOOL.lat},${SCHOOL.lng}" target="_blank" rel="noopener">Googleマップで開く</a> ／
  <a href="${SCHOOL.site}" target="_blank" rel="noopener">学校の公式サイト</a></p>`;
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
document.getElementById("help-btn").addEventListener("click", () => document.getElementById("help-dialog").showModal());

// ---------- 画面サイズ・描画ループ ----------
function resize() {
  const w = app.clientWidth, h = app.clientHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  persp.aspect = w / h;
  persp.updateProjectionMatrix();
  const view = 50; // 2D表示で見える縦の幅(m)の半分
  const a = w / h;
  const halfH = a > 1.25 ? view : (view * 1.25) / a;
  ortho.left = -halfH * a; ortho.right = halfH * a; ortho.top = halfH; ortho.bottom = -halfH;
  ortho.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// 名前ラベルが重なったら、小さい部屋のほうを隠す
let lastDeclutter = 0;
function declutter() {
  const groups = state.floor === 0 ? [wingLabels] : [layers.labels[state.floor]];
  const items = [];
  for (const g of groups) {
    if (!g.visible) continue;
    for (const o of g.children) {
      const el = o.element;
      if (el.style.display === "none") continue;
      const r = ROOMS.find((x) => x.label === el);
      const prio = el.classList.contains("selected") ? 1e9 : r ? (r.grade ? 1e6 : 0) + r.w * r.d : 1e5;
      items.push({ el, prio, rect: el.getBoundingClientRect() });
    }
  }
  items.sort((a, b) => b.prio - a.prio);
  const placed = [];
  for (const it of items) {
    const a = it.rect;
    const hit = placed.some((b) => a.left < b.right - 2 && a.right > b.left + 2 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
    it.el.classList.toggle("overlap", hit);
    if (!hit) placed.push(a);
  }
}

function tick(now) {
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / anim.ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    persp.position.lerpVectors(anim.p0, anim.p1, e);
    controls3d.target.lerpVectors(anim.t0v, anim.t1, e);
    if (k >= 1) anim = null;
  }
  const cam = useCamera();
  (cam === ortho ? controls2d : controls3d).update();
  renderer.render(scene, cam);
  labelRenderer.render(scene, cam);
  if (now - lastDeclutter > 200) { lastDeclutter = now; declutter(); }
  requestAnimationFrame(tick);
}

// ---------- はじめの表示 ----------
setFloor(0);
const m = location.hash.match(/room=([\w-]+)/);
if (m && ROOM_BY_ID[m[1]]) selectRoom(ROOM_BY_ID[m[1]]);
requestAnimationFrame(tick);
document.getElementById("loading").remove();
