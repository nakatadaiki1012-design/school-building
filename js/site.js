// 校舎のまわり（グラウンド・テニスコート・駐輪場）と、航空写真の重ね表示
import * as THREE from "three";

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
    c.fillStyle = "#b8b4ab"; c.fillRect(0, 0, W, H); // 写真では白っぽい灰色の土
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
    gr.addColorStop(0, "rgba(96,72,52,0.95)"); gr.addColorStop(0.7, "rgba(110,84,60,0.75)"); gr.addColorStop(1, "rgba(110,84,60,0)");
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
      c.strokeRect(s > 0 ? w / 2 - 16 * S : -w / 2, -20 * S, 16 * S, 40 * S);
      c.strokeRect(s > 0 ? w / 2 - 5.5 * S : -w / 2, -9 * S, 5.5 * S, 18 * S);
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
    fenceLine(g, x0, z0, x1, z1, (cfg.fence && cfg.fence[i]) || 3);
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
    for (let k = 0; k < 2; k++) {
      const cy = (H / 2) * (k + 0.5), cx = W / 2;
      const L = 23.77 * S, Wd = 10.97 * S, si = 1.37 * S, sv = 6.4 * S;
      c.strokeRect(cx - L / 2, cy - Wd / 2, L, Wd);
      c.beginPath();
      c.moveTo(cx - L / 2, cy - Wd / 2 + si); c.lineTo(cx + L / 2, cy - Wd / 2 + si);
      c.moveTo(cx - L / 2, cy + Wd / 2 - si); c.lineTo(cx + L / 2, cy + Wd / 2 - si);
      c.moveTo(cx - sv, cy - Wd / 2 + si); c.lineTo(cx - sv, cy + Wd / 2 - si);
      c.moveTo(cx + sv, cy - Wd / 2 + si); c.lineTo(cx + sv, cy + Wd / 2 - si);
      c.moveTo(cx - sv, cy); c.lineTo(cx + sv, cy);
      c.stroke();
    }
    c.strokeStyle = "rgba(255,255,255,0.6)";
    c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke();
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  p.rotation.x = -Math.PI / 2;
  p.position.y = -0.16 + (tennisCount++) * 0.01; // となりのコートと高さを少しずらす（ちらつき防止）
  p.receiveShadow = true;
  g.add(p);
  const netMat = M(0xf2f2f2);
  for (const k of [-1, 1]) {
    const net = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 12.8), netMat);
    net.position.set(0, 0.5, (k * d) / 4);
    net.castShadow = true;
    g.add(net);
  }
  fenceRect(g, -w / 2, -d / 2, w / 2, d / 2, 4);
  return g;
}

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
  const roof = new THREE.Mesh(new THREE.BoxGeometry(hx1 - hx0 + 0.3, 0.25, hz1 - hz0 + 0.3), M(0x9fd1b0));
  roof.position.set((hx0 + hx1) / 2, 3.3, (hz0 + hz1) / 2);
  roof.castShadow = true;
  g.add(roof);
  return g;
}

// ---------- 駐輪場（赤い屋根の細長い建物） ----------
function buildBikes({ len = 30, depth = 4.6, roof: roofColor = 0x9ea3a6 }) {
  const g = new THREE.Group();
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len, 0.15, depth + 0.6), M(roofColor, { roughness: 0.6 }));
  roof.position.set(0, 2.6, 0);
  roof.rotation.x = 0.05;
  roof.castShadow = true;
  g.add(roof);
  const back = new THREE.Mesh(new THREE.BoxGeometry(len, 2.5, 0.1), M(0xd9d4c8));
  back.position.set(0, 1.25, -depth / 2);
  back.castShadow = true;
  g.add(back);
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
  // 自転車
  const n = Math.floor(len / 0.6);
  const wheelGeo = new THREE.TorusGeometry(0.33, 0.035, 6, 16);
  const frameGeo = new THREE.BoxGeometry(0.04, 0.05, 1.0);
  const colors = [0x2b2b2b, 0x1f4e8a, 0xb7b7b7, 0x8a1f1f, 0xf2f2f2, 0x2f6b3a];
  const wheels = new THREE.InstancedMesh(wheelGeo, M(0x222222), n * 2);
  const frames = new THREE.InstancedMesh(frameGeo, M(0xffffff, { metalness: 0.3 }), n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  let wi = 0;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + 0.3 + i * 0.6;
    for (const dz of [-0.5, 0.5]) {
      m4.compose(new THREE.Vector3(x, 0.33, dz), q, new THREE.Vector3(1, 1, 1));
      wheels.setMatrixAt(wi++, m4);
    }
    m4.compose(new THREE.Vector3(x, 0.62, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    frames.setMatrixAt(i, m4);
    frames.setColorAt(i, new THREE.Color(colors[(i * 7) % colors.length]));
  }
  wheels.castShadow = frames.castShadow = true;
  g.add(wheels, frames);
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
  // 車（何台か）
  const colors = [0xf2f2f2, 0x222222, 0x8a8f96, 0x2b4d80, 0xb33a3a, 0xd9d4c8];
  const n = Math.floor((along ? w : d) / 2.5);
  const body = new THREE.BoxGeometry(along ? 1.7 : 4.3, 0.8, along ? 4.3 : 1.7);
  const cab = new THREE.BoxGeometry(along ? 1.5 : 2.2, 0.6, along ? 2.2 : 1.5);
  let seed = Math.round(x0 * 7 + z0 * 13);
  const rnd = () => ((seed = (seed * 16807 + 11) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    if (rnd() < 0.35) continue;
    const mat = M(colors[Math.floor(rnd() * colors.length)], { metalness: 0.4, roughness: 0.4 });
    const cx = along ? x0 + 1.25 + i * 2.5 : (x0 + x1) / 2, cz = along ? (z0 + z1) / 2 : z0 + 1.25 + i * 2.5;
    const b = new THREE.Mesh(body, mat); b.position.set(cx, 0.35, cz);
    const c = new THREE.Mesh(cab, mat); c.position.set(cx, 1.0, cz);
    b.castShadow = c.castShadow = true;
    g.add(b, c);
  }
  return g;
}

// ---------- 道路 ----------
function buildRoad({ w, pts }) {
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
    const dx = nx - px, dz = nz - pz, L = Math.hypot(dx, dz);
    const ox = (-dz / L) * w / 2, oz = (dx / L) * w / 2;
    pos.push(x + ox, 0, z + oz, x - ox, 0, z - oz);
    if (i > 0) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const g = new THREE.Group();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x5d6063, roughness: 1, side: THREE.DoubleSide }));
  m.position.y = -0.22;
  g.add(m);
  // センターライン（白い破線）と、ふちの白線
  const dash = new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.9 });
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, ang = Math.atan2(ux, uz);
    for (let t = 2; t < L - 2; t += 8) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 4), dash);
      d.position.set(ax + ux * (t + 2), -0.2, az + uz * (t + 2)); d.rotation.y = ang;
      g.add(d);
    }
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, L), dash);
      e.position.set((ax + bx) / 2 - uz * s * (w / 2 - 0.4), -0.2, (az + bz) / 2 + ux * s * (w / 2 - 0.4)); e.rotation.y = ang;
      g.add(e);
    }
  }
  return g;
}

// 横断歩道（しま模様）。x, z は中心、rot は道路の向き（度）
function crosswalk({ x, z, rot = 0, len = 8, red = false }) {
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
  g.position.set(x, 0, z);
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
  const road = SITE.roads[0];
  const spots = [];
  const others = SITE.roads;
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const nearBoundary = (x, z) => {
    const b = SITE.boundary;
    if (inPoly(x, z, b)) return true;
    for (let i = 0; i < b.length; i++) {
      const [ax, az] = b[i], [bx, bz] = b[(i + 1) % b.length];
      if (distSeg(x, z, ax, az, bx, bz) < 7) return true;
    }
    return false;
  };
  for (let i = 0; i + 1 < road.pts.length; i++) {
    const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let t = 5; t < L; t += 11) {
      for (const side of [-1, 1]) for (const row of [0, 1]) {
        const off = road.w / 2 + 8 + row * 13 + rnd() * 2;
        const x = ax + ux * t - uz * side * off, z = az + uz * t + ux * side * off;
        if (nearBoundary(x, z)) continue;
        if (x > 85 && z > -75 && z < 45) continue; // 東どなりは小学校
        if (others.some((r) => r.pts.some((p, k) => k + 1 < r.pts.length && distSeg(x, z, p[0], p[1], r.pts[k + 1][0], r.pts[k + 1][1]) < r.w / 2 + 5))) continue;
        if (spots.some((p) => Math.hypot(p.x - x, p.z - z) < 10.5)) continue;
        if (rnd() < 0.12) continue; // ところどころ空き地や駐車場
        // 家の向き・大きさをばらばらに（写真の住宅地のように）
        spots.push({ x: x + (rnd() - 0.5) * 2, z: z + (rnd() - 0.5) * 2, ang: Math.atan2(ux, uz) + (rnd() < 0.3 ? Math.PI / 2 : 0) + (rnd() - 0.5) * 0.2, w: 6 + rnd() * 5, d: 6.5 + rnd() * 4, h: 4.8 + rnd() * 2 });
      }
    }
  }
  const wallColors = [0xf2efe8, 0xe8e2d4, 0xd9d6cf, 0xeae6dc, 0xc9c4b8];
  const roofColors = [0x4a5260, 0x5b6676, 0x3f4650, 0x7a4a45, 0x8a5048, 0x56607a, 0x6d6f73, 0x8c6f5a];
  const body = new THREE.InstancedMesh(unitBox, new THREE.MeshStandardMaterial({ roughness: 0.85 }), spots.length);
  const roof = new THREE.InstancedMesh(unitGable, new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }), spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  spots.forEach((h, i) => {
    q.setFromAxisAngle(up, h.ang);
    m4.compose(new THREE.Vector3(h.x, -0.2, h.z), q, new THREE.Vector3(h.w, h.h, h.d));
    body.setMatrixAt(i, m4);
    body.setColorAt(i, new THREE.Color(wallColors[i % wallColors.length]));
    m4.compose(new THREE.Vector3(h.x, h.h - 0.2, h.z), q, new THREE.Vector3(h.w + 0.8, 2.2, h.d + 0.8));
    roof.setMatrixAt(i, m4);
    roof.setColorAt(i, new THREE.Color(roofColors[Math.floor(rnd() * roofColors.length)]));
  });
  body.castShadow = roof.castShadow = true;
  body.receiveShadow = true;
  const g = new THREE.Group();
  g.add(body, roof);
  g.userData.spots = spots;
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
    placed(buildBikes({ len, depth: depth - 0.6 }), (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 0);
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
  // テニスコートのそばの小屋と青いシート
  for (const p of SITE.props || []) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.w, p.h, p.d), M(p.color, { roughness: 0.9 }));
    m.position.set(p.x, p.h / 2 - 0.17, p.z);
    m.rotation.y = THREE.MathUtils.degToRad(p.rot || 0);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
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
