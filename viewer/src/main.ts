import './style.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { estadoDoCeu, TEMPO } from './clima';

// ---------- Configuração do mundo ----------
const SEED = 42;
const WORLD_SIZE = 400;
const WATER_LEVEL = 0;
const EYE_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.4;

// ---------- Números aleatórios com semente ----------
function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (v: number) => THREE.MathUtils.clamp(v, 0, 1);
const lerp = THREE.MathUtils.lerp;

// ---------- Ruído para o relevo ----------
const perm = new Uint8Array(512);
{
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}
const hash = (x: number, z: number) => perm[(perm[x & 255] + z) & 255] / 255;

function valueNoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const u = smooth(x - ix), v = smooth(z - iz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, z: number) {
  let sum = 0, amp = 0.5, freq = 1, total = 0;
  for (let o = 0; o < 5; o++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    total += amp; amp *= 0.5; freq *= 2;
  }
  return sum / total;
}

function heightAt(x: number, z: number) {
  let h = (fbm(x * 0.012 + 100, z * 0.012 + 100) - 0.45) * 40;
  const lake = Math.hypot(x - 60, z + 40);
  h -= Math.max(0, 1 - lake / 55) * 14;
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += Math.max(0, edge - 160) * 0.6;
  return h;
}

// ---------- Cena, câmera e renderizador ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.6;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const fog = new THREE.Fog(0xcfe3f0, 60, 320);
scene.fog = fog;

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);

// ---------- Céu, sol, lua e estrelas ----------
const sky = new Sky();
sky.scale.setScalar(10000);
const skyU = (sky.material as THREE.ShaderMaterial).uniforms;
skyU['mieDirectionalG'].value = 0.8;
scene.add(sky);

const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a5a2a, 0.7);
scene.add(hemi);

const sunLight = new THREE.DirectionalLight(0xfff1d6, 2.2);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
Object.assign(sunLight.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 400 });
scene.add(sunLight, sunLight.target);

const moon = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 16),
  new THREE.MeshBasicMaterial({ color: 0xf4f1e0, fog: false }));
scene.add(moon);

const stars = (() => {
  const N = 2500, pos = new Float32Array(N * 3), v = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    v.randomDirection().multiplyScalar(900);
    if (v.y < 0) v.y = -v.y;
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false,
    transparent: true, opacity: 0, fog: false, depthWrite: false });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return pts;
})();

// ---------- Nuvens ----------
function cloudTexture() {
  const S = 256, r = mulberry32(SEED + 999);
  const octaves = [8, 16, 32, 64].map(p => ({ p, g: Array.from({ length: p * p }, () => r()) }));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0, amp = 0.5, tot = 0;
    for (const { p, g } of octaves) {
      const fx = (x / S) * p, fy = (y / S) * p;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = smooth(fx - ix), ty = smooth(fy - iy);
      const at = (i: number, j: number) => g[(j % p) * p + (i % p)];
      const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
      v += (a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty) * amp;
      tot += amp; amp *= 0.5;
    }
    const alpha = clamp01((v / tot - 0.42) * 3.2);
    const k = (y * S + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
    img.data[k + 3] = alpha * 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
}
function edgeFade() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, '#fff'); g.addColorStop(1, '#000');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
const cloudMap = cloudTexture();
const cloudMat = new THREE.MeshBasicMaterial({ map: cloudMap, alphaMap: edgeFade(), transparent: true,
  opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide });
const cloudGeo = new THREE.PlaneGeometry(3000, 3000);
cloudGeo.rotateX(-Math.PI / 2);
const clouds = new THREE.Mesh(cloudGeo, cloudMat);
scene.add(clouds);

// ---------- Chuva ----------
const DROPS = 4000, RAIN_AREA = 45, RAIN_HEIGHT = 30;
const drops = Array.from({ length: DROPS }, () => ({
  x: (Math.random() - 0.5) * RAIN_AREA * 2, y: Math.random() * RAIN_HEIGHT, z: (Math.random() - 0.5) * RAIN_AREA * 2 }));
const rainPos = new Float32Array(DROPS * 6);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0x9fb3c8, transparent: true, opacity: 0.55 });
const rain = new THREE.LineSegments(rainGeo, rainMat);
rain.frustumCulled = false;
scene.add(rain);

// ---------- Terreno ----------
const terrainGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 200, 200);
terrainGeo.rotateX(-Math.PI / 2);
{
  const pos = terrainGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const sand = new THREE.Color(0xc8b98a), grass = new THREE.Color(0x5b8c3a),
        darkGrass = new THREE.Color(0x3f6b2a), rock = new THREE.Color(0x7d7a74);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
    pos.setY(i, h);
    if (h < WATER_LEVEL + 1.2) c.copy(sand);
    else if (h > 14) c.copy(rock);
    else c.copy(grass).lerp(darkGrass, fbm(x * 0.05, z * 0.05));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();
}
const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
terrain.receiveShadow = true;
scene.add(terrain);

// ---------- Água ----------
const waterGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
waterGeo.rotateX(-Math.PI / 2);
const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({
  color: 0x2f6f8f, transparent: true, opacity: 0.8, roughness: 0.1, metalness: 0.1 }));
water.position.y = WATER_LEVEL;
scene.add(water);

// ---------- Colisores ----------
type Collider = { x: number; z: number; r: number };
const colliders: Collider[] = [];

const spawn = new THREE.Vector3();
for (let r = 0; r < 150; r += 2) {
  const a = r * 0.7, x = Math.cos(a) * r, z = Math.sin(a) * r;
  if (heightAt(x, z) > 1.5) { spawn.set(x, heightAt(x, z), z); break; }
}
const farFromSpawn = (x: number, z: number) => Math.hypot(x - spawn.x, z - spawn.z) > 8;

// ---------- Árvores ----------
const dummy = new THREE.Object3D();
{
  const COUNT = 600;
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 4, 6).translate(0, 2, 0);
  const leafGeo = new THREE.ConeGeometry(2, 5, 7).translate(0, 6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b4a2f }), COUNT);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x2f5d2a, flatShading: true }), COUNT);
  let n = 0;
  for (let tries = 0; n < COUNT && tries < COUNT * 20; tries++) {
    const x = (rand() - 0.5) * (WORLD_SIZE - 20), z = (rand() - 0.5) * (WORLD_SIZE - 20);
    const h = heightAt(x, z);
    if (h < 1.5 || h > 14 || !farFromSpawn(x, z)) continue;
    const s = 0.8 + rand() * 0.6;
    dummy.position.set(x, h - 0.2, z);
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    trunks.setMatrixAt(n, dummy.matrix);
    leaves.setMatrixAt(n, dummy.matrix);
    colliders.push({ x, z, r: 0.35 * s });
    n++;
  }
  trunks.count = leaves.count = n;
  trunks.castShadow = leaves.castShadow = true;
  scene.add(trunks, leaves);
}

// ---------- Pedras ----------
{
  const COUNT = 250;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x8a8782, flatShading: true, roughness: 0.9 }), COUNT);
  let n = 0;
  for (let tries = 0; n < COUNT && tries < COUNT * 20; tries++) {
    const x = (rand() - 0.5) * (WORLD_SIZE - 20), z = (rand() - 0.5) * (WORLD_SIZE - 20);
    const h = heightAt(x, z);
    if (h < -1 || !farFromSpawn(x, z)) continue;
    const sx = 0.4 + rand() * 1.4, sy = 0.3 + rand() * 0.9, sz = 0.4 + rand() * 1.4;
    dummy.position.set(x, h + sy * 0.3, z);
    dummy.rotation.set(rand(), rand() * Math.PI * 2, rand());
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    rocks.setMatrixAt(n, dummy.matrix);
    colliders.push({ x, z, r: Math.max(sx, sz) * 0.85 });
    n++;
  }
  rocks.count = n;
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);
}

// ---------- Personagem provisório ----------
const agent = new THREE.Group();
{
  const skin = new THREE.MeshStandardMaterial({ color: 0xc58c64 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 4, 8), skin);
  body.position.y = 0.78;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), skin);
  head.position.y = 1.72;
  body.castShadow = head.castShadow = true;
  agent.add(body, head);
  const ax = spawn.x + 5, az = spawn.z + 2;
  agent.position.set(ax, heightAt(ax, az), az);
  colliders.push({ x: ax, z: az, r: 0.35 });
  scene.add(agent);
}

// ---------- Interface ----------
const overlay = document.createElement('div');
overlay.id = 'overlay';
overlay.innerHTML = `<h1>PROJETO CIVILIZAÇÃO 3D</h1>
  <p>Clique para entrar</p>
  <p>WASD mover · Mouse olhar · Shift correr · Espaço pular · T acelerar o tempo · Esc sair</p>`;
const crosshair = document.createElement('div');
crosshair.id = 'crosshair';
const info = document.createElement('div');
info.id = 'info';
document.body.append(overlay, crosshair, info);

const controls = new PointerLockControls(camera, renderer.domElement);
overlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => overlay.classList.add('hidden'));
controls.addEventListener('unlock', () => overlay.classList.remove('hidden'));

// velocidade do tempo (apenas para testes no navegador)
const SPEEDS = [1, 60, 600, 3600];
let speedIndex = 0;
let timeOffsetMs = 0;

const keys = new Set<string>();
window.addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'KeyT') speedIndex = (speedIndex + 1) % SPEEDS.length;
});
window.addEventListener('keyup', e => keys.delete(e.code));

// ---------- Jogador ----------
const player = { pos: spawn.clone(), vy: 0, onGround: true };
camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT, player.pos.z);
camera.lookAt(agent.position.x, agent.position.y + 1.5, agent.position.z);

const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
let bobTime = 0;

function updatePlayer(dt: number) {
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  right.crossVectors(fwd, UP).normalize();

  const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  move.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, s);

  const ground = heightAt(player.pos.x, player.pos.z);
  const inWater = ground < WATER_LEVEL - 0.6;
  let speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 9 : 5;
  if (inWater) speed *= 0.45;

  if (move.lengthSq() > 0) {
    move.normalize();
    player.pos.x += move.x * speed * dt;
    player.pos.z += move.z * speed * dt;
    bobTime += dt * speed;
  }

  for (const c of colliders) {
    const dx = player.pos.x - c.x, dz = player.pos.z - c.z;
    const d = Math.hypot(dx, dz), min = c.r + PLAYER_RADIUS;
    if (d < min && d > 1e-4) {
      player.pos.x = c.x + (dx / d) * min;
      player.pos.z = c.z + (dz / d) * min;
    }
  }
  const lim = WORLD_SIZE / 2 - 5;
  player.pos.x = THREE.MathUtils.clamp(player.pos.x, -lim, lim);
  player.pos.z = THREE.MathUtils.clamp(player.pos.z, -lim, lim);

  if (keys.has('Space') && player.onGround) { player.vy = inWater ? 3 : 8; player.onGround = false; }
  player.vy -= 25 * dt;
  player.pos.y += player.vy * dt;
  const floor = Math.max(heightAt(player.pos.x, player.pos.z), WATER_LEVEL - 1.3);
  if (player.pos.y <= floor) { player.pos.y = floor; player.vy = 0; player.onGround = true; }

  const bob = player.onGround && move.lengthSq() > 0 ? Math.sin(bobTime * 1.6) * 0.05 : 0;
  camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT + bob, player.pos.z);
}

// ---------- Céu e clima a cada quadro ----------
const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
const C = {
  fogDay: new THREE.Color(0xcfe3f0), fogCloudy: new THREE.Color(0x9aa3ab), fogNight: new THREE.Color(0x0b1020),
  sunLow: new THREE.Color(0xffa060), sunHigh: new THREE.Color(0xfff1d6), moonLight: new THREE.Color(0x8fa8ff),
  hemiSkyDay: new THREE.Color(0xbfd8ff), hemiSkyNight: new THREE.Color(0x1a2440),
  hemiGroundDay: new THREE.Color(0x4a5a2a), hemiGroundNight: new THREE.Color(0x0a0a08),
};
let lightning = 0;
let cloudDrift = 0;

function updateSky(dt: number) {
  const now = Date.now() + timeOffsetMs;
  const { sol, lua, luzDoDia: day, clima } = estadoDoCeu(now, SEED);
  const deg = THREE.MathUtils.degToRad;

  sunDir.setFromSphericalCoords(1, deg(90 - sol.elevacao), deg(sol.azimute));
  moonDir.setFromSphericalCoords(1, deg(90 - lua.elevacao), deg(lua.azimute));

  // céu
  skyU['sunPosition'].value.copy(sunDir);
  skyU['turbidity'].value = 2 + clima.nuvens * 14;
  skyU['rayleigh'].value = lerp(0.4, 2.5, day) * (1 - clima.nuvens * 0.5);
  skyU['mieCoefficient'].value = 0.005 + clima.nuvens * 0.02;

  // relâmpagos
  if (clima.tempestade > 0.5 && Math.random() < dt * 0.25) lightning = 1;
  lightning = Math.max(0, lightning - dt * 5);

  renderer.toneMappingExposure = lerp(0.3, 0.6, day) * (1 - 0.3 * clima.nuvens) + lightning * 0.8;

  // luz direcional: sol de dia, lua à noite
  const lightDir = sol.elevacao > -2 ? sunDir : moonDir;
  if (sol.elevacao > -2) {
    sunLight.intensity = 2.4 * smooth(clamp01(sol.elevacao / 10)) * (1 - 0.75 * clima.nuvens);
    sunLight.color.copy(C.sunLow).lerp(C.sunHigh, clamp01(sol.elevacao / 25));
  } else {
    sunLight.intensity = 0.35 * (1 - 0.7 * clima.nuvens) * clamp01(lua.elevacao / 10);
    sunLight.color.copy(C.moonLight);
  }
  sunLight.position.copy(player.pos).addScaledVector(lightDir, 150);
  sunLight.target.position.copy(player.pos);

  hemi.intensity = lerp(0.1, 0.75, day) * (1 - 0.25 * clima.nuvens) + lightning * 3;
  hemi.color.copy(C.hemiSkyNight).lerp(C.hemiSkyDay, day);
  hemi.groundColor.copy(C.hemiGroundNight).lerp(C.hemiGroundDay, day);

  // neblina
  const dayFog = C.fogDay.clone().lerp(C.fogCloudy, clima.nuvens);
  fog.color.copy(C.fogNight).lerp(dayFog, day);
  fog.far = lerp(340, 60, Math.max(clima.neblina, clima.chuva * 0.5));
  fog.near = fog.far * 0.15;

  // lua e estrelas acompanham a câmera
  moon.position.copy(camera.position).addScaledVector(moonDir, 850);
  moon.visible = lua.elevacao > -3;
  stars.position.copy(camera.position);
  (stars.material as THREE.PointsMaterial).opacity = (1 - day) * (1 - clima.nuvens);

  // nuvens
  cloudDrift += dt * (0.002 + clima.vento * 0.01);
  cloudMap.offset.set(cloudDrift, cloudDrift * 0.4);
  clouds.position.set(camera.position.x, camera.position.y + 140, camera.position.z);
  cloudMat.opacity = clamp01(clima.nuvens * 1.1);
  cloudMat.color.setScalar(lerp(0.12, 1, day) * (1 - 0.45 * clima.chuva) + lightning);

  // chuva
  const active = Math.floor(DROPS * clima.chuva);
  rain.visible = active > 0;
  if (active > 0) {
    const slant = clima.vento * 0.35;
    for (let i = 0; i < active; i++) {
      const d = drops[i];
      d.y -= 28 * dt;
      if (d.y < 0) d.y += RAIN_HEIGHT;
      rainPos.set([d.x, d.y, d.z, d.x + slant, d.y + 0.7, d.z], i * 6);
    }
    rainGeo.setDrawRange(0, active * 2);
    rainGeo.attributes.position.needsUpdate = true;
    rain.position.set(camera.position.x, camera.position.y - 10, camera.position.z);
  }

  return estadoDoCeu(now, SEED);
}

// ---------- Loop ----------
const clock = new THREE.Clock();
let fpsTime = 0, frames = 0, fps = 0;
const pad = (n: number) => String(n).padStart(2, '0');

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  timeOffsetMs += dt * 1000 * (SPEEDS[speedIndex] - 1);

  if (controls.isLocked) updatePlayer(dt);
  const { tempo, clima } = updateSky(dt);

  agent.children[0].scale.y = 1 + Math.sin(clock.elapsedTime * 2) * 0.015;

  frames++; fpsTime += dt;
  if (fpsTime >= 0.5) { fps = Math.round(frames / fpsTime); frames = 0; fpsTime = 0; }
  info.innerHTML =
    `Ano ${tempo.ano} · Dia ${tempo.diaDoAno}/${TEMPO.DIAS_POR_ANO} · ${tempo.estacao} · ${pad(tempo.hora)}:${pad(tempo.minuto)}<br>` +
    `${clima.tipo} · ${clima.temperatura.toFixed(1)} °C · vento ${Math.round(clima.vento * 40)} km/h<br>` +
    `Tempo ×${SPEEDS[speedIndex]} (T) · FPS ${fps} · seed ${SEED}`;

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});