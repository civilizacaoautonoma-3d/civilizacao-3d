// Ações primitivas com objetos, descoberta por experimentação e técnicas (Fase 10).
// Nada de "fazer machado" ou "acender fogueira": o agente pega, larga, bate, esfrega, empilha, amarra e cava.
// O motor aplica as regras materiais; quando algo acontece, o agente percebe — e passa a saber repetir.
// O conhecimento é de cada um: espalha só se alguém vê e imita. Quem morre sem ensinar leva a técnica.
import { PEDRAS, ARVORES } from '../../shared/mundo';
import type { Contexto } from './contexto';
import type { Agente, Objetivo } from './agente';
import { episodio, ev, irParaPonto, sinta } from './agente';
import { REGRAS, tichao, type Objeto, type TipoObjeto } from './objetos';
import { celulaPasto } from './ecologia';
import { viver } from './emocoes';
import { mudarRelacao } from './social';
import { CAVERNAS, cavernaEm } from '../../shared/mundo';
import { BOCA_GRAVETOS, bocaDa, bocaFechada, fibrasPerto, irParaCaverna } from './cavernas';

// o que cada técnica significa para o agente (sem palavras do nosso mundo: o fogo é "a luz quente")
export const TECNICAS: Record<string, string> = {
  lascar: 'bater uma pedra em outra às vezes deixa uma pedra afiada',
  cortar: 'a pedra afiada corta a carne de um bicho morto depressa',
  'fogo-atrito': 'esfregar um graveto no outro por muito tempo solta fumaça e faz nascer a luz quente perto de gravetos juntos',
  'levar-fogo': 'um graveto encostado na luz quente leva a luz quente para outro lugar',
  'alimentar-fogo': 'gravetos jogados na luz quente fazem ela durar mais',
  'calor-do-fogo': 'ficar perto da luz quente espanta o frio',
  cozinhar: 'carne comida perto da luz quente não faz mal e sustenta mais',
  'abrigo-pilha': 'muitos gravetos juntos ao pé de uma árvore protegem do vento e da chuva',
  amarrar: 'prender os gravetos com fibras deixa a pilha firme',
  'cavar-raizes': 'cavando o chão aparecem raízes que dá para comer',
  'cama-capim': 'capim espalhado no chão da caverna deixa o sono quente e fundo',
  'fechar-boca': 'gravetos empilhados na boca da caverna seguram o vento e os bichos não entram',
};

// palavras que deixam de ser anacronismo para quem já conhece aquilo
export const PALAVRAS_LIBERADAS: Record<string, string[]> = {
  'fogo-atrito': ['fogo', 'fogueira', 'brasa', 'chama'], 'levar-fogo': ['fogo', 'brasa', 'chama'],
  'calor-do-fogo': ['fogo'], cozinhar: ['fogo', 'assar', 'cozinh'], lascar: [], cortar: [],
};

export type Tarefa = 'experimentar' | 'aquecer' | 'fazer_fogo' | 'lascar' | 'construir' | 'cavar' | 'melhorar_caverna';
export const TAREFAS: Tarefa[] = ['experimentar', 'aquecer', 'fazer_fogo', 'lascar', 'construir', 'cavar', 'melhorar_caverna'];

export interface EstadoTecnico {
  mao: number[];                                               // ids dos objetos seguros (no máximo 2)
  sabe: Record<string, { desde: number; como: 'acaso' | 'imitação'; de: string | null }>;
  tentou: Record<string, number>;                              // combinações já tentadas (a novidade atrai)
  atrito: number; viuFumaca: boolean;
  mexeuHoje: number; diaMexeu: number;                         // quanto já mexeu nas coisas hoje (a vontade cansa)
  gesto: string | null; gestoDesde: number;
  fogoConhecido: { x: number; z: number; quando: number } | null;
  cozidas: number;
}
export const novoEstadoTecnico = (): EstadoTecnico => ({
  mao: [], sabe: {}, tentou: {}, atrito: 0, viuFumaca: false, mexeuHoje: 0, diaMexeu: -1, gesto: null, gestoDesde: 0, fogoConhecido: null, cozidas: 0,
});

export const sabe = (a: Agente, t: string) => !!a.tecnico.sabe[t];

// ---------- Mãos ----------
export const segurando = (a: Agente, ctx: Contexto, tipo?: TipoObjeto) =>
  a.tecnico.mao.map(id => ctx.objetos.find(o => o.id === id)).filter((o): o is Objeto => !!o && (!tipo || o.tipo === tipo));
export const temLasca = (a: Agente, ctx: Contexto) => segurando(a, ctx, 'lasca').length > 0;

export function pegar(a: Agente, o: Objeto, ctx: Contexto) {
  if (a.tecnico.mao.length >= 2 || o.carregadoPor) return false;
  o.carregadoPor = a.id; a.tecnico.mao.push(o.id); o.x = a.x; o.z = a.z; ctx.objetosMudaram();
  return true;
}
export function largar(a: Agente, o: Objeto, ctx: Contexto) {
  a.tecnico.mao = a.tecnico.mao.filter(id => id !== o.id);
  o.carregadoPor = null; o.x = a.x + (ctx.rand() - 0.5) * 0.6; o.z = a.z + (ctx.rand() - 0.5) * 0.6; ctx.objetosMudaram();
}
export function soltarTudo(a: Agente, ctx: Contexto) { for (const o of segurando(a, ctx)) largar(a, o, ctx); }

function maisPerto(a: Agente, ctx: Contexto, filtro: (o: Objeto) => boolean, raio: number) {
  let melhor: Objeto | null = null, d = raio;
  for (const o of ctx.objetos) {
    if (o.carregadoPor || !filtro(o)) continue;
    const dist = Math.hypot(o.x - a.x, o.z - a.z);
    if (dist < d) { d = dist; melhor = o; }
  }
  return melhor;
}
const rochaPerto = (a: Agente, raio: number) => PEDRAS.find(p => Math.hypot(p.x - a.x, p.z - a.z) < raio) ?? null;

// vai até um objeto do tipo e pega; 'feito' quando já está na mão
function buscar(a: Agente, ctx: Contexto, tipo: TipoObjeto, raio = 35): 'feito' | 'andando' | 'nada' {
  if (segurando(a, ctx, tipo).length) return 'feito';
  const o = maisPerto(a, ctx, x => x.tipo === tipo && !tichao(x, ctx.hora) && !guardado(a, x), raio);
  if (!o) return 'nada';
  if (!irParaPonto(a, ctx, o, 1.2)) return 'andando';
  if (a.tecnico.mao.length >= 2) largar(a, segurando(a, ctx).find(x => x.tipo !== tipo)!, ctx);
  pegar(a, o, ctx);
  return 'feito';
}

// ---------- Descoberta, imitação e registro ----------
export function aprender(a: Agente, t: string, ctx: Contexto, como: 'acaso' | 'imitação', de: Agente | null = null) {
  if (sabe(a, t)) return;
  a.tecnico.sabe[t] = { desde: ctx.hora, como, de: de?.id ?? null };
  if (de) mudarRelacao(a, de, { respeito: 0.15, divida: 0.05, afeto: 0.03 });
  sinta(a, 'surpresa', 0.8); sinta(a, 'alegria', 0.6); viver(a.sentimentos, 'descoberta', ctx.hora, 2);
  ctx.descoberta(t, TECNICAS[t], a, como, de);
}

// quem está vendo alguém conseguir algo pode aprender imitando (o curioso aprende mais fácil)
function demonstrar(ator: Agente, t: string, ctx: Contexto) {
  for (const o of ctx.agentes) {
    if (o === ator || !o.vivo || sabe(o, t) || o.acao === 'dormindo') continue;
    const d = Math.hypot(o.x - ator.x, o.z - ator.z);
    if (d > 8 + 17 * ctx.luz) continue;
    if (ctx.rand() < 0.35 * (0.5 + o.personalidade.abertura)) aprender(o, t, ctx, 'imitação', ator);
  }
}

export const descobrir = (a: Agente, t: string, ctx: Contexto) => sucesso(a, t, ctx);
// o que está dentro de uma caverna foi deixado ali: só mexe quem está lá dentro
const guardado = (a: Agente, o: Objeto) => { const c = cavernaEm(o.x, o.z); return !!c && cavernaEm(a.x, a.z) !== c; };

function sucesso(a: Agente, t: string, ctx: Contexto) {
  aprender(a, t, ctx, 'acaso');
  demonstrar(a, t, ctx);
}

// ---------- Gestos (as ações primitivas e o que o motor faz com elas) ----------
// cada gesto conta; o que ainda é pouco tentado é novidade (espanta o tédio), e mexer cansa ao longo do dia
function marcarTentativa(a: Agente, combo: string, ctx?: Contexto) {
  const n = a.tecnico.tentou[combo] = (a.tecnico.tentou[combo] ?? 0) + 1;
  a.novidade = Math.max(a.novidade, 3 / (1 + n * 0.3));
  if (ctx) {
    const dia = Math.floor(ctx.hora / 24);
    if (a.tecnico.diaMexeu !== dia) { a.tecnico.diaMexeu = dia; a.tecnico.mexeuHoje = 0; }
    a.tecnico.mexeuHoje++;
  }
}

// bater a pedra na mão contra uma rocha (ou contra outra pedra na outra mão)
function bater(a: Agente, ctx: Contexto): boolean {
  const pedras = segurando(a, ctx, 'pedra');
  if (!pedras.length || !(pedras.length > 1 || rochaPerto(a, 2.5))) return false;
  a.acao = 'atacando'; a.intencao = 'batendo uma pedra na outra';
  a.ocupadoAte = ctx.hora + 0.05;
  marcarTentativa(a, 'bater-pedra', ctx);
  if (ctx.rand() < REGRAS.chanceLascar) {
    pedras[0].tipo = 'lasca'; ctx.objetosMudaram();
    episodio(a, ctx, 'cacou', 'lasca', 0.5, 0.6);
    if (!sabe(a, 'lascar')) ev(a, ctx, 'bateu uma pedra na outra e ela quebrou afiada');
    sucesso(a, 'lascar', ctx);
    return true;
  }
  return false;
}

// esfregar graveto em graveto: esquenta, solta fumaça, vira brasa — e pega fogo se houver gravetos juntos ali
function esfregar(a: Agente, ctx: Contexto): 'fogo' | 'fumaca' | 'nada' | 'impossivel' {
  const gravetos = segurando(a, ctx, 'graveto').filter(g => !tichao(g, ctx.hora));
  const noChao = maisPerto(a, ctx, o => o.tipo === 'graveto' || o.tipo === 'pilha', 1.5);
  if (!gravetos.length || !(gravetos.length > 1 || noChao)) return 'impossivel';
  a.acao = 'comendo'; a.intencao = 'esfregando um graveto no outro';
  marcarTentativa(a, 'esfregar-graveto', ctx);
  a.tecnico.atrito += ctx.horas * (ctx.chuva > 0.2 ? 0.15 : 1);   // úmido, quase não esquenta
  if (a.tecnico.atrito >= REGRAS.atritoFumaca && !a.tecnico.viuFumaca) {
    a.tecnico.viuFumaca = true;
    sinta(a, 'surpresa', 0.6); sinta(a, 'antecipacao', 0.7);
    if (!sabe(a, 'fogo-atrito')) ev(a, ctx, 'esfregou gravetos até sair fumaça');
  }
  if (a.tecnico.atrito < REGRAS.atritoParaFogo) return a.tecnico.viuFumaca ? 'fumaca' : 'nada';
  a.tecnico.atrito = 0; a.tecnico.viuFumaca = false;
  const pilha = maisPerto(a, ctx, o => o.tipo === 'pilha' || o.tipo === 'graveto', 1.5);
  if (!pilha) return 'nada';   // a brasa morreu sem nada para pegar
  const combustivel = 1 + (pilha.tipo === 'pilha' ? (pilha.qtd ?? 1) : 1) * REGRAS.combustivelGraveto;
  ctx.objetos.splice(ctx.objetos.indexOf(pilha), 1);
  ctx.criarObjeto({ tipo: 'fogo', x: pilha.x, z: pilha.z, carregadoPor: null, combustivel });
  if (!sabe(a, 'fogo-atrito')) ev(a, ctx, 'esfregou gravetos até nascer fogo');
  episodio(a, ctx, 'cacou', 'fogo', 0.8, 0.9);
  sucesso(a, 'fogo-atrito', ctx);
  return 'fogo';
}

// largar o graveto junto de outros: vira uma pilha (ou aumenta a que já existe)
function empilhar(a: Agente, ctx: Contexto, onde?: { x: number; z: number }): boolean {
  const g = segurando(a, ctx, 'graveto').find(x => !tichao(x, ctx.hora));
  if (!g) return false;
  a.tecnico.mao = a.tecnico.mao.filter(id => id !== g.id);
  const p = onde ?? { x: a.x, z: a.z };
  const pilha = ctx.objetos.find(o => o.tipo === 'pilha' && Math.hypot(o.x - p.x, o.z - p.z) < 2);
  ctx.objetos.splice(ctx.objetos.indexOf(g), 1);
  if (pilha) pilha.qtd = (pilha.qtd ?? 0) + 1;
  else ctx.criarObjeto({ tipo: 'pilha', x: p.x, z: p.z, carregadoPor: null, qtd: 1, amarrada: 0 });
  ctx.objetosMudaram();
  a.acao = 'comendo'; a.intencao = 'juntando gravetos'; a.ocupadoAte = ctx.hora + 0.03;
  marcarTentativa(a, 'empilhar', ctx);
  return true;
}

function amarrar(a: Agente, ctx: Contexto): boolean {
  const f = segurando(a, ctx, 'fibra')[0];
  const pilha = maisPerto(a, ctx, o => o.tipo === 'pilha', 2);
  if (!f || !pilha) return false;
  a.tecnico.mao = a.tecnico.mao.filter(id => id !== f.id);
  ctx.objetos.splice(ctx.objetos.indexOf(f), 1);
  pilha.amarrada = (pilha.amarrada ?? 0) + 1; ctx.objetosMudaram();
  a.acao = 'comendo'; a.intencao = 'prendendo os gravetos com fibras'; a.ocupadoAte = ctx.hora + 0.05;
  marcarTentativa(a, 'amarrar', ctx);
  if (!sabe(a, 'amarrar')) ev(a, ctx, 'prendeu uma pilha de gravetos com fibras');
  sucesso(a, 'amarrar', ctx);
  return true;
}

// cavar o chão com as mãos (ou com a pedra afiada, bem mais rápido): às vezes acha raízes
function cavar(a: Agente, ctx: Contexto): boolean {
  const lasca = temLasca(a, ctx);
  a.acao = 'fucando'; a.intencao = lasca ? 'cavando o chão com a pedra afiada' : 'cavando o chão com as mãos';
  a.ocupadoAte = ctx.hora + (lasca ? 0.08 : 0.2);
  marcarTentativa(a, 'cavar', ctx);
  const c = celulaPasto(a.x, a.z);
  if (c < 0 || ctx.raizes[c] < 0.2 || ctx.rand() > (lasca ? 0.8 : 0.45)) return false;
  ctx.raizes[c] = Math.max(0, ctx.raizes[c] - 0.05);
  a.corpo.fome = Math.max(0, a.corpo.fome - 0.15);
  sinta(a, 'alegria', 0.3);
  if (!sabe(a, 'cavar-raizes')) ev(a, ctx, 'cavou o chão e achou raízes para comer');
  sucesso(a, 'cavar-raizes', ctx);
  return true;
}

// graveto no fogo: jogado, alimenta; encostado, vira um tição que leva o fogo
function usarFogo(a: Agente, ctx: Contexto, jogar: boolean): boolean {
  const fogo = maisPerto(a, ctx, o => o.tipo === 'fogo', 2.5);
  const g = segurando(a, ctx, 'graveto').find(x => !tichao(x, ctx.hora));
  if (!fogo || !g) return false;
  if (jogar) {
    a.tecnico.mao = a.tecnico.mao.filter(id => id !== g.id);
    ctx.objetos.splice(ctx.objetos.indexOf(g), 1);
    fogo.combustivel = (fogo.combustivel ?? 0) + REGRAS.combustivelGraveto; ctx.objetosMudaram();
    a.intencao = 'jogando um graveto no fogo';
    marcarTentativa(a, 'alimentar-fogo', ctx);
    if (!sabe(a, 'alimentar-fogo')) ev(a, ctx, 'jogou um graveto no fogo e viu a chama crescer');
    sucesso(a, 'alimentar-fogo', ctx);
  } else {
    g.acesoAte = ctx.hora + 1; ctx.objetosMudaram();
    a.intencao = 'encostando um graveto no fogo';
    marcarTentativa(a, 'encostar-no-fogo', ctx);
  }
  a.acao = 'comendo'; a.ocupadoAte = ctx.hora + 0.04;
  return true;
}

// largar um tição sobre gravetos: o fogo pega ali
function acenderComTicao(a: Agente, ctx: Contexto): boolean {
  const t = segurando(a, ctx).find(x => tichao(x, ctx.hora));
  const alvo = maisPerto(a, ctx, o => o.tipo === 'pilha' || (o.tipo === 'graveto' && !tichao(o, ctx.hora)), 1.5);
  if (!t || !alvo) return false;
  a.tecnico.mao = a.tecnico.mao.filter(id => id !== t.id);
  const qtd = alvo.tipo === 'pilha' ? (alvo.qtd ?? 1) : 1;
  ctx.objetos.splice(ctx.objetos.indexOf(t), 1);
  ctx.objetos.splice(ctx.objetos.indexOf(alvo), 1);
  ctx.criarObjeto({ tipo: 'fogo', x: alvo.x, z: alvo.z, carregadoPor: null, combustivel: 1 + qtd * REGRAS.combustivelGraveto });
  if (!sabe(a, 'levar-fogo')) ev(a, ctx, 'levou um graveto aceso até outros gravetos e fez nascer fogo');
  sucesso(a, 'levar-fogo', ctx);
  return true;
}

// ---------- Experimentar: o impulso da curiosidade (e do tédio) ----------
function experimentar(a: Agente, ctx: Contexto) {
  const t = a.tecnico;
  // continuando a esfregar enquanto a fumaça promete
  if (t.gesto === 'esfregar') {
    const r = esfregar(a, ctx);
    const paciencia = t.viuFumaca ? 1.6 : 0.5 + a.personalidade.conscienciosidade * 0.4;
    if (r === 'impossivel' || r === 'fogo' || ctx.hora - t.gestoDesde > paciencia) { t.gesto = null; if (r !== 'fogo') t.atrito *= 0.3; }
    return;
  }
  const mao = segurando(a, ctx);
  // escolhe o que pegar: de preferência um tipo de coisa ainda pouco mexido, não muito longe
  const escolherCoisa = (excluir: TipoObjeto[]) => {
    let melhor: Objeto | null = null, nota = 0;
    for (const o of ctx.objetos) {
      if (o.carregadoPor || !['pedra', 'graveto', 'fibra', 'lasca'].includes(o.tipo) || excluir.includes(o.tipo) || tichao(o, ctx.hora) || guardado(a, o)) continue;
      const d = Math.hypot(o.x - a.x, o.z - a.z);
      if (d > 25) continue;
      const n = (1 / (1 + (t.tentou[`pegar-${o.tipo}`] ?? 0) * 0.3)) / (1 + d / 8);
      if (n > nota) { nota = n; melhor = o; }
    }
    return melhor;
  };
  const irPegar = (o: Objeto) => {
    if (irParaPonto(a, ctx, o, 1.2)) {
      pegar(a, o, ctx); t.tentou[`pegar-${o.tipo}`] = (t.tentou[`pegar-${o.tipo}`] ?? 0) + 1;
      a.intencao = `pegou ${NOME_OBJETO[o.tipo]}`; a.ocupadoAte = ctx.hora + 0.03;
      return true;
    }
    a.intencao = `indo pegar ${NOME_OBJETO[o.tipo]}`;
    return false;
  };
  if (!mao.length) {
    // mantém o alvo escolhido até pegar (não troca de ideia a cada passo)
    const guardado = t.gesto?.startsWith('pegar:') ? ctx.objetos.find(o => o.id === Number(t.gesto!.slice(6)) && !o.carregadoPor) : undefined;
    const o = guardado && ctx.hora - t.gestoDesde < 0.5 ? guardado : escolherCoisa([]);
    if (!o) { t.gesto = null; if (ctx.rand() < 0.3) cavar(a, ctx); else { a.objetivo = 'explorar'; a.destino = null; } return; }
    if (o !== guardado) { t.gesto = `pegar:${o.id}`; t.gestoDesde = ctx.hora; }
    if (irPegar(o)) t.gesto = null;
    return;
  }
  // os gestos possíveis com o que tem nas mãos
  const opcoes: [string, () => boolean][] = [];
  const tem = (tipo: TipoObjeto) => mao.some(o => o.tipo === tipo);
  if (tem('pedra')) opcoes.push(['bater-pedra', () => bater(a, ctx) || irAteRocha(a, ctx)]);
  if (tem('graveto')) {
    opcoes.push(['esfregar-graveto', () => { const r = esfregar(a, ctx); if (r !== 'impossivel') { t.gesto = 'esfregar'; t.gestoDesde = ctx.hora; return true; } return buscarSegundoGraveto(a, ctx); }]);
    opcoes.push(['empilhar', () => empilhar(a, ctx)]);
    // perto de uma caverna que conhece: experimenta largar o graveto na boca dela (o mesmo gesto, num lugar novo)
    const cav = Object.keys(a.cavernas ?? {}).map(id => CAVERNAS[Number(id)]).find(c => Math.hypot(c.x - a.x, c.z - a.z) < 25);
    if (cav) opcoes.push(['empilhar-boca', () => {
      const b = bocaDa(cav);
      if (!irParaPonto(a, ctx, b, 1.2)) { a.intencao = 'levando um graveto até a boca da caverna'; return true; }
      const feito = empilhar(a, ctx, b);
      if (feito) { t.tentou['empilhar-boca'] = (t.tentou['empilhar-boca'] ?? 0) + 1; a.intencao = 'largou o graveto na boca da caverna'; }
      return feito;
    }]);
    if (maisPerto(a, ctx, o => o.tipo === 'fogo', 12)) {
      opcoes.push(['alimentar-fogo', () => usarFogo(a, ctx, true) || irAteFogo(a, ctx)]);
      opcoes.push(['encostar-no-fogo', () => usarFogo(a, ctx, false) || irAteFogo(a, ctx)]);
    }
  }
  if (mao.some(o => tichao(o, ctx.hora))) opcoes.push(['levar-fogo', () => acenderComTicao(a, ctx) || buscarGravetosNoChao(a, ctx)]);
  if (tem('fibra') && maisPerto(a, ctx, o => o.tipo === 'pilha', 15)) opcoes.push(['amarrar', () => amarrar(a, ctx) || irAtePilha(a, ctx)]);
  opcoes.push(['cavar', () => cavar(a, ctx)]);
  // com uma mão livre: pegar outra coisa para combinar
  const outra = mao.length < 2 ? escolherCoisa(mao.map(o => o.tipo)) : null;
  if (outra) opcoes.push(['pegar-mais', () => irPegar(outra)]);
  // largar só quando as mãos estão cheias (ou não há mais nada a fazer com o que tem)
  if (mao.length >= 2 || opcoes.length <= 1)
    opcoes.push(['largar', () => { largar(a, mao[mao.length - 1], ctx); marcarTentativa(a, 'largar', ctx); a.intencao = 'largou o que segurava'; return true; }]);

  // compromisso: continua o gesto escolhido até ele acontecer (ou cansar dele em ~20 min)
  let op = t.gesto && ctx.hora - t.gestoDesde < 0.35 ? opcoes.find(([k]) => k === t.gesto) : undefined;
  if (!op) {
    const pesos = opcoes.map(([k]) => 1 / (1 + (t.tentou[k] ?? 0) * 0.5));
    let r = ctx.rand() * pesos.reduce((s, p) => s + p, 0), i = 0;
    while (r > pesos[i] && i < pesos.length - 1) { r -= pesos[i]; i++; }
    op = opcoes[i];
    t.gesto = op[0]; t.gestoDesde = ctx.hora;
  }
  const antes = Object.values(t.tentou).reduce((s, v) => s + v, 0) + mao.length;
  const possivel = op[1]();
  const depois = Object.values(t.tentou).reduce((s, v) => s + v, 0) + segurando(a, ctx).length;
  // o gesto aconteceu (ou era impossível): na próxima, escolhe de novo
  if ((!possivel || depois !== antes) && t.gesto !== 'esfregar') t.gesto = null;
}

const NOME_OBJETO: Record<TipoObjeto, string> = {
  pedra: 'uma pedra', graveto: 'um graveto', fibra: 'umas fibras', lasca: 'uma pedra afiada', carne: 'um pedaço de carne',
  pilha: 'uma pilha de gravetos', fogo: 'fogo', fruto: 'um fruto',
};

function irAteRocha(a: Agente, ctx: Contexto) {
  const r = PEDRAS.filter(p => Math.hypot(p.x - a.x, p.z - a.z) < 30).sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z))[0];
  if (!r) return false;
  const ang = Math.atan2(a.x - r.x, a.z - r.z);
  irParaPonto(a, ctx, { x: r.x + Math.sin(ang) * (r.r + 0.8), z: r.z + Math.cos(ang) * (r.r + 0.8) }, 1);
  a.intencao = 'levando a pedra até uma rocha';
  return true;
}
function irAteFogo(a: Agente, ctx: Contexto) {
  const f = maisPerto(a, ctx, o => o.tipo === 'fogo', 60);
  if (!f) return false;
  irParaPonto(a, ctx, f, 2); a.intencao = 'indo até o fogo';
  return true;
}
function irAtePilha(a: Agente, ctx: Contexto) {
  const p = maisPerto(a, ctx, o => o.tipo === 'pilha', 30);
  if (!p) return false;
  irParaPonto(a, ctx, p, 1.2); a.intencao = 'indo até a pilha de gravetos';
  return true;
}
function buscarSegundoGraveto(a: Agente, ctx: Contexto) {
  const r = buscar(a, ctx, 'graveto');
  if (segurando(a, ctx, 'graveto').length < 2) {
    const g = maisPerto(a, ctx, o => o.tipo === 'graveto' && !tichao(o, ctx.hora), 30);
    if (g) { irParaPonto(a, ctx, g, 1.2); if (Math.hypot(g.x - a.x, g.z - a.z) < 1.3) pegar(a, g, ctx); }
  }
  return r !== 'nada';
}
function buscarGravetosNoChao(a: Agente, ctx: Contexto) {
  const g = maisPerto(a, ctx, o => o.tipo === 'pilha' || (o.tipo === 'graveto' && !tichao(o, ctx.hora)), 40);
  if (!g) return false;
  irParaPonto(a, ctx, g, 1); a.intencao = 'levando o graveto aceso até outros gravetos';
  return true;
}

// ---------- Rotinas de quem já sabe ----------
function aquecer(a: Agente, ctx: Contexto) {
  const f: { x: number; z: number } | null = maisPerto(a, ctx, o => o.tipo === 'fogo', 70) ?? a.tecnico.fogoConhecido;
  if (!f) { a.objetivo = null; return; }
  if (!irParaPonto(a, ctx, f, 2.2)) { a.intencao = 'indo se esquentar no fogo'; return; }
  // perto do fogo: se ele está fraco e sabe alimentar, busca gravetos
  const fogo = maisPerto(a, ctx, o => o.tipo === 'fogo', 3);
  if (!fogo) { a.tecnico.fogoConhecido = null; a.objetivo = null; a.intencao = 'o fogo tinha apagado'; return; }
  if ((fogo.combustivel ?? 0) < 1.5 && sabe(a, 'alimentar-fogo')) {
    if (segurando(a, ctx, 'graveto').length) { usarFogo(a, ctx, true); return; }
    const g = maisPerto(a, ctx, o => o.tipo === 'graveto' && !tichao(o, ctx.hora), 20);
    if (g) { if (irParaPonto(a, ctx, g, 1.2)) pegar(a, g, ctx); a.intencao = 'buscando gravetos para o fogo'; return; }
  }
  a.acao = 'parado'; a.intencao = 'se esquentando perto do fogo';
}

function fazerFogo(a: Agente, ctx: Contexto) {
  // quem sabe levar fogo e conhece um aceso por perto, vai buscar um tição
  const fogoPerto = maisPerto(a, ctx, o => o.tipo === 'fogo', 60);
  if (fogoPerto) { a.objetivo = 'aquecer'; return; }
  const pilha = maisPerto(a, ctx, o => o.tipo === 'pilha' && (o.qtd ?? 0) >= 2, 25);
  if (!pilha) {
    // junta gravetos num lugar (ao pé de uma árvore, se houver)
    if (segurando(a, ctx, 'graveto').length) { empilhar(a, ctx); a.intencao = 'juntando gravetos para fazer fogo'; return; }
    const r = buscar(a, ctx, 'graveto');
    a.intencao = 'buscando gravetos para fazer fogo';
    if (r === 'nada') a.objetivo = null;
    return;
  }
  if (!irParaPonto(a, ctx, pilha, 1.2)) { a.intencao = 'voltando para a pilha de gravetos'; return; }
  if (segurando(a, ctx, 'graveto').length < 1) {
    const r = buscar(a, ctx, 'graveto', 30);
    a.intencao = 'buscando um graveto para esfregar';
    if (r === 'nada') a.objetivo = null;
    return;
  }
  const r = esfregar(a, ctx);
  a.intencao = r === 'fumaca' ? 'esfregando gravetos: já sai fumaça' : 'esfregando gravetos para fazer fogo';
  if (r === 'fogo') a.objetivo = 'aquecer';
}

function lascar(a: Agente, ctx: Contexto) {
  if (temLasca(a, ctx)) { a.objetivo = null; return; }
  const r = buscar(a, ctx, 'pedra');
  if (r === 'andando') { a.intencao = 'buscando uma pedra para lascar'; return; }
  if (r === 'nada') { a.objetivo = null; return; }
  if (!bater(a, ctx)) irAteRocha(a, ctx);
  else a.objetivo = null;
}

function construir(a: Agente, ctx: Contexto) {
  // pilha de abrigo ao pé da árvore mais próxima de onde costuma estar
  const t = ARVORES.reduce((m, x) => (Math.hypot(x.x - a.x, x.z - a.z) < Math.hypot(m.x - a.x, m.z - a.z) ? x : m), ARVORES[0]);
  const lugar = { x: t.x + t.r + 0.8, z: t.z };
  const pilha = ctx.objetos.find(o => o.tipo === 'pilha' && Math.hypot(o.x - lugar.x, o.z - lugar.z) < 2);
  if ((pilha?.qtd ?? 0) >= REGRAS.pilhaAbrigo && (!sabe(a, 'amarrar') || (pilha?.amarrada ?? 0) >= 2)) { a.objetivo = null; return; }
  if ((pilha?.qtd ?? 0) >= REGRAS.pilhaAbrigo && sabe(a, 'amarrar')) {
    const r = buscar(a, ctx, 'fibra', 40);
    if (r === 'feito') { if (irParaPonto(a, ctx, lugar, 1.2)) amarrar(a, ctx); else a.intencao = 'levando fibras para a pilha'; }
    else if (r === 'nada') a.objetivo = null;
    else a.intencao = 'buscando fibras para prender a pilha';
    return;
  }
  if (segurando(a, ctx, 'graveto').length) {
    if (irParaPonto(a, ctx, lugar, 1.2)) empilhar(a, ctx, lugar); else a.intencao = 'levando gravetos para o abrigo';
    return;
  }
  const r = buscar(a, ctx, 'graveto', 40);
  a.intencao = 'juntando gravetos para o abrigo';
  if (r === 'nada') a.objetivo = null;
}

// deixar a caverna de casa melhor: capim no chão, gravetos na boca (só o que ele já descobriu que funciona)
function cavernaParaMelhorar(a: Agente, ctx: Contexto) {
  if (a.lar !== null) return CAVERNAS[a.lar];
  let melhor = null, d = 80;
  for (const id of Object.keys(a.cavernas ?? {})) {
    const c = CAVERNAS[Number(id)], dist = Math.hypot(c.x - a.x, c.z - a.z);
    if (dist < d) { d = dist; melhor = c; }
  }
  return melhor;
}
function faltaNaCaverna(a: Agente, ctx: Contexto) {
  const c = cavernaParaMelhorar(a, ctx);
  if (!c) return null;
  const cama = sabe(a, 'cama-capim') && fibrasPerto(ctx.objetos, c.x, c.z, 2.4) < 5;
  const boca = sabe(a, 'fechar-boca') && !bocaFechada(c, ctx.objetos);
  return cama || boca ? { c, cama, boca } : null;
}
function melhorarCaverna(a: Agente, ctx: Contexto) {
  const f = faltaNaCaverna(a, ctx);
  if (!f) { a.objetivo = null; return; }
  const tipo: TipoObjeto = f.cama && (!f.boca || segurando(a, ctx, 'fibra').length) ? 'fibra' : 'graveto';
  if (segurando(a, ctx, tipo).length) {
    if (tipo === 'fibra') {
      if (irParaCaverna(a, ctx, f.c)) {
        const fibra = segurando(a, ctx, 'fibra')[0];
        largar(a, fibra, ctx); fibra.x = f.c.x + (ctx.rand() - 0.5) * 1.4; fibra.z = f.c.z + (ctx.rand() - 0.5) * 1.4;
        a.acao = 'comendo'; a.ocupadoAte = ctx.hora + 0.04; a.intencao = 'forrando o chão da caverna com capim';
      } else a.intencao = 'levando capim para a caverna';
    } else {
      const b = bocaDa(f.c);
      if (irParaPonto(a, ctx, b, 1.2)) { empilhar(a, ctx, b); a.intencao = 'empilhando gravetos na boca da caverna'; }
      else a.intencao = 'levando gravetos para a boca da caverna';
    }
    return;
  }
  const r = buscar(a, ctx, tipo, 45);
  a.intencao = tipo === 'fibra' ? 'buscando capim para forrar a caverna' : 'buscando gravetos para a boca da caverna';
  if (r === 'nada') a.objetivo = null;
}

export function executarTarefa(a: Agente, ctx: Contexto, tarefa: Tarefa) {
  if (tarefa === 'melhorar_caverna') { melhorarCaverna(a, ctx); return; }
  if (tarefa === 'experimentar') experimentar(a, ctx);
  else if (tarefa === 'aquecer') aquecer(a, ctx);
  else if (tarefa === 'fazer_fogo') fazerFogo(a, ctx);
  else if (tarefa === 'lascar') lascar(a, ctx);
  else if (tarefa === 'construir') construir(a, ctx);
  else if (!cavar(a, ctx) && ctx.rand() < 0.1) a.objetivo = null;
}

// ---------- Quanto cada tarefa vale agora (entra na decisão por utilidade) ----------
export function utilidadesTecnicas(a: Agente, ctx: Contexto, temComida: boolean): Partial<Record<Objetivo, number>> {
  const c = a.corpo, H = a.sentimentos.humor, P = a.personalidade;
  const u: Partial<Record<Objetivo, number>> = {};
  const fria = ctx.estacao === 'Inverno' || ctx.estacao === 'Outono';
  const fogoPerto = ctx.objetos.some(o => o.tipo === 'fogo' && Math.hypot(o.x - a.x, o.z - a.z) < 70) || !!a.tecnico.fogoConhecido;
  const tranquilo = 1 - Math.max(c.fome, c.sede, c.sono * 0.8);
  // curiosidade + tédio empurram a mexer nas coisas (de dia, com as necessidades em dia)
  if (!ctx.noite) {
    const coisas = a.tecnico.mao.length > 0 || ctx.objetos.some(o => !o.carregadoPor && o.tipo !== 'fogo' && o.tipo !== 'carne' && Math.hypot(o.x - a.x, o.z - a.z) < 20);
    const cansou = a.tecnico.diaMexeu === Math.floor(ctx.hora / 24) ? Math.max(0.15, 1 - a.tecnico.mexeuHoje / 60) : 1;
    u.experimentar = (coisas ? 0.26 + 0.55 * H.tedio : 0.05) * (0.5 + P.abertura) * Math.max(0, tranquilo) * cansou;
  }
  if (sabe(a, 'calor-do-fogo') && fogoPerto && (c.frio > 0.25 || (ctx.noite && fria))) u.aquecer = c.frio * 1.2 + 0.25;
  if ((sabe(a, 'fogo-atrito') || sabe(a, 'levar-fogo')) && !fogoPerto && ctx.chuva < 0.3 && (c.frio > 0.3 || (ctx.noite && fria)))
    u.fazer_fogo = c.frio + 0.2 + 0.15 * P.conscienciosidade;
  if (sabe(a, 'lascar') && !temLasca(a, ctx) && (sabe(a, 'cortar') || a.caca.tentativas > 2) && tranquilo > 0.4) u.lascar = 0.22;
  if (sabe(a, 'abrigo-pilha') && (fria || ctx.chuva > 0.3) && !ctx.noite && tranquilo > 0.3) {
    const temAbrigo = ctx.objetos.some(o => o.tipo === 'pilha' && (o.qtd ?? 0) >= REGRAS.pilhaAbrigo && Math.hypot(o.x - a.x, o.z - a.z) < 40);
    if (!temAbrigo) u.construir = 0.3 + 0.1 * P.conscienciosidade;
  }
  if (!ctx.noite && tranquilo > 0.35 && faltaNaCaverna(a, ctx)) u.melhorar_caverna = 0.24 + 0.12 * P.conscienciosidade + (fria ? 0.08 : 0);
  if (sabe(a, 'cavar-raizes') && c.fome > 0.45) u.cavar = Math.pow(c.fome, 1.4) * (temComida ? 0.5 : 1);
  return u;
}

// ---------- Efeitos passivos que também ensinam (percebidos a cada olhada) ----------
export function perceberObjetos(a: Agente, ctx: Contexto, alcance: number) {
  const t = a.tecnico;
  const fogo = ctx.objetos.filter(o => o.tipo === 'fogo').map(o => ({ o, d: Math.hypot(o.x - a.x, o.z - a.z) })).sort((p, q) => p.d - q.d)[0];
  if (fogo && fogo.d < alcance + 20) t.fogoConhecido = { x: fogo.o.x, z: fogo.o.z, quando: ctx.hora };   // fogo se vê de longe
  else if (t.fogoConhecido && ctx.hora - t.fogoConhecido.quando > 6) t.fogoConhecido = null;
  // sentir o calor do fogo quando se está com frio
  if (fogo && fogo.d < 3.5 && a.corpo.frio > 0.2 && !sabe(a, 'calor-do-fogo')) {
    ev(a, ctx, 'chegou perto do fogo e sentiu o frio passar');
    sucesso(a, 'calor-do-fogo', ctx);
  }
  // pegar uma pedra afiada no caminho, para quem sabe para que serve
  if ((sabe(a, 'cortar') || sabe(a, 'lascar')) && !temLasca(a, ctx) && a.tecnico.mao.length < 2) {
    const l = maisPerto(a, ctx, o => o.tipo === 'lasca', 1.8);
    if (l) pegar(a, l, ctx);
  }
}

// abrigo de gravetos: perto de uma pilha grande, o vento e a chuva não pegam
export function pilhaAbrigo(a: Agente, ctx: Contexto) {
  return ctx.objetos.some(o => o.tipo === 'pilha' && (o.qtd ?? 0) >= REGRAS.pilhaAbrigo && Math.hypot(o.x - a.x, o.z - a.z) < 1.8);
}

// dormiu protegido por uma pilha numa noite ruim: aprende que ela abriga
export function dormiuNaPilha(a: Agente, ctx: Contexto) {
  if (!sabe(a, 'abrigo-pilha') && pilhaAbrigo(a, ctx) && (ctx.chuva > 0.2 || ctx.vento > 0.4 || a.corpo.frio > 0.2)) {
    ev(a, ctx, 'dormiu junto de uma pilha de gravetos e sentiu que o vento não pegava');
    sucesso(a, 'abrigo-pilha', ctx);
  }
}

export function descreverTecnicas(a: Agente) { return Object.keys(a.tecnico.sabe).map(t => TECNICAS[t] ?? t); }
export function descreverMao(a: Agente, ctx: Contexto) {
  return segurando(a, ctx).map(o => (tichao(o, ctx.hora) ? 'um graveto aceso' : NOME_OBJETO[o.tipo]));
}
