// Duas comunidades (Fase 13, documentação seções 18 e 19).
// O segundo grupo nasce longe, numa parte do vale que o primeiro nunca viu. Ninguém sabe que o outro existe.
// Conhecer alguém é ver (ou ouvir) essa pessoa: só então nasce uma relação. O primeiro contato entre grupos
// é um choque — surpresa, medo ou curiosidade, conforme o jeito de cada um — e as palavras de um não servem
// para o outro. O que vem depois (evitar, observar, brigar, trocar, se juntar) não é programado.
import { CAVERNAS, WORLD_SIZE, heightAt, mulberry32 } from '../../shared/mundo';
import type { Contexto } from './contexto';
import type { Agente } from './agente';
import { ev, novoAgente, sinta } from './agente';
import { celulaMapa, DESCONHECIDO } from './mapa';
import { procurarAgua, terraSeca, LIMITE, type Ponto } from './espaco';
import { relacao } from './social';
import { novaVida } from './vida';
import { pedirEvento } from './deliberacao';

export const NOME_GRUPO: Record<number, string> = { 1: 'grupo 1', 2: 'grupo 2' };

// ---------- Conhecer alguém ----------
export const conhece = (a: Agente, id: string) => !!a.social.relacoes[id];

export function conhecer(a: Agente, o: Agente, ctx: Contexto, como: 'viu' | 'ouviu') {
  const r = relacao(a, o.id);
  if (a.comunidade === o.comunidade) return;
  // alguém de fora do seu grupo: nunca tinha visto ninguém assim
  const P = a.personalidade;
  r.confianca = 0.12;
  r.medo = Math.min(1, Math.max(0, 0.15 + 0.35 * P.neuroticismo - 0.2 * P.coragem));
  sinta(a, 'surpresa', 0.8);
  sinta(a, 'medo', 0.2 + 0.5 * r.medo);
  if (P.abertura > 0.5) sinta(a, 'antecipacao', 0.3 + 0.4 * P.abertura);   // curiosidade
  const primeira = !(a.social.estranhosVistos ?? 0);
  a.social.estranhosVistos = (a.social.estranhosVistos ?? 0) + 1;
  if (primeira) {
    ev(a, ctx, como === 'viu' ? `viu pela primeira vez alguém que não é do seu grupo (${o.nome})` : `ouviu uma voz que não conhecia (era ${o.nome})`);
    pedirEvento(a, ctx, como === 'viu'
      ? 'você viu uma pessoa que nunca tinha visto antes — alguém que não é dos seus'
      : 'você ouviu sons de uma voz que não é de ninguém que você conhece');
  }
  ctx.contato(a, o);
}

// ---------- Fundar o segundo grupo longe do primeiro ----------
const SILABAS_2 = ['ho', 'ka', 'u', 'ru', 'ta', 'ni', 'o', 'wa', 'ke', 'mo', 'ha', 'e', 'shi', 'zo', 'an', 'ai'];
function nomeDoGrupo2(rand: () => number, usados: string[]) {
  for (let t = 0; t < 50; t++) {
    const n = SILABAS_2[Math.floor(rand() * SILABAS_2.length)] + SILABAS_2[Math.floor(rand() * SILABAS_2.length)] + (rand() < 0.4 ? SILABAS_2[Math.floor(rand() * SILABAS_2.length)] : '');
    const nome = n[0].toUpperCase() + n.slice(1);
    if (nome.length >= 3 && !usados.includes(nome)) return nome;
  }
  return `Estranho${usados.length}`;
}

// um lugar firme, longe de todo mundo do grupo 1 e fora do que eles já viram
export function lugarParaNovoGrupo(agentes: Agente[], rand: () => number): Ponto {
  const grupo1 = agentes.filter(a => a.vivo);
  let melhor: Ponto | null = null, nota = -Infinity;
  for (let t = 0; t < 3000; t++) {
    const x = (rand() - 0.5) * 2 * (LIMITE - 25), z = (rand() - 0.5) * 2 * (LIMITE - 25), h = heightAt(x, z);
    if (h < 1.5 || h > 11 || !terraSeca(x, z)) continue;
    const dMin = Math.min(...grupo1.map(a => Math.hypot(a.x - x, a.z - z)));
    // quanto do entorno o grupo 1 já viu (0 = ninguém nunca olhou para lá)
    let visto = 0, total = 0;
    for (let dx = -40; dx <= 40; dx += 10) for (let dz = -40; dz <= 40; dz += 10) {
      const c = celulaMapa(x + dx, z + dz);
      if (c < 0) continue;
      total++;
      if (grupo1.some(a => a.mapa[c] !== DESCONHECIDO)) visto++;
    }
    // para viver ali: água por perto e, de preferência, uma caverna que o grupo 1 não conhece
    const agua = procurarAgua(x, z, 45) ? 1 : 0;
    const cav = CAVERNAS.filter(c => !grupo1.some(a => a.cavernas?.[c.id]))
      .reduce((m, c) => Math.min(m, Math.hypot(c.x - x, c.z - z)), Infinity);
    const n = Math.min(dMin, 300) - 300 * (visto / Math.max(1, total)) + 80 * agua - Math.min(120, cav) * 0.8;
    if (n > nota) { nota = n; melhor = { x, z }; }
  }
  return melhor ?? { x: -WORLD_SIZE / 3, z: -WORLD_SIZE / 3 };
}

export function fundarGrupo(comunidade: number, centro: Ponto, casais: number, proximoId: () => string, hora: number,
                            rand: () => number, usados: string[]): Agente[] {
  const novos: Agente[] = [];
  for (let i = 0; i < casais * 2; i++) {
    const sexo = i % 2 === 0 ? 'M' : 'F';
    let x = centro.x, z = centro.z;
    for (let t = 0; t < 20; t++) {
      const px = centro.x + (rand() - 0.5) * 10, pz = centro.z + (rand() - 0.5) * 10;
      if (terraSeca(px, pz)) { x = px; z = pz; break; }
    }
    const id = proximoId();
    const nome = nomeDoGrupo2(rand, [...usados, ...novos.map(a => a.nome)]);
    const a = novoAgente(id, nome, sexo, x, z);
    a.comunidade = comunidade;
    a.origem = { x: centro.x, z: centro.z, chegou: hora };
    a.vida = novaVida(hora - (360 + rand() * 120) * 24, id);
    // a pele do grupo 2 tende a outro tom (a aparência muda entre comunidades)
    a.vida.genes.pele = Math.min(1, Math.max(0, 0.7 + (rand() - 0.5) * 0.3));
    novos.push(a);
  }
  // quem chega junto já se conhece (é um grupo), mas ainda não tem palavras nem pares
  for (const a of novos) for (const o of novos) if (a !== o) {
    const r = relacao(a, o.id);
    r.afeto = 0.25 + rand() * 0.15; r.confianca = 0.5; r.convivencia = 50;
  }
  return novos;
}

export const semente = (n: number) => mulberry32(n);
