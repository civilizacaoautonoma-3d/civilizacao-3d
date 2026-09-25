// Mapa mental: cada agente conhece só o terreno que já viu (grade de 5 m).
// Onde nunca olhou, supõe que dá para passar — e às vezes erra. Quando esbarra na água, aprende e recalcula a rota.
import { WORLD_SIZE } from '../../shared/mundo';
import { terraSeca, type Ponto } from './espaco';

export const CELULA_MAPA = 5;
export const LADO_MAPA = WORLD_SIZE / CELULA_MAPA;
export const DESCONHECIDO = 0, LIVRE = 1, AGUA = 2;

// como o terreno é de verdade (o agente só descobre olhando). Uma célula só é "livre" se dá para
// atravessá-la inteira: basta um córrego estreito cortando a célula para ela contar como água.
const VERDADE = new Uint8Array(LADO_MAPA * LADO_MAPA);
for (let c = 0; c < VERDADE.length; c++) {
  const { x, z } = centroDaCelulaMapa(c);
  let livre = true;
  for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) if (!terraSeca(x + dx, z + dz)) livre = false;
  VERDADE[c] = livre ? LIVRE : AGUA;
}

export function celulaMapa(x: number, z: number) {
  const i = Math.floor((x + WORLD_SIZE / 2) / CELULA_MAPA), j = Math.floor((z + WORLD_SIZE / 2) / CELULA_MAPA);
  if (i < 0 || j < 0 || i >= LADO_MAPA || j >= LADO_MAPA) return -1;
  return j * LADO_MAPA + i;
}

export function centroDaCelulaMapa(c: number): Ponto {
  const i = c % LADO_MAPA, j = Math.floor(c / LADO_MAPA);
  return { x: (i + 0.5) * CELULA_MAPA - WORLD_SIZE / 2, z: (j + 0.5) * CELULA_MAPA - WORLD_SIZE / 2 };
}

export const novoMapa = (): number[] => new Array(LADO_MAPA * LADO_MAPA).fill(DESCONHECIDO);

// registra o que o agente enxerga: células dentro do alcance e do cone de visão
export function observar(mapa: number[], x: number, z: number, alcance: number, olhando: number, meioCone: number) {
  const r = Math.ceil(alcance / CELULA_MAPA);
  const c0 = celulaMapa(x, z);
  if (c0 < 0) return 0;
  const i0 = c0 % LADO_MAPA, j0 = Math.floor(c0 / LADO_MAPA);
  let novas = 0;
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = i0 + di, j = j0 + dj;
    if (i < 0 || j < 0 || i >= LADO_MAPA || j >= LADO_MAPA) continue;
    const c = j * LADO_MAPA + i;
    const { x: cx, z: cz } = centroDaCelulaMapa(c);
    const d = Math.hypot(cx - x, cz - z);
    if (d > alcance) continue;
    if (d > CELULA_MAPA) {
      let ang = Math.atan2(cx - x, cz - z) - olhando;
      ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      if (Math.abs(ang) > meioCone) continue;
    }
    if (mapa[c] === DESCONHECIDO) novas++;
    if (mapa[c] !== AGUA) mapa[c] = VERDADE[c];   // a água que aprendeu esbarrando não se desfaz com uma olhada
  }
  return novas;
}

// aprende na marra: tentou passar e era água
export function marcarAgua(mapa: number[], x: number, z: number) {
  const c = celulaMapa(x, z);
  if (c >= 0) mapa[c] = AGUA;
}

export const conhecidas = (mapa: number[]) => mapa.reduce((n, v) => n + (v !== DESCONHECIDO ? 1 : 0), 0);

// ---------- Rota (A*) sobre o que o agente acredita saber do terreno ----------
const VIZ = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

// fila de prioridade mínima (heap binário) para o A*
class Fila {
  private f: number[] = []; private c: number[] = [];
  get tamanho() { return this.c.length; }
  push(prioridade: number, celula: number) {
    this.f.push(prioridade); this.c.push(celula);
    let i = this.c.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[p] <= this.f[i]) break;
      [this.f[p], this.f[i]] = [this.f[i], this.f[p]]; [this.c[p], this.c[i]] = [this.c[i], this.c[p]];
      i = p;
    }
  }
  pop(): number {
    const topo = this.c[0];
    const uf = this.f.pop()!, uc = this.c.pop()!;
    if (this.c.length) {
      this.f[0] = uf; this.c[0] = uc;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.c.length && this.f[l] < this.f[m]) m = l;
        if (r < this.c.length && this.f[r] < this.f[m]) m = r;
        if (m === i) break;
        [this.f[m], this.f[i]] = [this.f[i], this.f[m]]; [this.c[m], this.c[i]] = [this.c[i], this.c[m]];
        i = m;
      }
    }
    return topo;
  }
}

export function rota(mapa: number[], de: Ponto, para: Ponto, limite = 4000): Ponto[] | null {
  const ini = celulaMapa(de.x, de.z), fim = celulaMapa(para.x, para.z);
  if (ini < 0 || fim < 0) return null;
  if (ini === fim) return [para];
  const fi = fim % LADO_MAPA, fj = Math.floor(fim / LADO_MAPA);
  const h = (c: number) => Math.hypot((c % LADO_MAPA) - fi, Math.floor(c / LADO_MAPA) - fj);
  const g = new Map<number, number>([[ini, 0]]);
  const veio = new Map<number, number>();
  const aberta = new Fila();
  aberta.push(h(ini), ini);
  const fechada = new Set<number>();
  let expandidas = 0;
  while (aberta.tamanho && expandidas++ < limite) {
    const atual = aberta.pop();
    if (atual === fim) break;
    if (fechada.has(atual)) continue;
    fechada.add(atual);
    const ai = atual % LADO_MAPA, aj = Math.floor(atual / LADO_MAPA);
    for (const [di, dj, custo] of VIZ) {
      const i = ai + di, j = aj + dj;
      if (i < 0 || j < 0 || i >= LADO_MAPA || j >= LADO_MAPA) continue;
      const c = j * LADO_MAPA + i;
      if (mapa[c] === AGUA && c !== fim) continue;
      // na diagonal, não corta o canto de uma água conhecida
      if (di && dj && (mapa[aj * LADO_MAPA + i] === AGUA || mapa[j * LADO_MAPA + ai] === AGUA)) continue;
      const passo = custo * (mapa[c] === DESCONHECIDO ? 1.4 : 1);   // o desconhecido pesa um pouco mais
      const ng = g.get(atual)! + passo;
      if (ng < (g.get(c) ?? Infinity)) { g.set(c, ng); veio.set(c, atual); aberta.push(ng + h(c), c); }
    }
  }
  if (!veio.has(fim)) return null;
  // reconstrói e simplifica: só os pontos onde a direção muda
  const celulas: number[] = [];
  for (let c = fim; c !== ini; c = veio.get(c)!) celulas.push(c);
  celulas.reverse();
  const pontos: Ponto[] = [];
  let dirAnt = '';
  for (let n = 0; n < celulas.length; n++) {
    const c = celulas[n], prox = celulas[n + 1];
    const dir = prox === undefined ? 'fim' : `${(prox % LADO_MAPA) - (c % LADO_MAPA)},${Math.floor(prox / LADO_MAPA) - Math.floor(c / LADO_MAPA)}`;
    if (dir !== dirAnt) pontos.push(centroDaCelulaMapa(c));
    dirAnt = dir;
  }
  pontos[pontos.length - 1] = para;
  return pontos;
}
