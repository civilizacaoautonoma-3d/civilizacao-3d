// Objetos do mundo e as regras materiais que só o motor conhece (Fase 10, documentação seção 16).
// Os agentes não sabem estas regras: descobrem mexendo nas coisas, por curiosidade, acaso ou necessidade.
import { ARBUSTOS, ARVORES, PEDRAS, cavernaEm, heightAt } from '../../shared/mundo';
import type { Especie } from '../../shared/especies';
import { terraSeca } from './espaco';

export type TipoObjeto = 'pedra' | 'graveto' | 'fibra' | 'lasca' | 'carne' | 'pilha' | 'fogo';

export interface Objeto {
  id: number; tipo: TipoObjeto; x: number; z: number;
  carregadoPor: string | null;       // id de quem está segurando (null = no chão)
  qtd?: number;                      // pilha: quantos gravetos
  amarrada?: number;                 // pilha: quantas fibras a prendem
  combustivel?: number;              // fogo: horas que ainda queima
  acesoAte?: number;                 // graveto em brasa (tição): até quando queima
  desde?: number;                    // carne: hora em que o bicho morreu
  especie?: Especie;                 // carne: de que bicho
}

export interface Descoberta {
  tecnica: string; descricao: string; quem: string; quando: number; como: 'acaso' | 'imitação';
  transmitidaPara: { quem: string; quando: number }[];
}

// ---------- Regras materiais ----------
export const REGRAS = {
  chanceLascar: 0.18,          // cada batida de pedra em pedra pode lascar e deixar um gume
  atritoParaFogo: 1.1,         // horas esfregando graveto em graveto (sem chuva) até virar brasa
  atritoFumaca: 0.6,           // a partir daqui sai fumaça (o agente percebe que algo está acontecendo)
  combustivelGraveto: 1.2,     // horas de fogo que cada graveto dá
  pilhaAbrigo: 8,              // gravetos numa pilha ao pé de uma árvore para ela proteger do vento e da chuva
  raioPorHora: 0.04,           // chance, numa tempestade, de um raio incendiar uma árvore
};

export const ehFogo = (o: Objeto) => o.tipo === 'fogo';
export const tichao = (o: Objeto, hora: number) => o.tipo === 'graveto' && (o.acesoAte ?? -1) > hora;

// ---------- Surgimento e reposição ----------
function pertoLivre(x: number, z: number, rand: () => number, min: number, max: number) {
  for (let t = 0; t < 8; t++) {
    const a = rand() * Math.PI * 2, d = min + rand() * (max - min);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (terraSeca(px, pz) && heightAt(px, pz) > 0.3) return { x: px, z: pz };
  }
  return null;
}

export function objetosIniciais(rand: () => number, proximoId: () => number): Objeto[] {
  const objs: Objeto[] = [];
  const add = (tipo: TipoObjeto, p: { x: number; z: number } | null) => { if (p) objs.push({ id: proximoId(), tipo, x: p.x, z: p.z, carregadoPor: null }); };
  for (const t of ARVORES) if (rand() < 0.35) add('graveto', pertoLivre(t.x, t.z, rand, t.r + 0.8, t.r + 3));
  for (const p of PEDRAS) if (rand() < 0.55) add('pedra', pertoLivre(p.x, p.z, rand, p.r + 0.5, p.r + 2.5));
  for (const b of ARBUSTOS) for (let k = 0; k < 2; k++) add('fibra', pertoLivre(b.x, b.z, rand, 1.2, 3));
  return objs;
}

// uma vez por dia: galhos caem das árvores, o capim das fibras rebrota (pedras não voltam: são finitas)
export function reporObjetos(objs: Objeto[], rand: () => number, proximoId: () => number) {
  const n = (t: TipoObjeto) => objs.filter(o => o.tipo === t && !o.carregadoPor).length;
  let mudou = false;
  if (n('graveto') < 260) for (const t of ARVORES) if (rand() < 0.03) {
    const p = pertoLivre(t.x, t.z, rand, t.r + 0.8, t.r + 3);
    if (p) { objs.push({ id: proximoId(), tipo: 'graveto', x: p.x, z: p.z, carregadoPor: null }); mudou = true; }
  }
  if (n('fibra') < 150) for (const b of ARBUSTOS) if (rand() < 0.08) {
    const p = pertoLivre(b.x, b.z, rand, 1.2, 3);
    if (p) { objs.push({ id: proximoId(), tipo: 'fibra', x: p.x, z: p.z, carregadoPor: null }); mudou = true; }
  }
  return mudou;
}

// ---------- A cada tick: fogo queima e apaga, tições esfriam, pilhas se desfazem, raios caem ----------
export interface Clima { horas: number; hora: number; chuva: number; tempestade: number }

export function atualizarObjetos(objs: Objeto[], c: Clima, rand: () => number, proximoId: () => number,
                                 avisar: (t: string) => void): { mudou: boolean; restantes: Objeto[] } {
  let mudou = false;
  for (const o of objs) {
    if (o.tipo === 'fogo') {
      o.combustivel = (o.combustivel ?? 0) - c.horas * (1 + (cavernaEm(o.x, o.z) ? 0 : c.chuva * 3));   // chuva apaga (menos dentro da caverna)
      // o fogo pega nos gravetos de uma pilha encostada
      for (const p of objs) if (p.tipo === 'pilha' && (p.qtd ?? 0) > 0 && Math.hypot(p.x - o.x, p.z - o.z) < 1.2 && rand() < c.horas * 0.5) {
        o.combustivel += REGRAS.combustivelGraveto; p.qtd! -= 1; mudou = true;
      }
    }
    if (o.tipo === 'graveto' && o.acesoAte !== undefined && o.acesoAte <= c.hora) { delete o.acesoAte; mudou = true; }
  }
  // pilhas soltas se desfazem com o tempo (vento, bichos); amarradas duram muito mais
  for (const p of objs) if (p.tipo === 'pilha' && rand() < c.horas / (24 * (3 + 6 * Math.min(3, p.amarrada ?? 0)))) {
    p.qtd = (p.qtd ?? 1) - 1; mudou = true;
  }
  // raio numa tempestade incendeia uma árvore
  if (c.tempestade > 0.5 && rand() < c.horas * REGRAS.raioPorHora * c.tempestade) {
    const t = ARVORES[Math.floor(rand() * ARVORES.length)];
    objs.push({ id: proximoId(), tipo: 'fogo', x: t.x + t.r + 0.5, z: t.z, carregadoPor: null, combustivel: 4 });
    avisar('Um raio caiu e pôs fogo numa árvore');
    mudou = true;
  }
  const restantes = objs.filter(o => !(o.tipo === 'fogo' && (o.combustivel ?? 0) <= 0) && !(o.tipo === 'pilha' && (o.qtd ?? 0) <= 0));
  if (restantes.length !== objs.length) mudou = true;
  return { mudou, restantes };
}

export const fogosPerto = (objs: Objeto[], x: number, z: number, raio: number) =>
  objs.filter(o => o.tipo === 'fogo' && Math.hypot(o.x - x, o.z - z) < raio);
