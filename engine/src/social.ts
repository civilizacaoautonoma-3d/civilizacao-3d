// Relações, comunicação e protolinguagem (Fase 11, documentação seções 14 e 14.1).
// Ninguém nasce falando. Quem quer se referir a algo (água, perigo, alguém) inventa um som e aponta.
// Se o outro está vendo a mesma coisa, a associação som -> coisa se reforça nos dois; se não, enfraquece
// ("naming game"). Com o tempo o grupo converge para as mesmas palavras — ou não.
// Entendida, uma palavra passa informação: um aviso de perigo, onde tem água, "vem cá".
// As relações (afeto, confiança, respeito, medo, ressentimento, dívida) nascem do que acontece entre eles.
import { ARBUSTOS, CAVERNAS } from '../../shared/mundo';
import { PERFIS, type Especie } from '../../shared/especies';
import type { Contexto } from './contexto';
import type { Agente } from './agente';
import { ev, lembrar, sinta } from './agente';
import { fogosPerto } from './objetos';
import { pertoDaAgua } from './espaco';
import { atualizarAtracao, ehBebe, ehCrianca, formamPar, idadeDias } from './vida';
import { conhece, conhecer } from './comunidades';

export interface Relacao {
  afeto: number; confianca: number; respeito: number; medo: number; ressentimento: number; divida: number;
  convivencia: number;   // horas passadas juntos
  atracao?: number;       // Fase 12: entre jovens/adultos de sexos diferentes
  infanciaJuntos?: number; // horas de convivência quando um dos dois era criança (gera aversão, não atração)
}
export interface Fala { palavras: string[]; conceitos: string[]; quando: number; apontando: { x: number; z: number } | null }
export interface Dica { conceito: string; x: number; z: number; de: string; ate: number }
export interface EstadoSocial {
  relacoes: Record<string, Relacao>;
  lexico: Record<string, Record<string, number>>;   // conceito -> palavra -> força (0..1)
  falouEm: Record<string, number>;                  // conceito -> quando falou dele por último
  fala: Fala | null;                                // o que disse por último (o visualizador mostra)
  ouviu: { de: string; palavras: string[]; entendeu: (string | null)[]; quando: number }[];
  dicas: Dica[];                                    // o que o outro indicou e ainda não conferiu
  chamadoPor: { id: string; ate: number } | null;
  compartilhadas: string[];                         // conceitos em que já percebeu usar a mesma palavra do outro
  contagem: { falas: number; entendidas: number; desencontros: number; avisos: number; dicasCertas: number; dicasErradas: number };
  deuComida?: number; recebeuComida?: number;       // partilha
  estranhosVistos?: number;                         // Fase 13: pessoas de fora do grupo que já viu
  vozEstranha?: number;                             // última vez que ouviu uma voz que não conhecia
}

export const novoEstadoSocial = (): EstadoSocial => ({
  relacoes: {}, lexico: {}, falouEm: {}, fala: null, ouviu: [], dicas: [], chamadoPor: null, compartilhadas: [],
  contagem: { falas: 0, entendidas: 0, desencontros: 0, avisos: 0, dicasCertas: 0, dicasErradas: 0 },
});

const lim = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export function relacao(a: Agente, id: string): Relacao {
  return a.social.relacoes[id] ??= { afeto: 0, confianca: 0.3, respeito: 0, medo: 0, ressentimento: 0, divida: 0, convivencia: 0 };
}
// ler sem criar: quem ele não conhece não tem relação (vale tudo zero)
const NENHUMA: Relacao = Object.freeze({ afeto: 0, confianca: 0, respeito: 0, medo: 0, ressentimento: 0, divida: 0, convivencia: 0 }) as Relacao;
export const lerRelacao = (a: Agente, id: string): Relacao => a.social.relacoes[id] ?? NENHUMA;

export function mudarRelacao(a: Agente, outro: Agente, mudanca: Partial<Omit<Relacao, 'convivencia'>>) {
  const r = relacao(a, outro.id);
  // laço positivo cresce cada vez mais devagar perto do máximo (confiança plena leva muito tempo)
  for (const [k, v] of Object.entries(mudanca) as [keyof Relacao, number][])
    r[k] = lim((r[k] ?? 0) + (v > 0 && (k === 'afeto' || k === 'confianca' || k === 'respeito') ? v * (1 - Math.max(0, r[k] ?? 0)) : v), k === 'afeto' ? -1 : 0, 1);
}

// ---------- Conceitos e tradução (a tradução é só para quem observa) ----------
export function traduzir(conceito: string, ctx?: { agentes: Agente[] }) {
  if (conceito.startsWith('perigo:')) return `perigo (${PERFIS[conceito.slice(7) as Especie]?.nome ?? conceito.slice(7)})`;
  if (conceito.startsWith('pessoa:')) return ctx?.agentes.find(x => x.id === conceito.slice(7))?.nome ?? 'alguém';
  return ({ agua: 'água', comida: 'comida', carne: 'carne', caverna: 'caverna', fogo: 'fogo', vem: 'vem cá' } as Record<string, string>)[conceito] ?? conceito;
}
// como o próprio agente pensa naquilo (sem nossas palavras): usado no que vai para o LLM
export function conceitoNeutro(conceito: string, nomeNeutro: Record<string, string>, agentes: Agente[], eu: Agente) {
  if (conceito.startsWith('perigo:')) return `perigo (${nomeNeutro[conceito.slice(7)] ?? 'bicho'})`;
  if (conceito.startsWith('pessoa:')) return conceito.slice(7) === eu.id ? 'você mesmo' : 'a outra pessoa';
  return ({ agua: 'água', comida: 'frutos para comer', carne: 'carne de bicho morto', caverna: 'buraco na rocha para dormir',
    fogo: 'a luz quente', vem: 'venha para perto' } as Record<string, string>)[conceito] ?? conceito;
}

// ---------- Léxico ----------
const CONSOANTES = 'ptkmnslrvbdgh', VOGAIS = 'aeiou';
function inventarPalavra(rand: () => number) {
  const silabas = rand() < 0.75 ? 2 : 3;
  let p = '';
  for (let i = 0; i < silabas; i++) p += CONSOANTES[Math.floor(rand() * CONSOANTES.length)] + VOGAIS[Math.floor(rand() * VOGAIS.length)];
  return p;
}
// a palavra que ele usa para aquilo (a mais forte); se não tem nenhuma, inventa
function palavraPara(a: Agente, conceito: string, ctx: Contexto) {
  const l = a.social.lexico[conceito] ??= {};
  let melhor: string | null = null, f = 0;
  for (const [p, v] of Object.entries(l)) if (v > f) { f = v; melhor = p; }
  if (melhor && f > 0.1) return melhor;
  let nova = inventarPalavra(ctx.rand);
  while (interpretar(a, nova)) nova = inventarPalavra(ctx.rand);   // não reaproveita um som que já quer dizer outra coisa
  l[nova] = 0.35;
  return nova;
}
// o que ele entende por aquele som (o conceito mais forte), ou nada
export function interpretar(a: Agente, palavra: string): string | null {
  let melhor: string | null = null, f = 0.15;
  for (const [c, l] of Object.entries(a.social.lexico)) if ((l[palavra] ?? 0) > f) { f = l[palavra]; melhor = c; }
  return melhor;
}
export function melhorPalavra(a: Agente, conceito: string) {
  let melhor: string | null = null, f = 0.1;
  for (const [p, v] of Object.entries(a.social.lexico[conceito] ?? {})) if (v > f) { f = v; melhor = p; }
  return melhor;
}
// reforço com inibição lateral: as outras palavras para a mesma coisa (e a mesma palavra para outras coisas) enfraquecem
function reforcar(a: Agente, conceito: string, palavra: string, delta: number) {
  const l = a.social.lexico[conceito] ??= {};
  l[palavra] = lim((l[palavra] ?? 0) + delta);
  if (delta > 0) {
    for (const p of Object.keys(l)) if (p !== palavra) l[p] = lim(l[p] - delta * 0.5);
    for (const [c, outro] of Object.entries(a.social.lexico)) if (c !== conceito && outro[palavra]) outro[palavra] = lim(outro[palavra] - delta * 0.5);
  }
  for (const p of Object.keys(l)) if (l[p] < 0.02) delete l[p];
}

// ---------- Falar e ouvir ----------
const alcanceVisao = (ctx: Contexto) => 8 + 22 * ctx.luz;

export function falar(a: Agente, ctx: Contexto, conceitos: string[], apontando: { x: number; z: number } | null) {
  const chave = conceitos.join('+');
  if (ctx.hora - (a.social.falouEm[chave] ?? -1e9) < 0.6) return false;
  a.social.falouEm[chave] = ctx.hora;
  const palavras = conceitos.map(c => palavraPara(a, c, ctx));
  a.social.fala = { palavras, conceitos, quando: ctx.hora, apontando };
  a.social.contagem.falas++;
  if (apontando) a.rotacao = Math.atan2(apontando.x - a.x, apontando.z - a.z);
  ev(a, ctx, `disse "${palavras.join(' ')}" (${conceitos.map(c => traduzir(c, ctx)).join(' ')})${apontando ? ', apontando' : ''}`);
  const alcance = (conceitos.some(c => c.startsWith('perigo:')) ? 45 : 35) * (ctx.noite ? 0.8 : 1);
  for (const o of ctx.agentes) {
    if (o === a || !o.vivo || o.acao === 'dormindo' || ehBebe(o, ctx.hora) || Math.hypot(o.x - a.x, o.z - a.z) > alcance) continue;
    ouvir(o, a, palavras, conceitos, apontando, ctx);
  }
  return true;
}

function ouvir(o: Agente, f: Agente, palavras: string[], conceitos: string[], ponto: { x: number; z: number } | null, ctx: Contexto) {
  // quem ouve olha: para onde o outro aponta, ou para ele
  const vis = alcanceVisao(ctx);
  if (!conhece(o, f.id)) {
    if (Math.hypot(f.x - o.x, f.z - o.z) < vis) conhecer(o, f, ctx, 'viu');
    else {
      if (ctx.hora - (o.social.vozEstranha ?? -1e9) > 6) { conhecer(o, f, ctx, 'ouviu'); }
      o.social.vozEstranha = ctx.hora;
      o.rotacao = Math.atan2(f.x - o.x, f.z - o.z);
      return;
    }
  }
  const olhar = ponto ?? f;
  if (o.acao !== 'correndo') o.rotacao = Math.atan2(olhar.x - o.x, olhar.z - o.z);
  const r = relacao(o, f.id);
  const entendeu: (string | null)[] = [];
  palavras.forEach((p, i) => {
    const c = conceitos[i];
    const alvo = c.startsWith('pessoa:') ? ctx.agentes.find(x => x.id === c.slice(7)) : null;
    // atenção conjunta: os dois estão diante da mesma coisa?
    const ve = c === 'vem' ? Math.hypot(f.x - o.x, f.z - o.z) < vis
      : alvo ? alvo === o || Math.hypot(alvo.x - o.x, alvo.z - o.z) < vis
      : ponto ? Math.hypot(ponto.x - o.x, ponto.z - o.z) < vis * 1.1 : false;
    const entendido = interpretar(o, p);
    entendeu.push(entendido);
    const jovem = ehCrianca(o, ctx.hora) ? 2 : 1;   // criança aprende a língua do grupo muito mais depressa
    if (ve) {
      if (entendido === c) {
        reforcar(o, c, p, 0.15 * jovem); reforcar(f, c, p, 0.1);
        o.social.contagem.entendidas++; f.social.contagem.entendidas++;
        mudarRelacao(o, f, { confianca: 0.003 }); mudarRelacao(f, o, { afeto: 0.002 });
      } else {
        // desencontro: quem ouve liga o som à coisa que está vendo; quem falou fica menos seguro daquele som
        if (entendido) reforcar(o, entendido, p, -0.12);
        reforcar(o, c, p, (entendido ? 0.12 : 0.25) * jovem);
        reforcar(f, c, p, -0.04);
        o.social.contagem.desencontros++;
      }
      const minha = melhorPalavra(o, c), dele = melhorPalavra(f, c);
      if (minha && minha === dele && !o.social.compartilhadas.includes(c)) {
        o.social.compartilhadas.push(c);
        if (!f.social.compartilhadas.includes(c)) {
          f.social.compartilhadas.push(c);
          ctx.evento(`Primeira palavra em comum entre ${f.nome} e ${o.nome}: "${minha}" (${traduzir(c, ctx)})`);
        }
      }
    } else if (entendido) {
      // não vê, mas entende o som: a informação passa (e pode estar errada, se o som quer dizer outra coisa para ele)
      agirPeloQueOuviu(o, f, entendido, ponto, ctx, r);
    }
  });
  o.social.ouviu.push({ de: f.id, palavras, entendeu, quando: ctx.hora });
  if (o.social.ouviu.length > 6) o.social.ouviu.shift();
}

function agirPeloQueOuviu(o: Agente, f: Agente, conceito: string, ponto: { x: number; z: number } | null, ctx: Contexto, r: Relacao) {
  const credito = 0.4 + 0.6 * r.confianca;
  if (conceito.startsWith('perigo:')) {
    o.social.contagem.avisos++;
    sinta(o, 'medo', 0.25 + 0.45 * credito);
    // se estava indo para aquele lado, desiste
    if (ponto && o.destino && Math.hypot(o.destino.x - ponto.x, o.destino.z - ponto.z) < 25) { o.destino = null; o.objetivo = null; o.rota = null; }
    if (ponto) o.social.dicas.push({ conceito, x: ponto.x, z: ponto.z, de: f.id, ate: ctx.hora + 1 });
    return;
  }
  if (conceito === 'vem') { o.social.chamadoPor = { id: f.id, ate: ctx.hora + 1 }; return; }
  if (!ponto || conceito.startsWith('pessoa:')) return;
  const forca = 0.35 * credito;
  if (conceito === 'agua') lembrar(o, { tipo: 'agua', x: ponto.x, z: ponto.z, ref: -1, frutos: 0, quando: ctx.hora, forca }, ctx);
  else if (conceito === 'comida') {
    let ref = -1, d = 6;
    ARBUSTOS.forEach((b, i) => { const di = Math.hypot(b.x - ponto.x, b.z - ponto.z); if (di < d) { d = di; ref = i; } });
    if (ref >= 0) lembrar(o, { tipo: 'comida', x: ARBUSTOS[ref].x, z: ARBUSTOS[ref].z, ref, frutos: 3, quando: ctx.hora, forca }, ctx);
  } else if (conceito === 'carne') {
    const k = ctx.carcacas.find(c => Math.hypot(c.x - ponto.x, c.z - ponto.z) < 6);
    if (k) lembrar(o, { tipo: 'carne', x: k.x, z: k.z, ref: k.id, frutos: k.porcoes, quando: ctx.hora, forca }, ctx);
  } else if (conceito === 'caverna') {
    const c = CAVERNAS.find(c => Math.hypot(c.x - ponto.x, c.z - ponto.z) < 10);
    if (c && !o.cavernas[c.id]) o.cavernas[c.id] = { vistaEm: ctx.hora, noites: 0, ultimaNoite: -1e9 };
  } else if (conceito === 'fogo') o.tecnico.fogoConhecido = { x: ponto.x, z: ponto.z, quando: ctx.hora };
  o.social.dicas.push({ conceito, x: ponto.x, z: ponto.z, de: f.id, ate: ctx.hora + 24 });
}

// chegou onde o outro indicou: era verdade? (confiança sobe ou desce com o que o mundo mostra)
function conferirDicas(a: Agente, ctx: Contexto) {
  a.social.dicas = a.social.dicas.filter(d => {
    const de = ctx.agentes.find(x => x.id === d.de);
    if (!de) return false;
    let resultado: boolean | null = null;
    if (d.conceito.startsWith('perigo:')) {
      const esp = d.conceito.slice(7);
      if (a.percebidos.some(p => p.especie === esp && Math.hypot(p.x - d.x, p.z - d.z) < 25)) resultado = true;
      else if (ctx.hora > d.ate) return false;   // não viu nada, mas também não foi conferir: fica por isso mesmo
    } else if (Math.hypot(a.x - d.x, a.z - d.z) < 6) {
      resultado = d.conceito === 'agua' ? pertoDaAgua(d.x, d.z) || pertoDaAgua(a.x, a.z)
        : d.conceito === 'comida' ? ARBUSTOS.some((b, i) => Math.hypot(b.x - d.x, b.z - d.z) < 6 && ctx.frutos[i] > 0)
        : d.conceito === 'carne' ? ctx.carcacas.some(k => k.porcoes > 0 && Math.hypot(k.x - d.x, k.z - d.z) < 6)
        : d.conceito === 'caverna' ? CAVERNAS.some(c => Math.hypot(c.x - d.x, c.z - d.z) < 10)
        : d.conceito === 'fogo' ? fogosPerto(ctx.objetos, d.x, d.z, 6).length > 0 : null;
    } else if (ctx.hora > d.ate) return false;
    if (resultado === null) return true;
    if (resultado) {
      a.social.contagem.dicasCertas++;
      mudarRelacao(a, de, { confianca: 0.08, divida: 0.05, afeto: 0.03 });
      if (a.social.contagem.dicasCertas <= 3) ev(a, ctx, `achou ${traduzir(d.conceito, ctx)} onde ${de.nome} tinha indicado`);
    } else {
      a.social.contagem.dicasErradas++;
      mudarRelacao(a, de, { confianca: -0.08 });
    }
    return false;
  });
}

// ---------- A cada decisão: convivência, vontade de dizer algo, conferir o que ouviu ----------
export function pulsoSocial(a: Agente, ctx: Contexto, horas: number) {
  const P = a.personalidade;
  const vis = alcanceVisao(ctx);
  for (const o of ctx.agentes) {
    if (o === a || !o.vivo) continue;
    const d = Math.hypot(o.x - a.x, o.z - a.z);
    if (!conhece(a, o.id)) {
      if (a.acao === 'dormindo' || d > vis) continue;
      conhecer(a, o, ctx, 'viu');
    }
    const r = relacao(a, o.id);
    // estar junto cria laço (mais em quem é amável); longe, o laço esfria bem devagar; mágoas e medos passam
    if (d < 6) {
      r.convivencia += horas;
      mudarRelacao(a, o, { afeto: horas * 0.0015 * (0.5 + P.amabilidade), confianca: horas * 0.0006 });
    } else if (r.afeto > 0) r.afeto = Math.max(0, r.afeto - horas * 0.0002);   // longe, o laço esfria (mas distância não vira antipatia)
    r.ressentimento = lim(r.ressentimento - horas * 0.004);
    r.medo = lim(r.medo - horas * 0.004);
    r.divida = lim(r.divida - horas * 0.001);
    atualizarAtracao(a, o, ctx, horas, d < 6);

    // bebê não fala; criança só começa a falar depois de um tempo ouvindo
    if (ehBebe(a, ctx.hora) || (ehCrianca(a, ctx.hora) && idadeDias(a, ctx.hora) < 90)) continue;
    if (a.acao === 'dormindo' || o.acao === 'dormindo' || d > 40 || ehBebe(o, ctx.hora)) continue;
    // vontade de dizer: quem é expansivo e gosta do outro fala mais
    const vontade = 0.25 + 0.35 * P.extroversao + 0.25 * Math.max(0, r.afeto) + 0.15 * P.amabilidade;
    if (ctx.rand() > vontade) continue;
    const perto = d < 35;
    // um bicho que ele teme por perto: avisa (e aponta)
    if (a.ameaca) {
      const p = a.percebidos.find(x => x.id === a.ameaca!.id);
      if (p) { falar(a, ctx, [`perigo:${p.especie}`], { x: p.x, z: p.z }); continue; }
    }
    if (!perto) continue;
    // achou o que o outro precisa
    if (a.acao === 'bebendo' && o.corpo.sede > 0.45) { falar(a, ctx, ['agua'], { x: a.x, z: a.z }); continue; }
    if (a.acao === 'comendo' && a.alvoRef >= 0 && o.corpo.fome > 0.45) { const b = ARBUSTOS[a.alvoRef]; falar(a, ctx, ['comida'], { x: b.x, z: b.z }); continue; }
    if (a.acao === 'comendo' && a.alvoCarne >= 0 && o.corpo.fome > 0.4) {
      const k = ctx.carcacas.find(c => c.id === a.alvoCarne);
      if (k) { falar(a, ctx, ['carne'], { x: k.x, z: k.z }); continue; }
    }
    const fogo = fogosPerto(ctx.objetos, a.x, a.z, 4)[0];
    if (fogo && o.corpo.frio > 0.3) { falar(a, ctx, ['fogo'], { x: fogo.x, z: fogo.z }); continue; }
    if (a.indoCaverna !== null && o.indoCaverna === null && ctx.noite) {
      const c = CAVERNAS[a.indoCaverna]; falar(a, ctx, ['caverna'], { x: c.x, z: c.z }); continue;
    }
    // sente falta do outro: chama pelo nome
    if (a.sentimentos.humor.solidao > 0.5 && d > 12 && r.afeto > 0.05) falar(a, ctx, [`pessoa:${o.id}`, 'vem'], null);
  }
  conferirDicas(a, ctx);
  if (a.social.chamadoPor && ctx.hora > a.social.chamadoPor.ate) a.social.chamadoPor = null;
}

// quanto o outro pesa na vontade de ficar perto (entra na decisão de aproximar)
export function vontadeDeFicarPerto(a: Agente, outro: Agente, hora: number) {
  const r = lerRelacao(a, outro.id);
  const chamado = a.social.chamadoPor && a.social.chamadoPor.id === outro.id && hora < a.social.chamadoPor.ate;
  return { fator: Math.max(0.1, 0.6 + r.afeto - 0.8 * r.ressentimento - 0.6 * r.medo), chamado: chamado ? 0.3 + 0.4 * Math.max(0, r.afeto) : 0 };
}

// ---------- Descrições ----------
export function descreverRelacao(r: Relacao) {
  const t: string[] = [];
  if (r.afeto > 0.5) t.push('gosta muito'); else if (r.afeto > 0.2) t.push('gosta'); else if (r.afeto < -0.2) t.push('não gosta');
  if (r.confianca > 0.65) t.push('confia'); else if (r.confianca < 0.2) t.push('desconfia');
  if (r.respeito > 0.4) t.push('admira');
  if (r.ressentimento > 0.3) t.push('guarda mágoa');
  if (r.medo > 0.3) t.push('tem medo');
  if (r.divida > 0.3) t.push('sente que deve favores');
  if ((r.atracao ?? 0) > 0.5) t.push('quer estar sempre junto');
  return t.length ? t.join(', ') : 'ainda não sabe o que sente';
}
