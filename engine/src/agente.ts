import { ARBUSTOS, ARVORES, heightAt, resolverColisao, type Arvore } from '../../shared/mundo';
import { PERFIS } from '../../shared/especies';
import type { Acao, Necessidades } from '../../shared/protocolo';
import { atualizarCorpo, causaDaMorte, novoCorpo } from './corpo';
import { ehAnimal, type Contexto } from './contexto';
import { ferirAnimal, maturidade, type Animal } from './animal';
import { estragada } from './ecologia';
import { distancia, pertoDaAgua, pontoAleatorio, procurarAgua, terraSeca, type Ponto } from './espaco';

export type { Contexto } from './contexto';

export type Objetivo = 'beber' | 'comer' | 'cacar' | 'fugir' | 'dormir' | 'descansar' | 'abrigar' | 'explorar';

export interface Lembranca {
  tipo: 'agua' | 'comida' | 'carne'; x: number; z: number;
  ref: number;       // índice do arbusto (comida), id da carcaça (carne) ou -1
  frutos: number;    // quantos frutos (ou porções de carne) viu da última vez
  quando: number;    // hora do mundo em que viu
  forca: number;     // 1 = lembrança viva, 0 = esquecida
}

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
}

const RAIO = 0.35;
const CORRER = 3.2;

export function novoAgente(id: string, nome: string, sexo: 'M' | 'F', x: number, z: number): Agente {
  return completarAgente({
    id, nome, sexo, x, y: heightAt(x, z), z, rotacao: 0,
    acao: 'parado', intencao: 'despertando para o mundo', vivo: true, causaMorte: null,
    corpo: novoCorpo(), memoria: [],
    objetivo: null, destino: null, alvo: null, desvio: false, prazo: 0, alvoRef: -1,
    ocupadoAte: 0, proximaDecisao: 0, travado: 0, abrigado: false, acompanhado: false,
  });
}

// agentes salvos antes da Fase 6 ganham os campos novos
export function completarAgente(a: Partial<Agente> & Pick<Agente, 'corpo'>): Agente {
  a.corpo.dor ??= 0;
  a.ameaca ??= null; a.inicioFuga ??= 0; a.presa ??= null; a.presaVista ??= null; a.inicioCaca ??= 0; a.alvoCarne ??= -1;
  a.caca ??= { tentativas: 0, sucessos: 0 };
  a.cacaPor ??= {}; a.presaEspecie ??= null;
  a.ultimaMordida ??= -1e9; a.ultimoSusto ??= -1e9; a.jaPassouMal ??= false;
  a.inalcancavel ??= {};
  return a as Agente;
}

const ev = (a: Agente, ctx: Contexto, texto: string) => ctx.evento(`${a.nome} ${texto}`);

// ---------- Percepção e memória ----------
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

// a que distância este animal assusta (0 = não assusta; presas nunca assustam)
function distanciaDePerigo(o: Animal, a: Agente, alcance: number, ctx: Contexto) {
  if (o.especie === 'lobo')
    return o.alvoId === a.id ? alcance : o.objetivo === 'cacar' ? 14 : o.acao === 'dormindo' ? 3 : 7;
  if (o.especie === 'javali' && maturidade(o, ctx.hora) >= 0.6)
    return o.objetivo === 'enfrentar' && o.alvoId === a.id ? alcance : (o.emocoes.agressividade ?? 0) > 0.5 ? 8 : 4.5;   // mantém distância
  return 0;
}

const ocultoAnimal = (o: Animal) => o.acao === 'escondido' || (o.especie === 'coelho' && o.acao === 'dormindo');

function perceber(a: Agente, ctx: Contexto) {
  const alcance = 8 + 22 * ctx.luz;   // enxerga menos à noite
  ARBUSTOS.forEach((b, i) => {
    if (Math.hypot(b.x - a.x, b.z - a.z) <= alcance)
      lembrar(a, { tipo: 'comida', x: b.x, z: b.z, ref: i, frutos: ctx.frutos[i], quando: ctx.hora, forca: 1 }, ctx);
  });
  for (const k of ctx.carcacas) {
    if (k.porcoes > 0 && Math.hypot(k.x - a.x, k.z - a.z) <= alcance)
      lembrar(a, { tipo: 'carne', x: k.x, z: k.z, ref: k.id, frutos: k.porcoes, quando: ctx.hora, forca: 1 }, ctx);
  }

  // animais: medo instintivo de lobos e de javali bravo, interesse por presas
  let ameaca: Animal | null = null, dAmeaca = Infinity;
  let presa: Animal | null = null, dPresa = 25;
  for (const o of ctx.animais) {
    if (!o.vivo) continue;
    const d = Math.hypot(o.x - a.x, o.z - a.z);
    if (d > alcance || (ocultoAnimal(o) && d > 2)) continue;
    const perigo = distanciaDePerigo(o, a, alcance, ctx);
    if (perigo > 0) { if (d < perigo && d < dAmeaca) { dAmeaca = d; ameaca = o; } }
    else if (d < dPresa && o.especie !== 'ave' && (o.especie !== 'javali' || maturidade(o, ctx.hora) < 0.5)) { dPresa = d; presa = o; }
  }
  const t = ameaca as Animal | null;
  if (t) {
    if (!a.ameaca && ctx.hora - a.ultimoSusto > 3) ev(a, ctx, `viu um ${PERFIS[t.especie].nome} e ficou com medo`);
    a.ultimoSusto = ctx.hora;
    a.ameaca = { id: t.id, x: t.x, z: t.z };
  }
  a.presaVista = presa ? (presa as Animal).id : null;

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

// não consegue chegar lá (água no caminho, obstáculos): esquece essa comida por um dia
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
      c = (Math.hypot(m.x - a.x, m.z - a.z) / m.forca) * (m.frutos > 0 ? 1 : 2);
    } else if (m.tipo === 'carne') {
      if (m.frutos <= 0 || ctx.hora - m.quando > 48) continue;  // carcaça vista há muito tempo: já deve ter sumido
      c = (Math.hypot(m.x - a.x, m.z - a.z) / m.forca) * 0.6;   // carne sacia mais que frutos
    } else continue;
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

// ---------- Movimento ----------
const alvoAleatorio = (a: Agente, ctx: Contexto, min = 10, max = 40) => pontoAleatorio(a.x, a.z, ctx.rand, min, max);

function definirDestino(a: Agente, ctx: Contexto, d: Ponto | null) {
  a.destino = d; a.desvio = false;
  if (d) {
    const segundos = (Math.hypot(d.x - a.x, d.z - a.z) / 1.4) * 2 + 20;   // tempo máximo para tentar chegar
    a.prazo = ctx.hora + segundos * (ctx.horas / ctx.dt);
  }
}

function mover(a: Agente, ctx: Contexto, correr = false): 'chegou' | 'bloqueado' | 'andando' {
  if (!a.alvo) return 'chegou';
  const dx = a.alvo.x - a.x, dz = a.alvo.z - a.z, dist = Math.hypot(dx, dz);
  if (dist < 0.8) return 'chegou';
  const vel = a.corpo.energia < 0.15 ? 0.8 : correr ? CORRER : 1.4;
  const passo = Math.min(dist, vel * ctx.dt);
  const nx = a.x + (dx / dist) * passo, nz = a.z + (dz / dist) * passo;
  if (!terraSeca(nx, nz)) return 'bloqueado';
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
  a.corpo.saude = Math.max(0, a.corpo.saude - dano);
  a.corpo.dor = Math.min(1, a.corpo.dor + 0.5);
  const dormia = a.acao === 'dormindo';
  if (dormia) a.acao = 'parado';
  a.ameaca = { id: agressor.id, x: agressor.x, z: agressor.z };
  a.objetivo = null; a.destino = null; a.proximaDecisao = 0; a.ocupadoAte = 0;
  const golpe = agressor.especie === 'javali' ? 'atacado por um javali' : `mordido por um ${PERFIS[agressor.especie].nome}`;
  if (ctx.hora - a.ultimaMordida > 0.5) ev(a, ctx, `foi ${golpe}${dormia ? ' enquanto dormia' : ''}`);
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
  // um lobo que ataca vence tudo; um lobo por perto assusta, mas sede ou fome extremas falam mais alto
  const lobo = a.ameaca ? ctx.porId.get(a.ameaca.id) : undefined;
  const atacandoMe = !!lobo && ehAnimal(lobo) && lobo.alvoId === a.id && (lobo.objetivo === 'cacar' || lobo.objetivo === 'enfrentar');
  const notas: Record<Objetivo, number> = {
    fugir: a.ameaca ? (atacandoMe ? 3 : 1.1) : 0,
    beber: Math.pow(c.sede, 1.4) * 1.2 + (c.sede > 0.9 ? 0.5 : 0),
    comer: Math.pow(c.fome, 1.4) * (temComida ? 1 : 0.7) + (c.fome > 0.95 ? 0.3 : 0),
    cacar: a.presaVista && c.energia > 0.3 ? Math.pow(c.fome, 1.4) * (0.4 + 0.8 * taxaCaca) : 0,
    // de dia só cochila se estiver muito cansado; à noite o sono pesa mais
    dormir: ((ctx.noite ? c.sono * 1.2 : c.sono > 0.85 ? c.sono * 0.6 : 0) + (c.sono > 0.9 ? 0.5 : 0)) * (urgente ? 0.2 : 1),
    descansar: Math.pow(1 - c.energia, 2) * 1.2,
    abrigar: c.frio * 0.9 + (ctx.chuva > 0.3 && !a.abrigado ? 0.2 : 0),
    explorar: 0.2 + ctx.rand() * 0.1,
  };
  if (a.objetivo) notas[a.objetivo] += 0.1;   // tende a continuar o que está fazendo
  let escolha: Objetivo = 'explorar';
  for (const k of Object.keys(notas) as Objetivo[]) if (notas[k] > notas[escolha]) escolha = k;
  if (escolha !== a.objetivo) {
    a.objetivo = escolha;
    a.destino = null; a.alvo = null; a.desvio = false; a.alvoRef = -1; a.alvoCarne = -1; a.travado = 0;
    if (escolha === 'cacar') {
      a.presa = a.presaVista; a.inicioCaca = ctx.hora;
      a.presaEspecie = vista && ehAnimal(vista) ? vista.especie : null;
    }
    if (escolha === 'fugir') a.inicioFuga = ctx.hora;
    else a.presa = null;
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
  if (Math.hypot(k.x - a.x, k.z - a.z) > 1.4) {
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
    // carne estragada faz mal (o agente ainda não sabe disso)
    c.saude = Math.max(0, c.saude - 0.06);
    c.dor = Math.min(1, c.dor + 0.2);
    if (!a.jaPassouMal) ev(a, ctx, 'passou mal depois de comer carne estragada');
    a.jaPassouMal = true;
  }
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
      // o susto passa quando o lobo fica para trás, dorme, ou há um tempo não vem atrás dele
      const perigoso = !!s && ehAnimal(s) && s.vivo && s.acao !== 'dormindo' &&
        (s.alvoId === a.id || (s.objetivo === 'cacar' && d < 18) || (d < (s.especie === 'lobo' ? 10 : 6) && ctx.hora - a.inicioFuga < 0.5));
      if (!t || !s || !s.vivo || d > 25 || !perigoso) {
        a.ameaca = null; a.objetivo = null; a.destino = null;
        a.acao = 'parado'; a.intencao = 'recuperando o fôlego';
        return;
      }
      t.x = s.x; t.z = s.z;
      if (!a.destino || distancia(a, a.destino) < 1.5) a.destino = pontoDeFuga(a, t, 15);
      const bicho = ehAnimal(s) ? PERFIS[s.especie].nome : 'perigo';
      if (!a.destino) { a.acao = 'parado'; a.intencao = `encurralado por um ${bicho}`; return; }
      a.alvo = a.destino;
      if (mover(a, ctx, true) !== 'andando') a.destino = alvoAleatorio(a, ctx, 4, 12);   // travou: tenta para outro lado
      a.intencao = `fugindo de um ${bicho}`;
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
      if ((ocultoAnimal(alvo) && d > 2) || d > 8 + 22 * ctx.luz) return fim(`perdeu o ${nome} de vista`);
      if (ctx.hora - a.inicioCaca > 0.5 || c.energia < 0.15) return fim('desistiu de caçar, cansado');
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
        definirDestino(a, ctx, m ? { x: m.x, z: m.z } : alvoAleatorio(a, ctx));
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
          if (!a.destino) { definirDestino(a, ctx, alvoAleatorio(a, ctx)); a.intencao = 'procurando comida'; }
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
      ev(a, ctx, a.abrigado ? 'foi dormir sob uma árvore' : 'foi dormir');
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
    ev(a, ctx, `morreu de ${a.causaMorte}`);
    return;
  }

  if (ctx.hora < a.ocupadoAte) return;

  if (a.acao === 'dormindo') {
    // dormindo, só ouve um lobo que chega muito perto
    if (--a.proximaDecisao <= 0) {
      a.proximaDecisao = 10;
      for (const o of ctx.animais) {
        if (o.vivo && o.especie === 'lobo' && Math.hypot(o.x - a.x, o.z - a.z) < 6 && ctx.rand() < 0.5) {
          a.ameaca = { id: o.id, x: o.x, z: o.z };
          a.acao = 'parado'; a.objetivo = null;
          ev(a, ctx, 'acordou assustado com um lobo');
          break;
        }
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
