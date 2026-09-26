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

export interface MsgBoasVindas { tipo: 'boas-vindas'; seed: number; ticksPorSegundo: number; modo: string }
export interface MsgEstado {
  tipo: 'estado'; tick: number; msMundo: number; velocidade: number;
  entidades: EntidadeRede[]; animais: AnimalRede[]; carcacas: CarcacaRede[]; frutos: number[];
}
export type MensagemServidor = MsgBoasVindas | MsgEstado;

export type MensagemCliente = { tipo: 'alternar-velocidade' };
