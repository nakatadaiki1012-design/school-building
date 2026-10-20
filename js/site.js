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
    g.strokeStyle = "rgba(60,90,70,0.9)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

function fence(group, x0, z0, x1, z1, h) {
  const mat = new THREE.MeshStandardMaterial({ map: texFence.clone(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.8 });
  const sides = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
  const post = M(0x4f6b57, { metalness: 0.3 });
  for (const [ax, az, bx, bz] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    const m = mat.clone();
    m.map = texFence.clone(); m.map.repeat.set(len / 0.6, h / 0.6); m.map.needsUpdate = true;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, h), m);
    p.position.set((ax + bx) / 2, h / 2, (az + bz) / 2);
    p.rotation.y = -Math.atan2(bz - az, bx - ax);
    group.add(p);
    const n = Math.ceil(len / 4);
    for (let i = 0; i <= n; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 6), post);
      s.position.set(ax + (bx - ax) * (i / n), h / 2, az + (bz - az) * (i / n));
      s.castShadow = true;
      group.add(s);
    }
  }
}

// ---------- グラウンド（200mトラック付き） ----------
function buildGround({ w, d }) {
  const g = new THREE.Group();
  const S = 8; // 1m = 8px
  const tex = canvasTex(Math.round(w * S), Math.round(d * S), (c, W, H) => {
    c.fillStyle = "#c9a882"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 20000; i++) {
      c.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "90,60,30"},${Math.random() * 0.08})`;
      c.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    // 200mトラック（直線が上下方向）
    const r = 16, straight = 50, lanes = 4, lw = 1.22;
    c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 2;
    const cx = W / 2, cy = H / 2;
    for (let i = 0; i <= lanes; i++) {
      const rr = (r + i * lw) * S, hs = (straight / 2) * S;
      c.beginPath();
      c.moveTo(cx - rr, cy - hs); c.lineTo(cx - rr, cy + hs);
      c.arc(cx, cy + hs, rr, Math.PI, 0, true);
      c.lineTo(cx + rr, cy - hs);
      c.arc(cx, cy - hs, rr, 0, Math.PI, true);
      c.stroke();
    }
    // スタートライン
    c.beginPath(); c.moveTo(cx + r * S, cy); c.lineTo(cx + (r + lanes * lw) * S, cy); c.stroke();
    // 中のサッカーコート（簡易）
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.strokeRect(cx - 12 * S, cy - 30 * S, 24 * S, 60 * S);
    c.beginPath(); c.moveTo(cx - 12 * S, cy); c.lineTo(cx + 12 * S, cy); c.stroke();
    c.beginPath(); c.arc(cx, cy, 5 * S, 0, Math.PI * 2); c.stroke();
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.17;
  plane.receiveShadow = true;
  g.add(plane);
  // サッカーゴール
  const white = M(0xffffff);
  for (const s of [-1, 1]) {
    const goal = new THREE.Group();
    const bar = (bw, bh, bd, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), white); m.position.set(x, y, z); m.castShadow = true; goal.add(m); };
    bar(0.12, 2.1, 0.12, -2.5, 1.05, 0); bar(0.12, 2.1, 0.12, 2.5, 1.05, 0); bar(5.1, 0.12, 0.12, 0, 2.1, 0);
    goal.position.set(0, 0, s * 30);
    g.add(goal);
  }
  // バックネット
  const net = new THREE.Group();
  fence(net, -6, 0, 6, 0, 6);
  net.position.set(-w / 2 + 10, 0, -d / 2 + 4);
  net.rotation.y = Math.PI / 4;
  g.add(net);
  // まわりの防球ネット
  fence(g, -w / 2, -d / 2, w / 2, d / 2, 2.5);
  return g;
}

// ---------- テニスコート ----------
function buildTennis({ courts = 2 }) {
  const g = new THREE.Group();
  const cw = 18, cd = 36; // 1面あたりの広さ
  const tex = canvasTex(180, 360, (c, W, H) => {
    c.fillStyle = "#3f7d5a"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 6000; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; c.fillRect(Math.random() * W, Math.random() * H, 1, 1); }
    const S = 10, ox = (W - 10.97 * S) / 2, oy = (H - 23.77 * S) / 2;
    c.strokeStyle = "#fff"; c.lineWidth = 2;
    c.strokeRect(ox, oy, 10.97 * S, 23.77 * S);
    const si = 1.37 * S;
    c.beginPath(); c.moveTo(ox + si, oy); c.lineTo(ox + si, oy + 23.77 * S); c.moveTo(ox + 10.97 * S - si, oy); c.lineTo(ox + 10.97 * S - si, oy + 23.77 * S); c.stroke();
    const sv = 6.4 * S, mid = oy + 11.885 * S;
    c.beginPath(); c.moveTo(ox + si, mid - sv); c.lineTo(ox + 10.97 * S - si, mid - sv); c.moveTo(ox + si, mid + sv); c.lineTo(ox + 10.97 * S - si, mid + sv); c.stroke();
    c.beginPath(); c.moveTo(W / 2, mid - sv); c.lineTo(W / 2, mid + sv); c.stroke();
  });
  const netMat = M(0xf2f2f2);
  for (let i = 0; i < courts; i++) {
    const x = (i - (courts - 1) / 2) * cw;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(cw, cd), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, -0.16, 0);
    p.receiveShadow = true;
    g.add(p);
    const net = new THREE.Mesh(new THREE.BoxGeometry(12.8, 0.9, 0.04), netMat);
    net.position.set(x, 0.45, 0);
    net.castShadow = true;
    g.add(net);
  }
  fence(g, -courts * cw / 2, -cd / 2, courts * cw / 2, cd / 2, 4);
  return g;
}

// ---------- 駐輪場 ----------
function buildBikes({ len = 28 }) {
  const g = new THREE.Group();
  const depth = 5.5;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, depth + 0.6), new THREE.MeshStandardMaterial({ color: 0xc9dfd2, transparent: true, opacity: 0.75, roughness: 0.3 }));
  roof.position.set(0, 2.5, 0);
  roof.rotation.x = 0.06;
  roof.castShadow = true;
  g.add(roof);
  const postMat = M(0x8c949b, { metalness: 0.4 });
  for (let x = -len / 2; x <= len / 2 + 0.01; x += 4) {
    for (const z of [-depth / 2, depth / 2]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), postMat);
      p.position.set(x, 1.25, z);
      p.castShadow = true;
      g.add(p);
    }
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, depth), M(0xa3a39c));
  floor.position.y = -0.14;
  floor.receiveShadow = true;
  g.add(floor);
  // 自転車（2列）
  const n = Math.floor(len / 0.6);
  const wheelGeo = new THREE.TorusGeometry(0.33, 0.035, 6, 16);
  const frameGeo = new THREE.BoxGeometry(0.04, 0.05, 1.0);
  const colors = [0x2b2b2b, 0x1f4e8a, 0xb7b7b7, 0x8a1f1f, 0xf2f2f2, 0x2f6b3a];
  const wheels = new THREE.InstancedMesh(wheelGeo, M(0x222222), n * 4);
  const frames = new THREE.InstancedMesh(frameGeo, M(0xffffff, { metalness: 0.3 }), n * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  let wi = 0, fi = 0;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + 0.3 + i * 0.6;
      const zc = row === 0 ? -1.4 : 1.4;
      for (const dz of [-0.5, 0.5]) {
        m4.compose(new THREE.Vector3(x, 0.33, zc + dz), q, new THREE.Vector3(1, 1, 1));
        wheels.setMatrixAt(wi++, m4);
      }
      m4.compose(new THREE.Vector3(x, 0.62, zc), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      frames.setMatrixAt(fi, m4);
      frames.setColorAt(fi++, new THREE.Color(colors[(i * 7 + row * 3) % colors.length]));
    }
  }
  wheels.castShadow = frames.castShadow = true;
  g.add(wheels, frames);
  return g;
}

// 配置。x, z はメートル（校舎の中心が 0、図面の上が -z）、rot は度
export function buildSite(scene, SITE) {
  const group = new THREE.Group();
  const areas = [];
  const place = (obj, cfg, w, d) => {
    obj.position.set(cfg.x, 0, cfg.z);
    obj.rotation.y = THREE.MathUtils.degToRad(cfg.rot || 0);
    group.add(obj);
    const rr = Math.hypot(w, d) / 2;
    areas.push({ x: cfg.x, z: cfg.z, r: rr + 3 });
  };
  if (SITE.ground) place(buildGround(SITE.ground), SITE.ground, SITE.ground.w, SITE.ground.d);
  if (SITE.tennis) place(buildTennis(SITE.tennis), SITE.tennis, 18 * (SITE.tennis.courts || 2), 36);
  if (SITE.bikes) place(buildBikes(SITE.bikes), SITE.bikes, SITE.bikes.len || 28, 6);
  group.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
  scene.add(group);
  return {
    group,
    isFree: (x, z) => areas.every((a) => Math.hypot(x - a.x, z - a.z) > a.r),
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
