// O que cada ser vivo recebe a cada passo de vida.
import type { Estacao } from '../../shared/clima';
import type { Agente } from './agente';
import type { Animal } from './animal';
import type { Carcaca, Marca } from './ecologia';
import type { Objeto } from './objetos';

export type Ser = Agente | Animal;
export const ehAnimal = (s: Ser): s is Animal => 'especie' in s;

export interface InfoGrupo { lider: Animal; femeaDominante: Animal | null; x: number; z: number; n: number }

export interface Contexto {
  hora: number;    // horas totais do mundo
  horas: number;   // duração deste passo em horas do mundo
  dt: number;      // duração deste passo em segundos de caminhada
  luz: number; noite: boolean; estacao: Estacao;
  temperatura: number; chuva: number; vento: number; tempestade: number; neblina: number;
  clima: string;   // tipo do clima agora ('Limpo', 'Chuva', 'Neblina'…)
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
  // Fase 10: coisas do mundo que podem ser pegas, largadas, transformadas
  objetos: Objeto[];
  criarObjeto: (o: Omit<Objeto, 'id'>) => Objeto;
  objetosMudaram: () => void;
  descoberta: (tecnica: string, descricao: string, quem: Agente, como: 'acaso' | 'imitação', de: Agente | null) => void;
  // Fase 12
  nascerAgente: (a: Agente) => void;
  // Fase 13: alguém de um grupo viu (ou ouviu) alguém de outro pela primeira vez
  contato: (a: Agente, o: Agente) => void;
}
