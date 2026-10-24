// 職員室のくわしいモデル（シークレットページ）
// 座標はメートル。x：西の柱（X7）から東へ、z：北の壁（Y3）から南へ（南の窓の壁 Y1 が z = 7.4）。
// 北へのびた共用スペースは x 14.4〜24、z -2.5〜0（北の壁 Y5）。配置図の寸法をそのまま使う
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Reflector } from "three/addons/objects/Reflector.js";

const CEIL = 2.9; // 天井の高さ
const view = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
// 画面のきめ細かさ。動きが重い端末では、あとで自動で少し下げる（maxDpr〜minDpr）
const maxDpr = Math.min(devicePixelRatio, matchMedia("(pointer: coarse)").matches ? 1.5 : 1.75), minDpr = Math.min(maxDpr, 0.75);
let dpr = maxDpr;
renderer.setPixelRatio(dpr);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
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
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8ab95, 0.35));
const sun = new THREE.DirectionalLight(0xfff0d6, 1.9); // 南の窓から入る日の光
sun.position.set(6, 9, 18); sun.target.position.set(12, 0, 2);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 2048); sun.shadow.radius = 4;
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 12, bottom: -12, near: 1, far: 40 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// 天井の蛍光灯のやわらかい光（面の光）。部屋のならびにそって帯で置く
RectAreaLightUniformsLib.init();
// 面の光は1つごとに全部の点で計算するので重い。2列分を1枚にまとめて3枚にする
for (const [x, z, w, d] of [[6, 4, 11, 4], [18.5, 4, 10, 4], [19.2, -1.25, 9, 1.0]]) {
  const l = new THREE.RectAreaLight(0xfff6e8, 1.3 * (d > 2 ? 0.6 : 1), w, d); l.position.set(x, 2.84, z); l.lookAt(x, 0, z); scene.add(l);
}

// ---------- 道具 ----------
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o });
const B = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z); // y は下の面
// 角の丸い箱（家具のふちをやわらかく見せる）
const R = (w, h, d, x = 0, y = 0, z = 0, r = 0.012) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.2, h / 2.2, d / 2.2)).translate(x, y + h / 2, z);
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
const chairFab = M(0x2b3442, { roughness: 0.95, map: tex(64, 64, (g, w, h) => { g.fillStyle = '#5b6574'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1); for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h); }, 6, 6) }); // 布の織り目
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
let mirror = null;
const floorMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: floorTex, roughness: 0.32, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.12 }); // ワックスのかかったつや
{
  const s = new THREE.Shape([new THREE.Vector2(0, -7.4), new THREE.Vector2(24, -7.4), new THREE.Vector2(24, 2.5), new THREE.Vector2(14.4, 2.5), new THREE.Vector2(14.4, 0), new THREE.Vector2(0, 0)]);
  const g = new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
  const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 1.8, p.getZ(i) / 1.8);
  floorTex.repeat.set(1, 1);
  const f = new THREE.Mesh(g, floorMat); f.receiveShadow = true; scene.add(f);
  // 写真：つやのある床に、蛍光灯や机がぼんやり映る。鏡の板を床のすぐ下に置き、床を少しすけさせて重ねる（止まったときだけ）
  floorMat.transparent = true; floorMat.opacity = 0.8;
  mirror = new Reflector(new THREE.PlaneGeometry(26, 12), { textureWidth: 1024, textureHeight: 512, color: 0x8f8a82 });
  mirror.rotation.x = -Math.PI / 2; mirror.position.set(12, -0.002, 2.45); mirror.visible = false;
  scene.add(mirror);
}
// 天井（上から見るときは消す）：白い化粧板と、蛍光灯、梁
const ceiling = new THREE.Group();
{
  const ct = tex(128, 128, (g, w, h) => { g.fillStyle = "#f3f2ee"; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = "rgba(150,145,135,0.35)"; g.fillRect(rnd() * w, rnd() * h, 1.2, 1.2); } g.fillStyle = "rgba(160,155,145,0.5)"; g.fillRect(0, 0, w, 1); g.fillRect(0, 0, 1, h); });
  const s = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(24, 0), new THREE.Vector2(24, -2.5 - 7.4 + 7.4), new THREE.Vector2(0, 0)]);
  const plane = (x0, x1, z0, z1) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI / 2).translate((x0 + x1) / 2, CEIL, (z0 + z1) / 2); const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 0.6, p.getZ(i) / 0.6); return g; };
  const cm = new THREE.Mesh(mergeGeometries([plane(0, 24, 0, 7.4), plane(14.4, 24, -2.5, 0)]), M(0xffffff, { map: ct, roughness: 0.95, emissive: 0xffffff, emissiveMap: ct, emissiveIntensity: 0.5 })); // 天井は蛍光灯の光で明るい
  ceiling.add(cm);
  const beams = [];
  for (const x of [4.8, 9.6, 14.4, 19.2]) beams.push(B(0.45, 0.5, x === 14.4 || x === 19.2 ? 9.9 : 7.4, x, CEIL - 0.5, x === 14.4 || x === 19.2 ? 2.45 : 3.7));
  beams.push(B(24, 0.5, 0.4, 12, CEIL - 0.5, 0.2));
  ceiling.add(new THREE.Mesh(mergeGeometries(beams.map((g) => g.toNonIndexed())), M(0xece6d8, { roughness: 0.9, emissive: 0xece6d8, emissiveIntensity: 0.32 })));
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
    // カーテン：両はしにまとめた、ひだのある布（波の形）
    for (const s of [0, 1]) {
      const W = 0.42, H = y1 - y0 + 0.25, g = new THREE.PlaneGeometry(W, H, 24, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / W) * Math.PI * 10) * 0.035);
      g.computeVertexNormals(); g.translate(W / 2, H / 2, 0);
      const u0 = s ? L - 0.05 - W : 0.05;
      if (alongX) g.translate(x0 + u0, y0 - 0.05, z - 0.16); else g.rotateY(Math.PI / 2).translate(z - 0.16, y0 - 0.05, x0 + u0 + W);
      cu.push(g);
    }
  };
  for (const [a, b] of [[0.4, 4.4], [5.2, 9.2], [10.0, 14.0], [14.8, 18.8], [19.6, 23.6]]) win(a, b, 7.4, 0.85, 2.55);
  win(0.5, 6.8, 24, 1.1, 2.45, false);
  add(fr, alu); const gm = add(gl, glass, false); gm.receiveShadow = false; add(cu, curtain, false);
  // 窓台（白い板）
  add([0.4, 5.2, 10.0, 14.8, 19.6].map((a) => B(4.0, 0.03, 0.22, a + 2.0, 0.84, 7.28)), M(0xf1efe9, { roughness: 0.5 }));
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
  [woodTop, R(DW, 0.026, DD, 0, DH - 0.026, 0, 0.006)],
  [M(0xb89a72, { roughness: 0.5 }), B(DW - 0.002, 0.004, DD - 0.002, 0, DH - 0.03, 0)], // 天板の小口
  [steelW, B(0.03, DH - 0.03, DD - 0.06, -DW / 2 + 0.03, 0, 0)],                       // 左の脚の板
  [steelW, R(0.4, DH - 0.06, DD - 0.08, DW / 2 - 0.22, 0.03, 0.01, 0.01)],                     // 右の引き出しの箱
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
  [chairFab, R(0.48, 0.075, 0.46, 0, 0.43, 0, 0.03)],
  [chairFab, R(0.46, 0.5, 0.06, 0, 0.58, 0.25, 0.025).rotateX(0.1)],
  [plastic, B(0.44, 0.03, 0.05, 0, 0.55, 0.23)],
  [plastic, B(0.04, 0.2, 0.04, 0.27, 0.45, 0.05)], [plastic, B(0.04, 0.2, 0.04, -0.27, 0.45, 0.05)],
  [plastic, B(0.06, 0.025, 0.26, 0.27, 0.64, 0.02)], [plastic, B(0.06, 0.025, 0.26, -0.27, 0.64, 0.02)],
  [chrome, C(0.025, 0.3, 0, 0.1, 0, 10)], [plastic, C(0.035, 0.12, 0, 0.08, 0, 10)],
];
for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; chairParts.push([plastic, B(0.04, 0.03, 0.3, 0, 0.07, 0.15).rotateY(a)]); chairParts.push([black, new THREE.SphereGeometry(0.028, 8, 6).translate(Math.sin(a) * 0.3, 0.028, Math.cos(a) * 0.3)]); }
const chairKit = kit(chairParts);
// 低い戸棚（引き違い戸。高さ 1.15m で、机より高い）。前は +z
const cabKit = kit([[steelG, R(0.9, 1.12, 0.45, 0, 0.03, 0, 0.008)], [steelW, B(0.44, 1.0, 0.012, -0.22, 0.08, 0.226)], [steelW, B(0.44, 1.0, 0.012, 0.22, 0.08, 0.235)], [steelD, B(0.015, 0.12, 0.02, -0.05, 0.55, 0.24)], [steelD, B(0.015, 0.12, 0.02, 0.05, 0.55, 0.245)], [steelD, B(0.9, 0.03, 0.42, 0, 0, 0)]]);
// 窓の下の低い棚（高さ 0.8m）と、背の高い保管庫
const lowKit = kit([[steelG, B(0.9, 0.78, 0.4, 0, 0.02, 0)], [steelW, B(0.44, 0.68, 0.012, -0.22, 0.06, 0.2)], [steelW, B(0.44, 0.68, 0.012, 0.22, 0.06, 0.21)], [steelD, B(0.9, 0.02, 0.38, 0, 0, 0)]]);
const tallKit = kit([[steelG, R(0.9, 1.8, 0.45, 0, 0, 0, 0.008)], [steelW, B(0.44, 1.7, 0.012, -0.22, 0.05, 0.226)], [steelW, B(0.44, 1.7, 0.012, 0.22, 0.05, 0.226)], [steelD, B(0.02, 0.2, 0.02, -0.03, 0.9, 0.24)], [steelD, B(0.02, 0.2, 0.02, 0.03, 0.9, 0.24)], [steelD, B(0.25, 0.08, 0.01, -0.22, 1.5, 0.235)], [steelD, B(0.25, 0.08, 0.01, 0.22, 1.5, 0.235)]]);
const binderKit = binders.map((m, i) => kit([[m, B(0.045, 0.25, 0.2, 0, 0, 0)], [M(0xf4f4f0), B(0.002, 0.06, 0.12, 0.024, 0.15, 0)]])); // ファイル（背に白い見出し）

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
// 東の壁ぎわの戸棚（窓の下）
for (let z = 2.1; z <= 6.3; z += 0.92) talls.push({ x: 23.7, z, rot: -Math.PI / 2 });
place(cabKit, cabs.concat(talls)); place(lowKit, lows); // 東の壁ぎわも、窓の下にかくれる高さの戸棚
// 写真：机の上の銀色の電源タップ、窓の下の棚の上の段ボール、入口の横の白いオープン棚
{
  const tapK = kit([[M(0xc9cdd1, { roughness: 0.3, metalness: 0.6 }), R(0.36, 0.035, 0.05, 0, 0, 0, 0.01)], [black, B(0.3, 0.004, 0.02, 0, 0.035, 0)]]);
  place(tapK, desks.filter(() => rnd() < 0.8).map((d) => { const r = d.rot, fx = -Math.sin(r), fz = -Math.cos(r), kx = Math.cos(r), kz = -Math.sin(r); return { x: d.x + kx * 0.05 + fx * 0.27, z: d.z + kz * 0.05 + fz * 0.27, y: DH, rot: r + (rnd() - 0.5) * 0.3 }; }));
  const boxK = kit([[M(0xb68a58, { roughness: 0.9 }), B(0.5, 0.32, 0.36, 0, 0, 0)], [M(0xc9a36e, { roughness: 0.8 }), B(0.5, 0.004, 0.06, 0, 0.32, 0)]]);
  place(boxK, lows.filter(() => rnd() < 0.35).map((c) => ({ x: c.x + (rnd() - 0.5) * 0.2, z: c.z, y: 0.8, rot: (rnd() - 0.5) * 0.3 })));
  const shelfK = kit([[M(0xf4f4f0, { roughness: 0.4 }), B(0.9, 0.02, 0.4, 0, 0, 0)], ...[0.3, 0.6, 0.9, 1.2].map((y) => [M(0xf4f4f0, { roughness: 0.4 }), B(0.9, 0.02, 0.4, 0, y, 0)]), [M(0xf4f4f0, { roughness: 0.4 }), B(0.02, 1.24, 0.4, -0.44, 0, 0)], [M(0xf4f4f0, { roughness: 0.4 }), B(0.02, 1.24, 0.4, 0.44, 0, 0)], [M(0xf4f4f0, { roughness: 0.4 }), B(0.02, 1.24, 0.4, 0, 0, 0)], [M(0xf4f4f0, { roughness: 0.4 }), B(0.9, 1.24, 0.01, 0, 0, -0.2)]]);
  place(shelfK, [{ x: 0.42, z: 3.2, rot: Math.PI / 2 }]);
}
// 戸棚の上のファイル（色とりどり）
{
  const lists = binders.map(() => []);
  for (const c of [...cabs, ...lows]) { const h = c.z > 6 ? 0.8 : 1.15; let u = -0.4; while (u < 0.38) { if (rnd() < 0.45) { u += 0.12; continue; } const k = (rnd() * binders.length) | 0, kx = Math.cos(c.rot), kz = -Math.sin(c.rot); lists[k].push({ x: c.x + kx * u, z: c.z + kz * u, y: h, rot: c.rot + (rnd() - 0.5) * 0.06 }); u += 0.05; } }
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

// ---------- くらしの小物（職員室らしさ） ----------
{
  // 机の上：書類トレー、マグカップ、本やファイルの山、付せん、卓上カレンダー。机の下：ごみ箱
  const trayK = kit([[M(0x3c4048, { roughness: 0.5 }), B(0.25, 0.012, 0.34, 0, 0, 0)], [M(0x3c4048, { roughness: 0.5 }), B(0.25, 0.05, 0.01, 0, 0, 0.165)], [M(0x3c4048, { roughness: 0.5 }), B(0.25, 0.05, 0.01, 0, 0, -0.165)], [M(0x3c4048), B(0.25, 0.012, 0.34, 0, 0.07, 0)], [paper, B(0.21, 0.03, 0.29, 0, 0.012, 0)], [paper, B(0.21, 0.02, 0.29, 0, 0.082, 0)]]);
  const mugCols = [0xffffff, 0xd8473a, 0x2f5f9a, 0xe7c34a, 0x5a9a5a];
  const mugKs = mugCols.map((c) => kit([[M(c, { roughness: 0.3 }), C(0.042, 0.095, 0, 0, 0, 14)], [M(c, { roughness: 0.3 }), new THREE.TorusGeometry(0.028, 0.008, 6, 10, Math.PI).rotateZ(-Math.PI / 2).translate(0.045, 0.05, 0)], [M(0x3a2414, { roughness: 0.2 }), C(0.036, 0.004, 0, 0.08, 0, 14)]]));
  const bookCols = [0x2a4f8a, 0x8a2a2a, 0x2f6b47, 0xd9b44a, 0x444444, 0xe8e2d0];
  const bookKs = bookCols.map((c) => kit([[M(c, { roughness: 0.75 }), B(0.21, 0.025, 0.3, 0, 0, 0)], [paper, B(0.2, 0.021, 0.29, 0.006, 0.002, 0)]]));
  const fileBoxK = kit([[M(0x2c5a8a, { roughness: 0.6 }), B(0.1, 0.3, 0.26, 0, 0, 0)], [M(0xc9a85a, { roughness: 0.6 }), B(0.1, 0.3, 0.26, 0.11, 0, 0)], [M(0xd8d8d0), B(0.08, 0.06, 0.005, 0, 0.18, 0.131)], [M(0xd8d8d0), B(0.08, 0.06, 0.005, 0.11, 0.18, 0.131)]]);
  const calK = kit([[M(0xffffff, { roughness: 0.8 }), B(0.18, 0.12, 0.004, 0, 0, 0).rotateX(-0.35)], [M(0xffffff, { roughness: 0.8 }), B(0.18, 0.12, 0.004, 0, 0, 0).rotateX(0.35).translate(0, 0, -0.08)], [M(0xd33, { roughness: 0.6 }), B(0.18, 0.02, 0.004, 0, 0.1, -0.035)]]);
  const noteK = kit([[M(0xf6e36b, { roughness: 0.9 }), B(0.075, 0.003, 0.075, 0, 0, 0)], [M(0xf3a3b8, { roughness: 0.9 }), B(0.075, 0.003, 0.075, 0.09, 0, 0.02)]]);
  const binK = kit([[M(0x8a929a, { roughness: 0.5 }), C(0.13, 0.3, 0, 0, 0, 16)], [M(0x3a3f45), C(0.125, 0.01, 0, 0.28, 0, 16)]]);
  const bagCols = [0x262a30, 0x5a3b2a, 0x2a3a5a];
  const bagKs = bagCols.map((c) => kit([[M(c, { roughness: 0.8 }), R(0.38, 0.28, 0.12, 0, 0, 0, 0.03)], [M(c, { roughness: 0.8 }), new THREE.TorusGeometry(0.09, 0.012, 6, 12, Math.PI).translate(0, 0.28, 0)]]));
  const lists = { tray: [], mug: mugCols.map(() => []), book: bookCols.map(() => []), fileBox: [], cal: [], note: [], bin: [], bag: bagCols.map(() => []) };
  for (const d of desks) {
    const r = d.rot, fx = -Math.sin(r), fz = -Math.cos(r), kx = Math.cos(r), kz = -Math.sin(r);
    const at = (u, w, y = DH, dr = 0) => ({ x: d.x + kx * u - fx * w, z: d.z + kz * u - fz * w, y, rot: r + dr });
    if (rnd() < 0.6) lists.tray.push(at(0.33, -0.15, DH, (rnd() - 0.5) * 0.15));
    if (rnd() < 0.55) lists.mug[(rnd() * mugCols.length) | 0].push(at(0.22 + rnd() * 0.15, 0.12 + rnd() * 0.12, DH, rnd() * 6));
    if (rnd() < 0.65) { const n = 1 + ((rnd() * 4) | 0); for (let i = 0; i < n; i++) lists.book[(rnd() * bookCols.length) | 0].push(at(-0.36, -0.12, DH + i * 0.026, (rnd() - 0.5) * 0.25)); }
    if (rnd() < 0.4) lists.fileBox.push(at(-0.3, -0.22, DH));
    if (rnd() < 0.3) lists.cal.push(at(0.1, -0.24, DH));
    if (rnd() < 0.35) lists.note.push(at(-0.1, 0.22, DH, rnd()));
    if (rnd() < 0.7) lists.bin.push(at(-0.3, -0.05, 0));
    if (rnd() < 0.3) lists.bag[(rnd() * bagCols.length) | 0].push(at(0.05, 0.42, 0, Math.PI / 2 + (rnd() - 0.5) * 0.4));
  }
  place(trayK, lists.tray); place(fileBoxK, lists.fileBox); place(calK, lists.cal); place(noteK, lists.note); place(binK, lists.bin);
  mugKs.forEach((k, i) => place(k, lists.mug[i])); bookKs.forEach((k, i) => place(k, lists.book[i])); bagKs.forEach((k, i) => place(k, lists.bag[i]));
}
{
  // 南の窓の下の棚の上の電話（配置図の TEL）と、複合機（コピー機）
  const telK = kit([[M(0xf1f1ee, { roughness: 0.4 }), R(0.2, 0.06, 0.22, 0, 0, 0, 0.015)], [M(0xf1f1ee, { roughness: 0.4 }), R(0.05, 0.04, 0.2, -0.08, 0.06, 0, 0.015)], [M(0x2a2d32), B(0.08, 0.01, 0.06, 0.04, 0.06, 0.03)], [M(0x9bd), B(0.06, 0.004, 0.03, 0.04, 0.062, -0.05)]]);
  place(telK, [2.4, 6.6, 11.7, 13.3, 16.5, 21.2].map((x) => ({ x, z: 7.08, y: 0.8, rot: Math.PI })));
  const mfp = kit([[M(0xeceae4, { roughness: 0.5 }), R(0.62, 0.95, 0.6, 0, 0, 0, 0.02)], [M(0xeceae4, { roughness: 0.5 }), R(0.6, 0.18, 0.5, 0, 1.0, -0.04, 0.02)], [M(0x2b2e33), B(0.5, 0.04, 0.4, 0, 0.96, 0)], [screen, B(0.16, 0.08, 0.02, 0.18, 1.05, 0.26).rotateX(-0.6)], [paper, B(0.3, 0.02, 0.21, -0.05, 0.98, 0.05)], [M(0xc9c6bd), B(0.58, 0.003, 0.56, 0, 0.5, 0.3)]]);
  place(mfp, [{ x: 12.35, z: 0.45, rot: 0 }]);
  // ごみの分別箱（流し台の横）、消火器（ドアの横）、傘立て
  const sortK = (c) => kit([[M(c, { roughness: 0.5 }), R(0.32, 0.65, 0.4, 0, 0, 0, 0.02)], [M(0x2a2d32), B(0.18, 0.01, 0.04, 0, 0.651, 0.08)]]);
  [[0x2f6fb5, 1.6], [0xe2a12a, 2.0], [0x3f9a4a, 2.4]].forEach(([c, x]) => place(sortK(c), [{ x, z: 6.9, rot: Math.PI }]));
  const ext = kit([[M(0xd02a22, { roughness: 0.35 }), C(0.075, 0.48, 0, 0.02, 0, 16)], [M(0x2a2d32), C(0.03, 0.08, 0, 0.5, 0, 10)], [M(0x2a2d32), B(0.04, 0.02, 0.18, 0.02, 0.56, 0.06)], [M(0xe8e4d8), B(0.24, 0.02, 0.24, 0, 0, 0)]]);
  place(ext, [{ x: 0.4, z: 2.2 }, { x: 14.0, z: -0.25 }, { x: 23.6, z: -0.6 }]);
}
{
  // 北の壁：月間予定表（大きなホワイトボード）、掲示板（コルク）と貼り紙、時間割表
  const days = "日月火水木金土";
  const sched = tex(1024, 512, (g, w, h) => {
    g.fillStyle = "#fbfbf8"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#123"; g.font = "bold 34px sans-serif"; g.fillText("10月 行事予定", 24, 46);
    const cw = (w - 40) / 7, ch = (h - 110) / 5;
    g.strokeStyle = "#1f3f8f"; g.lineWidth = 2;
    for (let i = 0; i <= 7; i++) { g.beginPath(); g.moveTo(20 + i * cw, 70); g.lineTo(20 + i * cw, h - 20); g.stroke(); }
    for (let j = 0; j <= 5; j++) { g.beginPath(); g.moveTo(20, 90 + j * ch); g.lineTo(w - 20, 90 + j * ch); g.stroke(); }
    g.font = "bold 18px sans-serif"; for (let i = 0; i < 7; i++) { g.fillStyle = i === 0 ? "#c22" : i === 6 ? "#22a" : "#123"; g.fillText(days[i], 20 + i * cw + cw / 2 - 9, 86); }
    const ev = ["職員会議", "中間考査", "鴻志祭準備", "進路説明会", "部活動", "保護者会", "避難訓練", "研究授業", "面談週間"];
    g.font = "16px sans-serif";
    for (let d = 1; d <= 31; d++) { const c = (d + 2) % 7, r = Math.floor((d + 2) / 7); const x = 20 + c * cw, y = 90 + r * ch; g.fillStyle = c === 0 ? "#c22" : "#333"; g.fillText(String(d), x + 6, y + 20); if (rnd() < 0.45) { g.fillStyle = ["#1f3f8f", "#c22", "#2a7a3a"][(rnd() * 3) | 0]; g.fillText(ev[(rnd() * ev.length) | 0], x + 8, y + 42 + (rnd() < 0.5 ? 0 : 20)); } }
  });
  const board = (x, w, h, y, mat) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); p.position.set(x, y + h / 2, 0.085); scene.add(p); add([B(w + 0.05, 0.03, 0.03, x, y - 0.03, 0.09), B(w + 0.05, 0.03, 0.03, x, y + h, 0.09), B(0.03, h + 0.06, 0.03, x - w / 2 - 0.015, y - 0.03, 0.09), B(0.03, h + 0.06, 0.03, x + w / 2 + 0.015, y - 0.03, 0.09)], alu, false); add([B(w, 0.025, 0.07, x, y - 0.04, 0.12)], alu, false); };
  board(7.1, 2.4, 1.2, 1.3, M(0xffffff, { map: sched, roughness: 0.25 }));
  const cork = tex(512, 256, (g, w, h) => {
    g.fillStyle = "#b8895a"; g.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(90,55,25,${rnd() * 0.2})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    const cols = ["#ffffff", "#fff6c9", "#e8f2ff", "#ffe3e3", "#e6ffe3"];
    for (let i = 0; i < 14; i++) { const pw = 50 + rnd() * 60, ph = pw * 1.35, x = rnd() * (w - pw), y = rnd() * (h - ph); g.save(); g.translate(x + pw / 2, y + ph / 2); g.rotate((rnd() - 0.5) * 0.1); g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(-pw / 2, -ph / 2, pw, ph); g.fillStyle = "rgba(40,40,60,0.6)"; for (let k = 0; k < 7; k++) g.fillRect(-pw / 2 + 6, -ph / 2 + 10 + k * 9, pw * (0.4 + rnd() * 0.45), 3); g.fillStyle = ["#d33", "#23a", "#2a2", "#ea0"][(rnd() * 4) | 0]; g.beginPath(); g.arc(0, -ph / 2 + 4, 3, 0, 7); g.fill(); g.restore(); }
  });
  board(3.9, 1.8, 0.9, 1.4, M(0xffffff, { map: cork, roughness: 0.9 }));
  board(12.4, 1.6, 0.9, 1.4, M(0xffffff, { map: cork, roughness: 0.9 }));
  const tt = tex(512, 256, (g, w, h) => { g.fillStyle = "#f7f7f2"; g.fillRect(0, 0, w, h); g.fillStyle = "#123"; g.font = "bold 22px sans-serif"; g.fillText("時間割", 12, 28); g.strokeStyle = "#555"; g.lineWidth = 1; for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo(10 + i * 82, 40); g.lineTo(10 + i * 82, h - 8); g.stroke(); } for (let j = 0; j <= 7; j++) { g.beginPath(); g.moveTo(10, 40 + j * 29); g.lineTo(w - 10, 40 + j * 29); g.stroke(); } const sub = ["国", "数", "英", "理", "社", "体", "芸", "家", "情"]; g.font = "15px sans-serif"; for (let i = 1; i < 6; i++) for (let j = 1; j < 7; j++) { g.fillStyle = ["#123", "#a22", "#225"][(i + j) % 3]; g.fillText(sub[(i * 3 + j * 5) % sub.length] + (1 + ((i + j) % 8)), 22 + i * 82, 62 + j * 29); } });
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), M(0xffffff, { map: tt, roughness: 0.6 })); p.position.set(0.09, 1.8, 6.4); p.rotation.y = Math.PI / 2; scene.add(p); }
  // 壁のコンセント・スイッチ、エアコン（壁かけ）、天井の火災報知器とスプリンクラー
  const plate = M(0xf4f4f0, { roughness: 0.4 });
  add([2.0, 6.0, 10.8, 13.0].map((x) => B(0.07, 0.12, 0.01, x, 0.3, 0.08)).concat([1.0, 9.4].map((x) => B(0.07, 0.12, 0.01, x, 1.2, 0.08))), plate, false);
  const ac = (x, z, ry) => { const g = [R(0.9, 0.3, 0.24, 0, 0, 0, 0.04)]; const m = new THREE.Mesh(mergeGeometries(g.map((q) => q.toNonIndexed())), M(0xf3f3ef, { roughness: 0.4 })); m.position.set(x, 2.45, z); m.rotation.y = ry; m.castShadow = true; scene.add(m); const v = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, 0.01), M(0x8a8f95)); v.position.set(0, 0.04, 0.125); m.add(v); };
  ac(23.85, 1.3, -Math.PI / 2); ac(0.16, 1.2, Math.PI / 2); ac(12.0, 0.2, 0);
  const det = [], spr = [];
  for (let x = 2.4; x < 24; x += 4.8) for (const z of [2.6, 5.4]) { det.push(C(0.06, 0.035, x, CEIL - 0.035, z, 16)); spr.push(C(0.02, 0.05, x + 1.2, CEIL - 0.05, z + 0.6, 8)); }
  ceiling.add(new THREE.Mesh(mergeGeometries(det.map((g) => g.toNonIndexed())), M(0xf6f6f3)));
  ceiling.add(new THREE.Mesh(mergeGeometries(spr.map((g) => g.toNonIndexed())), chrome));
  // 幅木（壁の下のふちの、こげ茶の帯）
  const bb = M(0x5a4a3a, { roughness: 0.6 });
  add([B(14.4, 0.08, 0.015, 7.2, 0, 0.085), B(9.6, 0.08, 0.015, 19.2, 0, -2.415), B(0.015, 0.08, 7.4, 0.085, 0, 3.7), B(0.015, 0.08, 9.9, 23.915, 0, 2.45), B(24, 0.08, 0.015, 12, 0, 7.315)], bb, false);
}

// ---------- 名前の札 ----------
const tag = (text, color, x, y, z) => { const d = document.createElement("div"); d.className = "tag"; d.textContent = text; d.style.background = color; const o = new CSS2DObject(d); o.position.set(x, y, z); scene.add(o); return o; };
const tags = [tag("1年", "#c2549a", 6.5, 1.6, 4.0), tag("2年", "#2b8fb4", 12.8, 1.6, 4.0), tag("3年", "#3c9a4a", 21.6, 1.6, 2.4), tag("業務アシスタント", "#6b6f78", 18.3, 1.6, 3.5), tag("共用スペース", "#8a7a5a", 19.2, 2.0, -1.2), tag("流し台", "#8a7a5a", 0.7, 1.6, 5.6)];

// ---------- 歩く（一人称視点） ----------
// ぶつかる物（机・戸棚・柱・テーブル・流し台）の四角を集めておく。いすはよけずに通れる
const solids = [];
const box2 = (x, z, w, d) => solids.push([x - w / 2, x + w / 2, z - d / 2, z + d / 2]);
for (const d of desks) { const along = Math.abs(Math.sin(d.rot)) < 0.5; box2(d.x, d.z, along ? DW : DD, along ? DD : DW); }
for (const c of [...cabs, ...lows, ...talls]) { const along = Math.abs(Math.sin(c.rot)) < 0.5; box2(c.x, c.z, along ? 0.9 : 0.45, along ? 0.45 : 0.9); }
for (const x of [0, 4.8, 9.6, 14.4, 19.2, 24]) box2(x, 7.25, 0.76, 0.66);
for (const x of [0, 4.8, 14.4, 24]) box2(x, 0.15, 0.76, 0.66);
box2(19.2, 0.1, 0.76, 0.76); for (const x of [14.4, 19.2, 24]) box2(x, -2.35, 0.76, 0.5);
box2(18.55, 5.3, 3.9, 0.6); box2(0.65, 5.4, 0.62, 2.4); box2(0.42, 3.2, 0.4, 0.9); box2(12.35, 0.45, 0.62, 0.6);
const RAD = 0.22;
const inRoom = (x, z) => (x > 0.12 + RAD && x < 23.88 - RAD && z > 0.08 + RAD && z < 7.25 - RAD) || (x > 14.5 + RAD && x < 23.88 - RAD && z > -2.42 + RAD && z < 0.5);
const free = (x, z) => inRoom(x, z) && !solids.some(([a, b, c, d]) => x > a - RAD && x < b + RAD && z > c - RAD && z < d + RAD);
const walk = { on: false, x: 0.9, z: 3.9, yaw: -Math.PI / 2, pitch: -0.05, keys: new Set(), pad: { f: 0, t: 0 }, saved: null };
const EYE = 1.55;
function setWalk(on) {
  if (on === walk.on) return;
  walk.on = on;
  document.body.classList.toggle("walking", on);
  document.getElementById("walk-btn").classList.toggle("active", on);
  controls.enabled = !on;
  if (on) {
    anim = null;
    walk.saved = [camera.position.clone(), controls.target.clone()];
    // いま見ている場所の近くの、歩けるところから
    let best = [0.9, 3.9], bd = Infinity;
    for (let x = 0.5; x < 23.6; x += 0.25) for (let z = -2.2; z < 7.1; z += 0.25) if (free(x, z)) { const d = (x - camera.position.x) ** 2 + (z - camera.position.z) ** 2; if (d < bd) { bd = d; best = [x, z]; } }
    [walk.x, walk.z] = best;
    const d = controls.target.clone().sub(camera.position); walk.yaw = Math.atan2(-d.x, -d.z); walk.pitch = -0.05;
  } else {
    walk.keys.clear(); walk.pad.f = walk.pad.t = 0;
    if (walk.saved) { camera.position.copy(walk.saved[0]); controls.target.copy(walk.saved[1]); }
  }
}
function updateWalk(dt) {
  const k = walk.keys;
  const fwd = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0) + walk.pad.f;
  const side = (k.has("d") ? 1 : 0) - (k.has("a") ? 1 : 0);
  walk.yaw += ((k.has("arrowleft") || k.has("q") ? 1 : 0) - (k.has("arrowright") || k.has("e") ? 1 : 0) + walk.pad.t) * dt * 1.8;
  if (fwd || side) {
    const sp = 1.4 * dt, fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw);
    const mx = (fx * fwd - fz * side) * sp, mz = (fz * fwd + fx * side) * sp;
    if (free(walk.x + mx, walk.z + mz)) { walk.x += mx; walk.z += mz; }
    else if (free(walk.x + mx, walk.z)) walk.x += mx;
    else if (free(walk.x, walk.z + mz)) walk.z += mz;
  }
  // 歩いているときは、ほんの少し上下にゆれる
  const bob = fwd ? Math.sin(performance.now() / 160) * 0.015 : 0;
  camera.position.set(walk.x, EYE + bob, walk.z);
  const look = new THREE.Vector3(-Math.sin(walk.yaw) * Math.cos(walk.pitch), Math.sin(walk.pitch), -Math.cos(walk.yaw) * Math.cos(walk.pitch));
  controls.target.copy(camera.position).add(look);
  camera.lookAt(controls.target);
}
addEventListener("keydown", (e) => {
  if (!walk.on) return;
  const k = e.key.toLowerCase();
  if (k === "escape") { setWalk(false); return; }
  if (["w", "a", "s", "d", "q", "e", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) { walk.keys.add(k); e.preventDefault(); }
});
addEventListener("keyup", (e) => walk.keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => walk.keys.clear());
{
  let last = null;
  labels.domElement.addEventListener("pointerdown", (e) => { if (walk.on) last = [e.clientX, e.clientY]; });
  addEventListener("pointermove", (e) => {
    if (!walk.on || !last || !e.buttons) return;
    walk.yaw += (e.clientX - last[0]) * 0.005;
    walk.pitch = Math.max(-1.1, Math.min(0.9, walk.pitch + (e.clientY - last[1]) * 0.004));
    last = [e.clientX, e.clientY];
  });
  addEventListener("pointerup", () => { last = null; });
  const pad = document.getElementById("pad");
  pad.addEventListener("pointerdown", (e) => { const b = e.target.closest("button"); if (!b) return; e.preventDefault(); if (b.dataset.end) { setWalk(false); return; } if (b.dataset.f) walk.pad.f = Number(b.dataset.f); if (b.dataset.t) walk.pad.t = Number(b.dataset.t); b.setPointerCapture(e.pointerId); });
  const stop = (e) => { const b = e.target.closest?.("button"); if (b?.dataset.f) walk.pad.f = 0; if (b?.dataset.t) walk.pad.t = 0; };
  pad.addEventListener("pointerup", stop); pad.addEventListener("pointercancel", stop);
  pad.addEventListener("contextmenu", (e) => e.preventDefault());
  document.getElementById("walk-btn").addEventListener("click", () => setWalk(!walk.on));
}

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
  document.querySelectorAll(".views .btn[data-v]").forEach((b) => b.classList.toggle("active", b.dataset.v === name));
}
document.querySelectorAll(".views .btn[data-v]").forEach((b) => b.addEventListener("click", () => { setWalk(false); go(b.dataset.v); }));
camera.position.set(...VIEWS.walk[0]); controls.target.set(...VIEWS.walk[1]);
document.querySelector('.views .btn[data-v="walk"]').classList.add("active");

// 止まっているときだけ、すみや物のあいだのかげ（アンビエントオクルージョン）と、光のにじみを足して、写真のような絵にする
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: 16 });
gtao.blendIntensity = 0.95;
composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.12, 0.4, 0.97);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let dirty = 2;
function resize() { const w = innerWidth, h = innerHeight; renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr); renderer.setSize(w, h); labels.setSize(w, h); composer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = 2; }
addEventListener("resize", resize); resize();

renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; // 物は動かないので、影は1回だけ計算
// 動いているあいだは軽い描き方でなめらかに、止まったら1回だけきれいに描く
let lastMove = 0, fine = false;
const camKey = new Float64Array(16);
let lastT = 0;
// 動いているあいだのコマの間かくを見て、カクつくようなら画面のきめを少し下げる（なめらかさを優先）。余裕があれば少しずつ戻す
let ema = 16, slow = 0, quick = 0, prevMoving = false, lastAdapt = 0;
function adapt(now, interval) {
  ema += (interval - ema) * 0.1;
  slow = ema > 24 ? slow + 1 : 0; quick = ema < 17.5 ? quick + 1 : 0;
  if (now - lastAdapt < 1500) return;
  let next = dpr;
  if (slow > 20 && dpr > minDpr) next = Math.max(minDpr, dpr * 0.82);
  else if (quick > 240 && dpr < maxDpr) next = Math.min(maxDpr, dpr + 0.15);
  if (next !== dpr) { dpr = next; lastAdapt = now; slow = quick = 0; resize(); }
}
function tick(now) {
  const interval = lastT ? now - lastT : 16;
  if (walk.on) updateWalk(Math.min(0.1, interval / 1000));
  lastT = now;
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / anim.ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    camera.position.lerpVectors(anim.p0, anim.p1, e); controls.target.lerpVectors(anim.t0v, anim.t1, e);
    if (k >= 1) anim = null;
  }
  if (!walk.on) controls.update();
  // 天井より上から見るときは、天井を消して中が見えるように。札も、上から見るときだけ出す
  const above = camera.position.y > CEIL - 0.05;
  ceiling.visible = outside.visible = !above;
  for (const t of tags) t.visible = above || camera.position.distanceTo(t.position) < 9;
  camera.updateMatrixWorld();
  let moved = false; const e = camera.matrixWorld.elements; for (let i = 0; i < 16; i++) if (camKey[i] !== e[i]) { camKey[i] = e[i]; moved = true; }
  const moving = moved || anim;
  if (moving && prevMoving) adapt(now, interval);
  prevMoving = moving;
  if (moving) { lastMove = now; fine = false; if (mirror) mirror.visible = false; floorMat.opacity = 1; renderer.render(scene, camera); labels.render(scene, camera); }
  else if (!fine && now - lastMove > (walk.on ? 450 : 250)) { fine = true; if (mirror) mirror.visible = !above; floorMat.opacity = above ? 1 : 0.8; composer.render(); labels.render(scene, camera); }
  else if (dirty) { dirty--; fine = false; lastMove = now; }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
document.getElementById("loading").remove();
