// Animais: instinto, emoções da espécie e memória associativa simples (sem LLM).
// Documentação, seção 17: corpo, percepção por espécie, estados emocionais,
// instintos (fugir, perseguir, caçar, seguir o grupo, proteger filhotes, marcar território, migrar),
// habituação e sensibilização.
import { ARBUSTOS, ARVORES, WATER_LEVEL, heightAt, obstaculosPerto, resolverColisao } from '../../shared/mundo';
import { PERFIS, type Especie, type EmocaoAnimal, type PerfilEspecie } from '../../shared/especies';
import type { Acao } from '../../shared/protocolo';
import { ehAnimal, type Contexto, type Ser } from './contexto';
import { ferirAgente, type Agente } from './agente';
import { celulaPasto, estragada, type Carcaca } from './ecologia';
import { LIMITE, distancia, naAgua, pertoDaAgua, pontoAleatorio, pontoNaAgua, procurarAgua, terraSeca, type Ponto } from './espaco';

export type ObjetivoAnimal = 'fugir' | 'enfrentar' | 'beber' | 'comer' | 'cacar' | 'dormir' | 'abrigar' | 'seguir'
  | 'vagar' | 'descansar' | 'dispersar' | 'migrar';

export interface LugarLembrado { tipo: 'agua' | 'comida' | 'perigo'; x: number; z: number; forca: number }
export interface CorpoAnimal {
  fome: number; sede: number; sono: number; energia: number; saude: number;
  frio: number;      // 0 = confortável, 1 = congelando
  gordura: number;   // reserva: engorda no outono, segura a fome no inverno
}

export type MotivoBriga = 'defesa' | 'rival' | 'expulsar' | 'disputa';

export interface Animal {
  id: string; especie: Especie; sexo: 'M' | 'F';
  nascidoEm: number;   // hora do mundo
  vida: number;        // dias que este indivíduo vive, se nada o matar antes
  x: number; y: number; z: number; rotacao: number;
  acao: Acao; intencao: string; vivo: boolean; causaMorte: string | null;
  corpo: CorpoAnimal;
  emocoes: Partial<Record<EmocaoAnimal, number>>;
  lugares: LugarLembrado[];                 // mapa mental: água, comida, perigo
  associacoes: Record<string, number>;      // quem -> perigo aprendido (0 seguro, 1 perigo)
  grupo: string; mae: string | null; adulto: boolean;
  objetivo: ObjetivoAnimal | null;
  destino: Ponto | null; prazo: number;
  desvio: Ponto | null; travado: number;    // contornando um obstáculo
  alvoId: string | null;                    // presa perseguida ou rival enfrentado
  motivo: MotivoBriga | null;
  alvoCarcaca: number;                      // carcaça que vai comer
  presaVista: string | null; carcacaVista: number; arbustoVisto: number;
  rivalVisto: { id: string; motivo: MotivoBriga } | null;
  curiosoDe: Ponto | null;
  ameaca: { id: string; x: number; z: number; tipo: string; direta: boolean } | null;   // direta = viu com os próprios olhos
  ocupadoAte: number; proximaDecisao: number;
  parto: number; ultimaCria: number; filhotesPrevistos: number; inicioCaca: number;
  abrigado: boolean; amontoado: boolean;
  territorio: Ponto | null;                 // centro do território (lobos)
  ultimaMarca: number; migrouEm: number; ultimaBriga: number;
  dispersao: Ponto | null;                  // para onde está se mudando (sobrevive a um susto no caminho)
  vooX: number; vooZ: number;               // pássaros: média do deslocamento recente (vai e volta não é voar)
  objetivoDesde: number;                    // quando começou o objetivo atual (compromisso: não muda de ideia a toda hora)
}

const lim = (v: number) => Math.min(1, Math.max(0, v));
const RAIO_HUMANO = 0.35;

export const maturidade = (an: Animal, hora: number) =>
  Math.min(1, Math.max(0, (hora - an.nascidoEm) / 24 / PERFIS[an.especie].adultoDias));

export function criarAnimal(id: string, especie: Especie, sexo: 'M' | 'F', x: number, z: number,
                            nascidoEm: number, rand: () => number): Animal {
  const p = PERFIS[especie];
  const emocoes: Partial<Record<EmocaoAnimal, number>> = {};
  for (const e of p.emocoes) emocoes[e] = e === 'calma' ? 1 : 0;
  return completarAnimal({
    id, especie, sexo, nascidoEm, vida: p.vidaDias * (0.8 + rand() * 0.4),
    x, y: heightAt(x, z), z, rotacao: rand() * Math.PI * 2,
    acao: 'parado', intencao: 'olhando em volta', vivo: true, causaMorte: null,
    corpo: { fome: 0.2 + rand() * 0.2, sede: 0.2 + rand() * 0.2, sono: 0.2, energia: 1, saude: 1, frio: 0, gordura: 0.3 },
    emocoes, lugares: [], associacoes: {},
    grupo: '', mae: null, adulto: false,
    objetivo: null, destino: null, prazo: 0, desvio: null, travado: 0, alvoId: null, alvoCarcaca: -1,
    presaVista: null, carcacaVista: -1, ameaca: null,
    ocupadoAte: 0, proximaDecisao: Math.floor(rand() * 5),
    parto: 0, ultimaCria: -1e9, filhotesPrevistos: 0, inicioCaca: 0,
  });
}

// animais salvos por versões anteriores ganham os campos novos
export function completarAnimal(an: Partial<Animal> & Pick<Animal, 'corpo' | 'especie' | 'emocoes'>): Animal {
  an.corpo.frio ??= 0; an.corpo.gordura ??= 0.3;
  an.motivo ??= null; an.arbustoVisto ??= -1; an.rivalVisto ??= null; an.curiosoDe ??= null;
  an.abrigado ??= false; an.amontoado ??= false; an.territorio ??= null;
  an.ultimaMarca ??= 0; an.migrouEm ??= -1e9; an.ultimaBriga ??= -1e9; an.dispersao ??= null; an.vooX ??= 0; an.vooZ ??= 0; an.objetivoDesde ??= 0;
  for (const e of PERFIS[an.especie].emocoes) an.emocoes[e] ??= 0;
  return an as Animal;
}

// ---------- Onde cada espécie pode estar: terra firme, ou água funda para os peixes ----------
const pisavel = (an: Animal, x: number, z: number) => (PERFIS[an.especie].aquatico ? naAgua(x, z) : terraSeca(x, z));
const pontoPara = (an: Animal, x: number, z: number, rand: () => number, min: number, max: number) =>
  PERFIS[an.especie].aquatico ? pontoNaAgua(x, z, rand, min, max) : pontoAleatorio(x, z, rand, min, max);

// sair do grupo e ir viver em outro lugar
function partir(an: Animal, ctx: Contexto, min: number, max: number) {
  an.dispersao = pontoPara(an, an.x, an.z, ctx.rand, min, max);
  an.objetivo = 'dispersar'; an.territorio = null; an.alvoId = null; an.motivo = null;
  definirDestino(an, ctx, an.dispersao, PERFIS[an.especie].andar);
}

// ---------- Memória associativa ----------
export function lembrarLugar(an: Animal, tipo: LugarLembrado['tipo'], x: number, z: number) {
  const igual = an.lugares.find(l => l.tipo === tipo && Math.hypot(l.x - x, l.z - z) < 15);
  if (igual) { igual.x = x; igual.z = z; igual.forca = 1; return; }
  an.lugares.push({ tipo, x, z, forca: 1 });
  if (an.lugares.length > 12) { an.lugares.sort((a, b) => b.forca - a.forca); an.lugares.length = 12; }
}

// medo aprendido de um humano; de lobos e javalis adultos, o medo é instintivo
function medoDe(an: Animal, s: Ser, hora: number): number {
  const p = PERFIS[an.especie];
  if (!ehAnimal(s)) return an.associacoes[s.id] ?? p.medoInato.humano;
  if (s.especie === an.especie) return 0;
  if (s.especie === 'lobo')
    return p.medoInato.lobo * (s.objetivo === 'cacar' || s.alvoId === an.id ? 1 : 0.6);
  if (s.especie === 'javali') {
    if (maturidade(s, hora) < 0.6) return 0;
    return p.medoInato.javali * (s.objetivo === 'enfrentar' ? (s.alvoId === an.id ? 2 : 1.2) : 0.5);
  }
  return 0;
}

// dormindo na toca ou escondido num arbusto, o coelho só é notado muito de perto
const oculto = (o: Animal) => o.acao === 'escondido' || (o.especie === 'coelho' && o.acao === 'dormindo');

function horaDeDormir(p: PerfilEspecie, ctx: Contexto) {
  if (!p.dormeDeDia) return ctx.noite;
  const h = ctx.hora % 24;
  return h >= 10 && h < 17;
}

const embaixoDeArvore = (x: number, z: number) =>
  obstaculosPerto(x, z).some(o => 'escala' in o && Math.hypot(o.x - x, o.z - z) < o.r + 1.8);

function pastoEmVolta(ctx: Contexto, x: number, z: number) {
  let soma = 0, n = 0;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const c = celulaPasto(x + i * 10, z + j * 10);
    if (c >= 0 && ctx.pasto[c] >= 0) { soma += ctx.pasto[c]; n++; }
  }
  return n ? soma / n : 0;
}

// ---------- Percepção ----------
function perceber(an: Animal, ctx: Contexto) {
  const p = PERFIS[an.especie], c = an.corpo, e = an.emocoes;
  const dormindo = an.acao === 'dormindo';
  const alerta = e.alerta ?? 0;
  const mat = maturidade(an, ctx.hora);
  let visao = (p.visaoNoite + (p.visaoDia - p.visaoNoite) * ctx.luz) * (1 + alerta * 0.3);
  if (dormindo) visao = Math.max(visao * 0.3, 5);   // ouve quem se aproxima

  let ameaca: Ser | null = null, nivel = 0;
  const considerar = (s: Ser, d: number, medo: number) => {
    if (medo <= 0) return;
    const limite = p.distanciaFuga * medo * (0.7 + 0.5 * alerta);
    if (d > limite) return;
    const n = medo * (1 - d / (limite + 1)) + 0.2;
    if (n > nivel) { nivel = n; ameaca = s; }
  };

  const g = ctx.grupos.get(an.grupo);
  const carnivoro = p.dieta === 'carne';
  let meusPerto = 0;
  if (carnivoro || p.territorial)
    for (const o of ctx.perto(an.x, an.z, 25)) if (o.vivo && o.grupo === an.grupo && Math.hypot(o.x - an.x, o.z - an.z) < 25) meusPerto++;

  let presa: Ser | null = null, notaPresa = 0;
  an.curiosoDe = null;
  const curioso = 'curiosidade' in e;

  for (const ag of ctx.agentes) {
    if (!ag.vivo) continue;
    const d = Math.hypot(ag.x - an.x, ag.z - an.z);
    if (d > visao) continue;
    const base = medoDe(an, ag, ctx.hora);
    if (ag.presa === an.id) considerar(ag, d, Math.max(base, 0.95));
    else {
      considerar(ag, d, ag.acao === 'dormindo' ? base * 0.3 : base);
      // habituação: um humano visto de novo e de novo, sem nada de ruim acontecer, assusta menos
      if (ag.acao !== 'correndo') an.associacoes[ag.id] = Math.max(p.pisoHabituacao, base - 0.003);
      // curiosidade: um ser que não assusta, a uma distância segura, dá vontade de farejar de perto
      if (curioso && base < 0.4 && d > 6) an.curiosoDe = { x: ag.x, z: ag.z };
    }
    // um lobo faminto, com a matilha junto, pode atacar um humano dormindo ou ferido
    if (carnivoro && mat >= 0.5 && c.fome > 0.8 && meusPerto >= 2 && base < 0.5 &&
        (ag.acao === 'dormindo' || ag.corpo.saude < 0.4)) {
      const nota = 0.7 / (1 + d / 12);
      if (nota > notaPresa) { notaPresa = nota; presa = ag; }
    }
  }

  let fugindoJunto: Animal | null = null;
  let filhotePerto = false, sozinho = !g || g.n <= 1;
  an.amontoado = false; an.rivalVisto = null;
  // carnívoros farejam presas além do que enxergam
  const faro = carnivoro && !dormindo ? Math.max(visao, p.olfato * 0.5) : visao;
  for (const o of ctx.perto(an.x, an.z, Math.max(visao, faro, 20))) {
    if (o === an || !o.vivo) continue;
    const d = Math.hypot(o.x - an.x, o.z - an.z);
    if (o.mae === an.id && d < 20) filhotePerto = true;
    if (o.grupo === an.grupo && d < 1.5) an.amontoado = true;
    if (oculto(o) && d > 2) continue;
    if (d > visao) {
      if (carnivoro && d <= faro && c.fome > 0.3 && mat >= 0.3) {
        const nota = notaDePresa(an, o, meusPerto, ctx) * 0.8 / (1 + d / 12);
        if (nota > notaPresa) { notaPresa = nota; presa = o; }
      }
      continue;
    }
    considerar(o, d, medoDe(an, o, ctx.hora));
    // peixe: qualquer bicho grande se mexendo na beira da água assusta o cardume
    if (p.aquatico && o.especie !== an.especie && o.especie !== 'ave' && o.acao !== 'dormindo' && o.acao !== 'parado')
      considerar(o, d, 0.7);
    if (o.grupo === an.grupo && o.objetivo === 'fugir' && o.acao === 'correndo' && o.ameaca?.direta) fugindoJunto = o;
    if (curioso && o.especie !== an.especie && medoDe(an, o, ctx.hora) === 0 && d > 5) an.curiosoDe = { x: o.x, z: o.z };

    if (o.especie === an.especie && o.grupo !== an.grupo) {
      const go = ctx.grupos.get(o.grupo);
      if (p.territorial && an.adulto && o.adulto) {
        // outra matilha: quem está em maior número enfrenta; em menor número, recua
        const delesPerto = ctx.perto(o.x, o.z, 25).filter(x => x.vivo && x.grupo === o.grupo && Math.hypot(x.x - o.x, x.z - o.z) < 25).length;
        if (d < 25) {
          // um solitário é expulso — a não ser que traga o que falta à matilha (um macho ou uma fêmea adulta)
          if (delesPerto === 1 && meusPerto >= 2 && (g?.n ?? 1) >= 3 && temAdultoDoSexo(ctx, an.grupo, o.sexo))
            an.rivalVisto = { id: o.id, motivo: 'expulsar' };
          else if (meusPerto > delesPerto || (meusPerto === delesPerto && g?.lider === an)) an.rivalVisto = { id: o.id, motivo: 'rival' };
          else considerar(o, d, 0.8);
        }
      } else if (sozinho && go && go.n < p.grupoMax) {
        // formar grupo: um animal sozinho se junta a outro da mesma espécie
        an.grupo = o.grupo; sozinho = false;
      }
    }
    // disputa entre machos adultos da mesma manada na época de cria
    if (p.machosDisputam && an.sexo === 'M' && an.adulto && o.especie === an.especie && o.sexo === 'M' && o.adulto &&
        o.grupo === an.grupo && d < 12 && p.estacoesDeCria.includes(ctx.estacao) &&
        c.fome < 0.6 && c.saude > 0.75 && o.objetivo !== 'enfrentar' &&
        ctx.hora - an.ultimaBriga > 240 && ctx.hora - o.ultimaBriga > 240 && ctx.rand() < 0.003)
      an.rivalVisto = { id: o.id, motivo: 'disputa' };

    if (carnivoro && mat >= 0.3 && c.fome > 0.3) {
      let nota = notaDePresa(an, o, meusPerto, ctx);
      if (o.acao === 'dormindo') nota *= 1.3;
      nota /= 1 + d / 12;
      if (nota > notaPresa) { notaPresa = nota; presa = o; }
    }
  }

  // um lobo sozinho que encontra uma matilha só entra se ela for pequena
  if (p.territorial && sozinho && an.rivalVisto === null) {
    for (const o of ctx.perto(an.x, an.z, visao)) {
      if (!o.vivo || o.especie !== an.especie || o.grupo === an.grupo || Math.hypot(o.x - an.x, o.z - an.z) > visao) continue;
      const go = ctx.grupos.get(o.grupo);
      if (go && (go.n < 3 || !temAdultoDoSexo(ctx, o.grupo, an.sexo))) {
        an.grupo = o.grupo;
        ctx.evento(go.n < 3 ? 'Um lobo solitário se juntou a uma matilha pequena'
          : `Um lobo solitário foi aceito numa matilha que não tinha ${an.sexo === 'M' ? 'macho' : 'fêmea'}`);
        break;
      }
    }
  }

  // olfato: carnívoros e onívoros sentem o cheiro de carcaças e de frutos
  an.carcacaVista = -1; an.arbustoVisto = -1;
  if (p.dieta === 'carne' || p.dieta === 'onivoro') {
    let melhor = p.dieta === 'carne' ? p.olfato : p.olfato * 0.6;
    for (const k of ctx.carcacas) {
      const d = Math.hypot(k.x - an.x, k.z - an.z);
      if (k.porcoes > 0 && d < melhor) { melhor = d; an.carcacaVista = k.id; }
    }
  }
  if (p.dieta === 'onivoro' || p.dieta === 'graos') {
    let melhor = p.dieta === 'onivoro' ? p.olfato * 0.6 : visao * 0.6;
    ARBUSTOS.forEach((b, i) => {
      const d = Math.hypot(b.x - an.x, b.z - an.z);
      if (ctx.frutos[i] > 0 && d < melhor) { melhor = d; an.arbustoVisto = i; }
    });
  }

  const a = ameaca as Ser | null;
  if (a) {
    // o alarme dos pássaros: quando um levanta voo assustado, todo mundo em volta fica alerta
    if (p.alarme && !an.ameaca?.direta)
      for (const o of ctx.perto(an.x, an.z, 25)) if (o !== an && o.vivo && Math.hypot(o.x - an.x, o.z - an.z) < 25)
        o.emocoes.alerta = Math.max(o.emocoes.alerta ?? 0, 0.7);
    an.ameaca = { id: a.id, x: a.x, z: a.z, tipo: ehAnimal(a) ? a.especie : 'humano', direta: true };
    e.medo = Math.max(e.medo ?? 0, Math.min(1, nivel));
    e.alerta = Math.max(alerta, Math.min(1, nivel));
  } else if (fugindoJunto && fugindoJunto.ameaca) {
    // o bando foge quando um foge (mas o susto de segunda mão não se espalha de novo)
    if (!an.ameaca) e.medo = Math.max(e.medo ?? 0, 0.5);
    an.ameaca = { ...fugindoJunto.ameaca, direta: false };
    e.alerta = Math.max(alerta, 0.7);
  } else if (an.ameaca) {
    const s = ctx.porId.get(an.ameaca.id);
    if (s && s.vivo && Math.hypot(s.x - an.x, s.z - an.z) < visao) { an.ameaca.x = s.x; an.ameaca.z = s.z; }
    else an.ameaca.direta = false;
  }
  an.presaVista = presa ? (presa as Ser).id : null;
  // mapa mental: onde já encontrou caça
  if (presa && ehAnimal(presa)) lembrarLugar(an, 'comida', (presa as Animal).x, (presa as Animal).z);

  if ('apego' in e) e.apego = filhotePerto ? 1 : an.mae && mat < 0.5 ? 0.8 : 0.1;
  if ('dominancia' in e) e.dominancia = g?.lider === an ? 1 : Math.max(0.3, (e.dominancia ?? 0.3) - 0.01);
  if ('agressividade' in e && an.ameaca && filhotePerto) e.agressividade = Math.max(e.agressividade ?? 0, 0.8);
  if ('curiosidade' in e && an.curiosoDe && (e.medo ?? 0) < 0.2) e.curiosidade = Math.max(e.curiosidade ?? 0, 0.6);

  an.abrigado = an.acao === 'escondido' || embaixoDeArvore(an.x, an.z);

  // com sede, olha em volta procurando água (rio, lago) mesmo que já conheça outro lugar mais longe
  if (c.sede > 0.4 && (!an.lugares.some(l => l.tipo === 'agua') || ctx.rand() < 0.25)) {
    const w = procurarAgua(an.x, an.z, visao);
    if (w) lembrarLugar(an, 'agua', w.x, w.z);
  }

  tentarConceber(an, ctx);
}

const temAdultoDoSexo = (ctx: Contexto, grupo: string, sexo: 'M' | 'F') =>
  ctx.animais.some(o => o.vivo && o.grupo === grupo && o.adulto && o.sexo === sexo);

// quanto vale caçar este animal (só lobos)
function notaDePresa(an: Animal, o: Animal, meusPerto: number, ctx: Contexto) {
  if (o.especie === 'lobo' || o.especie === 'ave' || o.especie === 'peixe') return 0;   // pássaro voa, peixe nada: fora de alcance
  const mo = maturidade(o, ctx.hora);
  let nota: number;
  if (o.especie === 'coelho') nota = 1;
  else if (o.especie === 'cervo') nota = meusPerto >= 3 ? 0.9 : 0.3;
  else nota = (mo < 0.5 ? 0.9 : an.corpo.fome > 0.85 && meusPerto >= 3 ? 0.3 : 0)   // javali adulto revida
    * (1 - 0.9 * (an.associacoes['especie:javali'] ?? 0));                              // e quem já apanhou de um evita
  nota *= 1.5 - 0.5 * mo;
  if (o.corpo.saude < 0.6) nota *= 1.5;
  return nota;
}

// ---------- Reprodução ----------
function tentarConceber(an: Animal, ctx: Contexto) {
  const p = PERFIS[an.especie];
  if (an.sexo !== 'F' || an.parto > 0 || !an.adulto) return;
  if (!p.estacoesDeCria.includes(ctx.estacao)) return;
  if (ctx.hora - an.ultimaCria < p.intervaloCriaDias * 24) return;
  if (an.corpo.fome > 0.5 || an.corpo.saude < 0.6) return;
  if ((ctx.contagem[an.especie] ?? 0) >= p.capacidade) return;
  if (p.social === 'matilha' && ctx.grupos.get(an.grupo)?.femeaDominante !== an) return;   // só a fêmea dominante cria
  let machos = 0, vizinhos = 0;
  for (const o of ctx.perto(an.x, an.z, 40)) {
    if (o === an || !o.vivo || o.especie !== an.especie) continue;
    const d = Math.hypot(o.x - an.x, o.z - an.z);
    if (d < 30) vizinhos++;
    if (d < 40 && o.sexo === 'M' && o.adulto) machos++;
  }
  if (!machos || vizinhos > p.densidadeMax) return;
  an.parto = ctx.hora + p.gestacaoDias * 24;
  an.filhotesPrevistos = p.ninhada[0] + Math.floor(ctx.rand() * (p.ninhada[1] - p.ninhada[0] + 1));
  ctx.contagem[an.especie] = (ctx.contagem[an.especie] ?? 0) + an.filhotesPrevistos;
}

function parir(an: Animal, ctx: Contexto) {
  const p = PERFIS[an.especie], n = an.filhotesPrevistos;
  for (let i = 0; i < n; i++) {
    const x = an.x + (ctx.rand() - 0.5) * 1.5, z = an.z + (ctx.rand() - 0.5) * 1.5;
    const f = criarAnimal(ctx.novoId('an'), an.especie, ctx.rand() < 0.5 ? 'M' : 'F',
      pisavel(an, x, z) ? x : an.x, pisavel(an, x, z) ? z : an.z, ctx.hora, ctx.rand);
    f.grupo = an.grupo; f.mae = an.id;
    // filhotes herdam da mãe os lugares e os medos
    f.lugares = an.lugares.map(l => ({ ...l }));
    f.associacoes = { ...an.associacoes };
    f.corpo.fome = 0.2; f.corpo.sede = 0.2; f.corpo.gordura = 0.1;
    ctx.nascer(f);
  }
  an.parto = 0; an.ultimaCria = ctx.hora;
  ctx.evento(n === 1 ? `Nasceu um filhote de ${p.nome}` : `Nasceram ${n} filhotes de ${p.nome}`);
}

// ---------- Ferimentos e morte ----------
export function morrerAnimal(an: Animal, causa: string, ctx: Contexto): Carcaca {
  const p = PERFIS[an.especie];
  an.vivo = false; an.acao = 'morto'; an.causaMorte = causa; an.intencao = `morreu (${causa})`;
  const mat = maturidade(an, ctx.hora);
  const violenta = /^(caçado|morto|ferido)/.test(causa);
  ctx.evento(`Um ${p.nome}${mat < 1 ? ' jovem' : ''} ${violenta ? 'foi ' + causa : 'morreu de ' + causa}`);
  return ctx.novaCarcaca({
    especie: an.especie, x: an.x, z: an.z, rotacao: an.rotacao, desde: ctx.hora,
    porcoes: Math.max(1, Math.round(p.porcoesDeCarne * (0.3 + 0.7 * mat))),
  });
}

export interface Agressor { id: string; x: number; z: number; tipo: 'humano' | Especie; nome?: string }

function causaDoAtaque(agr: Agressor, alvo: Animal) {
  if (agr.tipo === 'humano') return `caçado por ${agr.nome}`;
  if (agr.tipo === alvo.especie) return 'morto numa briga';
  if (agr.tipo === 'lobo') return 'morto por lobos';
  return `morto por um ${PERFIS[agr.tipo].nome}`;
}

// devolve a carcaça se o golpe matou
export function ferirAnimal(an: Animal, dano: number, agr: Agressor, ctx: Contexto): Carcaca | null {
  an.corpo.saude = lim(an.corpo.saude - dano);
  // sensibilização: um único ataque basta para aprender o perigo
  if (agr.tipo === 'humano') an.associacoes[agr.id] = 1;
  else if (agr.tipo !== an.especie) an.associacoes[`especie:${agr.tipo}`] = 1;   // a dor ensina quem é perigoso
  const brigando = an.objetivo === 'enfrentar' && an.alvoId === agr.id && an.corpo.saude > 0.45;
  an.emocoes.medo = brigando ? Math.max(an.emocoes.medo ?? 0, 0.4) : 1;
  an.emocoes.alerta = 1;
  if ('agressividade' in an.emocoes) an.emocoes.agressividade = 1;
  an.ameaca = { id: agr.id, x: agr.x, z: agr.z, tipo: agr.tipo, direta: true };
  if (agr.tipo !== an.especie) lembrarLugar(an, 'perigo', an.x, an.z);
  if (an.acao === 'dormindo' || an.acao === 'escondido') an.acao = 'parado';
  an.ocupadoAte = 0; an.proximaDecisao = 0;
  // quem do grupo viu também aprende
  for (const o of ctx.perto(an.x, an.z, 30)) {
    if (o === an || !o.vivo || o.grupo !== an.grupo || Math.hypot(o.x - an.x, o.z - an.z) > 30) continue;
    if (agr.tipo === 'humano') o.associacoes[agr.id] = Math.max(o.associacoes[agr.id] ?? 0, 0.7);
    o.emocoes.alerta = 1;
  }
  if (an.corpo.saude <= 0) return morrerAnimal(an, causaDoAtaque(agr, an), ctx);
  // lobo solitário expulso pela matilha vai procurar outro território
  const g = ctx.grupos.get(an.grupo);
  if (agr.tipo === an.especie && PERFIS[an.especie].territorial && (!g || g.n <= 1) && !an.dispersao) {
    partir(an, ctx, 80, 160);
    ctx.evento('Um lobo solitário foi expulso por uma matilha e partiu');
  }
  // cervo que perde a disputa larga a manada
  if (an.motivo === 'disputa' && an.corpo.saude < 0.75) {
    an.grupo = ctx.novoId('g');
    partir(an, ctx, 50, 120);
    ctx.evento(`Um ${PERFIS[an.especie].nome} perdeu a disputa pela manada e foi embora`);
  }
  return null;
}

// ---------- Corpo e emoções ----------
function atualizarCorpo(an: Animal, p: PerfilEspecie, ctx: Contexto, mat: number) {
  const c = an.corpo, h = ctx.horas;
  const dormindo = an.acao === 'dormindo', correndo = an.acao === 'correndo' || an.acao === 'atacando';

  // frio: pelagem da espécie, filhotes sentem mais, gordura isola, abrigo e corpos juntos esquentam
  let sentida = ctx.temperatura;
  if (!an.abrigado) sentida -= ctx.chuva * 4 + ctx.vento * 3;
  if (an.amontoado) sentida += 4;
  if (dormindo) sentida -= 1;
  if (correndo) sentida += 3;
  const conforto = p.confortoMin + (1 - mat) * 6 - c.gordura * 4;
  c.frio = lim((conforto - sentida) / 12);

  const metab = (dormindo ? 0.4 : correndo ? 2 : 1) * (1 + c.frio * 0.6);
  c.fome = lim(c.fome + h * p.fomePorHora * metab * (0.7 + 0.3 * mat));
  c.sede = p.aquatico ? 0 : lim(c.sede + h * p.sedePorHora * metab * (ctx.temperatura > 28 ? 1.5 : 1));
  c.sono = lim(dormindo ? c.sono - h / 5 : c.sono + h / 16);
  c.energia = lim(correndo ? c.energia - h * p.cansacoCorrendo
    : c.energia + h * (dormindo ? 1 / 3 : an.acao === 'andando' ? 1 / 5 : 1 / 2.5));

  // com fome, o corpo queima a reserva de gordura
  c.gordura = lim(c.gordura - h / (24 * 60));
  if (c.fome > 0.5 && c.gordura > 0) {
    const q = h * p.fomePorHora * metab * 0.9;
    c.fome = lim(c.fome - q);
    c.gordura = lim(c.gordura - q * 0.5);
  }

  let dano = 0;
  if (c.sede >= 1) dano += 1 / 30;
  if (c.fome >= 1) dano += 1 / 60;
  if (c.frio > 0.75) dano += (c.frio - 0.75) / 10;
  if ((ctx.hora - an.nascidoEm) / 24 > an.vida) dano += 1 / (24 * 8);
  if (dano > 0) c.saude = lim(c.saude - dano * h);
  else if (c.fome < 0.6 && c.sede < 0.6) c.saude = lim(c.saude + h / 36);
}

// filhotes pequenos mamam: junto da mãe bem alimentada não passam fome nem sede, e ela gasta por eles
function amamentar(an: Animal, ctx: Contexto, mat: number) {
  if (mat >= 0.3 || !an.mae) return;
  const mae = ctx.porId.get(an.mae);
  if (!mae || !mae.vivo || !ehAnimal(mae) || mae.corpo.fome > 0.75 || distancia(an, mae) > 5) return;
  const p = PERFIS[an.especie], h = ctx.horas;
  an.corpo.fome = Math.max(0, an.corpo.fome - h * p.fomePorHora * 1.5);
  an.corpo.sede = Math.max(0, an.corpo.sede - h * p.sedePorHora * 1.5);
  mae.corpo.fome = lim(mae.corpo.fome + h * p.fomePorHora * 0.4);
  mae.corpo.sede = lim(mae.corpo.sede + h * p.sedePorHora * 0.3);
}

function causaNatural(an: Animal, hora: number) {
  if (an.corpo.sede >= 1) return 'sede';
  if (an.corpo.fome >= 1) return 'fome';
  if (an.corpo.frio > 0.75) return 'frio';
  if ((hora - an.nascidoEm) / 24 > an.vida) return 'velhice';
  return 'ferimentos';
}

function sentir(an: Animal, ctx: Contexto) {
  const e = an.emocoes, h = ctx.horas;
  e.medo = (e.medo ?? 0) * Math.exp(-h / 0.12);              // o susto passa em minutos
  e.alerta = Math.max(0, (e.alerta ?? 0) - h * 0.8);
  if ('calma' in e) e.calma = 1 - Math.max(e.medo, e.alerta);
  if ('satisfacao' in e) e.satisfacao = 1 - Math.max(an.corpo.fome, an.corpo.sede, an.corpo.frio);
  if ('excitacao' in e) {
    const alvo = an.objetivo === 'cacar' ? 1 : an.presaVista && an.corpo.fome > 0.3 ? 0.6 : 0;
    e.excitacao = Math.max(alvo, (e.excitacao ?? 0) - h * 2);
  }
  if ('agressividade' in e) e.agressividade = Math.max(an.objetivo === 'enfrentar' ? 1 : 0, (e.agressividade ?? 0) - h * 1.5);
  if ('curiosidade' in e) e.curiosidade = Math.max(0, (e.curiosidade ?? 0) - h * 0.5);
}

// ---------- Movimento ----------
function velocidade(an: Animal, p: PerfilEspecie, correndo: boolean, mat: number) {
  let v = (correndo ? p.correr : p.andar) * (0.5 + 0.5 * mat);
  if (an.corpo.energia < 0.15) v = Math.min(v, p.andar);
  if (an.corpo.saude < 0.4) v *= 0.7;
  return v;
}

function definirDestino(an: Animal, ctx: Contexto, d: Ponto | null, vel: number) {
  an.destino = d; an.desvio = null;
  if (d) an.prazo = ctx.hora + ((distancia(an, d) / vel) * 2 + 20) * (ctx.horas / ctx.dt);
}

function mover(an: Animal, alvo: Ponto, vel: number, ctx: Contexto, perto = 0.5): 'chegou' | 'bloqueado' | 'andando' {
  if (an.desvio && distancia(an, an.desvio) < 0.5) an.desvio = null;
  const meta = an.desvio ?? alvo;
  const dx = meta.x - an.x, dz = meta.z - an.z, dist = Math.hypot(dx, dz);
  if (!an.desvio && dist < perto) return 'chegou';
  // pássaro: para andar poucos metros vai pulando no chão; só voa para ir mais longe
  const pulando = PERFIS[an.especie].voa && dist < 6 && an.acao !== 'correndo';
  const passo = Math.min(dist, (pulando ? Math.min(vel, 0.8) : vel) * ctx.dt);
  const nx = an.x + (dx / dist) * passo, nz = an.z + (dz / dist) * passo;
  if (PERFIS[an.especie].voa) {
    // voando: passa por cima da água, das pedras e das árvores
    if (Math.abs(nx) > LIMITE || Math.abs(nz) > LIMITE) return 'bloqueado';
    an.x = nx; an.z = nz; an.rotacao = Math.atan2(dx, dz);
    return 'andando';
  }
  if (!pisavel(an, nx, nz)) { an.desvio = null; return 'bloqueado'; }
  const ax = an.x, az = an.z;
  an.x = nx; an.z = nz;
  if (!PERFIS[an.especie].aquatico) resolverColisao(an, PERFIS[an.especie].raio);
  // preso numa árvore ou pedra: tenta contornar; se nem contornando sai do lugar, desiste
  an.travado = Math.hypot(an.x - ax, an.z - az) < passo * 0.3 ? an.travado + 1 : 0;
  if (an.travado > 15) {
    an.travado = 0;
    if (an.desvio) { an.desvio = null; return 'bloqueado'; }
    an.desvio = pontoPara(an, an.x, an.z, ctx.rand, 2, 6);
  }
  an.y = heightAt(an.x, an.z);
  an.rotacao = Math.atan2(dx, dz);
  return 'andando';
}

function pontoDeFuga(an: Animal, de: Ponto, dist: number): Ponto | null {
  const base = Math.atan2(an.x - de.x, an.z - de.z);
  for (const desvio of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3]) {
    const a = base + desvio, x = an.x + Math.sin(a) * dist, z = an.z + Math.cos(a) * dist;
    if (pisavel(an, x, z)) return { x, z };
  }
  return null;
}

// coelhos correm para o arbusto mais próximo que não fique do lado da ameaça
function arbustoRefugio(an: Animal, de: Ponto | null, raio = 25): Ponto | null {
  let melhor: Ponto | null = null, dMelhor = raio;
  const dAmeaca = de ? distancia(an, de) : 0;
  for (const b of ARBUSTOS) {
    const d = Math.hypot(b.x - an.x, b.z - an.z);
    if (d < dMelhor && (!de || Math.hypot(b.x - de.x, b.z - de.z) > dAmeaca * 0.8)) { dMelhor = d; melhor = { x: b.x, z: b.z }; }
  }
  return melhor;
}

function arvoreAbrigo(an: Animal, raio: number): Ponto | null {
  let melhor: Ponto | null = null, dMelhor = raio;
  for (const t of ARVORES) {
    const d = Math.hypot(t.x - an.x, t.z - an.z);
    if (d < dMelhor) {
      const ang = Math.atan2(an.x - t.x, an.z - t.z), r = t.r + PERFIS[an.especie].raio + 0.5;
      const x = t.x + Math.sin(ang) * r, z = t.z + Math.cos(ang) * r;
      if (terraSeca(x, z)) { dMelhor = d; melhor = { x, z }; }
    }
  }
  return melhor;
}

// procura a melhor área para comer numa grade (pasto ou raízes)
function melhorArea(an: Animal, ctx: Contexto, grade: number[]): Ponto | null {
  const g = ctx.grupos.get(an.grupo);
  let melhor: Ponto | null = null, nota = -Infinity;
  for (let k = 0; k < 10; k++) {
    const ang = ctx.rand() * Math.PI * 2, d = 3 + ctx.rand() * 30;
    const x = an.x + Math.cos(ang) * d, z = an.z + Math.sin(ang) * d;
    const c = celulaPasto(x, z);
    if (c < 0 || grade[c] < 0 || !terraSeca(x, z)) continue;
    let n = grade[c] - d / 80;
    if (g && g.lider !== an) n -= Math.hypot(x - g.x, z - g.z) / 60;
    for (const l of an.lugares) if (l.tipo === 'perigo' && Math.hypot(l.x - x, l.z - z) < 20) n -= 0.5 * l.forca;
    if (n > nota) { nota = n; melhor = { x, z }; }
  }
  return melhor;
}

// o inverno rapou o pasto daqui: procura no vale uma área bem melhor
function destinoDeMigracao(an: Animal, ctx: Contexto): Ponto | null {
  const aqui = pastoEmVolta(ctx, an.x, an.z);
  let melhor: Ponto | null = null, nota = aqui + 0.25;
  for (let k = 0; k < 60; k++) {
    const x = (ctx.rand() - 0.5) * 360, z = (ctx.rand() - 0.5) * 360;
    if (!terraSeca(x, z)) continue;
    const perigo = an.lugares.some(l => l.tipo === 'perigo' && Math.hypot(l.x - x, l.z - z) < 25) ? 0.3 : 0;
    const n = pastoEmVolta(ctx, x, z) - Math.hypot(x - an.x, z - an.z) / 600 - perigo;
    if (n > nota) { nota = n; melhor = { x, z }; }
  }
  return melhor;
}

const marcaAlheiaPerto = (an: Animal, ctx: Contexto, x: number, z: number) =>
  ctx.marcas.some(m => m.grupo !== an.grupo && Math.hypot(m.x - x, m.z - z) < 25);

const cacadasConhecidas = (an: Animal) => an.lugares.some(l => l.tipo === 'comida');

const NOMES_AMEACA: Record<string, string> = { humano: 'um humano', lobo: 'um lobo', javali: 'um javali', cervo: 'um cervo', coelho: 'um coelho' };
const nomeDaAmeaca = (t: string) => NOMES_AMEACA[t] ?? `um ${t}`;

// encurralado, defendendo os filhotes ou machão: o javali enfrenta
function deveEnfrentar(an: Animal, s: Ser, ctx: Contexto) {
  const d = distancia(an, s);
  if (an.corpo.saude < 0.35 || !an.adulto) return false;
  if (!ehAnimal(s) && s.acao === 'dormindo') return false;   // quem dorme não ameaça ninguém
  if (ctx.hora - an.ultimaBriga < 1) return false;            // depois de uma investida, dá um tempo
  const filhotes = ctx.perto(an.x, an.z, 15).some(o => o.vivo && o.mae === an.id && Math.hypot(o.x - an.x, o.z - an.z) < 15);
  return (filhotes && d < 6) || d < 3 || (an.sexo === 'M' && d < 4.5 && an.corpo.saude > 0.6);
}

// ---------- Decisão: instinto + utilidade ----------
function decidir(an: Animal, ctx: Contexto) {
  const p = PERFIS[an.especie], c = an.corpo, e = an.emocoes;
  const mat = maturidade(an, ctx.hora);
  const g = ctx.grupos.get(an.grupo);
  const notas: Partial<Record<ObjetivoAnimal, number>> = {};
  let alvoBriga: string | null = null, motivoBriga: MotivoBriga | null = null;

  // continuar uma briga que ainda está valendo a pena
  if (an.objetivo === 'enfrentar' && an.alvoId && c.saude > 0.45 && ctx.hora - an.inicioCaca < 0.3) {
    const s = ctx.porId.get(an.alvoId);
    if (s && s.vivo && distancia(an, s) < 30) { notas.enfrentar = 5.5; alvoBriga = an.alvoId; motivoBriga = an.motivo; }
  }

  // reflexo de fuga; mas com sede ou fome extremas, só foge de quem está vindo atrás dele
  if (an.ameaca && (e.medo ?? 0) > 0.25) {
    const s = ctx.porId.get(an.ameaca.id);
    const atacandoMe = !!s && (ehAnimal(s) ? s.alvoId === an.id : s.presa === an.id);
    if (p.enfrenta && s && s.vivo && an.ameaca.direta && deveEnfrentar(an, s, ctx)) {
      notas.enfrentar = Math.max(notas.enfrentar ?? 0, 5.2); alvoBriga = s.id; motivoBriga = 'defesa';
    } else notas.fugir = (c.sede > 0.85 || c.fome > 0.95) && !atacandoMe ? 1.3 : 5;
  }
  // rivais: outra matilha, um lobo solitário, outro macho na época de cria
  if (an.rivalVisto && !notas.enfrentar && !notas.fugir) {
    notas.enfrentar = 1.5; alvoBriga = an.rivalVisto.id; motivoBriga = an.rivalVisto.motivo;
  }
  // briga da matilha: ajuda o companheiro contra o rival
  if (p.territorial && an.adulto && !notas.enfrentar && !notas.fugir) {
    for (const o of ctx.perto(an.x, an.z, 30)) {
      if (o === an || !o.vivo || o.grupo !== an.grupo || o.objetivo !== 'enfrentar' || !o.alvoId) continue;
      if (Math.hypot(o.x - an.x, o.z - an.z) < 30) { notas.enfrentar = 1.4; alvoBriga = o.alvoId; motivoBriga = o.motivo; break; }
    }
  }

  notas.beber = Math.pow(c.sede, 1.4) * 1.2 + (c.sede > 0.8 ? 0.8 : 0);   // sede forte fala mais alto
  const engordar = ctx.estacao === 'Outono' && c.gordura < 0.9 ? 0.25 : 0;  // no outono, come além da fome
  if (p.dieta !== 'carne') notas.comer = Math.pow(c.fome, 1.3) + engordar;
  if (p.dieta === 'carne' || p.dieta === 'onivoro') {
    if ((an.alvoCarcaca >= 0 || an.carcacaVista >= 0) && c.fome > 0.15)
      notas.comer = Math.max(notas.comer ?? 0, Math.pow(c.fome, 1.2) + 0.25 + engordar);
  }
  if (p.dieta === 'carne') {
    if (an.presaVista && c.fome > 0.3) notas.cacar = Math.pow(c.fome, 1.2) * 1.1 + (e.excitacao ?? 0) * 0.2;
    // caçar em grupo: entra na caçada de um companheiro de matilha
    if (mat >= 0.3 && c.fome > 0.2 && an.objetivo !== 'cacar') {
      for (const o of ctx.perto(an.x, an.z, 40)) {
        if (o === an || !o.vivo || o.grupo !== an.grupo || o.objetivo !== 'cacar' || !o.alvoId) continue;
        if (Math.hypot(o.x - an.x, o.z - an.z) < 40) { notas.cacar = Math.max(notas.cacar ?? 0, 0.75); an.presaVista = o.alvoId; break; }
      }
    }
  }
  notas.dormir = horaDeDormir(p, ctx) ? c.sono * 1.2 : c.sono > 0.85 ? c.sono * 0.6 : 0;
  notas.descansar = Math.pow(1 - c.energia, 2) * 1.2;
  // chuva, tempestade ou frio: procurar abrigo (e ficar lá enquanto durar)
  notas.abrigar = p.aquatico ? 0 : ctx.chuva * 0.7 + ctx.tempestade * 0.8 + c.frio * 0.6;
  if (p.aquatico) notas.beber = 0;

  const mae = an.mae ? ctx.porId.get(an.mae) : undefined;
  if (mae && mae.vivo && mat < 0.5) {
    const d = distancia(an, mae);
    if (d > 4) notas.seguir = 0.9;
  } else if (g && g.lider !== an) {
    const d = distancia(an, g.lider);
    if (d > p.coesao) notas.seguir = Math.min(0.8, (d - p.coesao) / 15 + 0.3);
  }
  // indo beber ou comer com necessidade de verdade: não larga a viagem para correr atrás do grupo
  if (notas.seguir && ((an.objetivo === 'beber' && c.sede > 0.3) || (an.objetivo === 'comer' && c.fome > 0.3)) && (!mae || mat >= 0.3))
    notas.seguir *= 0.3;
  if (an.dispersao) notas.dispersar = 0.6;

  // migração: o líder da manada leva o grupo para onde há pasto
  if (p.migraNoInverno && (!g || g.lider === an) && an.adulto) {
    if (an.objetivo === 'migrar' && an.destino) notas.migrar = 0.7;
    else if (ctx.hora - an.migrouEm > 72 && c.fome > 0.3) {
      const aqui = pastoEmVolta(ctx, an.x, an.z);
      if (aqui < (ctx.estacao === 'Inverno' ? 0.35 : 0.2)) {
        const d = destinoDeMigracao(an, ctx);
        an.migrouEm = ctx.hora;
        if (d) {
          notas.migrar = 0.9;
          if (an.objetivo !== 'migrar') {
            an.objetivo = 'migrar'; definirDestino(an, ctx, d, p.andar);
            ctx.evento(`Uma manada de ${p.plural} partiu em busca de pasto`);
          }
        }
      }
    }
  }
  notas.vagar = 0.15 + ctx.rand() * 0.1;

  // compromisso: recém-começada, uma tarefa só é trocada por algo bem mais forte (ou por uma emergência)
  if (an.objetivo && notas[an.objetivo] !== undefined)
    notas[an.objetivo]! += ctx.hora - an.objetivoDesde < 0.3 ? 0.4 : 0.1;
  let escolha: ObjetivoAnimal = 'vagar';
  for (const k of Object.keys(notas) as ObjetivoAnimal[]) if (notas[k]! > notas[escolha]!) escolha = k;

  if (escolha !== an.objetivo || (escolha === 'enfrentar' && alvoBriga !== an.alvoId)) {
    const destinoMigracao = escolha === 'migrar' ? an.destino : null;
    an.objetivo = escolha; an.destino = destinoMigracao; an.desvio = null; an.objetivoDesde = ctx.hora;
    if (escolha === 'cacar') { an.alvoId = an.presaVista; an.inicioCaca = ctx.hora; an.motivo = null; }
    else if (escolha === 'enfrentar') {
      an.alvoId = alvoBriga; an.motivo = motivoBriga; an.inicioCaca = ctx.hora; an.ultimaBriga = ctx.hora;
      const rivalAntes = alvoBriga ? ctx.porId.get(alvoBriga) : undefined;
      const novidade = !rivalAntes || !ehAnimal(rivalAntes) || ctx.hora - rivalAntes.ultimaBriga > 12;
      if (rivalAntes && ehAnimal(rivalAntes) && motivoBriga !== 'defesa') rivalAntes.ultimaBriga = ctx.hora;
      if (motivoBriga === 'expulsar') { if (novidade) ctx.evento('A matilha foi para cima de um lobo solitário'); }
      else if (motivoBriga === 'rival') { if (novidade) ctx.evento('Duas matilhas de lobos se enfrentaram'); }
      else if (motivoBriga === 'disputa') ctx.evento(`Dois ${p.plural} machos disputam a manada`);
      else if (motivoBriga === 'defesa' && an.especie === 'javali') {
        const s = alvoBriga ? ctx.porId.get(alvoBriga) : undefined;
        if (s) ctx.evento(`Um javali investiu contra ${ehAnimal(s) ? 'um ' + PERFIS[s.especie].nome : (s as Agente).nome}`);
      }
      // quem é desafiado para uma disputa aceita
      const rival = alvoBriga ? ctx.porId.get(alvoBriga) : undefined;
      if (motivoBriga === 'disputa' && rival && ehAnimal(rival) && rival.objetivo !== 'enfrentar') {
        rival.objetivo = 'enfrentar'; rival.alvoId = an.id; rival.motivo = 'disputa'; rival.inicioCaca = ctx.hora; rival.destino = null;
        rival.ultimaBriga = ctx.hora;
      }
    } else if (an.objetivo !== 'enfrentar') { an.motivo = null; }
    if (escolha === 'comer' && an.alvoCarcaca < 0) an.alvoCarcaca = an.carcacaVista;
    if (an.acao === 'escondido' && escolha !== 'fugir' && escolha !== 'abrigar') an.acao = 'parado';
  }
}

// ---------- Execução ----------
function comerCarcaca(an: Animal, ctx: Contexto, p: PerfilEspecie, andar: number): boolean {
  const k = ctx.carcacas.find(x => x.id === an.alvoCarcaca && x.porcoes > 0);
  if (!k) { an.alvoCarcaca = -1; return false; }
  const c = an.corpo;
  if (Math.hypot(k.x - an.x, k.z - an.z) > p.raio + 0.9) {
    const r = mover(an, k, andar * 1.3, ctx, p.raio + 0.8);
    an.acao = 'andando'; an.intencao = `indo comer a carcaça de um ${PERFIS[k.especie].nome}`;
    if (r === 'bloqueado') { an.alvoCarcaca = -1; an.objetivo = null; }
    return true;
  }
  k.porcoes--;
  if (c.fome < 0.3) c.gordura = lim(c.gordura + (ctx.estacao === 'Outono' ? 0.08 : 0.04));
  c.fome = Math.max(0, c.fome - p.saciedade);
  an.acao = 'comendo'; an.intencao = `comendo um ${PERFIS[k.especie].nome}${estragada(k, ctx.hora) ? ' (já estragado)' : ''}`;
  an.rotacao = Math.atan2(k.x - an.x, k.z - an.z);
  an.ocupadoAte = ctx.hora + 0.12;
  if (c.fome < 0.1 && (ctx.estacao !== 'Outono' || c.gordura > 0.9)) { an.objetivo = null; an.alvoCarcaca = -1; }
  return true;
}

// uma bocada de pasto ou de raízes; devolve false se ali não tem o bastante
function bocada(an: Animal, ctx: Contexto, p: PerfilEspecie, grade: number[], fucando: boolean): boolean {
  const cel = celulaPasto(an.x, an.z);
  if (cel < 0 || grade[cel] < 0.15) return false;
  const c = an.corpo;
  an.acao = fucando ? 'fucando' : 'comendo';
  an.intencao = fucando ? 'fuçando o solo atrás de raízes' : p.voa ? 'bicando sementes no chão'
    : c.fome < 0.2 && ctx.estacao === 'Outono' ? 'engordando para o inverno' : 'pastando';
  if (c.fome < 0.3) c.gordura = lim(c.gordura + (ctx.estacao === 'Outono' ? 0.04 : 0.015));
  c.fome = Math.max(0, c.fome - p.saciedade);
  grade[cel] = Math.max(0, grade[cel] - p.consumoPasto);
  if (fucando && ctx.pasto[cel] > 0) ctx.pasto[cel] = Math.max(0, ctx.pasto[cel] - 0.02);   // fuçar revira o capim
  an.ocupadoAte = ctx.hora + 0.1;
  if (grade[cel] > 0.5) lembrarLugar(an, 'comida', an.x, an.z);
  if (c.fome < 0.1 && (ctx.estacao !== 'Outono' || c.gordura > 0.9)) an.objetivo = null;
  return true;
}

function executar(an: Animal, ctx: Contexto) {
  const p = PERFIS[an.especie], c = an.corpo, e = an.emocoes;
  const mat = maturidade(an, ctx.hora);
  const andar = velocidade(an, p, false, mat), correr = velocidade(an, p, true, mat);
  const parar = (intencao: string) => { an.acao = 'parado'; an.intencao = intencao; };
  const semDestino = () => !an.destino || ctx.hora > an.prazo;

  switch (an.objetivo) {
    case 'fugir': {
      const t = an.ameaca;
      if (!t || (e.medo ?? 0) < 0.25) { an.ameaca = null; an.objetivo = null; an.destino = null; parar('se acalmando'); return; }
      if (an.acao === 'escondido') { an.intencao = `escondido, com medo de ${nomeDaAmeaca(t.tipo)}`; return; }
      if (!an.destino || distancia(an, an.destino) < 1) {
        const refugio = an.especie === 'coelho' ? arbustoRefugio(an, t) : null;
        definirDestino(an, ctx, refugio ?? pontoDeFuga(an, t, 20), correr);
        if (!an.destino) { parar('encurralado'); return; }
      }
      const r = mover(an, an.destino!, correr, ctx);
      an.acao = r === 'andando' ? 'correndo' : 'parado';
      an.intencao = `fugindo de ${nomeDaAmeaca(t.tipo)}`;
      if (r === 'chegou' && an.especie === 'coelho' && ARBUSTOS.some(b => Math.hypot(b.x - an.x, b.z - an.z) < 1)) {
        an.acao = 'escondido'; an.intencao = 'escondido num arbusto';
      } else if (r !== 'andando') an.destino = null;
      return;
    }

    case 'enfrentar': {
      const alvo = an.alvoId ? ctx.porId.get(an.alvoId) : undefined;
      const encerrar = (motivo: string) => { an.alvoId = null; an.motivo = null; an.objetivo = null; an.destino = null; parar(motivo); };
      if (!alvo || !alvo.vivo) return encerrar('venceu a briga');
      const d = distancia(an, alvo);
      // o rival fugiu para longe ou a briga já durou demais
      if (d > (an.motivo === 'defesa' ? 8 : 30) || ctx.hora - an.inicioCaca > 0.3 || c.energia < 0.1)
        return encerrar(an.motivo === 'defesa' ? 'afugentou o perigo' : 'o rival se foi');
      const raioAlvo = ehAnimal(alvo) ? PERFIS[alvo.especie].raio : RAIO_HUMANO;
      const nomeAlvo = ehAnimal(alvo) ? 'um ' + PERFIS[alvo.especie].nome : (alvo as Agente).nome;
      const verbo = an.motivo === 'defesa' ? 'investindo contra' : an.motivo === 'disputa' ? 'disputando com' :
        an.motivo === 'expulsar' ? 'expulsando' : 'enfrentando';
      an.intencao = `${verbo} ${an.motivo === 'expulsar' ? 'um lobo solitário' : nomeAlvo}`;
      if (d <= p.raio + raioAlvo + 0.5) {
        an.acao = 'atacando';
        an.rotacao = Math.atan2(alvo.x - an.x, alvo.z - an.z);
        an.ocupadoAte = ctx.hora + 0.02;
        if (ctx.rand() < 0.5) {
          const dano = an.especie === 'javali' ? (ehAnimal(alvo) ? 0.15 : 0.08) : an.motivo === 'disputa' ? 0.06 : 0.08;
          if (ehAnimal(alvo)) ferirAnimal(alvo, dano, { id: an.id, x: an.x, z: an.z, tipo: an.especie }, ctx);
          else ferirAgente(alvo, dano, an, ctx);
          // na defesa, é uma investida só: acerta e recua (a não ser que o perigo continue encostado)
          if (an.motivo === 'defesa') { an.ocupadoAte = ctx.hora + 0.1; return encerrar('recuou depois da investida'); }
        }
        return;
      }
      mover(an, alvo, correr, ctx);
      an.acao = 'correndo';
      return;
    }

    case 'beber': {
      if (an.acao === 'bebendo') {
        c.sede = Math.max(0, c.sede - 0.5);
        an.ocupadoAte = ctx.hora + 0.08;
        if (c.sede < 0.1) { an.objetivo = null; parar('matou a sede'); }
        return;
      }
      if (semDestino()) {
        let melhor: LugarLembrado | null = null, custo = Infinity;
        for (const l of an.lugares) {
          if (l.tipo !== 'agua') continue;
          const k = distancia(an, l) / Math.max(0.1, l.forca);
          if (k < custo) { custo = k; melhor = l; }
        }
        definirDestino(an, ctx, melhor ? { x: melhor.x, z: melhor.z } : pontoPara(an, an.x, an.z, ctx.rand, 30, 60), andar);
        an.intencao = melhor ? 'indo beber água' : 'procurando água';
        if (!an.destino) { parar('procurando água'); return; }
      }
      const r = mover(an, an.destino!, andar, ctx);
      an.acao = 'andando';
      if (r !== 'andando') {
        if (pertoDaAgua(an.x, an.z)) {
          an.acao = 'bebendo'; an.intencao = 'bebendo água';
          const w = procurarAgua(an.x, an.z, 6);
          if (w) lembrarLugar(an, 'agua', w.x, w.z);
        } else {
          for (const l of an.lugares) if (l.tipo === 'agua' && distancia(l, an.destino!) < 3) l.forca -= 0.5;
          an.lugares = an.lugares.filter(l => l.forca > 0);
        }
        an.destino = null;
      }
      return;
    }

    case 'comer': {
      if (p.aquatico) {
        c.fome = Math.max(0, c.fome - p.saciedade);
        an.acao = 'comendo'; an.intencao = 'comendo algas';
        an.ocupadoAte = ctx.hora + 0.1;
        if (c.fome < 0.1) an.objetivo = null;
        return;
      }
      const comeCarne = p.dieta === 'carne' || p.dieta === 'onivoro';
      if (comeCarne && an.alvoCarcaca < 0 && an.carcacaVista >= 0) an.alvoCarcaca = an.carcacaVista;
      if (comeCarne && an.alvoCarcaca >= 0 && comerCarcaca(an, ctx, p, andar)) return;
      if (p.dieta === 'carne') { an.objetivo = null; parar('farejando'); return; }

      // onívoros e pássaros: frutos dos arbustos
      if ((p.dieta === 'onivoro' || p.dieta === 'graos') && an.arbustoVisto >= 0 && ctx.frutos[an.arbustoVisto] > 0) {
        const b = ARBUSTOS[an.arbustoVisto];
        if (Math.hypot(b.x - an.x, b.z - an.z) > 1.4) {
          const r = mover(an, b, andar, ctx, 1.2);
          an.acao = 'andando'; an.intencao = p.voa ? 'voando até um arbusto com frutos' : 'farejando frutos';
          if (r === 'bloqueado') an.arbustoVisto = -1;
          return;
        }
        ctx.frutos[an.arbustoVisto]--;
        if (c.fome < 0.3) c.gordura = lim(c.gordura + (ctx.estacao === 'Outono' ? 0.05 : 0.02));
        c.fome = Math.max(0, c.fome - (p.voa ? 0.5 : 0.25));
        an.acao = 'comendo'; an.intencao = p.voa ? 'bicando frutos' : 'comendo frutos de um arbusto';
        an.rotacao = Math.atan2(b.x - an.x, b.z - an.z);
        an.ocupadoAte = ctx.hora + 0.08;
        if (c.fome < 0.1 && (ctx.estacao !== 'Outono' || c.gordura > 0.9)) an.objetivo = null;
        return;
      }

      const grade = p.dieta === 'onivoro' ? ctx.raizes : ctx.pasto;
      if (!an.destino && bocada(an, ctx, p, grade, p.dieta === 'onivoro')) return;
      if (semDestino()) {
        definirDestino(an, ctx, melhorArea(an, ctx, grade), andar);
        an.intencao = p.dieta === 'onivoro' ? 'farejando o chão' : 'procurando pasto';
        if (!an.destino) { parar(an.intencao); return; }
      }
      const r = mover(an, an.destino!, andar, ctx);
      an.acao = 'andando';
      if (r !== 'andando') an.destino = null;
      return;
    }

    case 'cacar': {
      const alvo = an.alvoId ? ctx.porId.get(an.alvoId) : undefined;
      const desistir = (motivo: string) => { an.alvoId = null; an.objetivo = null; an.destino = null; parar(motivo); };
      if (!alvo || !alvo.vivo) {
        // a presa morreu (talvez pelas mordidas de outro lobo): procura a carcaça
        if (an.carcacaVista >= 0) { an.alvoCarcaca = an.carcacaVista; an.objetivo = 'comer'; return; }
        return desistir('farejando');
      }
      const d = Math.hypot(alvo.x - an.x, alvo.z - an.z);
      const visao = p.visaoNoite + (p.visaoDia - p.visaoNoite) * ctx.luz;
      if ((ehAnimal(alvo) && oculto(alvo) && d > 2) || d > visao * 1.3) return desistir('perdeu a presa de vista');
      if (ctx.hora - an.inicioCaca > 1 || c.energia < 0.1) return desistir('desistiu da caçada');
      const raioAlvo = ehAnimal(alvo) ? PERFIS[alvo.especie].raio : RAIO_HUMANO;
      const nomeAlvo = ehAnimal(alvo) ? PERFIS[alvo.especie].nome : (alvo as Agente).nome;
      if (d <= p.raio + raioAlvo + 0.6) {
        an.acao = 'atacando'; an.intencao = `atacando ${ehAnimal(alvo) ? 'um ' + nomeAlvo : nomeAlvo}`;
        an.rotacao = Math.atan2(alvo.x - an.x, alvo.z - an.z);
        an.ocupadoAte = ctx.hora + 0.015;
        if (!ehAnimal(alvo)) {
          if (ctx.rand() < 0.5) ferirAgente(alvo, 0.12, an, ctx);
          return;
        }
        const acerto = alvo.especie === 'coelho' ? 0.5 : 0.4;
        if (ctx.rand() < acerto) {
          const dano = alvo.especie === 'coelho' ? 1 : 0.2 * (1.5 - maturidade(alvo, ctx.hora));
          const k = ferirAnimal(alvo, dano, { id: an.id, x: an.x, z: an.z, tipo: 'lobo' }, ctx);
          if (k) {
            an.alvoId = null; an.alvoCarcaca = k.id; an.objetivo = 'comer';
            // o território vai se deslocando para onde há caça
            const g = ctx.grupos.get(an.grupo);
            if (g?.lider.territorio) { const t = g.lider.territorio; t.x += (k.x - t.x) * 0.15; t.z += (k.z - t.z) * 0.15; }
          }
        }
        return;
      }
      // espreita andando e só dispara na reta final
      const correndo = d < 18;
      mover(an, alvo, correndo ? correr : andar * 1.2, ctx);
      an.acao = correndo ? 'correndo' : 'andando';
      an.intencao = `${correndo ? 'perseguindo' : 'espreitando'} ${ehAnimal(alvo) ? 'um ' + nomeAlvo : nomeAlvo}`;
      return;
    }

    case 'dormir': {
      // pássaros dormem no chão debaixo de uma árvore
      if (p.voa && !an.abrigado && an.acao !== 'dormindo') {
        if (semDestino()) definirDestino(an, ctx, arvoreAbrigo(an, 60), andar);
        if (an.destino) {
          const r = mover(an, an.destino, andar, ctx, 0.6);
          an.acao = 'andando'; an.intencao = 'voando para debaixo de uma árvore para passar a noite';
          if (r !== 'andando') { an.destino = null; an.abrigado = embaixoDeArvore(an.x, an.z) || r === 'chegou'; }
          return;
        }
      }
      // no frio, dorme encostado no grupo
      const g = ctx.grupos.get(an.grupo);
      if (c.frio > 0.2 && !an.amontoado && g && g.n > 1 && an.acao !== 'dormindo') {
        let perto: Animal | null = null, dp = 15;
        for (const o of ctx.perto(an.x, an.z, 15)) {
          if (o === an || !o.vivo || o.grupo !== an.grupo) continue;
          const d = distancia(an, o);
          if (d < dp) { dp = d; perto = o; }
        }
        if (perto && dp > 1.2) {
          mover(an, perto, andar, ctx, 1);
          an.acao = 'andando'; an.intencao = 'procurando o grupo para dormir junto';
          return;
        }
      }
      an.acao = 'dormindo';
      an.intencao = an.especie === 'coelho' ? 'dormindo na toca' : p.aquatico ? 'descansando no fundo' : p.voa ? 'dormindo no chão, debaixo de uma árvore' : an.amontoado && c.frio > 0.1 ? 'dormindo amontoado com o grupo' : 'dormindo';
      an.destino = null;
      return;
    }

    case 'abrigar': {
      if (an.abrigado) {
        if (p.abrigo === 'arbusto') an.acao = 'escondido';
        else if (an.acao !== 'escondido') an.acao = 'parado';
        an.intencao = ctx.tempestade > 0.3 ? 'abrigado da tempestade' : ctx.chuva > 0.2 ? 'abrigado da chuva' : 'abrigado do frio';
        an.destino = null;
        return;
      }
      if (semDestino()) {
        definirDestino(an, ctx, p.abrigo === 'arbusto' ? arbustoRefugio(an, null, 30) : arvoreAbrigo(an, 40), andar);
        if (!an.destino) { parar(ctx.chuva > 0.2 ? 'tomando chuva, sem abrigo' : 'encolhido de frio'); return; }
      }
      const r = mover(an, an.destino!, ctx.tempestade > 0.3 ? correr * 0.6 : andar, ctx, 0.6);
      an.acao = 'andando'; an.intencao = 'procurando abrigo';
      if (r !== 'andando') {
        an.destino = null;
        an.abrigado = p.abrigo === 'arbusto' ? ARBUSTOS.some(b => Math.hypot(b.x - an.x, b.z - an.z) < 1.2) : embaixoDeArvore(an.x, an.z);
        if (an.abrigado && p.abrigo === 'arbusto') an.acao = 'escondido';
      }
      return;
    }

    case 'descansar':
      parar('descansando');
      if (c.energia > 0.8) an.objetivo = null;
      return;

    case 'seguir': {
      const mae = an.mae ? ctx.porId.get(an.mae) : undefined;
      const quem = mae && mae.vivo && mat < 0.5 ? mae : ctx.grupos.get(an.grupo)?.lider;
      if (!quem || quem === an) { an.objetivo = null; return; }
      const r = mover(an, quem, distancia(an, quem) > 12 ? Math.max(andar, correr * 0.5) : andar, ctx, 2.5);
      an.acao = r === 'andando' ? 'andando' : 'parado';
      const liderMigrando = ehAnimal(quem) && quem.objetivo === 'migrar';
      an.intencao = quem === mae ? 'seguindo a mãe' : liderMigrando ? 'migrando com a manada' :
        p.social === 'matilha' ? 'seguindo a matilha' : 'seguindo o grupo';
      if (r !== 'andando') an.objetivo = null;
      return;
    }

    case 'migrar': {
      if (semDestino()) { an.objetivo = null; an.migrouEm = ctx.hora; return; }
      const r = mover(an, an.destino!, andar, ctx, 3);
      an.acao = 'andando'; an.intencao = 'levando a manada em busca de pasto';
      if (r !== 'andando') { an.destino = null; an.objetivo = null; an.migrouEm = ctx.hora; parar('chegou a um pasto novo'); }
      return;
    }

    case 'dispersar': {
      if (!an.dispersao) { an.objetivo = null; return; }
      if (!an.destino) definirDestino(an, ctx, an.dispersao, andar);
      const r = ctx.hora > an.prazo ? 'bloqueado' : mover(an, an.destino!, andar, ctx);
      an.acao = 'andando'; an.intencao = 'procurando um território novo';
      if (r !== 'andando') { an.destino = null; an.dispersao = null; an.objetivo = null; }
      return;
    }

    case 'vagar':
    default: {
      const g = ctx.grupos.get(an.grupo);
      const lider = !g || g.lider === an;
      // lobo que lidera: marca o território de tempos em tempos
      if (p.territorial && lider && an.adulto) {
        an.territorio ??= { x: an.x, z: an.z };
        if (ctx.hora - an.ultimaMarca > 3 && !an.destino) {
          ctx.marcas.push({ grupo: an.grupo, x: an.x, z: an.z, desde: ctx.hora });
          an.ultimaMarca = ctx.hora;
          parar('marcando o território'); an.ocupadoAte = ctx.hora + 0.05;
          return;
        }
      }
      if (semDestino()) {
        const cacadas = p.dieta === 'carne' && c.fome > 0.3 ? an.lugares.filter(l => l.tipo === 'comida') : [];
        const lugar = cacadas[Math.floor(ctx.rand() * cacadas.length)];
        let d: Ponto | null = null;
        if ('curiosidade' in e && an.curiosoDe && (e.curiosidade ?? 0) > 0.4 && ctx.rand() < 0.5) {
          d = pontoPara(an, an.curiosoDe.x, an.curiosoDe.z, ctx.rand, 3, 6);
          if (d) an.intencao = 'curioso, farejando de perto';
        }
        if (!d && lugar && lider) d = pontoPara(an, lugar.x, lugar.z, ctx.rand, 0, 12);
        if (!d && !lider) d = pontoPara(an, g!.lider.x, g!.lider.z, ctx.rand, 2, p.coesao * 0.6);
        if (!d && an.territorio) {
          // dentro do próprio território, evitando o cheiro de outras matilhas (com muita fome, arrisca)
          for (let t = 0; t < 6 && !d; t++) {
            const q = pontoPara(an, an.territorio.x, an.territorio.z, ctx.rand, 5, 70);
            if (q && (c.fome > 0.7 || !marcaAlheiaPerto(an, ctx, q.x, q.z))) d = q;
          }
        }
        if (!d) d = pontoPara(an, an.x, an.z, ctx.rand, 8, p.dieta === 'carne' ? 70 : 30);
        definirDestino(an, ctx, d, andar);
        if (!an.destino) { parar('olhando em volta'); return; }
      }
      const r = mover(an, an.destino!, andar, ctx);
      an.acao = 'andando';
      if (an.intencao !== 'curioso, farejando de perto')
        an.intencao = p.dieta === 'carne' ? (cacadasConhecidas(an) && c.fome > 0.3 ? 'indo a um lugar de caça' : 'rondando o território') : 'andando por aí';
      if (r !== 'andando') {
        an.destino = null; parar('olhando em volta');
        an.ocupadoAte = ctx.hora + ctx.rand() * (p.voa ? 0.6 : 0.2);   // pássaro pousa e fica um tempo no chão
      }
    }
  }
}

// ---------- Passo de vida ----------
export function atualizarAnimal(an: Animal, ctx: Contexto) {
  if (!an.vivo) return;
  const p = PERFIS[an.especie];
  const mat = maturidade(an, ctx.hora);

  atualizarCorpo(an, p, ctx, mat);
  amamentar(an, ctx, mat);
  sentir(an, ctx);
  for (const l of an.lugares) l.forca -= ctx.horas / (24 * 30);   // lembra de um lugar por ~1 mês
  if (an.lugares.some(l => l.forca <= 0)) an.lugares = an.lugares.filter(l => l.forca > 0);

  if (an.corpo.saude <= 0) { morrerAnimal(an, causaNatural(an, ctx.hora), ctx); return; }
  if (an.parto > 0 && ctx.hora >= an.parto) parir(an, ctx);

  // ao virar adulto, larga a mãe; se o grupo está cheio, sai para formar outro
  if (!an.adulto && mat >= 1) {
    an.adulto = true; an.mae = null;
    const g = ctx.grupos.get(an.grupo);
    if (g && g.n > p.grupoMax) {
      an.grupo = ctx.novoId('g');
      partir(an, ctx, 60, 150);
      if (p.social === 'matilha') ctx.evento('Um lobo jovem deixou a matilha');
    }
  }

  const reagir = --an.proximaDecisao <= 0;
  if (reagir) { an.proximaDecisao = 5; perceber(an, ctx); }
  // peixe fora d'água (não deveria acontecer): volta para a água funda mais próxima
  if (p.aquatico && reagir && !naAgua(an.x, an.z)) { voltarParaAgua(an); an.y = Math.max(heightAt(an.x, an.z) + 0.15, WATER_LEVEL - 0.2); }

  if (ctx.hora < an.ocupadoAte) return;

  if (an.acao === 'dormindo') {
    const c = an.corpo;
    const acordar = c.sede > 0.85 || c.fome > 0.9 || (an.ameaca !== null && (an.emocoes.medo ?? 0) > 0.3) ||
      (c.sono < 0.05 && !horaDeDormir(p, ctx));
    if (!acordar) return;
    an.acao = 'parado'; an.objetivo = null;
  }

  if (reagir) decidir(an, ctx);
  const ax = an.x, az = an.z;
  executar(an, ctx);
  if (p.voa) altitude(an, an.x - ax, an.z - az);
  if (p.aquatico) an.y = Math.max(heightAt(an.x, an.z) + 0.15, WATER_LEVEL - 0.2);   // nadando logo abaixo da superfície
}

function voltarParaAgua(an: Animal) {
  for (let r = 2; r <= 200; r += 3) for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2, x = an.x + Math.cos(ang) * r, z = an.z + Math.sin(ang) * r;
    if (naAgua(x, z)) { an.x = x; an.z = z; an.destino = null; an.desvio = null; return; }
  }
}

// pássaros: só ficam no ar enquanto se deslocam de verdade (batendo as asas);
// parados — comendo, descansando, abrigados ou dormindo — ficam sempre no chão
function altitude(an: Animal, dx: number, dz: number) {
  const chao = Math.max(heightAt(an.x, an.z), WATER_LEVEL);
  // fazendo algo parado (comendo, bebendo, dormindo, descansando): já está no chão
  if (an.acao !== 'andando' && an.acao !== 'correndo') { an.vooX = 0; an.vooZ = 0; an.y = chao; return; }
  // média móvel do deslocamento: ir e voltar no mesmo lugar se anula e não conta como voo
  an.vooX = an.vooX * 0.6 + dx * 0.4; an.vooZ = an.vooZ * 0.6 + dz * 0.4;
  if (Math.hypot(an.vooX, an.vooZ) > 0.12) {   // acima de ~1,2 m/s é voo; abaixo, pulinhos no chão
    if (an.acao !== 'correndo') an.acao = 'andando';
    an.y = chao + (an.acao === 'correndo' ? 7 : 4.5);
    return;
  }
  // pulinhos no chão continuam contando como andar; sem sair do lugar, parado
  if (Math.hypot(dx, dz) < 0.005 && an.acao === 'andando') an.acao = 'parado';
  an.y = chao;
}
