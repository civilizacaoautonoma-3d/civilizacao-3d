// Emoções, humores, afeto central e personalidade dos agentes (Fase 8).
// Emoções duram de minutos a horas e nascem da avaliação de acontecimentos; humores duram dias e se
// acumulam das emoções e das condições; a personalidade é fixa e muda o quanto cada coisa afeta cada um.

export type Emocao = 'alegria' | 'confianca' | 'medo' | 'surpresa' | 'tristeza' | 'nojo' | 'raiva' | 'antecipacao';
export const EMOCOES: Emocao[] = ['alegria', 'confianca', 'medo', 'surpresa', 'tristeza', 'nojo', 'raiva', 'antecipacao'];

export type Humor = 'ansiedade' | 'solidao' | 'tedio' | 'satisfacao' | 'tristeza' | 'esperanca';

export interface Personalidade {
  abertura: number; conscienciosidade: number; extroversao: number; amabilidade: number; neuroticismo: number;
  coragem: number; dominancia: number;   // 0 … 1
}

export interface Afeto { valencia: number; ativacao: number; controle: number }

export interface Sentimentos {
  emocoes: Record<Emocao, number>;
  humor: Record<Humor, number>;
  afeto: Afeto;
  derivada: string | null;          // emoção complexa do momento: alívio, frustração, orgulho, decepção, luto…
  derivadaAte: number;
}

const lim = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// meia-vida de cada emoção, em horas do mundo
const MEIA_VIDA: Record<Emocao, number> = {
  alegria: 1, confianca: 6, medo: 0.3, surpresa: 0.05, tristeza: 8, nojo: 0.5, raiva: 0.6, antecipacao: 1,
};
const NEGATIVAS: Emocao[] = ['medo', 'tristeza', 'nojo', 'raiva'];

export function novaPersonalidade(rand: () => number): Personalidade {
  // soma de dois sorteios: a maioria fica perto do meio, poucos nos extremos
  const traco = () => lim((rand() + rand()) / 2 + (rand() - 0.5) * 0.2);
  return {
    abertura: traco(), conscienciosidade: traco(), extroversao: traco(), amabilidade: traco(), neuroticismo: traco(),
    coragem: traco(), dominancia: traco(),
  };
}

export function novosSentimentos(): Sentimentos {
  const emocoes = {} as Record<Emocao, number>;
  for (const e of EMOCOES) emocoes[e] = 0;
  return {
    emocoes,
    humor: { ansiedade: 0.1, solidao: 0.1, tedio: 0.1, satisfacao: 0.5, tristeza: 0, esperanca: 0.5 },
    afeto: { valencia: 0, ativacao: 0.2, controle: 0.5 },
    derivada: null, derivadaAte: 0,
  };
}

// um acontecimento avaliado desperta uma emoção; a personalidade amplifica ou amortece
export function sentir(s: Sentimentos, p: Personalidade, e: Emocao, intensidade: number) {
  let k = intensidade;
  if (NEGATIVAS.includes(e)) k *= 0.6 + 0.8 * p.neuroticismo;          // neuróticos sentem mais o que é ruim
  if (e === 'alegria' || e === 'confianca') k *= 0.7 + 0.6 * p.extroversao;
  if (e === 'raiva') k *= 1.3 - 0.6 * p.amabilidade;
  if (e === 'medo') k *= 1.3 - 0.6 * p.coragem;
  if (e === 'antecipacao') k *= 0.7 + 0.6 * p.abertura;
  s.emocoes[e] = lim(Math.max(s.emocoes[e], k));
}

// emoção complexa: nome do que o agente vive agora (para mostrar e registrar)
export function viver(s: Sentimentos, nome: string, hora: number, duracao = 1) {
  s.derivada = nome; s.derivadaAte = hora + duracao;
}

export interface Condicoes {
  horas: number; hora: number;
  fome: number; sede: number; frio: number; dor: number; energia: number; saude: number;
  companhiaPerto: boolean;      // o outro agente está por perto
  companhiaViva: boolean;
  novidade: number;             // células novas do mapa vistas neste instante
  ameacado: boolean;
}

// o tempo passa: emoções se apagam, humores se acumulam devagar, o afeto central é recalculado
export function atualizarSentimentos(s: Sentimentos, p: Personalidade, c: Condicoes) {
  const h = c.horas, e = s.emocoes, m = s.humor;
  for (const k of EMOCOES) e[k] *= Math.pow(0.5, h / (MEIA_VIDA[k] * (NEGATIVAS.includes(k) ? 0.7 + 0.6 * p.neuroticismo : 1)));

  // solidão: cresce longe do outro (mais rápido para extrovertidos), some na companhia
  if (c.companhiaPerto) { m.solidao = lim(m.solidao - h / 3); e.confianca = lim(e.confianca + h * (0.3 + 0.5 * p.extroversao)); }
  else if (c.companhiaViva) m.solidao = lim(m.solidao + (h / 96) * (0.4 + 1.2 * p.extroversao));
  else m.solidao = lim(m.solidao + (h / 24) * (0.4 + 1.2 * p.extroversao));   // sozinho no mundo

  // tédio: rotina sem nada novo; a novidade (lugares nunca vistos) o espanta — mais ainda para os curiosos
  m.tedio = c.novidade > 0 ? lim(m.tedio - 0.02 * c.novidade) : lim(m.tedio + (h / 48) * (0.3 + 1.2 * p.abertura));

  // ansiedade: medos que se repetem viram um estado de alerta que dura
  m.ansiedade = lim(m.ansiedade + (c.ameacado ? h * 0.8 : 0) + e.medo * h * 0.3 - (h / 30) * (1.2 - p.neuroticismo));

  // tristeza de fundo: acumula de tristezas, dor e saúde ruim; esvai com o tempo e com a alegria
  m.tristeza = lim(m.tristeza + (e.tristeza * 0.5 + c.dor * 0.2 + (c.saude < 0.5 ? 0.2 : 0)) * h / 6 - (h / 72) - e.alegria * h * 0.05);

  // satisfação: corpo bem cuidado ao longo do tempo
  const conforto = 1 - Math.max(c.fome, c.sede, c.frio, c.dor);
  m.satisfacao = lim(m.satisfacao + (conforto - m.satisfacao) * (h / 12) + e.alegria * h * 0.05);

  // esperança: o saldo de alegrias e tristezas recentes
  m.esperanca = lim(m.esperanca + ((e.alegria + e.antecipacao) - (e.tristeza + e.medo)) * h * 0.03 + (0.5 - m.esperanca) * h / 36);

  // afeto central (valência, ativação, controle)
  const positivo = e.alegria + e.confianca * 0.5 + e.antecipacao * 0.3;
  const negativo = e.medo + e.tristeza + e.nojo * 0.6 + e.raiva * 0.8;
  s.afeto.valencia = lim(positivo - negativo + (m.satisfacao - 0.5) * 0.6 - m.tristeza * 0.5 - (1 - conforto) * 0.4, -1, 1);
  s.afeto.ativacao = lim(Math.max(e.medo, e.raiva, e.surpresa, e.alegria * 0.7, e.antecipacao * 0.6) + m.ansiedade * 0.3);
  s.afeto.controle = lim(0.3 + c.energia * 0.3 + c.saude * 0.2 + p.coragem * 0.2 - e.medo * 0.4);

  if (s.derivada && c.hora > s.derivadaAte) s.derivada = null;
}

export function emocaoDominante(s: Sentimentos): { emocao: Emocao | null; intensidade: number } {
  let melhor: Emocao | null = null, v = 0.15;
  for (const k of EMOCOES) if (s.emocoes[k] > v) { v = s.emocoes[k]; melhor = k; }
  return { emocao: melhor, intensidade: melhor ? v : 0 };
}

// como os outros descrevem o jeito de alguém (os dois traços mais marcantes)
export function descreverPersonalidade(p: Personalidade, sexo: 'M' | 'F'): string[] {
  const g = (m: string) => (sexo === 'F' ? m.replace(/o$/, 'a').replace(/o à/, 'a à') : m);
  const t: [number, string][] = [
    [p.abertura - 0.5, g('curioso')], [0.5 - p.abertura, g('apegado à rotina')],
    [p.conscienciosidade - 0.5, g('cuidadoso')], [0.5 - p.conscienciosidade, 'impulsivo'.replace(/o$/, sexo === 'F' ? 'a' : 'o')],
    [p.extroversao - 0.5, 'sociável'], [0.5 - p.extroversao, g('reservado')],
    [p.amabilidade - 0.5, 'gentil'], [0.5 - p.amabilidade, g('esquentado')],
    [p.neuroticismo - 0.5, g('ansioso')], [0.5 - p.neuroticismo, g('tranquilo')],
    [p.coragem - 0.5, g('corajoso')], [0.5 - p.coragem, g('medroso')],
  ];
  return t.sort((a, b) => b[0] - a[0]).slice(0, 3).filter(x => x[0] > 0.05).map(x => x[1]);
}
