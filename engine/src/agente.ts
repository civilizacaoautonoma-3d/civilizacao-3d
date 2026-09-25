import { WATER_LEVEL, WORLD_SIZE, ARBUSTOS, ARVORES, heightAt, resolverColisao, type Arvore } from '../../shared/mundo';
import type { Acao, Necessidades } from '../../shared/protocolo';
import { atualizarCorpo, causaDaMorte, novoCorpo } from './corpo';

export type Objetivo = 'beber' | 'comer' | 'dormir' | 'descansar' | 'abrigar' | 'explorar';

export interface Lembranca {
  tipo: 'agua' | 'comida'; x: number; z: number;
  ref: number;       // índice do arbusto (comida) ou -1
  frutos: number;    // quantos frutos viu da última vez
  quando: number;    // hora do mundo em que viu
  forca: number;     // 1 = lembrança viva, 0 = esquecida
}

type Ponto = { x: number; z: number };

export interface Agente {
  id: string; nome: string; sexo: 'M' | 'F';
  x: number; y: number; z: number; rotacao: number;
  acao: Acao; intencao: string; vivo: boolean; causaMorte: string | null;
  corpo: Necessidades; memoria: Lembranca[];
  objetivo: Objetivo | null;
  destino: Ponto | null; alvo: Ponto | null; desvio: boolean; prazo: number; alvoRef: number;
  ocupadoAte: number; proximaDecisao: number; travado: number;
  abrigado: boolean; acompanhado: boolean;
}

export interface Contexto {
  hora: number;    // horas totais do mundo
  horas: number;   // duração deste passo em horas do mundo
  dt: number;      // duração deste passo em segundos de caminhada
  luz: number; noite: boolean;
  temperatura: number; chuva: number; vento: number;
  frutos: number[]; agentes: Agente[];
  rand: () => number;
  evento: (a: Agente, texto: string) => void;
}

const LIMITE = WORLD_SIZE / 2 - 8;
const terraSeca = (x: number, z: number) =>
  Math.abs(x) < LIMITE && Math.abs(z) < LIMITE && heightAt(x, z) > WATER_LEVEL + 0.5;

export function novoAgente(id: string, nome: string, sexo: 'M' | 'F', x: number, z: number): Agente {
  return {
    id, nome, sexo, x, y: heightAt(x, z), z, rotacao: 0,
    acao: 'parado', intencao: 'despertando para o mundo', vivo: true, causaMorte: null,
    corpo: novoCorpo(), memoria: [],
    objetivo: null, destino: null, alvo: null, desvio: false, prazo: 0, alvoRef: -1,
    ocupadoAte: 0, proximaDecisao: 0, travado: 0, abrigado: false, acompanhado: false,
  };
}

// ---------- Percepção e memória ----------
function lembrar(a: Agente, l: Lembranca, ctx: Contexto) {
  const igual = a.memoria.find(m => m.tipo === l.tipo &&
    (l.tipo === 'comida' ? m.ref === l.ref : Math.hypot(m.x - l.x, m.z - l.z) < 15));
  if (igual) { igual.frutos = l.frutos; igual.quando = l.quando; igual.forca = 1; return; }
  a.memoria.push(l);
  if (l.tipo === 'agua' && a.memoria.filter(m => m.tipo === 'agua').length <= 2) ctx.evento(a, 'descobriu um lugar com água');
  else if (l.frutos > 0 && a.memoria.filter(m => m.tipo === 'comida').length <= 3) ctx.evento(a, 'encontrou um arbusto com frutos');
  if (a.memoria.length > 60) { a.memoria.sort((p, q) => q.forca - p.forca); a.memoria.length = 60; }
}

function perceber(a: Agente, ctx: Contexto) {
  const alcance = 8 + 22 * ctx.luz;   // enxerga menos à noite
  ARBUSTOS.forEach((b, i) => {
    if (Math.hypot(b.x - a.x, b.z - a.z) <= alcance)
      lembrar(a, { tipo: 'comida', x: b.x, z: b.z, ref: i, frutos: ctx.frutos[i], quando: ctx.hora, forca: 1 }, ctx);
  });
  for (let r = 3; r <= alcance; r += 3) {
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2 + r;
      const x = a.x + Math.cos(ang) * r, z = a.z + Math.sin(ang) * r;
      if (heightAt(x, z) < WATER_LEVEL - 0.2) {
        lembrar(a, { tipo: 'agua', x, z, ref: -1, frutos: 0, quando: ctx.hora, forca: 1 }, ctx);
        return;
      }
    }
  }
}

function enfraquecerLembranca(a: Agente, x: number, z: number) {
  for (const m of a.memoria) if (Math.hypot(m.x - x, m.z - z) < 3) m.forca -= 0.5;
}

function aguaMaisProxima(a: Agente) {
  let melhor: Lembranca | null = null, custo = Infinity;
  for (const m of a.memoria) {
    if (m.tipo !== 'agua') continue;
    const c = Math.hypot(m.x - a.x, m.z - a.z) / m.forca;
    if (c < custo) { custo = c; melhor = m; }
  }
  return melhor;
}

function melhorComida(a: Agente, ctx: Contexto) {
  let melhor: Lembranca | null = null, custo = Infinity;
  for (const m of a.memoria) {
    if (m.tipo !== 'comida') continue;
    const talvezCresceu = ctx.hora - m.quando > 24;          // vazio há mais de um dia: pode ter crescido
    if (m.frutos <= 0 && !talvezCresceu) continue;
    const c = (Math.hypot(m.x - a.x, m.z - a.z) / m.forca) * (m.frutos > 0 ? 1 : 2);
    if (c < custo) { custo = c; melhor = m; }
  }
  return melhor;
}

function arvoreMaisProxima(a: Agente, raio: number): Arvore | null {
  let melhor: Arvore | null = null, d = raio;
  for (const t of ARVORES) {
    const dt = Math.hypot(t.x - a.x, t.z - a.z);
    if (dt < d) { d = dt; melhor = t; }
  }
  return melhor;
}

function pertoDaAgua(a: Agente) {
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2;
    for (const r of [1.5, 3, 5]) if (heightAt(a.x + Math.cos(ang) * r, a.z + Math.sin(ang) * r) < WATER_LEVEL) return true;
  }
  return false;
}

// ---------- Movimento ----------
function alvoAleatorio(a: Agente, ctx: Contexto, min = 10, max = 40): Ponto | null {
  for (let i = 0; i < 12; i++) {
    const ang = ctx.rand() * Math.PI * 2, d = min + ctx.rand() * (max - min);
    const x = a.x + Math.cos(ang) * d, z = a.z + Math.sin(ang) * d;
    if (terraSeca(x, z)) return { x, z };
  }
  return null;
}

function definirDestino(a: Agente, ctx: Contexto, d: Ponto | null) {
  a.destino = d; a.desvio = false;
  if (d) {
    const segundos = (Math.hypot(d.x - a.x, d.z - a.z) / 1.4) * 2 + 20;   // tempo máximo para tentar chegar
    a.prazo = ctx.hora + segundos * (ctx.horas / ctx.dt);
  }
}

function mover(a: Agente, ctx: Contexto): 'chegou' | 'bloqueado' | 'andando' {
  if (!a.alvo) return 'chegou';
  const dx = a.alvo.x - a.x, dz = a.alvo.z - a.z, dist = Math.hypot(dx, dz);
  if (dist < 0.8) return 'chegou';
  const passo = Math.min(dist, (a.corpo.energia < 0.15 ? 0.8 : 1.4) * ctx.dt);
  const nx = a.x + (dx / dist) * passo, nz = a.z + (dz / dist) * passo;
  if (!terraSeca(nx, nz)) return 'bloqueado';
  const ax = a.x, az = a.z;
  a.x = nx; a.z = nz;
  resolverColisao(a, 0.35);
  a.travado = Math.hypot(a.x - ax, a.z - az) < passo * 0.3 ? a.travado + 1 : 0;
  if (a.travado > 20) { a.travado = 0; return 'bloqueado'; }
  a.y = heightAt(a.x, a.z);
  a.rotacao = Math.atan2(dx, dz);
  a.acao = 'andando';
  return 'andando';
}

// true quando chegou ao destino (ou desistiu por tempo)
function irAte(a: Agente, ctx: Contexto): boolean {
  const d = a.destino;
  if (!d || ctx.hora > a.prazo) return true;
  if (!a.desvio) a.alvo = { x: d.x, z: d.z };
  const r = mover(a, ctx);
  if (r === 'chegou') {
    if (!a.desvio) return true;
    a.desvio = false;
  } else if (r === 'bloqueado') {
    if (a.desvio) a.desvio = false;
    else {
      const contorno = alvoAleatorio(a, ctx, 3, 8);   // tenta contornar o obstáculo
      if (contorno) { a.alvo = contorno; a.desvio = true; }
    }
  }
  return false;
}

// ---------- Decisão por utilidade ----------
function decidir(a: Agente, ctx: Contexto) {
  const c = a.corpo;
  const notas: Record<Objetivo, number> = {
    beber: Math.pow(c.sede, 1.4) * 1.2,
    comer: Math.pow(c.fome, 1.4),
    // de dia só cochila se estiver muito cansado; à noite o sono pesa mais
    dormir: (ctx.noite ? c.sono * 1.2 : c.sono > 0.85 ? c.sono * 0.6 : 0) + (c.sono > 0.9 ? 0.5 : 0),
    descansar: Math.pow(1 - c.energia, 2) * 1.2,
    abrigar: c.frio * 0.9 + (ctx.chuva > 0.3 && !a.abrigado ? 0.2 : 0),
    explorar: 0.2 + ctx.rand() * 0.1,
  };
  if (a.objetivo) notas[a.objetivo] += 0.1;   // tende a continuar o que está fazendo
  let escolha: Objetivo = 'explorar';
  for (const k of Object.keys(notas) as Objetivo[]) if (notas[k] > notas[escolha]) escolha = k;
  if (escolha !== a.objetivo) {
    a.objetivo = escolha;
    a.destino = null; a.alvo = null; a.desvio = false; a.alvoRef = -1; a.travado = 0;
  }
}

// ---------- Execução ----------
function executar(a: Agente, ctx: Contexto) {
  const c = a.corpo;
  switch (a.objetivo) {
    case 'beber': {
      if (pertoDaAgua(a)) {
        a.acao = 'bebendo'; a.intencao = 'bebendo água';
        c.sede = Math.max(0, c.sede - ctx.horas * 6);
        if (c.sede < 0.05) a.objetivo = null;
        return;
      }
      if (!a.destino) {
        const m = aguaMaisProxima(a);
        definirDestino(a, ctx, m ? { x: m.x, z: m.z } : alvoAleatorio(a, ctx));
        a.intencao = m ? 'indo beber água' : 'procurando água';
        if (!a.destino) { a.acao = 'parado'; return; }
      }
      const d = a.destino;
      if (irAte(a, ctx)) {
        if (d && a.intencao === 'indo beber água' && !pertoDaAgua(a)) enfraquecerLembranca(a, d.x, d.z);
        a.destino = null;
      }
      return;
    }

    case 'comer': {
      if (a.alvoRef < 0) {
        const m = melhorComida(a, ctx);
        if (m) {
          a.alvoRef = m.ref;
          definirDestino(a, ctx, { x: m.x, z: m.z });
          a.intencao = 'indo comer frutos';
        } else {
          if (!a.destino) { definirDestino(a, ctx, alvoAleatorio(a, ctx)); a.intencao = 'procurando comida'; }
          if (!a.destino) { a.acao = 'parado'; return; }
          if (irAte(a, ctx)) a.destino = null;
          return;
        }
      }
      const b = ARBUSTOS[a.alvoRef];
      if (Math.hypot(b.x - a.x, b.z - a.z) > 1.6) {
        if (!a.destino) definirDestino(a, ctx, { x: b.x, z: b.z });
        if (!irAte(a, ctx)) return;
        if (Math.hypot(b.x - a.x, b.z - a.z) > 1.6) {       // não conseguiu chegar
          enfraquecerLembranca(a, b.x, b.z);
          a.alvoRef = -1; a.destino = null;
          return;
        }
      }
      a.destino = null;
      const mem = a.memoria.find(m => m.tipo === 'comida' && m.ref === a.alvoRef);
      if (ctx.frutos[a.alvoRef] > 0) {
        ctx.frutos[a.alvoRef]--;
        c.fome = Math.max(0, c.fome - 0.3);
        a.acao = 'comendo'; a.intencao = 'comendo frutos';
        a.rotacao = Math.atan2(b.x - a.x, b.z - a.z);
        a.ocupadoAte = ctx.hora + 0.08;   // ~5 minutos do mundo
        if (mem) { mem.frutos = ctx.frutos[a.alvoRef]; mem.quando = ctx.hora; }
        if (c.fome < 0.1) { a.objetivo = null; a.alvoRef = -1; }
      } else {
        if (mem) { mem.frutos = 0; mem.quando = ctx.hora; }
        a.alvoRef = -1;
      }
      return;
    }

    case 'dormir': {
      if (!a.destino && !a.abrigado && a.intencao !== 'procurando um lugar para dormir') {
        const t = arvoreMaisProxima(a, 12);
        if (t) {
          definirDestino(a, ctx, { x: t.x + t.r + 0.6, z: t.z });
          a.intencao = 'procurando um lugar para dormir';
          return;
        }
      }
      if (a.destino && !irAte(a, ctx)) return;
      a.destino = null;
      a.acao = 'dormindo'; a.intencao = 'dormindo';
      a.abrigado = arvoreMaisProxima(a, 2.2) !== null;
      ctx.evento(a, a.abrigado ? 'foi dormir sob uma árvore' : 'foi dormir');
      return;
    }

    case 'descansar':
      a.acao = 'parado'; a.intencao = 'descansando';
      if (c.energia > 0.9) a.objetivo = null;
      return;

    case 'abrigar': {
      if (a.abrigado) {
        a.acao = 'parado';
        a.intencao = ctx.chuva > 0.2 ? 'abrigado da chuva sob uma árvore' : 'encolhido de frio';
        return;
      }
      if (!a.destino) {
        const t = arvoreMaisProxima(a, 30);
        definirDestino(a, ctx, t ? { x: t.x + t.r + 0.6, z: t.z } : alvoAleatorio(a, ctx));
        a.intencao = 'procurando abrigo';
        if (!a.destino) { a.acao = 'parado'; return; }
      }
      if (irAte(a, ctx)) { a.destino = null; a.abrigado = arvoreMaisProxima(a, 2.2) !== null; }
      return;
    }

    case 'explorar': {
      if (!a.destino) {
        definirDestino(a, ctx, alvoAleatorio(a, ctx));
        a.intencao = 'explorando';
        if (!a.destino) { a.acao = 'parado'; return; }
      }
      if (irAte(a, ctx)) {
        a.destino = null; a.acao = 'parado'; a.intencao = 'observando os arredores';
        a.ocupadoAte = ctx.hora + ctx.rand() * 0.15;
      }
      return;
    }

    default:
      a.acao = 'parado'; a.intencao = 'pensando no que fazer';
  }
}

// ---------- Passo de vida ----------
export function atualizarAgente(a: Agente, ctx: Contexto) {
  if (!a.vivo) return;

  atualizarCorpo(a.corpo, ctx.horas, a.acao, {
    temperatura: ctx.temperatura, chuva: ctx.chuva, vento: ctx.vento,
    noite: ctx.noite, abrigado: a.abrigado, acompanhado: a.acompanhado,
  });

  for (const m of a.memoria) m.forca -= ctx.horas / 120;   // sem rever, esquece em ~5 dias
  if (a.memoria.some(m => m.forca <= 0)) a.memoria = a.memoria.filter(m => m.forca > 0);

  if (a.corpo.saude <= 0) {
    a.vivo = false; a.acao = 'morto';
    a.causaMorte = causaDaMorte(a.corpo);
    a.intencao = `morreu de ${a.causaMorte}`;
    ctx.evento(a, `morreu de ${a.causaMorte}`);
    return;
  }

  if (ctx.hora < a.ocupadoAte) return;

  if (a.acao === 'dormindo') {
    const urgente = a.corpo.sede > 0.9 || a.corpo.fome > 0.95 || a.corpo.frio > 0.8;
    if (urgente || (a.corpo.sono < 0.05 && !ctx.noite)) {
      a.acao = 'parado'; a.objetivo = null;
      const motivo = a.corpo.sede > 0.9 ? 'com sede' : a.corpo.fome > 0.95 ? 'com fome' : 'com frio';
      ctx.evento(a, urgente ? `acordou ${motivo}` : 'acordou');
    } else return;
  }

  if (--a.proximaDecisao <= 0) {
    a.proximaDecisao = 10;
    perceber(a, ctx);
    a.abrigado = arvoreMaisProxima(a, 2.2) !== null;
    a.acompanhado = ctx.agentes.some(o => o !== a && o.vivo && Math.hypot(o.x - a.x, o.z - a.z) < 1.5);
    decidir(a, ctx);
  }

  executar(a, ctx);
}
