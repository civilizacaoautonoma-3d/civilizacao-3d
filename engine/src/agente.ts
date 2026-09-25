import { ARBUSTOS, ARVORES, heightAt, obstaculosPerto, resolverColisao, type Arvore } from '../../shared/mundo';
import { PERFIS, type Especie } from '../../shared/especies';
import type { Acao, Necessidades } from '../../shared/protocolo';
import { atualizarCorpo, causaDaMorte, novoCorpo } from './corpo';
import { ehAnimal, type Contexto } from './contexto';
import { ferirAnimal, maturidade, type Animal } from './animal';
import { estragada } from './ecologia';
import { distancia, pertoDaAgua, pontoAleatorio, procurarAgua, terraSeca, type Ponto } from './espaco';
import { DESCONHECIDO, celulaMapa, marcarAgua, novoMapa, observar, rota } from './mapa';
import { crenca, esquecer, expectativa, exposicaoSegura, novaMente, perigoDoLugar, refletir, registrarEpisodio,
         type Mente, type TipoEpisodio } from './memoria';

export type { Contexto } from './contexto';

export type Objetivo = 'beber' | 'comer' | 'cacar' | 'fugir' | 'dormir' | 'descansar' | 'abrigar' | 'explorar';

// lugares com recursos (o "mapa" de onde tem água e comida)
export interface Lembranca {
  tipo: 'agua' | 'comida' | 'carne'; x: number; z: number;
  ref: number;       // índice do arbusto (comida), id da carcaça (carne) ou -1
  frutos: number;    // quantos frutos (ou porções de carne) viu da última vez
  quando: number;    // hora do mundo em que viu
  forca: number;     // 1 = lembrança viva, 0 = esquecida
}

// o que os sentidos entregam: o quê (talvez errado), onde (aproximado) e com que certeza — nunca o significado
export interface Percebido { id: string; especie: Especie; x: number; z: number; d: number; certeza: number; ouvido: boolean }

export interface Agente {
  id: string; nome: string; sexo: 'M' | 'F';
  x: number; y: number; z: number; rotacao: number;
  acao: Acao; intencao: string; vivo: boolean; causaMorte: string | null;
  corpo: Necessidades; memoria: Lembranca[];
  objetivo: Objetivo | null;
  destino: Ponto | null; alvo: Ponto | null; desvio: boolean; prazo: number; alvoRef: number;
  ocupadoAte: number; proximaDecisao: number; travado: number;
  abrigado: boolean; acompanhado: boolean;
  // Fase 6
  ameaca: { id: string; x: number; z: number } | null; inicioFuga: number;
  presa: string | null; presaVista: string | null; inicioCaca: number; alvoCarne: number;
  caca: { tentativas: number; sucessos: number };   // experiência própria: quanto vale a pena caçar
  cacaPor: Record<string, { tentativas: number; sucessos: number }>;   // a mesma experiência, separada por bicho
  presaEspecie: string | null;
  ultimaMordida: number; ultimoSusto: number; jaPassouMal: boolean;
  inalcancavel: Record<string, number>;   // comida que tentou e não conseguiu alcançar -> até quando desistir dela
  // Fase 7
  mente: Mente;                 // episódios e crenças
  mapa: number[];               // mapa mental do terreno
  rota: Ponto[] | null; replanos: number;
  percebidos: Percebido[];
  refletiuEm: number; ultimaDecepcao: number; ultimoNojo: number;
  motivoAbrigo: string | null;
}

const RAIO = 0.35;
const CORRER = 3.2;
const lim = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function novoAgente(id: string, nome: string, sexo: 'M' | 'F', x: number, z: number): Agente {
  return completarAgente({
    id, nome, sexo, x, y: heightAt(x, z), z, rotacao: 0,
    acao: 'parado', intencao: 'despertando para o mundo', vivo: true, causaMorte: null,
    corpo: novoCorpo(), memoria: [],
    objetivo: null, destino: null, alvo: null, desvio: false, prazo: 0, alvoRef: -1,
    ocupadoAte: 0, proximaDecisao: 0, travado: 0, abrigado: false, acompanhado: false,
  });
}

// agentes salvos por versões anteriores ganham os campos novos
export function completarAgente(a: Partial<Agente> & Pick<Agente, 'corpo'>): Agente {
  a.corpo.dor ??= 0;
  a.ameaca ??= null; a.inicioFuga ??= 0; a.presa ??= null; a.presaVista ??= null; a.inicioCaca ??= 0; a.alvoCarne ??= -1;
  a.caca ??= { tentativas: 0, sucessos: 0 };
  a.cacaPor ??= {}; a.presaEspecie ??= null;
  a.ultimaMordida ??= -1e9; a.ultimoSusto ??= -1e9; a.jaPassouMal ??= false;
  a.inalcancavel ??= {};
  a.mente ??= novaMente(); a.mente.seguro ??= {};
  a.mapa ??= novoMapa(); a.rota ??= null; a.replanos ??= 0; a.percebidos ??= [];
  a.refletiuEm ??= -1e9; a.ultimaDecepcao ??= -1e9; a.ultimoNojo ??= -1e9; a.motivoAbrigo ??= null;
  return a as Agente;
}

const ev = (a: Agente, ctx: Contexto, texto: string) => ctx.evento(`${a.nome} ${texto}`);

function episodio(a: Agente, ctx: Contexto, oQue: TipoEpisodio, sobre: string, valencia: number, intensidade: number) {
  return registrarEpisodio(a.mente, {
    quando: ctx.hora, x: a.x, z: a.z, oQue, sobre, valencia, intensidade,
    contexto: { clima: ctx.clima, noite: ctx.noite, celula: celulaMapa(a.x, a.z) },
  });
}

// ---------- Memória de lugares ----------
function lembrar(a: Agente, l: Lembranca, ctx: Contexto) {
  const igual = a.memoria.find(m => m.tipo === l.tipo &&
    (l.tipo === 'agua' ? Math.hypot(m.x - l.x, m.z - l.z) < 15 : m.ref === l.ref));
  if (igual) { igual.frutos = l.frutos; igual.quando = l.quando; igual.forca = 1; return; }
  a.memoria.push(l);
  if (l.tipo === 'agua' && a.memoria.filter(m => m.tipo === 'agua').length <= 2) ev(a, ctx, 'descobriu um lugar com água');
  else if (l.tipo === 'comida' && l.frutos > 0 && a.memoria.filter(m => m.tipo === 'comida').length <= 3) ev(a, ctx, 'encontrou um arbusto com frutos');
  else if (l.tipo === 'carne' && l.frutos > 0) {
    const k = ctx.carcacas.find(c => c.id === l.ref);
    if (k) ev(a, ctx, `encontrou a carcaça de um ${PERFIS[k.especie].nome}`);
  }
  if (a.memoria.length > 60) { a.memoria.sort((p, q) => q.forca - p.forca); a.memoria.length = 60; }
}

// ---------- Percepção: sentidos com alcance e erro ----------
const ocultoAnimal = (o: Animal) => o.acao === 'escondido' || (o.especie === 'coelho' && o.acao === 'dormindo');

// de longe, bichos de tamanho parecido se confundem
const PARECIDOS: Partial<Record<Especie, Especie[]>> = {
  lobo: ['javali', 'cervo'], javali: ['lobo', 'cervo'], cervo: ['lobo', 'javali'], coelho: ['ave'], ave: ['coelho'],
};

// medo que o agente sente de uma espécie: instinto leve + o que a experiência ensinou + o que ele acredita
const MEDO_INATO: Partial<Record<Especie, number>> = { lobo: 0.6, javali: 0.5 };   // "medo de animais grandes"
export function medoDaEspecie(a: Agente, esp: Especie, ctx: Contexto) {
  const inato = MEDO_INATO[esp] ?? 0;
  const exp = expectativa(a.mente, `especie:${esp}`, ctx.hora).valor;
  const cr = crenca(a.mente, `perigo:especie:${esp}`);
  return lim(inato + Math.max(0, -exp) * 1.2 - Math.max(0, exp) * 0.6 + cr * 0.5, inato * 0.4, 1.8);
}

// a que distância o comportamento visível de um bicho assusta (antes de pesar o medo que se tem dele)
function raioDaSituacao(p: Percebido, o: Animal, a: Agente, alcance: number, ctx: Contexto) {
  const atacandoMe = o.alvoId === a.id && (o.objetivo === 'cacar' || o.objetivo === 'enfrentar');
  if (atacandoMe && !p.ouvido) return alcance;
  if (p.especie === 'lobo') return o.objetivo === 'cacar' ? 14 : o.acao === 'dormindo' ? 3 : 7;
  if (p.especie === 'javali') return maturidade(o, ctx.hora) < 0.6 ? 2 : (o.emocoes.agressividade ?? 0) > 0.5 ? 8 : 4.5;
  return 5;
}

function perceber(a: Agente, ctx: Contexto) {
  // alcance da visão: noite, neblina, chuva e mata fechada encurtam
  const arvores = obstaculosPerto(a.x, a.z).filter(o => 'escala' in o && Math.hypot(o.x - a.x, o.z - a.z) < 10).length;
  const alcance = (8 + 22 * ctx.luz) * (1 - 0.6 * ctx.neblina) * (1 - 0.25 * ctx.chuva) * (arvores > 3 ? 0.75 : 1);
  // andando, olha para a frente (cone de ~120°); parado, olha em volta
  const parado = a.acao !== 'andando' && a.acao !== 'correndo';
  const meioCone = parado ? Math.PI * 0.9 : Math.PI / 3;
  const ve = (x: number, z: number) => {
    const d = Math.hypot(x - a.x, z - a.z);
    if (d > alcance) return false;
    if (d < 2) return true;
    const ang = Math.atan2(x - a.x, z - a.z) - a.rotacao;
    return Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang))) <= meioCone;
  };

  observar(a.mapa, a.x, a.z, alcance, a.rotacao, meioCone);

  ARBUSTOS.forEach((b, i) => {
    if (!ve(b.x, b.z)) return;
    const mem = a.memoria.find(m => m.tipo === 'comida' && m.ref === i);
    // comparar o que vê com o que lembra: o arbusto que tinha frutos está vazio
    if (mem && mem.frutos > 1 && ctx.frutos[i] === 0 && ctx.hora - a.ultimaDecepcao > 12) {
      episodio(a, ctx, 'decepcao', `arbusto:${i}`, -0.2, 0.3);
      a.ultimaDecepcao = ctx.hora;
    }
    lembrar(a, { tipo: 'comida', x: b.x, z: b.z, ref: i, frutos: ctx.frutos[i], quando: ctx.hora, forca: 1 }, ctx);
  });
  for (const k of ctx.carcacas) {
    const d = Math.hypot(k.x - a.x, k.z - a.z);
    // o olfato humano é fraco, mas carniça de perto dá para sentir
    if (k.porcoes > 0 && (ve(k.x, k.z) || d < 6))
      lembrar(a, { tipo: 'carne', x: k.x, z: k.z, ref: k.id, frutos: k.porcoes, quando: ctx.hora, forca: 1 }, ctx);
  }

  // animais: vistos (com certeza que cai com a distância) ou só ouvidos (direção aproximada)
  a.percebidos = [];
  for (const o of ctx.animais) {
    if (!o.vivo) continue;
    const d = Math.hypot(o.x - a.x, o.z - a.z);
    let certeza = 0, ouvido = false;
    if (ve(o.x, o.z) && !(ocultoAnimal(o) && d > 2)) certeza = 1 - 0.7 * (d / alcance) ** 2;
    else {
      const barulhento = o.acao === 'correndo' || o.acao === 'atacando';
      const ouve = o.especie !== 'peixe' && o.especie !== 'ave' && o.acao !== 'parado' && o.acao !== 'dormindo' && o.acao !== 'escondido';
      if (!ouve || d > (barulhento ? 16 : 8)) continue;
      certeza = 0.25; ouvido = true;
    }
    let especie = o.especie;
    const trocas = PARECIDOS[o.especie];
    if (trocas && certeza < 0.55 && ctx.rand() > certeza + 0.3) especie = trocas[Math.floor(ctx.rand() * trocas.length)];
    const erro = (1 - certeza) * 4;
    a.percebidos.push({ id: o.id, especie, d, certeza, ouvido,
      x: o.x + (ctx.rand() - 0.5) * erro, z: o.z + (ctx.rand() - 0.5) * erro });
  }

  // avaliar: perigo e oportunidade não são percebidos, são conclusões (memória + crenças + instinto)
  let ameaca: Percebido | null = null, dAmeaca = Infinity;
  let presa: Percebido | null = null, dPresa = 25;
  let barulho: Percebido | null = null;
  for (const p of a.percebidos) {
    const o = ctx.porId.get(p.id) as Animal;
    const medo = medoDaEspecie(a, p.especie, ctx);
    const perigo = raioDaSituacao(p, o, a, alcance, ctx) * medo * (p.ouvido ? 0.7 : 1);
    if (p.d < perigo) { if (p.d < dAmeaca) { dAmeaca = p.d; ameaca = p; } continue; }
    if (p.ouvido) { if (medo > 0.3) barulho = p; continue; }
    // um lobo ou javali visto de perto que não fez nada: da próxima vez assusta um pouco menos
    if ((p.especie === 'lobo' || p.especie === 'javali') && p.d < 15 && p.certeza > 0.6 && o.alvoId !== a.id)
      episodio(a, ctx, 'viu', `especie:${p.especie}`, 0.15, 0.15);
    const presaPossivel = p.especie === 'coelho' || p.especie === 'cervo' || p.especie === 'peixe' ||
      (p.especie === 'javali' && maturidade(o, ctx.hora) < 0.5);
    if (presaPossivel && p.certeza > 0.4 && p.d < dPresa && medo < 0.4) { dPresa = p.d; presa = p; }
  }
  // um barulho de bicho na periferia chama a atenção: vira para ver
  if (!ameaca && barulho && parado) a.rotacao = Math.atan2(barulho.x - a.x, barulho.z - a.z);

  const t = ameaca as Percebido | null;
  if (t) {
    const nome = PERFIS[t.especie].nome;
    if (!a.ameaca && ctx.hora - a.ultimoSusto > 3) ev(a, ctx, t.ouvido ? `ouviu algo que parecia um ${nome} e se assustou` : `viu um ${nome} e ficou com medo`);
    a.ultimoSusto = ctx.hora;
    a.ameaca = { id: t.id, x: t.x, z: t.z };
  } else {
    // exposto àquilo que teme (neblina, noite, um lugar) sem nada de ruim acontecer
    exposicaoSegura(a.mente, `contexto:${ctx.clima}`);
    if (ctx.noite) exposicaoSegura(a.mente, 'contexto:noite');
    for (const c of a.mente.crencas) if (c.chave.startsWith('lugar:') && perigoDoLugar(a.mente, a.x, a.z) > 0) exposicaoSegura(a.mente, c.chave);
  }
  a.presaVista = presa ? (presa as Percebido).id : null;

  const w = procurarAgua(a.x, a.z, alcance);
  if (w) lembrar(a, { tipo: 'agua', x: w.x, z: w.z, ref: -1, frutos: 0, quando: ctx.hora, forca: 1 }, ctx);
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

const chaveComida = (tipo: Lembranca['tipo'], ref: number) => `${tipo === 'carne' ? 'k' : 'a'}${ref}`;

// não consegue chegar lá: esquece essa comida por um dia
function desistirDeAlcancar(a: Agente, tipo: Lembranca['tipo'], ref: number, ctx: Contexto) {
  for (const [k, ate] of Object.entries(a.inalcancavel)) if (ate < ctx.hora) delete a.inalcancavel[k];
  a.inalcancavel[chaveComida(tipo, ref)] = ctx.hora + 24;
}

function melhorComida(a: Agente, ctx: Contexto) {
  let melhor: Lembranca | null = null, custo = Infinity;
  for (const m of a.memoria) {
    if ((a.inalcancavel[chaveComida(m.tipo, m.ref)] ?? -1) > ctx.hora) continue;
    let c: number;
    if (m.tipo === 'comida') {
      const talvezCresceu = ctx.hora - m.quando > 24;          // vazio há mais de um dia: pode ter crescido
      if (m.frutos <= 0 && !talvezCresceu) continue;
      // um arbusto que já decepcionou é menos atraente
      const decepcao = Math.max(0, -expectativa(a.mente, `arbusto:${m.ref}`, ctx.hora).valor);
      c = (Math.hypot(m.x - a.x, m.z - a.z) / m.forca) * (m.frutos > 0 ? 1 : 2) * (1 + decepcao * 2);
    } else if (m.tipo === 'carne') {
      if (m.frutos <= 0 || ctx.hora - m.quando > 48) continue;  // carcaça vista há muito tempo: já deve ter sumido
      c = (Math.hypot(m.x - a.x, m.z - a.z) / m.forca) * 0.6;   // carne sacia mais que frutos
    } else continue;
    c *= 1 + 2 * perigoDoLugar(a.mente, m.x, m.z);              // evita onde acredita ser perigoso
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

// ---------- Movimento e navegação pelo mapa mental ----------
const alvoAleatorio = (a: Agente, ctx: Contexto, min = 10, max = 40) => pontoAleatorio(a.x, a.z, ctx.rand, min, max);

// explorar com curiosidade: prefere onde ainda não conhece, evita onde acredita ser perigoso
function alvoDeExploracao(a: Agente, ctx: Contexto): Ponto | null {
  let melhor: Ponto | null = null, nota = -Infinity;
  for (let k = 0; k < 8; k++) {
    const p = pontoAleatorio(a.x, a.z, ctx.rand, 15, 50);
    if (!p) continue;
    let novas = 0;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const c = celulaMapa(p.x + i * 5, p.z + j * 5);
      if (c >= 0 && a.mapa[c] === DESCONHECIDO) novas++;
    }
    const n = novas / 25 - 1.5 * perigoDoLugar(a.mente, p.x, p.z) + ctx.rand() * 0.3;
    if (n > nota) { nota = n; melhor = p; }
  }
  return melhor;
}

function definirDestino(a: Agente, ctx: Contexto, d: Ponto | null) {
  a.destino = d; a.desvio = false; a.rota = null; a.replanos = 0;
  if (d) {
    const segundos = (Math.hypot(d.x - a.x, d.z - a.z) / 1.4) * 2.5 + 30;   // tempo máximo para tentar chegar
    a.prazo = ctx.hora + segundos * (ctx.horas / ctx.dt);
  }
}

function mover(a: Agente, ctx: Contexto, correr = false): 'chegou' | 'bloqueado' | 'agua' | 'andando' {
  if (!a.alvo) return 'chegou';
  const dx = a.alvo.x - a.x, dz = a.alvo.z - a.z, dist = Math.hypot(dx, dz);
  if (dist < 0.8) return 'chegou';
  const vel = a.corpo.energia < 0.15 ? 0.8 : correr ? CORRER : 1.4;
  const passo = Math.min(dist, vel * ctx.dt);
  const nx = a.x + (dx / dist) * passo, nz = a.z + (dz / dist) * passo;
  if (!terraSeca(nx, nz)) {
    // água funda à frente: aprende no mapa mental que por ali não passa
    marcarAgua(a.mapa, a.x + (dx / dist) * 2.5, a.z + (dz / dist) * 2.5);
    return 'agua';
  }
  const ax = a.x, az = a.z;
  a.x = nx; a.z = nz;
  resolverColisao(a, RAIO);
  a.travado = Math.hypot(a.x - ax, a.z - az) < passo * 0.3 ? a.travado + 1 : 0;
  if (a.travado > 20) { a.travado = 0; return 'bloqueado'; }
  a.y = heightAt(a.x, a.z);
  a.rotacao = Math.atan2(dx, dz);
  a.acao = correr && vel === CORRER ? 'correndo' : 'andando';
  return 'andando';
}

// true quando chegou ao destino (ou desistiu)
function irAte(a: Agente, ctx: Contexto): boolean {
  const d = a.destino;
  if (!d || ctx.hora > a.prazo) { a.rota = null; return true; }
  // planeja o caminho pelo que conhece; sem caminho conhecido, tenta reto (e pode errar)
  if (!a.rota) a.rota = rota(a.mapa, a, d) ?? [d];
  if (a.rota.length > 1 && distancia(a, a.rota[0]) < 2) a.rota.shift();
  if (!a.desvio) a.alvo = { x: a.rota[0].x, z: a.rota[0].z };
  const r = mover(a, ctx);
  if (r === 'chegou') {
    if (a.desvio) { a.desvio = false; return false; }
    if (a.rota.length > 1) { a.rota.shift(); return false; }
    a.rota = null;
    return true;
  }
  if (r === 'agua') {
    a.desvio = false; a.rota = null;
    if (++a.replanos > 12) return true;   // cercado de água por todo lado que conhece: desiste
  } else if (r === 'bloqueado') {
    if (a.desvio) a.desvio = false;
    else {
      const contorno = alvoAleatorio(a, ctx, 3, 8);   // tenta contornar a árvore ou a pedra
      if (contorno) { a.alvo = contorno; a.desvio = true; }
    }
  }
  return false;
}

function pontoDeFuga(a: Agente, de: Ponto, dist: number): Ponto | null {
  const base = Math.atan2(a.x - de.x, a.z - de.z);
  for (const desvio of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3]) {
    const ang = base + desvio, x = a.x + Math.sin(ang) * dist, z = a.z + Math.cos(ang) * dist;
    if (terraSeca(x, z)) return { x, z };
  }
  return null;
}

// ---------- Ferimentos ----------
export function ferirAgente(a: Agente, dano: number, agressor: Animal, ctx: Contexto) {
  if (!a.vivo) return;
  const medoAntes = medoDaEspecie(a, agressor.especie, ctx);
  a.corpo.saude = Math.max(0, a.corpo.saude - dano);
  a.corpo.dor = Math.min(1, a.corpo.dor + 0.5);
  const dormia = a.acao === 'dormindo';
  if (dormia) a.acao = 'parado';
  a.ameaca = { id: agressor.id, x: agressor.x, z: agressor.z };
  a.objetivo = null; a.destino = null; a.proximaDecisao = 0; a.ocupadoAte = 0;
  const golpe = agressor.especie === 'javali' ? 'atacado por um javali' : `mordido por um ${PERFIS[agressor.especie].nome}`;
  // a dor ensina: agora ele sabe o que aquele bicho faz (e a surpresa marca ainda mais)
  const surpresa = medoAntes < 0.5;
  episodio(a, ctx, 'atacado', `especie:${agressor.especie}`, -1, surpresa ? 1 : 0.85);
  if (ctx.hora - a.ultimaMordida > 0.5)
    ev(a, ctx, `foi ${golpe}${dormia ? ' enquanto dormia' : ''}${surpresa ? ' — foi pego de surpresa' : ''}`);
  a.ultimaMordida = ctx.hora;
  // reage golpeando: o animal aprende que este humano é perigoso
  if (a.corpo.energia > 0.2 && ctx.rand() < 0.5)
    ferirAnimal(agressor, 0.15, { id: a.id, x: a.x, z: a.z, tipo: 'humano', nome: a.nome }, ctx);
}

// ---------- Decisão por utilidade ----------
function decidir(a: Agente, ctx: Contexto) {
  const c = a.corpo;
  const temComida = melhorComida(a, ctx) !== null;
  // a própria experiência diz quanto vale a pena correr atrás de um animal
  const vista = a.presaVista ? ctx.porId.get(a.presaVista) : undefined;
  const exp = vista && ehAnimal(vista) ? a.cacaPor[vista.especie] : undefined;
  const taxaCaca = ((exp?.sucessos ?? 0) + 1) / ((exp?.tentativas ?? 0) + 2);
  const urgente = c.sede > 0.85 || c.fome > 0.9;   // quem acordou com sede ou fome não volta a dormir antes de resolver
  // um bicho que ataca vence tudo; um bicho por perto assusta, mas sede ou fome extremas falam mais alto
  const bicho = a.ameaca ? ctx.porId.get(a.ameaca.id) : undefined;
  const atacandoMe = !!bicho && ehAnimal(bicho) && bicho.alvoId === a.id && (bicho.objetivo === 'cacar' || bicho.objetivo === 'enfrentar');
  // superstição: acredita que este tempo (ou a noite) traz perigo
  const receio = Math.max(crenca(a.mente, `contexto:${ctx.clima}`), ctx.noite ? crenca(a.mente, 'contexto:noite') : 0);
  const notas: Record<Objetivo, number> = {
    fugir: a.ameaca ? (atacandoMe ? 3 : 1.1) : 0,
    beber: Math.pow(c.sede, 1.4) * 1.2 + (c.sede > 0.9 ? 0.5 : 0),
    comer: Math.pow(c.fome, 1.4) * (temComida ? 1 : 0.7) + (c.fome > 0.95 ? 0.3 : 0),
    cacar: a.presaVista && c.energia > 0.3 ? Math.pow(c.fome, 1.4) * (0.4 + 0.8 * taxaCaca) : 0,
    // de dia só cochila se estiver muito cansado; à noite o sono pesa mais
    dormir: ((ctx.noite ? c.sono * 1.2 : c.sono > 0.85 ? c.sono * 0.6 : 0) + (c.sono > 0.9 ? 0.5 : 0)) * (urgente ? 0.2 : 1),
    descansar: Math.pow(1 - c.energia, 2) * 1.2,
    abrigar: c.frio * 0.9 + (ctx.chuva > 0.3 && !a.abrigado ? 0.2 : 0) + receio * 0.6,
    explorar: (0.2 + ctx.rand() * 0.1) * (1 - receio * 0.7),
  };
  if (a.objetivo) notas[a.objetivo] += 0.1;   // tende a continuar o que está fazendo
  let escolha: Objetivo = 'explorar';
  for (const k of Object.keys(notas) as Objetivo[]) if (notas[k] > notas[escolha]) escolha = k;
  if (escolha !== a.objetivo) {
    a.objetivo = escolha;
    a.destino = null; a.alvo = null; a.desvio = false; a.rota = null; a.alvoRef = -1; a.alvoCarne = -1; a.travado = 0;
    if (escolha === 'cacar') {
      a.presa = a.presaVista; a.inicioCaca = ctx.hora;
      a.presaEspecie = vista && ehAnimal(vista) ? vista.especie : null;
    }
    if (escolha === 'fugir') a.inicioFuga = ctx.hora;
    else a.presa = null;
    a.motivoAbrigo = escolha === 'abrigar' && receio > c.frio && receio > 0.3
      ? a.mente.crencas.find(k => k.chave === `contexto:${ctx.clima}` || (ctx.noite && k.chave === 'contexto:noite'))?.enunciado ?? null
      : null;
  }
}

// ---------- Execução ----------
function comerCarne(a: Agente, ctx: Contexto) {
  const c = a.corpo;
  const k = ctx.carcacas.find(x => x.id === a.alvoCarne && x.porcoes > 0);
  const mem = a.memoria.find(m => m.tipo === 'carne' && m.ref === a.alvoCarne);
  if (!k) {
    if (mem) mem.frutos = 0;
    a.alvoCarne = -1; a.destino = null;
    return;
  }
  const d = Math.hypot(k.x - a.x, k.z - a.z);
  // de perto sente o cheiro de podre; quem já passou mal tem nojo e não come
  if (d < 3 && estragada(k, ctx.hora) && crenca(a.mente, 'aversao:carne-podre') > 0.4) {
    if (ctx.hora - a.ultimoNojo > 12) ev(a, ctx, 'sentiu cheiro de carne podre e sentiu nojo');
    a.ultimoNojo = ctx.hora;
    desistirDeAlcancar(a, 'carne', k.id, ctx);
    a.alvoCarne = -1; a.destino = null;
    return;
  }
  if (d > 1.4) {
    if (!a.destino) definirDestino(a, ctx, { x: k.x, z: k.z });
    if (!irAte(a, ctx)) return;
    if (Math.hypot(k.x - a.x, k.z - a.z) > 1.4) {
      enfraquecerLembranca(a, k.x, k.z); desistirDeAlcancar(a, 'carne', k.id, ctx);
      a.alvoCarne = -1; a.destino = null; return;
    }
  }
  a.destino = null;
  k.porcoes--;
  c.fome = Math.max(0, c.fome - 0.3);
  a.acao = 'comendo'; a.intencao = `comendo carne crua de ${PERFIS[k.especie].nome}`;
  a.rotacao = Math.atan2(k.x - a.x, k.z - a.z);
  a.ocupadoAte = ctx.hora + 0.1;
  if (estragada(k, ctx.hora)) {
    // paladar: gosto de podre, e depois a náusea — aprendizado de aversão
    c.saude = Math.max(0, c.saude - 0.06);
    c.dor = Math.min(1, c.dor + 0.2);
    episodio(a, ctx, 'passou_mal', 'carne-podre', -0.8, 0.8);
    if (!a.jaPassouMal) ev(a, ctx, 'passou mal depois de comer carne estragada');
    a.jaPassouMal = true;
  } else episodio(a, ctx, 'comeu', 'carne', 0.4, 0.3);
  if (mem) { mem.frutos = k.porcoes; mem.quando = ctx.hora; }
  if (c.fome < 0.1) { a.objetivo = null; a.alvoCarne = -1; }
}

function executar(a: Agente, ctx: Contexto) {
  const c = a.corpo;
  switch (a.objetivo) {
    case 'fugir': {
      const t = a.ameaca;
      const s = t ? ctx.porId.get(t.id) : undefined;
      const d = s ? distancia(a, s) : Infinity;
      // o susto passa quando o bicho fica para trás, dorme, ou há um tempo não vem atrás dele
      const perigoso = !!s && ehAnimal(s) && s.vivo && s.acao !== 'dormindo' &&
        (s.alvoId === a.id || (s.objetivo === 'cacar' && d < 18) || (d < (s.especie === 'lobo' ? 10 : 6) && ctx.hora - a.inicioFuga < 0.5));
      if (!t || !s || !s.vivo || d > 25 || !perigoso) {
        a.ameaca = null; a.objetivo = null; a.destino = null;
        a.acao = 'parado'; a.intencao = 'recuperando o fôlego';
        return;
      }
      t.x = s.x; t.z = s.z;
      if (!a.destino || distancia(a, a.destino) < 1.5) a.destino = pontoDeFuga(a, t, 15);
      const percebido = a.percebidos.find(p => p.id === s.id);
      const nome = percebido ? PERFIS[percebido.especie].nome : ehAnimal(s) ? PERFIS[s.especie].nome : 'perigo';
      if (!a.destino) { a.acao = 'parado'; a.intencao = `encurralado por um ${nome}`; return; }
      a.alvo = a.destino;
      if (mover(a, ctx, true) !== 'andando') a.destino = alvoAleatorio(a, ctx, 4, 12);   // travou: tenta para outro lado
      a.intencao = `fugindo de um ${nome}`;
      return;
    }

    case 'cacar': {
      const alvo = a.presa ? ctx.porId.get(a.presa) : undefined;
      const registroDe = () => (a.cacaPor[a.presaEspecie ?? '?'] ??= { tentativas: 0, sucessos: 0 });
      const fim = (motivo: string) => {
        a.caca.tentativas++; registroDe().tentativas++;
        a.presa = null; a.objetivo = null; a.destino = null; a.acao = 'parado'; a.intencao = motivo;
      };
      if (!alvo || !alvo.vivo || !ehAnimal(alvo)) return fim('perdeu a presa');
      const nome = PERFIS[alvo.especie].nome;
      const d = Math.hypot(alvo.x - a.x, alvo.z - a.z);
      const falhou = (motivo: string) => { episodio(a, ctx, 'falhou_caca', `especie:${alvo.especie}`, -0.1, 0.2); fim(motivo); };
      if ((ocultoAnimal(alvo) && d > 2) || d > 8 + 22 * ctx.luz) return falhou(`perdeu o ${nome} de vista`);
      if (ctx.hora - a.inicioCaca > 0.5 || c.energia < 0.15) return falhou('desistiu de caçar, cansado');
      if (d <= RAIO + PERFIS[alvo.especie].raio + 0.5) {
        a.acao = 'atacando'; a.intencao = `tentando pegar um ${nome}`;
        a.rotacao = Math.atan2(alvo.x - a.x, alvo.z - a.z);
        a.ocupadoAte = ctx.hora + 0.02;
        const acerto = alvo.especie === 'coelho' ? 0.45 : alvo.especie === 'peixe' ? 0.25 : 0.3;   // peixe escorrega da mão
        if (ctx.rand() < acerto) {
          const dano = alvo.especie === 'coelho' || alvo.especie === 'peixe' ? 1 : 0.25 * (1.5 - maturidade(alvo, ctx.hora));
          const k = ferirAnimal(alvo, dano, { id: a.id, x: a.x, z: a.z, tipo: 'humano', nome: a.nome }, ctx);
          if (k) {
            fim(alvo.especie === 'peixe' ? 'pegou um peixe com as mãos' : `caçou um ${nome}`);
            a.caca.sucessos++; registroDe().sucessos++;
            episodio(a, ctx, 'cacou', `especie:${alvo.especie}`, 0.6, 0.6);
            ev(a, ctx, alvo.especie === 'peixe' ? 'pegou um peixe com as mãos' : `caçou um ${nome}`);
            lembrar(a, { tipo: 'carne', x: k.x, z: k.z, ref: k.id, frutos: k.porcoes, quando: ctx.hora, forca: 1 }, ctx);
            a.objetivo = 'comer'; a.alvoCarne = k.id;
          }
        }
        return;
      }
      a.alvo = { x: alvo.x, z: alvo.z };
      mover(a, ctx, true);
      a.intencao = `correndo atrás de um ${nome}`;
      return;
    }

    case 'beber': {
      if (pertoDaAgua(a.x, a.z)) {
        a.acao = 'bebendo'; a.intencao = 'bebendo água';
        c.sede = Math.max(0, c.sede - ctx.horas * 6);
        if (c.sede < 0.05) a.objetivo = null;
        return;
      }
      if (!a.destino) {
        const m = aguaMaisProxima(a);
        definirDestino(a, ctx, m ? { x: m.x, z: m.z } : alvoDeExploracao(a, ctx));
        a.intencao = m ? 'indo beber água' : 'procurando água';
        if (!a.destino) { a.acao = 'parado'; return; }
      }
      const d = a.destino;
      if (irAte(a, ctx)) {
        if (d && a.intencao === 'indo beber água' && !pertoDaAgua(a.x, a.z)) enfraquecerLembranca(a, d.x, d.z);
        a.destino = null;
      }
      return;
    }

    case 'comer': {
      if (a.alvoRef < 0 && a.alvoCarne < 0) {
        const m = melhorComida(a, ctx);
        if (m) {
          if (m.tipo === 'carne') { a.alvoCarne = m.ref; a.intencao = 'indo comer carne'; }
          else { a.alvoRef = m.ref; a.intencao = 'indo comer frutos'; }
          definirDestino(a, ctx, { x: m.x, z: m.z });
        } else {
          if (!a.destino) { definirDestino(a, ctx, alvoDeExploracao(a, ctx)); a.intencao = 'procurando comida'; }
          if (!a.destino) { a.acao = 'parado'; return; }
          if (irAte(a, ctx)) a.destino = null;
          return;
        }
      }
      if (a.alvoCarne >= 0) return comerCarne(a, ctx);
      const b = ARBUSTOS[a.alvoRef];
      if (Math.hypot(b.x - a.x, b.z - a.z) > 1.6) {
        if (!a.destino) definirDestino(a, ctx, { x: b.x, z: b.z });
        if (!irAte(a, ctx)) return;
        if (Math.hypot(b.x - a.x, b.z - a.z) > 1.6) {       // não conseguiu chegar
          enfraquecerLembranca(a, b.x, b.z);
          desistirDeAlcancar(a, 'comida', a.alvoRef, ctx);
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
        episodio(a, ctx, 'comeu', `arbusto:${a.alvoRef}`, 0.3, 0.25);   // doce: reforça a volta a este arbusto
        if (mem) { mem.frutos = ctx.frutos[a.alvoRef]; mem.quando = ctx.hora; }
        if (c.fome < 0.1) { a.objetivo = null; a.alvoRef = -1; }
      } else {
        // esperava frutos e não havia: decepção (a expectativa desse arbusto cai)
        if (mem && mem.frutos > 0) {
          episodio(a, ctx, 'decepcao', `arbusto:${a.alvoRef}`, -0.3, 0.35);
          if (ctx.hora - a.ultimaDecepcao > 12) ev(a, ctx, 'ficou decepcionado: o arbusto estava vazio');
          a.ultimaDecepcao = ctx.hora;
        }
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
      ev(a, ctx, a.abrigado ? 'foi dormir sob uma árvore' : 'foi dormir');
      // no sono, a mente junta as lembranças e tira conclusões (algumas erradas)
      if (ctx.hora - a.refletiuEm > 12) {
        refletir(a.mente, ctx.hora, t => ev(a, ctx, t), ctx.rand);
        a.refletiuEm = ctx.hora;
      }
      return;
    }

    case 'descansar':
      a.acao = 'parado'; a.intencao = 'descansando';
      if (c.energia > 0.9) a.objetivo = null;
      return;

    case 'abrigar': {
      if (a.abrigado) {
        a.acao = 'parado';
        a.intencao = a.motivoAbrigo ? `escondido: acredita que ${a.motivoAbrigo}`
          : ctx.chuva > 0.2 ? 'abrigado da chuva sob uma árvore' : 'encolhido de frio';
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
        definirDestino(a, ctx, alvoDeExploracao(a, ctx));
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

  for (const m of a.memoria) m.forca -= ctx.horas / 120;   // sem rever, esquece um lugar em ~5 dias
  if (a.memoria.some(m => m.forca <= 0)) a.memoria = a.memoria.filter(m => m.forca > 0);
  esquecer(a.mente, ctx.horas);

  if (a.corpo.saude <= 0) {
    a.vivo = false; a.acao = 'morto';
    a.causaMorte = causaDaMorte(a.corpo);
    a.intencao = `morreu de ${a.causaMorte}`;
    ev(a, ctx, `morreu de ${a.causaMorte}`);
    // quem viu a morte guarda isso para sempre (e pode ligar a coisas que não têm nada a ver)
    for (const o of ctx.agentes) {
      if (o === a || !o.vivo || Math.hypot(o.x - a.x, o.z - a.z) > 30) continue;
      episodio(o, ctx, 'viu_morte', `agente:${a.id}`, -1, 1);
      ev(o, ctx, `viu ${a.nome} morrer`);
    }
    return;
  }

  if (a.corpo.frio > 0.8 && ctx.rand() < ctx.horas) episodio(a, ctx, 'sentiu_frio', 'frio', -0.4, 0.4);

  if (ctx.hora < a.ocupadoAte) return;

  if (a.acao === 'dormindo') {
    // dormindo, só ouve um bicho que chega muito perto
    if (--a.proximaDecisao <= 0) {
      a.proximaDecisao = 10;
      for (const o of ctx.animais) {
        if (!o.vivo || Math.hypot(o.x - a.x, o.z - a.z) > 6 || ctx.rand() > 0.5) continue;
        if (medoDaEspecie(a, o.especie, ctx) < 0.4 || o.acao === 'parado' || o.acao === 'dormindo') continue;
        a.ameaca = { id: o.id, x: o.x, z: o.z };
        a.acao = 'parado'; a.objetivo = null;
        ev(a, ctx, `acordou assustado com um ${PERFIS[o.especie].nome}`);
        break;
      }
    }
    if (a.acao === 'dormindo') {
      const urgente = a.corpo.sede > 0.9 || a.corpo.fome > 0.95 || a.corpo.frio > 0.8;
      if (urgente || (a.corpo.sono < 0.05 && !ctx.noite)) {
        a.acao = 'parado'; a.objetivo = null;
        const motivo = a.corpo.sede > 0.9 ? 'com sede' : a.corpo.fome > 0.95 ? 'com fome' : 'com frio';
        ev(a, ctx, urgente ? `acordou ${motivo}` : 'acordou');
      } else return;
    }
    a.proximaDecisao = 0;
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
