// Memória episódica, expectativas e crenças dos agentes (documentação, seções 6, 9 e 9.1).
// Perceber não é entender: o significado ("perigo", "comida boa") vem das memórias.
// Crenças nascem na reflexão durante o sono — e podem estar erradas.
import { ARBUSTOS, WATER_LEVEL, heightAt } from '../../shared/mundo';
import { celulaMapa, centroDaCelulaMapa } from './mapa';

// como o agente se refere a um lugar (sem coordenadas: pelo que tem ali)
function descreverLugar(x: number, z: number) {
  if (ARBUSTOS.some(b => Math.hypot(b.x - x, b.z - z) < 15)) return 'perto daquele arbusto de frutos';
  if (heightAt(x, z) < WATER_LEVEL + 1.5) return 'na beira da água';
  if (heightAt(x, z) > 10) return 'lá no alto';
  return 'no meio do mato';
}

export type TipoEpisodio = 'atacado' | 'viu' | 'passou_mal' | 'comeu' | 'cacou' | 'falhou_caca'
  | 'fugiu' | 'decepcao' | 'viu_morte' | 'sentiu_frio';

export interface Episodio {
  quando: number; x: number; z: number;
  oQue: TipoEpisodio;
  sobre: string;          // 'especie:lobo', 'fruto', 'carne', 'carne-podre', 'arbusto:12', 'agente:ag_002'...
  valencia: number;       // -1 muito ruim … +1 muito bom
  intensidade: number;    // 0 … 1
  importancia: number;    // o quanto marcou (decide quanto tempo dura)
  forca: number;          // 1 = viva, 0 = esquecida
  vezes: number;          // repetições que reforçaram esta lembrança
  contexto: { clima: string; noite: boolean; celula: number };
}

export interface Crenca {
  chave: string;          // 'perigo:especie:lobo', 'contexto:Neblina', 'lugar:1234', 'aversao:carne-podre'
  enunciado: string;
  certeza: number;        // 0 … 1
  origem: 'experiência';
  transmitidaPor: string | null;
  desde: number;
}

export interface Mente { episodios: Episodio[]; crencas: Crenca[]; seguro: Record<string, number> }

export const novaMente = (): Mente => ({ episodios: [], crencas: [], seguro: {} });

const lim = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// ---------- Lembrar ----------
export function registrarEpisodio(m: Mente, e: Omit<Episodio, 'importancia' | 'forca' | 'vezes'>) {
  // um acontecimento parecido, no mesmo lugar e há pouco tempo, reforça a lembrança em vez de criar outra
  const igual = m.episodios.find(p => p.oQue === e.oQue && p.sobre === e.sobre &&
    Math.hypot(p.x - e.x, p.z - e.z) < 20 && e.quando - p.quando < 6);
  const importancia = lim(e.intensidade * (0.4 + 0.6 * Math.abs(e.valencia)));
  if (igual) {
    igual.vezes++; igual.forca = 1; igual.quando = e.quando;
    igual.intensidade = Math.max(igual.intensidade, e.intensidade);
    igual.valencia = (igual.valencia * (igual.vezes - 1) + e.valencia) / igual.vezes;
    // repetição fixa a memória, na medida do quanto aquilo marca (o corriqueiro continua corriqueiro)
    igual.importancia = lim(Math.max(igual.importancia, importancia) + 0.03 * e.intensidade);
    return igual;
  }
  const ep: Episodio = { ...e, importancia, forca: 1, vezes: 1 };
  m.episodios.push(ep);
  if (m.episodios.length > 120) {
    m.episodios.sort((a, b) => b.importancia * b.forca - a.importancia * a.forca);
    m.episodios.length = 100;
  }
  return ep;
}

// sem rever, esquece; o que marcou dura muito mais (detalhes somem antes do que importa)
export function esquecer(m: Mente, horas: number) {
  for (const e of m.episodios) e.forca -= (horas / 72) * (1 - 0.9 * e.importancia);
  if (m.episodios.some(e => e.forca <= 0)) m.episodios = m.episodios.filter(e => e.forca > 0);
}

// ---------- Lembrança por semelhança e expectativa ----------
// "o que aconteceu das outras vezes que encontrei isto (e aqui perto)?"
export function expectativa(m: Mente, sobre: string, hora: number, onde?: { x: number; z: number }) {
  let soma = 0, peso = 0;
  const prefixo = sobre.split(':')[0] + ':';
  for (const e of m.episodios) {
    const igual = e.sobre === sobre ? 1 : e.sobre.startsWith(prefixo) && prefixo !== 'especie:' ? 0.3 : 0;
    if (!igual) continue;
    const perto = onde ? 0.5 + 0.5 * Math.exp(-Math.hypot(e.x - onde.x, e.z - onde.z) / 40) : 1;
    const recente = Math.exp(-(hora - e.quando) / (24 * 40));
    // o que marcou pesa muito mais que o corriqueiro, e o ruim pesa mais que o bom (viés de negatividade)
    const s = igual * e.forca * (0.1 + e.importancia) * perto * recente * Math.min(3, e.vezes) * (e.valencia < 0 ? 2 : 1);
    soma += s * e.valencia; peso += s;
  }
  return { valor: soma / (peso + 0.5), peso };   // o +0.5 puxa para neutro quando há pouca experiência
}

export const crenca = (m: Mente, chave: string) => m.crencas.find(c => c.chave === chave)?.certeza ?? 0;

// ---------- Reflexão (no sono): memórias viram conclusões ----------
const NOME_ESPECIE: Record<string, string> = {
  lobo: 'lobos', javali: 'javalis', cervo: 'cervos', coelho: 'coelhos', ave: 'pássaros', peixe: 'peixes',
};
const SUPERSTICAO: Record<string, string> = {
  'Tempestade': 'as tempestades trazem perigo', 'Neblina': 'a neblina traz perigo', 'Chuva': 'a chuva traz perigo',
  'Nublado': 'os dias nublados trazem perigo', noite: 'a noite traz perigo',
};

function crer(m: Mente, chave: string, enunciado: string, certeza: number, hora: number, avisar: (t: string) => void) {
  const c = m.crencas.find(x => x.chave === chave);
  if (c) { c.certeza = lim(Math.max(c.certeza, certeza)); return; }
  if (certeza < 0.25) return;
  m.crencas.push({ chave, enunciado, certeza: lim(certeza), origem: 'experiência', transmitidaPor: null, desde: hora });
  avisar(`passou a acreditar que ${enunciado}`);
}

export function refletir(m: Mente, hora: number, avisar: (t: string) => void, rand: () => number, propensao = 1) {
  // 1) espécies que machucaram (ou só assustaram muito)
  const especies = new Set(m.episodios.filter(e => e.sobre.startsWith('especie:')).map(e => e.sobre));
  for (const sobre of especies) {
    const { valor, peso } = expectativa(m, sobre, hora);
    const esp = sobre.split(':')[1];
    if (valor < -0.3 && peso > 0.6) crer(m, `perigo:${sobre}`, `${NOME_ESPECIE[esp] ?? esp} são perigosos`, -valor, hora, avisar);
  }
  // 2) aversão: o que fez mal ao comer
  const mal = expectativa(m, 'carne-podre', hora);
  if (mal.valor < -0.3) crer(m, 'aversao:carne-podre', 'carne velha faz mal', -mal.valor, hora, avisar);
  // 3) lugares onde coisas ruins aconteceram mais de uma vez
  const ruins = m.episodios.filter(e => e.valencia < -0.5 && e.intensidade > 0.5 && hora - e.quando < 24 * 20);
  for (const e of ruins) {
    const vizinhos = ruins.filter(o => Math.hypot(o.x - e.x, o.z - e.z) < 25);
    if (vizinhos.length >= 2) {
      const perto = m.crencas.find(k => k.chave.startsWith('lugar:') && Math.hypot(centro(k).x - e.x, centro(k).z - e.z) < 40);
      if (perto) perto.certeza = lim(Math.max(perto.certeza, 0.3 + 0.15 * vizinhos.length));
      else crer(m, `lugar:${celulaMapa(e.x, e.z)}`, `é perigoso ${descreverLugar(e.x, e.z)} onde coisas ruins aconteceram`,
        0.3 + 0.15 * vizinhos.length, hora, avisar);
    }
  }
  // 4) superstição: o que estava acontecendo em volta quando algo muito ruim aconteceu hoje
  //    (a mente liga coincidências — "quando veio a neblina, o lobo atacou")
  const hoje = ruins.filter(e => hora - e.quando < 24);
  for (const e of hoje) {
    const pista = e.contexto.clima !== 'Limpo' && e.contexto.clima !== 'Poucas nuvens' ? e.contexto.clima : e.contexto.noite ? 'noite' : null;
    if (!pista || rand() > 0.35 * e.intensidade * propensao) continue;
    crer(m, `contexto:${pista}`, SUPERSTICAO[pista] ?? `${pista} traz perigo`, 0.25 + 0.3 * e.intensidade, hora, avisar);
  }
  // 5) crenças que não se confirmam perdem força, devagar (a mente se apega ao que já acredita)
  for (const c of m.crencas) {
    const seguras = m.seguro[c.chave] ?? 0;
    if (seguras > 0) c.certeza -= 0.02 * Math.min(3, seguras);   // a mente se apega: esquece devagar
    m.seguro[c.chave] = 0;
  }
  const perdidas = m.crencas.filter(c => c.certeza < 0.12);
  for (const c of perdidas) avisar(`deixou de acreditar que ${c.enunciado}`);
  m.crencas = m.crencas.filter(c => c.certeza >= 0.12);
}

const centro = (c: Crenca) => centroDaCelulaMapa(Number(c.chave.split(':')[1]));

// passou um tempo exposto àquilo em que acredita, e nada de ruim aconteceu
export function exposicaoSegura(m: Mente, chave: string) {
  if (m.crencas.some(c => c.chave === chave)) m.seguro[chave] = (m.seguro[chave] ?? 0) + 1;
}

// perigo que uma crença de lugar atribui a um ponto (0 … 1)
export function perigoDoLugar(m: Mente, x: number, z: number) {
  let p = 0;
  for (const c of m.crencas) {
    if (!c.chave.startsWith('lugar:')) continue;
    const q = centro(c);
    if (Math.hypot(q.x - x, q.z - z) < 25) p = Math.max(p, c.certeza);
  }
  return p;
}
