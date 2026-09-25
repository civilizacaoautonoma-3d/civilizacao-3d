// Relógio e clima do mundo.
// Este arquivo não usa Three.js de propósito: é usado pelo motor (servidor),
// que é o dono do tempo, e pelo visualizador (navegador), que só desenha.

export const TEMPO = {
  HORAS_REAIS_POR_DIA: 0.4,                           // 1 dia do mundo = 24 minutos reais (1 min = 1 h)
  DIAS_POR_ANO: 365,
  INICIO_DO_MUNDO: Date.UTC(2026, 8, 25, 12, 0, 0),  // referência fixa do calendário
  HORA_INICIAL: 6,                                    // o mundo nasce ao amanhecer
  HORAS_POR_BLOCO_DE_CLIMA: 6,                        // o clima muda a cada 6 h do mundo
};

export type Estacao = 'Primavera' | 'Verão' | 'Outono' | 'Inverno';
export type TipoClima = 'Limpo' | 'Poucas nuvens' | 'Nublado' | 'Neblina' | 'Chuva' | 'Tempestade';

export interface TempoDoMundo {
  diasTotais: number; ano: number; diaDoAno: number; horaDecimal: number;
  hora: number; minuto: number; estacao: Estacao; horaNascer: number; horaPor: number;
}
export interface Clima {
  tipo: TipoClima; nuvens: number; chuva: number; neblina: number;
  tempestade: number; vento: number; temperatura: number;
}
export interface Astro { elevacao: number; azimute: number } // graus
export interface EstadoDoCeu { tempo: TempoDoMundo; clima: Clima; sol: Astro; lua: Astro; luzDoDia: number }

const MS_POR_DIA = TEMPO.HORAS_REAIS_POR_DIA * 3_600_000;
const ESTACOES: Estacao[] = ['Primavera', 'Verão', 'Outono', 'Inverno'];
const DIAS_POR_ESTACAO = TEMPO.DIAS_POR_ANO / 4;

const limitar = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const suave = (t: number) => t * t * (3 - 2 * t);
const misturar = (a: number, b: number, t: number) => a + (b - a) * t;

function aleatorio(n: number) {
  let a = n | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const anguloDoAno = (diasTotais: number) =>
  (2 * Math.PI * (diasTotais % TEMPO.DIAS_POR_ANO)) / TEMPO.DIAS_POR_ANO;

export function tempoDoMundo(msReal: number): TempoDoMundo {
  const diasTotais = Math.max(0, msReal - TEMPO.INICIO_DO_MUNDO) / MS_POR_DIA + TEMPO.HORA_INICIAL / 24;
  const diaDoAnoF = diasTotais % TEMPO.DIAS_POR_ANO;
  const horaDecimal = (diasTotais % 1) * 24;
  const duracaoDoDia = 12; // 12 h de sol e 12 h de noite o ano todo
  return {
    diasTotais,
    ano: Math.floor(diasTotais / TEMPO.DIAS_POR_ANO) + 1,
    diaDoAno: Math.floor(diaDoAnoF) + 1,
    horaDecimal,
    hora: Math.floor(horaDecimal),
    minuto: Math.floor((horaDecimal % 1) * 60),
    estacao: ESTACOES[Math.floor(diaDoAnoF / DIAS_POR_ESTACAO) % 4],
    horaNascer: 12 - duracaoDoDia / 2,
    horaPor: 12 + duracaoDoDia / 2,
  };
}

function posicaoDoSol(t: TempoDoMundo): Astro {
  const alturaMaxima = 55 + 15 * Math.sin(anguloDoAno(t.diasTotais));
  const h = t.horaDecimal;
  if (h >= t.horaNascer && h <= t.horaPor) {
    const f = (h - t.horaNascer) / (t.horaPor - t.horaNascer);
    return { elevacao: Math.sin(Math.PI * f) * alturaMaxima, azimute: 90 + 180 * f };
  }
  const duracaoNoite = 24 - (t.horaPor - t.horaNascer);
  const f = ((h - t.horaPor + 24) % 24) / duracaoNoite;
  return { elevacao: -Math.sin(Math.PI * f) * 40, azimute: 270 + 180 * f };
}

type ClimaBase = Omit<Clima, 'temperatura'>;
const MODELOS: Record<TipoClima, ClimaBase> = {
  'Limpo':         { tipo: 'Limpo',         nuvens: 0.05, chuva: 0,    neblina: 0,    tempestade: 0, vento: 0.1 },
  'Poucas nuvens': { tipo: 'Poucas nuvens', nuvens: 0.35, chuva: 0,    neblina: 0,    tempestade: 0, vento: 0.2 },
  'Nublado':       { tipo: 'Nublado',       nuvens: 0.7,  chuva: 0,    neblina: 0.05, tempestade: 0, vento: 0.3 },
  'Neblina':       { tipo: 'Neblina',       nuvens: 0.5,  chuva: 0,    neblina: 0.85, tempestade: 0, vento: 0.05 },
  'Chuva':         { tipo: 'Chuva',         nuvens: 0.9,  chuva: 0.55, neblina: 0.15, tempestade: 0, vento: 0.45 },
  'Tempestade':    { tipo: 'Tempestade',    nuvens: 1,    chuva: 1,    neblina: 0.25, tempestade: 1, vento: 0.9 },
};

function climaDoBloco(bloco: number, semente: number): ClimaBase {
  const dia = ((bloco + 0.5) * TEMPO.HORAS_POR_BLOCO_DE_CLIMA) / 24;
  const e = Math.floor((dia % TEMPO.DIAS_POR_ANO) / DIAS_POR_ESTACAO) % 4;
  const chanceChuva = [0.12, 0.18, 0.1, 0.06][e];   // primavera, verão, outono, inverno
  const chanceNeblina = [0.05, 0.03, 0.07, 0.12][e];
  const r = aleatorio(semente * 7919 + bloco);
  const r2 = aleatorio(semente * 104729 + bloco * 3 + 1);
  if (r < chanceChuva * 0.2) return MODELOS['Tempestade'];
  if (r < chanceChuva) return MODELOS['Chuva'];
  if (r2 < chanceNeblina) return MODELOS['Neblina'];
  if (r < chanceChuva + 0.2) return MODELOS['Nublado'];
  if (r < chanceChuva + 0.45) return MODELOS['Poucas nuvens'];
  return MODELOS['Limpo'];
}

export function estadoDoCeu(msReal: number, semente: number): EstadoDoCeu {
  const tempo = tempoDoMundo(msReal);
  const blocoF = (tempo.diasTotais * 24) / TEMPO.HORAS_POR_BLOCO_DE_CLIMA;
  const bloco = Math.floor(blocoF);
  const a = climaDoBloco(bloco, semente);
  const b = climaDoBloco(bloco + 1, semente);
  const t = suave(limitar(((blocoF % 1) - 0.7) / 0.3)); // transição nas últimas ~2 h do bloco

  const nuvens = misturar(a.nuvens, b.nuvens, t);
  const chuva = misturar(a.chuva, b.chuva, t);
  const neblina = misturar(a.neblina, b.neblina, t);
  const tempestade = misturar(a.tempestade, b.tempestade, t);
  const vento = misturar(a.vento, b.vento, t);

  const media = 20 + 7 * Math.sin(anguloDoAno(tempo.diasTotais) - 0.5); // atraso térmico das estações
  const variacaoDiaria = 5 * Math.sin((2 * Math.PI * (tempo.horaDecimal - 9)) / 24); // pico às 15h
  const ruidoDoDia = (aleatorio(semente * 31 + Math.floor(tempo.diasTotais)) - 0.5) * 4;
  const temperatura = media + variacaoDiaria * (1 - 0.6 * nuvens) - 3 * chuva - 1.5 * nuvens + ruidoDoDia;

  const sol = posicaoDoSol(tempo);
  const lua: Astro = { elevacao: -sol.elevacao * 0.8, azimute: (sol.azimute + 180) % 360 };
  const luzDoDia = suave(limitar((sol.elevacao + 6) / 18)); // crepúsculo entre -6° e 12°

  return {
    tempo, sol, lua, luzDoDia,
    clima: { tipo: t < 0.5 ? a.tipo : b.tipo, nuvens, chuva, neblina, tempestade, vento, temperatura },
  };
}
