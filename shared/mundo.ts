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

// ---------- Cavernas (gerador próprio: não altera árvores, pedras e arbustos) ----------
// Abrigos naturais em encostas: um domo de rocha com a boca virada para baixo do morro.
// As paredes são obstáculos (só se entra pela boca); dentro não chove nem venta.
export interface Caverna { id: number; x: number; z: number; r: number; dir: number; h: number; entrada: { x: number; z: number } }
export const CAVERNAS: Caverna[] = [];
{
  const r = mulberry32(SEED + 2000);
  const R = 3.2;
  const livre = (x: number, z: number, raio: number) =>
    OBSTACULOS.every(o => Math.hypot(o.x - x, o.z - z) > o.r + raio) && ARBUSTOS.every(b => Math.hypot(b.x - x, b.z - z) > raio + 1);
  const firme = (x: number, z: number) => { const h = heightAt(x, z); return h > 1.5 && h < 14; };
  for (const inclinacaoMin of [0.3, 0.18, 0]) {
    for (let t = 0; CAVERNAS.length < 4 && t < 20000; t++) {
      // a primeira fica a um dia de caminhada curta do ponto inicial; as outras, espalhadas pelo vale
      let x: number, z: number;
      if (CAVERNAS.length === 0) {
        const ang = r() * Math.PI * 2, d = 45 + r() * 45;
        x = PONTO_INICIAL.x + Math.cos(ang) * d; z = PONTO_INICIAL.z + Math.sin(ang) * d;
      } else { x = (r() - 0.5) * (WORLD_SIZE - 50); z = (r() - 0.5) * (WORLD_SIZE - 50); }
      if (!firme(x, z) || Math.hypot(x - PONTO_INICIAL.x, z - PONTO_INICIAL.z) < 30) continue;
      if (CAVERNAS.some(c => Math.hypot(c.x - x, c.z - z) < 70)) continue;
      const gx = heightAt(x + 3, z) - heightAt(x - 3, z), gz = heightAt(x, z + 3) - heightAt(x, z - 3);
      if (Math.hypot(gx, gz) / 6 < inclinacaoMin) continue;
      const dir = Math.atan2(-gx, -gz);   // boca para baixo do morro (frente = sin dir, cos dir)
      const entrada = { x: x + Math.sin(dir) * (R + 1.6), z: z + Math.cos(dir) * (R + 1.6) };
      if (!firme(entrada.x, entrada.z) || !livre(x, z, R + 1.2) || !livre(entrada.x, entrada.z, 1.5)) continue;
      let dentroFirme = true;
      for (let a = 0; a < 6.28; a += 0.8) if (!firme(x + Math.sin(a) * R, z + Math.cos(a) * R)) dentroFirme = false;
      if (!dentroFirme) continue;
      CAVERNAS.push({ id: CAVERNAS.length, x, z, r: R, dir, h: heightAt(x, z), entrada });
    }
  }
  // uma quinta caverna do outro lado do vale, bem longe do ponto inicial (onde um segundo grupo pode viver)
  {
    const r5 = mulberry32(SEED + 2500);
    let melhor: Caverna | null = null, dist = 0;
    for (const inclinacaoMin of [0.25, 0.12, 0]) {
      for (let t = 0; t < 12000; t++) {
        const x = (r5() - 0.5) * (WORLD_SIZE - 50), z = (r5() - 0.5) * (WORLD_SIZE - 50);
        const d = Math.hypot(x - PONTO_INICIAL.x, z - PONTO_INICIAL.z);
        if (d < 170 || d <= dist || !firme(x, z) || CAVERNAS.some(c => Math.hypot(c.x - x, c.z - z) < 90)) continue;
        const gx = heightAt(x + 3, z) - heightAt(x - 3, z), gz = heightAt(x, z + 3) - heightAt(x, z - 3);
        if (Math.hypot(gx, gz) / 6 < inclinacaoMin) continue;
        const dir = Math.atan2(-gx, -gz);
        const entrada = { x: x + Math.sin(dir) * (R + 1.6), z: z + Math.cos(dir) * (R + 1.6) };
        if (!firme(entrada.x, entrada.z) || !livre(x, z, R + 1.2) || !livre(entrada.x, entrada.z, 1.5)) continue;
        let ok = true;
        for (let a = 0; a < 6.28; a += 0.8) if (!firme(x + Math.sin(a) * R, z + Math.cos(a) * R)) ok = false;
        if (!ok) continue;
        melhor = { id: CAVERNAS.length, x, z, r: R, dir, h: heightAt(x, z), entrada }; dist = d;
      }
      if (melhor) break;
    }
    if (melhor) CAVERNAS.push(melhor);
  }
  // paredes: blocos de rocha em volta, menos na boca
  for (const c of CAVERNAS) {
    for (let a = 0; a < Math.PI * 2; a += 0.42) {
      const rel = Math.atan2(Math.sin(a - c.dir), Math.cos(a - c.dir));
      if (Math.abs(rel) < 0.7) continue;
      const o = { x: c.x + Math.sin(a) * c.r, z: c.z + Math.cos(a) * c.r, r: 0.75 };
      OBSTACULOS.push(o);
      const k = chaveObs(Math.floor(o.x / CELULA_OBS), Math.floor(o.z / CELULA_OBS));
      const lista = gradeObs.get(k);
      if (lista) lista.push(o); else gradeObs.set(k, [o]);
    }
  }
}

// dentro de qual caverna está este ponto (ou nenhuma)
export function cavernaEm(x: number, z: number): Caverna | null {
  for (const c of CAVERNAS) if (Math.hypot(c.x - x, c.z - z) < c.r - 0.5) return c;
  return null;
}

// ---------- Arbustos do outro lado do vale (em volta da quinta caverna), para um segundo grupo poder viver ali ----------
{
  const c5 = CAVERNAS[4];
  if (c5) {
    const r = mulberry32(SEED + 3000);
    const livre = (x: number, z: number) => OBSTACULOS.every(o => Math.hypot(o.x - x, o.z - z) > o.r + 1.2)
      && ARBUSTOS.every(b => Math.hypot(b.x - x, b.z - z) > 4) && !cavernaEm(x, z);
    let postos = 0;
    for (let t = 0; postos < 10 && t < 4000; t++) {
      const ang = r() * Math.PI * 2, d = 15 + r() * 50;
      const x = c5.x + Math.cos(ang) * d, z = c5.z + Math.sin(ang) * d, h = heightAt(x, z);
      if (h > 1 && h < 13 && Math.abs(x) < WORLD_SIZE / 2 - 12 && Math.abs(z) < WORLD_SIZE / 2 - 12 && livre(x, z)) {
        ARBUSTOS.push({ x, z, h, max: 4 + Math.floor(r() * 4) }); postos++;
      }
    }
  }
}
