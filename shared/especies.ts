// Perfis das espécies animais (documentação, seção 17.2).
// Animais não usam LLM: instinto, emoções básicas da espécie e memória associativa simples.
// Usado pelo motor (comportamento) e pelo visualizador (tamanho e aparência).

import type { Estacao } from './clima';

export type Especie = 'coelho' | 'cervo' | 'lobo' | 'javali' | 'ave' | 'peixe';
export const ESPECIES: Especie[] = ['coelho', 'cervo', 'lobo', 'javali', 'ave', 'peixe'];

// cada espécie usa só um subconjunto destes estados, com pesos próprios
export type EmocaoAnimal = 'medo' | 'alerta' | 'calma' | 'satisfacao' | 'apego' | 'excitacao' | 'dominancia'
  | 'agressividade' | 'curiosidade';

export interface PerfilEspecie {
  nome: string; plural: string;
  dieta: 'pasto' | 'carne' | 'onivoro' | 'graos' | 'algas';
  social: 'colonia' | 'manada' | 'matilha' | 'vara' | 'bando' | 'cardume';
  emocoes: EmocaoAnimal[];
  // corpo (metros)
  raio: number; comprimento: number; altura: number;
  andar: number; correr: number;           // m/s
  cansacoCorrendo: number;                 // energia gasta por hora correndo
  // sentidos (metros)
  visaoDia: number; visaoNoite: number; olfato: number;
  // instintos
  distanciaFuga: number;                   // foge quando a ameaça está mais perto que isso × medo
  medoInato: { humano: number; lobo: number; javali: number };
  pisoHabituacao: number;                  // o medo de humanos nunca cai abaixo disso
  coesao: number;                          // distância máxima confortável do líder do grupo
  dormeDeDia: boolean;                     // crepuscular: dorme do meio da manhã ao fim da tarde
  enfrenta: boolean;                       // encurralado ou defendendo filhotes, ataca em vez de fugir
  territorial: boolean;                    // marca e defende território
  machosDisputam: boolean;                 // na época de cria, machos brigam pelo grupo
  migraNoInverno: boolean;                 // o grupo vai atrás de pasto quando o inverno rapa a área
  voa: boolean;                            // passa por cima de água e obstáculos; dorme nas árvores
  alarme: boolean;                         // quando foge, o alarme alerta todos os animais em volta
  aquatico: boolean;                       // só vive na água funda
  // clima
  confortoMin: number;                     // °C sentidos abaixo disso começam a dar frio (pelagem)
  abrigo: 'arbusto' | 'arvore';            // onde se protege da chuva e do vento
  // fisiologia (por hora do mundo)
  fomePorHora: number; sedePorHora: number;
  saciedade: number;                       // quanto uma bocada/porção reduz a fome
  consumoPasto: number;                    // quanto uma bocada tira da vegetação (ou das raízes) da área
  porcoesDeCarne: number;                  // porções que a carcaça de um adulto rende
  // ciclo de vida (dias do mundo)
  vidaDias: number; adultoDias: number;
  gestacaoDias: number; intervaloCriaDias: number; ninhada: [number, number];
  estacoesDeCria: Estacao[];
  densidadeMax: number;                    // mesma espécie num raio de 30 m: acima disso não cria
  grupoMax: number;                        // acima disso, jovens adultos saem para formar outro grupo
  capacidade: number;                      // limite do vale inteiro (recursos e desempenho)
  // população
  inicial: { grupos: number; tamanho: [number, number]; distanciaDoInicio: number };
  minimoRegional: number;                  // abaixo disso, às vezes chegam animais de fora do vale
}

const DIAS_ANO = 365;

export const PERFIS: Record<Especie, PerfilEspecie> = {
  coelho: {
    nome: 'coelho', plural: 'coelhos', dieta: 'pasto', social: 'colonia',
    emocoes: ['medo', 'alerta', 'calma', 'satisfacao'],
    raio: 0.15, comprimento: 0.4, altura: 0.3,
    andar: 1.1, correr: 6, cansacoCorrendo: 5,
    visaoDia: 22, visaoNoite: 9, olfato: 6,
    distanciaFuga: 14, medoInato: { humano: 0.8, lobo: 1, javali: 0.3 }, pisoHabituacao: 0.25,
    coesao: 25, dormeDeDia: false,
    enfrenta: false, territorial: false, machosDisputam: false, migraNoInverno: false, voa: false, alarme: false, aquatico: false,
    confortoMin: 6, abrigo: 'arbusto',
    fomePorHora: 1 / 20, sedePorHora: 1 / 40, saciedade: 0.35, consumoPasto: 0.02, porcoesDeCarne: 2,
    vidaDias: 3 * DIAS_ANO, adultoDias: 45,
    gestacaoDias: 10, intervaloCriaDias: 24, ninhada: [2, 5], estacoesDeCria: ['Primavera', 'Verão'],
    densidadeMax: 10, grupoMax: 8, capacidade: 140,
    inicial: { grupos: 7, tamanho: [4, 6], distanciaDoInicio: 25 },
    minimoRegional: 4,
  },
  cervo: {
    nome: 'cervo', plural: 'cervos', dieta: 'pasto', social: 'manada',
    emocoes: ['medo', 'alerta', 'calma', 'apego', 'dominancia'],
    raio: 0.4, comprimento: 1.5, altura: 1.3,
    andar: 1.3, correr: 7.5, cansacoCorrendo: 1.9,
    visaoDia: 40, visaoNoite: 12, olfato: 15,
    distanciaFuga: 26, medoInato: { humano: 0.7, lobo: 1, javali: 0.2 }, pisoHabituacao: 0.2,
    coesao: 14, dormeDeDia: false,
    enfrenta: false, territorial: false, machosDisputam: true, migraNoInverno: true, voa: false, alarme: false, aquatico: false,
    confortoMin: 2, abrigo: 'arvore',
    fomePorHora: 1 / 18, sedePorHora: 1 / 16, saciedade: 0.3, consumoPasto: 0.06, porcoesDeCarne: 12,
    vidaDias: 12 * DIAS_ANO, adultoDias: 300,
    gestacaoDias: 20, intervaloCriaDias: 300, ninhada: [1, 2], estacoesDeCria: ['Primavera'],
    densidadeMax: 12, grupoMax: 9, capacidade: 45,
    inicial: { grupos: 3, tamanho: [4, 6], distanciaDoInicio: 40 },
    minimoRegional: 8,
  },
  lobo: {
    nome: 'lobo', plural: 'lobos', dieta: 'carne', social: 'matilha',
    emocoes: ['medo', 'alerta', 'calma', 'excitacao', 'apego', 'dominancia'],
    raio: 0.3, comprimento: 1.1, altura: 0.8,
    andar: 1.6, correr: 8, cansacoCorrendo: 1.4,   // vence a presa pelo cansaço
    visaoDia: 35, visaoNoite: 22, olfato: 60,
    distanciaFuga: 14, medoInato: { humano: 0.5, lobo: 0, javali: 0.45 }, pisoHabituacao: 0.1,
    coesao: 20, dormeDeDia: true,
    enfrenta: false, territorial: true, machosDisputam: false, migraNoInverno: false, voa: false, alarme: false, aquatico: false,
    confortoMin: -8, abrigo: 'arvore',
    fomePorHora: 1 / 90, sedePorHora: 1 / 24, saciedade: 0.35, consumoPasto: 0, porcoesDeCarne: 6,
    vidaDias: 9 * DIAS_ANO, adultoDias: 300,
    gestacaoDias: 20, intervaloCriaDias: 330, ninhada: [2, 5], estacoesDeCria: ['Primavera'],
    densidadeMax: 8, grupoMax: 6, capacidade: 14,
    inicial: { grupos: 1, tamanho: [3, 4], distanciaDoInicio: 90 },
    minimoRegional: 2,
  },
  javali: {
    nome: 'javali', plural: 'javalis', dieta: 'onivoro', social: 'vara',
    emocoes: ['medo', 'alerta', 'calma', 'agressividade', 'curiosidade', 'apego'],
    raio: 0.4, comprimento: 1.2, altura: 0.8,
    andar: 1.2, correr: 6.5, cansacoCorrendo: 3,
    visaoDia: 16, visaoNoite: 8, olfato: 40,       // enxerga mal, fareja muito bem
    distanciaFuga: 12, medoInato: { humano: 0.55, lobo: 0.5, javali: 0 }, pisoHabituacao: 0.15,
    coesao: 12, dormeDeDia: false,
    enfrenta: true, territorial: false, machosDisputam: false, migraNoInverno: false, voa: false, alarme: false, aquatico: false,
    confortoMin: -2, abrigo: 'arvore',
    fomePorHora: 1 / 22, sedePorHora: 1 / 18, saciedade: 0.3, consumoPasto: 0.05, porcoesDeCarne: 8,
    vidaDias: 8 * DIAS_ANO, adultoDias: 280,
    gestacaoDias: 20, intervaloCriaDias: 300, ninhada: [3, 6], estacoesDeCria: ['Primavera'],
    densidadeMax: 10, grupoMax: 9, capacidade: 30,
    inicial: { grupos: 2, tamanho: [3, 5], distanciaDoInicio: 60 },
    minimoRegional: 3,
  },
  ave: {
    nome: 'pássaro', plural: 'pássaros', dieta: 'graos', social: 'bando',
    emocoes: ['medo', 'alerta', 'calma', 'satisfacao'],
    raio: 0.08, comprimento: 0.2, altura: 0.15,
    andar: 5, correr: 9, cansacoCorrendo: 2,          // anda voando de um ponto a outro
    visaoDia: 45, visaoNoite: 6, olfato: 3,           // enxerga longe de dia, quase nada à noite
    distanciaFuga: 13, medoInato: { humano: 0.85, lobo: 0.7, javali: 0.4 }, pisoHabituacao: 0.3,
    coesao: 10, dormeDeDia: false,
    enfrenta: false, territorial: false, machosDisputam: false, migraNoInverno: false, voa: true, alarme: true, aquatico: false,
    confortoMin: 4, abrigo: 'arvore',
    fomePorHora: 1 / 10, sedePorHora: 1 / 14, saciedade: 0.3, consumoPasto: 0.003, porcoesDeCarne: 1,
    vidaDias: 3 * DIAS_ANO, adultoDias: 40,
    gestacaoDias: 14, intervaloCriaDias: 60, ninhada: [2, 4], estacoesDeCria: ['Primavera'],
    densidadeMax: 14, grupoMax: 12, capacidade: 60,
    inicial: { grupos: 4, tamanho: [6, 9], distanciaDoInicio: 20 },
    minimoRegional: 6,
  },
  peixe: {
    nome: 'peixe', plural: 'peixes', dieta: 'algas', social: 'cardume',
    emocoes: ['medo', 'alerta', 'calma'],
    raio: 0.1, comprimento: 0.3, altura: 0.1,
    andar: 0.7, correr: 3.5, cansacoCorrendo: 3,
    visaoDia: 8, visaoNoite: 4, olfato: 5,             // na água turva, só percebe o que está perto
    distanciaFuga: 7, medoInato: { humano: 0.9, lobo: 0.7, javali: 0.6 }, pisoHabituacao: 0.3,
    coesao: 6, dormeDeDia: false,
    enfrenta: false, territorial: false, machosDisputam: false, migraNoInverno: false, voa: false, alarme: false, aquatico: true,
    confortoMin: -30, abrigo: 'arbusto',
    fomePorHora: 1 / 36, sedePorHora: 0, saciedade: 0.3, consumoPasto: 0, porcoesDeCarne: 1,
    vidaDias: 4 * DIAS_ANO, adultoDias: 60,
    gestacaoDias: 10, intervaloCriaDias: 300, ninhada: [3, 6], estacoesDeCria: ['Primavera'],
    densidadeMax: 25, grupoMax: 15, capacidade: 70,
    inicial: { grupos: 5, tamanho: [6, 9], distanciaDoInicio: 0 },
    minimoRegional: 8,
  },
};

// quanto um predador (lobo) teme uma presa que revida: javali adulto assusta, filhote não
export const presaPerigosa = (e: Especie) => e === 'javali';
