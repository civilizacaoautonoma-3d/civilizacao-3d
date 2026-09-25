// Mensagens trocadas entre o motor (servidor) e o visualizador (navegador).

export type Acao = 'parado' | 'andando';

export interface EntidadeRede {
  id: string; nome: string; sexo: 'M' | 'F';
  x: number; y: number; z: number; rotacao: number; acao: Acao;
}

export interface MsgBoasVindas { tipo: 'boas-vindas'; seed: number; ticksPorSegundo: number; modo: string }
export interface MsgEstado { tipo: 'estado'; tick: number; msMundo: number; velocidade: number; entidades: EntidadeRede[] }
export type MensagemServidor = MsgBoasVindas | MsgEstado;

export type MensagemCliente = { tipo: 'alternar-velocidade' };