// Порция — 3D-сцена лендинга (Three.js).
// Боул с едой собирается прямо в коде (без внешних моделей),
// а его положение, фон и эффекты зависят от того, до какой секции долистали.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];


// ---------- рендерер ----------
const canvas = $('#scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  document.documentElement.classList.add('no-webgl');
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const key = new THREE.DirectionalLight(0xfff4e0, 1.6);
key.position.set(-3, 5, 4);
scene.add(key, new THREE.HemisphereLight(0xffffff, 0x9fb8a6, 0.5));

// ---------- материалы ----------
const M = {
  glaze: new THREE.MeshPhysicalMaterial({ color: 0x1D4A30, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, side: THREE.DoubleSide }),
  inner: new THREE.MeshPhysicalMaterial({ color: 0xF3EFE4, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2, side: THREE.DoubleSide }),
  gold: new THREE.MeshStandardMaterial({ color: 0xE8A949, metalness: 0.75, roughness: 0.28 }),
  rice: new THREE.MeshStandardMaterial({ color: 0xF4EEDC, roughness: 0.85 }),
  grain: new THREE.MeshStandardMaterial({ color: 0xFFFBF0, roughness: 0.6 }),
  avocado: new THREE.MeshPhysicalMaterial({ color: 0xC5D66A, roughness: 0.45, clearcoat: 0.4 }),
  avoSkin: new THREE.MeshStandardMaterial({ color: 0x3E5A1E, roughness: 0.6 }),
  tomato: new THREE.MeshPhysicalMaterial({ color: 0xE0412E, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 }),
  stem: new THREE.MeshStandardMaterial({ color: 0x4E8A3A, roughness: 0.6 }),
  eggWhite: new THREE.MeshPhysicalMaterial({ color: 0xFFFDF7, roughness: 0.35, clearcoat: 0.5 }),
  yolk: new THREE.MeshPhysicalMaterial({ color: 0xF2A43A, roughness: 0.3, clearcoat: 0.8 }),
  edamame: new THREE.MeshStandardMaterial({ color: 0x7BB662, roughness: 0.5 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x6FAF86, roughness: 0.5, side: THREE.DoubleSide }),
  sesameW: new THREE.MeshStandardMaterial({ color: 0xF6ECD2, roughness: 0.6 }),
  sesameB: new THREE.MeshStandardMaterial({ color: 0x2A2A24, roughness: 0.6 }),
};

// Полосатая текстура для лосося
function salmonTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#F07F4F'; g.fillRect(0, 0, 256, 128);
  g.strokeStyle = 'rgba(255,214,190,.9)'; g.lineWidth = 7;
  for (let x = -128; x < 300; x += 30) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 60, 128); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
M.salmon = new THREE.MeshPhysicalMaterial({ map: salmonTexture(), roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });

// Долька лимона сверху
function lemonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#F2D04A'; g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill();
  g.fillStyle = '#FFF6C8'; g.beginPath(); g.arc(128, 128, 112, 0, 7); g.fill();
  g.fillStyle = '#F7DC62';
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2;
    g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 102, a + 0.06, a + Math.PI * 2 / 9 - 0.06); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
M.lemonTop = new THREE.MeshStandardMaterial({ map: lemonTexture(), roughness: 0.4 });
M.lemonSide = new THREE.MeshStandardMaterial({ color: 0xF2D04A, roughness: 0.5 });

// Мягкая тень под тарелкой
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// ---------- боул ----------
const root = new THREE.Group();      // позиция и масштаб по секциям
const tilt = new THREE.Group();      // наклон к камере
const spin = new THREE.Group();      // вращение
root.add(tilt); tilt.add(spin); scene.add(root);

const outerPts = [new THREE.Vector2(0, -0.52), new THREE.Vector2(0.5, -0.52), new THREE.Vector2(0.57, -0.49), new THREE.Vector2(0.6, -0.43)];
for (let k = 0; k <= 20; k++) {
  const t = k / 20;
  outerPts.push(new THREE.Vector2(0.62 + 0.85 * Math.sin(t * Math.PI / 2), -0.43 + 0.8 * (1 - Math.cos(t * Math.PI / 2))));
}
outerPts.push(new THREE.Vector2(1.48, 0.4), new THREE.Vector2(1.44, 0.42));
const innerPts = [];
for (let k = 0; k <= 20; k++) {
  const t = k / 20;
  innerPts.push(new THREE.Vector2(Math.max(0.0001, 1.4 * Math.cos(t * Math.PI / 2)), 0.415 - 0.72 * Math.sin(t * Math.PI / 2)));
}
// Запасная тарелка из кода: видна, пока грузится настоящая модель (или если её нет)
const codeBowl = new THREE.Group(); spin.add(codeBowl);
codeBowl.add(new THREE.Mesh(new THREE.LatheGeometry(outerPts, 96), M.glaze));
codeBowl.add(new THREE.Mesh(new THREE.LatheGeometry(innerPts, 96), M.inner));
const rim = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.028, 16, 128), M.gold);
rim.rotation.x = Math.PI / 2; rim.position.y = 0.41; codeBowl.add(rim);

const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4),
  new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, opacity: 0.5 }));
shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.56; tilt.add(shadow);

// Еда из кода (поке): видна, пока не загрузилась настоящая фруктовая тарелка
const food = new THREE.Group(); spin.add(food);
// Горка риса: высота поверхности в точке (x, z)
const RR = 1.3;
const surf = (x, z) => 0.16 + 0.2 * Math.sqrt(Math.max(0, 1 - (x * x + z * z) / (RR * RR)));
const riceDome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2), M.rice);
riceDome.scale.set(RR, 0.2, RR); riceDome.position.y = 0.16; food.add(riceDome);
const riceFill = new THREE.Mesh(new THREE.CylinderGeometry(RR, 1.05, 0.3, 64), M.rice);
riceFill.position.y = 0.01; food.add(riceFill);

const rnd = (a, b) => a + Math.random() * (b - a);
const dummy = new THREE.Object3D();
function scatter(geo, mat, n, maxR, lift, rot = true) {
  const im = new THREE.InstancedMesh(geo, mat, n);
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(Math.random()) * maxR, a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    dummy.position.set(x, surf(x, z) + lift, z);
    dummy.rotation.set(rot ? rnd(-0.3, 0.3) : 0, Math.random() * Math.PI * 2, Math.PI / 2 + rnd(-0.2, 0.2));
    dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
  }
  return im;
}
food.add(scatter(new THREE.CapsuleGeometry(0.022, 0.05, 3, 6), M.grain, 520, 1.22, 0.01));

const anchors = {};
function anchor(name, x, y, z) { const o = new THREE.Object3D(); o.position.set(x, y, z); food.add(o); anchors[name] = o; }
anchor('rice', 0.05, surf(0, 0) + 0.05, 0.9);

// Лосось — веер ломтиков
{
  const g = new RoundedBoxGeometry(0.56, 0.11, 0.2, 3, 0.045);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(g, M.salmon);
    const a = -0.35 + i * 0.18;
    const cx = 0.6 + Math.cos(a) * 0.08 * i, cz = 0.25 - 0.13 * i + 0.3;
    m.position.set(cx - 0.05, surf(cx, cz) + 0.06 + i * 0.012, cz - 0.2);
    m.rotation.set(rnd(-0.08, 0.08), 0.9 + a * 0.5, rnd(-0.12, 0.05));
    food.add(m);
  }
  anchor('salmon', 0.62, surf(0.6, 0.1) + 0.25, 0.1);
}
// Авокадо — полумесяцы
{
  const s = new THREE.Shape();
  s.absellipse(0, 0, 0.36, 0.17, 0, Math.PI, false);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 24 });
  g.center();
  const skinS = new THREE.Shape();
  skinS.absellipse(0, 0, 0.385, 0.19, 0, Math.PI, false);
  const skinG = new THREE.ExtrudeGeometry(skinS, { depth: 0.05, bevelEnabled: false, curveSegments: 24 });
  skinG.center();
  for (let i = 0; i < 4; i++) {
    const grp = new THREE.Group();
    const flesh = new THREE.Mesh(g, M.avocado);
    const skin = new THREE.Mesh(skinG, M.avoSkin); skin.position.set(0, 0.012, -0.005);
    grp.add(skin, flesh);
    const x = -0.72 + i * 0.1, z = 0.05 + i * 0.16;
    grp.position.set(x, surf(x, z) + 0.07, z);
    grp.rotation.set(-Math.PI / 2 + 0.25, 0, -0.9 + i * 0.12);
    grp.rotation.order = 'YXZ';
    grp.rotation.y = 0.5 + i * 0.1;
    food.add(grp);
  }
  anchor('avocado', -0.6, surf(-0.6, 0.25) + 0.25, 0.25);
}
// Яйцо — две половинки
{
  const white = new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const cap = new THREE.CircleGeometry(0.2, 32);
  const yolkG = new THREE.SphereGeometry(0.1, 24, 12);
  [[0.02, -0.62, 0.3], [0.36, -0.52, -0.2]].forEach(([x, z, ry]) => {
    const e = new THREE.Group();
    const w = new THREE.Mesh(white, M.eggWhite);
    const c = new THREE.Mesh(cap, M.eggWhite); c.rotation.x = -Math.PI / 2; c.position.y = 0.001;
    const y = new THREE.Mesh(yolkG, M.yolk); y.scale.set(1, 0.45, 1); y.position.y = 0.01;
    e.add(w, c, y); e.scale.set(1, 0.9, 1.3);
    e.position.set(x, surf(x, z) + 0.12, z); e.rotation.set(0.08, ry, 0);
    food.add(e);
  });
  anchor('egg', 0.2, surf(0.2, -0.55) + 0.3, -0.55);
}
// Черри
{
  const g = new THREE.SphereGeometry(0.15, 32, 16);
  const sg = new THREE.ConeGeometry(0.05, 0.04, 5);
  [[-0.55, -0.35], [-0.33, -0.5], [-0.72, -0.12], [-0.28, -0.22]].forEach(([x, z]) => {
    const t = new THREE.Mesh(g, M.tomato); t.scale.set(1, 0.92, 1);
    t.position.set(x, surf(x, z) + 0.12, z);
    const s = new THREE.Mesh(sg, M.stem); s.position.y = 0.14; s.rotation.x = Math.PI; t.add(s);
    food.add(t);
  });
  anchor('tomato', -0.48, surf(-0.48, -0.3) + 0.32, -0.3);
}
// Эдамаме и зелень
{
  const bean = new THREE.CapsuleGeometry(0.05, 0.08, 4, 8);
  for (let i = 0; i < 12; i++) {
    const x = rnd(0.45, 0.85), z = rnd(-0.15, 0.15) - 0.25;
    const b = new THREE.Mesh(bean, M.edamame);
    b.position.set(x, surf(x, z) + 0.05, z); b.rotation.set(Math.PI / 2, 0, Math.random() * 3);
    food.add(b);
  }
  const leafG = new THREE.SphereGeometry(1, 16, 8);
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(leafG, M.leaf);
    l.scale.set(0.2, 0.018, 0.09);
    const x = rnd(-0.2, 0.2), z = rnd(-0.1, 0.25);
    l.position.set(x, surf(x, z) + 0.06, z); l.rotation.set(rnd(-0.3, 0.3), Math.random() * 6, rnd(-0.2, 0.2));
    food.add(l);
  }
}
// Кунжут
{
  const g = new THREE.SphereGeometry(0.014, 6, 4); g.scale(1, 0.45, 0.65);
  food.add(scatter(g, M.sesameW, 110, 1.1, 0.14, false));
  food.add(scatter(g, M.sesameB, 50, 1.1, 0.14, false));
}

// ---------- кольца БЖУ ----------
const rings = new THREE.Group(); root.add(rings);
const RING = [
  { r: 1.9, color: 0xA6E3BC, target: 0.72 },
  { r: 2.12, color: 0xD4B06E, target: 0.55 },
  { r: 2.34, color: 0xF0876A, target: 0.84 },
];
const geoCache = new Map();
function arcGeo(r, arc) {
  const k = r + ':' + arc;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.TorusGeometry(r, 0.055, 12, Math.max(8, Math.round(140 * arc)), Math.max(0.0001, arc * Math.PI * 2)));
  return geoCache.get(k);
}
RING.forEach(o => {
  const track = new THREE.Mesh(new THREE.TorusGeometry(o.r, 0.02, 8, 140), new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.18 }));
  const arc = new THREE.Mesh(arcGeo(o.r, 0), new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.35, metalness: 0.1 }));
  arc.rotation.z = Math.PI / 2; arc.scale.x = -1;
  const g = new THREE.Group(); g.add(track, arc); rings.add(g);
  o.group = g; o.arc = arc; o.track = track;
});

// ---------- летающие ингредиенты ----------
// Летают в той же наклонной системе, что и миска (но не крутятся вместе с ней),
// поэтому их легко держать снаружи миски и они не проходят сквозь неё.
const floaters = new THREE.Group(); tilt.add(floaters);
function makeFloater(type) {
  switch (type) {
    case 'tomato': { const m = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 16), M.tomato); const s = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.05, 5), M.stem); s.position.y = 0.16; s.rotation.x = Math.PI; m.add(s); return m; }
    case 'lemon': { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 40), [M.lemonSide, M.lemonTop, M.lemonTop]); return m; }
    case 'leaf': { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), M.leaf); m.scale.set(0.3, 0.025, 0.14); return m; }
    case 'salmon': return new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.11, 0.2, 3, 0.045), M.salmon);
    case 'bean': return new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.1, 4, 8), M.edamame);
    case 'egg': { const g = new THREE.Group(); const w = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M.eggWhite); const c = new THREE.Mesh(new THREE.CircleGeometry(0.2, 32), M.eggWhite); c.rotation.x = -Math.PI / 2; const y = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 10), M.yolk); y.scale.y = 0.45; g.add(w, c, y); g.scale.z = 1.3; return g; }
  }
}
const types = ['tomato', 'lemon', 'leaf', 'salmon', 'bean', 'leaf', 'tomato', 'egg', 'lemon', 'bean', 'leaf', 'tomato', 'salmon', 'leaf'];
const F = types.map((t, i) => {
  // Обёртка: масштаб анимируем у неё, чтобы не сбить форму листика или яйца
  const mesh = new THREE.Group(); mesh.add(makeFloater(t));
  // Раскладываем по «поясу» вокруг тарелки, равномерно по углу, чуть позади неё
  // Только по бокам от миски (слева и справа): спереди и сзади фрукты
  // визуально наезжали бы на миску, будто проходят сквозь неё
  const side = i % 2 ? Math.PI : 0;
  const a = side + (Math.floor(i / 2) / (types.length / 2 - 1) - 0.5) * 1.3;
  const r = rnd(2.6, 3.3);
  const base = new THREE.Vector3(Math.cos(a) * r, rnd(-0.4, 1.1), Math.sin(a) * r * 0.35);
  floaters.add(mesh);
  return { mesh, base, phase: Math.random() * 10, spin: new THREE.Vector3(rnd(-0.6, 0.6), rnd(-0.6, 0.6), rnd(-0.6, 0.6)), s: rnd(0.8, 1.15) };
});

// ---------- настоящие 3D-модели (фотосканы Poly Haven, CC0) ----------
// Лежат в папке models/. У Poly Haven реальный масштаб (метры), поэтому
// фрукты и миска получают один общий масштаб и сохраняют настоящие пропорции.
const loader = new GLTFLoader();
const cache = {};
function loadModel(id) {
  if (!cache[id]) cache[id] = new Promise(res => loader.load(`models/${id}/${id}_1k.gltf`, g => {
    const m = g.scene;
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    m.position.sub(box.getCenter(new THREE.Vector3()));
    // Длинной стороной — горизонтально, чтобы фрукт «лежал», а не стоял
    const g2 = new THREE.Group(); g2.add(m);
    if (size.y > Math.max(size.x, size.z) * 1.1) { g2.rotation.z = Math.PI / 2; [size.x, size.y] = [size.y, size.x]; }
    const p = new THREE.Group(); p.add(g2);
    p.userData.size = size;                      // размер в метрах
    res(p);
  }, undefined, () => res(null)));
  return cache[id];
}
const FRUITS = ['food_avocado_01', 'food_pomegranate_01', 'food_apple_01', 'food_kiwi_01', 'lemon', 'food_lime_01', 'food_lychee_01'];

// Летающие фрукты: заменяем нарисованные ингредиенты по мере загрузки
F.forEach((f, i) => {
  const id = FRUITS[i % FRUITS.length];
  loadModel(id).then(p => {
    if (!p) return;
    const c = p.clone();
    const s = p.userData.size;
    c.scale.setScalar((id === 'food_lychee_01' ? 0.32 : 0.55) / Math.max(s.x, s.y, s.z));
    f.mesh.clear(); f.mesh.add(c);
    f.spin.multiplyScalar(0.5); f.s = rnd(1.0, 1.2);
  });
});

// Что лежит в миске: модель, место (x, z), поворот и подпись для сканера
const BOWL = [
  { id: 'food_avocado_01', x: -0.35, z: 0.1, ry: 0.3, tag: ['Авокадо', 240] },
  { id: 'food_pomegranate_01', x: 0.6, z: -0.35, ry: 1.2, tag: ['Гранат', 230] },
  { id: 'food_apple_01', x: 0.55, z: 0.45, ry: 2.0, tag: ['Яблоко', 95] },
  { id: 'food_kiwi_01', x: -0.55, z: -0.6, ry: 1.2, tag: ['Киви', 42] },
  { id: 'lemon', x: 0.05, z: -0.75, ry: 2.6, tag: ['Лимон', 17] },
  { id: 'food_lime_01', x: -0.6, z: 0.72, ry: 1.7 },
  { id: 'food_lychee_01', x: 0.08, z: 0.72, ry: 0.0 },
  { id: 'food_lychee_01', x: -0.12, z: 0.92, ry: 1.0 },
];
const FRUIT_SCALE = 0.8; // фрукты чуть меньше настоящих — так миска смотрится аккуратнее
let bowlKcal = 564;

(async () => {
  const bowl = await loadModel('wooden_bowl_01');
  if (!bowl) return;                                   // миски нет — остаётся тарелка из кода
  const bs = bowl.userData.size;
  const k = 3.45 / Math.max(bs.x, bs.z);                // метры → единицы сцены
  bowl.scale.setScalar(k);
  bowl.position.y = 0.52 - bs.y * k / 2;                // верхний край на высоте 0.52
  // Высоту дна миски в любой точке узнаём лучом сверху вниз
  bowl.traverse(o => { if (o.material) o.material.side = THREE.DoubleSide; }); // луч видит поверхность с любой стороны
  const tmp = new THREE.Scene(); tmp.add(bowl); tmp.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const bottomY = 0.52 - bs.y * k + 0.08;               // примерная высота дна внутри
  const floor = (x, z) => {
    ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(bowl, true)[0];
    if (hit) return hit.point.y;
    const t = Math.min(1, Math.hypot(x, z) / 1.7);     // промах (край) — оцениваем по форме
    return bottomY + (0.52 - bottomY) * t * t;
  };
  spin.add(bowl); codeBowl.visible = false;

  const protos = await Promise.all(BOWL.map(b => loadModel(b.id)));
  if (protos.filter(Boolean).length < 5) return;       // фруктов мало — оставляем поке
  // Раскладка: фрукты не залезают друг в друга (раздвигаем по горизонтали)
  // и опускаются, пока не коснутся дна или стенки миски.
  const placed = [];
  const fruitGroup = new THREE.Group();
  const debug = [];
  BOWL.forEach((b, i) => {
    const p = protos[i]; if (!p) return;
    const s = p.userData.size, kk = k * FRUIT_SCALE;
    const rx = s.x * kk / 2, rz = s.z * kk / 2, h = s.y * kk / 2;
    const fr = (rx + rz) / 2 * 0.92;                 // радиус «следа» фрукта
    let x = b.x, z = b.z;
    for (let it = 0; it < 40; it++) {
      let moved = false;
      placed.forEach(q => {
        const dx = x - q.x, dz = z - q.z, d = Math.hypot(dx, dz) || 0.001, need = fr + q.fr;
        if (d < need) { x += dx / d * (need - d) * 0.6; z += dz / d * (need - d) * 0.6; moved = true; }
      });
      const R = Math.hypot(x, z), maxR = 1.3 - fr * 0.6;
      if (R > maxR) { x *= maxR / R; z *= maxR / R; }
      if (!moved) break;
    }
    // Точка касания: низ фрукта (как эллипсоида) ложится на самую высокую точку дна под ним
    let y = -Infinity;
    for (let ring = 0; ring <= 3; ring++) {
      const d = fr * ring / 3, n = ring ? 10 : 1;
      for (let j = 0; j < n; j++) {
        const t = j / n * Math.PI * 2;
        const fy = floor(x + Math.cos(t) * d, z + Math.sin(t) * d);
        y = Math.max(y, fy + h * Math.sqrt(Math.max(0, 1 - (d / fr) ** 2)));
      }
    }
    y -= 0.015;                                         // чуть «вдавливаем», чтобы не было щели
    const c = p.clone(); c.scale.setScalar(kk);
    c.position.set(x, y, z); c.rotation.y = b.ry;
    fruitGroup.add(c);
    placed.push({ x, z, fr });
    debug.push({ id: b.id, x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), floor: +floor(x, z).toFixed(2) });
    if (b.tag) {
      const o = new THREE.Object3D(); o.position.set(x, y + h + 0.05, z); fruitGroup.add(o);
      b.anchor = o;
    }
  });
  window.porciyaDebug = debug;
  spin.add(fruitGroup); food.visible = false;
  // Подписи сканера — под фрукты
  const tagged = BOWL.filter(b => b.anchor);
  tags.forEach((t, i) => {
    const b = tagged[i];
    if (!b) { t.el.remove(); t.a = null; return; }
    t.el.querySelector('b').textContent = b.tag[0];
    t.el.querySelector('span').textContent = b.tag[1] + ' ккал';
    t.a = b.anchor;
  });
  bowlKcal = tagged.reduce((a, b) => a + b.tag[1], 0);
})();

// ---------- состояния по секциям ----------
//  bx,by — позиция тарелки, bs — масштаб, rx — наклон к камере,
//  lab — подписи, scan — рамка сканера, ring — кольца, fv — видимость ингредиентов, fs — их разлёт
const S = [
  { bx: 1.55, by: -0.15, bs: 1.05, rx: 0.42, lab: 0, scan: 0, ring: 0, fv: 1, fs: 1.0, bg: '#1E150D', ink: '#F4F6F1' },
  { bx: -1.45, by: -0.15, bs: 0.86, rx: 0.8, lab: 1, scan: 1, ring: 0, fv: 0, fs: 0.5, bg: '#15100A', ink: '#F4F6F1' },
  { bx: -1.5, by: 0, bs: 0.78, rx: 0.3, lab: 0, scan: 0, ring: 1, fv: 0, fs: 0.5, bg: '#24180F', ink: '#F4F6F1' },
  { bx: 1.75, by: -0.1, bs: 0.92, rx: 0.5, lab: 0, scan: 0, ring: 0, fv: 1, fs: 1.3, bg: '#1F160C', ink: '#F4F6F1' },
  { bx: -1.7, by: -0.1, bs: 0.85, rx: 0.45, lab: 0, scan: 0, ring: 0, fv: 0.8, fs: 1.55, bg: '#2A1812', ink: '#F4F6F1' },
  { bx: 0, by: -0.75, bs: 1.0, rx: 0.55, lab: 0, scan: 0, ring: 0, fv: 1, fs: 1.0, bg: '#1A120B', ink: '#F4F6F1' },
];
const NUM = ['bx', 'by', 'bs', 'rx', 'lab', 'scan', 'ring', 'fv', 'fs'];
const cur = { ...S[0] };
const sections = $$('.sec');
const col = hex => new THREE.Color(hex);
const bgA = new THREE.Color(), bgB = new THREE.Color(), inkA = new THREE.Color(), inkB = new THREE.Color();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

let mobile = false, W = 0, H = 0, camDist = 7.3;
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  mobile = camera.aspect < 0.9;
  // На узком экране отодвигаем камеру, чтобы тарелка влезла по ширине
  camDist = mobile ? Math.max(7.3, 1.85 / (Math.tan(THREE.MathUtils.degToRad(16)) * camera.aspect)) : 7.3;
  camera.position.set(0, 1.6 * camDist / 7.3, camDist);
  camera.lookAt(0, 0.15, 0);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

function targetState() {
  const c = scrollY + H / 2;
  const mids = sections.map(s => s.offsetTop + s.offsetHeight / 2);
  let i = 0;
  while (i < mids.length - 1 && c > mids[i + 1]) i++;
  let u = i < mids.length - 1 ? (c - mids[i]) / (mids[i + 1] - mids[i]) : 0;
  u = smooth(0.2, 0.8, Math.max(0, u));
  const a = S[i], b = S[Math.min(i + 1, S.length - 1)];
  const t = {};
  NUM.forEach(k => t[k] = a[k] + (b[k] - a[k]) * u);
  bgA.set(a.bg); bgB.set(b.bg); t.bg = bgA.clone().lerp(bgB, u);
  inkA.set(a.ink); inkB.set(b.ink); t.ink = inkA.clone().lerp(inkB, u);
  t.active = u < 0.5 ? i : i + 1;
  // На не очень широких экранах сдвигаем и уменьшаем тарелку, чтобы она не наезжала на текст
  const f = Math.min(1.15, Math.max(0.55, Math.tan(THREE.MathUtils.degToRad(16)) * camDist * camera.aspect / 3.72));
  t.bx *= f; t.bs *= Math.min(1, 0.25 + 0.75 * f);
  if (mobile) { // на телефоне тарелка всегда сверху по центру, текст снизу
    const topY = Math.tan(THREE.MathUtils.degToRad(16)) * camDist;
    t.bx = 0; t.by = topY * 0.36; t.bs *= 0.95 - 0.25 * t.ring + 0.45 * t.lab;
  }
  return t;
}

// ---------- указатель мыши (лёгкий параллакс) ----------
const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener('pointermove', e => { ptr.tx = e.clientX / W * 2 - 1; ptr.ty = e.clientY / H * 2 - 1; });

// ---------- 2D-слой ----------
const tags = $$('.tag').map(el => ({ el, a: anchors[el.dataset.a] }));
const frame = $('.scanframe');
const totalEl = $('[data-total]');
const counts = $$('[data-count]');
const bar = $('.progress i');
const dots = $$('.dots a');
const v = new THREE.Vector3();
function toScreen(obj, out = v) { obj.getWorldPosition(out); out.project(camera); return { x: (out.x + 1) / 2 * W, y: (1 - out.y) / 2 * H }; }

// ---------- цикл ----------
const clock = new THREE.Clock();
let spinAngle = 0, lastActive = -1, lastBg = '';
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05), time = clock.elapsedTime;
  const T = targetState();
  const k = reduceMotion ? 1 : 1 - Math.exp(-dt * 5);
  NUM.forEach(n => cur[n] += (T[n] - cur[n]) * k);

  // фон и цвет навигации
  const bg = '#' + T.bg.getHexString();
  if (bg !== lastBg) {
    document.documentElement.style.setProperty('--bg', bg);
    document.documentElement.style.setProperty('--nav-ink', '#' + T.ink.getHexString());
    lastBg = bg;
  }
  if (T.active !== lastActive) { dots.forEach((d, i) => d.classList.toggle('on', i === T.active)); lastActive = T.active; }
  bar.style.width = (scrollY / Math.max(1, document.documentElement.scrollHeight - H) * 100) + '%';

  // тарелка
  ptr.x += (ptr.tx - ptr.x) * k; ptr.y += (ptr.ty - ptr.y) * k;
  const bob = reduceMotion ? 0 : Math.sin(time * 1.1) * 0.05;
  root.position.set(cur.bx, cur.by + bob, 0);
  root.scale.setScalar(cur.bs);
  tilt.rotation.set(cur.rx + ptr.y * 0.08, ptr.x * 0.15, 0);
  if (!reduceMotion) spinAngle += dt * 0.28 * (1 - cur.lab) * (1 - 0.7 * cur.ring);
  spin.rotation.y = spinAngle;

  // кольца: смотрят в камеру и заполняются
  rings.visible = cur.ring > 0.01;
  if (rings.visible) {
    rings.quaternion.copy(camera.quaternion);
    RING.forEach((o, i) => {
      const p = smooth(i * 0.12, 0.64 + i * 0.12, cur.ring) * o.target;
      const g = arcGeo(o.r, Math.round(p * 100) / 100);
      if (o.arc.geometry !== g) o.arc.geometry = g;
      o.track.material.opacity = 0.18 * cur.ring;
      o.group.scale.setScalar(0.85 + 0.15 * cur.ring);
    });
  }
  counts.forEach((el, i) => el.textContent = Math.round(RING[i].target * 100 * smooth(i * 0.12, 0.64 + i * 0.12, cur.ring)));

  // летающие ингредиенты
  F.forEach((f, i) => {
    const s = f.s * Math.max(0, Math.min(1, cur.fv * 1.4 - i * 0.02));
    f.mesh.visible = s > 0.01;
    if (!f.mesh.visible) return;
    const w = reduceMotion ? 0 : time;
    const spread = Math.max(1, cur.fs);          // только наружу, внутрь миски — никогда
    f.mesh.position.set(
      f.base.x * spread + Math.sin(w * 0.6 + f.phase) * 0.08,
      f.base.y + Math.sin(w * 0.9 + f.phase) * 0.14,
      f.base.z);
    f.mesh.rotation.set(f.spin.x * w + f.phase, f.spin.y * w, f.spin.z * w);
    f.mesh.scale.setScalar(s);
  });

  renderer.render(scene, camera);

  // рамка сканера вокруг тарелки
  if (cur.scan > 0.01) {
    root.updateMatrixWorld();
    const c = new THREE.Vector3(); root.getWorldPosition(c);
    const e = c.clone().add(new THREE.Vector3(1.75 * cur.bs, 0, 0));
    c.project(camera); e.project(camera);
    const cx = (c.x + 1) / 2 * W, cy = (1 - c.y) / 2 * H, rad = Math.abs(e.x - c.x) / 2 * W;
    frame.style.transform = `translate(${cx - rad}px,${cy - rad * 0.8}px)`;
    frame.style.width = rad * 2 + 'px'; frame.style.height = rad * 1.6 + 'px';
  }
  frame.style.opacity = cur.scan;

  // подписи продуктов
  tags.forEach((t, i) => {
    if (!t.a) return;
    const o = smooth(0.35 + i * 0.1, 0.6 + i * 0.1, cur.lab);
    t.el.style.opacity = o;
    if (o > 0.01) {
      const p = toScreen(t.a);
      t.el.style.transform = `translate(${p.x}px,${p.y - 30 - (1 - o) * 14}px) translate(-50%,-100%)`;
    }
  });
  totalEl.textContent = Math.round(bowlKcal * smooth(0.3, 1, cur.lab));

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
