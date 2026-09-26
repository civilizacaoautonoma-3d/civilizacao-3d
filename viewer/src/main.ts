import './style.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { estadoDoCeu, TEMPO } from '../../shared/clima';
import { SEED, WORLD_SIZE, WATER_LEVEL, heightAt, fbm, mulberry32, smooth,
         ARVORES, PEDRAS, PONTO_INICIAL, resolverColisao } from '../../shared/mundo';
import type { MensagemServidor } from '../../shared/protocolo';
import { criarArbustos, atualizarFrutos } from './arbustos';
import { agentes, iniciarAgentes, aplicarEntidades, animarAgentes } from './agentes';
import { animais, iniciarAnimais, aplicarAnimais, animarAnimais, contarAnimais } from './animais';
import { atualizarPainel } from './painel';
import { ehToque, toque, iniciarToque } from './toque';

const EYE_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.4;
const SERVIDOR = `ws://${location.hostname}:8080`;

const clamp01 = (v: number) => THREE.MathUtils.clamp(v, 0, 1);
const lerp = THREE.MathUtils.lerp;

// ---------- Cena, câmera e renderizador ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, ehToque ? 1.5 : 2));   // celular: menos pixels, mais FPS
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
sunLight.shadow.mapSize.set(ehToque ? 1024 : 2048, ehToque ? 1024 : 2048);
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
const rain = new THREE.LineSegments(rainGeo,
  new THREE.LineBasicMaterial({ color: 0x9fb3c8, transparent: true, opacity: 0.55 }));
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
  color: 0x2f6f8f, transparent: true, opacity: 0.62, roughness: 0.1, metalness: 0.1 }));   // dá para ver os peixes de perto
water.position.y = WATER_LEVEL;
scene.add(water);

// ---------- Árvores e pedras (mesma geração do servidor) ----------
const dummy = new THREE.Object3D();
{
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 4, 6).translate(0, 2, 0);
  const leafGeo = new THREE.ConeGeometry(2, 5, 7).translate(0, 6, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b4a2f }), ARVORES.length);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x2f5d2a, flatShading: true }), ARVORES.length);
  ARVORES.forEach((a, i) => {
    dummy.position.set(a.x, a.h - 0.2, a.z);
    dummy.rotation.set(0, a.rotacao, 0);
    dummy.scale.setScalar(a.escala);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    leaves.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = leaves.castShadow = true;
  scene.add(trunks, leaves);

  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x8a8782, flatShading: true, roughness: 0.9 }), PEDRAS.length);
  PEDRAS.forEach((p, i) => {
    dummy.position.set(p.x, p.h + p.sy * 0.3, p.z);
    dummy.rotation.set(p.rx, p.ry, p.rz);
    dummy.scale.set(p.sx, p.sy, p.sz);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  });
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);
}

// ---------- Arbustos e agentes ----------
criarArbustos(scene);
iniciarAgentes(scene);
iniciarAnimais(scene);

// ---------- Conexão com o motor ----------
const relogio = { msMundo: Date.now(), recebidoEm: performance.now(), velocidade: 1 };
let ws: WebSocket | null = null;
let conectado = false;

function conectar() {
  ws = new WebSocket(SERVIDOR);
  ws.onopen = () => { conectado = true; };
  ws.onclose = () => { conectado = false; setTimeout(conectar, 2000); };
  ws.onmessage = ev => {
    const msg = JSON.parse(String(ev.data)) as MensagemServidor;
    if (msg.tipo === 'estado') {
      relogio.msMundo = msg.msMundo;
      relogio.recebidoEm = performance.now();
      relogio.velocidade = msg.velocidade;
      aplicarEntidades(msg.entidades);
      aplicarAnimais(msg.animais ?? [], msg.carcacas ?? []);
      atualizarFrutos(msg.frutos);
    }
  };
}
conectar();
const msAgora = () => relogio.msMundo + (performance.now() - relogio.recebidoEm) * relogio.velocidade;

// ---------- Interface ----------
const overlay = document.createElement('div');
overlay.id = 'overlay';
overlay.innerHTML = `<h1>PROJETO CIVILIZAÇÃO 3D</h1>
  <p>${ehToque ? 'Toque para entrar' : 'Clique para entrar'}</p>
  <p>${ehToque
    ? 'Joystick à esquerda para andar · arraste à direita para olhar · F ir até o próximo ser vivo · T acelerar o tempo'
    : 'WASD mover · Mouse olhar · Shift correr · Espaço pular · T acelerar o tempo · F ir até o próximo ser vivo · Esc sair'}</p>`;
const crosshair = document.createElement('div');
crosshair.id = 'crosshair';
const info = document.createElement('div');
info.id = 'info';
document.body.append(overlay, crosshair, info);

const controls = new PointerLockControls(camera, renderer.domElement);
const alternarTempo = () => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ tipo: 'alternar-velocidade' })); };
const telaDeToque = ehToque ? iniciarToque(camera, { proximo: () => irAoProximo(), tempo: alternarTempo }) : null;
overlay.addEventListener('click', () => {
  if (telaDeToque) { telaDeToque.ativar(); overlay.classList.add('hidden'); }
  else controls.lock();
});
controls.addEventListener('lock', () => overlay.classList.add('hidden'));
controls.addEventListener('unlock', () => overlay.classList.remove('hidden'));

const keys = new Set<string>();
window.addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'KeyT') alternarTempo();
  if (e.code === 'KeyF') irAoProximo();
});
window.addEventListener('keyup', e => keys.delete(e.code));

// ---------- Jogador (observador) ----------
const player = { pos: new THREE.Vector3(PONTO_INICIAL.x, PONTO_INICIAL.y, PONTO_INICIAL.z), vy: 0, onGround: true };
camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT, player.pos.z);
camera.lookAt(player.pos.x + 5, player.pos.y + 1.5, player.pos.z);

const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
let bobTime = 0;

function updatePlayer(dt: number) {
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  right.crossVectors(fwd, UP).normalize();

  const f = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + toque.frente;
  const s = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + toque.lado;
  move.set(0, 0, 0).addScaledVector(fwd, f).addScaledVector(right, s);

  const inWater = heightAt(player.pos.x, player.pos.z) < WATER_LEVEL - 0.6;
  let speed = keys.has('ShiftLeft') || keys.has('ShiftRight') || toque.correr ? 9 : 5;
  if (inWater) speed *= 0.45;

  if (move.lengthSq() > 0) {
    if (move.lengthSq() > 1) move.normalize();   // o joystick permite andar devagar
    player.pos.x += move.x * speed * dt;
    player.pos.z += move.z * speed * dt;
    bobTime += dt * speed;
  }

  resolverColisao(player.pos, PLAYER_RADIUS);
  for (const v of agentes.values()) {
    const dx = player.pos.x - v.grupo.position.x, dz = player.pos.z - v.grupo.position.z;
    const d = Math.hypot(dx, dz), min = 0.35 + PLAYER_RADIUS;
    if (d < min && d > 1e-4) {
      player.pos.x = v.grupo.position.x + (dx / d) * min;
      player.pos.z = v.grupo.position.z + (dz / d) * min;
    }
  }
  const lim = WORLD_SIZE / 2 - 5;
  player.pos.x = THREE.MathUtils.clamp(player.pos.x, -lim, lim);
  player.pos.z = THREE.MathUtils.clamp(player.pos.z, -lim, lim);

  if ((keys.has('Space') || toque.pular) && player.onGround) { player.vy = inWater ? 3 : 8; player.onGround = false; }
  player.vy -= 25 * dt;
  player.pos.y += player.vy * dt;
  const floor = Math.max(heightAt(player.pos.x, player.pos.z), WATER_LEVEL - 1.3);
  if (player.pos.y <= floor) { player.pos.y = floor; player.vy = 0; player.onGround = true; }

  const bob = player.onGround && move.lengthSq() > 0 ? Math.sin(bobTime * 1.6) * 0.05 : 0;
  camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT + bob, player.pos.z);
}

// ---------- Encontrar os seres vivos (só o observador se move; a simulação não muda) ----------
let proximoAlvo = 0;
function irAoProximo() {
  const alvos: THREE.Vector3[] = [...agentes.values()].map(v => v.grupo.position);
  const bichos = [...animais.values()].map(v => v.grupo.position)
    .sort((a, b) => a.distanceToSquared(player.pos) - b.distanceToSquared(player.pos));
  alvos.push(...bichos);
  if (!alvos.length) return;
  const alvo = alvos[proximoAlvo++ % alvos.length];
  // fica a 5 m do alvo, do lado de onde vem, e olha para ele
  const dx = player.pos.x - alvo.x, dz = player.pos.z - alvo.z, d = Math.hypot(dx, dz) || 1;
  player.pos.set(alvo.x + (dx / d) * 5, 0, alvo.z + (dz / d) * 5);
  player.pos.y = Math.max(heightAt(player.pos.x, player.pos.z), WATER_LEVEL - 1.3);
  player.vy = 0;
  camera.position.set(player.pos.x, player.pos.y + EYE_HEIGHT, player.pos.z);
  camera.lookAt(alvo.x, alvo.y + 0.6, alvo.z);
}

const ROSA = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
function ondeEsta(p: THREE.Vector3) {
  const dx = p.x - player.pos.x, dz = p.z - player.pos.z;
  const ang = (Math.atan2(dx, -dz) * 180) / Math.PI;   // norte = -z
  return `${Math.round(Math.hypot(dx, dz))} m ${ROSA[Math.round(((ang + 360) % 360) / 45) % 8]}`;
}

// ---------- Céu e clima a cada quadro ----------
const sunDir = new THREE.Vector3(), moonDir = new THREE.Vector3();
const C = {
  fogDay: new THREE.Color(0xcfe3f0), fogCloudy: new THREE.Color(0x9aa3ab), fogNight: new THREE.Color(0x1c2744),
  sunLow: new THREE.Color(0xffa060), sunHigh: new THREE.Color(0xfff1d6), moonLight: new THREE.Color(0x8fa8ff),
  hemiSkyDay: new THREE.Color(0xbfd8ff), hemiSkyNight: new THREE.Color(0x6878b0),
  hemiGroundDay: new THREE.Color(0x4a5a2a), hemiGroundNight: new THREE.Color(0x262a22),
};
const dayFog = new THREE.Color();
let lightning = 0;
let cloudDrift = 0;

function updateSky(dt: number) {
  const ceu = estadoDoCeu(msAgora(), SEED);
  const { sol, lua, luzDoDia: day, clima } = ceu;
  const deg = THREE.MathUtils.degToRad;

  sunDir.setFromSphericalCoords(1, deg(90 - sol.elevacao), deg(sol.azimute));
  moonDir.setFromSphericalCoords(1, deg(90 - lua.elevacao), deg(lua.azimute));

  skyU['sunPosition'].value.copy(sunDir);
  skyU['turbidity'].value = 2 + clima.nuvens * 14;
  skyU['rayleigh'].value = lerp(0.4, 2.5, day) * (1 - clima.nuvens * 0.5);
  skyU['mieCoefficient'].value = 0.005 + clima.nuvens * 0.02;

  if (clima.tempestade > 0.5 && Math.random() < dt * 0.25) lightning = 1;
  lightning = Math.max(0, lightning - dt * 5);

  // noite mais clara: exposição mínima maior
  // a noite é escura, mas o observador precisa enxergar as silhuetas (só visual: a simulação tem sua própria visão noturna)
  renderer.toneMappingExposure = lerp(0.6, 0.6, day) * (1 - 0.3 * clima.nuvens) + lightning * 0.8;

  const lightDir = sol.elevacao > -2 ? sunDir : moonDir;
  if (sol.elevacao > -2) {
    sunLight.intensity = 2.4 * smooth(clamp01(sol.elevacao / 10)) * (1 - 0.75 * clima.nuvens);
    sunLight.color.copy(C.sunLow).lerp(C.sunHigh, clamp01(sol.elevacao / 25));
  } else {
    sunLight.intensity = 1.3 * (1 - 0.5 * clima.nuvens) * Math.max(0.5, clamp01(lua.elevacao / 10));
    sunLight.color.copy(C.moonLight);
  }
  sunLight.position.copy(player.pos).addScaledVector(lightDir, 150);
  sunLight.target.position.copy(player.pos);

  hemi.intensity = lerp(0.85, 0.75, day) * (1 - 0.25 * clima.nuvens) + lightning * 3;
  hemi.color.copy(C.hemiSkyNight).lerp(C.hemiSkyDay, day);
  hemi.groundColor.copy(C.hemiGroundNight).lerp(C.hemiGroundDay, day);

  dayFog.copy(C.fogDay).lerp(C.fogCloudy, clima.nuvens);
  fog.color.copy(C.fogNight).lerp(dayFog, day);
  fog.far = lerp(340, 60, Math.max(clima.neblina, clima.chuva * 0.5));
  fog.near = fog.far * 0.15;

  moon.position.copy(camera.position).addScaledVector(moonDir, 850);
  moon.visible = lua.elevacao > -3;
  stars.position.copy(camera.position);
  (stars.material as THREE.PointsMaterial).opacity = (1 - day) * (1 - clima.nuvens);

  cloudDrift += dt * (0.002 + clima.vento * 0.01);
  cloudMap.offset.set(cloudDrift, cloudDrift * 0.4);
  clouds.position.set(camera.position.x, camera.position.y + 140, camera.position.z);
  cloudMat.opacity = clamp01(clima.nuvens * 1.1);
  cloudMat.color.setScalar(lerp(0.25, 1, day) * (1 - 0.45 * clima.chuva) + lightning);

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
  return ceu;
}

// ---------- Loop ----------
const clock = new THREE.Clock();
let fpsTime = 0, frames = 0, fps = 0;
const pad = (n: number) => String(n).padStart(2, '0');

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (controls.isLocked || toque.ativo) updatePlayer(dt);
  animarAgentes(dt);
  animarAnimais(dt, camera);
  atualizarPainel(camera);
  const { tempo, clima } = updateSky(dt);

  const bichos = contarAnimais();
  frames++; fpsTime += dt;
  if (fpsTime >= 0.5) { fps = Math.round(frames / fpsTime); frames = 0; fpsTime = 0; }
  info.innerHTML =
    `Ano ${tempo.ano} · Dia ${tempo.diaDoAno}/${TEMPO.DIAS_POR_ANO} · ${tempo.estacao} · ${pad(tempo.hora)}:${pad(tempo.minuto)}<br>` +
    `${clima.tipo} · ${clima.temperatura.toFixed(1)} °C · vento ${Math.round(clima.vento * 40)} km/h<br>` +
    `Servidor ${conectado ? 'conectado' : 'desconectado'} · ${agentes.size} agentes · tempo ×${relogio.velocidade} (T) · FPS ${fps}<br>` +
    `${bichos.coelho} coelhos · ${bichos.cervo} cervos · ${bichos.lobo} lobos · ${bichos.javali} javalis · ${bichos.ave} pássaros · ${bichos.peixe} peixes (F para ir até eles)<br>` +
    [...agentes.values()].map(v => `${v.dados.nome}: ${ondeEsta(v.grupo.position)}`).join(' · ');

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
