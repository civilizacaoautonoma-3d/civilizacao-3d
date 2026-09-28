// Ciclo de vida, reprodução e gerações (Fase 12, documentação seções 12 e 13).
// A vida é comprimida para caber no tempo do experimento (ajuste em VIDA): ninguém "casa" nem "decide ter filho".
// Atração nasce da convivência e do afeto; o par dorme junto; às vezes vem uma gravidez. O bebê depende de tudo
// (mamar, ser carregado, ser aquecido) — é isso que obriga o cuidado. A criança imita, aprende as palavras do grupo
// e tem a personalidade moldada pela infância. Filhos herdam temperamento e corpo dos pais, com variação;
// parentes próximos geram filhos mais frágeis, e quem cresceu junto não sente atração (efeito Westermarck).
import { mulberry32 } from '../../shared/mundo';
import type { Contexto } from './contexto';
import type { Agente } from './agente';
import { completarAgente, ev, novoAgente, sinta } from './agente';
import { lerRelacao, mudarRelacao, relacao } from './social';
import { aoCuidar, observarCuidadoDeOrfao } from './cultura';
import { novaPersonalidade, type Personalidade } from './emocoes';

// idades em dias do mundo
export const VIDA = {
  gestacao: 40,         // gravidez
  bebe: 60,             // até aqui só mama e precisa ser carregado
  desmame: 120,         // até aqui ainda mama um pouco
  crianca: 240,         // fim da infância: a personalidade se firma
  jovem: 300,           // maturidade: pode ter filhos
  velho: 5 * 365,       // começa a envelhecer
  intervaloParto: 30,   // descanso do corpo depois de um parto
};

export type Fase = 'bebe' | 'crianca' | 'jovem' | 'adulto' | 'idoso';
export interface Genes { altura: number; forca: number; resistencia: number; fertilidade: number; longevidade: number; pele: number }
export interface EstadoVida {
  nascidoEm: number; mae: string | null; pai: string | null; geracao: number;
  genes: Genes; endogamia: number;             // 0 = pais sem parentesco
  gravidaDesde: number | null; paiDoBebe: string | null; ultimoParto: number; percebeuGravidez: boolean;
  carregadoPor: string | null; carregando: string | null;
  infancia: { horas: number; fome: number; sustos: number; cuidado: number; moldada: boolean };
  doenca: { tipo: string; ate: number } | null;
  chorando: boolean;
  velhice: boolean;
  ultimaNoiteJuntos?: number;
}

const lim = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const idadeDias = (a: Agente, hora: number) => (hora - a.vida.nascidoEm) / 24;
export function fase(a: Agente, hora: number): Fase {
  const d = idadeDias(a, hora);
  return d < VIDA.bebe ? 'bebe' : d < VIDA.crianca ? 'crianca' : d < VIDA.jovem ? 'jovem' : d < VIDA.velho ? 'adulto' : 'idoso';
}
// tamanho do corpo: bebê pequeno, cresce até a maturidade
export const crescimento = (a: Agente, hora: number) => lim(0.32 + 0.68 * idadeDias(a, hora) / VIDA.jovem, 0.32, 1);
export const ehBebe = (a: Agente, hora: number) => idadeDias(a, hora) < VIDA.bebe;
export const ehCrianca = (a: Agente, hora: number) => idadeDias(a, hora) < VIDA.jovem;
// quanto anda em relação a um adulto
export function velocidadeDaIdade(a: Agente, hora: number) {
  const d = idadeDias(a, hora);
  let v = d < VIDA.crianca ? 0.55 + 0.45 * (d - VIDA.bebe) / (VIDA.crianca - VIDA.bebe) : 1;
  if (a.vida.gravidaDesde !== null && (hora - a.vida.gravidaDesde) / 24 > VIDA.gestacao * 0.7) v *= 0.8;   // fim da gravidez
  if (a.vida.velhice) v *= 0.8;
  return lim(v, 0.3, 1);
}

// ---------- Genes ----------
function genesSorteados(rand: () => number): Genes {
  const g = () => lim((rand() + rand()) / 2);
  return { altura: g(), forca: g(), resistencia: g(), fertilidade: g(), longevidade: 6 + rand() * 3, pele: g() };
}
function herdar(m: Genes, p: Genes, rand: () => number, endogamia: number): Genes {
  const mix = (x: number, y: number) => lim((x + y) / 2 + (rand() - 0.5) * 0.3);
  return {
    altura: mix(m.altura, p.altura), forca: mix(m.forca, p.forca), pele: mix(m.pele, p.pele),
    resistencia: lim(mix(m.resistencia, p.resistencia) - endogamia * 1.2),
    fertilidade: lim(mix(m.fertilidade, p.fertilidade) - endogamia * 0.8),
    longevidade: Math.max(3, (m.longevidade + p.longevidade) / 2 + (rand() - 0.5) * 1.5 - endogamia * 3),
  };
}
// personalidade do filho: parte vem dos pais (~45%), parte é dele; a infância termina de moldar
function herdarPersonalidade(m: Personalidade, p: Personalidade, rand: () => number): Personalidade {
  const propria = novaPersonalidade(rand);
  const r = {} as Personalidade;
  for (const k of Object.keys(propria) as (keyof Personalidade)[]) r[k] = lim(0.45 * (m[k] + p[k]) / 2 + 0.55 * propria[k]);
  return r;
}

// coeficiente de parentesco aproximado (pais/filhos e irmãos 0,5; meio-irmãos, avós, tios 0,25)
export function parentesco(a: Agente, b: Agente, porId: (id: string) => Agente | undefined): number {
  if (a.id === b.id) return 1;
  const va = a.vida, vb = b.vida;
  if (va.mae === b.id || va.pai === b.id || vb.mae === a.id || vb.pai === a.id) return 0.5;
  const mesmaMae = !!va.mae && va.mae === vb.mae, mesmoPai = !!va.pai && va.pai === vb.pai;
  if (mesmaMae && mesmoPai) return 0.5;
  if (mesmaMae || mesmoPai) return 0.25;
  const avos = (x: Agente) => [x.vida.mae, x.vida.pai].flatMap(id => { const q = id ? porId(id) : undefined; return q ? [q.vida.mae, q.vida.pai] : []; }).filter(Boolean);
  if (avos(a).includes(b.id) || avos(b).includes(a.id)) return 0.25;
  const pais = (x: Agente) => [x.vida.mae, x.vida.pai].filter(Boolean) as string[];
  // tio/sobrinho: irmão de um dos pais
  for (const id of pais(a)) { const q = porId(id); if (q && q.id !== b.id && parentesco(q, b, () => undefined) >= 0.5 && (q.vida.mae === b.vida.mae && !!q.vida.mae)) return 0.25; }
  return 0;
}

export function novaVida(nascidoEm: number, id: string): EstadoVida {
  return {
    nascidoEm, mae: null, pai: null, geracao: 0, genes: genesSorteados(mulberry32(hashId(id) * 131 + 7)), endogamia: 0,
    gravidaDesde: null, paiDoBebe: null, ultimoParto: -1e9, percebeuGravidez: false,
    carregadoPor: null, carregando: null,
    infancia: { horas: 0, fome: 0, sustos: 0, cuidado: 0, moldada: true },
    doenca: null, chorando: false, velhice: false,
  };
}
function hashId(t: string) { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }

// nome dado pelo sistema só para quem observa (os agentes se chamam pelos sons que inventam)
const SILABAS = ['ka', 'ri', 'to', 'na', 'mi', 'lu', 'se', 'ba', 'vo', 'ti', 'ra', 'jo', 'le', 'du', 'ma', 'ne', 'pi', 'sa', 'go', 'ya'];
function nomeNovo(rand: () => number, usados: string[]) {
  for (let t = 0; t < 50; t++) {
    const n = SILABAS[Math.floor(rand() * SILABAS.length)] + SILABAS[Math.floor(rand() * SILABAS.length)] + (rand() < 0.3 ? SILABAS[Math.floor(rand() * SILABAS.length)] : '');
    const nome = n[0].toUpperCase() + n.slice(1);
    if (!usados.includes(nome)) return nome;
  }
  return `Filho${usados.length}`;
}

// ---------- Atração (entra no pulso social) ----------
// cresce entre jovens/adultos de sexos diferentes que convivem e se gostam; não entre parentes nem entre quem cresceu junto
export function atualizarAtracao(a: Agente, o: Agente, ctx: Contexto, horas: number, perto: boolean) {
  const r = relacao(a, o.id);
  // quem conviveu na infância (um dos dois criança) desenvolve aversão, não atração
  if (perto && (ehCrianca(a, ctx.hora) || ehCrianca(o, ctx.hora))) r.infanciaJuntos = (r.infanciaJuntos ?? 0) + horas;
  const podem = a.sexo !== o.sexo && !ehCrianca(a, ctx.hora) && !ehCrianca(o, ctx.hora)
    && parentesco(a, o, id => ctx.agentes.find(x => x.id === id)) < 0.125 && (r.infanciaJuntos ?? 0) < 200;
  const antes = r.atracao ?? 0;
  if (!podem) { r.atracao = Math.max(0, antes - horas * 0.01); return; }
  if (perto && r.afeto > 0.1) r.atracao = lim(antes + horas * 0.004 * (0.5 + r.afeto) * (1 - antes));
  else r.atracao = Math.max(0, antes - horas * 0.00012);   // longe, esfria bem devagar
  const dele = lerRelacao(o, a.id).atracao ?? 0;
  if (antes < 0.5 && r.atracao >= 0.5 && dele >= 0.5) {
    ctx.evento(`${a.nome} e ${o.nome} passaram a andar sempre juntos, como um par`);
    sinta(a, 'alegria', 0.6); sinta(o, 'alegria', 0.6);
  }
}
export const formamPar = (a: Agente, o: Agente) => (lerRelacao(a, o.id).atracao ?? 0) >= 0.5 && (lerRelacao(o, a.id).atracao ?? 0) >= 0.5;

// ---------- Concepção: o par dorme junto; às vezes vem um filho ----------
// vale quando qualquer um dos dois deita (quem chega depois também conta); uma chance por noite
export function tentarConceber(a: Agente, ctx: Contexto) {
  const perto = (x: Agente, y: Agente) => Math.hypot(x.x - y.x, x.z - y.z) < 2.5;
  const mulher = a.sexo === 'F' ? a
    : ctx.agentes.find(o => o.vivo && o.sexo === 'F' && o !== a && perto(o, a) && formamPar(a, o));
  if (!mulher) return;
  const v = mulher.vida, d = idadeDias(mulher, ctx.hora);
  if (v.gravidaDesde !== null || d < VIDA.jovem || v.velhice || (ctx.hora - v.ultimoParto) / 24 < VIDA.intervaloParto) return;
  const par = a.sexo === 'M' ? a : ctx.agentes.find(o => o.vivo && o !== mulher && o.sexo === 'M' && !ehCrianca(o, ctx.hora)
    && perto(o, mulher) && formamPar(mulher, o));
  if (!par || ehCrianca(par, ctx.hora)) return;
  if (ctx.hora - (v.ultimaNoiteJuntos ?? -1e9) < 12) return;
  v.ultimaNoiteJuntos = ctx.hora;
  const chance = 0.12 * (0.5 + v.genes.fertilidade) * (0.5 + par.vida.genes.fertilidade) * (mulher.corpo.fome < 0.7 ? 1 : 0.3);
  if (ctx.rand() > chance) return;
  v.gravidaDesde = ctx.hora; v.paiDoBebe = par.id; v.percebeuGravidez = false;
}

// ---------- Nascimento ----------
export function parto(mae: Agente, ctx: Contexto) {
  const v = mae.vida;
  const pai = ctx.agentes.find(o => o.id === v.paiDoBebe);
  const porId = (id: string) => ctx.agentes.find(x => x.id === id);
  const endogamia = pai ? parentesco(mae, pai, porId) : 0;
  const id = ctx.novoId('ag');
  const sexo = ctx.rand() < 0.5 ? 'M' : 'F';
  const nome = nomeNovo(ctx.rand, ctx.agentes.map(x => x.nome));
  const b = novoAgente(id, nome, sexo, mae.x + 0.3, mae.z + 0.3);
  b.vida = novaVida(ctx.hora, id);
  b.vida.mae = mae.id; b.vida.pai = pai?.id ?? null;
  b.vida.geracao = Math.max(v.geracao, pai?.vida.geracao ?? 0) + 1;
  b.vida.endogamia = endogamia;
  b.vida.genes = herdar(v.genes, pai?.vida.genes ?? v.genes, ctx.rand, endogamia);
  b.comunidade = mae.comunidade;
  b.origem = mae.origem ? { ...mae.origem } : null;
  b.vida.infancia.moldada = false;
  b.personalidade = herdarPersonalidade(mae.personalidade, pai?.personalidade ?? mae.personalidade, ctx.rand);
  b.corpo.fome = 0.3; b.corpo.sede = 0.2; b.corpo.sono = 0.5; b.corpo.saude = lim(1 - endogamia * 0.6);
  b.acao = 'dormindo'; b.intencao = 'recém-nascido';
  completarAgente(b);
  // laços do começo: a mãe (e o pai, se é do par) se apega; o bebê se apega a quem cuida
  mudarRelacao(mae, b, { afeto: 0.8, confianca: 0.5 });
  if (pai && pai.vivo) mudarRelacao(pai, b, { afeto: 0.4 });
  mudarRelacao(b, mae, { afeto: 0.6, confianca: 0.6 });
  if (pai && pai.vivo) mudarRelacao(b, pai, { afeto: 0.2, confianca: 0.4 });
  v.gravidaDesde = null; v.paiDoBebe = null; v.ultimoParto = ctx.hora;
  // o parto é arriscado
  mae.corpo.saude = lim(mae.corpo.saude - 0.1 - ctx.rand() * 0.25);
  mae.corpo.energia = lim(mae.corpo.energia - 0.5);
  sinta(mae, 'alegria', 0.8); sinta(mae, 'surpresa', 0.6);
  ctx.nascerAgente(b);
  ctx.evento(`Nasceu ${nome} (${sexo === 'M' ? 'menino' : 'menina'}), ${sexo === 'F' ? 'filha' : 'filho'} de ${mae.nome}${pai ? ` e ${pai.nome}` : ''}` +
    `${endogamia > 0 ? ` — pais parentes (endogamia ${endogamia})` : ''}`);
  return b;
}

// ---------- A cada passo: gravidez, bebê, infância, velhice, doença ----------
// devolve true quando o agente é um bebê (não decide nada sozinho)
export function passoDaVida(a: Agente, ctx: Contexto): boolean {
  const v = a.vida, d = idadeDias(a, ctx.hora), h = ctx.horas;

  // gravidez: mais fome; percebe o corpo mudando; parto
  if (v.gravidaDesde !== null) {
    const g = (ctx.hora - v.gravidaDesde) / 24;
    a.corpo.fome = lim(a.corpo.fome + h * (1 / 16) * 0.35);
    if (!v.percebeuGravidez && g > 12) { v.percebeuGravidez = true; ev(a, ctx, 'sentiu que a barriga estava crescendo'); }
    if (g >= VIDA.gestacao) parto(a, ctx);
  }

  // doença: febre enfraquece; passa com o tempo (descansar ajuda)
  if (v.doenca) {
    const repouso = a.acao === 'dormindo' || a.acao === 'parado';
    a.corpo.saude = lim(a.corpo.saude - h * 0.006 * (1.4 - v.genes.resistencia) * (repouso ? 0.5 : 1));
    a.corpo.energia = lim(a.corpo.energia - h * 0.04);
    if (ctx.hora > v.doenca.ate) { ev(a, ctx, 'melhorou da febre'); v.doenca = null; }
  }

  // velhice: depois da longevidade dos genes, a cada dia a chance de o corpo parar cresce
  if (d > VIDA.velho && !v.velhice) { v.velhice = true; ev(a, ctx, 'está ficando velho'); }
  if (v.velhice && d / 365 > v.genes.longevidade && ctx.rand() < h / 24 * 0.05) a.corpo.saude = 0;

  // carregado: vai junto com quem carrega
  if (v.carregadoPor) {
    const c = ctx.agentes.find(x => x.id === v.carregadoPor);
    if (!c || !c.vivo || c.vida.carregando !== a.id) v.carregadoPor = null;
    else { a.x = c.x; a.z = c.z; a.y = c.y; }
  }

  // infância: o que viveu molda o jeito (fome, sustos, cuidado por perto)
  if (!v.infancia.moldada) {
    const cuidador = ctx.agentes.some(o => o !== a && o.vivo && !ehCrianca(o, ctx.hora) && Math.hypot(o.x - a.x, o.z - a.z) < 8);
    v.infancia.horas += h; v.infancia.fome += a.corpo.fome * h;
    if (cuidador) v.infancia.cuidado += h;
    if (a.ameaca) v.infancia.sustos += h;
    if (d >= VIDA.crianca) moldarPelaInfancia(a, ctx);
  }

  if (d >= VIDA.bebe) return false;

  // ---------- bebê ----------
  // mama com a mãe, ou com outra mulher que está amamentando e está junto dele
  const ama = ctx.agentes.find(o => o.vivo && o !== a && Math.hypot(o.x - a.x, o.z - a.z) < 2.2 && (o.id === v.mae || lactante(o, ctx)));
  const amamenta = !!ama;
  if (ama) {
    a.corpo.fome = lim(a.corpo.fome - h * 0.7); a.corpo.sede = lim(a.corpo.sede - h * 0.7);
    ama.corpo.fome = lim(ama.corpo.fome + h * 0.03); ama.corpo.sede = lim(ama.corpo.sede + h * 0.03);
    if (ama.id !== v.mae && a.corpo.fome > 0.2) mudarRelacao(ama, a, { afeto: h * 0.05 });   // amamentar cria laço
    aoCuidar(ama, ctx, h * 0.3);   // amamentar forma o valor de cuidar dos pequenos
  }
  const adultoPerto = ctx.agentes.some(o => o !== a && o.vivo && !ehCrianca(o, ctx.hora) && Math.hypot(o.x - a.x, o.z - a.z) < 6);
  v.chorando = a.corpo.fome > 0.5 || a.corpo.sede > 0.5 || a.corpo.frio > 0.35 || a.corpo.dor > 0.3 || !adultoPerto;
  a.acompanhado = !!v.carregadoPor || ctx.agentes.some(o => o !== a && o.vivo && Math.hypot(o.x - a.x, o.z - a.z) < 1.5);
  if (v.chorando) { a.acao = 'parado'; a.intencao = amamenta ? 'mamando' : 'chorando'; }
  else if (a.corpo.sono > 0.15 || ctx.noite) { a.acao = 'dormindo'; a.intencao = v.carregadoPor ? 'dormindo no colo' : 'dormindo'; }
  else { a.acao = 'parado'; a.intencao = v.carregadoPor ? 'no colo, olhando em volta' : 'olhando em volta'; }
  return true;
}

function moldarPelaInfancia(a: Agente, ctx: Contexto) {
  const i = a.vida.infancia, P = a.personalidade;
  const fomeMedia = i.fome / Math.max(1, i.horas), cuidado = i.cuidado / Math.max(1, i.horas), sustos = i.sustos / Math.max(1, i.horas);
  P.neuroticismo = lim(P.neuroticismo + (fomeMedia - 0.35) * 0.4 + sustos * 0.5 - (cuidado - 0.5) * 0.15);
  P.amabilidade = lim(P.amabilidade + (cuidado - 0.5) * 0.25 - (fomeMedia - 0.35) * 0.15);
  P.coragem = lim(P.coragem - sustos * 0.4);
  i.moldada = true;
  ev(a, ctx, 'deixou de ser criança');
}

// está amamentando um filho seu (ainda não desmamado)
export function lactante(m: Agente, ctx: Contexto) {
  if (m.sexo !== 'F' || !m.vivo) return false;
  return ctx.agentes.some(b => b.vivo && b.vida.mae === m.id && idadeDias(b, ctx.hora) < VIDA.desmame);
}
// quem pode dar de mamar a este bebê: a mãe; sem ela, a mulher do grupo que amamenta e está mais perto
function quemAmamenta(b: Agente, ctx: Contexto) {
  const m = ctx.agentes.find(x => x.id === b.vida.mae);
  if (m && m.vivo) return m;
  let melhor: Agente | null = null, d = Infinity;
  for (const o of ctx.agentes) {
    if (o === b || !lactante(o, ctx) || o.comunidade !== b.comunidade) continue;
    const di = Math.hypot(o.x - b.x, o.z - b.z);
    if (di < d) { d = di; melhor = o; }
  }
  return melhor;
}
const orfao = (b: Agente, ctx: Contexto) => { const m = ctx.agentes.find(x => x.id === b.vida.mae); return !m || !m.vivo; };

// ---------- Cuidar: carregar o bebê junto, voltar quando ele chora ----------
// quem cuida: a mãe, e quem tem apego forte ao bebê
export function bebesQueCuida(a: Agente, ctx: Contexto) {
  if (ehCrianca(a, ctx.hora)) return [];
  return ctx.agentes.filter(b => b.vivo && b !== a && ehBebe(b, ctx.hora) && (b.vida.mae === a.id || lerRelacao(a, b.id).afeto > 0.45
    || (orfao(b, ctx) && b.comunidade === a.comunidade && Math.hypot(b.x - a.x, b.z - a.z) < 60)));
}
// a mãe acordada e andando leva o bebê que está junto dela; para dormir, põe no chão ao lado.
// Outro adulto só pega no colo um bebê que ficou sozinho chorando (ou cuja mãe morreu).
export function carregarSeFor(a: Agente, ctx: Contexto) {
  const v = a.vida;
  if (v.carregando) {
    const b = ctx.agentes.find(x => x.id === v.carregando);
    if (!b || !b.vivo || !ehBebe(b, ctx.hora) || a.acao === 'dormindo') {
      if (b) largarBebe(a, b);
      v.carregando = null;
    }
    return;
  }
  if (a.acao !== 'andando' && a.acao !== 'correndo') return;
  const b = bebesQueCuida(a, ctx).find(x => !x.vida.carregadoPor && Math.hypot(x.x - a.x, x.z - a.z) < 2.5 && podeCarregar(a, x, ctx));
  if (b) pegarBebe(a, b);
}
const maeViva = (b: Agente, ctx: Contexto) => quemAmamenta(b, ctx);
function podeCarregar(a: Agente, b: Agente, ctx: Contexto) {
  const mae = maeViva(b, ctx);
  if (!mae || mae === a) return true;
  return b.vida.chorando && Math.hypot(mae.x - b.x, mae.z - b.z) > 25;   // sozinho e a mãe longe: leva até ela
}
function pegarBebe(a: Agente, b: Agente) {
  const outro = b.vida.carregadoPor;
  if (outro && outro !== a.id) b.vida.carregadoPor = null;
  a.vida.carregando = b.id; b.vida.carregadoPor = a.id;
}
function largarBebe(a: Agente, b: Agente) {
  b.vida.carregadoPor = null; b.x = a.x + 0.4; b.z = a.z + 0.2;
  if (a.vida.carregando === b.id) a.vida.carregando = null;
}
const precisaMamar = (b: Agente) => b.corpo.fome > 0.3 || b.corpo.sede > 0.3;

// quanto vale ir cuidar agora (entra na decisão) e o que fazer:
// 'entregar' = levar o bebê que está no colo até a mãe; 'buscar' = a mãe vai até o bebê (mesmo no colo de outro);
// 'acudir' = ir até um bebê sozinho que chora
export function vontadeDeCuidar(a: Agente, ctx: Contexto): { nota: number; alvo: Agente | null; acao: 'entregar' | 'buscar' | 'acudir'; ate: Agente | null } {
  let melhor = { nota: 0, alvo: null as Agente | null, acao: 'acudir' as 'entregar' | 'buscar' | 'acudir', ate: null as Agente | null };
  for (const b of bebesQueCuida(a, ctx)) {
    const mae = maeViva(b, ctx);
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const afeto = 0.6 + lerRelacao(a, b.id).afeto;
    // está no meu colo e precisa mamar: levar para a mãe
    if (b.vida.carregadoPor === a.id) {
      if (mae && mae !== a && precisaMamar(b)) {
        const n = (0.8 + b.corpo.sede + b.corpo.fome) * afeto;
        if (n > melhor.nota) melhor = { nota: n, alvo: b, acao: 'entregar', ate: mae };
      }
      continue;
    }
    // sou a mãe e o bebê com fome está longe (no chão ou no colo de outro): ir buscar
    if (mae === a && (precisaMamar(b) || b.vida.chorando) && d > 2) {
      const n = (0.6 + b.corpo.sede + b.corpo.fome + (b.vida.chorando ? 0.4 : 0)) * afeto * 1.3;
      if (n > melhor.nota) melhor = { nota: n, alvo: b, acao: 'buscar', ate: null };
      continue;
    }
    if (b.vida.carregadoPor) continue;
    const alguemJunto = ctx.agentes.some(o => o !== b && o !== a && o.vivo && !ehCrianca(o, ctx.hora) && Math.hypot(o.x - b.x, o.z - b.z) < 3);
    const precisa = (b.vida.chorando ? 1 : 0.3) * (alguemJunto ? 0.3 : 1) * (d > 3 ? 1 : 0.4);
    const n = precisa * afeto * (mae === a ? 1.4 : 1);
    if (n > melhor.nota) melhor = { nota: n, alvo: b, acao: 'acudir', ate: null };
  }
  return melhor;
}
// executar o cuidado (chamado pela ação 'cuidar' do agente); devolve a intenção
export function cuidar(a: Agente, ctx: Contexto, irPara: (p: { x: number; z: number }, perto: number) => boolean): string | null {
  const v = vontadeDeCuidar(a, ctx);
  const b = v.alvo;
  if (!b) return null;
  if (v.acao === 'entregar' && v.ate) {
    if (!irPara(v.ate, 1.5)) return `levando ${b.nome} até ${v.ate.nome}`;
    largarBebe(a, b);   // a mãe, junto, amamenta (e pega no colo quando sair andando)
    return null;
  }
  if (!irPara(b, 1.5)) return b.vida.chorando ? `indo acudir ${b.nome}, que chora` : `indo buscar ${b.nome}`;
  if (b.vida.carregadoPor && b.vida.carregadoPor !== a.id) {
    const outro = ctx.agentes.find(x => x.id === b.vida.carregadoPor);
    if (outro) outro.vida.carregando = null;
    b.vida.carregadoPor = null;
  }
  aoCuidar(a, ctx, 0.1);
  if (b.vida.mae === a.id && precisaMamar(b)) { b.x = a.x + 0.3; b.z = a.z + 0.3; return `amamentando ${b.nome}`; }
  if (!a.vida.carregando && podeCarregar(a, b, ctx)) {
    pegarBebe(a, b);
    if (orfao(b, ctx)) observarCuidadoDeOrfao(ctx, a);
  }
  return null;
}

// um ferimento pode inflamar e dar febre (menos em quem tem boa resistência)
export function talvezInfeccionar(a: Agente, ctx: Contexto) {
  if (a.vida.doenca || ctx.rand() > 0.1 * (1.4 - a.vida.genes.resistencia)) return;
  a.vida.doenca = { tipo: 'febre', ate: ctx.hora + 36 + ctx.rand() * 60 };
  ev(a, ctx, 'ficou com febre (o ferimento inflamou)');
}

export function descreverFase(a: Agente, hora: number) {
  const d = Math.floor(idadeDias(a, hora));
  const f = fase(a, hora);
  const nome = { bebe: 'bebê', crianca: a.sexo === 'M' ? 'menino' : 'menina', jovem: 'jovem', adulto: 'adulto', idoso: 'idoso' }[f];
  return `${nome}, ${d < 365 ? `${d} dias` : `${(d / 365).toFixed(1)} anos`}`;
}
