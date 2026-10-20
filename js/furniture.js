// 部屋の中の家具（机・椅子・黒板・実験台・本棚など）
// 家具の種類ごとに InstancedMesh をまとめて作るので、数が多くても軽く動く
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// ---------- 材質 ----------
function canvasTex(w, h, draw, rx = 1, ry = 1) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

const texBooks = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = "#6b4a2f"; g.fillRect(0, 0, w, h);
  const colors = ["#b23a3a", "#2f5f8a", "#d8b04a", "#3d7a4f", "#e8e2d0", "#7a3f7a", "#c96b2c", "#335"];
  for (let shelf = 0; shelf < 4; shelf++) {
    let x = 4;
    const y0 = shelf * 32 + 4;
    while (x < w - 4) {
      const bw = 3 + Math.random() * 5;
      g.fillStyle = colors[Math.floor(Math.random() * colors.length)];
      g.fillRect(x, y0 + Math.random() * 6, bw, 26 - Math.random() * 6);
      x += bw + 0.5;
    }
    g.fillStyle = "#5a3d26"; g.fillRect(0, y0 + 26, w, 4);
  }
});

const texBoard = canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = "#2f5a45"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    const y = 14 + i * 11;
    g.moveTo(20 + Math.random() * 20, y);
    g.lineTo(90 + Math.random() * 100, y + Math.random() * 2);
    g.stroke();
  }
});

const texShoes = canvasTex(64, 128, (g, w, h) => {
  g.fillStyle = "#cfd3d6"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#9aa1a7";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) g.fillRect(c * 16 + 1, r * 16 + 1, 14, 14);
  g.fillStyle = "#e9ecee";
  for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) g.fillRect(c * 16 + 3, r * 16 + 3, 10, 2);
});

export const FLOOR_TEX = {
  wood: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) {
      const y = i * 16;
      g.fillStyle = `rgba(120,90,50,${0.06 + Math.random() * 0.08})`;
      g.fillRect(0, y, w, 16);
      g.fillStyle = "rgba(80,60,30,0.18)"; g.fillRect(0, y, w, 1);
      const off = Math.random() * w;
      g.fillRect(off, y, 1, 16);
    }
  }, 1, 1),
  gym: canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = "#d9b27c"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 64; i++) {
      g.fillStyle = `rgba(120,80,30,${0.04 + Math.random() * 0.06})`;
      g.fillRect(0, i * 8, w, 8);
    }
    // バスケットボールのコート
    g.strokeStyle = "#ffffff"; g.lineWidth = 4;
    const m = 40;
    g.strokeRect(m, m, w - 2 * m, h - 2 * m);
    g.beginPath(); g.moveTo(w / 2, m); g.lineTo(w / 2, h - m); g.stroke();
    g.beginPath(); g.arc(w / 2, h / 2, 60, 0, Math.PI * 2); g.stroke();
    for (const side of [0, 1]) {
      const x = side ? w - m : m, dir = side ? -1 : 1;
      g.strokeRect(side ? x - 190 : x, h / 2 - 80, 190, 160);
      g.beginPath(); g.arc(x, h / 2, 230, -Math.PI / 2 * dir + (side ? Math.PI : 0), Math.PI / 2 * dir + (side ? Math.PI : 0), side === 1); g.stroke();
    }
    // バレーボールのライン
    g.strokeStyle = "#e8d14a"; g.lineWidth = 3;
    g.strokeRect(w / 2 - 230, h / 2 - 115, 460, 230);
    g.strokeStyle = "#4a8ee8";
    g.strokeRect(120, 70, 300, h - 140); g.strokeRect(w - 420, 70, 300, h - 140);
  }, 1, 1),
  tatami: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#b9c27a"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 256; i += 2) { g.fillStyle = `rgba(90,100,40,${Math.random() * 0.15})`; g.fillRect(0, i, w, 1); }
    g.fillStyle = "#3e4a2a";
    g.fillRect(0, 0, w, 6); g.fillRect(0, 128, w, 6); g.fillRect(0, 0, 6, h); g.fillRect(128, 0, 6, 128); g.fillRect(64, 128, 6, 128); g.fillRect(192, 128, 6, 128);
  }, 1, 1),
  tile: canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(0,0,0,0.12)"; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke();
    }
  }, 1, 1),
};

const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
const MAT = {
  wood: M(0xd2ad7c),
  darkWood: M(0x8a5d3b),
  metal: M(0x9aa2aa, { metalness: 0.4, roughness: 0.5 }),
  black: M(0x2b2d30, { roughness: 0.4 }),
  white: M(0xf2f0ea),
  board: new THREE.MeshStandardMaterial({ map: texBoard, roughness: 0.9 }),
  locker: M(0xc8ccd0),
  steel: M(0xd6d3c8),
  navy: M(0x3c4a63),
  books: new THREE.MeshStandardMaterial({ map: texBooks, roughness: 0.9 }),
  shoes: new THREE.MeshStandardMaterial({ map: texShoes, roughness: 0.9 }),
  screen: M(0xfafafa, { emissive: 0x222222 }),
  green: M(0x2f7d5b),
  sofa: M(0x7b5a4a),
  pink: M(0xe7b8c2),
  blue: M(0xb8cce7),
  kiln: M(0x7c7f82, { metalness: 0.3 }),
  mat: M(0x3d6fb0),
};

// ---------- 家具の形（床に置いたとき、正面が -x 向き） ----------
const b = (w, h, d, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g; };
const legs = (w, d, h, t = 0.03) => [
  b(t, h, t, -w / 2 + t, 0, -d / 2 + t), b(t, h, t, w / 2 - t, 0, -d / 2 + t),
  b(t, h, t, -w / 2 + t, 0, d / 2 - t), b(t, h, t, w / 2 - t, 0, d / 2 - t),
];
const merge = (list) => mergeGeometries(list);

const SHAPES = {
  desk: [
    [MAT.wood, merge([b(0.45, 0.03, 0.6, 0, 0.68)])],
    [MAT.metal, merge([...legs(0.45, 0.6, 0.68), b(0.4, 0.1, 0.55, 0, 0.56)])],
  ],
  chair: [
    [MAT.wood, merge([b(0.38, 0.03, 0.38, 0, 0.4), b(0.03, 0.3, 0.36, 0.18, 0.5)])],
    [MAT.metal, merge(legs(0.38, 0.38, 0.4))],
  ],
  teacherDesk: [[MAT.darkWood, merge([b(0.6, 0.75, 1.2)])]],
  podium: [[MAT.wood, merge([b(1.0, 0.18, 5.0)])]],
  blackboard: [
    [MAT.board, merge([b(0.04, 1.2, 4.2, 0, 0.8)])],
    [MAT.darkWood, merge([b(0.1, 0.04, 4.3, 0.03, 0.78), b(0.06, 0.06, 4.3, 0, 2.0)])],
  ],
  screenBoard: [[MAT.screen, merge([b(0.04, 1.6, 3.6, 0, 0.9)])]],
  locker: [[MAT.locker, merge([b(0.45, 1.05, 0.95)])]],
  shoeRack: [[MAT.shoes, merge([b(0.4, 1.7, 1.8)])]],
  labBench: [
    [MAT.black, merge([b(1.25, 0.05, 2.2, 0, 0.85)])],
    [MAT.white, merge([b(1.15, 0.85, 2.1)])],
    [MAT.metal, merge([b(0.35, 0.02, 0.35, 0, 0.9, 0.7), b(0.03, 0.3, 0.03, 0, 0.9, 0.85)])],
  ],
  cookBench: [
    [MAT.steel, merge([b(1.25, 0.05, 2.2, 0, 0.82)])],
    [MAT.white, merge([b(1.15, 0.82, 2.1)])],
    [MAT.black, merge([b(0.45, 0.04, 0.5, 0, 0.87, -0.65)])],
    [MAT.metal, merge([b(0.4, 0.02, 0.45, 0, 0.87, 0.6)])],
  ],
  stool: [[MAT.metal, merge([b(0.3, 0.6, 0.3)])]],
  officeDesk: [
    [MAT.steel, merge([b(0.7, 0.72, 1.1)])],
  ],
  officeChair: [[MAT.navy, merge([b(0.45, 0.45, 0.45), b(0.08, 0.45, 0.45, 0.22, 0.45)])]],
  monitor: [[MAT.black, merge([b(0.04, 0.32, 0.5, 0, 0.78), b(0.15, 0.05, 0.15, 0.05, 0.73)])]],
  pc: [[MAT.black, merge([b(0.04, 0.3, 0.45, 0, 0.75), b(0.2, 0.02, 0.4, -0.15, 0.73)])]],
  shelf: [[MAT.books, merge([b(0.35, 1.8, 0.9)])]],
  lowShelf: [[MAT.books, merge([b(0.35, 1.2, 0.9)])]],
  table: [
    [MAT.wood, merge([b(0.9, 0.04, 1.8, 0, 0.7)])],
    [MAT.metal, merge(legs(0.9, 1.8, 0.7, 0.05))],
  ],
  bigTable: [
    [MAT.wood, merge([b(1.2, 0.05, 2.4, 0, 0.72)])],
    [MAT.darkWood, merge(legs(1.2, 2.4, 0.72, 0.08))],
  ],
  bed: [
    [MAT.white, merge([b(1.95, 0.5, 0.95), b(0.35, 0.1, 0.6, -0.7, 0.5)])],
    [MAT.blue, merge([b(1.2, 0.06, 0.97, 0.3, 0.5)])],
    [MAT.metal, merge([b(0.04, 0.9, 0.95, -0.98)])],
  ],
  curtain: [[MAT.pink, merge([b(0.02, 1.8, 2.0)])]],
  piano: [[MAT.black, merge([b(1.5, 0.95, 1.5, 0, 0.05), b(0.5, 0.08, 1.4, 0.5, 1.0)])]],
  kiln: [[MAT.kiln, merge([b(1.0, 1.3, 1.0)])]],
  sofa: [[MAT.sofa, merge([b(0.8, 0.42, 1.9), b(0.2, 0.4, 1.9, 0.3, 0.42)])]],
  lowTable: [[MAT.darkWood, merge([b(0.7, 0.4, 1.2)])]],
  counter: [[MAT.wood, merge([b(0.6, 1.0, 3.0)])]],
  pingpong: [
    [MAT.green, merge([b(1.525, 0.04, 2.74, 0, 0.72)])],
    [MAT.white, merge([b(1.7, 0.15, 0.02, 0, 0.76)])],
    [MAT.metal, merge(legs(1.4, 2.5, 0.72, 0.06))],
  ],
  hoop: [
    [MAT.white, merge([b(0.05, 1.05, 1.8, 0, 2.9)])],
    [MAT.metal, merge([b(0.2, 3.0, 0.2, -1.2, 0), b(1.2, 0.1, 0.1, -0.6, 3.2)])],
  ],
  stage: [[MAT.darkWood, merge([b(1, 1.0, 1)])]], // あとで大きさを変える
  stall: [[MAT.blue, merge([b(1.4, 1.9, 0.03, 0, 0, 0.45), b(0.03, 1.9, 0.9, -0.7)])]],
  sink: [[MAT.white, merge([b(0.5, 0.85, 1.8)])]],
  weightBench: [[MAT.black, merge([b(1.2, 0.45, 0.35), b(0.06, 1.5, 1.4, 0.4)])]],
  mat: [[MAT.mat, merge([b(2.0, 0.05, 1.0)])]],
  sewing: [[MAT.white, merge([b(0.2, 0.3, 0.4, 0, 0.72)])]],
  cabinet: [[MAT.locker, merge([b(0.45, 1.8, 0.9)])]],
};

// ---------- 置き方 ----------
// out には {t: 種類, x, z, rot, y?, sx?, sz?} を入れる。rot=0 は「正面が -x（左）」
function grid(out, t, x0, x1, z0, z1, nx, nz, rot = 0, y = 0) {
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    out.push({ t, x: x0 + (x1 - x0) * (nx === 1 ? 0.5 : i / (nx - 1)), z: z0 + (z1 - z0) * (nz === 1 ? 0.5 : j / (nz - 1)), rot, y });
  }
}
const along = (out, t, x, z0, z1, step, rot = 0) => {
  const n = Math.max(1, Math.floor((z1 - z0) / step));
  for (let i = 0; i < n; i++) out.push({ t, x, z: z0 + step * (i + 0.5) + ((z1 - z0) - n * step) / 2, rot });
};
const alongX = (out, t, z, x0, x1, step, rot = Math.PI / 2) => {
  const n = Math.max(1, Math.floor((x1 - x0) / step));
  for (let i = 0; i < n; i++) out.push({ t, x: x0 + step * (i + 0.5) + ((x1 - x0) - n * step) / 2, z, rot });
};

// 普通教室：前（-x側）に黒板と教卓、後ろにロッカー、机は 6列 × 7行
function classroom(out, R, { cols = 6, rows = 7 } = {}) {
  const { x0, x1, z0, z1 } = R;
  out.push({ t: "blackboard", x: x0 + 0.12, z: (z0 + z1) / 2, rot: 0 });
  out.push({ t: "podium", x: x0 + 0.65, z: (z0 + z1) / 2, rot: 0 });
  out.push({ t: "teacherDesk", x: x0 + 1.35, z: (z0 + z1) / 2, rot: 0, y: 0.18 });
  along(out, "locker", x1 - 0.35, z0 + 0.3, z1 - 0.3, 0.95, Math.PI);
  const dx0 = x0 + 2.6, dx1 = x1 - 1.6;
  const dz0 = z0 + 0.7, dz1 = z1 - 0.7;
  const rr = Math.max(2, Math.min(rows, Math.floor((dx1 - dx0) / 0.9) + 1));
  const cc = Math.max(2, Math.min(cols, Math.floor((dz1 - dz0) / 0.75) + 1));
  for (let i = 0; i < rr; i++) for (let j = 0; j < cc; j++) {
    const x = dx0 + (dx1 - dx0) * (i / (rr - 1));
    const z = dz0 + (dz1 - dz0) * (j / (cc - 1));
    out.push({ t: "desk", x, z, rot: 0 });
    out.push({ t: "chair", x: x + 0.42, z, rot: 0 });
  }
}

function lab(out, R, bench = "labBench") {
  const { x0, x1, z0, z1 } = R;
  out.push({ t: "blackboard", x: x0 + 0.12, z: (z0 + z1) / 2, rot: 0 });
  out.push({ t: "teacherDesk", x: x0 + 1.1, z: (z0 + z1) / 2, rot: 0 });
  const nx = Math.max(1, Math.floor((x1 - x0 - 2.5) / 2.4));
  const nz = Math.max(1, Math.floor((z1 - z0 - 1.0) / 2.9));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = x0 + 2.8 + (i + 0.5) * ((x1 - x0 - 3.2) / nx);
    const z = z0 + 0.5 + (j + 0.5) * ((z1 - z0 - 1.0) / nz);
    out.push({ t: bench, x, z, rot: 0 });
    for (const s of [-1, 1]) for (const k of [-0.6, 0.6]) out.push({ t: "stool", x: x + s * 0.9, z: z + k, rot: 0 });
  }
}

function office(out, R, perIsland = 6) {
  const { x0, x1, z0, z1 } = R;
  // 机を向かい合わせにした「島」をならべる
  const islandsX = Math.max(1, Math.floor((x1 - x0 - 1) / 3.4));
  const islandsZ = Math.max(1, Math.floor((z1 - z0 - 1) / 3.6));
  const half = perIsland / 2;
  for (let i = 0; i < islandsX; i++) for (let j = 0; j < islandsZ; j++) {
    const cx = x0 + (i + 0.5) * ((x1 - x0) / islandsX);
    const cz = z0 + (j + 0.5) * ((z1 - z0) / islandsZ);
    for (let k = 0; k < half; k++) {
      const x = cx - (half - 1) * 0.55 + k * 1.1;
      for (const s of [-1, 1]) {
        out.push({ t: "officeDesk", x, z: cz + s * 0.36, rot: Math.PI / 2 });
        out.push({ t: "monitor", x, z: cz + s * 0.2, rot: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
        out.push({ t: "officeChair", x, z: cz + s * 1.15, rot: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
      }
    }
  }
}

function meeting(out, R) {
  const { x0, x1, z0, z1 } = R;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const n = Math.max(1, Math.floor((x1 - x0 - 2.2) / 1.85));
  for (let i = 0; i < n; i++) {
    const x = cx - ((n - 1) * 1.85) / 2 + i * 1.85;
    out.push({ t: "table", x, z: cz, rot: Math.PI / 2 });
    for (const s of [-1, 1]) for (const k of [-0.45, 0.45]) out.push({ t: "officeChair", x: x + k, z: cz + s * 0.85, rot: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
}

function library(out, R) {
  const { x0, x1, z0, z1 } = R;
  alongX(out, "shelf", z0 + 0.25, x0 + 0.5, x1 - 0.5, 0.92, Math.PI / 2);
  along(out, "shelf", x0 + 0.25, z0 + 1.0, z1 - 0.5, 0.92, 0);
  // 低い本棚の列
  for (let i = 0; i < 3; i++) alongX(out, "lowShelf", z0 + 2.3 + i * 1.6, x0 + 1.5, x0 + (x1 - x0) * 0.45, 0.92, Math.PI / 2);
  // 閲覧テーブル
  grid(out, "bigTable", x0 + (x1 - x0) * 0.58, x1 - 2.0, z0 + 2.6, z1 - 1.6, 3, 2, Math.PI / 2);
  for (const o of out.filter((p) => p.t === "bigTable" && p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1)) {
    for (const s of [-1, 1]) for (const k of [-0.7, 0, 0.7]) out.push({ t: "chair", x: o.x + k, z: o.z + s * 0.9, rot: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
}

function music(out, R) {
  const { x0, x1, z0, z1 } = R;
  out.push({ t: "blackboard", x: x0 + 0.12, z: (z0 + z1) / 2, rot: 0 });
  out.push({ t: "piano", x: x0 + 1.6, z: z0 + 1.6, rot: 0 });
  const cx = x0 + 1.2, cz = (z0 + z1) / 2;
  // 扇形にならべた椅子
  for (let ring = 0; ring < 5; ring++) {
    const rad = 3.0 + ring * 1.0;
    const n = 7 + ring * 2;
    for (let k = 0; k < n; k++) {
      const a = -0.95 + (1.9 * k) / (n - 1);
      const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
      if (x > x1 - 0.5 || z < z0 + 0.4 || z > z1 - 0.4) continue;
      out.push({ t: "chair", x, z, rot: -a });
    }
  }
}

function theater(out, R) {
  const { x0, x1, z0, z1 } = R;
  out.push({ t: "screenBoard", x: x0 + 0.12, z: (z0 + z1) / 2, rot: 0 });
  out.push({ t: "teacherDesk", x: x0 + 1.2, z: z0 + 1.0, rot: 0 });
  const rows = Math.floor((x1 - x0 - 3) / 0.9);
  for (let i = 0; i < rows; i++) {
    const x = x0 + 2.8 + i * 0.9;
    for (let z = z0 + 0.8; z < z1 - 0.6; z += 0.55) out.push({ t: "chair", x, z, rot: 0 });
  }
}

function computers(out, R) {
  const { x0, x1, z0, z1 } = R;
  out.push({ t: "screenBoard", x: x0 + 0.12, z: (z0 + z1) / 2, rot: 0 });
  out.push({ t: "teacherDesk", x: x0 + 1.2, z: (z0 + z1) / 2, rot: 0 });
  for (let x = x0 + 2.6; x < x1 - 0.8; x += 1.5) {
    for (let z = z0 + 0.6; z < z1 - 0.5; z += 0.75) {
      out.push({ t: "desk", x, z, rot: 0 });
      out.push({ t: "pc", x: x - 0.1, z, rot: 0 });
      out.push({ t: "officeChair", x: x + 0.55, z, rot: 0 });
    }
  }
}

function artroom(out, R, kiln = false) {
  const { x0, x1, z0, z1 } = R;
  out.push({ t: "blackboard", x: x0 + 0.12, z: (z0 + z1) / 2, rot: 0 });
  const nx = Math.max(1, Math.floor((x1 - x0 - 1.5) / 2.6));
  const nz = Math.max(1, Math.floor((z1 - z0 - 1) / 3.2));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = x0 + 1.6 + (i + 0.5) * ((x1 - x0 - 2) / nx), z = z0 + 0.5 + (j + 0.5) * ((z1 - z0 - 1) / nz);
    out.push({ t: "bigTable", x, z, rot: 0 });
    for (const s of [-1, 1]) for (const k of [-0.7, 0, 0.7]) out.push({ t: "stool", x: x + s * 0.85, z: z + k, rot: 0 });
  }
  along(out, "cabinet", x1 - 0.3, z0 + 0.5, z1 - 0.5, 0.95, Math.PI);
  if (kiln) out.push({ t: "kiln", x: (x0 + x1) / 2, z: (z0 + z1) / 2, rot: 0 });
}

function prep(out, R) {
  const { x0, x1, z0, z1 } = R;
  if (x1 - x0 < 2.5 && z1 - z0 < 2.5) return;
  along(out, "cabinet", x1 - 0.3, z0 + 0.3, z1 - 0.3, 0.95, Math.PI);
  const n = Math.max(1, Math.min(4, Math.floor((z1 - z0 - 1) / 1.2)));
  for (let i = 0; i < n; i++) {
    const z = z0 + 0.8 + i * 1.2;
    out.push({ t: "officeDesk", x: x0 + 0.7, z, rot: 0 });
    out.push({ t: "officeChair", x: x0 + 1.4, z, rot: 0 });
  }
}

function toilet(out, R) {
  const { x0, x1, z0, z1 } = R;
  if (z1 - z0 >= x1 - x0) {
    for (let z = z0 + 0.6; z < z1 - 1.2; z += 1.0) out.push({ t: "stall", x: x1 - 0.75, z, rot: Math.PI, y: 0.1 });
    out.push({ t: "sink", x: x0 + 0.35, z: (z0 + z1) / 2, rot: 0 });
  } else {
    for (let x = x0 + 0.6; x < x1 - 0.6; x += 1.0) out.push({ t: "stall", x, z: z1 - 0.75, rot: -Math.PI / 2, y: 0.1 });
  }
}

function infirmary(out, R) {
  const { x0, x1, z0, z1 } = R;
  const n = Math.min(3, Math.floor((x1 - x0 - 1) / 1.4));
  for (let i = 0; i < n; i++) {
    const x = x1 - 0.8 - i * 1.4;
    out.push({ t: "bed", x, z: z0 + 1.1, rot: Math.PI / 2 });
    out.push({ t: "curtain", x: x - 0.7, z: z0 + 1.1, rot: 0 });
  }
  out.push({ t: "officeDesk", x: x0 + 0.6, z: z1 - 1.0, rot: 0 });
  out.push({ t: "officeChair", x: x0 + 1.3, z: z1 - 1.0, rot: 0 });
  out.push({ t: "table", x: (x0 + x1) / 2, z: z1 - 1.2, rot: 0 });
}

function reception(out, R) {
  const { x0, x1, z0, z1 } = R;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  out.push({ t: "lowTable", x: cx, z: cz, rot: Math.PI / 2 });
  out.push({ t: "sofa", x: cx, z: cz - 1.1, rot: Math.PI / 2 });
  out.push({ t: "sofa", x: cx, z: cz + 1.1, rot: -Math.PI / 2 });
}

function principal(out, R) {
  const { x0, x1, z0, z1 } = R;
  out.push({ t: "teacherDesk", x: (x0 + x1) / 2, z: z1 - 0.9, rot: Math.PI / 2 });
  out.push({ t: "officeChair", x: (x0 + x1) / 2, z: z1 - 0.3, rot: -Math.PI / 2 });
  reception(out, { x0, x1, z0, z1: z1 - 1.8 });
}

function entrance(out, R) {
  const { x0, x1, z0, z1 } = R;
  // 下駄箱をならべる
  for (let x = x0 + 1.0; x < x1 - 0.8; x += 1.4) {
    for (let z = z0 + 1.2; z < z1 - 1.0; z += 1.9) out.push({ t: "shoeRack", x, z, rot: 0 });
  }
}

function pingpong(out, R) {
  const { x0, x1, z0, z1 } = R;
  const nx = Math.max(1, Math.floor((x1 - x0) / 3.8));
  const nz = Math.max(1, Math.floor((z1 - z0) / 4.5));
  grid(out, "pingpong", x0 + 2, x1 - 2, z0 + 2.3, z1 - 2.3, nx, nz, 0);
}

function weights(out, R) {
  const { x0, x1, z0, z1 } = R;
  for (let x = x0 + 1.2; x < x1 - 1; x += 2.2) out.push({ t: "weightBench", x, z: (z0 + z1) / 2, rot: Math.PI / 2 });
}

function shop(out, R) {
  const { x0, x1, z0, z1 } = R;
  out.push({ t: "counter", x: (x0 + x1) / 2, z: (z0 + z1) / 2, rot: Math.PI / 2 });
}

function sewing(out, R) {
  lab(out, R, "bigTable");
  for (const o of out.filter((p) => p.t === "bigTable" && p.x >= R.x0 && p.x <= R.x1 && p.z >= R.z0 && p.z <= R.z1)) {
    for (const k of [-0.7, 0.7]) out.push({ t: "sewing", x: o.x, z: o.z + k, rot: 0 });
  }
}

function gym(out, R) {
  const { x0, x1, z0, z1 } = R;
  const cx = (x0 + x1) / 2;
  out.push({ t: "hoop", x: cx, z: z0 + 1.3, rot: -Math.PI / 2 });
  out.push({ t: "hoop", x: cx, z: z1 - 1.3, rot: Math.PI / 2 });
}

// 部屋の名前 → 置き方
const LAYOUTS = [
  [/年\d+組/, classroom],
  [/選択|オーラル|社会科教室/, (o, R) => classroom(o, R, { cols: 5, rows: 6 })],
  [/STUDY HALL/, (o, R) => grid(o, "bigTable", R.x0 + 1.4, R.x1 - 1.4, R.z0 + 1.5, R.z1 - 1.5, 2, 2)],
  [/化学実験室|物理実験室|生物実験室/, (o, R) => lab(o, R)],
  [/調理室/, (o, R) => lab(o, R, "cookBench")],
  [/被服室/, sewing],
  [/コンピューター/, computers],
  [/視聴覚/, theater],
  [/音楽室/, music],
  [/美術教室/, (o, R) => artroom(o, R)],
  [/工芸教室/, (o, R) => artroom(o, R)],
  [/^窯$/, (o, R) => o.push({ t: "kiln", x: (R.x0 + R.x1) / 2, z: (R.z0 + R.z1) / 2, rot: 0 })],
  [/図書室/, library],
  [/職員室|事務室/, (o, R) => office(o, R)],
  [/会議室/, meeting],
  [/校長室/, principal],
  [/応接室/, reception],
  [/保健室/, infirmary],
  [/売店/, shop],
  [/昇降口/, entrance],
  [/準備室|印刷室|放送室|生徒指導室|生徒会室|技能員室|進路資料室|整理室|資料室/, prep],
  [/トイレ/, toilet],
  [/卓球場/, pingpong],
  [/ウエイトルーム/, weights],
  [/^体育館$/, gym],
  [/武道場/, (o, R) => grid(o, "mat", R.x0 + 2, R.x1 - 2, R.z1 - 0.8, R.z1 - 0.8, 6, 1, Math.PI / 2, 0)],
];

// 床の模様
export function floorStyle(name) {
  if (/^体育館$/.test(name)) return "gym";
  if (/武道場|作法室/.test(name)) return "tatami";
  if (/トイレ|シャワー|調理室|実験室|昇降口|玄関|ホール/.test(name)) return "tile";
  return "wood";
}

// rooms: その階の部屋の配列（cx, cz, w, d, name を持つ）, y: 床の高さ
export function buildFurniture(rooms, y) {
  const items = [];
  for (const r of rooms) {
    const fn = LAYOUTS.find(([re]) => re.test(r.name));
    if (!fn) continue;
    const R = { x0: r.cx - r.w / 2 + 0.2, x1: r.cx + r.w / 2 - 0.2, z0: r.cz - r.d / 2 + 0.2, z1: r.cz + r.d / 2 - 0.2 };
    const list = [];
    fn[1](list, R);
    items.push(...list);
  }
  const group = new THREE.Group();
  const byType = {};
  for (const it of items) (byType[it.t] ||= []).push(it);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (const [t, list] of Object.entries(byType)) {
    for (const [mat, geo] of SHAPES[t]) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        p.set(it.x, y + 0.15 + (it.y || 0), it.z);
        q.setFromAxisAngle(up, it.rot || 0);
        m4.compose(p, q, s);
        im.setMatrixAt(i, m4);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      group.add(im);
    }
  }
  return group;
}
