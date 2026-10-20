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

// 黒板（チョークの字と、右はしの日付・日直）
const texBoard = canvasTex(512, 160, (g, w, h) => {
  g.fillStyle = "#2f5a45"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; g.fillRect(Math.random() * w, Math.random() * h, 3, 1); }
  g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    const y = 26 + i * 22;
    g.moveTo(24, y); g.lineTo(150 + Math.random() * 180, y + Math.random() * 3);
    g.stroke();
  }
  g.fillStyle = "rgba(255,255,255,0.8)";
  g.font = "bold 18px sans-serif";
  g.fillText("10月20日（火）", w - 150, 30);
  g.fillText("日直", w - 150, 70);
  g.strokeStyle = "rgba(255,255,255,0.5)"; g.strokeRect(w - 156, 50, 130, 70);
  g.fillStyle = "rgba(240,220,120,0.8)"; g.fillText("連絡", 24, h - 14);
});

// 自動販売機の正面（飲み物がならんだ窓）
const texVend = canvasTex(64, 96, (g, w, h) => {
  g.fillStyle = "#e9eef2"; g.fillRect(0, 0, w, h);
  const cols = ["#d33", "#36c", "#3a3", "#fa0", "#eee", "#a5f"];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) { g.fillStyle = cols[(r * 5 + c) % cols.length]; g.fillRect(4 + c * 12, 6 + r * 16, 8, 12); }
  g.fillStyle = "#333"; g.fillRect(6, 74, 52, 14);
});

// 電子黒板の画面（授業のスライド）
const texEboard = canvasTex(256, 150, (g, w, h) => {
  g.fillStyle = "#f7f9fc"; g.fillRect(0, 0, w, h);
  g.fillStyle = "#2d6cb5"; g.fillRect(0, 0, w, 26);
  g.fillStyle = "#fff"; g.font = "bold 16px sans-serif"; g.fillText("今日の授業", 10, 19);
  g.fillStyle = "#555";
  for (let i = 0; i < 4; i++) g.fillRect(14, 42 + i * 20, 120 + Math.random() * 80, 6);
  g.fillStyle = "#f2b33d"; g.fillRect(180, 40, 60, 60);
  g.fillStyle = "#4caf7a"; g.fillRect(190, 110, 50, 26);
});

// 掲示板（コルクにプリント）
const texCork = canvasTex(256, 96, (g, w, h) => {
  g.fillStyle = "#b98a57"; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(80,50,20,${Math.random() * 0.15})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  const papers = ["#ffffff", "#fff6c9", "#e8f2ff", "#ffe3e3", "#ffffff"];
  for (let i = 0; i < 9; i++) {
    const x = 8 + (i % 5) * 50 + Math.random() * 6, y = 6 + Math.floor(i / 5) * 46 + Math.random() * 4;
    g.fillStyle = papers[i % papers.length]; g.fillRect(x, y, 38, 36);
    g.fillStyle = "rgba(0,0,0,0.35)";
    for (let k = 0; k < 5; k++) g.fillRect(x + 4, y + 6 + k * 6, 20 + Math.random() * 10, 2);
    g.fillStyle = "#d33"; g.fillRect(x + 17, y + 1, 4, 4);
  }
});

// 時計の文字盤
const texClock = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h);
  g.strokeStyle = "#222"; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#222";
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillRect(64 + Math.cos(a) * 48 - 2, 64 + Math.sin(a) * 48 - 2, 4, 4); }
  g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 26); g.moveTo(64, 64); g.lineTo(92, 70); g.stroke();
});

// 引き戸（木の戸に、上の方にガラス）
const texDoor = canvasTex(64, 128, (g, w, h) => {
  g.fillStyle = "#a0764c"; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(0,0,0,0.12)"; for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 1, h);
  g.fillStyle = "#9cc3da"; g.fillRect(10, 12, w - 20, 44);
  g.strokeStyle = "#6b4c2e"; g.lineWidth = 3; g.strokeRect(10, 12, w - 20, 44);
  g.fillStyle = "#5a3e24"; g.fillRect(w - 12, 70, 4, 16);
});

// カーテン（クリーム色の布のひだ）
const texCurtain = canvasTex(64, 64, (g, w, h) => {
  for (let x = 0; x < w; x++) {
    const v = 225 + Math.sin(x / 3) * 18;
    g.fillStyle = `rgb(${v},${v - 8},${v - 30})`; g.fillRect(x, 0, 1, h);
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
  cork: new THREE.MeshStandardMaterial({ map: texCork, roughness: 0.95 }),
  clock: new THREE.MeshStandardMaterial({ map: texClock, roughness: 0.5 }),
  door: new THREE.MeshStandardMaterial({ map: texDoor, roughness: 0.7 }),
  curtain: new THREE.MeshStandardMaterial({ map: texCurtain, roughness: 1, side: THREE.DoubleSide }),
  bag: M(0xffffff, { roughness: 0.9 }),      // 色は1つずつ変える
  paper: M(0xf5f3ec, { roughness: 0.9 }),
  mirror: M(0xcfd8de, { metalness: 0.9, roughness: 0.1 }),
  red: M(0x9e1f2c, { roughness: 0.9 }),
  vendFace: new THREE.MeshStandardMaterial({ map: texVend, roughness: 0.3, emissive: 0xffffff, emissiveMap: texVend, emissiveIntensity: 0.35 }),
  screenOn: new THREE.MeshStandardMaterial({ map: texEboard, roughness: 0.3, emissive: 0xffffff, emissiveMap: texEboard, emissiveIntensity: 0.55 }),
  gray: M(0x8e98a2),
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
  podium: [[MAT.wood, merge([b(1.0, 0.18, 4.4)])]],
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
  // 教室の小物
  bulletin: [[MAT.cork, merge([b(0.03, 0.9, 2.4, 0, 1.25)])], [MAT.darkWood, merge([b(0.05, 0.05, 2.5, 0, 2.15), b(0.05, 0.05, 2.5, 0, 1.2)])]],
  clock: [[MAT.clock, (() => { const g = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24); g.rotateZ(-Math.PI / 2); g.translate(0.03, 2.45, 0); return g; })()]],
  tv: [[MAT.black, merge([b(0.08, 0.62, 1.05, 0.06, 1.75), b(0.05, 0.3, 0.1, 0.02, 2.35)])]],
  // 大型の電子黒板（キャスター付きのスタンドに、横長の画面）。画面は +x（生徒）向き
  eboard: [
    [MAT.screenOn, merge([b(0.04, 0.95, 1.62, 0.06, 0.85)])],
    [MAT.black, merge([b(0.1, 1.03, 1.7, 0, 0.81), b(0.08, 0.85, 0.08, 0, 0, -0.45), b(0.08, 0.85, 0.08, 0, 0, 0.45), b(0.6, 0.06, 1.1, 0, 0.05)])],
  ],
  door: [[MAT.door, merge([b(0.9, 1.95, 0.06)])], [MAT.darkWood, merge([b(1.0, 0.06, 0.1, 0, 1.95)])]],
  curtainPanel: [[MAT.curtain, merge([b(0.7, 2.05, 0.05, 0, 0.3)])]],
  cleanLocker: [[MAT.gray, merge([b(0.45, 1.8, 0.6)])]],
  bag: [[MAT.bag, merge([b(0.1, 0.3, 0.34, 0, 0.32)])]],
  books: [[MAT.paper, merge([b(0.21, 0.035, 0.3, 0, 0.71)])]],
  laptop: [[MAT.black, merge([b(0.25, 0.02, 0.34, 0, 0.76), b(0.02, 0.22, 0.34, -0.12, 0.77)])]],
  urinal: [[MAT.white, merge([b(0.32, 0.65, 0.38, 0, 0.4)])]],
  mirror: [[MAT.mirror, merge([b(0.02, 0.8, 1.6, 0, 1.15)])]],
  stageCurtain: [[MAT.red, merge([b(0.2, 3.2, 1.0)])]],
  lectern: [[MAT.darkWood, merge([b(0.5, 1.1, 0.7)])]],
  // 自動販売機（正面が -x）
  vending: [[MAT.white, merge([b(0.75, 1.83, 1.0)])], [MAT.vendFace, merge([b(0.03, 1.2, 0.85, -0.38, 0.5)])], [MAT.red, merge([b(0.04, 0.25, 1.0, -0.37, 1.6)])]],
  // 長机（長さは1mの形を len 倍にのばす）と、跳ね上げ椅子（座面が上がった形）
  longDesk: [[MAT.wood, merge([b(0.45, 0.04, 1, 0, 0.7)])], [MAT.metal, merge([b(0.04, 0.7, 0.04, 0.18, 0, -0.48), b(0.04, 0.7, 0.04, 0.18, 0, 0.48), b(0.03, 0.3, 1, 0.2, 0.35)])]],
  flipSeat: [[MAT.navy, merge([b(0.08, 0.45, 0.44, 0.2, 0.45), b(0.05, 0.42, 0.42, 0.05, 0.35)])], [MAT.metal, merge([b(0.05, 0.42, 0.05, 0.15, 0, -0.22), b(0.05, 0.42, 0.05, 0.15, 0, 0.22)])]],
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
// 普通教室は40人（6列×7行から、いちばん後ろの両はしの2席を除く）
// cols：横の列の数、rows：縦の列の数、back：後ろに空けるスペース（部屋の奥行きに対する割合）
function classroom(out, R, { cols = 6, rows = 7, seats = 40, eboard = true, back = 0 } = {}) {
  const { x0, x1, z0, z1 } = R;
  out.push({ t: "blackboard", x: x0 + 0.12, z: (z0 + z1) / 2, rot: 0 });
  out.push({ t: "podium", x: x0 + 0.65, z: (z0 + z1) / 2, rot: 0 });
  out.push({ t: "teacherDesk", x: x0 + 1.35, z: (z0 + z1) / 2, rot: 0, y: 0.18 });
  // 後ろのロッカー、廊下側（北）の角に掃除用具入れ
  along(out, "locker", x1 - 0.35, z0 + 0.9, z1 - 0.3, 0.95, Math.PI);
  out.push({ t: "cleanLocker", x: x1 - 0.35, z: z0 + 0.45, rot: 0 });
  // 黒板の上の時計、左前（窓側の前）の大型の電子黒板、後ろの掲示板、教卓のパソコン
  out.push({ t: "clock", x: x0 + 0.08, z: (z0 + z1) / 2, rot: 0 });
  // 電子黒板は教壇（段）の窓側のはしの外に置く
  if (eboard) out.push({ t: "eboard", x: x0 + 0.5, z: Math.max((z0 + z1) / 2 + 2.2 + 0.9, z1 - 0.9), rot: 0 });
  out.push({ t: "bulletin", x: x1 + 0.12, z: (z0 + z1) / 2, rot: 0 });
  out.push({ t: "laptop", x: x0 + 1.35, z: (z0 + z1) / 2 + 0.2, rot: 0, y: 0.18 });
  // 廊下側（北）の前と後ろの引き戸
  out.push({ t: "door", x: x0 + 1.0, z: z0 - 0.17, rot: 0 });
  out.push({ t: "door", x: x1 - 1.0, z: z0 - 0.17, rot: 0 });
  // 窓側（南）のカーテン（柱のところにまとめてある）
  for (let x = x0 + 0.5; x < x1 - 0.3; x += 2.25) out.push({ t: "curtainPanel", x, z: z1 + 0.1, rot: 0 });
  const dx0 = x0 + 2.2, dx1 = x1 - 1.3 - (x1 - x0) * back;
  const dz0 = z0 + 0.7, dz1 = z1 - 0.7;
  const rr = rows, cc = cols;
  const skip = rr * cc - seats; // いちばん後ろの列の両はしから空ける
  for (let i = 0; i < rr; i++) for (let j = 0; j < cc; j++) {
    if (i === rr - 1 && skip > 0 && (j < Math.ceil(skip / 2) || j >= cc - Math.floor(skip / 2))) continue;
    const x = dx0 + Math.min(0.95, (dx1 - dx0) / Math.max(1, rr - 1)) * i;
    const z = dz0 + (dz1 - dz0) * (j / (cc - 1));
    // 椅子は少しずつずらして、使っている感じを出す
    const k = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453, rnd = k - Math.floor(k);
    out.push({ t: "desk", x, z, rot: 0 });
    out.push({ t: "chair", x: x + 0.42 + rnd * 0.12, z: z + (rnd - 0.5) * 0.08, rot: (rnd - 0.5) * 0.3 });
    if (rnd < 0.55) out.push({ t: "bag", x: x + 0.05, z: z + 0.33, rot: 0, col: BAG_COLORS[Math.floor(rnd * 97) % BAG_COLORS.length] });
    if (rnd > 0.35) out.push({ t: "books", x: x - 0.02, z: z + (rnd - 0.5) * 0.15, rot: (rnd - 0.5) * 0.4 });
  }
}
const BAG_COLORS = [0x1f2a44, 0x2b2b2b, 0x3a5a8c, 0x6b2e2e, 0x2f4f3f, 0x444c56];

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

// 視聴覚教室：前方の半分は広いスペース。後ろ半分に大学のような長机と跳ね上げ椅子が5列
function theater(out, R) {
  const { x0, x1, z0, z1 } = R;
  const cz = (z0 + z1) / 2;
  out.push({ t: "screenBoard", x: x0 + 0.12, z: cz, rot: 0 });
  out.push({ t: "lectern", x: x0 + 1.6, z: z0 + 1.4, rot: 0 });
  const xs = x0 + (x1 - x0) * 0.5, xe = x1 - 0.9;
  for (let i = 0; i < 5; i++) {
    const x = xs + ((xe - xs) * i) / 4;
    // 通路をはさんで左右2つの長机
    for (const [za, zb] of [[z0 + 0.5, cz - 0.6], [cz + 0.6, z1 - 0.5]]) {
      out.push({ t: "longDesk", x, z: (za + zb) / 2, rot: 0, len: zb - za });
      for (let z = za + 0.35; z < zb - 0.2; z += 0.6) out.push({ t: "flipSeat", x: x + 0.5, z, rot: 0 });
    }
  }
}

// パソコン教室：横6列×縦7列。前に先生のパソコンと、その横の大きめの机
function computers(out, R) {
  const { x0, x1, z0, z1 } = R;
  const cz = (z0 + z1) / 2;
  out.push({ t: "screenBoard", x: x0 + 0.12, z: cz, rot: 0 });
  out.push({ t: "teacherDesk", x: x0 + 1.2, z: cz - 0.7, rot: 0 });
  out.push({ t: "pc", x: x0 + 1.05, z: cz - 0.7, rot: 0, y: 0.05 });
  out.push({ t: "officeChair", x: x0 + 1.9, z: cz - 0.7, rot: 0 });
  out.push({ t: "bigTable", x: x0 + 1.2, z: cz + 1.4, rot: 0 });
  const cols = 6, rows = 7;
  const dx0 = x0 + 3.0, dx1 = x1 - 0.9, dz0 = z0 + 0.6, dz1 = z1 - 0.6;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const x = dx0 + ((dx1 - dx0) * i) / (rows - 1), z = dz0 + ((dz1 - dz0) * j) / (cols - 1);
    out.push({ t: "desk", x, z, rot: 0 });
    out.push({ t: "pc", x: x - 0.1, z, rot: 0 });
    out.push({ t: "officeChair", x: x + 0.5, z, rot: 0 });
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
    out.push({ t: "mirror", x: x0 + 0.02, z: (z0 + z1) / 2, rot: 0 });
  } else {
    for (let x = x0 + 0.6; x < x1 - 0.6; x += 1.0) out.push({ t: "stall", x, z: z1 - 0.75, rot: -Math.PI / 2, y: 0.1 });
  }
}

// 小便器（男子トイレ。手洗いと反対側の壁に、ならべる）
function urinals(out, R) {
  const { x0, x1, z0, z1 } = R;
  if (z1 - z0 >= x1 - x0) for (let z = z1 - 0.6; z > z0 + 1.2 && z > z1 - 3.4; z -= 0.8) out.push({ t: "urinal", x: x0 + 0.25, z, rot: 0 });
}

// 体育館のステージ（赤い幕と演台）。正面は南（体育館の側）
function stage(out, R) {
  const { x0, x1, z0, z1 } = R;
  for (let x = x0 + 0.5; x < x0 + 3; x += 1) out.push({ t: "stageCurtain", x, z: z1 - 0.2, rot: Math.PI / 2, y: 0.85 });
  for (let x = x1 - 0.5; x > x1 - 3; x -= 1) out.push({ t: "stageCurtain", x, z: z1 - 0.2, rot: Math.PI / 2, y: 0.85 });
  out.push({ t: "lectern", x: (x0 + x1) / 2, z: z1 - 1.2, rot: 0, y: 0.85 });
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
  // 選択第1教室：横6列×縦5列、後ろに少しスペース。社会科教室：横6列×縦7列、後ろ3分の1が空いている
  [/選択第１教室|選択第1教室/, (o, R) => classroom(o, R, { cols: 6, rows: 5, seats: 30, eboard: false, back: 0.12 })],
  [/社会科教室/, (o, R) => classroom(o, R, { cols: 6, rows: 7, seats: 42, eboard: false, back: 0.33 })],
  [/選択|オーラル/, (o, R) => classroom(o, R, { cols: 5, rows: 6, seats: 30, eboard: false })],
  [/STUDY HALL/, (o, R) => grid(o, "bigTable", R.x0 + 1.4, R.x1 - 1.4, R.z0 + 1.5, R.z1 - 1.5, 2, 2)],
  [/化学実験室|物理実験室|生物実験室/, (o, R) => lab(o, R)],
  [/調理室/, (o, R) => lab(o, R, "cookBench")],
  [/被服室/, sewing],
  [/コンピューター/, computers],
  [/視聴覚/, theater],
  // 音楽室：横8列×縦5列の机、黒板は北側、前のすみにピアノ
  [/練習室/, (o, R) => { o.push({ t: "piano", x: (R.x0 + R.x1) / 2 - 0.5, z: (R.z0 + R.z1) / 2, rot: 0 }); o.push({ t: "chair", x: (R.x0 + R.x1) / 2 + 1.2, z: (R.z0 + R.z1) / 2, rot: 0 }); }],
  [/音楽室/, (o, R) => { classroom(o, R, { cols: 8, rows: 5, seats: 40, eboard: false }); o.push({ t: "piano", x: R.x0 + 1.6, z: R.z0 + 1.2, rot: 0 }); }],
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
  [/男子トイレ/, (o, R) => { toilet(o, R); urinals(o, R); }],
  [/トイレ/, toilet],
  [/ステージ/, stage],
  [/卓球場/, pingpong],
  [/ウエイトルーム/, weights],
  [/^体育館$/, gym],
  [/受付カウンター/, shop],
];

// 黒板・教卓を北側に置く特別教室（普通教室は図面の左＝西側が前）
const NORTH_FRONT = /選択|オーラル|社会科教室|実験室|視聴覚|音楽室|美術教室|工芸教室|STUDY HALL/;
// 先生の机・黒板が南側にある特別教室
const SOUTH_FRONT = /^$/;
// 東側を向いて授業を受ける部屋（被服室は西向きなので、ふつうの教室と同じ）
const EAST_FRONT = /調理室|コンピューター/;

// 床の模様
export function floorStyle(name) {
  if (/^体育館$/.test(name)) return "gym";
  if (/武道場/.test(name)) return "flooring";
  if (/作法室/.test(name)) return "tatami";
  if (/トイレ|シャワー|調理室|実験室|昇降口|玄関|ホール/.test(name)) return "tile";
  return "wood";
}

// rooms: その階の部屋の配列（cx, cz, w, d, name を持つ）, y: 床の高さ
export function buildFurniture(rooms, y) {
  const items = [];
  for (const r of rooms) {
    // 自動販売機（壁ぎわ。正面は部屋の内側）
    if (r.vending) {
      const pos = { e: [r.cx + r.w / 2 - 0.55, r.cz, 0], w: [r.cx - r.w / 2 + 0.55, r.cz, Math.PI], n: [r.cx, r.cz - r.d / 2 + 0.55, -Math.PI / 2], s: [r.cx, r.cz + r.d / 2 - 0.55, Math.PI / 2] }[r.vending];
      items.push({ t: "vending", x: pos[0], z: pos[1] - 0.6, rot: pos[2] }, { t: "vending", x: pos[0], z: pos[1] + 0.6, rot: pos[2] });
    }
    const fn = LAYOUTS.find(([re]) => re.test(r.name));
    if (!fn) continue;
    const list = [];
    if (EAST_FRONT.test(r.name)) {
      // 「正面が -x」の置き方を、部屋の中心のまわりで180度回す
      fn[1](list, { x0: -r.w / 2 + 0.2, x1: r.w / 2 - 0.2, z0: -r.d / 2 + 0.2, z1: r.d / 2 - 0.2 });
      for (const it of list) {
        it.x = r.cx - it.x;
        it.z = r.cz - it.z;
        it.rot = (it.rot || 0) + Math.PI;
      }
    } else if (SOUTH_FRONT.test(r.name)) {
      // 南側（+z）が前。「正面が -x」の置き方を +90度回して使う
      fn[1](list, { x0: -r.d / 2 + 0.2, x1: r.d / 2 - 0.2, z0: -r.w / 2 + 0.2, z1: r.w / 2 - 0.2 });
      for (const it of list) {
        const { x, z } = it;
        it.x = r.cx + z;
        it.z = r.cz - x;
        it.rot = (it.rot || 0) + Math.PI / 2;
      }
    } else if (NORTH_FRONT.test(r.name)) {
      // 特別教室は、黒板・教卓・教壇を北側（-z）に置く。
      // 置き方の関数は「正面が -x」で書いてあるので、部屋の中心のまわりで -90度回して使う
      fn[1](list, { x0: -r.d / 2 + 0.2, x1: r.d / 2 - 0.2, z0: -r.w / 2 + 0.2, z1: r.w / 2 - 0.2 });
      for (const it of list) {
        const { x, z } = it;
        it.x = r.cx - z;
        it.z = r.cz + x;
        it.rot = (it.rot || 0) - Math.PI / 2;
      }
    } else {
      fn[1](list, { x0: r.cx - r.w / 2 + 0.2, x1: r.cx + r.w / 2 - 0.2, z0: r.cz - r.d / 2 + 0.2, z1: r.cz + r.d / 2 - 0.2 });
    }
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
        s.set(1, 1, it.len || 1);
        m4.compose(p, q, s);
        im.setMatrixAt(i, m4);
        if (it.col !== undefined) im.setColorAt(i, new THREE.Color(it.col));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      group.add(im);
    }
  }
  return group;
}
