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

// 金網（フェンス）の模様
const texFence = (() => {
  const t = canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(70,95,80,0.75)"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

function fence(group, x0, z0, x1, z1, h, sparsePosts = false) {
  const mat = new THREE.MeshStandardMaterial({ map: texFence.clone(), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.8 });
  const sides = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
  const post = M(0x4f6b57, { metalness: 0.3 });
  for (const [ax, az, bx, bz] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    const m = mat.clone();
    m.map = texFence.clone(); m.map.repeat.set(len / 1.2, h / 1.2); m.map.needsUpdate = true;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h), m);
    p.position.set((ax + bx) / 2, h / 2, (az + bz) / 2);
    p.rotation.y = -Math.atan2(bz - az, bx - ax);
    group.add(p);
    const n = Math.ceil(len / (sparsePosts ? 8 : 4));
    for (let i = 0; i <= n; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 6), post);
      s.position.set(ax + (bx - ax) * (i / n), h / 2, az + (bz - az) * (i / n));
      s.castShadow = true;
      group.add(s);
    }
  }
}

// ---------- グラウンド（航空写真の形どおり。野球とサッカー） ----------
function polyBounds(poly) {
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
function flatPoly(poly, mat, y, bb) {
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
    c.fillStyle = "#a29d93"; c.fillRect(0, 0, W, H);
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
    c.fillStyle = "#7b5a40";
    c.beginPath(); c.arc(bx, bz, b.r * S, 0, Math.PI * 2); c.fill();
    // ダイヤモンドとファウルライン
    const [hx, hz] = P(b.home[0], b.home[1]);
    const dx = bx - hx, dz = bz - hz, L = Math.hypot(dx, dz);
    const ux = dx / L, uz = dz / L;
    const rot = (a) => [ux * Math.cos(a) - uz * Math.sin(a), ux * Math.sin(a) + uz * Math.cos(a)];
    const side = 27.4 * S;
    const [ax, az] = rot(-Math.PI / 4), [cx2, cz2] = rot(Math.PI / 4);
    c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 2;
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
    c.strokeStyle = "rgba(255,255,255,0.85)"; c.lineWidth = 2;
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
  const net = new THREE.Group();
  fence(net, -8, 0, 8, 0, 8);
  net.position.set(b.home[0] - Math.cos(ang) * 6, 0, b.home[1] - Math.sin(ang) * 6);
  net.rotation.y = -ang + Math.PI / 2;
  g.add(net);
  // まわりの防球ネット
  for (let i = 0; i < cfg.poly.length; i++) {
    const [x0, z0] = cfg.poly[i], [x1, z1] = cfg.poly[(i + 1) % cfg.poly.length];
    fence(g, x0, z0, x1, z1, 4, true);
  }
  return g;
}

// ---------- テニスコート（砂のコート。1区画に2面） ----------
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
  p.position.y = -0.16;
  p.receiveShadow = true;
  g.add(p);
  const netMat = M(0xf2f2f2);
  for (const k of [-1, 1]) {
    const net = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.0, 12.8), netMat);
    net.position.set(0, 0.5, (k * d) / 4);
    net.castShadow = true;
    g.add(net);
  }
  fence(g, -w / 2, -d / 2, w / 2, -d / 2, 4);
  fence(g, w / 2, -d / 2, w / 2, d / 2, 4);
  fence(g, w / 2, d / 2, -w / 2, d / 2, 4);
  fence(g, -w / 2, d / 2, -w / 2, -d / 2, 4);
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
  fence(fg, x0, z0, x1, z0, 2.2); fence(fg, x1, z0, x1, z1, 2.2); fence(fg, x0, z1, x0, z0, 2.2);
  fg.position.y = 0.8;
  g.add(fg);
  // プールの建物（更衣室・機械室など）
  const [hx0, hx1, hz0, hz1] = cfg.house;
  const house = new THREE.Mesh(new THREE.BoxGeometry(hx1 - hx0, 3.4, hz1 - hz0), M(0xe6e2d8));
  house.position.set((hx0 + hx1) / 2, 1.5, (hz0 + hz1) / 2);
  house.castShadow = true; house.receiveShadow = true;
  g.add(house);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(hx1 - hx0 + 0.3, 0.25, hz1 - hz0 + 0.3), M(0x8d9194));
  roof.position.set((hx0 + hx1) / 2, 3.3, (hz0 + hz1) / 2);
  roof.castShadow = true;
  g.add(roof);
  const eave = new THREE.Mesh(new THREE.BoxGeometry((hx1 - hx0) * 0.7, 0.2, 2.6), M(0x9fd1b0));
  eave.position.set((hx0 + hx1) / 2 + (hx1 - hx0) * 0.12, 2.6, hz0 - 0.6);
  g.add(eave);
  return g;
}

// ---------- 駐輪場（赤い屋根の細長い建物） ----------
function buildBikes({ len = 30, depth = 4.6, roof: roofColor = 0xa8473d }) {
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

// 配置。x, z はメートル（校舎の中心が 0、図面の上＝北が -z）、rot は度
export function buildSite(scene, SITE) {
  const group = new THREE.Group();
  const rects = [];   // 木を植えない場所
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
    placed(buildBikes(b), b.x, b.z, b.rot);
    rects.push([b.x - b.len / 2 - 3, b.x + b.len / 2 + 3, b.z - 6, b.z + 6]);
  }
  for (const s of SITE.sheds || []) {
    group.add(buildShed(s));
    rects.push([s.x0 - 3, s.x1 + 3, s.z0 - 3, s.z1 + 3]);
  }
  group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  scene.add(group);
  return {
    group,
    isFree: (x, z) => rects.every(([x0, x1, z0, z1]) => x < x0 || x > x1 || z < z0 || z > z1) &&
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
