// Cavernas: abrigos naturais. O agente só usa as que já viu com os próprios olhos.
// "Casa" não é regra: é a caverna onde ele dormiu tantas vezes que passa a voltar para ela de longe.
import { CAVERNAS, cavernaEm, type Caverna } from '../../shared/mundo';
import type { Contexto } from './contexto';
import type { Agente } from './agente';
import { ev, irParaPonto, sinta } from './agente';
import { lugarDesejado } from './deliberacao';
import type { Objeto } from './objetos';
import { descobrir, sabe } from './tecnicas';

// regras materiais (o agente não sabe): quantas fibras fazem uma cama, quantos gravetos fecham a boca
export const CAMA_FIBRAS = 3;
export const BOCA_GRAVETOS = 5;
export const bocaDa = (c: Caverna) => ({ x: c.x + Math.sin(c.dir) * c.r, z: c.z + Math.cos(c.dir) * c.r });
export const fibrasPerto = (objs: Objeto[], x: number, z: number, raio: number) =>
  objs.filter(o => o.tipo === 'fibra' && !o.carregadoPor && Math.hypot(o.x - x, o.z - z) < raio).length;
export function bocaFechada(c: Caverna, objs: Objeto[]) {
  const b = bocaDa(c);
  return objs.some(o => o.tipo === 'pilha' && !o.carregadoPor && (o.qtd ?? 0) >= BOCA_GRAVETOS && Math.hypot(o.x - b.x, o.z - b.z) < 2);
}
// o conforto de quem está dentro de uma caverna agora
export function conforto(x: number, z: number, objs: Objeto[]) {
  const c = cavernaEm(x, z);
  if (!c) return { caverna: false, cama: false, fechada: false };
  return { caverna: true, cama: fibrasPerto(objs, x, z, 1.6) >= CAMA_FIBRAS, fechada: bocaFechada(c, objs) };
}

export interface CavernaConhecida { vistaEm: number; noites: number; ultimaNoite: number }

export const NOITES_PARA_LAR = 3;

// vê a boca ou o domo de uma caverna: passa a saber que ela existe (um marco grande não se esquece)
export function perceberCavernas(a: Agente, ctx: Contexto, ve: (x: number, z: number) => boolean) {
  for (const c of CAVERNAS) {
    if (a.cavernas[c.id]) continue;
    if (!ve(c.entrada.x, c.entrada.z) && !ve(c.x, c.z)) continue;
    a.cavernas[c.id] = { vistaEm: ctx.hora, noites: 0, ultimaNoite: -1e9 };
    ev(a, ctx, 'encontrou uma caverna');
    sinta(a, 'surpresa', 0.4);
  }
}

export const dentroDeCaverna = (a: Agente) => cavernaEm(a.x, a.z) !== null;

// qual caverna usar agora: o lugar de sempre vale a pena mesmo longe; as outras, só se estiverem perto
export function cavernaPreferida(a: Agente, ctx: Contexto, para: 'dormir' | 'abrigar'): Caverna | null {
  const desejado = lugarDesejado(a, para, ctx.hora);
  let melhor: Caverna | null = null, nota = Infinity;
  for (const [id, k] of Object.entries(a.cavernas)) {
    const c = CAVERNAS[Number(id)];
    if (!c || (a.cavernaFalhou[c.id] ?? -1) > ctx.hora) continue;
    const d = Math.hypot(c.x - a.x, c.z - a.z);
    const alcance = (para === 'dormir' ? 55 : 40) + Math.min(110, k.noites * 20) + (a.lar === c.id ? 30 : 0);
    const pedido = desejado && Math.hypot(desejado.x - c.x, desejado.z - c.z) < 6;
    if (d > alcance && !pedido) continue;
    const n = d - (a.lar === c.id ? 60 : 0) - k.noites * 5 - (pedido ? 100 : 0);
    if (n < nota) { nota = n; melhor = c; }
  }
  return melhor;
}

// entra pela boca: primeiro até a frente da caverna, depois para o fundo. true quando está dentro.
export function irParaCaverna(a: Agente, ctx: Contexto, c: Caverna): boolean {
  if (Math.hypot(c.x - a.x, c.z - a.z) < c.r - 1.2) { a.destino = null; a.rota = null; return true; }
  const frente = Math.sin(c.dir) * (a.x - c.x) + Math.cos(c.dir) * (a.z - c.z);
  const naBoca = frente > 0 && Math.hypot(c.x - a.x, c.z - a.z) < c.r + 2.4;
  if (naBoca) irParaPonto(a, ctx, { x: c.x, z: c.z }, 1);
  else irParaPonto(a, ctx, c.entrada, 1);
  return Math.hypot(c.x - a.x, c.z - a.z) < c.r - 1.2;
}

// uma noite dormida na caverna; depois de algumas, ela vira "o seu canto"
export function dormiuNaCaverna(a: Agente, ctx: Contexto) {
  const c = cavernaEm(a.x, a.z);
  if (!c) return;
  const k = a.cavernas[c.id] ??= { vistaEm: ctx.hora, noites: 0, ultimaNoite: -1e9 };
  if (ctx.hora - k.ultimaNoite < 12) return;
  k.noites++; k.ultimaNoite = ctx.hora;
  if (k.noites === 1) ev(a, ctx, 'dormiu pela primeira vez dentro de uma caverna');
  // o que as coisas deixadas ali fazem (descobre sentindo)
  const cf = conforto(a.x, a.z, ctx.objetos);
  if (cf.cama && !sabe(a, 'cama-capim')) {
    ev(a, ctx, 'deitou sobre o capim espalhado no chão da caverna e sentiu o chão quente e macio');
    descobrir(a, 'cama-capim', ctx);
  }
  if (cf.fechada && !sabe(a, 'fechar-boca') && (ctx.vento > 0.3 || ctx.temperatura < 12 || ctx.noite)) {
    ev(a, ctx, 'percebeu que os gravetos na boca da caverna seguravam o vento');
    descobrir(a, 'fechar-boca', ctx);
  }
  const atual = a.lar !== null ? a.cavernas[a.lar]?.noites ?? 0 : 0;
  if (k.noites >= NOITES_PARA_LAR && a.lar !== c.id && k.noites > atual) {
    a.lar = c.id;
    ev(a, ctx, 'passou a voltar sempre para a mesma caverna para dormir');
    sinta(a, 'confianca', 0.4);
  }
}
