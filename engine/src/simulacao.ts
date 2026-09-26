// O passo do mundo: agentes, animais e ecologia. Usado pelo servidor e pelo script de validação.
import { PONTO_INICIAL, ARBUSTOS, heightAt, SEED } from '../../shared/mundo';
import { estadoDoCeu, tempoDoMundo, TEMPO } from '../../shared/clima';
import { ESPECIES, PERFIS, type Especie } from '../../shared/especies';
import type { AnimalRede, CarcacaRede, EntidadeRede, MsgEstado } from '../../shared/protocolo';
import { atualizarAgente, completarAgente, novoAgente, type Agente } from './agente';
import { atualizarAnimal, completarAnimal, criarAnimal, lembrarLugar, maturidade, type Animal } from './animal';
import type { Contexto, Ser } from './contexto';
import { atualizarFrutos, crescerPasto, crescerRaizes, estragada, limparCarcacas, limparMarcas, pastoInicial,
         raizesIniciais, type Carcaca, type Marca } from './ecologia';
import { aguaMaisProximaDoMapa, LIMITE, naAgua, terraSeca, type Ponto } from './espaco';
import { conhecidas } from './mapa';
import type { Episodio } from './memoria';
import { descreverPersonalidade, emocaoDominante } from './emocoes';

export const TICKS_POR_SEGUNDO = 10;
export const DT = 1 / TICKS_POR_SEGUNDO;
export const HORAS_POR_PASSO = (DT * 24) / TEMPO.HORAS_REAIS_POR_DIA / 3600;

export interface Estado {
  versao: 3; tick: number; deslocamentoMs: number; velocidadeIdx: number; criadoEm: number;
  agentes: Agente[]; frutos: number[];
  animais: Animal[]; carcacas: Carcaca[]; pasto: number[]; raizes: number[]; marcas: Marca[];
  proximoId: number; ultimoCenso: number;
  introduzidas: Especie[];   // espécies que já foram soltas neste mundo (as novas chegam em mundos antigos)
}

export const horaDoMundo = (msMundo: number) => tempoDoMundo(msMundo).diasTotais * 24;

// ---------- Criação e migração ----------
export function mundoNovo(criadoEm: number, rand: () => number): Estado {
  const e: Estado = {
    versao: 3, tick: 0, deslocamentoMs: 0, velocidadeIdx: 0, criadoEm,
    agentes: [
      novoAgente('ag_001', 'Aru', 'M', PONTO_INICIAL.x + 5, PONTO_INICIAL.z + 2),
      novoAgente('ag_002', 'Nia', 'F', PONTO_INICIAL.x + 6, PONTO_INICIAL.z - 2),
    ],
    frutos: ARBUSTOS.map(b => Math.ceil(b.max / 2)),
    animais: [], carcacas: [], pasto: pastoInicial(), raizes: raizesIniciais(), marcas: [],
    proximoId: 1, ultimoCenso: 0, introduzidas: [],
  };
  povoar(e, TEMPO.HORA_INICIAL, rand);
  return e;
}

// campos que versões mais novas do motor acrescentaram; espécies novas chegam ao vale
function completarEstado(e: Estado, hora: number, rand: () => number) {
  e.agentes.forEach(completarAgente);
  e.animais.forEach(completarAnimal);
  e.raizes ??= raizesIniciais();
  e.marcas ??= [];
  e.introduzidas ??= [...new Set(e.animais.map(an => an.especie))];
  povoar(e, hora, rand);
  return e;
}

// estados da Fase 5 (versão 2) ganham animais e pasto; os agentes continuam como estavam
export function migrar(dados: any, hora: number, rand: () => number): Estado | null {
  if (dados?.versao === 3) return completarEstado(dados as Estado, hora, rand);
  if (dados?.versao !== 2) return null;
  const e = dados as Estado;
  e.versao = 3;
  e.criadoEm ??= TEMPO.INICIO_DO_MUNDO;
  e.animais = []; e.carcacas = []; e.pasto = pastoInicial(); e.proximoId = 1;
  e.ultimoCenso = Math.floor(hora / 24);
  return completarEstado(e, hora, rand);
}

function lugarParaGrupo(esp: Especie, rand: () => number, ocupados: Ponto[]): Ponto | null {
  const p = PERFIS[esp];
  for (let t = 0; t < 400; t++) {
    const x = (rand() - 0.5) * 2 * (LIMITE - 15), z = (rand() - 0.5) * 2 * (LIMITE - 15), h = heightAt(x, z);
    if (p.aquatico ? h > -1.2 : h < 1 || h > 12 || !terraSeca(x, z)) continue;   // peixes: água bem funda
    if (Math.hypot(x - PONTO_INICIAL.x, z - PONTO_INICIAL.z) < p.inicial.distanciaDoInicio) continue;
    if (ocupados.some(o => Math.hypot(o.x - x, o.z - z) < (t < 200 ? 50 : 25))) continue;
    return { x, z };
  }
  return null;
}

function criarGrupo(e: Estado, esp: Especie, centro: Ponto, n: number, hora: number, rand: () => number, soSexo?: 'M' | 'F') {
  const p = PERFIS[esp];
  const grupo = `g_${e.proximoId++}`;
  const agua = p.aquatico ? null : aguaMaisProximaDoMapa(centro.x, centro.z);
  const cabe = (x: number, z: number) => (p.aquatico ? naAgua(x, z) : terraSeca(x, z));
  const criados: Animal[] = [];
  for (let i = 0; i < n; i++) {
    let x = centro.x, z = centro.z;
    for (let t = 0; t < 10; t++) {
      const px = centro.x + (rand() - 0.5) * 10, pz = centro.z + (rand() - 0.5) * 10;
      if (cabe(px, pz)) { x = px; z = pz; break; }
    }
    const sexo = soSexo ?? (i === 0 ? 'F' : i === 1 ? 'M' : rand() < 0.5 ? 'M' : 'F');
    const idadeDias = Math.min(p.adultoDias * (1 + rand() * 2), p.vidaDias * 0.6);
    const an = criarAnimal(`an_${e.proximoId++}`, esp, sexo, x, z, hora - idadeDias * 24, rand);
    an.grupo = grupo; an.adulto = true;
    an.ultimaCria = hora - p.intervaloCriaDias * 24;   // quem chega adulto pode criar na próxima estação
    if (agua) lembrarLugar(an, 'agua', agua.x, agua.z);   // quem vive no vale já sabe onde beber
    e.animais.push(an);
    criados.push(an);
  }
  return criados;
}

// solta no vale as espécies que ainda não foram introduzidas neste mundo
function povoar(e: Estado, hora: number, rand: () => number) {
  const ocupados: Ponto[] = e.animais.map(an => ({ x: an.x, z: an.z }));
  for (const esp of ESPECIES) {
    if (e.introduzidas.includes(esp)) continue;
    e.introduzidas.push(esp);
    const p = PERFIS[esp];
    for (let g = 0; g < p.inicial.grupos; g++) {
      const centro = lugarParaGrupo(esp, rand, ocupados);
      if (!centro) continue;
      ocupados.push(centro);
      const [a, b] = p.inicial.tamanho;
      criarGrupo(e, esp, centro, a + Math.floor(rand() * (b - a + 1)), hora, rand);
    }
  }
}

// quando uma espécie quase some do vale (ou fica só com machos ou só com fêmeas),
// às vezes chega gente de fora pelas bordas — o vale não é isolado do resto do mundo
function imigrar(e: Estado, esp: Especie, hora: number, rand: () => number, registrar: (t: string) => void, soSexo?: 'M' | 'F') {
  const p = PERFIS[esp];
  const quem = (n: number) => soSexo
    ? `${n === 1 ? `Um ${p.nome}` : `${n} ${p.plural}`} ${soSexo === 'M' ? (n === 1 ? 'macho' : 'machos') : (n === 1 ? 'fêmea' : 'fêmeas')}`
    : `Um grupo de ${n} ${p.plural}`;
  if (p.aquatico) {
    // peixes chegam pela água (subindo o rio)
    const centro = lugarParaGrupo(esp, rand, []);
    if (!centro) return;
    const n = soSexo ? 2 : 4 + Math.floor(rand() * 3);
    criarGrupo(e, esp, centro, n, hora, rand, soSexo);
    registrar(`${quem(n)} ${n === 1 ? 'chegou' : 'chegaram'} pelo rio`);
    return;
  }
  for (let t = 0; t < 100; t++) {
    const lado = Math.floor(rand() * 4), s = (rand() - 0.5) * 2 * (LIMITE - 20), borda = LIMITE - 12;
    const x = lado === 0 ? borda : lado === 1 ? -borda : s;
    const z = lado === 2 ? borda : lado === 3 ? -borda : s;
    const h = heightAt(x, z);
    if (!terraSeca(x, z) || h > 14) continue;
    const n = soSexo ? 1 : 2 + Math.floor(rand() * 2);
    criarGrupo(e, esp, { x, z }, n, hora, rand, soSexo);
    registrar(`${quem(n)} chegou de fora do vale`);
    return;
  }
}

// ---------- Passo ----------
// grade espacial dos animais: cada um só olha para quem está nas células em volta
const CELULA_VIZ = 20;
const chaveViz = (cx: number, cz: number) => (cx + 100) * 1000 + (cz + 100);
const gradeViz = new Map<number, Animal[]>();

function montarGrade(animais: Animal[]) {
  for (const lista of gradeViz.values()) lista.length = 0;
  for (const an of animais) {
    if (!an.vivo) continue;
    const k = chaveViz(Math.floor(an.x / CELULA_VIZ), Math.floor(an.z / CELULA_VIZ));
    const lista = gradeViz.get(k);
    if (lista) lista.push(an); else gradeViz.set(k, [an]);
  }
}

function perto(x: number, z: number, raio: number): Animal[] {
  const r: Animal[] = [];
  const c0 = Math.floor((x - raio) / CELULA_VIZ), c1 = Math.floor((x + raio) / CELULA_VIZ);
  const d0 = Math.floor((z - raio) / CELULA_VIZ), d1 = Math.floor((z + raio) / CELULA_VIZ);
  for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) {
    const lista = gradeViz.get(chaveViz(i, j));
    if (lista) for (const an of lista) r.push(an);
  }
  return r;
}

function calcularGrupos(ctx: Contexto) {
  montarGrade(ctx.animais);
  ctx.grupos.clear();
  for (const k of ESPECIES) ctx.contagem[k] = 0;
  for (const an of ctx.animais) {
    if (!an.vivo) continue;
    ctx.contagem[an.especie] += 1 + (an.parto > 0 ? an.filhotesPrevistos : 0);   // conta também quem está para nascer
    const g = ctx.grupos.get(an.grupo);
    if (!g) {
      ctx.grupos.set(an.grupo, { lider: an, femeaDominante: an.sexo === 'F' && an.adulto ? an : null, x: an.x, z: an.z, n: 1 });
      continue;
    }
    g.x += an.x; g.z += an.z; g.n++;
    // o mais velho entre os adultos lidera; a fêmea adulta mais velha é a dominante
    if (an.adulto && (!g.lider.adulto || an.nascidoEm < g.lider.nascidoEm)) g.lider = an;
    if (an.sexo === 'F' && an.adulto && (!g.femeaDominante || an.nascidoEm < g.femeaDominante.nascidoEm)) g.femeaDominante = an;
  }
  for (const g of ctx.grupos.values()) { g.x /= g.n; g.z /= g.n; }
}

export function passoDoMundo(e: Estado, msMundo: number, vel: number, rand: () => number, registrar: (t: string) => void) {
  e.tick++;
  const ceu = estadoDoCeu(msMundo, SEED);
  const horaBase = ceu.tempo.diasTotais * 24;
  const porId = new Map<string, Ser>();
  for (const a of e.agentes) porId.set(a.id, a);
  for (const an of e.animais) porId.set(an.id, an);
  const nascidos: Animal[] = [];

  const ctx: Contexto = {
    hora: horaBase, horas: HORAS_POR_PASSO, dt: DT,
    luz: ceu.luzDoDia, noite: ceu.luzDoDia < 0.15, estacao: ceu.tempo.estacao,
    temperatura: ceu.clima.temperatura, chuva: ceu.clima.chuva, vento: ceu.clima.vento, tempestade: ceu.clima.tempestade,
    neblina: ceu.clima.neblina, clima: ceu.clima.tipo,
    frutos: e.frutos, pasto: e.pasto, raizes: e.raizes, marcas: e.marcas, agentes: e.agentes, animais: e.animais, carcacas: e.carcacas,
    porId, grupos: new Map(), perto, contagem: {}, rand, evento: registrar,
    novoId: prefixo => `${prefixo}_${e.proximoId++}`,
    novaCarcaca: c => { const k = { ...c, id: e.proximoId++ }; e.carcacas.push(k); return k; },
    nascer: a => { nascidos.push(a); porId.set(a.id, a); },
  };

  // com o tempo acelerado, roda vários passos de vida por tick
  for (let s = 0; s < vel; s++) {
    ctx.hora = horaBase + s * HORAS_POR_PASSO;
    calcularGrupos(ctx);
    for (const a of e.agentes) atualizarAgente(a, ctx);
    for (const an of e.animais) atualizarAnimal(an, ctx);
    if (nascidos.length) { e.animais.push(...nascidos); nascidos.length = 0; montarGrade(e.animais); }
  }

  // ecologia: frutos, pasto e carcaças, uma vez por tick
  const horas = vel * HORAS_POR_PASSO;
  atualizarFrutos(e.frutos, horas, ceu.tempo.estacao, rand);
  crescerPasto(e.pasto, horas, ceu.tempo.estacao);
  crescerRaizes(e.raizes, horas, ceu.tempo.estacao);
  if (e.tick % 50 === 0) e.marcas = limparMarcas(e.marcas, ctx.hora);
  e.animais = e.animais.filter(an => an.vivo);
  e.carcacas = limparCarcacas(e.carcacas, ctx.hora);

  // censo diário e chegada de animais de fora do vale
  const dia = Math.floor(ceu.tempo.diasTotais);
  if (dia > e.ultimoCenso) {
    e.ultimoCenso = dia;
    registrar(`Censo: ${censo(e)}`);
    for (const esp of ESPECIES) {
      const bichos = e.animais.filter(an => an.especie === esp);
      if (bichos.length < PERFIS[esp].minimoRegional && rand() < 0.25) { imigrar(e, esp, ctx.hora, rand, registrar); continue; }
      // só um dos sexos no vale (nem entre os filhotes): sem chegada de fora, a espécie nunca mais cria
      const temM = bichos.some(an => an.sexo === 'M'), temF = bichos.some(an => an.sexo === 'F');
      if (bichos.length > 0 && (!temM || !temF) && rand() < 0.2)
        imigrar(e, esp, ctx.hora, rand, registrar, temM ? 'F' : 'M');
    }
  }
}

export function censo(e: Estado) {
  const pasto = e.pasto.filter(v => v >= 0);
  const media = pasto.reduce((s, v) => s + v, 0) / Math.max(1, pasto.length);
  const frutos = e.frutos.reduce((s, v) => s + v, 0);
  return ESPECIES.map(esp => `${e.animais.filter(an => an.especie === esp).length} ${PERFIS[esp].plural}`).join(', ') +
    ` · ${e.carcacas.length} carcaças · pasto ${Math.round(media * 100)}% · ${frutos} frutos`;
}

// ---------- O que vai para o visualizador ----------
const r2 = (v: number) => Math.round(v * 100) / 100;

const agenteParaRede = (a: Agente): EntidadeRede => ({
  id: a.id, nome: a.nome, sexo: a.sexo, x: a.x, y: a.y, z: a.z, rotacao: a.rotacao,
  acao: a.acao, intencao: a.intencao,
  necessidades: {
    fome: r2(a.corpo.fome), sede: r2(a.corpo.sede), sono: r2(a.corpo.sono),
    energia: r2(a.corpo.energia), saude: r2(a.corpo.saude), frio: r2(a.corpo.frio), dor: r2(a.corpo.dor),
  },
  memoria: {
    agua: a.memoria.filter(m => m.tipo === 'agua').length,
    comida: a.memoria.filter(m => m.tipo === 'comida').length,
    carne: a.memoria.filter(m => m.tipo === 'carne').length,
  },
  caca: { ...a.caca },
  mente: {
    episodios: a.mente.episodios.length,
    crencas: [...a.mente.crencas].sort((p, q) => q.certeza - p.certeza).slice(0, 5)
      .map(c => ({ enunciado: c.enunciado, certeza: r2(c.certeza) })),
    lembrancas: [...a.mente.episodios].sort((p, q) => q.importancia * q.forca - p.importancia * p.forca).slice(0, 3)
      .map(descreverEpisodio),
    mapaConhecido: r2(conhecidas(a.mapa) / a.mapa.length),
  },
  sentimentos: (() => {
    const s = a.sentimentos, dom = emocaoDominante(s);
    const arred = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)]));
    return {
      dominante: dom.emocao, intensidade: r2(dom.intensidade), derivada: s.derivada,
      emocoes: arred(s.emocoes), humor: arred(s.humor),
      afeto: { valencia: r2(s.afeto.valencia), ativacao: r2(s.afeto.ativacao), controle: r2(s.afeto.controle) },
      personalidade: arred(a.personalidade as unknown as Record<string, number>),
      jeito: descreverPersonalidade(a.personalidade, a.sexo),
    };
  })(),
});

function descreverEpisodio(e: Episodio) {
  const [tipo, valor] = e.sobre.split(':');
  const alvo = tipo === 'especie' ? `um ${PERFIS[valor as Especie]?.nome ?? valor}` : tipo === 'arbusto' ? 'um arbusto' : e.sobre;
  const dia = Math.floor(e.quando / 24) + 1;
  const txt: Record<string, string> = {
    atacado: `foi atacado por ${alvo}`, viu: `viu ${alvo} de perto`, passou_mal: 'passou mal com carne podre',
    comeu: e.sobre === 'carne' ? 'comeu carne' : 'comeu frutos', cacou: `caçou ${alvo}`, falhou_caca: `não conseguiu pegar ${alvo}`,
    fugiu: `fugiu de ${alvo}`, decepcao: 'achou um arbusto vazio', viu_morte: 'viu alguém morrer', sentiu_frio: 'passou muito frio',
  };
  return `dia ${dia}: ${txt[e.oQue] ?? e.oQue}${e.vezes > 1 ? ` (${e.vezes}×)` : ''}`;
}

const animalParaRede = (an: Animal, hora: number): AnimalRede => {
  const emocoes: Record<string, number> = {};
  for (const [k, v] of Object.entries(an.emocoes)) emocoes[k] = r2(v ?? 0);
  return {
    id: an.id, especie: an.especie, sexo: an.sexo, x: r2(an.x), y: r2(an.y), z: r2(an.z), rotacao: r2(an.rotacao),
    acao: an.acao, intencao: an.intencao,
    crescimento: r2(maturidade(an, hora)), idadeDias: Math.floor((hora - an.nascidoEm) / 24),
    necessidades: {
      fome: r2(an.corpo.fome), sede: r2(an.corpo.sede), sono: r2(an.corpo.sono),
      energia: r2(an.corpo.energia), saude: r2(an.corpo.saude), frio: r2(an.corpo.frio), gordura: r2(an.corpo.gordura),
    },
    emocoes,
  };
};

const carcacaParaRede = (k: Carcaca, hora: number): CarcacaRede => ({
  id: k.id, especie: k.especie, x: r2(k.x), y: r2(heightAt(k.x, k.z)), z: r2(k.z), rotacao: r2(k.rotacao),
  porcoes: k.porcoes, estragada: estragada(k, hora),
});

export function retrato(e: Estado, msMundo: number, velocidade: number): MsgEstado {
  const hora = horaDoMundo(msMundo);
  return {
    tipo: 'estado', tick: e.tick, msMundo, velocidade,
    entidades: e.agentes.map(agenteParaRede),
    animais: e.animais.map(an => animalParaRede(an, hora)),
    carcacas: e.carcacas.map(k => carcacaParaRede(k, hora)),
    frutos: e.frutos,
  };
}
