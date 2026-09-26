// IA deliberativa (Fase 9): o LLM decide em momentos específicos; o motor valida e executa.
// - plano do dia (ao acordar), deliberação em eventos marcantes, reflexão noturna (ao dormir)
// - ontologia neutra: o agente só "sabe" o que sentiu, lembrou, acredita e percebe — sem palavras do nosso mundo
// - ações fechadas (enum) e lugares só entre os que ele conhece; filtro de anacronismo nos textos
// - fila com prioridade, orçamento por agente/dia do mundo e teto por hora real; sem LLM, segue por utilidade
import { z } from 'zod';
import type { Especie } from '../../shared/especies';
import type { Agente, Objetivo } from './agente';
import type { Contexto } from './contexto';
import { emocaoDominante, descreverPersonalidade } from './emocoes';

// ---------- Contrato com o LLM ----------
export const ACOES = ['comer', 'beber', 'dormir', 'descansar', 'abrigar', 'explorar', 'fugir', 'aproximar', 'cacar'] as const;
export type AcaoLLM = typeof ACOES[number] & Objetivo;
export type TipoDeliberacao = 'plano' | 'evento' | 'reflexao';

export const EsquemaPlano = z.object({
  pensamento: z.string(),
  prioridades: z.array(z.object({ acao: z.enum(ACOES), lugar: z.string().nullable(), peso: z.number() })),
  evitar: z.array(z.string()),
});
export const EsquemaEvento = z.object({ pensamento: z.string(), acao: z.enum(ACOES), lugar: z.string().nullable() });
export const EsquemaReflexao = z.object({
  resumo: z.string(),
  crencas: z.array(z.object({ enunciado: z.string(), certeza: z.number() })),
});
export type RespostaPlano = z.infer<typeof EsquemaPlano>;
export type RespostaEvento = z.infer<typeof EsquemaEvento>;
export type RespostaReflexao = z.infer<typeof EsquemaReflexao>;
export type Resposta = RespostaPlano | RespostaEvento | RespostaReflexao;

// ---------- O que o agente sabe (montado só com o que é dele) ----------
export interface LugarConhecido { id: string; tipo: 'agua' | 'comida' | 'carne'; descricao: string }
export interface Situacao {
  tipo: TipoDeliberacao;
  evento: string | null;
  momento: string; estacao: string; tempo: string;
  corpo: string[]; sente: string | null; humor: string[]; jeito: string[];
  lugares: LugarConhecido[]; perigos: string[];
  crencas: string[]; lembrancas: string[]; percebe: string[];
  outro: string;
  acoesPossiveis: AcaoLLM[];
  diario: string[];
}

export interface EstadoDeliberativo {
  plano: { dia: number; itens: { acao: AcaoLLM; lugar: string | null; peso: number }[]; evitar: string[] } | null;
  decisao: { acao: AcaoLLM; lugar: string | null; ate: number } | null;
  pensamento: string; pensadoEm: number;
  orcamento: { dia: number; usadas: number };
  lugares: Record<string, { x: number; z: number }>;   // os ids do último contexto (L1, L2…) -> onde ficam
  diario: string[];
  ultimoEvento: number;
  vistas: string[];                                      // bichos que já viu (para notar a primeira vez)
  acompanhar: { id: number; ate: number; saude: number; fome: number; sede: number } | null;
  planoPedido: number;                                   // dia em que já pediu o plano (não pede de novo se falhar)
}

export const novoEstadoDeliberativo = (): EstadoDeliberativo => ({
  plano: null, decisao: null, pensamento: '', pensadoEm: -1e9,
  orcamento: { dia: -1, usadas: 0 }, lugares: {}, diario: [], ultimoEvento: -1e9, vistas: [], acompanhar: null, planoPedido: -1,
});

// um acontecimento marcante pede deliberação (no máximo uma por hora do mundo)
export function pedirEvento(a: Agente, ctx: Contexto, descricao: string) {
  if (ctx.hora - a.deliberacao.ultimoEvento < 1) return;
  a.deliberacao.ultimoEvento = ctx.hora;
  pedirDeliberacao(a, ctx, 'evento', descricao);
}

// ao acordar (ou no primeiro momento acordado do dia): pedir o plano do dia
export function talvezPlanejar(a: Agente, ctx: Contexto) {
  const dia = Math.floor(ctx.hora / 24);
  if (ctx.noite || a.deliberacao.planoPedido === dia) return;
  a.deliberacao.planoPedido = dia;
  pedirDeliberacao(a, ctx, 'plano');
}

// nomes neutros: o agente não tem palavras nossas para os bichos
export const NOME_NEUTRO: Record<Especie, string> = {
  lobo: 'bicho cinzento de dentes', javali: 'bicho escuro de presas', cervo: 'bicho alto de chifres',
  coelho: 'bicho pequeno de orelhas longas', ave: 'bicho que voa', peixe: 'bicho da água',
};
const PLURAL_NEUTRO: Record<string, string> = {
  lobos: 'bichos cinzentos de dentes', javalis: 'bichos escuros de presas', cervos: 'bichos altos de chifres',
  coelhos: 'bichos pequenos de orelhas longas', pássaros: 'bichos que voam', peixes: 'bichos da água',
};
export function neutralizar(texto: string) {
  let t = texto;
  for (const [k, v] of Object.entries(PLURAL_NEUTRO)) t = t.replace(new RegExp(`\\b${k}\\b`, 'gi'), v);
  for (const [k, v] of Object.entries(NOME_NEUTRO)) t = t.replace(new RegExp(`\\b${k}\\b`, 'gi'), v);
  return t.replace(/\bpássaro\b/gi, NOME_NEUTRO.ave);
}

// ---------- Filtro de anacronismo ----------
// o LLM conhece o mundo real; o agente não. Nada de tecnologia, cultura ou nomes que ninguém descobriu ainda.
const PROIBIDAS = [
  'fogo', 'fogueira', 'brasa', 'chama', 'faca', 'lança', 'lanca', 'flecha', 'machado', 'ferramenta', 'arma',
  'roupa', 'casaco', 'casa', 'cabana', 'aldeia', 'agricultur', 'plantar', 'plantaç', 'semear', 'colheita',
  'cozinh', 'assar', 'panela', 'pote', 'metal', 'ferro', 'cobre', 'roda', 'dinheiro', 'moeda', 'troca',
  'rei', 'rainha', 'deus', 'oração', 'rezar', 'templo', 'escrev', 'livro', 'cão', 'cachorro', 'domestic',
  'cerca', 'curral', 'anzol', 'barco', 'canoa', 'jangada', 'corda', 'cesto', 'cesta', 'tecido', 'lobo', 'javali',
  'cervo', 'coelho', 'peixe', 'pássaro', 'veado', 'urso',
];
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const RE_PROIBIDAS = PROIBIDAS.map(p => new RegExp(`\\b${semAcento(p)}`, 'i'));
export function anacronismo(texto: string): string | null {
  const t = semAcento(texto);
  for (let i = 0; i < PROIBIDAS.length; i++) if (RE_PROIBIDAS[i].test(t)) return PROIBIDAS[i];
  return null;
}

// ---------- Montar a situação (só o que o agente sabe) ----------
const DIRECAO = ['norte', 'nordeste', 'leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste'];
function ondeFica(a: Agente, x: number, z: number) {
  const d = Math.hypot(x - a.x, z - a.z);
  const ang = (Math.atan2(x - a.x, -(z - a.z)) * 180) / Math.PI;
  const dir = DIRECAO[Math.round(((ang + 360) % 360) / 45) % 8];
  return d < 8 ? 'bem aqui perto' : `a uns ${Math.round(d / 5) * 5} passos para o ${dir}`;
}

const PALAVRA_EMOCAO: Record<string, string> = {
  alegria: 'alegria', confianca: 'confiança', medo: 'medo', surpresa: 'surpresa', tristeza: 'tristeza',
  nojo: 'nojo', raiva: 'raiva', antecipacao: 'expectativa',
};

export function montarSituacao(a: Agente, ctx: Contexto, tipo: TipoDeliberacao, evento: string | null): Situacao {
  const c = a.corpo, s = a.sentimentos;
  const corpo: string[] = [];
  const nivel = (v: number, fraco: string, forte: string) => { if (v > 0.8) corpo.push(forte); else if (v > 0.5) corpo.push(fraco); };
  nivel(c.fome, 'fome', 'muita fome'); nivel(c.sede, 'sede', 'muita sede'); nivel(c.sono, 'sono', 'muito sono');
  nivel(c.frio, 'frio', 'muito frio'); nivel(c.dor, 'dor', 'muita dor');
  if (c.energia < 0.3) corpo.push('cansaço'); if (c.saude < 0.5) corpo.push('fraqueza, corpo machucado');
  const dom = emocaoDominante(s);
  const humor = Object.entries(s.humor).filter(([k, v]) => v > 0.55 && k !== 'satisfacao' && k !== 'esperanca')
    .map(([k]) => ({ ansiedade: 'inquieto', solidao: 'sozinho', tedio: 'entediado', tristeza: 'melancólico' } as Record<string, string>)[k] ?? k);

  // lugares que conhece (os mais úteis), com ids para o LLM escolher
  a.deliberacao.lugares = {};
  const lugares: LugarConhecido[] = [];
  const mem = [...a.memoria].filter(m => m.tipo === 'agua' || m.frutos > 0 || ctx.hora - m.quando > 24)
    .sort((p, q) => Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(q.x - a.x, q.z - a.z)).slice(0, 8);
  mem.forEach((m, i) => {
    const id = `L${i + 1}`;
    a.deliberacao.lugares[id] = { x: m.x, z: m.z };
    const oQue = m.tipo === 'agua' ? 'água para beber'
      : m.tipo === 'carne' ? 'um bicho morto (carne)'
      : m.frutos > 0 ? `um arbusto com ${m.frutos > 3 ? 'muitos' : 'alguns'} frutos` : 'um arbusto que estava sem frutos';
    lugares.push({ id, tipo: m.tipo, descricao: `${oQue}, ${ondeFica(a, m.x, m.z)}` });
  });

  const outro = ctx.agentes.find(o => o !== a && o.vivo);
  const dOutro = outro ? Math.hypot(outro.x - a.x, outro.z - a.z) : Infinity;
  const possiveis: AcaoLLM[] = ['descansar', 'explorar', 'abrigar', 'beber', 'comer'];
  if (ctx.noite || c.sono > 0.5) possiveis.push('dormir');
  if (a.ameaca) possiveis.push('fugir');
  if (outro) possiveis.push('aproximar');
  if (a.presaVista) possiveis.push('cacar');

  return {
    tipo, evento: evento ? neutralizar(evento) : null,
    momento: ctx.noite ? 'noite' : (ctx.hora % 24) < 12 ? 'manhã' : 'tarde',
    estacao: ctx.estacao.toLowerCase(),
    tempo: ({ 'Limpo': 'céu limpo', 'Poucas nuvens': 'algumas nuvens', 'Nublado': 'céu fechado', 'Neblina': 'neblina',
      'Chuva': 'chuva', 'Tempestade': 'tempestade com trovões' } as Record<string, string>)[ctx.clima] ?? ctx.clima,
    corpo, sente: dom.emocao ? PALAVRA_EMOCAO[dom.emocao] : null, humor,
    jeito: descreverPersonalidade(a.personalidade, a.sexo),
    lugares,
    perigos: a.mente.crencas.filter(k => k.chave.startsWith('lugar:')).map(k => neutralizar(k.enunciado)),
    crencas: a.mente.crencas.filter(k => !k.chave.startsWith('lugar:')).map(k => `${neutralizar(k.enunciado)} (${k.certeza > 0.6 ? 'tem certeza' : 'acha'})`),
    lembrancas: [...a.mente.episodios].sort((p, q) => q.importancia * q.forca - p.importancia * p.forca).slice(0, 5).map(lembrancaNeutra),
    percebe: a.percebidos.slice(0, 5).map(p => `${p.ouvido ? 'ouve' : 'vê'} ${p.certeza < 0.5 ? 'algo que parece ' : ''}um ${NOME_NEUTRO[p.especie]} ${ondeFica(a, p.x, p.z)}`),
    outro: !outro ? 'não existe mais ninguém como você por perto' : dOutro < 10 ? 'a outra pessoa está perto de você'
      : dOutro < 40 ? 'a outra pessoa está por perto, mas não junto' : 'não sabe onde está a outra pessoa',
    acoesPossiveis: [...new Set(possiveis)],
    diario: a.deliberacao.diario.slice(-2),
  };
}

function lembrancaNeutra(e: Agente['mente']['episodios'][number]) {
  const [tipo, valor] = e.sobre.split(':');
  const alvo = tipo === 'especie' ? `um ${NOME_NEUTRO[valor as Especie] ?? 'bicho'}` : tipo === 'arbusto' ? 'um arbusto' : 'algo';
  const t: Record<string, string> = {
    atacado: `foi atacado por ${alvo}`, viu: `viu ${alvo} de perto e nada aconteceu`, passou_mal: 'passou mal depois de comer carne velha',
    comeu: e.sobre === 'carne' ? 'comeu carne' : 'comeu frutos doces', cacou: `pegou ${alvo}`, falhou_caca: `tentou pegar ${alvo} e não conseguiu`,
    fugiu: `fugiu de ${alvo}`, decepcao: 'achou vazio um arbusto que esperava cheio', viu_morte: 'viu a outra pessoa morrer',
    sentiu_frio: 'passou muito frio',
  };
  return `${t[e.oQue] ?? e.oQue}${e.vezes > 1 ? ` (várias vezes)` : ''}`;
}

// ---------- Provedores (quem pensa) ----------
export interface Provedor {
  nome: string;
  sincrono: boolean;
  pensar(situacao: Situacao): Resposta | Promise<Resposta>;
}

// ---------- Fila, orçamento e registro ----------
export interface Pedido { id: number; agenteId: string; tipo: TipoDeliberacao; prioridade: number; criadoEm: number; situacao: Situacao }
export interface RegistroDeliberacao {
  quando: number; agente: string; tipo: TipoDeliberacao | 'consequencia'; provedor?: string;
  situacao?: Situacao; resposta?: Resposta | null; aplicado?: string; rejeitado?: string[]; erro?: string;
  consequencia?: { saude: number; fome: number; sede: number };
}

const PRIORIDADE: Record<TipoDeliberacao, number> = { evento: 3, reflexao: 2, plano: 1 };
const VALIDADE_HORAS: Record<TipoDeliberacao, number> = { evento: 1, reflexao: 6, plano: 8 };

export const config = {
  provedor: null as Provedor | null,
  porAgentePorDia: 8,
  porHoraReal: 120,
  simultaneos: 2,
  registrar: (_r: RegistroDeliberacao) => {},
  avisar: (_t: string) => {},
};

let proximoId = 1;
const fila: Pedido[] = [];
const prontos: { pedido: Pedido; resposta: Resposta | null; erro?: string }[] = [];
let emAndamento = 0;
const chamadasRecentes: number[] = [];   // horários reais das chamadas (teto por hora)
let avisouOrcamento = -1;

export function configurarMente(c: Partial<typeof config>) { Object.assign(config, c); }

export function pedirDeliberacao(a: Agente, ctx: Contexto, tipo: TipoDeliberacao, evento: string | null = null) {
  if (!config.provedor) return;
  const d = a.deliberacao, dia = Math.floor(ctx.hora / 24);
  if (d.orcamento.dia !== dia) d.orcamento = { dia, usadas: 0 };
  if (d.orcamento.usadas >= config.porAgentePorDia) {
    if (avisouOrcamento !== dia) { config.avisar(`${a.nome} ficou sem orçamento de deliberação hoje; segue por instinto`); avisouOrcamento = dia; }
    return;
  }
  if (fila.some(p => p.agenteId === a.id && p.tipo === tipo)) return;   // já tem um pedido igual esperando
  d.orcamento.usadas++;
  fila.push({ id: proximoId++, agenteId: a.id, tipo, prioridade: PRIORIDADE[tipo], criadoEm: ctx.hora, situacao: montarSituacao(a, ctx, tipo, evento) });
  if (fila.length > 20) { fila.sort((p, q) => q.prioridade - p.prioridade || q.criadoEm - p.criadoEm); fila.length = 20; }
}

// a cada tick: aplica respostas prontas e despacha pedidos (em ordem de prioridade), respeitando o teto por hora real
export function pulsoDaMente(agentes: Agente[], hora: number) {
  const p = config.provedor;
  if (!p) return;
  for (const r of prontos.splice(0)) aplicarResposta(agentes, r.pedido, r.resposta, hora, r.erro);
  acompanharConsequencias(agentes, hora);

  const agora = Date.now();
  while (chamadasRecentes.length && agora - chamadasRecentes[0] > 3_600_000) chamadasRecentes.shift();
  fila.sort((x, y) => y.prioridade - x.prioridade || x.criadoEm - y.criadoEm);
  while (fila.length && emAndamento < config.simultaneos) {
    const pedido = fila.shift()!;
    if (hora - pedido.criadoEm > VALIDADE_HORAS[pedido.tipo]) continue;       // passou da hora: não faz mais sentido
    if (!p.sincrono && chamadasRecentes.length >= config.porHoraReal) { fila.unshift(pedido); break; }
    if (p.sincrono) {
      let resposta: Resposta | null = null, erro: string | undefined;
      try { resposta = p.pensar(pedido.situacao) as Resposta; } catch (e) { erro = String(e); }
      aplicarResposta(agentes, pedido, resposta, hora, erro);
      continue;
    }
    emAndamento++; chamadasRecentes.push(agora);
    Promise.resolve(p.pensar(pedido.situacao))
      .then(resposta => prontos.push({ pedido, resposta }))
      .catch(e => prontos.push({ pedido, resposta: null, erro: e instanceof Error ? e.message : String(e) }))
      .finally(() => { emAndamento--; });
  }
}

export const estadoDaFila = () => ({ esperando: fila.length, emAndamento, chamadasNaUltimaHora: chamadasRecentes.length });

// ---------- Validar e aplicar: o motor tem a palavra final ----------
function limparTexto(texto: string, rejeitado: string[], onde: string) {
  const t = texto.trim().slice(0, 240);
  const palavra = anacronismo(t);
  if (palavra) { rejeitado.push(`${onde}: anacronismo ("${palavra}")`); return null; }
  return t;
}

function aplicarResposta(agentes: Agente[], pedido: Pedido, resposta: Resposta | null, hora: number, erro?: string) {
  const a = agentes.find(x => x.id === pedido.agenteId);
  const registro: RegistroDeliberacao = {
    quando: hora, agente: a?.nome ?? pedido.agenteId, tipo: pedido.tipo, provedor: config.provedor?.nome,
    situacao: pedido.situacao, resposta, rejeitado: [],
  };
  if (!a || !a.vivo) { registro.erro = 'agente não está mais vivo'; config.registrar(registro); return; }
  if (!resposta) { registro.erro = erro ?? 'sem resposta'; config.registrar(registro); return; }
  const d = a.deliberacao, rej = registro.rejeitado!;
  const lugarValido = (id: string | null) => {
    if (id === null) return null;
    if (d.lugares[id]) return id;
    rej.push(`lugar desconhecido "${id}"`); return null;
  };

  if (pedido.tipo === 'plano') {
    const r = resposta as RespostaPlano;
    const itens = r.prioridades.slice(0, 4)
      .filter(i => { if (pedido.situacao.acoesPossiveis.includes(i.acao) || i.acao === 'dormir') return true; rej.push(`ação indisponível "${i.acao}"`); return false; })
      .map(i => ({ acao: i.acao as AcaoLLM, lugar: lugarValido(i.lugar), peso: Math.min(3, Math.max(1, Math.round(i.peso))) }));
    const evitar = r.evitar.filter(id => d.lugares[id]).slice(0, 3);
    d.plano = { dia: Math.floor(hora / 24), itens, evitar };
    registro.aplicado = `plano: ${itens.map(i => `${i.acao}${i.lugar ? '@' + i.lugar : ''}×${i.peso}`).join(', ') || '(vazio)'}${evitar.length ? ` · evitar ${evitar.join(',')}` : ''}`;
    const t = limparTexto(r.pensamento, rej, 'pensamento');
    if (t) { d.pensamento = t; d.pensadoEm = hora; }
  } else if (pedido.tipo === 'evento') {
    const r = resposta as RespostaEvento;
    if (!pedido.situacao.acoesPossiveis.includes(r.acao)) rej.push(`ação indisponível "${r.acao}"`);
    else {
      d.decisao = { acao: r.acao as AcaoLLM, lugar: lugarValido(r.lugar), ate: hora + 1 };
      d.acompanhar = { id: pedido.id, ate: hora + 1, saude: a.corpo.saude, fome: a.corpo.fome, sede: a.corpo.sede };
      registro.aplicado = `decisão: ${r.acao}${d.decisao.lugar ? ' em ' + d.decisao.lugar : ''} (por 1 hora)`;
    }
    const t = limparTexto(r.pensamento, rej, 'pensamento');
    if (t) { d.pensamento = t; d.pensadoEm = hora; }
  } else {
    const r = resposta as RespostaReflexao;
    const resumo = limparTexto(r.resumo, rej, 'resumo');
    if (resumo) { d.diario.push(`dia ${Math.floor(hora / 24) + 1}: ${resumo}`); d.diario = d.diario.slice(-10); d.pensamento = resumo; d.pensadoEm = hora; }
    const novas: string[] = [];
    for (const cr of r.crencas.slice(0, 2)) {
      const texto = limparTexto(cr.enunciado, rej, 'crença');
      if (!texto) continue;
      const chave = `reflexao:${semAcento(texto).replace(/[^a-z ]/g, '').slice(0, 60)}`;
      const certeza = Math.min(0.8, Math.max(0.2, cr.certeza));
      const existente = a.mente.crencas.find(k => k.chave === chave);
      if (existente) existente.certeza = Math.max(existente.certeza, certeza);
      else { a.mente.crencas.push({ chave, enunciado: texto, certeza, origem: 'experiência', transmitidaPor: null, desde: hora }); novas.push(texto); }
    }
    for (const n of novas) config.avisar(`${a.nome} refletiu e passou a acreditar que ${n}`);
    registro.aplicado = `reflexão: ${resumo ? 'resumo guardado' : 'sem resumo'}${novas.length ? `, ${novas.length} crença(s) nova(s)` : ''}`;
  }
  config.registrar(registro);
}

function acompanharConsequencias(agentes: Agente[], hora: number) {
  for (const a of agentes) {
    const ac = a.deliberacao.acompanhar;
    if (!ac || hora < ac.ate) continue;
    config.registrar({ quando: hora, agente: a.nome, tipo: 'consequencia', aplicado: `pedido ${ac.id}`,
      consequencia: { saude: +(a.corpo.saude - ac.saude).toFixed(2), fome: +(a.corpo.fome - ac.fome).toFixed(2), sede: +(a.corpo.sede - ac.sede).toFixed(2) } });
    a.deliberacao.acompanhar = null;
  }
}

// ---------- Como a deliberação pesa nas decisões do dia ----------
export function vieses(a: Agente, hora: number): Partial<Record<Objetivo, number>> {
  const v: Partial<Record<Objetivo, number>> = {};
  const d = a.deliberacao;
  if (d.plano && d.plano.dia === Math.floor(hora / 24))
    for (const i of d.plano.itens) v[i.acao as Objetivo] = (v[i.acao as Objetivo] ?? 0) + 0.08 * i.peso;
  if (d.decisao && hora < d.decisao.ate) v[d.decisao.acao as Objetivo] = (v[d.decisao.acao as Objetivo] ?? 0) + 0.6;
  return v;
}

// lugar que o plano (ou a decisão) mandou procurar / evitar
export function lugarDesejado(a: Agente, acao: Objetivo, hora: number): { x: number; z: number } | null {
  const d = a.deliberacao;
  const id = d.decisao && hora < d.decisao.ate && d.decisao.acao === acao ? d.decisao.lugar
    : d.plano?.dia === Math.floor(hora / 24) ? d.plano.itens.find(i => i.acao === acao && i.lugar)?.lugar ?? null : null;
  return id ? d.lugares[id] ?? null : null;
}
export function lugarEvitado(a: Agente, x: number, z: number, hora: number) {
  const d = a.deliberacao;
  if (!d.plano || d.plano.dia !== Math.floor(hora / 24)) return false;
  return d.plano.evitar.some(id => { const p = d.lugares[id]; return p && Math.hypot(p.x - x, p.z - z) < 12; });
}

