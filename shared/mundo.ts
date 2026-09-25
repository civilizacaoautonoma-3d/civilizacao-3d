// Geração determinística do mundo: a mesma semente produz o mesmo terreno,
// as mesmas árvores, pedras e arbustos no servidor e no navegador.

export const SEED = 42;
export const WORLD_SIZE = 400;
export const WATER_LEVEL = 0;

export function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const smooth = (t: number) => t * t * (3 - 2 * t);

const rand = mulberry32(SEED);

// ---------- Relevo ----------
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

export function fbm(x: number, z: number) {
  let sum = 0, amp = 0.5, freq = 1, total = 0;
  for (let o = 0; o < 5; o++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    total += amp; amp *= 0.5; freq *= 2;
  }
  return sum / total;
}

export function heightAt(x: number, z: number) {
  let h = (fbm(x * 0.012 + 100, z * 0.012 + 100) - 0.45) * 40;
  const lake = Math.hypot(x - 60, z + 40);
  h -= Math.max(0, 1 - lake / 55) * 14;
  const edge = Math.max(Math.abs(x), Math.abs(z));
  h += Math.max(0, edge - 160) * 0.6;
  return h;
}

// ---------- Objetos do mundo ----------
export interface Obstaculo { x: number; z: number; r: number }
export interface Arvore extends Obstaculo { h: number; escala: number; rotacao: number }
export interface Pedra extends Obstaculo { h: number; sx: number; sy: number; sz: number; rx: number; ry: number; rz: number }

export const PONTO_INICIAL = (() => {
  for (let r = 0; r < 150; r += 2) {
    const a = r * 0.7, x = Math.cos(a) * r, z = Math.sin(a) * r, h = heightAt(x, z);
    if (h > 1.5) return { x, y: h, z };
  }
  return { x: 0, y: heightAt(0, 0), z: 0 };
})();
const longeDoInicio = (x: number, z: number) => Math.hypot(x - PONTO_INICIAL.x, z - PONTO_INICIAL.z) > 12;

export const ARVORES: Arvore[] = [];
for (let t = 0; ARVORES.length < 600 && t < 12000; t++) {
  const x = (rand() - 0.5) * (WORLD_SIZE - 20), z = (rand() - 0.5) * (WORLD_SIZE - 20);
  const h = heightAt(x, z);
  if (h < 1.5 || h > 14 || !longeDoInicio(x, z)) continue;
  const escala = 0.8 + rand() * 0.6;
  ARVORES.push({ x, z, h, escala, rotacao: rand() * Math.PI * 2, r: 0.35 * escala });
}

export const PEDRAS: Pedra[] = [];
for (let t = 0; PEDRAS.length < 250 && t < 5000; t++) {
  const x = (rand() - 0.5) * (WORLD_SIZE - 20), z = (rand() - 0.5) * (WORLD_SIZE - 20);
  const h = heightAt(x, z);
  if (h < -1 || !longeDoInicio(x, z)) continue;
  const sx = 0.4 + rand() * 1.4, sy = 0.3 + rand() * 0.9, sz = 0.4 + rand() * 1.4;
  PEDRAS.push({ x, z, h, sx, sy, sz, rx: rand(), ry: rand() * Math.PI * 2, rz: rand(), r: Math.max(sx, sz) * 0.85 });
}

export const OBSTACULOS: Obstaculo[] = [...ARVORES, ...PEDRAS];

// grade espacial: cada consulta só olha os obstáculos das células vizinhas
const CELULA_OBS = 8;
const gradeObs = new Map<number, Obstaculo[]>();
const chaveObs = (cx: number, cz: number) => (cx + 1000) * 4096 + (cz + 1000);
for (const o of OBSTACULOS) {
  const k = chaveObs(Math.floor(o.x / CELULA_OBS), Math.floor(o.z / CELULA_OBS));
  const lista = gradeObs.get(k);
  if (lista) lista.push(o); else gradeObs.set(k, [o]);
}

export function obstaculosPerto(x: number, z: number): Obstaculo[] {
  const cx = Math.floor(x / CELULA_OBS), cz = Math.floor(z / CELULA_OBS);
  const r: Obstaculo[] = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const lista = gradeObs.get(chaveObs(cx + i, cz + j));
    if (lista) r.push(...lista);
  }
  return r;
}

export function resolverColisao(p: { x: number; z: number }, raio: number) {
  for (const o of obstaculosPerto(p.x, p.z)) {
    const dx = p.x - o.x, dz = p.z - o.z;
    const d = Math.hypot(dx, dz), min = o.r + raio;
    if (d < min && d > 1e-4) {
      p.x = o.x + (dx / d) * min;
      p.z = o.z + (dz / d) * min;
    }
  }
}

// ---------- Arbustos com frutos (gerador próprio: não altera árvores e pedras) ----------
export interface Arbusto { x: number; z: number; h: number; max: number }
export const ARBUSTOS: Arbusto[] = [];
{
  const r = mulberry32(SEED + 1000);
  const livre = (x: number, z: number) => OBSTACULOS.every(o => Math.hypot(o.x - x, o.z - z) > o.r + 1.2);
  // alguns perto do ponto inicial, para os primeiros dias
  for (let t = 0; ARBUSTOS.length < 6 && t < 2000; t++) {
    const ang = r() * Math.PI * 2, d = 12 + r() * 20;
    const x = PONTO_INICIAL.x + Math.cos(ang) * d, z = PONTO_INICIAL.z + Math.sin(ang) * d, h = heightAt(x, z);
    if (h > 1 && h < 12 && livre(x, z)) ARBUSTOS.push({ x, z, h, max: 4 + Math.floor(r() * 4) });
  }
  for (let t = 0; ARBUSTOS.length < 80 && t < 8000; t++) {
    const x = (r() - 0.5) * (WORLD_SIZE - 30), z = (r() - 0.5) * (WORLD_SIZE - 30), h = heightAt(x, z);
    if (h > 1.5 && h < 12 && livre(x, z)) ARBUSTOS.push({ x, z, h, max: 4 + Math.floor(r() * 4) });
  }
}
