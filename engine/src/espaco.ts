// Utilidades de espaço usadas por agentes e animais.
import { WATER_LEVEL, WORLD_SIZE, heightAt } from '../../shared/mundo';

export type Ponto = { x: number; z: number };

export const LIMITE = WORLD_SIZE / 2 - 8;
export const distancia = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.z - b.z);

// dá para pisar: terra ou água rasa (até ~30 cm); mais fundo que isso, ninguém entra
export const terraSeca = (x: number, z: number) =>
  Math.abs(x) < LIMITE && Math.abs(z) < LIMITE && heightAt(x, z) > WATER_LEVEL - 0.3;

// água funda o bastante para um peixe nadar
export const naAgua = (x: number, z: number) =>
  Math.abs(x) < LIMITE && Math.abs(z) < LIMITE && heightAt(x, z) < WATER_LEVEL - 0.35;

export function pontoNaAgua(x: number, z: number, rand: () => number, min: number, max: number): Ponto | null {
  for (let i = 0; i < 12; i++) {
    const ang = rand() * Math.PI * 2, d = min + rand() * (max - min);
    const px = x + Math.cos(ang) * d, pz = z + Math.sin(ang) * d;
    if (naAgua(px, pz)) return { x: px, z: pz };
  }
  return null;
}

export function pertoDaAgua(x: number, z: number) {
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2;
    for (const r of [1.5, 3, 5]) if (heightAt(x + Math.cos(ang) * r, z + Math.sin(ang) * r) < WATER_LEVEL) return true;
  }
  return false;
}

export function pontoAleatorio(x: number, z: number, rand: () => number, min: number, max: number): Ponto | null {
  for (let i = 0; i < 12; i++) {
    const ang = rand() * Math.PI * 2, d = min + rand() * (max - min);
    const px = x + Math.cos(ang) * d, pz = z + Math.sin(ang) * d;
    if (terraSeca(px, pz)) return { x: px, z: pz };
  }
  return null;
}

// procura água dentro do alcance da visão (anéis de 3 em 3 m)
export function procurarAgua(x: number, z: number, alcance: number): Ponto | null {
  for (let r = 3; r <= alcance; r += 3) {
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2 + r;
      const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
      if (heightAt(px, pz) < WATER_LEVEL - 0.2) return { x: px, z: pz };
    }
  }
  return null;
}

// água mais próxima em todo o mapa: é o que um animal nascido no vale já sabe por instinto
export function aguaMaisProximaDoMapa(x: number, z: number): Ponto | null {
  for (let r = 5; r <= WORLD_SIZE; r += 5) {
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2;
      const px = x + Math.cos(ang) * r, pz = z + Math.sin(ang) * r;
      if (Math.abs(px) < LIMITE && Math.abs(pz) < LIMITE && heightAt(px, pz) < WATER_LEVEL - 0.2) return { x: px, z: pz };
    }
  }
  return null;
}
