import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { ROOMS_RAW } from "./data.js";
import { FOOTPRINTS, OPEN_COURTS, STAIRS, WINGS, CATEGORIES, describe, SCHOOL, SITE, SITE_INFO, SITE_NOTE, AERIAL_ALIGN, FACADE, BLOCKS, PILOTIS, ROOM_PARTS, COLUMN_AREAS, GYM_GALLERY, ROOM_EDITS, EXTRA_ROOMS, ROOM_SPLITS, ROOM_STYLE, WALL_OPENINGS, PHOTOS } from "./info.js";
import { buildFurniture, floorStyle, FLOOR_TEX } from "./furniture.js";
import { buildTrees, buildColumnTrees, hedgeBox, hedgeMass, matHedge, bakeStatic } from "./nature.js";
import { buildSite, createAerial, flatPoly, polyBounds, inPoly, buildTerrain, setSlope, texAsphalt, texPavers, worldUV } from "./site.js";

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
// 棟の範囲（いくつかの長方形）
const areasOf = (w) => w.areas || [w.area];
const inCells = (c, r, [c0, r0, c1, r1]) => c >= c0 && c <= c1 && r >= r0 && r <= r1;

// ---------- 航空写真のトレース（棟ごとの位置合わせ） ----------
// 建物は図面の座標で作り、棟ごとのグループに「拡大縮小＋移動」をかけて、航空写真で測った位置に置く
const BLOCK_LIST = BLOCKS.map((b) => {
  const [c0, r0, c1, r1] = b.cells, [wx0, wz0, wx1, wz1] = b.world;
  const sx = (wx1 - wx0) / (X(c1 + 1) - X(c0)), sz = (wz1 - wz0) / (Z(r1 + 1) - Z(r0));
  return { ...b, sx, sz, ox: wx0 - X(c0) * sx, oz: wz0 - Z(r0) * sz };
});
const IDENT = { id: "_", cells: [0, 0, -1, -1], sx: 1, sz: 1, ox: 0, oz: 0 };
const blockAtCell = (c, r) => BLOCK_LIST.find((b) => inCells(c, r, b.cells)) || IDENT;
const blockAtPoint = (x, z) => blockAtCell(Math.floor(x / CW + C_MID), Math.floor(z / RH + R_MID));
const blockById = (id) => BLOCK_LIST.find((b) => b.id === id) || IDENT;
const toWorld = (x, z, b = blockAtPoint(x, z)) => [b.ox + x * b.sx, b.oz + z * b.sz];
// 実際の位置（メートル）から図面の座標へ
function toDrawing(x, z) {
  const b = BLOCK_LIST.find((k) => x >= k.world[0] - 0.5 && x <= k.world[2] + 0.5 && z >= k.world[1] - 0.5 && z <= k.world[3] + 0.5);
  return b ? [(x - b.ox) / b.sx, (z - b.oz) / b.sz] : [x, z];
}
// parent の中に、その棟の変換をかけたグループを作る（同じ棟なら使い回す）
function inBlock(parent, b) {
  const map = (parent.userData.blocks ||= {});
  if (!map[b.id]) {
    const g = new THREE.Group();
    g.position.set(b.ox, 0, b.oz);
    g.scale.set(b.sx, 1, b.sz);
    parent.add(g);
    map[b.id] = g;
  }
  return map[b.id];
}

// ---------- 部屋データ ----------
// 分ける部屋を、横にならんだ小さな部屋にする
const splitRooms = ROOMS_RAW.filter((r) => r.name !== "窯").flatMap((r) => { // 窯は工芸教室の中の家具にする
  const sp = ROOM_SPLITS.find((x) => x.name === r.name && x.floor === r.floor && x.r0 === r.r0);
  if (!sp) return [r];
  const w = (r.c1 - r.c0 + 1) / sp.n;
  return Array.from({ length: sp.n }, (_, i) => ({ ...r, id: `${r.id}-${i + 1}`, name: `${r.name}${i + 1}`, c0: r.c0 + w * i, c1: r.c0 + w * (i + 1) - 1 }));
});
const ROOMS = [...splitRooms, ...EXTRA_ROOMS].map((r) => {
  const ed = ROOM_EDITS.find((e) => e.name === r.name && e.floor === r.floor && (e.at === undefined || e.at === r.c0));
  if (ed) r = { ...r, ...ed.set };
  const d = describe(r.name);
  return { ...r, ...d, ...(r.desc ? { desc: r.desc } : {}), kind: "room" }; // ROOM_EDITS で紹介文を書いたときはそれを使う
});
STAIRS.forEach((s, i) => {
  s.floors.forEach((f) => {
    ROOMS.push({
      id: `F${f}-ST${i}`, name: s.name, floor: f, c0: s.c0, r0: s.r0, c1: s.c1, r1: s.r1,
      cat: "stairs", kind: "stairs", upTo: s.floors.includes(f + 1), fromBelow: s.floors.includes(f - 1),
      desc: `${s.floors.join("・")}階をつなぐ階段です。（位置は図面から読み取ったおおよその場所です）`,
    });
  });
});
// 図面で名前のない区画を、となりの部屋の一部としてつける（事務室のL字など）
for (const p of ROOM_PARTS) {
  const parent = ROOMS.find((r) => r.name === p.name && r.floor === p.floor && r.kind === "room");
  if (!parent) continue;
  const part = { ...p, id: parent.id + "-P" + ((parent.parts ||= []).length), cat: parent.cat, kind: "part", parent };
  parent.parts.push(part);
  ROOMS.push(part);
  // join：となりの部屋とのあいだに壁を立てない（つながっている）
  if (p.join) {
    const j = ROOMS.find((r) => r.name === p.join && r.floor === p.floor && r.kind === "room");
    if (j) { (parent.joined ||= []).push(j); j.joinedTo = parent; }
  }
}
ROOMS.forEach((r) => {
  const rc = rectOf(r);
  r.cx = (rc.x0 + rc.x1) / 2;
  r.cz = (rc.z0 + rc.z1) / 2;
  r.w = rc.x1 - rc.x0;
  r.d = rc.z1 - rc.z0;
  const ccx = (r.c0 + r.c1) / 2, ccr = (r.r0 + r.r1) / 2;
  // 航空写真に合わせたあとの位置と大きさ。2つの棟にまたがる部屋は、角ごとにその棟の位置を使う
  r.block = blockAtCell(Math.floor(ccx), Math.floor(ccr));
  let [wx0, wz0] = toWorld(rc.x0, rc.z0, blockAtCell(r.c0, r.r0));
  let [wx1, wz1] = toWorld(rc.x1, rc.z1, blockAtCell(r.c1, r.r1));
  // xBlock：東西の位置と幅は、この棟に合わせる（棟にまたがって細くなりすぎる部屋のため）
  if (r.xBlock) { const b = blockById(r.xBlock); wx0 = toWorld(rc.x0, 0, b)[0]; wx1 = toWorld(rc.x1, 0, b)[0]; }
  r.wx = (wx0 + wx1) / 2; r.wz = (wz0 + wz1) / 2; r.ww = wx1 - wx0; r.wd = wz1 - wz0;
  // 部屋の板・壁は r.block の中に置くので、その棟の図面の座標に戻しておく
  r.cx = (r.wx - r.block.ox) / r.block.sx; r.cz = (r.wz - r.block.oz) / r.block.sz;
  r.w = r.ww / r.block.sx; r.d = r.wd / r.block.sz;
  r.wing = WINGS.find((w) => areasOf(w).some((a) => ccx >= a[0] && ccx <= a[2] + 1 && ccr >= a[1] && ccr <= a[3] + 1));
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, Math.min(window.innerWidth, window.innerHeight) < 700 ? 1.5 : 2));
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
// 遠くの家並みは霧でうすくなって消えていく
scene.fog = new THREE.Fog(0xdde8f1, 230, 360);

const persp = new THREE.PerspectiveCamera(45, 1, 0.5, 1000);
persp.position.set(55, 75, 95);
const ortho = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 500);
ortho.position.set(0, 200, 0.001);
ortho.up.set(0, 0, -1);

const controls3d = new OrbitControls(persp, labelRenderer.domElement);
controls3d.enableDamping = true;
controls3d.maxPolarAngle = Math.PI * 0.48;
controls3d.minDistance = 12;
controls3d.maxDistance = 220;
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
// スマホなど小さい画面では影を軽くする
const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700 || /Android|iPhone|iPad/.test(navigator.userAgent);
sun.shadow.mapSize.set(isSmall ? 2048 : 4096, isSmall ? 2048 : 4096);
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
    gr.addColorStop(1, "#dde8f1");
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

// 外壁の色（白い壁と茶色いタイルの壁）
const PALETTE = {
  white: { base: "#f1eee7", band: "#e1ddd3", line: "#d3cec2", tile: false },
};
function wallBase(g, p) {
  g.fillStyle = p.base; g.fillRect(0, 0, W, H);
  noise(g, W, H, p.tile ? 0.12 : 0.06);
  if (p.tile) {
    // タイルの目地
    g.fillStyle = "rgba(255,240,220,0.10)";
    for (let y = 0; y < H; y += 0.25 * PX) g.fillRect(0, y, W, 1.5);
    for (let row = 0, y = 0; y < H; y += 0.25 * PX, row++) for (let x = (row % 2) * 0.3 * PX; x < W; x += 0.6 * PX) g.fillRect(x, y, 1.5, 0.25 * PX);
  }
}
function makeSchoolTex(p) {
  return canvasTex(W, H, (g) => {
    wallBase(g, p);
    // 床スラブの帯
    g.fillStyle = p.band; g.fillRect(0, yFromFloor(0.45), W, 0.45 * PX);
    g.fillStyle = p.line; g.fillRect(0, yFromFloor(0.45), W, 3);
    // 窓（写真では、床から約1.2mまでは白い腰壁で、窓はその上だけ）
    const x = 0.3 * PX, w = 2.4 * PX, y = yFromFloor(2.9), h = 1.65 * PX;
    glass(g, x, y, w, h);
    // 窓の内側の、両はしにまとめたクリーム色のカーテン（ひだ）。ところどころ少し引き出してある
    for (const [cx0, cw] of [[x + 4, 0.28 * PX], [x + w - 4 - 0.22 * PX, 0.22 * PX]]) {
      for (let i = 0; i < cw; i++) {
        const v = 200 + Math.sin(i / 2.2) * 22;
        g.fillStyle = `rgba(${v},${v - 6},${v - 28},0.85)`;
        g.fillRect(cx0 + i, y + 3, 1, h - 6);
      }
    }
    g.fillStyle = "#c3c8cc";
    g.fillRect(x + w / 2 - 2, y, 4, h);           // 縦の桟
    g.fillRect(x, yFromFloor(2.35), w, 4);         // 欄間
    // 腰壁の目地
    g.fillStyle = "rgba(0,0,0,0.07)"; g.fillRect(0, yFromFloor(1.15), W, 3);
    frame(g, x, y, w, h, 5);
    // 窓台の影
    g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x, y + h + 2, w, 4);
    // 窓台の両はしから下へのびる、うすい雨だれのよごれ
    for (const sx of [x + 6, x + w * 0.5, x + w - 10]) {
      const gr = g.createLinearGradient(0, y + h + 6, 0, y + h + 6 + 0.9 * PX);
      gr.addColorStop(0, "rgba(90,85,75,0.10)"); gr.addColorStop(1, "rgba(90,85,75,0)");
      g.fillStyle = gr; g.fillRect(sx, y + h + 6, 5 + Math.random() * 4, 0.9 * PX);
    }
    // 柱
    g.fillStyle = "rgba(0,0,0,0.05)"; g.fillRect(0, 0, 6, H); g.fillRect(W - 6, 0, 6, H);
  });
}
const texSchool = makeSchoolTex(PALETTE.white);

// 茶色いレンガタイルの壁（端の壁。窓はほとんどない）
const texBrick = canvasTex(W, H, (g) => {
  // 写真のレンガ：明るめの赤茶色で、1枚ずつ色が少しちがう。目地はうすい灰色
  g.fillStyle = "#b39a8c"; g.fillRect(0, 0, W, H);
  const bh = 0.12 * PX, bw = 0.3 * PX;
  for (let row = 0, y = 0; y < H; y += bh, row++) {
    for (let x = -(row % 2) * bw / 2; x < W; x += bw) {
      const v = Math.random() * 44 - 22;
      g.fillStyle = `rgb(${168 + v},${84 + v * 0.7},${64 + v * 0.5})`;
      g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
    }
  }
  // 床の位置の目地（少し濃い帯）
  g.fillStyle = "rgba(60,25,15,0.35)"; g.fillRect(0, yFromFloor(0.05), W, 4);
});

// 丸い階段塔（白い壁に横長の窓の帯）
const texStack = canvasTex(256, H, (g, w, h) => {
  g.fillStyle = "#f3f1ec"; g.fillRect(0, 0, w, h);
  noise(g, w, h, 0.05);
  g.fillStyle = "#5b6d7e"; g.fillRect(0, yFromFloor(2.4), w, 0.55 * PX);
  g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(0, yFromFloor(2.4), w, 4);
  g.fillStyle = "#d9d5cc"; g.fillRect(0, yFromFloor(1.15), w, 3);
  g.fillStyle = "#dcd8cf"; g.fillRect(0, yFromFloor(0.35), w, 0.35 * PX);
}, true);
texStack.repeat.set(4, 1);
const texTower = canvasTex(256, H, (g, w, h) => {
  g.fillStyle = "#f3f1ec"; g.fillRect(0, 0, w, h);
  noise(g, w, h, 0.05);
  // 横じまの帯（手すり壁）と窓
  g.fillStyle = "#c9c6bd"; for (const m of [0.95, 2.35]) g.fillRect(0, yFromFloor(m), w, 4);
  g.fillStyle = "#5b6d7e"; g.fillRect(0, yFromFloor(2.25), w, 0.7 * PX);
}, true);
texTower.repeat.set(6, 1);

const makeGymLow = (p) => canvasTex(W, H, (g) => {
  wallBase(g, p);
  g.fillStyle = p.band; g.fillRect(0, yFromFloor(0.45), W, 0.45 * PX);
  // 地窓
  glass(g, 0.4 * PX, yFromFloor(1.0), 2.2 * PX, 0.45 * PX);
  frame(g, 0.4 * PX, yFromFloor(1.0), 2.2 * PX, 0.45 * PX, 3);
  // 縦のリブ
  g.fillStyle = "rgba(0,0,0,0.06)";
  for (let i = 0; i < 6; i++) g.fillRect(i * W / 6, 0, 2, yFromFloor(1.1));
});
const texGymLow = makeGymLow(PALETTE.white);
const texGymHigh = canvasTex(W, H, (g) => {
  wallBase(g, PALETTE.white);
  const x = 0.3 * PX, w = 2.4 * PX, y = yFromFloor(3.2), h = 1.9 * PX;
  glass(g, x, y, w, h);
  g.fillStyle = "#c3c8cc"; g.fillRect(x + w / 3, y, 4, h); g.fillRect(x + 2 * w / 3, y, 4, h);
  frame(g, x, y, w, h, 5);
  g.fillStyle = "rgba(0,0,0,0.06)";
  for (let i = 0; i < 6; i++) g.fillRect(i * W / 6, yFromFloor(1.2), 2, 1.2 * PX);
});
const texHigh = canvasTex(W, H, (g) => {
  wallBase(g, PALETTE.white);
  g.fillStyle = PALETTE.white.band; g.fillRect(0, yFromFloor(0.45), W, 0.45 * PX);
  const x = 0.35 * PX, w = 2.3 * PX, y = yFromFloor(3.1), h = 1.4 * PX;
  glass(g, x, y, w, h);
  frame(g, x, y, w, h, 5);
});

// 芝生：細かい葉の粒と、刈り込みのむら（ところどころ明るい・暗いところ）
const texGrass = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = "#7a9e55"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 50 + Math.random() * 120;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, Math.random() < 0.5 ? "rgba(60,85,35,0.22)" : "rgba(170,180,100,0.18)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 40000; i++) {
    const l = 26 + Math.random() * 30;
    g.fillStyle = `hsla(${78 + Math.random() * 28},${30 + Math.random() * 20}%,${l}%,0.85)`;
    const x = Math.random() * w, y = Math.random() * h;
    g.fillRect(x, y, 1.2, 1.5 + Math.random() * 2.5); // 細長い葉
  }
});
texGrass.repeat.set(60, 60);


// 外のレンガ敷き（昇降口のあいだ・体育館のまわりの広場で同じものを使う）
function makeBrickFloorTex() {
  return canvasTex(256, 256, (g, W2, H2) => {
    g.fillStyle = "#a7685a"; g.fillRect(0, 0, W2, H2);
    const bh = 16, bw = 32;
    for (let row = 0, y = 0; y < H2; y += bh, row++) {
      for (let x = -(row % 2) * bw / 2; x < W2; x += bw) {
        const v = Math.random() * 26 - 13;
        g.fillStyle = `rgb(${172 + v},${108 + v * 0.6},${88 + v * 0.5})`; // 少し明るめのレンガ
        g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      }
    }
  });
}
const texBrickFloor = makeBrickFloorTex();

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
function boundarySegments(cells, classify = null) {
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
      const st = classify ? classify(c, r, d, style) : style;
      const gk = `${di}|${line}|${st}`;
      if (!groups.has(gk)) groups.set(gk, { di, line, style: st, pos: [] });
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
// 中央棟の北の屋根：屋根いっぱいに古い太陽光パネル（黒っぽい板が格子にならぶ）
const texPanelRoof = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const c = cv.getContext("2d");
  c.fillStyle = "#9a9a96"; c.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) for (let x = 0; x < 128; x += 32) {
    const v = Math.random() * 12;
    c.fillStyle = `rgb(${38 + v},${44 + v},${56 + v})`; c.fillRect(x + 1, y + 1, 30, 14);
    c.strokeStyle = "rgba(160,170,185,0.25)"; c.lineWidth = 0.6;
    for (let k = 1; k < 4; k++) { c.beginPath(); c.moveTo(x + 1 + k * 7.5, y + 1); c.lineTo(x + 1 + k * 7.5, y + 15); c.stroke(); }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
const matRoofDark = new THREE.MeshStandardMaterial({ map: texPanelRoof, color: 0xffffff, roughness: 0.4, metalness: 0.3 });

// 白い壁の柱と庇。柱は窓の区切りごと、庇は各階の上の端
const matRelief = new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.85 });
function wallRelief(segs, f) {
  const geos = [];
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); geos.push(g); };
  for (const sg of segs) {
    if (sg.style === "brick") continue;
    const gym = sg.style.startsWith("gym");
    const alongX = sg.n[1] !== 0; // 北・南向きの面は x 方向にのびる
    const len = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az);
    if (len < 2) continue;
    const [nx, nz] = sg.n;
    const y0 = base(f);
    // 柱（たて）
    const step = gym ? 6 : alongX ? 4.5 : 3.75;
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = sg.ax + (sg.bx - sg.ax) * t + nx * 0.2, z = sg.az + (sg.bz - sg.az) * t + nz * 0.2;
      const cd = gym ? 0.4 : 0.55; // 柱の出っ張り（教室棟は腰壁の帯より前に出る）
      box(alongX ? 0.45 : cd, FH, alongX ? cd : 0.45, x + nx * (cd / 2 - 0.2), y0 + FH / 2, z + nz * (cd / 2 - 0.2));
    }
    if (gym) {
      // 体育館は上のふちに細い庇
      const dep = 0.35;
      const cx = (sg.ax + sg.bx) / 2 + nx * dep / 2, cz = (sg.az + sg.bz) / 2 + nz * dep / 2;
      if (alongX) box(len + 0.4, 0.2, dep, cx, y0 + FH - 0.1, cz);
      else box(dep, 0.2, len + 0.4, cx, y0 + FH - 0.1, cz);
    } else if (sg.style === "office") {
      // 窓の上の小さな庇（写真の、窓ごとの茶色っぽい庇）
      const dep = 0.45;
      const cx = (sg.ax + sg.bx) / 2 + nx * dep / 2, cz = (sg.az + sg.bz) / 2 + nz * dep / 2;
      if (f < 3) { if (alongX) box(len + 0.2, 0.12, dep, cx, y0 + FH - 0.55, cz); else box(dep, 0.12, len + 0.2, cx, y0 + FH - 0.55, cz); }
    } else if (sg.style === "glassblock") {
      // 床の位置の白い梁だけ（腰はガラスブロックなので出っ張らない）
      const dep = 0.25, bh = 0.5;
      const cx = (sg.ax + sg.bx) / 2 + nx * dep / 2, cz = (sg.az + sg.bz) / 2 + nz * dep / 2;
      if (alongX) box(len + 0.3, bh, dep, cx, y0 + bh / 2 - 0.05, cz); else box(dep, bh, len + 0.3, cx, y0 + bh / 2 - 0.05, cz);
    } else {
      // 教室棟は、各階の下の白い腰壁の帯が外に出ている（写真の太い白い横帯）
      const dep = 0.3, bh = 1.25;
      const cx = (sg.ax + sg.bx) / 2 + nx * dep / 2, cz = (sg.az + sg.bz) / 2 + nz * dep / 2;
      if (alongX) box(len + 0.3, bh, dep, cx, y0 + bh / 2 - 0.05, cz);
      else box(dep, bh, len + 0.3, cx, y0 + bh / 2 - 0.05, cz);
    }
    // 1階の足もと（基礎の帯）
    if (f === 1) {
      const bx = (sg.ax + sg.bx) / 2 + nx * 0.1, bz = (sg.az + sg.bz) / 2 + nz * 0.1;
      if (alongX) box(len, 0.5, 0.2, bx, 0.05, bz); else box(0.2, 0.5, len, bx, 0.05, bz);
    }
  }
  const m = new THREE.Mesh(geos.length ? mergeGeometries(geos) : new THREE.BufferGeometry(), matRelief);
  m.castShadow = m.receiveShadow = true;
  return m;
}

// 太陽光パネル（屋上の長方形の中に、南向きに少し傾けてならべる）
const texSolar = canvasTex(64, 96, (g, w, h) => {
  g.fillStyle = "#1d2f5c"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#7f93b8"; g.lineWidth = 1;
  for (let x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.strokeStyle = "#c9ced6"; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
}, false);
const panelGeo = new THREE.BoxGeometry(1.0, 0.05, 1.6);
const panelMat = new THREE.MeshStandardMaterial({ map: texSolar, roughness: 0.35, metalness: 0.4 });
function solarPanels(rects, y) {
  const spots = [];
  for (const rc of rects) {
    const w = rc.x1 - rc.x0, d = rc.z1 - rc.z0;
    if (w < 6 || d < 4.5) continue;
    for (let z = rc.z0 + 1.6; z <= rc.z1 - 1.6; z += 2.2) {
      for (let x = rc.x0 + 1.2; x <= rc.x1 - 1.2; x += 1.05) {
        // 写真のように、ところどころ設備の白い四角があってパネルがない
        const k = Math.sin(Math.round(x / 3.2) * 12.99 + Math.round(z / 4.4) * 78.23) * 43758.55;
        if (k - Math.floor(k) < 0.12) continue;
        spots.push([x, z]);
      }
    }
  }
  const im = new THREE.InstancedMesh(panelGeo, panelMat, Math.max(1, spots.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.17, 0, 0));
  spots.forEach(([x, z], i) => { m4.compose(new THREE.Vector3(x, y + 0.35, z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); });
  im.count = spots.length;
  im.castShadow = true;
  return im;
}
// 廊下の床：学校によくある長尺シート（うすい灰緑色。かすかなまだら模様と、つなぎ目の線）
const texCorridor = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 256;
  const c = cv.getContext("2d");
  c.fillStyle = "#efe7d8"; c.fillRect(0, 0, 256, 256); // うすいベージュ
  for (let i = 0; i < 2500; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "90,100,90"},${Math.random() * 0.08})`; c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  c.fillStyle = "rgba(150,135,110,0.18)"; c.fillRect(0, 0, 256, 1.5); // 1.8m おきのつなぎ目
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
})();
const matSlab = new THREE.MeshStandardMaterial({ map: texCorridor, color: 0xffffff, roughness: 0.6 });
const wallMat = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0.0 });
const matStack = new THREE.MeshStandardMaterial({ map: texStack, roughness: 0.8 });
const matGlassDoor = new THREE.MeshStandardMaterial({ color: 0x3e5a74, roughness: 0.15, metalness: 0.3 });
const matStackSide = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.85, side: THREE.DoubleSide });
// フロア表示のときの外壁の高さ。外観と同じ模様の下の部分（レンガ・窓の下半分まで）を見せる
const CUT_H = 2.2;
const cutMats = {};
function cutMat(style) {
  if (!cutMats[style]) {
    const src = (MAT_WALL[style] || MAT_WALL.school).map;
    const t = src.clone();
    t.needsUpdate = true;
    t.repeat.set(1, CUT_H / FH);
    cutMats[style] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, side: THREE.DoubleSide });
  }
  return cutMats[style];
}
const matTower = new THREE.MeshStandardMaterial({ map: texTower, roughness: 0.8 });
// 2号館の中庭側（写真）：小さな窓が2つ（上にガラリ）のベイと、横長の窓のベイが交互。窓の上に小さな庇
// 模様1枚が2ベイ分（6m）
const texOffice = canvasTex(W * 2, H, (g) => {
  wallBase(g, PALETTE.white);
  g.save(); g.translate(W, 0); wallBase(g, PALETTE.white); g.restore(); // 右半分（2ベイめ）も塗る
  g.fillStyle = PALETTE.white.band; g.fillRect(0, yFromFloor(0.45), W * 2, 0.45 * PX);
  g.fillStyle = PALETTE.white.line; g.fillRect(0, yFromFloor(0.45), W * 2, 3);
  // ベイA：小さな窓2つ（トイレ・準備室など）と、その上のガラリ
  for (const x of [0.45 * PX, 1.85 * PX]) {
    const w = 0.7 * PX, y = yFromFloor(2.45), h = 1.0 * PX;
    glass(g, x, y, w, h);
    g.fillStyle = "#c3c8cc"; g.fillRect(x + w / 2 - 1.5, y, 3, h);
    frame(g, x, y, w, h, 4);
    g.fillStyle = "#b9bdc0"; g.fillRect(x, yFromFloor(2.85), w, 0.3 * PX);
    g.fillStyle = "rgba(0,0,0,0.25)"; for (let k = 0; k < 5; k++) g.fillRect(x, yFromFloor(2.85) + k * 5, w, 1.5);
  }
  // ベイB：横長の窓（教室・事務室など）
  {
    const x = W + 0.25 * PX, w = 2.5 * PX, y = yFromFloor(2.75), h = 1.55 * PX;
    glass(g, x, y, w, h);
    for (const [cx0, cw] of [[x + 4, 0.3 * PX], [x + w - 4 - 0.25 * PX, 0.25 * PX]]) for (let i = 0; i < cw; i++) { const v = 205 + Math.sin(i / 2.2) * 20; g.fillStyle = `rgba(${v},${v - 6},${v - 28},0.85)`; g.fillRect(cx0 + i, y + 3, 1, h - 6); }
    g.fillStyle = "#c3c8cc"; for (let k = 1; k < 4; k++) g.fillRect(x + (w * k) / 4 - 1.5, y, 3, h);
    g.fillRect(x, yFromFloor(2.3), w, 4);
    frame(g, x, y, w, h, 5);
  }
  // 雨どい
  g.fillStyle = "rgba(200,200,195,0.9)"; g.fillRect(W - 6, 0, 5, H);
});
// 中庭に面した渡り廊下（写真）：腰の部分がうすい緑のガラスブロック、上は窓
const texGlassBlock = canvasTex(W, H, (g) => {
  wallBase(g, PALETTE.white);
  const x = 0.15 * PX, w = 2.7 * PX;
  // ガラスブロック（20cm 角くらい）
  const y0 = yFromFloor(1.15), bh = 0.75 * PX;
  g.fillStyle = "#cfd8cf"; g.fillRect(x, y0, w, bh);
  const cell = 0.19 * PX;
  for (let yy = y0 + 2; yy < y0 + bh - 2; yy += cell) for (let xx = x + 2; xx < x + w - 2; xx += cell) {
    const v = Math.random() * 14;
    g.fillStyle = `rgb(${170 + v},${196 + v},${186 + v})`; g.fillRect(xx + 1.5, yy + 1.5, cell - 3, cell - 3);
    g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(xx + 3, yy + 3, cell * 0.35, 2);
  }
  // 上の窓（廊下の向こうの掲示物がうっすら見える）
  const wy = yFromFloor(2.75), wh = 1.45 * PX;
  glass(g, x, wy, w, wh);
  for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(${200 + Math.random() * 50},${180 + Math.random() * 60},${150 + Math.random() * 80},0.45)`; g.fillRect(x + 20 + i * 52, wy + 30, 34, 50); }
  g.fillStyle = "#c3c8cc"; for (let k = 1; k < 4; k++) g.fillRect(x + (w * k) / 4 - 1.5, wy, 3, wh);
  frame(g, x, wy, w, wh, 5);
  g.fillStyle = PALETTE.white.band; g.fillRect(0, yFromFloor(0.45), W, 0.45 * PX);
});

const MAT_WALL = {
  office: wallMat(texOffice),
  glassblock: wallMat(texGlassBlock),
  school: wallMat(texSchool),
  high: wallMat(texHigh),
  brick: wallMat(texBrick),
  gym2: wallMat(texGymLow),
  gym3: wallMat(texGymHigh),
};

const layers = { exterior: {}, roofs: {}, cut: {}, slab: {}, rooms: {}, labels: {}, furniture: {} };
const y0OfFloor = (f) => base(f);
const buildingGroup = new THREE.Group();
scene.add(buildingGroup);

for (const f of [1, 2, 3]) {
  // 外壁の色分け（info.js の FACADE で設定）。棟の境目で壁を分けるため、棟の名前もつけておく
  const facade = (c, r, d, style) => {
    const b = blockAtCell(c, r).id;
    const side = d.dr < 0 ? "n" : d.dr > 0 ? "s" : d.dc < 0 ? "w" : "e";
    if (WALL_OPENINGS.some(([ff, c0, r0, c1, r1, dir]) => ff === f && inCells(c, r, [c0, r0, c1, r1]) && (!dir || dir === side))) return "open|" + b;
    if (style === "gym") return "gym" + f + "|" + b;
    if (style === "high") return "high|" + b;
    if (OPEN_COURTS.some((rc) => inCells(c + d.dc, r + d.dr, rc))) return "school|" + b; // 光庭のまわりは白
    // 写真に合わせた面ごとの壁（[c0, r0, c1, r1, 向き]）
    for (const [st, list] of [["office", FACADE.office], ["glassblock", FACADE.glassblock]]) {
      if ((list || []).some(([c0, r0, c1, r1, dir]) => side === dir && inCells(c, r, [c0, r0, c1, r1]) && (f >= 2 || st === "office"))) return st + "|" + b;
    }
    if (FACADE.brick.some((rc) => inCells(c, r, rc))) return "brick|" + b;
    if (d.dc !== 0 && FACADE.endWallWings.some((rc) => inCells(c, r, rc))) return "brick|" + b; // 棟の東西の端
    return "school|" + b;
  };
  const segs = boundarySegments(OCC[f], facade);
  const segsByBlock = {};
  for (const sg of segs) {
    const [st, b] = sg.style.split("|");
    sg.style = st;
    if (st === "open") continue;
    (segsByBlock[b] ||= []).push(sg);
  }
  const ext = new THREE.Group();
  const cut = new THREE.Group();
  for (const [bid, list] of Object.entries(segsByBlock)) {
    const b = blockById(bid);
    const holder = inBlock(ext, b);
    const byStyle = {};
    for (const sg of list) (byStyle[sg.style] ||= []).push(sg);
    if (bid === "bridge") {
      // 渡り廊下：下半分だけの腰壁で、上半分は開いている（柱が屋根を支える）
      // 床（下から見える厚い板）と、厚みのある腰壁
      const rc = rectOf({ c0: 27, r0: 19, c1: 32, r1: 21 });
      const fl = new THREE.Mesh(new THREE.BoxGeometry(rc.x1 - rc.x0, 0.4, rc.z1 - rc.z0), matRelief);
      fl.position.set((rc.x0 + rc.x1) / 2, base(f) - 0.2, (rc.z0 + rc.z1) / 2);
      fl.castShadow = fl.receiveShadow = true;
      holder.add(fl);
      for (const sg of list) {
        const len = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), alongX = sg.n[1] !== 0;
        const w = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.2, 1.7, alongX ? 0.2 : len), matRelief); // 腰壁は少し高め（1.7m）
        w.position.set((sg.ax + sg.bx) / 2, base(f) + 0.85, (sg.az + sg.bz) / 2);
        w.castShadow = w.receiveShadow = true;
        holder.add(w);
      }
      for (const sg of list) {
        const len = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), n = Math.max(1, Math.round(len / 3));
        for (let i = 0; i <= n; i++) {
          const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, FH - 1.7, 0.25), matRelief);
          p.position.set(sg.ax + ((sg.bx - sg.ax) * i) / n, base(f) + 1.7 + (FH - 1.7) / 2, sg.az + ((sg.bz - sg.az) * i) / n);
          holder.add(p);
        }
      }
    } else {
      for (const [st, l2] of Object.entries(byStyle)) {
        const m = new THREE.Mesh(wallGeometry(l2, base(f), FH, st === "office" ? 1 / (2 * BAY) : 1 / BAY), MAT_WALL[st] || MAT_WALL.school);
        m.castShadow = true; m.receiveShadow = true;
        holder.add(m);
      }
      // 白い壁の立体感：窓のあいだの柱と、各階の床の位置の庇（ひさし）
      holder.add(wallRelief(list, f));
    }
    // 切断した壁（フロア表示用）
    // 外の壁は窓の下の部分まで見えるように、外壁の模様の下の方を使う
    for (const [st, l2] of Object.entries(byStyle)) {
      const cm = new THREE.Mesh(wallGeometry(l2, base(f), CUT_H, st === "office" ? 1 / (2 * BAY) : 1 / BAY), cutMat(st));
      cm.castShadow = true; cm.receiveShadow = true;
      inBlock(cut, b).add(cm);
    }
  }
  // 白い丸い階段塔（位置は実際のメートル）
  // 半円のバルコニー（東の壁から半円に出る）と、音楽室の横の半円の塔（北の壁から出る）
  for (const t of FACADE.roundStairs) {
    if (!t.tower && t.strip) {
      // 白いたての帯（レンガの壁の上に少し出る）と、両はしの柱
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.16, FH, t.strip), matRelief);
      band.position.set(t.x + 0.08, base(f) + FH / 2, t.z);
      ext.add(band);
      for (const s of [-1, 1]) { const col = new THREE.Mesh(new THREE.BoxGeometry(0.45, FH, 0.4), matRelief); col.position.set(t.x + 0.22, base(f) + FH / 2, t.z + s * (t.strip / 2 + 0.2)); col.castShadow = true; ext.add(col); }
      if (f === 1 && t.noDoor) {
        const w1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.6, 0.9), matGlassDoor);
        w1.position.set(t.x + 0.2, 1.6, t.z);
        ext.add(w1);
      } else if (f === 1) {
        // 1階は出入口（ガラス戸）と小さな段
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 1.0), matGlassDoor);
        door.position.set(t.x + 0.18, 1.0, t.z);
        const step = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 1.8), matRelief);
        step.position.set(t.x + 0.6, -0.05, t.z);
        ext.add(door, step);
      }
      if (!t.floors.includes(f)) continue;
      // 半円のバルコニー（下は丸い腰壁で囲まれた形）
      const slab = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 0.22, 24, 1, false, 0, Math.PI), matRelief);
      slab.position.set(t.x + 0.16, base(f), t.z);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 1.1, 24, 1, false, 0, Math.PI), matStackSide);
      rail.position.set(t.x + 0.16, base(f) + 0.55, t.z);
      for (const m of [slab, rail]) { m.castShadow = m.receiveShadow = true; ext.add(m); }
      // バルコニーの上の窓と、バルコニーの下の小さな窓
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.8), matGlassDoor);
      win.position.set(t.x + 0.2, base(f) + 1.9, t.z);
      const win2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.7), matGlassDoor);
      win2.position.set(t.x + 0.2, base(f) - 1.3, t.z);
      ext.add(win, win2);
      continue;
    }
    if (!t.tower) {
      // 床（半円の板）と、手すり壁（半円の輪）。東向きの半分＝theta 0〜π
      const slab = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 0.22, 24, 1, false, 0, Math.PI), matRelief);
      slab.position.set(t.x, base(f) + 0.0, t.z);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 1.1, 24, 1, true, 0, Math.PI), matStackSide);
      rail.position.set(t.x, base(f) + 0.65, t.z);
      for (const m of [slab, rail]) { m.castShadow = m.receiveShadow = true; ext.add(m); }
      // バルコニーに出る窓（ガラス戸と白い枠）を、うしろの壁につける
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 2.2), matRelief);
      frame.position.set(t.x + 0.04, base(f) + 1.3, t.z);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 1.9), matGlassDoor);
      pane.position.set(t.x + 0.1, base(f) + 1.25, t.z);
      ext.add(frame, pane);
      continue;
    }
    // 北向きの半分＝theta π/2〜3π/2
    const m = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, FH, 28, 1, false, Math.PI / 2, Math.PI), matTower);
    m.position.set(t.x, base(f) + FH / 2, t.z);
    m.castShadow = m.receiveShadow = true;
    ext.add(m);
    if (f === 3) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(t.r + 0.1, t.r + 0.1, 0.5, 28, 1, false, Math.PI / 2, Math.PI), matParapet);
      cap.position.set(t.x, base(f) + FH + 0.25, t.z);
      cap.castShadow = true;
      ext.add(cap);
    }
  }
  layers.exterior[f] = ext;
  buildingGroup.add(ext);
  layers.cut[f] = cut;
  buildingGroup.add(cut);

  // 屋上（上の階がない部分）
  const roofCells = new Set();
  for (const [k, st] of OCC[f]) {
    if (st === "gym" && f === 3) continue;
    if (f === 2 && blockAtCell(...k.split(",").map(Number)).id === "art") continue; // 図書室の棟は2階の上に寄棟の屋根（別に作る）
    if (f === 3 && st === "high") continue;
    if (f === 3 || !OCC[f + 1].has(k)) roofCells.add(k);
  }
  const roof = new THREE.Group();
  // 屋根の種類：中央棟の北半分は黒っぽい屋根（古い太陽光パネル）、ほかは明るい灰色。棟ごとに分ける
  const groups = {};
  for (const k of roofCells) {
    const [c, r] = k.split(",").map(Number);
    const kind = c >= 33 && c <= 41 && r <= 26 ? "dark" : "light";
    const gk = kind + "|" + blockAtCell(c, r).id;
    (groups[gk] ||= new Set()).add(k);
  }
  for (const [gk, set] of Object.entries(groups)) {
    const [kind, bid] = gk.split("|");
    const holder = inBlock(roof, blockById(bid));
    const rects = cellsToRects(set);
    const geos = rects.map((r) => {
      const rc = rectOf(r);
      const g = new THREE.BoxGeometry(rc.x1 - rc.x0, 0.3, rc.z1 - rc.z0);
      g.translate((rc.x0 + rc.x1) / 2, base(f) + FH + 0.15, (rc.z0 + rc.z1) / 2);
      return g;
    });
    const mg = mergeGeometries(geos);
    if (kind === "dark") { // パネルの模様を、屋根の大きさに合わせてくり返す（4mで1枚の模様）
      const p = mg.attributes.position, uv = mg.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 4, p.getZ(i) / 4);
    }
    const rm = new THREE.Mesh(mg, kind === "dark" ? matRoofDark : matRoof);
    rm.receiveShadow = true; rm.castShadow = true;
    holder.add(rm);
    // 1号館・2号館・3号館の屋上には太陽光パネルがある
    if (f === 3 && kind === "light" && ["w1", "w2", "w3"].includes(bid)) holder.add(solarPanels(rects.map(rectOf), base(f) + FH + 0.3));
  }
  if (roofCells.size) {
    // パラペット（屋上のふち）。となりに同じ階の建物があるところには作らない
    const roofMap = new Map([...roofCells].map((k) => [k, "p"]));
    const psegs = boundarySegments(roofMap, (c, r) => blockAtCell(c, r).id).filter((sg) => {
      const mx = (sg.ax + sg.bx) / 2 + sg.n[0] * 0.3, mz = (sg.az + sg.bz) / 2 + sg.n[1] * 0.3;
      const c = Math.floor(mx / CW + C_MID), r = Math.floor(mz / RH + R_MID);
      return !OCC[f].has(key(c, r));
    });
    const byB = {};
    for (const sg of psegs) (byB[sg.style] ||= []).push(sg);
    for (const [bid, list] of Object.entries(byB)) {
      const pm = new THREE.Mesh(wallGeometry(list, base(f) + FH, 0.75), matParapet);
      pm.castShadow = true;
      inBlock(roof, blockById(bid)).add(pm);
    }
  }
  layers.roofs[f] = roof;
  buildingGroup.add(roof);

  // 床（フロア表示用）
  const slab = new THREE.Group();
  const slabSets = {};
  for (const [k, st] of OCC[f]) {
    const [c, r] = k.split(",").map(Number);
    // 3階の体育館は吹き抜け。ギャラリー（細い通路）と卓球場などの部屋のところだけ床がある
    if (f === 3 && st === "gym" && !GYM_GALLERY.some((g) => inCells(c, r, g)) && r < 33) continue;
    if (f === 3 && st === "high") continue;
    // 下の階から上ってくる階段のところは床に穴をあける
    if (STAIRS.some((sr) => sr.floors.includes(f - 1) && sr.floors.includes(f) && inCells(c, r, [sr.c0, sr.r0, sr.c1, sr.r1]))) continue;
    (slabSets[blockAtCell(c, r).id] ||= new Set()).add(k);
  }
  for (const [bid, set] of Object.entries(slabSets)) {
    const geos = cellsToRects(set).map((r) => {
      const rc = rectOf(r);
      const g = new THREE.BoxGeometry(rc.x1 - rc.x0, 0.25, rc.z1 - rc.z0);
      g.translate((rc.x0 + rc.x1) / 2, base(f) - 0.1, (rc.z0 + rc.z1) / 2);
      return g;
    });
    const mg = mergeGeometries(geos);
    { const p = mg.attributes.position, uv = mg.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 1.8, p.getZ(i) / 1.8); }
    const m = new THREE.Mesh(mg, matSlab);
    m.receiveShadow = true;
    inBlock(slab, blockById(bid)).add(m);
  }
  // 体育館3階のギャラリーの手すり（吹き抜け側）
  if (f === 3) {
    const g1 = new THREE.BoxGeometry(0.12, 1.1, Z(33) - Z(8));
    g1.translate(X(25), base(3) + 0.55, (Z(8) + Z(33)) / 2);
    const g2 = new THREE.BoxGeometry(X(25) - X(7), 1.1, 0.12);
    g2.translate((X(7) + X(25)) / 2, base(3) + 0.55, Z(33));
    const g3 = new THREE.BoxGeometry(X(25) - X(23), 1.1, 0.12);
    g3.translate((X(23) + X(25)) / 2, base(3) + 0.55, Z(8));
    const rail = new THREE.Mesh(mergeGeometries([g1, g2, g3]), matSlab);
    rail.castShadow = true;
    inBlock(slab, blockById("gym")).add(rail);
  }
  layers.slab[f] = slab;
  buildingGroup.add(slab);
}

// 図書室の棟のピンク色の寄棟屋根
{
  const rc = rectOf({ c0: 9, r0: 44, c1: 22, r1: 62 });
  const ov = 0.5, y = 2 * FH, rise = 3.2; // 2階の上
  const x0 = rc.x0 - ov, x1 = rc.x1 + ov, z0 = rc.z0 - ov, z1 = rc.z1 + ov;
  const h = (z1 - z0) / 2, zc = (z0 + z1) / 2;
  const v = [
    [x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1],
    [x0 + h, y + rise, zc], [x1 - h, y + rise, zc],
  ];
  const faces = [[0, 4, 5], [0, 5, 1], [1, 5, 2], [2, 5, 4], [2, 4, 3], [3, 4, 0]];
  const pos = [];
  for (const fc of faces) for (const i of fc) pos.push(...v[i]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const hip = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xd4917e, roughness: 0.75, side: THREE.DoubleSide }));
  hip.castShadow = hip.receiveShadow = true;
  inBlock(layers.roofs[2], blockById("art")).add(hip);
}

// 中央棟の屋上の設備（白い箱）
for (const [c, r] of [[36, 15], [36, 30]]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3), new THREE.MeshStandardMaterial({ color: 0xf2f2ee }));
  m.position.set(X(c), 3 * FH + 1.1, Z(r));
  m.castShadow = true;
  inBlock(layers.roofs[3], blockById("spine")).add(m);
}

// 体育館の屋根：真ん中は茶色い金属の切妻屋根、北の端（ステージ側）と南の端（卓球場の上）は平らな屋根
const gymRect = rectOf({ c0: 7, r0: 6, c1: 26, r1: 31 });
const gymRoof = (() => {
  const g = new THREE.Group();
  const y0 = 3 * FH, rise = 1.8, ov = 0.6;
  const w = gymRect.x1 - gymRect.x0, d = gymRect.z1 - gymRect.z0;
  const cx = (gymRect.x0 + gymRect.x1) / 2, cz = (gymRect.z0 + gymRect.z1) / 2;
  const half = w / 2 + ov;
  const slope = Math.hypot(half, rise);
  const ang = Math.atan2(rise, half);
  const ribTex = canvasTex(256, 64, (c, W2, H2) => {
    c.fillStyle = "#8f8276"; c.fillRect(0, 0, W2, H2);
    c.fillStyle = "#6e645b"; for (let i = 0; i < 4; i++) c.fillRect(0, i * 16, W2, 3);
    // さびの筋
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(${150 + Math.random() * 40},${80 + Math.random() * 30},50,${Math.random() * 0.25})`;
      c.fillRect(Math.random() * W2, 0, 2 + Math.random() * 6, H2);
    }
  });
  ribTex.repeat.set(1, d / 1.2);
  const roofMat = new THREE.MeshStandardMaterial({ map: ribTex, roughness: 0.6, metalness: 0.25 });
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.25, d + ov), roofMat);
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
  // 平らな部分
  const flat = (r0, r1, color) => {
    const rc = rectOf({ c0: 7, r0, c1: 26, r1 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(rc.x1 - rc.x0, 0.3, rc.z1 - rc.z0), new THREE.MeshStandardMaterial({ map: texRoofTop, color, roughness: 0.9 }));
    m.position.set((rc.x0 + rc.x1) / 2, y0 + 0.15, (rc.z0 + rc.z1) / 2);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return { ...rc, mat: m.material };
  };
  // 北の端：さびたオレンジ色の平らな屋根。南の端：黒っぽい金属板にさびが出た屋根（太陽光パネルではない）
  flat(1, 5, 0xb97a45).mat.map = rustTex();
  const south = flat(32, 38, 0x6a6c6c);
  south.mat.map = canvasTex(256, 128, (c, W2, H2) => {
    c.fillStyle = "#7a7c7b"; c.fillRect(0, 0, W2, H2);
    c.fillStyle = "#4e5152";
    for (let y = 6; y < H2; y += 16) for (let x = (y % 32 ? 0 : 20); x < W2; x += 44) c.fillRect(x, y, 38, 9); // 継ぎ目のある板
    c.fillStyle = "rgba(170,100,45,0.55)"; c.fillRect(0, 0, W2, 6); c.fillRect(0, H2 - 8, W2, 8); c.fillRect(0, 0, 6, H2);  // ふちのさび
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(160,95,45,${Math.random() * 0.35})`; c.fillRect(Math.random() * W2, Math.random() * H2, 4 + Math.random() * 10, 2); }
  });
  return g;
})();
inBlock(buildingGroup, blockById("gym")).add(gymRoof);

// さびた金属の屋根の模様
function rustTex() {
  return canvasTex(128, 128, (c, W2, H2) => {
    c.fillStyle = "#a0623a"; c.fillRect(0, 0, W2, H2);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${90 + Math.random() * 80},${50 + Math.random() * 30},30,${Math.random() * 0.4})`; c.fillRect(Math.random() * W2, Math.random() * H2, 3 + Math.random() * 8, 2); }
    c.fillStyle = "rgba(0,0,0,0.15)"; for (let x = 0; x < W2; x += 8) c.fillRect(x, 0, 2, H2);
  });
}
// 渡り廊下の屋根は、白い平らな屋根
{
  const rc = rectOf({ c0: 27, r0: 19, c1: 32, r1: 21 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(rc.x1 - rc.x0, 0.35, rc.z1 - rc.z0), matRelief);
  m.position.set((rc.x0 + rc.x1) / 2, 2 * FH + 0.2, (rc.z0 + rc.z1) / 2);
  m.castShadow = true;
  inBlock(layers.roofs[2], blockById("bridge")).add(m);
  // 屋根は体育館の壁にくっつくまでのびている（体育館東の外廊下の上）
  const gw = blockById("gym").world, bw = blockById("bridge").world;
  const ext = new THREE.Mesh(new THREE.BoxGeometry(bw[0] - gw[2] + 0.2, 0.35, bw[3] - bw[1]), m.material);
  ext.position.set((gw[2] + bw[0]) / 2, 2 * FH + 0.2, (bw[1] + bw[3]) / 2);
  ext.castShadow = true;
  layers.roofs[2].add(ext);
}

// 体育館の外まわり：西側の通路（手すり壁つき）と北の端の外階段、南側の2階のテラスと外階段、1階の柱
{
  const white = matRelief;
  const geos1 = [], geos2 = [];
  const box = (list, w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); list.push(g); };
  // 階段（段を積む）。(x0,z0) が下、(x1,z1) が上
  const stair = (list, x0, z0, x1, z1, y0, y1, width) => {
    const n = Math.max(4, Math.round((y1 - y0) / 0.18));
    const dx = (x1 - x0) / n, dz = (z1 - z0) / n, rise = (y1 - y0) / n;
    const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let i = 0; i < n; i++) {
      const cx = x0 + dx * (i + 0.5), cz = z0 + dz * (i + 0.5), top = y0 + rise * (i + 1);
      if (alongX) box(list, Math.abs(dx) + 0.02, top, width, cx, top / 2, cz);
      else box(list, width, top, Math.abs(dz) + 0.02, cx, top / 2, cz);
    }
    // 手すり壁（両側。段にそって傾けた細い板）
    const L = Math.hypot(x1 - x0, z1 - z0), S = Math.hypot(L, y1 - y0);
    const ang = Math.atan2(y1 - y0, L) * (alongX ? Math.sign(x1 - x0) : -Math.sign(z1 - z0));
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(alongX ? S : 0.15, 1.0, alongX ? 0.15 : S), white);
      rail.position.set((x0 + x1) / 2 + (alongX ? 0 : s * width / 2), (y0 + y1) / 2 + 0.6, (z0 + z1) / 2 + (alongX ? s * width / 2 : 0));
      if (alongX) rail.rotation.z = ang; else rail.rotation.x = ang;
      rail.castShadow = true;
      gymExtras.add(rail);
    }
  };
  const gymExtras = new THREE.Group();
  const gx = X(7), gz0 = Z(1), gz1 = Z(39), gxe = X(27);
  // 2階の高さで体育館を囲む外廊下（渡り廊下）。東側で中央棟からの渡り廊下につながり、南の2階の玄関まで行ける
  const ty = FH, dw = 3; // 床の高さ、幅
  const zTop = gz0 + 2, zBot = gz1 + 2.5;
  const deck = (x0, x1, z0, z1) => box(geos2, x1 - x0, 0.3, z1 - z0, (x0 + x1) / 2, ty - 0.15, (z0 + z1) / 2);
  // 外廊下の腰壁（写真では高め、約1.6m）
  const rail = (x0, x1, z0, z1) => box(geos2, Math.max(0.18, x1 - x0), 1.6, Math.max(0.18, z1 - z0), (x0 + x1) / 2, ty + 0.65, (z0 + z1) / 2);
  // 西側は、北の端の踊り場だけ2階の高さ。そこから南に向かって1階へ下りる外階段がある（写真）
  const landL = 3, stairL = 9.4, sw = 2.4;
  // 外階段は外廊下のさらに外（西）。北の端で外廊下から西へ踊り場が張り出し、そこから南へ下りる
  const so = gx - sw - 0.2;                      // 外廊下の外のふち
  deck(so - sw - 0.2, so, zTop, zTop + landL);  // 北西の踊り場（外廊下の外）
  // 西側の2階の外廊下（体育館の長さいっぱい）
  // 写真：体育館の西の壁ぞいに、北の踊り場から南へ1階へ下りる外階段。その南から外廊下が続く
  deck(gx - sw - 0.2, gx, zTop, gz1 + 2.5);       // 外廊下は北から南までつながる
  rail(so, so, zTop + landL + stairL, gz1 + 2.5);  // 階段の南から先の外廊下の手すり
  rail(so - sw - 0.2, so - sw - 0.2, zTop, zTop + landL); // 踊り場の西の手すり
  rail(so - sw - 0.2, so, zTop, zTop);
  rail(gx - sw - 0.2, gx, gz1 + 2.5, gz1 + 2.5); // 西の外廊下の南のはし（落ちないように手すり）
  deck(gx, gxe + dw, gz1, zBot);                // 南
  deck(gxe, gxe + dw, zTop, gz1);               // 東
  rail(gx - sw - 0.2, gx, zTop, zTop);
  // 南：保健体育科準備室（西の端）の前が踊り場。そこから東へ下りる外階段
  const pl = 3.2, sl = 9.4;
  deck(gx, gx + pl, zBot, zBot + 2.5);
  rail(gx + pl, gxe + dw, zBot, zBot);
  rail(gx, gx, zBot, zBot + 2.5);
  rail(gx, gx + pl, zBot + 2.5, zBot + 2.5);
  // 中央棟からの渡り廊下がつながるところは手すりなし（渡り廊下の実際の位置を、体育館の図面の座標に直す）
  const gb = blockById("gym"), brw = blockById("bridge").world;
  const bz0 = (brw[1] - gb.oz) / gb.sz, bz1 = (brw[3] - gb.oz) / gb.sz;
  // 東：北の端に踊り場。そこから南へ下りる外階段（外廊下の外側）
  deck(gxe + dw, gxe + dw + 2.4, zTop, zTop + 2.4);
  rail(gxe + dw + 2.4, gxe + dw + 2.4, zTop, zTop + 2.4);
  rail(gxe + dw, gxe + dw + 2.4, zTop, zTop);
  rail(gxe + dw, gxe + dw, zTop + 2.4, bz0);
  rail(gxe + dw, gxe + dw, bz1, zBot);
  rail(gxe, gxe + dw, zTop, zTop);
  box(geos2, 0.35, ty, 0.35, gxe + dw + 2.2, ty / 2 - 0.15, zTop + 0.2);
  // 外廊下と踊り場を支える柱
  for (let z = zTop; z <= zBot; z += 4.5) box(geos2, 0.35, ty, 0.35, gxe + dw - 0.3, ty / 2 - 0.15, z);
  for (let x = gx; x <= gxe + dw; x += 4.5) box(geos2, 0.35, ty, 0.35, x, ty / 2 - 0.15, zBot - 0.3);
  box(geos2, 0.35, ty, 0.35, gx - sw, ty / 2 - 0.15, zTop + 0.3);
  box(geos2, 0.35, ty, 0.35, so - sw, ty / 2 - 0.15, zTop + 0.3);
  box(geos2, 0.35, ty, 0.35, so - sw, ty / 2 - 0.15, zTop + landL - 0.3);
  // 外階段：北西の踊り場から南へ1階に下りる階段と、南側の外から2階に上がる階段
  // 外廊下のさらに西に、北の踊り場へ上がる外階段（南から北へ上る）
  stair(geos1, so - sw / 2 - 0.1, zTop + landL + stairL, so - sw / 2 - 0.1, zTop + landL, -0.2, ty, sw);
  for (let z = zTop + 4.5; z <= gz1; z += 4.5) box(geos2, 0.35, ty, 0.35, gx - sw, ty / 2 - 0.15, z);
  // 南側の2階の入口の上は、3階の床がのびた ひさし
  box(geos2, gxe + dw - gx, 0.35, zBot + 2.5 - gz1, (gx + gxe + dw) / 2, 2 * FH - 0.2, (gz1 + zBot + 2.5) / 2);
  stair(geos1, gx + pl + sl, zBot + 1.25, gx + pl, zBot + 1.25, -0.2, ty, 2.3);
  stair(geos1, gxe + dw + 1.2, zTop + 2.4 + sl, gxe + dw + 1.2, zTop + 2.4, -0.2, ty, 2.3);
  // 1階の南側の柱（柱が並ぶ吹きさらしの部分）
  for (let x = gx + 9; x < gxe; x += 4.2) box(geos2, 0.5, FH, 0.5, x, FH / 2 - 0.2, gz1 + 0.3);
  // その奥の茶色い壁と、柱のあいだのアーチ（写真：大きなアーチが並び、奥が茶色）
  {
    const brown = new THREE.MeshStandardMaterial({ color: 0x7a4b38, roughness: 0.9 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(gxe - gx - 8.5, FH - 0.2, 0.3), brown);
    back.position.set((gx + 8.5 + gxe) / 2, FH / 2 - 0.3, gz1 - 2.5);
    back.receiveShadow = true;
    gymExtras.add(back);
    for (let x = gx + 9; x + 4.2 <= gxe + 0.1; x += 4.2) {
      // 柱と柱のあいだの上を、半円にくりぬいた白い壁でふさぐ
      const sh = new THREE.Shape();
      sh.moveTo(0, -0.65); sh.lineTo(0, 1.6); sh.lineTo(4.2, 1.6); sh.lineTo(4.2, -0.65); sh.lineTo(3.95, -0.65);
      sh.absarc(2.1, -0.65, 1.85, 0, Math.PI, false); sh.lineTo(0, -0.65);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.4, bevelEnabled: false, curveSegments: 16 });
      const arch = new THREE.Mesh(g, white);
      arch.position.set(x, FH - 1.8, gz1 + 0.1);
      arch.castShadow = true;
      gymExtras.add(arch);
    }
  }
  const gymHolder = inBlock(layers.exterior[1], blockById("gym"));
  for (const list of [geos1, geos2]) {
    const m = new THREE.Mesh(mergeGeometries(list), white);
    m.castShadow = m.receiveShadow = true;
    gymHolder.add(m);
  }
  gymHolder.add(gymExtras);
}

// ---------- 地面・植栽 ----------
// まわりの土地は斜面（北が高く南が低い）。敷地の形に穴をあけてある
setSlope(SITE.slope);
const grassFar = texGrass.clone(); grassFar.needsUpdate = true; grassFar.repeat.set(1, 1);
const ground = buildTerrain(SITE.boundary, new THREE.MeshStandardMaterial({ map: grassFar, roughness: 1 }), SITE.roads);
scene.add(ground);
// 斜面の地面のさらに外：遠くまで続く平らな地面（四角いはしが見えないように。霧で空にとけこむ）
const farGround = new THREE.Mesh(new THREE.RingGeometry(150, 2500, 48, 1), new THREE.MeshStandardMaterial({ color: 0x8fa874, roughness: 1 }));
farGround.rotation.x = -Math.PI / 2;
farGround.position.y = -2.5;
scene.add(farGround);

// 学校の敷地（アスファルト）
// 学校の敷地（芝生・植え込み）と、舗装している範囲（アスファルト）
const siteBB = polyBounds(SITE.boundary);
const siteGrassTex = texGrass.clone(); siteGrassTex.needsUpdate = true;
siteGrassTex.repeat.set((siteBB.x1 - siteBB.x0) / 6, (siteBB.z1 - siteBB.z0) / 6);
const siteGround = flatPoly(SITE.boundary, new THREE.MeshStandardMaterial({ map: siteGrassTex, color: 0xd6e6c4, roughness: 1 }), -0.23, siteBB);
scene.add(siteGround);
const bb = polyBounds(SITE.paved);
// 構内の舗装はアスファルト（道路より少し明るい）
const pavingTex = texAsphalt.clone(); pavingTex.needsUpdate = true;
pavingTex.repeat.set((bb.x1 - bb.x0) / 6, (bb.z1 - bb.z0) / 6);
const paving = flatPoly(SITE.paved, new THREE.MeshStandardMaterial({ map: pavingTex, color: 0xd2d0cb, roughness: 0.95 }), 0, bb);
paving.position.y = -0.2;
paving.receiveShadow = true;
scene.add(paving);

// 体育館と校舎のあいだのピンク色の舗装、1号館と2号館のあいだの中庭
const outdoor = new THREE.Group();
scene.add(outdoor);
{
  const flatRect = (x0, x1, z0, z1, mat, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.receiveShadow = true;
    if (mat.userData.uvScale) worldUV(m, mat.userData.uvScale); // 模様の大きさを実際の長さに合わせる
    outdoor.add(m);
  };
  // 体育館のまわりの広場は、昇降口のあいだと同じ茶色いレンガ敷き
  const pinkTex = texBrickFloor.clone(); pinkTex.needsUpdate = true; pinkTex.repeat.set(10, 10);
  const pink = new THREE.MeshStandardMaterial({ map: pinkTex, roughness: 0.95 });
  // 体育館と中央棟のあいだ、体育館の南、図書室の棟と中央棟のあいだ
  // （位置は航空写真で測った実際のメートル）
  flatRect(-13.4, -4.95, -14.9, 10.4, pink, -0.19);
  flatRect(-43.5, -13.4, 2.7, 10.4, pink, -0.19); // 重ならないように分ける
  flatRect(-16.3, -4.95, 10.4, 33.0, pink, -0.19);
  // 武道場の前のピロティ（体育館の2階の下）も、同じレンガ敷き
  {
    const [px0, pz0] = toWorld(X(20), Z(23), blockById("gym")), [px1, pz1] = toWorld(X(27), Z(39), blockById("gym"));
    flatRect(px0, px1, pz0, pz1, pink, -0.188);
  }
  const planter = matHedge;
  // 図書室の棟と中央のあいだのレンガの広場の植え込み（航空写真をなぞった形）
  // 北：こんもりした丸い木のかたまり、南：だ円形の植え込み
  outdoor.add(hedgeMass([[-12.7, 20.7, 1.7], [-10, 21.3, 1.6], [-9.1, 18.6, 1.5], [-12.4, 18.2, 1.6], [-10.8, 19.8, 1.6]], 2.6));
  outdoor.add(hedgeMass([[-10.8, 27.1, 1.3], [-8.6, 26.6, 1.5], [-6.6, 27.2, 1.3], [-9.6, 28.0, 1.3], [-7.6, 28.0, 1.2]], 1.5));
  // 広場の色ちがいの舗装（こげ茶の四角）
  const dark = new THREE.MeshStandardMaterial({ color: 0x6e4a3e, roughness: 1 });
  flatRect(-16.3, -8.5, 13.3, 15.8, dark, -0.186);
  flatRect(-6.6, -4.95, 12.6, 18.6, dark, -0.186);
  // 1号館と2号館のあいだの中庭（アスファルト、十字の通路、植え込み）
  const court = new THREE.MeshStandardMaterial({ map: texAsphalt, roughness: 0.95 });
  court.userData.uvScale = 6;
  flatRect(10.3, 49, -8.3, 8.1, court, -0.19);
  // （真上からの航空写真で測った形）
  // 白い通路：西の入口から植え込みまでの東西の通路、植え込みの両はしにつながる南北の通路、東の端の通路
  const walk = new THREE.MeshStandardMaterial({ map: texPavers, roughness: 0.95 });
  walk.userData.uvScale = 2.4;
  // 通路は舗装より1.5cm上に置く（同じ高さだと遠くから見たときにちらつく）
  flatRect(10.3, 24.5, 0.2, 2.3, walk, -0.175);
  flatRect(23.9, 26, -4.7, -1.5, walk, -0.175);
  flatRect(23.9, 26, 2.5, 6.4, walk, -0.175);
  flatRect(37.5, 49, -2.7, -0.6, walk, -0.175);
  // 生け垣（角の丸い植え込み）。高さ0.8m、上に低木をのせる
  const hedge = matHedge;
  const curb = new THREE.MeshStandardMaterial({ color: 0xd9d5cb, roughness: 1 });
  const rounded = (x0, x1, z0, z1, h = 0.8) => {
    const w = x1 - x0, d = z1 - z0, r = Math.min(w, d) / 2;
    const sh = new THREE.Shape();
    sh.moveTo(x0 + r, -z0);
    sh.lineTo(x1 - r, -z0); sh.absarc(x1 - r, -z0 - r, r, Math.PI / 2, -Math.PI / 2, true);
    sh.lineTo(x0 + r, -z1); sh.absarc(x0 + r, -z0 - r, r, -Math.PI / 2, Math.PI / 2, true);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 12 });
    geo.rotateX(-Math.PI / 2);
    const rim = new THREE.Mesh(geo, curb);
    rim.position.y = -0.2; rim.scale.y = 0.4;
    const top = new THREE.Mesh(geo, hedge);
    top.position.y = -0.2;
    rim.castShadow = rim.receiveShadow = top.castShadow = top.receiveShadow = true;
    outdoor.add(rim, top);
    // 低木のかたまり
    const n = Math.max(2, Math.round(w / 2.2));
    for (let i = 0; i < n; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), matHedge);
      b.scale.set(Math.min(1.3, d / 2), 0.7, Math.min(1.3, d / 2) * 0.9);
      b.position.set(x0 + r + ((w - 2 * r) * (i + 0.5)) / n, h - 0.1, (z0 + z1) / 2 + Math.sin(i * 2.3) * d * 0.12);
      b.castShadow = true;
      outdoor.add(b);
    }
  };
  rounded(9.8, 23.4, -7.8, -4.7);   // 北西：1号館ぞいの太い生け垣
  rounded(23.4, 39, -8.2, -6.4);    // 北東：1号館ぞいの細い生け垣
  rounded(23.1, 38, -2.7, 3.1);     // まんなか：細長い植え込み（東西の通路の先）
  // 中央の植え込みの正門側の、植え込みの中から立つ高い時計塔（白い柱の上に四面の時計）
  {
    const tx = 36.3, tz = 0.2, H = 7.5; // 植え込みの中から立っている
    const white = new THREE.MeshStandardMaterial({ color: 0xf1efea, roughness: 0.7 });
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, 0.5), white);
    pole.position.set(tx, H / 2 - 0.2, tz);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), white);
    head.position.set(tx, H + 0.3, tz);
    const capT = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0x5f6b72, roughness: 0.6 }));
    capT.position.set(tx, H + 1.1, tz); capT.rotation.y = Math.PI / 4;
    const cv = document.createElement("canvas"); cv.width = cv.height = 64;
    const c = cv.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, 64, 64); c.strokeStyle = "#222"; c.lineWidth = 3;
    c.beginPath(); c.arc(32, 32, 28, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(32, 32); c.lineTo(32, 12); c.moveTo(32, 32); c.lineTo(46, 38); c.stroke();
    const face = new THREE.CanvasTexture(cv); face.colorSpace = THREE.SRGBColorSpace;
    const fm = new THREE.MeshStandardMaterial({ map: face, roughness: 0.5 });
    for (let k = 0; k < 4; k++) {
      const f2 = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), fm);
      const a = (k * Math.PI) / 2;
      f2.position.set(tx + Math.sin(a) * 0.51, H + 0.3, tz + Math.cos(a) * 0.51);
      f2.rotation.y = a;
      outdoor.add(f2);
    }
    for (const m of [pole, head, capT]) { m.castShadow = true; outdoor.add(m); }
  }
  rounded(11.5, 20.6, 4.8, 7.6);    // 南西：2号館ぞいの生け垣
  // 3号館の北の壁の外ぞいの、丸く刈った低木の列（廊下に入らないよう壁の外へ）
  for (const [x0, x1, z, step] of [[-14.6, -5.6, 32.2, 1.8]]) {
    for (let x = x0; x <= x1; x += step) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 2), matHedge);
      b.scale.set(1, 0.75, 1); b.position.set(x, 0.45, z);
      b.castShadow = b.receiveShadow = true;
      outdoor.add(b);
    }
  }
  // 保健室の前（2号館の南）の大きな植え込み：西は三角に広がり、東は建物ぞいに細くのびる（航空写真）
  {
    // 西の部分は南の車路の手前まで広く、ななめのふちで東の細い帯につながる。中に木が何本かある
    const poly = [[20.4, 28.8], [31.2, 28.6], [44, 27], [44.4, 28.2], [40.5, 30.6], [34, 31.6], [31, 34.5], [28, 39.5], [25, 44.5], [22, 46.6], [20.4, 45]];
    const blobs = [];
    for (let x = 20.6; x <= 44; x += 1.6) for (let z = 27.2; z <= 46.6; z += 1.6) if (inPoly(x, z, poly)) blobs.push([x, z, 1.25]);
    outdoor.add(hedgeMass(blobs, 1.6));
    outdoor.add(buildTrees([[23.5, 32.5, -0.2, 0.75], [26.5, 35.5, -0.2, 0.7], [23, 39, -0.2, 0.8], [25.5, 42, -0.2, 0.65], [29.5, 32, -0.2, 0.6]].map(([x, z, y, sc]) => [x, y, z, sc])));
  }
}

// 正面玄関（2号館の東）：写真では張り出した庇はなく、レンガの壁にアーチの入口。奥にガラスの扉。前はレンガタイルのテラス
{
  // アーチの壁は、外壁をあけた所（図面の48〜51行）をちょうどふさぐ大きさ
  const wx = 49.8, cz = 12.78, R = 1.4; // R：扉を引っこめる深さ
  const glassM = new THREE.MeshStandardMaterial({ color: 0x3e5a74, roughness: 0.15, metalness: 0.3 });
  const parts = [];
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parts.push(m); return m; };
  // レンガのアーチの枠（壁の面にそのまま重ねる）
  const ow = 6.3, oh = 3.8, aw = 3.4, spring = 1.7, D = 0.2; // 壁と同じ面（張り出しなし）
  const sh = new THREE.Shape();
  // 下のふちから入口の形（アーチ）を切りこんだ1本の輪郭
  sh.moveTo(-ow / 2, 0); sh.lineTo(-aw / 2, 0); sh.lineTo(-aw / 2, spring);
  sh.absarc(0, spring, aw / 2, Math.PI, 0, true);
  sh.lineTo(aw / 2, 0); sh.lineTo(ow / 2, 0); sh.lineTo(ow / 2, oh); sh.lineTo(-ow / 2, oh); sh.lineTo(-ow / 2, 0);
  const ag = new THREE.ExtrudeGeometry(sh, { depth: D, bevelEnabled: false, curveSegments: 20 });
  const bt = texBrick.clone(); bt.needsUpdate = true; bt.repeat.set(1 / BAY, 1 / FH);
  const arch = add(ag, new THREE.MeshStandardMaterial({ map: bt, roughness: 0.85 }), wx, -0.2, cz);
  arch.rotation.y = Math.PI / 2; // 押し出しの向きを東（+x）に
  arch.position.x = wx;
  // アーチの内側の天井と横の壁（少し暗い）、奥のガラスの扉
  const inner = new THREE.MeshStandardMaterial({ color: 0x5a3a30, roughness: 0.9, side: THREE.DoubleSide });
  // 引っこんだ入口：奥のガラスの扉、両わきのレンガの壁、アーチ形の天井、床のタイル
  const xd = wx - R;
  add(new THREE.BoxGeometry(0.06, 2.4, aw - 0.1), glassM, xd, 1.0, cz);
  for (const dz of [-1.65, -0.55, 0.55, 1.65]) add(new THREE.BoxGeometry(0.08, 2.45, 0.08), matRelief, xd + 0.04, 1.02, cz + dz);
  add(new THREE.BoxGeometry(0.06, spring + aw / 2 - 2.2, aw), inner, xd, 2.2 + (spring + aw / 2 - 2.2) / 2 - 0.2, cz);
  const sideMat = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.85, side: THREE.DoubleSide });
  for (const s2 of [-1, 1]) add(new THREE.BoxGeometry(R, spring + 0.2, 0.1), sideMat, wx - R / 2, (spring - 0.2) / 2, cz + s2 * (aw / 2 + 0.05));
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(aw / 2, aw / 2, R, 20, 1, true, 0, Math.PI), inner); // 上半分だけ
  vault.rotation.z = Math.PI / 2; vault.position.set(wx - R / 2, spring - 0.2, cz); parts.push(vault);
  const it = texBrickFloor.clone(); it.needsUpdate = true; it.repeat.set(0.6, 1.4);
  add(new THREE.BoxGeometry(R, 0.08, aw), new THREE.MeshStandardMaterial({ map: it, color: 0xf0c8a8, roughness: 0.95 }), wx - R / 2, -0.14, cz);
  // 学校名の銘板（入口の北のわき）
  const plateTex = (() => { const cv = document.createElement("canvas"); cv.width = 48; cv.height = 256; const c = cv.getContext("2d"); c.fillStyle = "#3b3b38"; c.fillRect(0, 0, 48, 256); c.fillStyle = "#e9e4d6"; c.font = "bold 26px serif"; c.textAlign = "center"; [..."神奈川県立麻生高等学校"].forEach((ch, i) => c.fillText(ch, 24, 26 + i * 22.5)); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const pl = add(new THREE.PlaneGeometry(0.35, 1.7), new THREE.MeshStandardMaterial({ map: plateTex }), wx + 0.22, 1.4, cz - ow / 2 + 0.45);
  pl.rotation.y = Math.PI / 2;
  // レンガタイルのテラスと、北の花壇（レンガのふち）
  const tt = texBrickFloor.clone(); tt.needsUpdate = true; tt.repeat.set(1.6, 2.4);
  add(new THREE.BoxGeometry(4.2, 0.1, 8.5), new THREE.MeshStandardMaterial({ map: tt, color: 0xf0c8a8, roughness: 0.95 }), wx + 2.1, -0.16, cz + 0.6);
  add(new THREE.BoxGeometry(1.6, 0.45, 3.2), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.85 }), wx + 1.0, 0.0, cz - ow / 2 - 1.7);
  const fl = add(new THREE.BoxGeometry(1.4, 0.5, 3.0), matHedge, wx + 1.0, 0.25, cz - ow / 2 - 1.7);
  // テラスの植木鉢
  const pot = new THREE.MeshStandardMaterial({ color: 0xc0704c, roughness: 0.8 });
  for (const [dx, dz] of [[1.8, -1.9], [1.8, 2.1]]) {
    add(new THREE.CylinderGeometry(0.3, 0.22, 0.5, 12), pot, wx + D + dx - 1.2, 0.05, cz + dz);
    add(new THREE.SphereGeometry(0.45, 8, 6), matHedge, wx + D + dx - 1.2, 0.85, cz + dz);
  }
  for (const p of parts) outdoor.add(p);
}

// 2つの昇降口のあいだのレンガ敷きの屋外（上に2・3階がのっている）
{
  const rc = rectOf({ c0: PILOTIS.cells[0], r0: PILOTIS.cells[1], c1: PILOTIS.cells[2], r1: PILOTIS.cells[3] });
  const b = blockAtCell(PILOTIS.cells[0], PILOTIS.cells[1]);
  const w = rc.x1 - rc.x0, d = rc.z1 - rc.z0;
  const brickTex = texBrickFloor.clone();
  brickTex.needsUpdate = true;
  brickTex.repeat.set(w / 4, d / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((rc.x0 + rc.x1) / 2, -0.17, (rc.z0 + rc.z1) / 2);
  floor.receiveShadow = true;
  inBlock(outdoor, b).add(floor);
  // 2階は吹き抜け。3階の床の裏（天井）と、それを支える2階分の高さの柱
  const low = [], high = [];
  const box = (list, bw2, bh2, bd, x, y, z) => { const g = new THREE.BoxGeometry(bw2, bh2, bd); g.translate(x, y, z); list.push(g); };
  // 柱は茶色（写真）。床の裏は白
  const cols = [];
  // 2階の渡り廊下の床の裏と、吹き抜けの上の3階の床の裏
  const bx0 = X(PILOTIS.bridge[0]), bx1 = X(PILOTIS.bridge[1] + 1);
  box(low, bx1 - bx0, 0.4, d, (bx0 + bx1) / 2, FH - 0.2, (rc.z0 + rc.z1) / 2);
  box(high, bx0 - rc.x0, 0.4, d, (rc.x0 + bx0) / 2, 2 * FH - 0.2, (rc.z0 + rc.z1) / 2);
  for (let z = rc.z0 + 3; z < rc.z1 - 1; z += 4.5) {
    for (const x of [rc.x0 + 0.4, (rc.x0 + bx0) / 2]) {
      box(cols, 0.6, FH, 0.6, x, FH / 2 - 0.2, z);
      box(high, 0.6, FH, 0.6, x, FH * 1.5 - 0.2, z);
    }
    // 渡り廊下を支える柱（中庭側と吹き抜け側）
    box(cols, 0.5, FH, 0.5, bx1 - 0.3, FH / 2 - 0.2, z);
    box(cols, 0.5, FH, 0.5, bx0 + 0.3, FH / 2 - 0.2, z);
  }
  const cm = new THREE.Mesh(mergeGeometries(cols), new THREE.MeshStandardMaterial({ color: 0x7a4b38, roughness: 0.85 }));
  cm.castShadow = cm.receiveShadow = true;
  inBlock(layers.exterior[1], b).add(cm);
  for (const [list, f] of [[low, 1], [high, 2]]) {
    const m = new THREE.Mesh(mergeGeometries(list), matRelief);
    m.castShadow = m.receiveShadow = true;
    inBlock(layers.exterior[f], b).add(m);
  }
}

// 下の階に部屋がない張り出し部分を、1階の柱で支える
for (const [c0, r0, c1, r1] of COLUMN_AREAS) {
  const rc = rectOf({ c0, r0, c1, r1 });
  const b = blockAtCell(c0, r0);
  const geos = [];
  const xs = [], zs = [];
  for (let x = rc.x0 + 0.3; x <= rc.x1 - 0.2; x += Math.max(3, (rc.x1 - rc.x0 - 0.6) / Math.max(1, Math.round((rc.x1 - rc.x0) / 5)))) xs.push(x);
  if (rc.x1 - 0.3 - xs[xs.length - 1] > 1) xs.push(rc.x1 - 0.3);
  zs.push(rc.z0 + 0.3); if (rc.z1 - rc.z0 > 2) zs.push(rc.z1 - 0.3);
  for (const x of xs) for (const z of zs) {
    // 1階に建物があるところには立てない
    const c = Math.floor(x / CW + C_MID), r = Math.floor(z / RH + R_MID);
    if (OCC[1].has(key(c, r))) continue;
    const g = new THREE.BoxGeometry(0.5, FH, 0.5);
    g.translate(x, FH / 2 - 0.2, z);
    geos.push(g);
  }
  if (!geos.length) continue;
  const m = new THREE.Mesh(mergeGeometries(geos), matRelief);
  m.castShadow = m.receiveShadow = true;
  inBlock(layers.exterior[1], b).add(m);
}

// うすい色のレンガタイル（1枚の模様が 2.4m 四方。タイルは 20cm×10cm くらい）
const texCourtTile = canvasTex(256, 256, (g, W, H) => {
  g.fillStyle = "#cdbcaa"; g.fillRect(0, 0, W, H); // 目地
  const bw = 21, bh = 10.5;
  for (let row = 0, y = 0; y < H; row++, y += bh) for (let x = (row % 2) * bw / 2 - bw; x < W; x += bw) {
    const v = Math.random() * 18 - 9;
    g.fillStyle = `rgb(${226 + v},${200 + v},${180 + v})`;
    g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
  }
});
texCourtTile.wrapS = texCourtTile.wrapT = THREE.RepeatWrapping;
// 光庭：床はうすい色のレンガタイル。植え込みはほんの少しだけ（両はしに小さく）
for (const [c0, r0, c1, r1] of OPEN_COURTS) {
  const rc = rectOf({ c0, r0, c1, r1 });
  const w = rc.x1 - rc.x0, d = rc.z1 - rc.z0;
  const tex = texCourtTile.clone(); tex.needsUpdate = true; tex.repeat.set(w / 2.4, d / 2.4);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  m.position.set((rc.x0 + rc.x1) / 2, -0.12, (rc.z0 + rc.z1) / 2);
  m.receiveShadow = true;
  const holder = inBlock(scene, blockAtCell(c0, r0));
  holder.add(m);
  holder.add(hedgeMass([[rc.x0 + 1.0, rc.z0 + 0.9, 0.8], [rc.x0 + 1.9, rc.z0 + 0.8, 0.7]], 0.9));
  holder.add(hedgeMass([[rc.x1 - 1.0, rc.z1 - 0.9, 0.8], [rc.x1 - 1.9, rc.z1 - 0.8, 0.7]], 0.9));
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
  const columnar = [];
  const ok = (x, z) => {
    // 建物（航空写真で測った各棟の範囲）のそばには植えない
    if (BLOCK_LIST.some((b) => x > b.world[0] - 3 && x < b.world[2] + 3 && z > b.world[1] - 3 && z < b.world[3] + 3)) return false;
    return site.isFree(x, z);
  };
  // 敷地の中の、舗装していない場所（のり面・植え込み）に木を植える
  for (let i = 0, added = 0; i < 4000 && added < 170; i++) {
    const x = siteBB.x0 + rnd() * (siteBB.x1 - siteBB.x0), z = siteBB.z0 + rnd() * (siteBB.z1 - siteBB.z0);
    if (!inPoly(x, z, SITE.boundary) || inPoly(x, z, SITE.paved)) continue;
    if (spots.some(([px, pz]) => Math.hypot(px - x, pz - z) < 4)) continue;
    if (ok(x, z)) { spots.push([x, z, 0.8 + rnd() * 0.6]); added++; }
  }
  // グラウンド北東の道路ぞいの並木（2列）
  {
    const { from: [ax, az], to: [bx2, bz2], offsets, step } = SITE.treeRow;
    const L = Math.hypot(bx2 - ax, bz2 - az), ux = (bx2 - ax) / L, uz = (bz2 - az) / L;
    const nx = uz, nz = -ux;
    for (const off of offsets) for (let t = 0; t < L; t += step) if (site.isFree(ax + ux * t + nx * off, az + uz * t + nz * off)) columnar.push([ax + ux * t + nx * off, az + uz * t + nz * off, 0.9 + ((t * 7) % 3) * 0.08]);
  }
  // 体育館と校舎のあいだの広場の丸い植え込みの木
  // 庭園の木
  for (const [x, z] of SITE.garden?.trees || []) spots.push([x, z, 0.7]);
  // 木（葉のかたまりを重ねた形）と、並木の細長い木
  trees.add(buildTrees(spots.map(([x, z, sc]) => [x, 0, z, sc * 0.85])));
  trees.add(buildColumnTrees(columnar.map(([x, z, sc]) => [x, 0, z, sc])));
}

// ---------- 部屋（フロア表示） ----------
// 折り返し階段の形。上り始めの向き dir（0=東, 90=南, 180=西, 270=北）。上り口から見て右側が上り、左側が下り（左側通行で下り）
function stairFrame(r) {
  const st = STAIRS.find((x) => x.name === r.name);
  const A = THREE.MathUtils.degToRad(st && st.dir !== undefined ? st.dir : r.w >= r.d ? 0 : 90);
  const ca = Math.round(Math.cos(A)), sa = Math.round(Math.sin(A)); // 90度ごと
  const L = ca !== 0 ? r.w : r.d, Wd = ca !== 0 ? r.d : r.w;
  // 部屋の中の座標 (u: 上る向き, v: 上る向きの右) の箱を、図面の座標に置く
  const add = (list, u0, u1, v0, v1, y0, y1) => {
    const su = u1 - u0, sv = v1 - v0, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const g = new THREE.BoxGeometry(Math.abs(ca) * su + Math.abs(sa) * sv, y1 - y0, Math.abs(sa) * su + Math.abs(ca) * sv);
    g.translate(r.cx + cu * ca - cv * sa, (y0 + y1) / 2, r.cz + cu * sa + cv * ca);
    list.push(g);
  };
  const n = 11, land = Math.min(1.6, L * 0.28), run = L - land - 0.2, tread = run / n, rise = FH / 2 / n;
  return { add, L, Wd, n, tread, rise, a0: -L / 2 + 0.1, landU: L / 2 - 0.1 - land };
}
function stairFlights(r, y, list, upperOnly = false) {
  const { add, L, Wd, n, tread, rise, a0, landU } = stairFrame(r);
  for (let i = 0; i < n; i++) {
    if (!upperOnly) add(list, a0 + i * tread, a0 + (i + 1) * tread, 0.06, Wd / 2 - 0.1, y, y + rise * (i + 1)); // 上り（右側）
    const top = y + FH / 2 + rise * (i + 1);
    add(list, landU - (i + 1) * tread, landU - i * tread, -Wd / 2 + 0.1, -0.06, top - 0.35, top);              // 踊り場から上の階へ（左側）
  }
  add(list, landU, L / 2 - 0.1, -Wd / 2 + 0.1, Wd / 2 - 0.1, y + FH / 2 - 0.25, y + FH / 2);                  // 踊り場
  add(list, a0, landU, -0.06, 0.06, upperOnly ? y + FH / 2 : y, y + FH);                                      // まんなかの壁
}
// いちばん上の階：上り切ったところの床と、吹き抜けのまわりの手すり壁
function stairGuard(r, y, list) {
  const { add, L, Wd, a0, landU } = stairFrame(r);
  add(list, -L / 2, a0 + 0.02, -Wd / 2, Wd / 2, y - 0.2, y);           // 上り切ったところの床
  add(list, a0, landU, -0.08, 0.08, y, y + 1.1);                        // 吹き抜けと上りの段のあいだの手すり壁
  add(list, a0 - 0.08, a0 + 0.08, 0, Wd / 2 - 0.1, y, y + 1.1);         // 吹き抜けの手前の手すり壁
  add(list, landU, L / 2 - 0.1, Wd / 2 - 0.18, Wd / 2 - 0.1, y, y + 1.1); // 踊り場の上の壁ぎわ
  add(list, -L / 2, L / 2, -Wd / 2 - 0.05, -Wd / 2 + 0.1, y, y + 1.1);   // 外側の壁
  add(list, -L / 2, L / 2, Wd / 2 - 0.1, Wd / 2 + 0.05, y, y + 1.1);
  add(list, L / 2 - 0.1, L / 2 + 0.05, -Wd / 2, Wd / 2, y, y + 1.1);
}

const styleOf = (r) => ROOM_STYLE.find((s) => s.name === r.name && s.floor === r.floor && (s.r0 === undefined || s.r0 === r.r0));
// 部屋の仕切りの壁の高さ（天井まで描くと中が見えにくいので、ドアの上が少し見える高さ）
const WALL_H = 2.45;
const pickables = [];
const matStairs = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.9 });
const matPartition = new THREE.MeshStandardMaterial({ color: 0xfbf6ea, roughness: 0.9 }); // 白（ほんの少しクリーム色）
// ガラス張りの仕切り（STUDY HALL など）
const matGlassWall = new THREE.MeshStandardMaterial({ color: 0x9cc4dc, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
const matGlassFrame = new THREE.MeshStandardMaterial({ color: 0x26282b, roughness: 0.5, metalness: 0.4 }); // 黒い枠（写真より）
for (const f of [1, 2, 3]) {
  const grp = new THREE.Group();
  const lbl = new THREE.Group();
  const walls = {}; // 棟ごと
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
      map = FLOOR_TEX[st === "flooring" ? "wood" : st].clone();
      map.needsUpdate = true;
      if (st === "gym") { map.center.set(0.5, 0.5); map.rotation = Math.PI / 2; tint = new THREE.Color(0xffffff); }
      else if (st === "tatami") { map.repeat.set(r.w / 3.6, r.d / 3.6); tint = new THREE.Color(0xffffff); }
      else if (st === "flooring") { map.repeat.set(r.w / 3, r.d / 3); tint = new THREE.Color(0xd9b07a); } // 武道場の木の床
      else if (st === "tile") map.repeat.set(r.w / 1.2, r.d / 1.2);
      else map.repeat.set(r.w / 4, r.d / 4);
      if (/ステージ/.test(r.name)) tint = new THREE.Color(0xc99560); // ステージの木の床
      else if (/コンピューター/.test(r.name)) tint = new THREE.Color(0x4a74c9); // コンピューター教室の床は青
      else if (/教室/.test(r.name) && st === "wood") tint = new THREE.Color(0xeadfc8); // 教室の床はうすいベージュ
    }
    const mat = r.kind === "part" ? r.parent.mesh.material : new THREE.MeshStandardMaterial({
      color: tint, roughness: 0.85,
      map,
      transparent: isOpen || !!styleOf(r)?.noFloor, opacity: isCourt || styleOf(r)?.noFloor ? 0.0 : isOpen ? 0.35 : 1,
      depthWrite: !isOpen && !styleOf(r)?.noFloor,
    });
    if (r.kind === "stairs") { mat.transparent = true; mat.opacity = 0; mat.depthWrite = false; } // 階段は形で見せ、板はクリック用
    const th = /ステージ/.test(r.name) ? 1.0 : 0.14; // ステージは高くする
    const tile = new THREE.Mesh(new THREE.BoxGeometry(r.w - 0.14, th, r.d - 0.14), mat);
    tile.position.set(r.cx, y + 0.01 + th / 2, r.cz);
    tile.receiveShadow = true;
    tile.userData.room = r.kind === "part" ? r.parent : r;
    r.mesh = tile;
    r.baseColor = color.clone();
    inBlock(grp, r.block).add(tile);
    pickables.push(tile);

    // 建物の中の階段：上の階へ上がる折り返し階段（行きの段・踊り場・帰りの段）
    // その階から上る段と、下の階から上ってきた段（上り切ったところ）の両方を見せる。いちばん上の階では吹き抜けに手すり
    if (r.kind === "stairs") {
      const list = [];
      if (r.upTo) stairFlights(r, y, list);
      if (r.fromBelow) stairFlights(r, y - FH, list, true);
      if (!r.upTo && r.fromBelow) stairGuard(r, y, list);
      if (list.length) {
        const m = new THREE.Mesh(mergeGeometries(list), matStairs);
        m.castShadow = m.receiveShadow = true;
        inBlock(grp, r.block).add(m);
      }
    }

    if (r.parts) {
      // L字などの部屋は、つながった形のまわりにだけ壁を立てる
      const cells = new Map();
      for (const q of [r, ...r.parts, ...(r.joined || [])]) for (let c = q.c0; c <= q.c1; c++) for (let rr = q.r0; rr <= q.r1; rr++) cells.set(key(c, rr), "p");
      for (const sg of boundarySegments(cells)) {
        const len = Math.hypot(sg.bx - sg.ax, sg.bz - sg.az), t = 0.14, h = WALL_H;
        const g = new THREE.BoxGeometry(sg.n[1] !== 0 ? len : t, h, sg.n[1] !== 0 ? t : len);
        g.translate((sg.ax + sg.bx) / 2, y + h / 2, (sg.az + sg.bz) / 2);
        (walls[r.block.id] ||= []).push(g);
      }
    } else if (!isCourt && r.kind !== "stairs" && r.kind !== "part" && !r.joinedTo) {
      const t = 0.14, h = isOpen ? 1.0 : WALL_H;
      const rc = { x0: r.cx - r.w / 2, x1: r.cx + r.w / 2, z0: r.cz - r.d / 2, z1: r.cz + r.d / 2 };
      const sty = styleOf(r);
      for (const [w, d, x, z, side] of [
        [r.w, t, r.cx, rc.z0, "n"], [r.w, t, r.cx, rc.z1, "s"],
        [t, r.d, rc.x0, r.cz, "w"], [t, r.d, rc.x1, r.cz, "e"],
      ]) {
        if (sty?.open?.includes(side)) continue;
        if (sty?.glass?.includes(side)) {
          // 床から天井近くまでのガラスと、細い枠（たての枠は約1.5mおき）
          const along = side === "n" || side === "s", L = along ? w : d, H = WALL_H + 0.4;
          const pane = new THREE.Mesh(new THREE.BoxGeometry(along ? L : 0.03, H, along ? 0.03 : L), matGlassWall);
          pane.position.set(x, y + H / 2, z);
          inBlock(grp, r.block).add(pane);
          const fr = [];
          for (const [yy, hh] of [[0.05, 0.1], [H - 0.04, 0.08]]) { const b = new THREE.BoxGeometry(along ? L : 0.08, hh, along ? 0.08 : L); b.translate(x, y + yy, z); fr.push(b); }
          const n = Math.max(1, Math.round(L / 1.5));
          for (let i = 0; i <= n; i++) {
            const o = -L / 2 + (L * i) / n, b = new THREE.BoxGeometry(0.07, H, 0.07);
            b.translate(along ? x + o : x, y + H / 2, along ? z : z + o);
            fr.push(b);
          }
          const fm = new THREE.Mesh(mergeGeometries(fr), matGlassFrame);
          inBlock(grp, r.block).add(fm);
          continue;
        }
        const g = new THREE.BoxGeometry(w, h, d);
        g.translate(x, y + h / 2, z);
        (walls[r.block.id] ||= []).push(g);
      }
    }

    if (r.kind === "part") continue; // ラベルは元の部屋だけ
    if (styleOf(r)?.noLabel) continue; // 名前を出さない場所（昇降口のとなりのホール）
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
    inBlock(lbl, r.block).add(obj);
  }
  for (const [bid, list] of Object.entries(walls)) {
    const pm = new THREE.Mesh(mergeGeometries(list), matPartition);
    pm.castShadow = true; pm.receiveShadow = true;
    inBlock(grp, blockById(bid)).add(pm);
  }
  // 家具（伸び縮みさせず、航空写真に合わせたあとの部屋の大きさで置く）
  const furn = buildFurniture(
    ROOMS.filter((x) => x.floor === f && (x.kind === "room" || x.kind === "part"))
      .map((x) => ({ name: x.kind === "part" ? (x.parent.name === "事務室" ? "受付カウンター" : x.parent.name + "（L字）") : x.name, cx: x.wx, cz: x.wz, w: x.ww, d: x.wd, vending: x.kind === "part" ? null : styleOf(x)?.vending, vendingN: styleOf(x)?.vendingN, vendingShift: styleOf(x)?.vendingShift, doors: x.kind === "part" ? null : styleOf(x)?.doors })),
    y0OfFloor(f),
  );
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
  const [c0, r0, c1, r1] = areasOf(w)[0];
  const top = w.id === "wg" ? 3 * FH + 4 : 3 * FH + 2.5;
  const [wx, wz] = toWorld((X(c0) + X(c1 + 1)) / 2, (Z(r0) + Z(r1 + 1)) / 2);
  obj.position.set(wx, top, wz);
  wingLabels.add(obj);
}
// まわりの施設のラベル
for (const it of SITE_INFO) {
  if (!SITE[it.key]) continue;
  const div = document.createElement("div");
  div.className = "wing-label site";
  div.textContent = it.name;
  div.addEventListener("pointerdown", (e) => e.stopPropagation());
  div.addEventListener("click", (e) => { e.stopPropagation(); showSite(it); });
  const obj = new CSS2DObject(div);
  obj.position.set(it.x, 5, it.z);
  wingLabels.add(obj);
}
scene.add(wingLabels);

// ---------- 表示の切り替え ----------
const state = { floor: 0, view: "3d", selected: null };

// ラベル（HTML）はグループごと消しても残ることがあるので、1つずつ切り替える
function setLabelsVisible(group, v) {
  group.visible = v;
  group.traverse((o) => { if (o.isCSS2DObject) o.visible = v; });
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
    if (f === 0) flyTo(new THREE.Vector3(75, 120, 120), new THREE.Vector3(0, 0, -35));
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
    const d = Math.hypot(o.wx - r.wx, o.wz - r.wz);
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
      controls2d.target.set(r.wx, 0, r.wz);
      ortho.position.set(r.wx, 200, r.wz + 0.001);
      ortho.zoom = Math.max(ortho.zoom, 1.6);
      ortho.updateProjectionMatrix();
    } else {
      flyTo(new THREE.Vector3(r.wx + 10, base(r.floor) + 26, r.wz + 26), new THREE.Vector3(r.wx, base(r.floor), r.wz));
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
    ${(() => { const ph = PHOTOS.find(([re, , fl]) => re.test(r.name) && (fl === undefined || fl === r.floor)); return ph ? [].concat(ph[1]).map((src) => `<img class="room-photo" src="${src}" alt="${r.name}の写真" loading="lazy">`).join("") : ""; })()}
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
  const [c0, r0, c1, r1] = areasOf(w)[0];
  const [cx, cz] = toWorld((X(c0) + X(c1 + 1)) / 2, (Z(r0) + Z(r1 + 1)) / 2);
  flyTo(new THREE.Vector3(cx + 30, 45, cz + 45), new THREE.Vector3(cx, 5, cz));
}

function showSite(it) {
  panelBody.innerHTML = `
    <div class="chip" style="--c:#cfe3c4">屋外の施設</div>
    <h2>${it.name}</h2>
    ${[].concat(it.photos || []).map((src) => `<img class="room-photo" src="${src}" alt="${it.name}の写真" loading="lazy">`).join("")}
    <p class="desc">${it.desc}</p>
    <p class="muted">${SITE_NOTE}</p>
  `;
  openPanel();
  flyTo(new THREE.Vector3(it.x + 30, 50, it.z + 55), new THREE.Vector3(it.x, 0, it.z));
}

function openPanel() { panel.classList.add("open"); document.body.classList.add("panel-open"); }
function closePanel() {
  panel.classList.remove("open");
  document.body.classList.remove("panel-open");
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
      const [dx, dz] = toDrawing(p.x, p.z);
      const c = dx / CW + C_MID, r = dz / RH + R_MID;
      const w = WINGS.find((w) => areasOf(w).some((a) => c >= a[0] - 0.5 && c <= a[2] + 1.5 && r >= a[1] - 0.5 && r <= a[3] + 1.5));
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

// ---------- 見る方向 ----------
const DIRS = {
  n: [0, 95, -175], s: [0, 95, 125], e: [160, 95, -25], w: [-160, 95, -25], top: [0, 230, -24.9],
};
document.querySelectorAll(".dir-btns button").forEach((b) => b.addEventListener("click", () => {
  if (state.view === "2d" && state.floor !== 0) setView("3d");
  const [x, y, z] = DIRS[b.dataset.dir];
  const ty = state.floor ? base(state.floor) : 0;
  flyTo(new THREE.Vector3(x, y + ty, z), new THREE.Vector3(0, ty, -25), 900);
}));
const compassEl = document.getElementById("compass");

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
  farGround.visible = ground.visible = paving.visible = trees.visible = site.group.visible = outdoor.visible = siteGround.visible = !on;
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
// 縦が短い画面では、色の見かたを最初は閉じておく
if (window.innerHeight < 760) document.querySelector(".legend").removeAttribute("open");
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
    const objs = [];
    g.traverse((o) => { if (o.isCSS2DObject) objs.push(o); });
    for (const o of objs) {
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

// 軽くするため、画面が止まっているときは描き直さない。
// カメラが動いたとき、操作の直後（1.5秒）、アニメーション中だけ描く（念のため1秒に1回は描く）
let activeUntil = 0, lastDraw = 0;
const camKey = new Float64Array(18);
const poke = () => { activeUntil = performance.now() + 1500; };
for (const ev of ["pointerdown", "pointermove", "wheel", "keydown", "click", "touchstart", "touchmove", "resize"]) window.addEventListener(ev, poke, { passive: true, capture: true });
function cameraChanged(cam) {
  const e = cam.matrixWorld.elements;
  let ch = false;
  for (let i = 0; i < 16; i++) if (camKey[i] !== e[i]) { camKey[i] = e[i]; ch = true; }
  if (camKey[16] !== cam.zoom) { camKey[16] = cam.zoom; ch = true; }
  if (camKey[17] !== (cam === ortho ? 1 : 0)) { camKey[17] = cam === ortho ? 1 : 0; ch = true; }
  return ch;
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
  // 方位磁針（画面の上がどの方角か）
  const az = cam === ortho ? 0 : controls3d.getAzimuthalAngle();
  compassEl.style.transform = `rotate(${THREE.MathUtils.radToDeg(az)}deg)`;
  (cam === ortho ? controls2d : controls3d).update();
  cam.updateMatrixWorld();
  if (anim || cameraChanged(cam) || now < activeUntil || now - lastDraw > 1000) {
    lastDraw = now;
    renderer.render(scene, cam);
    labelRenderer.render(scene, cam);
    if (now - lastDeclutter > 200) { lastDeclutter = now; declutter(); }
  }
  requestAnimationFrame(tick);
}

// ---------- はじめの表示 ----------
// 動かない屋外の部品を、材質ごとにまとめて軽くする
bakeStatic(site.group);
bakeStatic(outdoor);
setFloor(0);
const m = location.hash.match(/room=([\w-]+)/);
if (m && ROOM_BY_ID[m[1]]) selectRoom(ROOM_BY_ID[m[1]]);
requestAnimationFrame(tick);
document.getElementById("loading").remove();

