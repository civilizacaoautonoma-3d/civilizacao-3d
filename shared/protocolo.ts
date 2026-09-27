// Mensagens trocadas entre o motor (servidor) e o visualizador (navegador).

import type { Especie } from './especies';

export type Acao = 'parado' | 'andando' | 'correndo' | 'comendo' | 'bebendo' | 'dormindo'
  | 'atacando' | 'escondido' | 'fucando' | 'morto';

export interface Necessidades {
  fome: number; sede: number; sono: number; energia: number; saude: number; frio: number; dor: number;
}

export interface EntidadeRede {
  id: string; nome: string; sexo: 'M' | 'F';
  x: number; y: number; z: number; rotacao: number;
  acao: Acao; intencao: string;
  necessidades: Necessidades;
  memoria: { agua: number; comida: number; carne: number };
  caca: { tentativas: number; sucessos: number };
  mente: {
    episodios: number;
    crencas: { enunciado: string; certeza: number }[];
    lembrancas: string[];      // as mais marcantes
    mapaConhecido: number;     // fração do vale que já viu
    pensamento: string;        // o último pensamento deliberado (Fase 9)
    plano: string[];           // prioridades do plano do dia, em palavras
    deliberador: string | null;
  };
  sentimentos: {
    dominante: string | null;  // emoção básica mais forte agora (aparece no corpo)
    intensidade: number;
    derivada: string | null;   // alívio, frustração, orgulho, decepção, luto…
    emocoes: Record<string, number>;
    humor: Record<string, number>;
    afeto: { valencia: number; ativacao: number; controle: number };
    personalidade: Record<string, number>;
    jeito: string[];           // os traços mais marcantes, em palavras
  };
  tecnicas: string[];          // o que já sabe fazer com as coisas (Fase 10)
  carrega: string[];           // o que tem nas mãos
  cavernas: number;            // quantas cavernas conhece
  casa: string | null;         // a caverna para onde sempre volta (se já tem uma)
  // Fase 11: o que disse agora (som original + tradução para quem observa), relações e vocabulário
  fala: { texto: string; traducao: string } | null;
  relacoes: { nome: string; descricao: string; afeto: number; confianca: number; respeito: number; ressentimento: number }[];
  palavras: { palavra: string; significado: string; forca: number; comum: boolean }[];
  // Fase 12: idade, tamanho, família, gravidez, colo, doença
  idade: string;               // "bebê, 12 dias", "jovem", "adulto, 1.2 anos"…
  escala: number;              // tamanho do corpo (bebê pequeno; cresce até a maturidade)
  pais: string | null;         // "filho de Nia e Aru"
  gravida: boolean;
  carregadoPor: string | null; // id de quem carrega este bebê
  doente: string | null;
  geracao: number;
}

export interface AnimalRede {
  id: string; especie: Especie; sexo: 'M' | 'F';
  x: number; y: number; z: number; rotacao: number;
  acao: Acao; intencao: string;
  crescimento: number;   // 0 = recém-nascido, 1 = adulto
  idadeDias: number;
  necessidades: { fome: number; sede: number; sono: number; energia: number; saude: number; frio: number; gordura: number };
  emocoes: Record<string, number>;
}

export interface CarcacaRede {
  id: number; especie: Especie; x: number; y: number; z: number; rotacao: number;
  porcoes: number; estragada: boolean;
}

export type TipoObjetoRede = 'pedra' | 'graveto' | 'fibra' | 'lasca' | 'carne' | 'pilha' | 'fogo';
export interface ObjetoRede {
  id: number; tipo: TipoObjetoRede; x: number; z: number;
  carregadoPor: string | null;
  qtd?: number; amarrada?: number;   // pilha
  forca?: number;                    // fogo: 0..1 (quanto combustível ainda tem)
  aceso?: boolean;                   // graveto em brasa
}

export interface MsgBoasVindas { tipo: 'boas-vindas'; seed: number; ticksPorSegundo: number; modo: string }
export interface MsgEstado {
  tipo: 'estado'; tick: number; msMundo: number; velocidade: number;
  entidades: EntidadeRede[]; animais: AnimalRede[]; carcacas: CarcacaRede[]; frutos: number[];
  objetos?: ObjetoRede[];   // só vem quando algo mudou (ou de tempos em tempos); senão vale a última lista
}
export type MensagemServidor = MsgBoasVindas | MsgEstado;

export type MensagemCliente = { tipo: 'alternar-velocidade' };
