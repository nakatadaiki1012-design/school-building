// 校舎のまわり（グラウンド・テニスコート・駐輪場）と、航空写真の重ね表示
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hedgeBox, hedgeMass, buildTrees } from "./nature.js";

function canvasTex(w, h, draw) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });

// ---------- 斜面 ----------
// 学校は斜面に建っている。敷地の中は平ら（高さ 0）で、まわりの土地は北が高く南が低い。
// 北側は道路のほうが高いので敷地の内側に擁壁、南側は敷地のほうが高いので外側に擁壁がある
let SLOPE = { zZero: -35, perMeter: 0.045 };
export function setSlope(s) { if (s) SLOPE = s; }
// 北が高く（-z）、西と南が低い。perMeterX は東へ行くほど高くなる割合
export function terrainH(x, z) {
  // 写真から読み取った「まわりの道路の高さ（敷地との差）」の点から、なめらかにつなぐ（距離の2乗で重みづけ）
  if (SLOPE.points) {
    let sw = 0, sh = 0;
    for (const [px, pz, h] of SLOPE.points) {
      const d2 = (x - px) ** 2 + (z - pz) ** 2;
      if (d2 < 0.01) return h;
      const w = 1 / (d2 * d2 ** 0.25); // 距離の2.5乗
      sw += w; sh += w * h;
    }
    return sh / sw;
  }
  return -(z - SLOPE.zZero) * SLOPE.perMeter + (x - (SLOPE.xZero ?? 0)) * (SLOPE.perMeterX ?? 0) + (SLOPE.base ?? 0);
}

// フェンス（緑色の網＋支柱＋上の手すり）
const netMat = new THREE.MeshStandardMaterial({ color: 0x3f7a5c, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9 });
const postMat = new THREE.MeshStandardMaterial({ color: 0x46604f, roughness: 0.6, metalness: 0.3 });

// 1本の直線のフェンス
function fenceLine(group, ax, az, bx, bz, h) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.01) return;
  const ang = -Math.atan2(bz - az, bx - ax);
  const net = new THREE.Mesh(new THREE.PlaneGeometry(len, h), netMat);
  net.position.set((ax + bx) / 2, h / 2 - 0.15, (az + bz) / 2);
  net.rotation.y = ang;
  group.add(net);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), postMat);
  rail.position.set((ax + bx) / 2, h - 0.15, (az + bz) / 2);
  rail.rotation.y = ang;
  group.add(rail);
  const step = h >= 6 ? 6 : 3;
  const r = h >= 6 ? 0.12 : 0.05;
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 6), postMat);
    p.position.set(ax + (bx - ax) * (i / n), h / 2 - 0.15, az + (bz - az) * (i / n));
    p.castShadow = true;
    group.add(p);
  }
}
// 長方形の囲い
function fenceRect(group, x0, z0, x1, z1, h) {
  fenceLine(group, x0, z0, x1, z0, h); fenceLine(group, x1, z0, x1, z1, h);
  fenceLine(group, x1, z1, x0, z1, h); fenceLine(group, x0, z1, x0, z0, h);
}

// ---------- グラウンド（航空写真の形どおり。野球とサッカー） ----------
export function polyBounds(poly) {
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
}
export function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// 多角形の平らな面（地面の上に置く）。tex はワールド座標の範囲 bb に合わせて描いた画像
export function flatPoly(poly, mat, y, bb) {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.x0) / (bb.x1 - bb.x0), 1 - (pos.getZ(i) - bb.z0) / (bb.z1 - bb.z0));
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

function buildGround(cfg) {
  const g = new THREE.Group();
  const bb = polyBounds(cfg.poly);
  const S = 6; // 1m = 6px
  const P = (x, z) => [(x - bb.x0) * S, (z - bb.z0) * S];
  const tex = canvasTex(Math.ceil((bb.x1 - bb.x0) * S), Math.ceil((bb.z1 - bb.z0) * S), (c, W, H) => {
    c.fillStyle = "#c2b7a1"; c.fillRect(0, 0, W, H); // 航空写真では白っぽいベージュの砂の土
    for (let i = 0; i < 30000; i++) {
      c.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "60,50,40"},${Math.random() * 0.07})`;
      c.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    // 雨のあとのような濃い部分
    for (let i = 0; i < 6; i++) {
      c.globalAlpha = 0.05;
      c.fillStyle = "#3b3a36";
      c.beginPath(); c.ellipse(Math.random() * W, Math.random() * H, 60 + Math.random() * 120, 20 + Math.random() * 40, Math.random() * 3, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }
    // 野球の内野（茶色い土）
    const b = cfg.baseball;
    const [bx, bz] = P(b.x, b.z);
    // 写真では内野の土が大きくぼんやり茶色い（ふちをぼかす）
    const gr = c.createRadialGradient(bx, bz, b.r * S * 0.3, bx, bz, b.r * S * 1.25);
    gr.addColorStop(0, "rgba(150,112,78,0.85)"); gr.addColorStop(0.7, "rgba(158,122,88,0.6)"); gr.addColorStop(1, "rgba(158,122,88,0)");
    c.fillStyle = gr;
    c.beginPath(); c.arc(bx, bz, b.r * S * 1.25, 0, Math.PI * 2); c.fill();
    // ダイヤモンドとファウルライン
    const [hx, hz] = P(b.home[0], b.home[1]);
    const dx = bx - hx, dz = bz - hz, L = Math.hypot(dx, dz);
    const ux = dx / L, uz = dz / L;
    const rot = (a) => [ux * Math.cos(a) - uz * Math.sin(a), ux * Math.sin(a) + uz * Math.cos(a)];
    const side = 27.4 * S;
    const [ax, az] = rot(-Math.PI / 4), [cx2, cz2] = rot(Math.PI / 4);
    c.strokeStyle = "rgba(255,255,255,0.45)"; c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(hx, hz); c.lineTo(hx + ax * side, hz + az * side);
    c.lineTo(hx + ux * side * Math.SQRT2, hz + uz * side * Math.SQRT2);
    c.lineTo(hx + cx2 * side, hz + cz2 * side); c.closePath(); c.stroke();
    c.beginPath();
    c.moveTo(hx, hz); c.lineTo(hx + ax * 80 * S, hz + az * 80 * S);
    c.moveTo(hx, hz); c.lineTo(hx + cx2 * 80 * S, hz + cz2 * 80 * S); c.stroke();
    c.fillStyle = "#fff";
    c.fillRect(hx + ux * side * 0.7 - 3, hz + uz * side * 0.7 - 3, 6, 6);
    // サッカーコート
    const sc = cfg.soccer;
    const [sx, sz] = P(sc.x, sc.z);
    c.save();
    c.translate(sx, sz); c.rotate((-(sc.rot || 0) * Math.PI) / 180);
    c.strokeStyle = "rgba(255,255,255,0.55)"; c.lineWidth = 1.5;
    const w = sc.w * S, d = sc.d * S;
    c.strokeRect(-w / 2, -d / 2, w, d);
    c.beginPath(); c.moveTo(0, -d / 2); c.lineTo(0, d / 2); c.stroke();
    c.beginPath(); c.arc(0, 0, 9 * S, 0, Math.PI * 2); c.stroke();
    for (const s of [-1, 1]) {
      const pd = (sc.penalty || 16.5) * S, pw = (sc.penaltyW || 40) * S;
      c.strokeRect(s > 0 ? w / 2 - pd : -w / 2, -pw / 2, pd, pw);
      c.strokeRect(s > 0 ? w / 2 - 4.5 * S : -w / 2, -7 * S, 4.5 * S, 14 * S);
    }
    c.restore();
  });
  g.add(flatPoly(cfg.poly, new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }), -0.17, bb));

  // サッカーゴール
  const white = M(0xffffff);
  const sc = cfg.soccer;
  const a = THREE.MathUtils.degToRad(sc.rot || 0);
  for (const s of [-1, 1]) {
    const goal = new THREE.Group();
    const bar = (bw, bh, bd, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), white); m.position.set(x, y, z); m.castShadow = true; goal.add(m); };
    bar(0.12, 2.4, 0.12, 0, 1.2, -3.66); bar(0.12, 2.4, 0.12, 0, 1.2, 3.66); bar(0.12, 0.12, 7.4, 0, 2.4, 0);
    bar(1.8, 0.08, 0.08, s * 0.9, 0.04, -3.66); bar(1.8, 0.08, 0.08, s * 0.9, 0.04, 3.66);
    // ゴールのネット（うしろと横と上）
    const net = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(7.3, 2.6), net);
    back.rotation.order = "YXZ"; back.rotation.set(s * 0.6, Math.PI / 2, 0); back.position.set(s * 1.0, 1.15, 0); goal.add(back);
    for (const zz of [-3.66, 3.66]) { const sd = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.4), net); sd.position.set(s * 0.9, 1.2, zz); goal.add(sd); }
    goal.position.set(sc.x + Math.cos(a) * s * sc.w / 2, 0, sc.z - Math.sin(a) * s * sc.w / 2);
    goal.rotation.y = a;
    g.add(goal);
  }
  // バックネット（ホームベースのうしろ）
  const b = cfg.baseball;
  const ang = Math.atan2(b.z - b.home[1], b.x - b.home[0]);
  // ホームベースのうしろを囲む、ハの字のバックネット
  {
    const bxp = b.home[0] - Math.cos(ang) * 5, bzp = b.home[1] - Math.sin(ang) * 5;
    const px = -Math.sin(ang), pz = Math.cos(ang);
    const ends = [-1, 1].map((s) => [bxp + px * s * 7 + Math.cos(ang) * 4, bzp + pz * s * 7 + Math.sin(ang) * 4]);
    fenceLine(g, ends[0][0], ends[0][1], bxp - px * 2, bzp - pz * 2, 9);
    fenceLine(g, bxp - px * 2, bzp - pz * 2, bxp + px * 2, bzp + pz * 2, 9);
    fenceLine(g, bxp + px * 2, bzp + pz * 2, ends[1][0], ends[1][1], 9);
  }
  // まわりのフェンス（辺ごとに高さが違う。西側と北西の角は高い防球ネット）
  for (let i = 0; i < cfg.poly.length; i++) {
    const [x0, z0] = cfg.poly[i], [x1, z1] = cfg.poly[(i + 1) % cfg.poly.length];
    const fh = cfg.fence ? cfg.fence[i] ?? 3 : 3;
    if (fh > 0) fenceLine(g, x0, z0, x1, z1, fh);
  }
  // 白いテント、物置、ベンチ（写真に写っている小物。位置はおおよそ）
  for (const t of cfg.tents || []) g.add(tent(t));
  for (const [x, z, rot] of cfg.benches || []) {
    const bn = new THREE.Mesh(new THREE.BoxGeometry(3, 0.45, 0.4), M(0x5a6b7a));
    bn.position.set(x, 0.05, z); bn.rotation.y = THREE.MathUtils.degToRad(rot || 0);
    bn.castShadow = true;
    g.add(bn);
  }
  // 端によせたサッカーゴール（予備）
  const white2 = M(0xffffff);
  for (const [x, z, rot] of cfg.spareGoals || []) {
    const goal = new THREE.Group();
    const bar = (bw, bh, bd, px, py, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), white2); m.position.set(px, py, pz); m.castShadow = true; goal.add(m); };
    bar(0.12, 2.4, 0.12, 0, 1.2, -3.66); bar(0.12, 2.4, 0.12, 0, 1.2, 3.66); bar(0.12, 0.12, 7.4, 0, 2.4, 0);
    goal.position.set(x, 0, z); goal.rotation.y = THREE.MathUtils.degToRad(rot || 0);
    g.add(goal);
  }
  return g;
}

// 白いテント（運動会などで使う、屋根だけのテント）
function tent({ x, z, rot = 0, w = 5.4, d = 3.6 }) {
  const t = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), M(0xf6f6f2));
  roof.position.y = 2.4;
  roof.castShadow = true;
  t.add(roof);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), M(0xb0b4b8, { metalness: 0.5 }));
    p.position.set(sx * (w / 2 - 0.1), 1.1, sz * (d / 2 - 0.1));
    t.add(p);
  }
  t.position.set(x, -0.15, z);
  t.rotation.y = THREE.MathUtils.degToRad(rot);
  return t;
}

// ---------- テニスコート（砂のコート。1区画に2面） ----------
let tennisCount = 0;
function buildTennisArea({ w, d }) {
  const g = new THREE.Group();
  const S = 10;
  const tex = canvasTex(Math.round(w * S), Math.round(d * S), (c, W, H) => {
    c.fillStyle = "#d8c39a"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "120,90,50"},${Math.random() * 0.1})`; c.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
    c.strokeStyle = "rgba(255,255,255,0.95)"; c.lineWidth = 2;
    // 写真：ネットは区画を分けるフェンスと平行（東西むき）。コートの長い向きは南北で、2面が東西にならぶ
    for (let k = 0; k < 2; k++) {
      const cx = (W / 2) * (k + 0.5), cy = H / 2;
      const L = Math.min(23.77 * S, H - 8), Wd = 10.97 * S, si = 1.37 * S, sv = 6.4 * S * (L / (23.77 * S));
      c.strokeRect(cx - Wd / 2, cy - L / 2, Wd, L);
      c.beginPath();
      c.moveTo(cx - Wd / 2 + si, cy - L / 2); c.lineTo(cx - Wd / 2 + si, cy + L / 2);
      c.moveTo(cx + Wd / 2 - si, cy - L / 2); c.lineTo(cx + Wd / 2 - si, cy + L / 2);
      c.moveTo(cx - Wd / 2 + si, cy - sv); c.lineTo(cx + Wd / 2 - si, cy - sv);
      c.moveTo(cx - Wd / 2 + si, cy + sv); c.lineTo(cx + Wd / 2 - si, cy + sv);
      c.moveTo(cx, cy - sv); c.lineTo(cx, cy + sv);
      c.stroke();
    }
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  p.rotation.x = -Math.PI / 2;
  p.position.y = -0.16 + (tennisCount++) * 0.01; // となりのコートと高さを少しずらす（ちらつき防止）
  p.receiveShadow = true;
  g.add(p);
  // ネット：黒い網（すけて見える）、上に白い帯、両はしに支柱
  for (const k of [-1, 1]) {
    const x = (k * w) / 4;
    const net = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 0.9), tennisNetMat);
    net.position.set(x, 0.45 - 0.15, 0);
    g.add(net);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.07, 0.03), tennisTapeMat);
    tape.position.set(x, 0.9 - 0.15, 0);
    g.add(tape);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.07, 8), tennisPostMat);
      post.position.set(x + s * 6.4, 0.53 - 0.15, 0);
      post.castShadow = true;
      g.add(post);
    }
  }
  fenceRect(g, -w / 2, -d / 2, w / 2, d / 2, 4);
  return g;
}

// テニスのネットの材質（網目の模様）
const tennisNetMat = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const c = cv.getContext("2d");
  c.strokeStyle = "rgba(20,20,20,0.9)"; c.lineWidth = 1.5;
  for (let i = 0; i <= 64; i += 8) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 64); c.moveTo(0, i); c.lineTo(64, i); c.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(32, 2.3);
  return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 1, color: 0x222222 });
})();
const tennisTapeMat = M(0xf4f4f0);
const tennisPostMat = M(0x2f4a3a, { metalness: 0.4, roughness: 0.5 });

// ---------- プール ----------
function buildPool(cfg) {
  const g = new THREE.Group();
  const [x0, x1, z0, z1] = cfg.deck;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 1.0, z1 - z0), M(0xb7ccd4));
  deck.position.set((x0 + x1) / 2, 0.3, (z0 + z1) / 2);
  deck.receiveShadow = true; deck.castShadow = true;
  g.add(deck);
  const [wx0, wx1, wz0, wz1] = cfg.water;
  const lanes = 7;
  const tex = canvasTex(256, 512, (c, W, H) => {
    const gr = c.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, "#5fb2ea"); gr.addColorStop(1, "#4a9fdc");
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 1; i < lanes; i++) c.fillRect((W / lanes) * i - 1.5, 6, 3, H - 12);
    c.fillStyle = "rgba(20,60,120,0.6)";
    for (let i = 0; i < lanes; i++) c.fillRect((W / lanes) * (i + 0.5) - 2, 20, 4, H - 40);
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(wx1 - wx0, wz1 - wz0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.15, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set((wx0 + wx1) / 2, 0.82, (wz0 + wz1) / 2);
  g.add(water);
  // コースロープ（青と白の浮き）と、はしの飛び込み台
  const L = wz1 - wz0, W = wx1 - wx0;
  const ropeTex = canvasTex(8, 64, (c, w, h) => { for (let i = 0; i < 16; i++) { c.fillStyle = i % 4 === 0 ? "#f2f2f2" : i % 2 ? "#2a62c9" : "#d84a3a"; c.fillRect(0, i * 4, w, 4); } });
  ropeTex.wrapS = ropeTex.wrapT = THREE.RepeatWrapping; ropeTex.repeat.set(1, L / 4);
  const ropeMat = new THREE.MeshStandardMaterial({ map: ropeTex, roughness: 0.6 });
  const ropes = [];
  for (let i = 1; i < lanes; i++) { const r = new THREE.CylinderGeometry(0.06, 0.06, L - 0.4, 6); r.rotateX(Math.PI / 2); r.translate(wx0 + (W / lanes) * i, 0.86, (wz0 + wz1) / 2); ropes.push(r); }
  g.add(new THREE.Mesh(mergeGeometries(ropes), ropeMat));
  const blocks = [];
  for (let i = 0; i < lanes; i++) { const b = new THREE.BoxGeometry(0.5, 0.45, 0.55); b.translate(wx0 + (W / lanes) * (i + 0.5), 0.8 + 0.22, wz0 - 0.4); blocks.push(b); }
  const sb = new THREE.Mesh(mergeGeometries(blocks), M(0xf2f2ee)); sb.castShadow = true; g.add(sb);
  const fg = new THREE.Group();
  fenceLine(fg, x0, z0, x1, z0, 2.2); fenceLine(fg, x1, z0, x1, z1, 2.2); fenceLine(fg, x0, z1, x0, z0, 2.2);
  fg.position.y = 0.8;
  g.add(fg);
  // プールの建物（更衣室・機械室など）
  const [hx0, hx1, hz0, hz1] = cfg.house;
  const house = new THREE.Mesh(new THREE.BoxGeometry(hx1 - hx0, 3.4, hz1 - hz0), M(0xefede6));
  house.position.set((hx0 + hx1) / 2, 1.5, (hz0 + hz1) / 2);
  house.castShadow = true; house.receiveShadow = true;
  g.add(house);
  // 建物の高い位置の横長の窓と、扉（4面に）
  {
    const win = M(0x3d5468, { roughness: 0.3, metalness: 0.3 }), parts = [], doors = [];
    const cx = (hx0 + hx1) / 2, cz = (hz0 + hz1) / 2, hw = (hx1 - hx0) / 2, hd = (hz1 - hz0) / 2;
    for (const s of [-1, 1]) {
      for (let x = hx0 + 1.5; x < hx1 - 1.5; x += 3) { const b = new THREE.BoxGeometry(1.8, 0.5, 0.06); b.translate(x, 2.5, cz + s * (hd + 0.01)); parts.push(b); }
      for (let z = hz0 + 1.5; z < hz1 - 1.5; z += 3) { const b = new THREE.BoxGeometry(0.06, 0.5, 1.8); b.translate(cx + s * (hw + 0.01), 2.5, z); parts.push(b); }
    }
    const d1 = new THREE.BoxGeometry(1.0, 2.0, 0.06); d1.translate(cx, 0.8, hz1 + 0.01); doors.push(d1);
    const d2 = new THREE.BoxGeometry(1.0, 2.0, 0.06); d2.translate(cx, 0.8, hz0 - 0.01); doors.push(d2);
    g.add(new THREE.Mesh(mergeGeometries(parts), win), new THREE.Mesh(mergeGeometries(doors), M(0x8a9aa6, { metalness: 0.4 })));
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(hx1 - hx0 + 0.3, 0.25, hz1 - hz0 + 0.3), M(0x9fd1b0));
  roof.position.set((hx0 + hx1) / 2, 3.3, (hz0 + hz1) / 2);
  roof.castShadow = true;
  g.add(roof);
  return g;
}

// ---------- 駐輪場（赤い屋根の細長い建物） ----------
// 自転車（ママチャリ）を InstancedMesh でまとめて置く。spots: [x, y, z, 向き(ラジアン)]。前後のタイヤは向きの方向に ±0.5m
const BIKE_COLORS = [0x2b2b2b, 0x1f4e8a, 0xb7b7b7, 0x8a1f1f, 0xf2f2f2, 0x2f6b3a, 0xc9b98f];
const bikeFrameGeo = (() => {
  const t = (len, x, y, rz) => { const g = new THREE.CylinderGeometry(0.022, 0.022, len, 5); g.rotateZ(rz); g.translate(x, y, 0); return g; };
  return mergeGeometries([
    t(0.62, 0.05, 0.42, -1.05),  // 下パイプ（ハンドルの下からペダルへ）
    t(0.5, -0.17, 0.55, 0.35),   // サドルの下のパイプ
    t(0.55, -0.27, 0.33, 1.1),   // うしろのパイプ
    t(0.52, 0.45, 0.55, 0.25),   // 前のフォーク
    t(0.5, -0.3, 0.6, 1.25),     // 荷台への支え
  ]);
})();
const bikePartsGeo = (() => {
  const b = (w, h, d, x, y, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
  return mergeGeometries([
    b(0.24, 0.05, 0.12, -0.25, 0.82),          // サドル
    b(0.04, 0.04, 0.55, 0.38, 0.95),           // ハンドル
    b(0.3, 0.22, 0.34, 0.62, 0.86),            // 前かご
    b(0.32, 0.03, 0.14, -0.45, 0.72),          // うしろの荷台
    b(0.9, 0.02, 0.06, 0, 0.36, 0.04),         // チェーンのカバー
  ]);
})();
const bikeWheelGeo = new THREE.TorusGeometry(0.33, 0.03, 5, 14);
const bikeWheelMat = M(0x222222), bikeFrameMat = M(0xffffff, { metalness: 0.3, roughness: 0.5 }), bikePartsMat = M(0x55585c, { roughness: 0.6, metalness: 0.3 });
function bikeInstances(spots) {
  const g = new THREE.Group();
  const wheels = new THREE.InstancedMesh(bikeWheelGeo, bikeWheelMat, spots.length * 2);
  const frames = new THREE.InstancedMesh(bikeFrameGeo, bikeFrameMat, spots.length);
  const parts = new THREE.InstancedMesh(bikePartsGeo, bikePartsMat, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();
  spots.forEach(([x, y, z, a], i) => {
    q.setFromAxisAngle(up, a);
    const ux = Math.cos(a), uz = -Math.sin(a);
    for (const s of [-1, 1]) { m4.compose(new THREE.Vector3(x + ux * 0.5 * s, y + 0.33, z + uz * 0.5 * s), q, one); wheels.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), m4); }
    m4.compose(new THREE.Vector3(x, y, z), q, one);
    frames.setMatrixAt(i, m4); parts.setMatrixAt(i, m4);
    frames.setColorAt(i, col.setHex(BIKE_COLORS[(i * 7) % BIKE_COLORS.length]));
  });
  wheels.castShadow = frames.castShadow = parts.castShadow = true;
  g.add(wheels, frames, parts);
  return g;
}

// 2階建ての駐輪場（1階と2階に自転車。外階段つき）
function buildBikes2({ x0, x1, z0, z1, roof = 0x9ea3a6 }) {
  const g = new THREE.Group();
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const conc = M(0xd6d3cb), steel = M(0x8c949b, { metalness: 0.4 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), conc); slab.position.set(cx, 2.7, cz);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.2, d + 0.5), M(roof, { roughness: 0.6 })); top.position.set(cx, 5.4, cz);
  g.add(slab, top);
  for (let x = x0 + 0.2; x <= x1; x += Math.max(3, (w - 0.4) / Math.round(w / 4))) for (const z of [z0 + 0.2, z1 - 0.2]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.4, 0.3), steel); p.position.set(x, 2.7, z); g.add(p);
  }
  // 2階の手すり
  for (const z of [z0 + 0.1, z1 - 0.1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, 0.08), conc); r.position.set(cx, 3.35, z); g.add(r); }
  // 自転車（各階2列）。自転車は東西の向きにとめてある
  const n = Math.floor((d - 1) / 0.6);
  const spots = [];
  for (const y of [0.15, 3.0]) for (const xc of [cx - w / 4, cx + w / 4]) for (let i = 0; i < n; i++) spots.push([xc, y, z0 + 0.8 + i * 0.6, (i % 2) * Math.PI]);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.add(bikeInstances(spots));
  g.position.y = -0.2;
  return g;
}

function buildBikes({ len = 30, depth = 4.6, roof: roofColor = 0x9ea3a6, backWall = true }) {
  const g = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len, 0.15, depth + 0.6), M(roofColor, { roughness: 0.6 }));
  roof.position.set(0, 2.6, 0);
  roof.rotation.x = 0.05;
  roof.castShadow = true;
  g.add(roof);
  if (backWall) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 2.5, 0.1), M(0xd9d4c8));
    back.position.set(0, 1.25, -depth / 2);
    back.castShadow = true;
    g.add(back);
  } else {
    // うしろの壁がないので、うしろ側にも柱
    for (let x = -len / 2; x <= len / 2 + 0.01; x += 4) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), M(0x8c949b, { metalness: 0.4 })); p.position.set(x, 1.25, -depth / 2); g.add(p); }
  }
  const postMat = M(0x8c949b, { metalness: 0.4 });
  for (let x = -len / 2; x <= len / 2 + 0.01; x += 4) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), postMat);
    p.position.set(x, 1.3, depth / 2);
    p.castShadow = true;
    g.add(p);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, depth), M(0xa3a39c));
  floor.position.y = -0.14;
  floor.receiveShadow = true;
  g.add(floor);
  // 自転車（屋根の奥行きの向きにとめる）
  const n = Math.floor(len / 0.6), spots = [];
  for (let i = 0; i < n; i++) spots.push([-len / 2 + 0.3 + i * 0.6, 0, 0, Math.PI / 2 + (i % 3 === 0 ? Math.PI : 0)]);
  g.add(bikeInstances(spots));
  return g;
}

// 小さな建物（箱＋屋根）
function buildShed({ x0, x1, z0, z1, h = 3.2, color = 0xa8473d }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), M(0xe3ded3));
  body.position.set((x0 + x1) / 2, h / 2 - 0.2, (z0 + z1) / 2);
  body.castShadow = body.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.6, 0.3, z1 - z0 + 0.6), M(color, { roughness: 0.6 }));
  roof.position.set((x0 + x1) / 2, h - 0.05, (z0 + z1) / 2);
  roof.castShadow = true;
  g.add(body, roof);
  return g;
}

export function distSeg(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

// ---------- 駐車場（白線と車） ----------
// 車の形（長さ方向が x）。ミニバン（背の高い車）とふつうの車
const carGlass = M(0x1d2733, { roughness: 0.15, metalness: 0.5 });
const carTire = M(0x1a1a1a, { roughness: 0.9 });
const carLight = M(0xf4f1e4, { roughness: 0.3 });
const carBodyMats = {};
function carModel(color, tall) {
  const g = new THREE.Group();
  const mat = (carBodyMats[color] ||= M(color, { metalness: 0.45, roughness: 0.35 }));
  const L = tall ? 4.6 : 4.3, W = 1.72;
  const body = new THREE.Mesh(new THREE.BoxGeometry(L, 0.72, W), mat);
  body.position.y = 0.62;
  // 屋根（上が少しせまい台形）
  const cabL = tall ? 3.2 : 2.3, cabH = tall ? 0.85 : 0.6;
  const cg = new THREE.BoxGeometry(cabL, cabH, W - 0.12);
  const pos = cg.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) { pos.setX(i, pos.getX(i) * (tall ? 0.94 : 0.78)); pos.setZ(i, pos.getZ(i) * 0.92); }
  cg.computeVertexNormals();
  const cab = new THREE.Mesh(cg, mat);
  cab.position.set(tall ? -0.25 : -0.15, 0.98 + cabH / 2, 0);
  // 窓（屋根より少しだけ大きい黒いガラスの帯）
  const wg = new THREE.BoxGeometry(cabL * 0.96, cabH * 0.62, W - 0.08);
  const wp = wg.attributes.position;
  for (let i = 0; i < wp.count; i++) if (wp.getY(i) > 0) { wp.setX(i, wp.getX(i) * (tall ? 0.95 : 0.84)); wp.setZ(i, wp.getZ(i) * 0.94); }
  const win = new THREE.Mesh(wg, carGlass);
  win.position.set(cab.position.x, 0.98 + cabH * 0.45, 0);
  g.add(body, cab, win);
  // タイヤ
  const tg = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 12);
  tg.rotateX(Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const t = new THREE.Mesh(tg, carTire);
    t.position.set(sx * (L / 2 - 0.8), 0.32, sz * (W / 2 - 0.08));
    g.add(t);
  }
  // 前のライト
  for (const sz of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.32), carLight);
    l.position.set(L / 2, 0.78, sz * 0.58);
    g.add(l);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function buildParking({ x0, x1, z0, z1 }) {
  const g = new THREE.Group();
  const w = x1 - x0, d = z1 - z0;
  const along = w >= d; // 長い方向にならべる
  const tex = canvasTex(Math.round(w * 10), Math.round(d * 10), (c, W, H) => {
    c.fillStyle = "#6c6e70"; c.fillRect(0, 0, W, H);
    c.fillStyle = "rgba(255,255,255,0.9)";
    if (along) for (let x = 0; x <= W; x += 25) c.fillRect(x, 0, 2, H * 0.9);
    else for (let y = 0; y <= H; y += 25) c.fillRect(0, y, W * 0.9, 2);
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  p.rotation.x = -Math.PI / 2;
  p.position.set((x0 + x1) / 2, -0.185, (z0 + z1) / 2);
  g.add(p);
  // 車（何台か）：車体・窓のついた屋根・タイヤ・ライト
  const colors = [0xf2f2f2, 0x222222, 0x8a8f96, 0x2b4d80, 0xb33a3a, 0xd9d4c8];
  const n = Math.floor((along ? w : d) / 2.5);
  let seed = Math.round(x0 * 7 + z0 * 13);
  const rnd = () => ((seed = (seed * 16807 + 11) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.35) continue;
    const car = carModel(colors[Math.floor(rnd() * colors.length)], rnd() < 0.5);
    const cx = along ? x0 + 1.25 + i * 2.5 : (x0 + x1) / 2, cz = along ? (z0 + z1) / 2 : z0 + 1.25 + i * 2.5;
    car.position.set(cx, -0.18, cz);
    car.rotation.y = along ? Math.PI / 2 : 0;
    g.add(car);
  }
  return g;
}

// ---------- 道路 ----------
// アスファルト：細かい粒と、ところどころの補修あと・ひび
const matAsphalt = (() => {
  const t = canvasTex(256, 256, (c, W, H) => {
    c.fillStyle = "#5f6264"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { const v = Math.random(); c.fillStyle = v < 0.5 ? `rgba(30,30,32,${Math.random() * 0.25})` : `rgba(200,200,195,${Math.random() * 0.18})`; c.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5); }
    for (let i = 0; i < 3; i++) { c.fillStyle = "rgba(40,42,45,0.09)"; c.fillRect(Math.random() * W, Math.random() * H, 30 + Math.random() * 50, 20 + Math.random() * 40); }
    c.strokeStyle = "rgba(35,35,35,0.35)"; c.lineWidth = 1;
    for (let i = 0; i < 4; i++) { let x = Math.random() * W, y = Math.random() * H; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += Math.random() * 16 - 8; y += Math.random() * 16 - 4; c.lineTo(x, y); } c.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 1, side: THREE.DoubleSide });
})();
function buildRoad({ w, pts: raw, dy = 0 }) {
  // 斜面にそうように、4mおきに点を足す
  const pts = [];
  for (let i = 0; i + 1 < raw.length; i++) {
    const [ax, az] = raw[i], [bx, bz] = raw[i + 1];
    const k = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
    for (let j = 0; j < k; j++) pts.push([ax + ((bx - ax) * j) / k, az + ((bz - az) * j) / k]);
  }
  pts.push(raw[raw.length - 1]);
  const pos = [], idx = [], uv = [];
  let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
    const dx = nx - px, dz = nz - pz, L = Math.hypot(dx, dz);
    const ox = (-dz / L) * w / 2, oz = (dx / L) * w / 2;
    if (i > 0) run += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    pos.push(x + ox, terrainH(x + ox, z + oz), z + oz, x - ox, terrainH(x - ox, z - oz), z - oz);
    uv.push(0, run / 6, w / 6, run / 6); // アスファルトの模様は 6m 四方
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, matAsphalt);
  m.receiveShadow = true;
  m.position.y = -0.22 + dy;
  g.add(m);
  // センターライン（白い破線）と、ふちの白線
  const dash = new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.9 });
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, ang = Math.atan2(ux, uz);
    // 坂に合わせて線を傾ける
    const pitch = -Math.atan2(terrainH(bx, bz) - terrainH(ax, az), L);
    const put = (m, x, z) => { m.rotation.order = "YXZ"; m.rotation.set(pitch, ang, 0); m.position.set(x, terrainH(x, z) - 0.2 + dy, z); g.add(m); };
    for (let t = 2; t < L - 2; t += 8) put(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 4), dash), ax + ux * (t + 2), az + uz * (t + 2));
    for (const s of [-1, 1]) put(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, L), dash), (ax + bx) / 2 - uz * s * (w / 2 - 0.4), (az + bz) / 2 + ux * s * (w / 2 - 0.4));
  }
  return g;
}

// 道路ぞいの帯（歩道など）。道路の中心線から o0〜o1 m 横（+ は進む向きの右）を、坂にそってはる
function roadStrip(raw, o0, o1, mat, dy) {
  const pts = [];
  for (let i = 0; i + 1 < raw.length; i++) {
    const [ax, az] = raw[i], [bx, bz] = raw[i + 1];
    const k = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 3));
    for (let j = 0; j < k; j++) pts.push([ax + ((bx - ax) * j) / k, az + ((bz - az) * j) / k]);
  }
  pts.push(raw[raw.length - 1]);
  const pos = [], idx = [];
  pts.forEach(([x, z], i) => {
    const [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
    const L = Math.hypot(nx - px, nz - pz), rx = -(nz - pz) / L, rz = (nx - px) / L;
    for (const o of [o0, o1]) pos.push(x + rx * o, terrainH(x + rx * o, z + rz * o) + dy, z + rz * o);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  return m;
}

// 道路ぞいの歩道・植え込み・若い並木（ストリートビューの写真より）
// 両側に、縁石の内側に低い植え込みの帯と、細い木が並び、その外が歩道
function buildStreetscape({ pts, w, gaps = [], treeStep = 9 }) {
  const g = new THREE.Group();
  const walk = M(0x8a8a86, { roughness: 1, side: THREE.DoubleSide });
  const curb = M(0xb4b2ab, { roughness: 1, side: THREE.DoubleSide });
  const hw = w / 2;
  for (const s of [-1, 1]) {
    const a = s * (hw - 0.05), b = s * (hw + 2.4);
    g.add(roadStrip(pts, Math.min(a, b), Math.max(a, b), walk, -0.17));
  }
  const inGap = (x, z) => gaps.some(([gx, gz, r]) => Math.hypot(x - gx, z - gz) < r);
  const trees = [];
  let along = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, rx = -uz, rz = ux;
    const n = Math.max(1, Math.round(L / 3));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) * L / n;
      for (const s of [-1, 1]) {
        const o = s * (hw - 0.55);
        const x = ax + ux * t + rx * o, z = az + uz * t + rz * o;
        if (inGap(x, z)) continue;
        const y = terrainH(x, z) - 0.2;
        // 縁石＋植え込み
        const c = new THREE.Mesh(new THREE.BoxGeometry(L / n, 0.2, 0.9), curb);
        const h = hedgeBox(L / n - 0.3, 0.45, 0.6);
        const pitch = Math.atan2(terrainH(x + ux, z + uz) - terrainH(x - ux, z - uz), 2);
        for (const [m, dy] of [[c, 0.1], [h, 0.15]]) {
          m.rotation.order = "YZX";
          m.rotation.set(0, -Math.atan2(uz, ux), pitch);
          m.position.set(x, y + dy, z);
          g.add(m);
        }
        if (Math.floor((along + t) / treeStep) !== Math.floor((along + t - L / n) / treeStep)) trees.push([x, y + 0.3, z, 0.4]);
      }
    }
    along += L;
  }
  if (trees.length) g.add(buildTrees(trees));
  return g;
}

// 電柱と電線（日本の住宅地らしく、道路の学校と反対側に約30mおき）。電柱・腕木は InstancedMesh、電線は1本の線の形なので軽い
function buildPoles(roads, boundary) {
  const tops = [];
  for (const r of roads) {
    const pts = r.pts, o = r.w / 2 + 2.9;
    let next = 10, run = 0, line = [], lastSide = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      const side = inPoly(mx - uz * o, mz + ux * o, boundary) || inPoly(mx - uz * (o + 6), mz + ux * (o + 6), boundary) ? -1 : 1;
      if (lastSide && side !== lastSide && line.length) { tops.push(line); line = []; } // 反対側へ移るところで電線を切る
      lastSide = side;
      while (next <= run + L) {
        const t = next - run;
        const x = ax + ux * t - uz * o * side, z = az + uz * t + ux * o * side;
        line.push([x, terrainH(x, z) - 0.2, z, Math.atan2(uz, ux)]);
        next += 30;
      }
      run += L;
    }
    if (line.length) tops.push(line);
  }
  const all = tops.flat();
  const g = new THREE.Group();
  if (!all.length) return g;
  const poleGeo = new THREE.CylinderGeometry(0.14, 0.2, 10, 8); poleGeo.translate(0, 5, 0);
  const armGeo = new THREE.BoxGeometry(0.12, 0.12, 1.6); armGeo.translate(0, 9.2, 0);
  const transGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.9, 8); transGeo.translate(0.35, 7.4, 0); // 変圧器（ところどころ）
  const poles = new THREE.InstancedMesh(poleGeo, M(0x9c9a93, { roughness: 0.9 }), all.length);
  const arms = new THREE.InstancedMesh(armGeo, M(0x6b6b66, { metalness: 0.4 }), all.length);
  const trans = new THREE.InstancedMesh(transGeo, M(0x8b8f93, { metalness: 0.3 }), all.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), zero = new THREE.Vector3(0, 0, 0);
  all.forEach(([x, y, z, a], i) => {
    q.setFromAxisAngle(up, -a);
    m4.compose(new THREE.Vector3(x, y, z), q, one);
    poles.setMatrixAt(i, m4); arms.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, y, z), q, i % 3 === 0 ? one : zero);
    trans.setMatrixAt(i, m4);
  });
  poles.castShadow = true;
  g.add(poles, arms, trans);
  // 電線：となりの電柱のあいだに3本（少したるませる）
  const lp = [];
  for (const line of tops) for (let i = 0; i + 1 < line.length; i++) {
    const [x0, y0, z0, a] = line[i], [x1, y1, z1] = line[i + 1];
    for (const off of [-0.7, 0, 0.7]) {
      const nx = Math.cos(a + Math.PI / 2) * off, nz = Math.sin(a + Math.PI / 2) * off;
      const N = 6;
      for (let k = 0; k < N; k++) {
        const t0 = k / N, t1 = (k + 1) / N;
        const sag = (t) => -0.6 * 4 * t * (1 - t);
        lp.push(x0 + (x1 - x0) * t0 + nx, y0 + 9.25 + (y1 - y0) * t0 + sag(t0), z0 + (z1 - z0) * t0 + nz);
        lp.push(x0 + (x1 - x0) * t1 + nx, y0 + 9.25 + (y1 - y0) * t1 + sag(t1), z0 + (z1 - z0) * t1 + nz);
      }
    }
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.Float32BufferAttribute(lp, 3));
  g.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2a2a2a })));
  return g;
}

// 横断歩道（しま模様）。x, z は中心、rot は道路の向き（度）
function crosswalk({ x, z, rot = 0, len = 8, red = false, dy = 0 }) {
  const g = new THREE.Group();
  if (red) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.02, 6), M(0xa8483e, { roughness: 1 }));
    r.position.y = -0.205;
    g.add(r);
  }
  const white = M(0xf4f4ee, { roughness: 0.9 });
  for (let i = -len / 2 + 0.25; i < len / 2; i += 0.9) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.025, 3.5), white);
    st.position.set(i, -0.19, 0);
    g.add(st);
  }
  g.position.set(x, terrainH(x, z) + dy, z);
  g.rotation.y = THREE.MathUtils.degToRad(rot);
  return g;
}

// ---------- まわりの住宅地（道路ぞいに家をならべる。位置は雰囲気を出すためのもの） ----------
const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const unitGable = (() => {
  // x: -0.5〜0.5, y: 0〜1, z: -0.5〜0.5。棟は z 方向
  const v = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0, 1, -0.5], [-0.5, 0, 0.5], [0.5, 0, 0.5], [0, 1, 0.5]];
  const tri = [[0, 2, 1], [3, 4, 5], [0, 3, 5], [0, 5, 2], [1, 2, 5], [1, 5, 4], [0, 1, 4], [0, 4, 3]];
  const pos = [];
  for (const t of tri) for (const i of t) pos.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
})();
function buildHouses(SITE) {
  // まわりの住宅地：格子にそって家をならべ、遠くは霧で消えていく（家は2つの InstancedMesh なので軽い）
  const spots = [];
  const others = SITE.roads;
  const avoid = SITE.avoid || [];
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const nearBoundary = (x, z) => {
    const b = SITE.boundary;
    if (inPoly(x, z, b)) return true;
    for (let i = 0; i < b.length; i++) {
      const [ax, az] = b[i], [bx, bz] = b[(i + 1) % b.length];
      if (distSeg(x, z, ax, az, bx, bz) < 9) return true;
    }
    return false;
  };
  const R = 135, ang = THREE.MathUtils.degToRad(-17), ca = Math.cos(ang), sa = Math.sin(ang);
  const sx = 11.5, sz = 12.5;
  for (let i = -Math.ceil(R / sx); i <= Math.ceil(R / sx); i++) {
    // 何列かおきに道（家をおかない）
    if (((i % 6) + 6) % 6 === 0) continue;
    for (let j = -Math.ceil(R / sz); j <= Math.ceil(R / sz); j++) {
      if (((j % 5) + 5) % 5 === 0) continue;
      const lx = i * sx + (rnd() - 0.5) * 2, lz = j * sz + (rnd() - 0.5) * 2;
      const x = 10 + lx * ca - lz * sa, z = -40 + lx * sa + lz * ca;
      const dist = Math.hypot(x - 10, z + 40);
      if (dist > R) continue;
      if (nearBoundary(x, z)) continue;
      if (avoid.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) continue;
      // 家の角が道路や歩道にかからないよう、家の大きさの半分（約5〜7m）＋歩道の分だけ離す
      if (others.some((r) => r.pts.some((p, k) => k + 1 < r.pts.length && distSeg(x, z, p[0], p[1], r.pts[k + 1][0], r.pts[k + 1][1]) < r.w / 2 + 8.5))) continue;
      if (rnd() < 0.1) continue; // ところどころ空き地や駐車場
      spots.push({ x, z, dist, ang: -ang + (rnd() < 0.25 ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.15, w: 6.5 + rnd() * 3.5, d: 7 + rnd() * 3, h: 4.8 + rnd() * 2, roof: rnd() });
    }
  }
  const wallColors = [0xf2efe8, 0xe8e2d4, 0xd9d6cf, 0xeae6dc, 0xc9c4b8, 0xe4ddd0];
  const roofColors = [0x4a5260, 0x5b6676, 0x3f4650, 0x7a4a45, 0x8a5048, 0x56607a, 0x6d6f73, 0x8c6f5a, 0x8e9ba5];
  // 家の壁：1階と2階の窓（どの面にも同じ模様。壁の色は家ごとに変える）
  const winTex = canvasTex(128, 128, (c, W, H) => {
    c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, H);
    for (const [y, h] of [[28, 22], [74, 26]]) for (const x of [16, 56, 92]) {
      c.fillStyle = "#4c5a66"; c.fillRect(x, y, 22, h);
      c.fillStyle = "#e9e6de"; c.fillRect(x - 2, y + h, 26, 3); // 窓の下の枠
      c.fillStyle = "rgba(255,255,255,0.35)"; c.fillRect(x + 11, y, 1.5, h);
    }
  });
  const matBody = new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.85 });
  const matRoof = new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide });
  const g = new THREE.Group();
  // 近くの家だけ影を落とす（遠くは影なしで軽く）
  for (const near of [true, false]) {
    const list = spots.filter((h) => (h.dist < 150) === near);
    const body = new THREE.InstancedMesh(unitBox, matBody, list.length);
    const roof = new THREE.InstancedMesh(unitGable, matRoof, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((h, i) => {
      q.setFromAxisAngle(up, h.ang);
      const gy = terrainH(h.x, h.z);
      m4.compose(new THREE.Vector3(h.x, gy - 0.6, h.z), q, new THREE.Vector3(h.w, h.h + 0.4, h.d));
      body.setMatrixAt(i, m4);
      body.setColorAt(i, new THREE.Color(wallColors[(i * 7) % wallColors.length]));
      m4.compose(new THREE.Vector3(h.x, gy + h.h - 0.2, h.z), q, new THREE.Vector3(h.w + 0.8, 2.2, h.d + 0.8));
      roof.setMatrixAt(i, m4);
      roof.setColorAt(i, new THREE.Color(roofColors[Math.floor(h.roof * roofColors.length)]));
    });
    body.castShadow = roof.castShadow = near;
    body.receiveShadow = true;
    g.add(body, roof);
  }
  g.userData.spots = spots.filter((h) => h.dist < 160);
  return g;
}

// となりの金程中学校（北の道路の向こう。校舎とグラウンド。かんたんな形）
export function buildNeighborJHS({ ground, building }) {
  const g = new THREE.Group();
  const [gx, gz, gw, gd, rot] = ground;
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(gw, gd), M(0xc4b59a, { roughness: 1 }));
  gm.rotation.order = "YXZ"; gm.rotation.set(-Math.PI / 2, THREE.MathUtils.degToRad(rot), 0);
  // 斜面でも地面に埋もれないよう、四すみでいちばん高い所に合わせて平らな箱にする
  const a = THREE.MathUtils.degToRad(rot);
  const hs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => terrainH(gx + (i * gw / 2) * Math.cos(a) + (j * gd / 2) * Math.sin(a), gz - (i * gw / 2) * Math.sin(a) + (j * gd / 2) * Math.cos(a)));
  // 中学校は道路よりさらに高いところにあり、道路側は石積みの壁
  const lift = 4.5;
  const top = Math.max(...hs) + lift, bot = Math.min(...hs) - 1;
  gm.position.set(gx, top, gz);
  const padTex = texWall.clone(); padTex.needsUpdate = true; padTex.repeat.set(gw / 4, (top - bot) / 4);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(gw, top - bot, gd + 30), new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.95 }));
  // 台は北の校舎の下までのばす（南の面が道路ぞいの石積みの壁になる）
  pad.position.set(gx - 15 * Math.sin(a), (top + bot) / 2 - 0.02, gz - 15 * Math.cos(a)); pad.rotation.y = a;
  g.add(pad);
  g.add(gm);
  const [bx, bz, bw, bd, h, brot] = building;
  const body = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bd), M(0xeeebe4));
  const by = top + 0.1;
  body.position.set(bx, by + h / 2, bz);
  body.rotation.y = THREE.MathUtils.degToRad(brot);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.4, 0.6, bd + 0.4), M(0x9aa0a4));
  cap.position.set(bx, by + h, bz);
  cap.rotation.y = body.rotation.y;
  for (const m of [body, cap]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  // 窓の帯（4階分）
  for (let k = 0; k < 4; k++) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.06, 1.2, bd + 0.06), M(0x5d7184, { roughness: 0.4 }));
    w.position.set(bx, by + 1.6 + k * 3.1, bz); w.rotation.y = body.rotation.y; w.scale.x = 0.96;
    g.add(w);
  }
  return g;
}

// ---------- まわりの土地（斜面）。敷地の形に穴をあけた大きな面を、斜面の高さに合わせる ----------
// 擁壁は斜めの石積み（のり面）。敷地のふち（高さ 0）から、外の土地の高さ H まで、
// 外側に |H| × SLOPE_RUN だけ水平にはみ出す。北は外が高いので上り、南は外が低いので下り
const SLOPE_RUN = 0.3; // 写真では、ほぼ垂直に近い急な石積み
// 敷地の各頂点を、外向きに斜面の幅だけずらした点（まわりの土地の穴のふちになる）
export function offsetBoundary(boundary) {
  const n = boundary.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const [px, pz] = boundary[(i + n - 1) % n], [x, z] = boundary[i], [nx2, nz2] = boundary[(i + 1) % n];
    // 前後の辺の法線の平均（外向きかどうかは、少し進んだ点が敷地の外かで決める）
    const n1 = [z - pz, -(x - px)], n2 = [nz2 - z, -(nx2 - x)];
    const l1 = Math.hypot(...n1), l2 = Math.hypot(...n2);
    let nx = n1[0] / l1 + n2[0] / l2, nz = n1[1] / l1 + n2[1] / l2;
    const l = Math.hypot(nx, nz); nx /= l; nz /= l;
    if (inPoly(x + nx * 0.5, z + nz * 0.5, boundary)) { nx = -nx; nz = -nz; }
    // 外が高い（北）ところは、ほぼ垂直な石積みの壁。外が低い（南・西）ところは斜めの石積み
    const H = terrainH(x, z);
    const w = H > 0 ? Math.max(2.8, H * 0.5) : Math.max(0.4, -H * SLOPE_RUN);
    out.push([x + nx * w, z + nz * w]);
  }
  return out;
}

export function buildTerrain(boundary, material, roads = []) {
  // 斜面の高さが場所ごとに変わるので、細かい格子の面にする
  const R = 200, step = 3, n = Math.round((2 * R) / step);
  const hole = offsetBoundary(boundary);
  const geo = new THREE.PlaneGeometry(2 * R, 2 * R, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = terrainH(x, z) - 0.25;
    // 敷地とのり面の内側は、敷地の地面やのり面より下にかくす
    if (inPoly(x, z, hole)) h = Math.min(h, 0) - 10;
    // 道路の下も少し下げて、地面が道路の上に出ないようにする
    else if (roads.some((r) => r.pts.some((p, k) => k + 1 < r.pts.length && distSeg(x, z, p[0], p[1], r.pts[k + 1][0], r.pts[k + 1][1]) < r.w / 2 + 1.5))) h -= 0.35;
    pos.setY(i, h);
    uv.setXY(i, x / 6, z / 6);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  return m;
}

// 石積みの模様（ストリートビューの写真より：濃い灰色の四角いブロックを横に積み、水抜きの丸い穴がある）
// 1枚の模様が 4m × 4m。ブロックは 長さ約1m × 高さ約0.37m
const texWall = (() => {
  const t = canvasTex(256, 256, (c, W, H) => {
    c.fillStyle = "#4a4c50"; c.fillRect(0, 0, W, H);
    const bw = 64, bh = 24;
    for (let row = 0, y = 0; y < H; row++, y += bh) for (let x = (row % 2) * bw / 2 - bw; x < W; x += bw) {
      const v = Math.random() * 16 - 8;
      c.fillStyle = `rgb(${104 + v},${106 + v},${110 + v})`;
      c.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
      // ざらざらした表面
      for (let k = 0; k < 18; k++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,0,0"},0.07)`; c.fillRect(x + Math.random() * bw, y + Math.random() * bh, 2, 2); }
    }
    // 水抜きの穴（約2mおき、互いちがい）
    c.fillStyle = "#1b1c1e";
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      c.beginPath(); c.arc(32 + i * 128 + j * 64, 64 + j * 128, 4, 0, Math.PI * 2); c.fill();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
const matWall = new THREE.MeshStandardMaterial({ map: texWall, roughness: 0.95, side: THREE.DoubleSide });
const matRamp = new THREE.MeshStandardMaterial({ color: 0x8d8f91, roughness: 1, side: THREE.DoubleSide });
const railMat = M(0x4e6b5a, { metalness: 0.4, roughness: 0.5 });

// 柵（たて格子のフェンス）。y はそれぞれの点の地面の高さ
function railing(group, ax, az, ay, bx, bz, by, h = 1.5) {
  const L = Math.hypot(bx - ax, bz - az);
  if (L < 0.2) return;
  const ang = -Math.atan2(bz - az, bx - ax);
  const pitch = Math.atan2(by - ay, L);
  const mk = (geo, dy) => { const m = new THREE.Mesh(geo, railMat); m.position.set((ax + bx) / 2, (ay + by) / 2 + dy, (az + bz) / 2); m.rotation.order = "YZX"; m.rotation.set(0, ang, pitch); group.add(m); };
  mk(new THREE.BoxGeometry(L, 0.06, 0.06), h);
  mk(new THREE.BoxGeometry(L, 0.05, 0.05), 0.15);
  const n = Math.max(1, Math.round(L / 0.15));
  // たて格子（あとで bakeStatic でまとめられるよう、ふつうの形にしておく）
  const bg = [];
  for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; const b = new THREE.BoxGeometry(0.025, h - 0.15, 0.025); b.translate(ax + (bx - ax) * t, ay + (by - ay) * t + 0.15 + (h - 0.15) / 2, az + (bz - az) * t); bg.push(b); }
  group.add(new THREE.Mesh(mergeGeometries(bg), railMat));
  const np = Math.ceil(L / 2.5);
  for (let i = 0; i <= np; i++) { const t = i / np; const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, 0.08), railMat); p.position.set(ax + (bx - ax) * t, ay + (by - ay) * t + h / 2, az + (bz - az) * t); group.add(p); }
}

export function buildRetaining(boundary, gates = []) {
  const g = new THREE.Group();
  const outer = offsetBoundary(boundary);
  const walls = { pos: [], uv: [], idx: [] }, ramps = { pos: [], uv: [], idx: [] };
  const inGate = (x, z) => gates.find((gt) => Math.hypot(x - gt.x, z - gt.z) < gt.w / 2);
  for (let i = 0; i < boundary.length; i++) {
    const A = boundary[i], B = boundary[(i + 1) % boundary.length], A2 = outer[i], B2 = outer[(i + 1) % boundary.length];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const n = Math.max(1, Math.ceil(L / 3));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const lerp = (P, Q, t) => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];
      const [ix0, iz0] = lerp(A, B, t0), [ix1, iz1] = lerp(A, B, t1);   // 敷地のふち（高さ 0）
      const [ox0, oz0] = lerp(A2, B2, t0), [ox1, oz1] = lerp(A2, B2, t1); // 外の土地のふち（高さ H）
      const h0 = terrainH(ox0, oz0) - 0.25, h1 = terrainH(ox1, oz1) - 0.25;
      const gate = inGate((ix0 + ix1) / 2, (iz0 + iz1) / 2);
      if (gate && gate.main) continue; // 正門のところは開けておく（mainGate で作る）
      const T = gate ? ramps : walls;
      const j = T.pos.length / 3;
      T.pos.push(ix0, -0.2, iz0, ix1, -0.2, iz1, ox1, h1, oz1, ox0, h0, oz0);
      const u0 = (i * 50 + k * 3) / 4, u1 = u0 + L / n / 4;
      T.uv.push(u0, 0, u1, 0, u1, Math.abs(h1) / 4 + 0.3, u0, Math.abs(h0) / 4 + 0.3);
      T.idx.push(j, j + 1, j + 2, j, j + 2, j + 3);
      // 柵は、高いほうのふちの上（門のところは開けておく）
      const nearMain = gates.some((gt) => gt.main && Math.hypot((ix0 + ix1) / 2 - gt.x, (iz0 + iz1) / 2 - gt.z) < gt.w / 2 + (gt.wing || 0));
      if (!gate && !nearMain) {
        const hi = (h0 + h1) / 2 > -0.2;
        if (hi) railing(g, ox0, oz0, h0 + 0.25, ox1, oz1, h1 + 0.25, 1.4);
        else railing(g, ix0, iz0, -0.2, ix1, iz1, -0.2, 1.4);
      }
    }
  }
  for (const [T, mat] of [[walls, matWall], [ramps, matRamp]]) {
    if (!T.pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(T.pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(T.uv, 2));
    geo.setIndex(T.idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  // 正門（門柱・学校名の表札・開いた引き戸）
  for (const gt of gates) if (gt.main) g.add(mainGate(gt));
  return g;
}

// 御影石を積んだ模様
const texGranite = (() => {
  const t = canvasTex(128, 128, (c, W, H) => {
    c.fillStyle = "#8e8b84"; c.fillRect(0, 0, W, H);
    for (let row = 0, y = 0; y < H; row++) {
      const bh = 22 + Math.random() * 14;
      for (let x = -Math.random() * 30; x < W; ) {
        const bw = 26 + Math.random() * 30, v = Math.random() * 20 - 10;
        c.fillStyle = `rgb(${205 + v},${202 + v},${194 + v})`;
        c.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3);
        x += bw;
      }
      y += bh;
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

// 正門。x, z は門のまんなか、rot は道路に向かう向き（度）、w は幅
function mainGate({ x, z, rot = 0, w = 10, name = "", wing = 0 }) {
  const g = new THREE.Group();
  // 門柱と、道路ぞいの低い袖の壁：白っぽい御影石を積んだもの（ストリートビューの写真より）
  const pillar = new THREE.MeshStandardMaterial({ map: texGranite, roughness: 0.9 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 1.3), pillar);
    p.position.set(0, 0.8, s * (w / 2 + 0.65));
    p.castShadow = true;
    g.add(p);
    if (wing > 0) {
      const ww = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.25, wing), pillar);
      ww.position.set(0, 0.52, s * (w / 2 + 1.3 + wing / 2));
      ww.castShadow = true;
      g.add(ww);
    }
  }
  // 学校名の表札
  if (name) {
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 512;
    const c = cv.getContext("2d");
    c.fillStyle = "#f4efe2"; c.fillRect(0, 0, 64, 512);
    c.fillStyle = "#222"; c.font = "bold 40px serif"; c.textAlign = "center";
    [...name].forEach((ch, i) => c.fillText(ch, 32, 46 + i * (460 / name.length)));
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.6), new THREE.MeshStandardMaterial({ map: t }));
    plate.position.set(0.56, 0.9, w / 2 + 0.65); plate.rotation.y = Math.PI / 2;
    g.add(plate);
  }
  // 開いた引き戸（柱の内側にたたんである）
  const gate = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.3, 0.05), railMat);
    b.position.set(-0.3, 0.75, -w / 2 + 0.3 + i * 0.25);
    gate.add(b);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 2.1), railMat);
  top.position.set(-0.3, 1.4, -w / 2 + 1.15);
  gate.add(top);
  g.add(gate);
  // 正門は道路と同じ高さ（階段なし）
  const a = THREE.MathUtils.degToRad(rot);
  g.position.set(x, -0.2, z);
  g.rotation.y = a;
  return g;
}

// となりの金程小学校（東の道路の向かい。かんたんな形）
export function buildNeighborSchool({ x0, x1, z0, z1, h = 13, rot = 0 }) {
  const g = new THREE.Group();
  const w = x1 - x0, d = z1 - z0;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(0xe8e4dc));
  body.position.y = h / 2;
  const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.8, d + 0.2), M(0xa86650));
  band.position.y = h - 0.3;
  const roofG = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.3, d * 0.5), M(0x7f9a55)); // 屋上の芝生
  roofG.position.y = h + 0.15;
  for (const m of [body, band, roofG]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  for (let y = 1.2; y < h - 1; y += 3.4) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(w + 0.05, 1.4, d + 0.05), M(0x5d7184, { roughness: 0.4 }));
    win.position.y = y + 0.9; win.scale.set(0.98, 1, 1);
    g.add(win);
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  g.position.set(cx, terrainH(cx, cz) - 0.25, cz);
  g.rotation.y = THREE.MathUtils.degToRad(rot);
  return g;
}

// 配置。x, z はメートル（校舎の中心が 0、図面の上＝北が -z）、rot は度
export function buildSite(scene, SITE) {
  const group = new THREE.Group();
  const rects = [];   // 木を植えない場所
  const roadSegs = [];
  const polys = [];
  const placed = (obj, x, z, rotDeg = 0) => {
    obj.position.set(x, 0, z);
    obj.rotation.y = THREE.MathUtils.degToRad(rotDeg);
    group.add(obj);
  };
  if (SITE.ground) {
    group.add(buildGround(SITE.ground));
    polys.push(SITE.ground.poly);
  }
  for (const t of SITE.tennis || []) {
    placed(buildTennisArea(t), t.x, t.z, t.rot);
    const r = Math.hypot(t.w, t.d) / 2 + 3;
    rects.push([t.x - r, t.x + r, t.z - r, t.z + r]);
  }
  if (SITE.pool) {
    group.add(buildPool(SITE.pool));
    const [x0, x1, z0, z1] = SITE.pool.deck;
    rects.push([x0 - 3, x1 + 3, z0 - 3, SITE.pool.house[3] + 3]);
  }
  if (SITE.bikes) {
    const b = SITE.bikes;
    const len = b.x1 - b.x0, depth = b.z1 - b.z0;
    // 開いている側（open）がグラウンド側の北なら、うしろの壁は南
    placed(buildBikes({ len, depth: depth - 0.6, roof: b.roof, backWall: !b.noWall }), (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, b.open === "north" ? 180 : 0);
    rects.push([b.x0 - 3, b.x1 + 3, b.z0 - 3, b.z1 + 3]);
  }
  if (SITE.bikes2) {
    const b = SITE.bikes2;
    group.add(buildBikes2(b));
    rects.push([b.x0 - 3, b.x1 + 3, b.z0 - 3, b.z1 + 3]);
  }
  for (const s of SITE.sheds || []) {
    group.add(buildShed(s));
    rects.push([s.x0 - 3, s.x1 + 3, s.z0 - 3, s.z1 + 3]);
  }
  for (const p of SITE.parking || []) {
    group.add(buildParking(p));
    rects.push([p.x0 - 2, p.x1 + 2, p.z0 - 2, p.z1 + 2]);
  }
  for (const r of SITE.roads || []) {
    group.add(buildRoad(r));
    for (let i = 0; i + 1 < r.pts.length; i++) roadSegs.push([...r.pts[i], ...r.pts[i + 1], r.w / 2 + 2]);
  }
  for (const c of SITE.crosswalks || []) group.add(crosswalk(c));
  for (const st of SITE.streetscape || []) group.add(buildStreetscape(st));
  if (SITE.roads && SITE.boundary) group.add(buildPoles(SITE.roads, SITE.boundary));
  // 正門から中庭までの通路（中庭から東へ出て、少し南へ折れて正門へ）と、門の手前の半円の広場
  if (SITE.approach) {
    const a = SITE.approach, pave = M(0xe6e2d8, { roughness: 1 });
    for (let i = 0; i + 1 < a.pts.length; i++) {
      const [ax, az] = a.pts[i], [bx, bz] = a.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(a.w, L + a.w), pave);
      seg.rotation.order = "YXZ"; seg.rotation.set(-Math.PI / 2, Math.atan2(bx - ax, bz - az), 0);
      seg.position.set((ax + bx) / 2, -0.175 + i * 0.002, (az + bz) / 2);
      group.add(seg);
      for (let t = 0; t <= L; t += 3) rects.push([ax + (bx - ax) * t / L - 3, ax + (bx - ax) * t / L + 3, az + (bz - az) * t / L - 3, az + (bz - az) * t / L + 3]);
    }
    if (a.plaza) {
      const pl = new THREE.Mesh(new THREE.CircleGeometry(a.plaza.r, 40, -Math.PI / 2, Math.PI), pave);
      pl.rotation.order = "YXZ"; pl.rotation.set(-Math.PI / 2, THREE.MathUtils.degToRad(a.plaza.rot || 0), 0);
      pl.position.set(a.plaza.x, -0.18, a.plaza.z);
      group.add(pl);
      rects.push([a.plaza.x - a.plaza.r, a.plaza.x + a.plaza.r, a.plaza.z - a.plaza.r, a.plaza.z + a.plaza.r]);
    }
  }
  // 半円の広場から北への通路
  if (SITE.approachBranch) {
    const b = SITE.approachBranch, pave = M(0xe6e2d8, { roughness: 1 });
    const [[ax, az], [bx, bz]] = b.pts, L = Math.hypot(bx - ax, bz - az);
    const seg = new THREE.Mesh(new THREE.PlaneGeometry(b.w, L), pave);
    seg.rotation.order = "YXZ"; seg.rotation.set(-Math.PI / 2, Math.atan2(bx - ax, bz - az), 0);
    seg.position.set((ax + bx) / 2, -0.176, (az + bz) / 2);
    group.add(seg);
    for (let t = 0; t <= L; t += 3) rects.push([ax + (bx - ax) * t / L - 2.5, ax + (bx - ax) * t / L + 2.5, az + (bz - az) * t / L - 2.5, az + (bz - az) * t / L + 2.5]);
  }
  // 土の広場（木は植えない）
  if (SITE.dirt) {
    const bb = polyBounds(SITE.dirt);
    group.add(flatPoly(SITE.dirt, M(0x9c8f7c, { roughness: 1 }), -0.19, bb));
    polys.push(SITE.dirt);
  }
  // 構内の車路
  if (SITE.driveway) {
    const dw = SITE.driveway, asph = M(0x6e7073, { roughness: 1 });
    for (let i = 0; i + 1 < dw.pts.length; i++) {
      const [ax, az] = dw.pts[i], [bx, bz] = dw.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(dw.w, L + dw.w * 0.6), asph);
      seg.rotation.order = "YXZ"; seg.rotation.set(-Math.PI / 2, Math.atan2(bx - ax, bz - az), 0);
      seg.position.set((ax + bx) / 2, -0.185 + i * 0.001, (az + bz) / 2);
      seg.receiveShadow = true;
      group.add(seg);
      for (let t = 0; t <= L; t += 3) rects.push([ax + (bx - ax) * t / L - 3.5, ax + (bx - ax) * t / L + 3.5, az + (bz - az) * t / L - 3.5, az + (bz - az) * t / L + 3.5]);
    }
  }
  // でこぼこの植え込み（写真の形をなぞったもの）
  for (const hm of SITE.hedgeMasses || []) {
    const m = hedgeMass(hm.blobs, hm.h);
    m.position.y = -0.2;
    group.add(m);
    for (const [x, z, r] of hm.blobs) rects.push([x - r - 0.5, x + r + 0.5, z - r - 0.5, z + r + 0.5]);
  }
  // 植え込み
  for (const [x0, x1, z0, z1, h] of SITE.hedges || []) {
    const hb = hedgeBox(x1 - x0, h, z1 - z0); hb.position.set((x0 + x1) / 2, -0.2, (z0 + z1) / 2); group.add(hb);
    rects.push([x0 - 1, x1 + 1, z0 - 1, z1 + 1]);
  }
  // 庭園（レンガ敷き）
  if (SITE.garden) {
    const bbG = polyBounds(SITE.garden.poly);
    const t = canvasTex(256, 256, (c, W, H) => {
      c.fillStyle = "#9a5a44"; c.fillRect(0, 0, W, H);
      for (let y = 0, r = 0; y < H; y += 12, r++) for (let x = (r % 2) * 12; x < W; x += 24) { const v = Math.random() * 24 - 12; c.fillStyle = `rgb(${160 + v},${95 + v * 0.6},${75 + v * 0.5})`; c.fillRect(x + 1, y + 1, 22, 10); }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
    group.add(flatPoly(SITE.garden.poly, new THREE.MeshStandardMaterial({ map: t, roughness: 1 }), -0.18, bbG));
    rects.push([bbG.x0, bbG.x1, bbG.z0, bbG.z1]);
  }
  // ごみ捨て場（コンクリートの床、緑の網のかこい、屋根）
  if (SITE.garbage) {
    const gb = SITE.garbage, gg = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(gb.w, 0.15, gb.d), M(0xbdbab2)); base.position.y = -0.12;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(gb.w + 0.4, 0.1, gb.d + 0.4), M(0x7f8a86, { metalness: 0.3 })); roof.position.y = 2.2;
    gg.add(base, roof);
    // まわりを生け垣でかこむ（片側のまんなかに入口のすきま）
    const hw = 0.9, hh = 1.6, W2 = gb.w / 2 + hw, D2 = gb.d / 2 + hw;
    const gap = 1.6, half = (gb.d + 2 * hw - gap) / 2; // 入口のすきま（片側の端）
    for (const [w, d, x, z] of [[gb.w + 2 * hw * 2, hw, 0, -D2], [gb.w + 2 * hw * 2, hw, 0, D2], [hw, gb.d + 2 * hw, W2, 0],
      [hw, half, -W2, -(gap + half) / 2], [hw, half, -W2, (gap + half) / 2]]) {
      const h = hedgeBox(w, hh, d); h.position.set(x, -0.2, z); gg.add(h);
    }
    for (let i = 0; i < 4; i++) { const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.75, 12), M([0x2f5fa8, 0x3a8a4f, 0xd8d4c8, 0x2f5fa8][i])); bin.position.set(-gb.w / 2 + 0.6 + i * 0.75, 0.35, 0); gg.add(bin); }
    gg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    gg.position.set(gb.x, 0, gb.z); gg.rotation.y = THREE.MathUtils.degToRad(gb.rot || 0);
    group.add(gg);
    rects.push([gb.x - 5, gb.x + 5, gb.z - 5, gb.z + 5]);
  }
  // テニスコートのそばの小屋と青いシート
  for (const p of SITE.props || []) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), M(p.color, { roughness: 0.9 }));
    m.position.set(p.x, p.h / 2 - 0.17, p.z);
    m.rotation.y = THREE.MathUtils.degToRad(p.rot || 0);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  if (SITE.boundary) group.add(buildRetaining(SITE.boundary, SITE.gates || []));
  // となりの小学校・中学校は、軽くするため描かない（SITE.showNeighbors を true にすると出る）
  if (SITE.showNeighbors && SITE.neighborSchool) group.add(buildNeighborSchool(SITE.neighborSchool));
  if (SITE.showNeighbors && SITE.neighborJHS) group.add(buildNeighborJHS(SITE.neighborJHS));
  const houses = SITE.roads && SITE.boundary ? buildHouses(SITE) : null;
  if (houses) group.add(houses);
  group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  scene.add(group);
  return {
    group,
    isFree: (x, z) => (!houses || houses.userData.spots.every((h) => Math.hypot(h.x - x, h.z - z) > 7)) && roadSegs.every(([ax, az, bx, bz, r]) => distSeg(x, z, ax, az, bx, bz) > r) && rects.every(([x0, x1, z0, z1]) => x < x0 || x > x1 || z < z0 || z > z1) &&
      polys.every((p) => !inPoly(x, z, p) && !inPoly(x + 4, z, p) && !inPoly(x - 4, z, p) && !inPoly(x, z + 4, p) && !inPoly(x, z - 4, p)),
  };
}

// ---------- 航空写真（国土地理院の地理院タイル） ----------
const ZOOM = 18;
function lonLatToPixel(lon, lat, z) {
  const n = 256 * 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return [x, y];
}

export function createAerial(scene, school) {
  const holder = new THREE.Group();   // 位置合わせ（回転・移動・大きさ）
  holder.visible = false;
  scene.add(holder);
  const mpp = (156543.03392 * Math.cos((school.lat * Math.PI) / 180)) / 2 ** ZOOM; // 1ピクセルの長さ(m)
  const N = 5;
  let loaded = null;

  function load() {
    if (loaded) return loaded;
    const [px, py] = lonLatToPixel(school.lng, school.lat, ZOOM);
    const tx0 = Math.floor(px / 256) - Math.floor(N / 2);
    const ty0 = Math.floor(py / 256) - Math.floor(N / 2);
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256 * N;
    const g = cv.getContext("2d");
    g.fillStyle = "#8a9a7a"; g.fillRect(0, 0, cv.width, cv.height);
    const jobs = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      jobs.push(new Promise((res, rej) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => { g.drawImage(img, i * 256, j * 256); res(); };
        img.onerror = rej;
        img.src = `https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${ZOOM}/${tx0 + i}/${ty0 + j}.jpg`;
      }));
    }
    loaded = Promise.all(jobs).then(() => {
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const size = 256 * N * mpp;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
      plane.rotation.x = -Math.PI / 2;
      // 画像の中心と学校の地点（Googleマップのピン）とのずれ
      plane.position.set(((tx0 + N / 2) * 256 - px) * mpp, -0.15, ((ty0 + N / 2) * 256 - py) * mpp);
      plane.receiveShadow = true;
      holder.add(plane);
    }).catch((e) => { loaded = null; throw e; });
    return loaded;
  }

  function setAlign(a) {
    holder.rotation.y = THREE.MathUtils.degToRad(a.rot || 0);
    holder.position.set(a.x || 0, 0, a.z || 0);
    const s = a.scale || 1;
    holder.scale.set(s, 1, s);
  }

  return { holder, load, setAlign };
}
