// O que cada ser vivo recebe a cada passo de vida.
import type { Estacao } from '../../shared/clima';
import type { Agente } from './agente';
import type { Animal } from './animal';
import type { Carcaca, Marca } from './ecologia';

export type Ser = Agente | Animal;
export const ehAnimal = (s: Ser): s is Animal => 'especie' in s;

export interface InfoGrupo { lider: Animal; femeaDominante: Animal | null; x: number; z: number; n: number }

export interface Contexto {
  hora: number;    // horas totais do mundo
  horas: number;   // duração deste passo em horas do mundo
  dt: number;      // duração deste passo em segundos de caminhada
  luz: number; noite: boolean; estacao: Estacao;
  temperatura: number; chuva: number; vento: number; tempestade: number;
  frutos: number[]; pasto: number[]; raizes: number[]; marcas: Marca[];
  agentes: Agente[]; animais: Animal[]; carcacas: Carcaca[];
  porId: Map<string, Ser>;
  grupos: Map<string, InfoGrupo>;
  perto: (x: number, z: number, raio: number) => Animal[];   // animais nas células da grade em volta (inclui mortos)
  contagem: Record<string, number>;   // animais vivos por espécie
  rand: () => number;
  evento: (texto: string) => void;
  novoId: (prefixo: string) => string;
  novaCarcaca: (c: Omit<Carcaca, 'id'>) => Carcaca;
  nascer: (a: Animal) => void;
}
