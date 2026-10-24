// 職員室のくわしいモデル（シークレットページ）
// 座標はメートル。x：西の柱（X7）から東へ、z：北の壁（Y3）から南へ（南の窓の壁 Y1 が z = 7.4）。
// 北へのびた共用スペースは x 14.4〜24、z -2.5〜0（北の壁 Y5）。配置図の寸法をそのまま使う
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const CEIL = 2.9; // 天井の高さ
const view = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
view.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.style.position = "absolute"; labels.domElement.style.inset = "0";
view.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe0ec);
// まわりの光の映りこみ（床のつや・金属）に、部屋の中の光を使う
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
const controls = new OrbitControls(camera, labels.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.09;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 0.3; controls.maxDistance = 45;

// ---------- 光 ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ab95, 0.55));
const sun = new THREE.DirectionalLight(0xfff2dc, 1.6); // 南の窓から入る日の光
sun.position.set(6, 9, 18); sun.target.position.set(12, 0, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: 1, far: 40 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// ---------- 道具 ----------
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const B = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z); // y は下の面
const C = (r, h, x = 0, y = 0, z = 0, seg = 12) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y + h / 2, z);
const tex = (w, h, draw, rx = 1, ry = 1) => {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 8; return t;
};
// 部品の一覧 [材質, 形][] を、材質ごとに1つの形にまとめる
const kit = (parts) => { const by = new Map(); for (const [m, g] of parts) { if (!by.has(m)) by.set(m, []); by.get(m).push(g.index ? g.toNonIndexed() : g); } return [...by].map(([m, gs]) => [m, mergeGeometries(gs)]); };
// まとめた部品を、たくさんの場所に置く（同じ形を一度に描く）
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
function place(k, list) {
  if (!list.length) return;
  for (const [mat, geo] of k) {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => { q.setFromAxisAngle(up, p.rot || 0); m4.compose(v3.set(p.x, p.y || 0, p.z), q, new THREE.Vector3(p.sx || 1, p.sy || 1, p.sz || 1)); im.setMatrixAt(i, m4); });
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
  }
}
const add = (geos, mat, shadow = true) => { const m = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), mat); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; };
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------- 材質 ----------
const woodTop = M(0xd8c2a0, { roughness: 0.45, map: tex(256, 64, (g, w, h) => { g.fillStyle = "#d9c3a1"; g.fillRect(0, 0, w, h); for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(${150 + rnd() * 40},${110 + rnd() * 30},${70 + rnd() * 20},${0.12 + rnd() * 0.12})`; g.lineWidth = 0.6 + rnd(); g.beginPath(); const y = rnd() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rnd() * 6 - 3, w * 0.7, y + rnd() * 6 - 3, w, y + rnd() * 4 - 2); g.stroke(); } }) });
const steelW = M(0xeeeeea, { roughness: 0.35, metalness: 0.15 });
const steelG = M(0xd9dbdc, { roughness: 0.4, metalness: 0.2 });
const steelD = M(0x8b9096, { roughness: 0.35, metalness: 0.6 });
const black = M(0x22252a, { roughness: 0.5 });
const chairFab = M(0x2b3442, { roughness: 0.9 });
const plastic = M(0x3a3d42, { roughness: 0.55 });
const chrome = M(0xc8ccd0, { roughness: 0.2, metalness: 0.9 });
const greenCable = M(0x1e8a4c, { roughness: 0.45 });
const screen = M(0x10161d, { roughness: 0.15, metalness: 0.3, emissive: 0x0b1a2a, emissiveIntensity: 0.6 });
const paper = M(0xf7f6f1, { roughness: 0.9 });
const glass = new THREE.MeshPhysicalMaterial({ color: 0xcfe6f2, roughness: 0.05, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.22, depthWrite: false });
const alu = M(0xb7bdc2, { roughness: 0.3, metalness: 0.7 });
const wallUp = M(0xece6d8, { roughness: 0.9 });
const wallLow = M(0xbfae93, { roughness: 0.85 });
const curtain = M(0xe8d48e, { roughness: 0.95, side: THREE.DoubleSide });
const binders = [0x2a5ea8, 0xc23b3b, 0x2f8a55, 0xe0b22e, 0x6b4aa8, 0xf2f2f2].map((c) => M(c, { roughness: 0.7 }));

// ---------- 床・天井・壁・柱 ----------
// 床：つやのあるベージュの長尺シート（うすい目地）
const floorTex = tex(256, 256, (g, w, h) => { g.fillStyle = "#cdbfa8"; g.fillRect(0, 0, w, h); for (let i = 0; i < 1800; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? "255,255,255" : "120,100,80"},${rnd() * 0.06})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } g.fillStyle = "rgba(120,105,85,0.25)"; g.fillRect(0, 0, w, 1.5); }, 24 / 1.8, 10 / 1.8);
const floorMat = M(0xffffff, { map: floorTex, roughness: 0.16, metalness: 0.0 });
{
  const s = new THREE.Shape([new THREE.Vector2(0, -7.4), new THREE.Vector2(24, -7.4), new THREE.Vector2(24, 2.5), new THREE.Vector2(14.4, 2.5), new THREE.Vector2(14.4, 0), new THREE.Vector2(0, 0)]);
  const g = new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 1.8, p.getZ(i) / 1.8);
  floorTex.repeat.set(1, 1);
  const f = new THREE.Mesh(g, floorMat); f.receiveShadow = true; scene.add(f);
}
// 天井（上から見るときは消す）：白い化粧板と、蛍光灯、梁
const ceiling = new THREE.Group();
{
  const ct = tex(128, 128, (g, w, h) => { g.fillStyle = "#f3f2ee"; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = "rgba(150,145,135,0.35)"; g.fillRect(rnd() * w, rnd() * h, 1.2, 1.2); } g.fillStyle = "rgba(160,155,145,0.5)"; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); });
  const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(24, 0), new THREE.Vector2(24, -2.5 - 7.4 + 7.4), new THREE.Vector2(0, 0)]);
  const plane = (x0, x1, z0, z1) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2).translate((x0 + x1) / 2, CEIL, (z0 + z1) / 2); const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 0.6, p.getZ(i) / 0.6); return g; };
  const cm = new THREE.Mesh(mergeGeometries([plane(0, 24, 0, 7.4), plane(14.4, 24, -2.5, 0)]), M(0xffffff, { map: ct, roughness: 0.95 }));
  ceiling.add(cm);
  const beams = [];
  for (const x of [4.8, 9.6, 14.4, 19.2]) beams.push(B(0.45, 0.5, x === 14.4 || x === 19.2 ? 9.9 : 7.4, x, CEIL - 0.5, x === 14.4 || x === 19.2 ? 2.45 : 3.7));
  beams.push(B(24, 0.5, 0.4, 12, CEIL - 0.5, 0.2));
  ceiling.add(new THREE.Mesh(mergeGeometries(beams.map((g) => g.toNonIndexed())), wallUp));
  // 蛍光灯（2本入りのうすい器具）
  const lampBody = [], lampTube = [];
  for (let x = 1.6; x < 24; x += 2.4) for (const z of [1.6, 3.7, 5.8]) { lampBody.push(B(1.3, 0.06, 0.3, x, CEIL - 0.07, z)); lampTube.push(B(1.22, 0.025, 0.05, x, CEIL - 0.095, z - 0.07), B(1.22, 0.025, 0.05, x, CEIL - 0.095, z + 0.07)); }
  for (let x = 16; x < 24; x += 2.4) { lampBody.push(B(1.3, 0.06, 0.3, x, CEIL - 0.07, -1.25)); lampTube.push(B(1.22, 0.025, 0.05, x, CEIL - 0.095, -1.32), B(1.22, 0.025, 0.05, x, CEIL - 0.095, -1.18)); }
  ceiling.add(new THREE.Mesh(mergeGeometries(lampBody.map((g) => g.toNonIndexed())), M(0xf4f4f2)));
  ceiling.add(new THREE.Mesh(mergeGeometries(lampTube.map((g) => g.toNonIndexed())), M(0xffffff, { emissive: 0xfffbf0, emissiveIntensity: 1.4 })));
  scene.add(ceiling);
}
// 壁：下の 1.0m は茶色っぽいベージュ、上はクリーム色（写真）。開口部（窓・ドア）はあけて作る
function wall(ax, az, bx, bz, holes = [], t = 0.15) {
  const L = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
  const lo = [], hi = [];
  const seg = (u0, u1, y0, y1) => { if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return; const g = B(u1 - u0, y1 - y0, t, (u0 + u1) / 2, y0, 0); (y1 <= 1.0 ? lo : hi).push(g); };
  const cuts = [...holes].sort((a, b) => a[0] - b[0]);
  let u = 0;
  for (const [h0, h1, hy0, hy1] of cuts) { seg(u, h0, 0, 1.0); seg(u, h0, 1.0, CEIL); if (hy0 > 0) { seg(h0, h1, 0, Math.min(1.0, hy0)); if (hy0 > 1.0) seg(h0, h1, 1.0, hy0); } seg(h0, h1, Math.max(1.0, hy1), CEIL); if (hy1 < 1.0) seg(h0, h1, hy1, 1.0); u = h1; }
  seg(u, L, 0, 1.0); seg(u, L, 1.0, CEIL);
  const tr = (g) => g.rotateY(-ang).translate(ax, 0, az);
  if (lo.length) add(lo.map(tr), wallLow);
  if (hi.length) add(hi.map(tr), wallUp);
  return { L, ang };
}
// 柱（配置図の黒い四角。0.76m 角）。下は茶色、上はクリーム
const pillar = (x, z, w = 0.76, d = 0.76) => { add([B(w, 1.0, d, x, 0, z)], wallLow); add([B(w, CEIL - 1.0, d, x, 1.0, z)], wallUp); };
for (const x of [0, 4.8, 9.6, 14.4, 19.2, 24]) pillar(x, 7.4 - 0.15, 0.76, 0.66); // 南の窓の柱
for (const x of [0, 4.8, 14.4, 24]) pillar(x, 0.15, 0.76, 0.66);                  // 北の柱
pillar(19.2, 0.1);                                                               // 共用スペースの独立柱（空調）
for (const x of [14.4, 19.2, 24]) pillar(x, -2.35, 0.76, 0.5);                   // 共用スペースの北の柱

// 北の壁（廊下側）：西に引き戸、まんなかに開き戸。上に欄間の窓
wall(0, 0, 14.4, 0, [[1.4, 3.0, 0, 2.05], [9.55, 10.5, 0, 2.05]]);
// 共用スペースの北の壁（更衣室との境）：両はしに更衣室の入口
wall(14.4, -2.5, 24, -2.5, [[0.5, 1.4, 0, 2.05], [8.4, 9.3, 0, 2.05]]);
wall(14.4, -2.5, 14.4, 0, [[0.75, 1.75, 0, 2.05]]); // 西：廊下のつきあたりからの入口
wall(0, 0, 0, 7.4, [[0.45, 1.35, 0, 2.05]]);       // 西：印刷室への入口
wall(24, -2.5, 24, 7.4, [[0.7, 1.6, 0, 2.05], [3.0, 9.3, 1.1, 2.45]]); // 東：外への出入口と窓
wall(0, 7.4, 24, 7.4, [[0.4, 4.4, 0.85, 2.55], [5.2, 9.2, 0.85, 2.55], [10.0, 14.0, 0.85, 2.55], [14.8, 18.8, 0.85, 2.55], [19.6, 23.6, 0.85, 2.55]]); // 南：窓

// 窓（南と東）：アルミの枠とガラス、真ん中の桟、両はしにまとめたカーテン
{
  const fr = [], gl = [], cu = [];
  const win = (x0, x1, z, y0, y1, alongX = true) => {
    const L = x1 - x0, n = Math.max(2, Math.round(L / 1.0));
    const P = (u, y, w, h, d) => (alongX ? B(w, h, d, x0 + u, y, z) : B(d, h, w, z, y, x0 + u));
    gl.push(P(L / 2, y0, L, y1 - y0, 0.01));
    fr.push(P(L / 2, y0 - 0.04, L + 0.04, 0.06, 0.12), P(L / 2, y1 - 0.02, L + 0.04, 0.05, 0.1), P(L / 2, y0 + (y1 - y0) * 0.72, L, 0.04, 0.08));
    for (let i = 0; i <= n; i++) fr.push(P((L * i) / n, y0, 0.045, y1 - y0, 0.08));
    for (const s of [0, 1]) for (let k = 0; k < 5; k++) cu.push(P(s ? L - 0.12 - k * 0.07 : 0.12 + k * 0.07, y0 + 0.05, 0.07, y1 - y0 + 0.05, 0.05 + (k % 2) * 0.04).translate(0, 0, alongX ? -0.12 : 0).translate(alongX ? 0 : -0.12, 0, 0));
  };
  for (const [a, b] of [[0.4, 4.4], [5.2, 9.2], [10.0, 14.0], [14.8, 18.8], [19.6, 23.6]]) win(a, b, 7.4, 0.85, 2.55);
  win(0.5, 6.8, 24, 1.1, 2.45, false);
  add(fr, alu); const gm = add(gl, glass, false); gm.receiveShadow = false; add(cu, curtain);
}
// 南の窓の外（明るい空と、遠くの木）。上から見るときは消す
const outside = new THREE.Group();
{
  const sky = tex(512, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#9cc3e4"); gr.addColorStop(0.65, "#dceaf3"); gr.addColorStop(1, "#7e9a6a"); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${50 + rnd() * 30},${90 + rnd() * 40},${40 + rnd() * 20},0.9)`; g.beginPath(); g.arc(rnd() * w, h * 0.78 + rnd() * 10, 8 + rnd() * 14, 0, Math.PI * 2); g.fill(); } });
  const m = new THREE.MeshBasicMaterial({ map: sky });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(60, 14), m); p.position.set(12, 4, 22); p.rotation.y = Math.PI; outside.add(p);
  const p2 = new THREE.Mesh(new THREE.PlaneGeometry(40, 14), m); p2.position.set(40, 4, 3); p2.rotation.y = -Math.PI / 2; outside.add(p2);
  scene.add(outside);
}

// ---------- ドア ----------
{
  const door = M(0xc9b48f, { roughness: 0.6 }), frame = M(0x8f7a5a, { roughness: 0.6 });
  const g = [], f = [], w = [];
  const slide = (x0, x1, z) => { const L = x1 - x0; for (const k of [0, 1]) { g.push(B(L / 2 + 0.03, 1.98, 0.04, x0 + L / 4 + k * L / 2, 0.02, z + (k ? 0.03 : -0.03))); w.push(B(0.3, 0.5, 0.045, x0 + L / 4 + k * L / 2, 1.2, z + (k ? 0.03 : -0.03))); } f.push(B(L + 0.1, 0.06, 0.18, (x0 + x1) / 2, 2.0, z)); };
  const swing = (x0, x1, z, alongX = true, open = 0.5) => { const L = x1 - x0; const leaf = B(L - 0.04, 1.98, 0.04, (L - 0.04) / 2, 0.02, 0).rotateY(-open).translate(x0, 0, z); if (!alongX) leaf.rotateY(Math.PI / 2).translate(0, 0, 0); g.push(leaf); };
  slide(1.4, 3.0, 0); swing(9.55, 10.5, 0.02);
  // 西の印刷室への開き戸、東の外への開き戸、共用スペースのドア（すこし開けておく）
  g.push(B(0.86, 1.98, 0.04, 0, 0.02, 0).rotateY(Math.PI / 2 - 0.3).translate(0.02, 0, 1.33));
  g.push(B(0.86, 1.98, 0.04, 0, 0.02, 0).rotateY(-Math.PI / 2 + 0.25).translate(23.98, 0, -1.8));
  for (const [x0, x1] of [[14.9, 15.8], [22.8, 23.7]]) g.push(B(x1 - x0, 1.98, 0.04, (x0 + x1) / 2, 0.02, -2.5));
  g.push(B(0.04, 1.98, 1.0, 14.4, 0.02, -1.25).translate(0, 0, 0));
  add(g, door); add(f, frame); add(w, glass, false);
}

// ---------- 家具 ----------
// 机（写真）：木の天板、白い鉄の脚と引き出し、うしろの幕板。座る人は +z 側（向きは rot でまわす）。天板のおくに緑のケーブル
const DW = 0.98, DD = 0.7, DH = 0.72;
const deskKit = kit([
  [woodTop, B(DW, 0.025, DD, 0, DH - 0.025, 0)],
  [steelW, B(0.03, DH - 0.03, DD - 0.06, -DW / 2 + 0.03, 0, 0)],                       // 左の脚の板
  [steelW, B(0.4, DH - 0.06, DD - 0.08, DW / 2 - 0.22, 0.03, 0.01)],                     // 右の引き出しの箱
  [steelW, B(DW - 0.46, 0.32, 0.02, -0.18, 0.33, -DD / 2 + 0.05)],                      // うしろの幕板
  [steelG, B(0.38, 0.13, 0.012, DW / 2 - 0.22, 0.52, DD / 2 - 0.03)],                    // 引き出し（3段）
  [steelG, B(0.38, 0.15, 0.012, DW / 2 - 0.22, 0.35, DD / 2 - 0.03)],
  [steelG, B(0.38, 0.28, 0.012, DW / 2 - 0.22, 0.05, DD / 2 - 0.03)],
  [steelD, B(0.16, 0.015, 0.02, DW / 2 - 0.22, 0.6, DD / 2 - 0.02)], [steelD, B(0.16, 0.015, 0.02, DW / 2 - 0.22, 0.44, DD / 2 - 0.02)], [steelD, B(0.16, 0.015, 0.02, DW / 2 - 0.22, 0.3, DD / 2 - 0.02)],
  [steelW, B(0.6, 0.02, 0.4, -0.15, DH - 0.06, 0.08)],                                  // 天板の下のうすい引き出し
  [greenCable, new THREE.TorusGeometry(0.08, 0.012, 6, 18).rotateX(Math.PI / 2).translate(0.15, DH + 0.012, -DD / 2 + 0.14)],
  [steelD, B(0.25, 0.01, 0.03, -0.2, DH, -DD / 2 + 0.06)],                              // ケーブルの穴のふた
]);
// ノートパソコン（開いた状態）と、モニター
const laptopKit = kit([[M(0x9aa1a8, { roughness: 0.35, metalness: 0.5 }), B(0.33, 0.018, 0.23, 0, 0, 0)], [M(0x9aa1a8, { roughness: 0.35, metalness: 0.5 }), B(0.33, 0.22, 0.008, 0, 0, 0).rotateX(-0.25).translate(0, 0.015, -0.115)], [screen, B(0.3, 0.19, 0.002, 0, 0.018, 0).rotateX(-0.25).translate(0, 0.012, -0.107)], [black, B(0.27, 0.002, 0.1, 0, 0.018, 0.03)]]);
const monitorKit = kit([[black, B(0.55, 0.33, 0.03, 0, 0.12, 0)], [screen, B(0.52, 0.3, 0.002, 0, 0.135, 0.016)], [black, B(0.05, 0.14, 0.04, 0, 0, -0.03)], [black, B(0.22, 0.012, 0.16, 0, 0, -0.02)]]);
const papersKit = kit([[paper, B(0.21, 0.012, 0.3, 0, 0, 0)], [paper, B(0.21, 0.008, 0.3, 0.03, 0.012, 0.02).rotateY(0.15)]]);
const penKit = kit([[black, C(0.035, 0.1, 0, 0, 0, 10)], [M(0xd33), C(0.005, 0.14, 0.01, 0.02, 0, 6)], [M(0x25a), C(0.005, 0.13, -0.01, 0.02, 0.01, 6)]]);
// 事務いす：布の座面と背もたれ、ひじかけ、ガス柱、5本脚とキャスター。座る人は -z を向く
const chairParts = [
  [chairFab, B(0.48, 0.07, 0.46, 0, 0.43, 0)],
  [chairFab, B(0.46, 0.46, 0.06, 0, 0.58, 0.25).rotateX(0.1).translate(0, 0, 0.0)],
  [plastic, B(0.44, 0.03, 0.05, 0, 0.55, 0.23)],
  [plastic, B(0.04, 0.2, 0.04, 0.27, 0.45, 0.05)], [plastic, B(0.04, 0.2, 0.04, -0.27, 0.45, 0.05)],
  [plastic, B(0.06, 0.025, 0.26, 0.27, 0.64, 0.02)], [plastic, B(0.06, 0.025, 0.26, -0.27, 0.64, 0.02)],
  [chrome, C(0.025, 0.3, 0, 0.1, 0, 10)], [plastic, C(0.035, 0.12, 0, 0.08, 0, 10)],
];
for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; chairParts.push([plastic, B(0.04, 0.03, 0.3, 0, 0.07, 0.15).rotateY(a)]); chairParts.push([black, new THREE.SphereGeometry(0.028, 8, 6).translate(Math.sin(a) * 0.3, 0.028, Math.cos(a) * 0.3)]); }
const chairKit = kit(chairParts);
// 低い戸棚（引き違い戸。高さ 1.15m で、机より高い）。前は +z
const cabKit = kit([[steelG, B(0.9, 1.12, 0.45, 0, 0.03, 0)], [steelW, B(0.44, 1.0, 0.012, -0.22, 0.08, 0.226)], [steelW, B(0.44, 1.0, 0.012, 0.22, 0.08, 0.235)], [steelD, B(0.015, 0.12, 0.02, -0.05, 0.55, 0.24)], [steelD, B(0.015, 0.12, 0.02, 0.05, 0.55, 0.245)], [steelD, B(0.9, 0.03, 0.42, 0, 0, 0)]]);
// 窓の下の低い棚（高さ 0.8m）と、背の高い保管庫
const lowKit = kit([[steelG, B(0.9, 0.78, 0.4, 0, 0.02, 0)], [steelW, B(0.44, 0.68, 0.012, -0.22, 0.06, 0.2)], [steelW, B(0.44, 0.68, 0.012, 0.22, 0.06, 0.21)], [steelD, B(0.9, 0.02, 0.38, 0, 0, 0)]]);
const tallKit = kit([[steelG, B(0.9, 1.8, 0.45, 0, 0, 0)], [steelW, B(0.44, 1.7, 0.012, -0.22, 0.05, 0.226)], [steelW, B(0.44, 1.7, 0.012, 0.22, 0.05, 0.226)], [steelD, B(0.02, 0.2, 0.02, -0.03, 0.9, 0.24)], [steelD, B(0.02, 0.2, 0.02, 0.03, 0.9, 0.24)], [steelD, B(0.25, 0.08, 0.01, -0.22, 1.5, 0.235)], [steelD, B(0.25, 0.08, 0.01, 0.22, 1.5, 0.235)]]);
const binderKit = binders.map((m, i) => kit([[m, B(0.06, 0.3, 0.26, 0, 0, 0)]]));

// 座る人の向き（face）→ 机の rot（座る人は机の +z 側。N：北を向く＝机の北に座る人ではなく、机の南に座って北を向く）
const ROT = { N: 0, S: Math.PI, E: -Math.PI / 2, W: Math.PI / 2 };
const desks = [], chairs = [], laptops = [], monitors = [], papers = [], pens = [];
function desk(x, z, face, chairOut = 0.28) {
  const r = ROT[face], dx = -Math.sin(r), dz = -Math.cos(r); // 向いている方向
  desks.push({ x, z, rot: r });
  const out = chairOut + (rnd() < 0.3 ? 0.25 : 0); // ところどころ、いすを少し引いてある
  chairs.push({ x: x - dx * out, z: z - dz * out, rot: r + (rnd() - 0.5) * 0.3 });
  const kx = Math.cos(r), kz = -Math.sin(r); // 机の横方向
  const onTop = (u, w) => ({ x: x + kx * u - dx * w, z: z + kz * u - dz * w, y: DH, rot: r + (rnd() - 0.5) * 0.2 });
  if (rnd() < 0.55) laptops.push(onTop(-0.05 + (rnd() - 0.5) * 0.1, 0.02));
  else monitors.push(onTop(-0.1, -0.15));
  if (rnd() < 0.7) papers.push(onTop(0.3, 0.1));
  if (rnd() < 0.5) pens.push(onTop(-0.38, -0.22));
}
// 背中合わせ（机がくっつく）の2列。zm：まん中の線
const pairNS = (xs, zm) => xs.forEach((x) => { desk(x, zm - DD / 2, "S"); desk(x, zm + DD / 2, "N"); });
const rowN = (xs, z) => xs.forEach((x) => desk(x, z, "N"));
// 1年
rowN([3.98, 4.99, 6.0, 7.02, 8.47], 2.53);
pairNS([3.98, 4.99, 6.0, 7.02, 8.47, 9.46], 5.0);
// 2年
rowN([9.58, 10.52, 11.5, 13.36, 14.4, 15.39, 16.4], 2.53);
pairNS([10.59, 11.58, 13.1, 14.1, 15.08], 5.0);
// 業務アシスタント
for (const z of [3.0, 4.1]) desk(18.28, z, "E");
// 3年
for (const z of [1.94, 2.88, 3.83]) desk(18.9, z, "W");
for (const z of [-0.71, 0.24, 1.18, 2.72, 3.66, 4.66, 5.63]) { desk(21.62 - DD / 2, z, "E"); desk(21.62 + DD / 2, z, "W"); }
place(deskKit, desks); place(chairKit, chairs); place(laptopKit, laptops); place(monitorKit, monitors); place(papersKit, papers); place(penKit, pens);

// 打ち合わせのテーブル（業務アシスタントの南）
{
  const t = kit([[M(0xe9e6df, { roughness: 0.4 }), B(1.3, 0.03, 0.6, 0, 0.7, 0)], [steelD, B(0.04, 0.7, 0.04, -0.6, 0, -0.25)], [steelD, B(0.04, 0.7, 0.04, 0.6, 0, -0.25)], [steelD, B(0.04, 0.7, 0.04, -0.6, 0, 0.25)], [steelD, B(0.04, 0.7, 0.04, 0.6, 0, 0.25)]]);
  place(t, [{ x: 17.25, z: 5.3 }, { x: 18.55, z: 5.3 }, { x: 19.85, z: 5.3 }]);
  place(chairKit, [{ x: 18.55, z: 5.95, rot: 0.1 }, { x: 19.85, z: 5.95, rot: -0.1 }]);
}
// 北の壁ぎわの戸棚（引き違い）と、1年・2年の北の列のうしろの戸棚
const cabs = [], lows = [], talls = [];
for (const [a, b] of [[3.1, 5.0], [6.0, 8.3], [11.3, 13.4]]) for (let x = a + 0.45; x <= b - 0.4; x += 0.92) cabs.push({ x, z: 0.38, rot: 0 });
for (const [a, b] of [[3.4, 9.0], [9.1, 11.9], [12.8, 16.9]]) for (let x = a + 0.45; x <= b - 0.4; x += 0.92) cabs.push({ x, z: 1.95, rot: Math.PI });
// 共用スペースの北の壁ぎわ（更衣室の入口のあいだ）
for (let x = 16.9 + 0.45; x <= 23.0 - 0.4; x += 0.92) cabs.push({ x, z: -2.2, rot: 0 });
// 南の窓の下の低い棚（柱のところはあける）
for (const [a, b] of [[1.2, 4.3], [5.3, 9.1], [10.1, 13.9], [14.9, 18.7], [19.7, 23.5]]) for (let x = a + 0.45; x <= b - 0.4; x += 0.92) lows.push({ x, z: 7.05, rot: Math.PI });
// 東の壁ぎわの保管庫
for (let z = 2.1; z <= 6.3; z += 0.92) talls.push({ x: 23.7, z, rot: -Math.PI / 2 });
place(cabKit, cabs); place(lowKit, lows); place(tallKit, talls);
// 戸棚の上のファイル（色とりどり）
{
  const lists = binders.map(() => []);
  for (const c of [...cabs, ...lows]) { const h = c.z > 6 ? 0.8 : 1.15; let u = -0.4; while (u < 0.38) { if (rnd() < 0.45) { u += 0.12; continue; } const k = (rnd() * binders.length) | 0, kx = Math.cos(c.rot), kz = -Math.sin(c.rot); lists[k].push({ x: c.x + kx * u, z: c.z + kz * u, y: h, rot: c.rot }); u += 0.065; } }
  binderKit.forEach((k, i) => place(k, lists[i]));
}
// 西のはしの流し台と電子レンジ・冷蔵庫（配置図）
{
  const sink = [[steelW, B(0.6, 0.85, 1.8, 0, 0, 0)], [M(0xc9ced2, { roughness: 0.15, metalness: 0.8 }), B(0.62, 0.03, 1.82, 0, 0.85, 0)], [M(0xa9afb4, { roughness: 0.2, metalness: 0.8 }), B(0.4, 0.02, 0.5, 0.02, 0.86, -0.35)], [chrome, C(0.015, 0.3, -0.22, 0.88, -0.35, 8)], [chrome, B(0.2, 0.02, 0.02, -0.13, 1.17, -0.35)]];
  add(sink.filter(([m]) => m === steelW).map(([, g]) => g.clone().translate(0.65, 0, 5.6)), steelW);
  for (const [m, g] of sink.filter(([m]) => m !== steelW)) add([g.clone().translate(0.65, 0, 5.6)], m);
  add([B(0.45, 0.28, 0.35, 0.6, 0.88, 6.05)], M(0xf0f0ee)); add([B(0.02, 0.18, 0.25, 0.83, 0.92, 6.05)], screen);
  add([B(0.6, 1.4, 0.6, 0.65, 0, 4.2)], M(0xe7e9ea, { roughness: 0.3 }));
}
// 壁のホワイトボード（西の壁と、北の柱）と時計
{
  const wb = tex(256, 128, (g, w, h) => { g.fillStyle = "#fbfbfa"; g.fillRect(0, 0, w, h); g.strokeStyle = "rgba(40,60,120,0.55)"; g.lineWidth = 1.5; for (let i = 0; i < 9; i++) { g.beginPath(); const y = 14 + i * 12; g.moveTo(14, y); g.lineTo(14 + 60 + rnd() * 140, y); g.stroke(); } g.fillStyle = "#e33"; g.fillRect(200, 12, 40, 6); });
  const bm = M(0xffffff, { map: wb, roughness: 0.25 });
  for (const [x, z, ry, w] of [[0.09, 3.0, Math.PI / 2, 1.8], [0.09, 5.0, Math.PI / 2, 1.2]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.9), bm); p.position.set(x, 1.55, z); p.rotation.y = ry; scene.add(p); add([B(0.03, 0.04, w + 0.06, x, 1.08, z)], alu); }
  const clk = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), M(0xffffff)); clk.position.set(0.09, 2.45, 3.0); clk.rotation.y = Math.PI / 2; scene.add(clk);
  add([new THREE.TorusGeometry(0.15, 0.012, 6, 32).rotateY(Math.PI / 2).translate(0.09, 2.45, 3.0)], black);
}

// ---------- 名前の札 ----------
const tag = (text, color, x, y, z) => { const d = document.createElement("div"); d.className = "tag"; d.textContent = text; d.style.background = color; const o = new CSS2DObject(d); o.position.set(x, y, z); scene.add(o); return o; };
const tags = [tag("1年", "#c2549a", 6.5, 1.6, 4.0), tag("2年", "#2b8fb4", 12.8, 1.6, 4.0), tag("3年", "#3c9a4a", 21.6, 1.6, 2.4), tag("業務アシスタント", "#6b6f78", 18.3, 1.6, 3.5), tag("共用スペース", "#8a7a5a", 19.2, 2.0, -1.2), tag("流し台", "#8a7a5a", 0.7, 1.6, 5.6)];

// ---------- 見る場所 ----------
const VIEWS = {
  walk: [[0.9, 1.55, 3.9], [20, 1.1, 3.2]],
  east: [[23.2, 1.55, 6.6], [6, 1.0, 3.0]],
  top: [[12, 30, 2.5], [12, 0, 2.45]],
  bird: [[4, 12, 15], [13, 0, 2.5]],
};
let anim = null;
function go(name, ms = 900) {
  const [p, t] = VIEWS[name];
  anim = { t0: performance.now(), ms, p0: camera.position.clone(), t0v: controls.target.clone(), p1: new THREE.Vector3(...p), t1: new THREE.Vector3(...t) };
  document.querySelectorAll(".views .btn").forEach((b) => b.classList.toggle("active", b.dataset.v === name));
}
document.querySelectorAll(".views .btn").forEach((b) => b.addEventListener("click", () => go(b.dataset.v)));
camera.position.set(...VIEWS.walk[0]); controls.target.set(...VIEWS.walk[1]);
document.querySelector('.views .btn[data-v="walk"]').classList.add("active");

function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); labels.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; // 物は動かないので、影は1回だけ計算
function tick(now) {
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / anim.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    camera.position.lerpVectors(anim.p0, anim.p1, e); controls.target.lerpVectors(anim.t0v, anim.t1, e);
    if (k >= 1) anim = null;
  }
  controls.update();
  // 天井より上から見るときは、天井を消して中が見えるように。札も、上から見るときだけ出す
  const above = camera.position.y > CEIL - 0.05;
  ceiling.visible = outside.visible = !above;
  for (const t of tags) t.visible = above || camera.position.distanceTo(t.position) < 9;
  renderer.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
document.getElementById("loading").remove();
