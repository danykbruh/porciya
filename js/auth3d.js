// Порция — 3D-фон экрана входа и регистрации.
// Настоящие фрукты (фотосканы Poly Haven, CC0) медленно кружат за полупрозрачной панелью входа.
// Three.js грузится, только когда человек не вошёл, и сцена выключается сразу после входа.

const canvas = document.getElementById('authBg');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MODELS = ['food_avocado_01', 'food_pomegranate_01', 'food_apple_01', 'food_kiwi_01', 'lemon', 'food_lime_01', 'food_lychee_01'];

let started = false, running = false, rafId = 0, ctx = null;

function signedOut() { return document.body.classList.contains('signed-out'); }

// Следим за входом/выходом: класс signed-out ставит и снимает js/cloud.js
new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ['class'] });
document.addEventListener('visibilitychange', sync);
sync();

function sync() {
  // Показываем холст только на экране входа (не зависим от того, успел ли обновиться CSS)
  canvas.style.display = signedOut() ? 'block' : 'none';
  const want = signedOut() && !document.hidden;
  if (want && !started) { started = true; start().catch(e => console.warn('Порция 3D-фон:', e)); }
  if (want && ctx && !running) { running = true; ctx.clock.getDelta(); rafId = requestAnimationFrame(loop); }
  if (!want && running) { running = false; cancelAnimationFrame(rafId); }
}

async function start() {
  const THREE = await import('three');
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xfff0dc, 1.5); key.position.set(-4, 6, 5);
  scene.add(key, new THREE.HemisphereLight(0xfff4e6, 0x3a2a1c, 0.45));

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.6, 10);
  camera.lookAt(0, 0, 0);

  // Кольцо фруктов вокруг панели входа, слегка наклонённое к зрителю
  const ring = new THREE.Group(); ring.rotation.x = 0.32; scene.add(ring);

  const rnd = (a, b) => a + Math.random() * (b - a);
  const loader = new GLTFLoader();
  const load = id => new Promise(res => loader.load(`landing/models/${id}/${id}_1k.gltf`, g => {
    const m = g.scene;
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    m.position.sub(box.getCenter(new THREE.Vector3()));
    const holder = new THREE.Group(); holder.add(m);
    holder.userData.max = Math.max(size.x, size.y, size.z);
    res(holder);
  }, undefined, () => res(null)));

  const protos = (await Promise.all(MODELS.map(load))).filter(Boolean);
  if (!protos.length) return; // модели не загрузились — остаётся просто кофейный фон

  const narrow = () => innerWidth / innerHeight < 0.9;
  const COUNT = narrow() ? 12 : 20;
  const fruits = [];
  for (let i = 0; i < COUNT; i++) {
    const p = protos[i % protos.length];
    const obj = p.clone();
    const isLychee = MODELS[i % MODELS.length] === 'food_lychee_01';
    const size = (isLychee ? 0.45 : 0.85) * rnd(0.85, 1.2);
    obj.scale.setScalar(size / p.userData.max);
    const wrap = new THREE.Group(); wrap.add(obj); ring.add(wrap);
    fruits.push({
      wrap, obj, base: size / p.userData.max,
      a: (i / COUNT) * Math.PI * 2 + rnd(-0.1, 0.1),        // место на кольце
      r: i % 3 === 0 ? rnd(4.2, 5.1) : rnd(2.5, 3.8),       // большинство ближе к центру, треть — по краям
      y: rnd(-1.6, 1.6),                                     // высота
      spin: new THREE.Vector3(rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(-0.3, 0.3)),
      ph: Math.random() * 10,
      delay: 0.1 + i * 0.07,                                 // плавное появление по очереди
    });
  }

  // Готовим текстуры и шейдеры заранее, чтобы первые кадры не подвисали
  try {
    scene.traverse(o => { if (o.isMesh) ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap'].forEach(k => o.material[k] && renderer.initTexture(o.material[k])); });
    renderer.compile(scene, camera);
  } catch (e) { /* не страшно */ }

  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', e => { ptr.tx = e.clientX / innerWidth * 2 - 1; ptr.ty = e.clientY / innerHeight * 2 - 1; });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // На телефоне отодвигаем камеру, чтобы кольцо помещалось по ширине
    camera.position.z = camera.aspect < 0.9 ? 10 / Math.max(0.5, camera.aspect) * 0.62 : 10;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  const clock = new THREE.Clock();
  let t = 0;
  ctx = {
    clock,
    frame() {
      const dt = Math.min(clock.getDelta(), 0.05);   // подвисание не «съедает» анимацию
      t += dt;
      const w = reduceMotion ? 0 : t;
      const k = 1 - Math.exp(-dt * 3);
      ptr.x += (ptr.tx - ptr.x) * k; ptr.y += (ptr.ty - ptr.y) * k;
      ring.rotation.y = w * 0.06 + ptr.x * 0.12;       // медленная карусель + лёгкий параллакс
      ring.rotation.x = 0.32 + ptr.y * 0.06;
      fruits.forEach(f => {
        const appear = reduceMotion ? 1 : Math.min(1, Math.max(0, (t - f.delay) / 1.2));
        const e = 1 - Math.pow(1 - appear, 3);
        f.wrap.position.set(Math.cos(f.a) * f.r, f.y + Math.sin(w * 0.7 + f.ph) * 0.18, Math.sin(f.a) * f.r);
        f.obj.rotation.set(f.spin.x * w + f.ph, f.spin.y * w, f.spin.z * w);
        f.wrap.scale.setScalar(e);
      });
      renderer.render(scene, camera);
    },
  };
  sync();
}

function loop() {
  if (!running) return;
  try { ctx.frame(); } catch (e) { console.error('Порция 3D-фон:', e); running = false; return; }
  rafId = requestAnimationFrame(loop);
}
