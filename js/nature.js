// 木・生け垣と、たくさんの部品を1つにまとめて軽くする仕組み
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ---------- 軽くする：グループの中の動かない部品を、材質ごとに1つの形にまとめる ----------
// （描画の回数が減るので、画面が軽くなる）。InstancedMesh はそのまま残す
export function bakeStatic(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  const keep = [];
  group.traverse((o) => {
    if (o === group || !o.isMesh) return;
    const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    if (o.isInstancedMesh) { keep.push([o, rel]); return; }
    const m = o.material;
    if (Array.isArray(m)) { keep.push([o, rel]); return; }
    const key = [m.type, m.color?.getHex(), m.map?.uuid, m.transparent, m.opacity, m.side, m.metalness, m.roughness, m.emissive?.getHex(), m.depthWrite, m.alphaTest].join("|");
    if (!buckets.has(key)) buckets.set(key, { mat: m, geos: [], cast: false });
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((g.attributes.position.count) * 2), 2));
    g.applyMatrix4(rel);
    const b = buckets.get(key);
    b.geos.push(g);
    b.cast = b.cast || o.castShadow;
  });
  // 中身を入れかえる
  while (group.children.length) group.remove(group.children[0]);
  for (const { mat, geos, cast } of buckets.values()) {
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const [o, rel] of keep) {
    o.matrixAutoUpdate = false;
    o.matrix.copy(rel);
    group.add(o);
  }
  return group;
}

// ---------- 葉っぱの模様（生け垣・木に使う） ----------
function leafTexture(base) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d");
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) {
    const l = 18 + Math.random() * 30;
    g.fillStyle = `hsla(${88 + Math.random() * 30},${30 + Math.random() * 25}%,${l}%,0.8)`;
    g.beginPath();
    g.ellipse(Math.random() * 128, Math.random() * 128, 1.5 + Math.random() * 2.5, 1 + Math.random() * 1.5, Math.random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const texHedge = leafTexture("#3f6a2f");
texHedge.repeat.set(1.5, 0.8);
export const matHedge = new THREE.MeshStandardMaterial({ map: texHedge, color: 0xffffff, roughness: 1 });

// でこぼこした丸い形（葉のかたまり）。seed で形を少しずつ変える
function lumpy(radius, detail, seed, amount = 0.22) {
  const g = new THREE.IcosahedronGeometry(radius, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 3.1 + seed) * Math.cos(y * 2.7 + seed * 1.7) * Math.sin(z * 3.3 + seed * 0.7);
    const k = 1 + n * amount;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- 生け垣（角の丸い箱に、葉の模様と、上のもこもこ） ----------
export function hedgeBox(w, h, d) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.8, d), matHedge);
  body.position.y = h * 0.4;
  g.add(body);
  // 上と横のもこもこ（小さな葉のかたまり）
  const n = Math.max(2, Math.round(w / 0.7)), m = Math.max(1, Math.round(d / 0.7));
  const geos = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const lg = lumpy(0.42, 1, i * 3.1 + j * 7.7, 0.3);
    lg.scale(1, 0.7, 1);
    lg.translate(-w / 2 + (w * (i + 0.5)) / n, h * 0.8, -d / 2 + (d * (j + 0.5)) / m);
    geos.push(lg);
  }
  const top = new THREE.Mesh(mergeGeometries(geos), matHedge);
  g.add(top);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------- 木（葉のかたまりをいくつか重ねた形。InstancedMesh で軽く） ----------
const crownGeos = [0, 1, 2].map((v) => {
  const parts = [];
  const blobs = [[0, 0, 0, 1.25], [0.9, 0.35, 0.3, 0.9], [-0.8, 0.25, -0.4, 0.95], [0.1, 0.95, -0.2, 0.85], [-0.3, -0.35, 0.8, 0.8]];
  blobs.forEach(([x, y, z, r], i) => {
    const g = lumpy(1.5 * r, 1, v * 10 + i * 2.3, 0.25);
    g.translate(x * 1.3, y * 1.2, z * 1.3);
    parts.push(g);
  });
  return mergeGeometries(parts);
});
const texLeaves = leafTexture("#4a7a36");
texLeaves.repeat.set(2, 2);
const matLeaves = new THREE.MeshStandardMaterial({ map: texLeaves, color: 0xffffff, roughness: 1 });
const matBark = new THREE.MeshStandardMaterial({ color: 0x5e4630, roughness: 1 });
const trunkGeo = (() => {
  const t = new THREE.CylinderGeometry(0.16, 0.26, 3, 6);
  t.translate(0, 1.5, 0);
  const b1 = new THREE.CylinderGeometry(0.06, 0.1, 1.4, 5);
  b1.rotateZ(0.7); b1.translate(0.45, 2.6, 0);
  const b2 = new THREE.CylinderGeometry(0.06, 0.1, 1.2, 5);
  b2.rotateZ(-0.8); b2.translate(-0.4, 2.5, 0.1);
  return mergeGeometries([t, b1, b2]);
})();

// spots: [x, y, z, 大きさ]。広葉樹
export function buildTrees(spots) {
  const g = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  const trunks = new THREE.InstancedMesh(trunkGeo, matBark, spots.length);
  const byVar = [[], [], []];
  spots.forEach((s, i) => byVar[i % 3].push(s));
  spots.forEach(([x, y, z, s], i) => {
    q.setFromEuler(e.set(0, i * 1.7, 0));
    m4.compose(new THREE.Vector3(x, y - 0.2, z), q, new THREE.Vector3(s, s, s));
    trunks.setMatrixAt(i, m4);
  });
  trunks.castShadow = true;
  g.add(trunks);
  byVar.forEach((list, v) => {
    if (!list.length) return;
    const crowns = new THREE.InstancedMesh(crownGeos[v], matLeaves, list.length);
    list.forEach(([x, y, z, s], i) => {
      q.setFromEuler(e.set(0, i * 2.3 + v, 0));
      m4.compose(new THREE.Vector3(x, y + 3.4 * s, z), q, new THREE.Vector3(s, s * (0.85 + (i % 4) * 0.08), s));
      crowns.setMatrixAt(i, m4);
      crowns.setColorAt(i, col.setHSL(0.26 + ((i * 37) % 10) * 0.006, 0.35 + ((i * 13) % 7) * 0.03, 0.62 + ((i * 7) % 5) * 0.05));
    });
    crowns.castShadow = true;
    crowns.receiveShadow = true;
    g.add(crowns);
  });
  return g;
}

// 細長い木（並木）。葉のかたまりを縦に重ねる
const columnGeo = (() => {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    const g = lumpy(1.5 - i * 0.22, 1, i * 4.1, 0.22);
    g.scale(1, 1.4, 1);
    g.translate(0, 2.6 + i * 1.9, 0);
    parts.push(g);
  }
  return mergeGeometries(parts);
})();
export function buildColumnTrees(spots) {
  const g = new THREE.Group();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  const tr = new THREE.InstancedMesh(trunkGeo, matBark, spots.length);
  const cr = new THREE.InstancedMesh(columnGeo, matLeaves, spots.length);
  spots.forEach(([x, y, z, s], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.3);
    m4.compose(new THREE.Vector3(x, y - 0.2, z), q, new THREE.Vector3(0.8, 0.8, 0.8)); tr.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, y - 0.2, z), q, new THREE.Vector3(s, s, s)); cr.setMatrixAt(i, m4);
    cr.setColorAt(i, col.setHSL(0.27, 0.38, 0.55 + (i % 4) * 0.04));
  });
  tr.castShadow = cr.castShadow = true;
  g.add(tr, cr);
  return g;
}
