// Ecologia: vegetação rasteira (pasto), frutos, carcaças.
import { ARBUSTOS, WORLD_SIZE, heightAt } from '../../shared/mundo';
import type { Estacao } from '../../shared/clima';
import type { Especie } from '../../shared/especies';

// ---------- Pasto: grade de 10 m, cada célula entre 0 (rapada) e 1 (cheia); -1 = sem pasto ----------
export const CELULA_PASTO = 10;
export const LADO_PASTO = WORLD_SIZE / CELULA_PASTO;

export function celulaPasto(x: number, z: number) {
  const i = Math.floor((x + WORLD_SIZE / 2) / CELULA_PASTO), j = Math.floor((z + WORLD_SIZE / 2) / CELULA_PASTO);
  if (i < 0 || j < 0 || i >= LADO_PASTO || j >= LADO_PASTO) return -1;
  return j * LADO_PASTO + i;
}
export function centroDaCelula(c: number) {
  const i = c % LADO_PASTO, j = Math.floor(c / LADO_PASTO);
  return { x: (i + 0.5) * CELULA_PASTO - WORLD_SIZE / 2, z: (j + 0.5) * CELULA_PASTO - WORLD_SIZE / 2 };
}

export function pastoInicial(): number[] {
  const p: number[] = [];
  for (let c = 0; c < LADO_PASTO * LADO_PASTO; c++) {
    const { x, z } = centroDaCelula(c), h = heightAt(x, z);
    p.push(h > 0.8 && h < 16 ? 0.8 : -1);
  }
  return p;
}

// dias para uma área rapada voltar a ficar cheia, por estação
const REBROTA_DIAS: Record<Estacao, number> = { 'Primavera': 12, 'Verão': 20, 'Outono': 28, 'Inverno': 120 };

export function crescerPasto(pasto: number[], horas: number, estacao: Estacao) {
  const taxa = horas / (REBROTA_DIAS[estacao] * 24);
  for (let c = 0; c < pasto.length; c++) if (pasto[c] >= 0 && pasto[c] < 1) pasto[c] = Math.min(1, pasto[c] + taxa);
}

// ---------- Raízes (o javali fuça o solo atrás delas): mesma grade, rebrotam bem devagar ----------
export function raizesIniciais(): number[] {
  const r: number[] = [];
  for (let c = 0; c < LADO_PASTO * LADO_PASTO; c++) {
    const { x, z } = centroDaCelula(c), h = heightAt(x, z);
    r.push(h > 0.8 && h < 14 ? 0.7 : -1);
  }
  return r;
}
const RAIZES_DIAS: Record<Estacao, number> = { 'Primavera': 45, 'Verão': 60, 'Outono': 60, 'Inverno': 150 };
export function crescerRaizes(raizes: number[], horas: number, estacao: Estacao) {
  const taxa = horas / (RAIZES_DIAS[estacao] * 24);
  for (let c = 0; c < raizes.length; c++) if (raizes[c] >= 0 && raizes[c] < 1) raizes[c] = Math.min(1, raizes[c] + taxa);
}

// ---------- Marcas de cheiro: lobos marcam o território, o cheiro some em alguns dias ----------
export interface Marca { grupo: string; x: number; z: number; desde: number }
export const MARCA_DURA = 6 * 24;   // horas
export const limparMarcas = (marcas: Marca[], hora: number) => marcas.filter(m => hora - m.desde < MARCA_DURA).slice(-300);

// ---------- Frutos: crescem por estação e apodrecem se ninguém come ----------
const FATOR_FRUTOS: Record<Estacao, number> = { 'Primavera': 1, 'Verão': 1.4, 'Outono': 0.8, 'Inverno': 0.3 };
const HORAS_ATE_APODRECER = 96;

export function atualizarFrutos(frutos: number[], horas: number, estacao: Estacao, rand: () => number) {
  const fator = FATOR_FRUTOS[estacao];
  ARBUSTOS.forEach((b, i) => {
    if (frutos[i] < b.max && rand() < (horas / 8) * fator) frutos[i]++;
    if (frutos[i] > 0 && rand() < (frutos[i] * horas) / HORAS_ATE_APODRECER) frutos[i]--;
  });
}

// ---------- Carcaças: comida para carnívoros e humanos; estragam e somem ----------
export interface Carcaca {
  id: number; especie: Especie; x: number; z: number; rotacao: number;
  porcoes: number; desde: number;   // hora do mundo em que o animal morreu
}
export const CARNE_ESTRAGA_EM = 36;   // horas
export const CARCACA_SOME_EM = 120;

export const estragada = (c: Carcaca, hora: number) => hora - c.desde > CARNE_ESTRAGA_EM;

export function limparCarcacas(carcacas: Carcaca[], hora: number) {
  return carcacas.filter(c => c.porcoes > 0 && hora - c.desde < CARCACA_SOME_EM);
}
