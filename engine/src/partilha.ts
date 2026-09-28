// Partilha de comida: colher para levar, carregar, largar perto de quem tem fome, comer o que está na mão ou no chão.
// Ninguém "divide" por regra: quem se apega a alguém e o vê com fome tem vontade de levar comida até ele.
// Receber cria gratidão (afeto e dívida); dar também aproxima. É a semente da cooperação (e, entre grupos, da troca).
import { ARBUSTOS } from '../../shared/mundo';
import type { Contexto } from './contexto';
import type { Agente } from './agente';
import { ev, irParaPonto, sinta } from './agente';
import { lerRelacao, mudarRelacao } from './social';
import { ehBebe, ehCrianca } from './vida';
import { largar, pegar, sabe, segurando } from './tecnicas';
import type { Objeto } from './objetos';
import type { Carcaca } from './ecologia';
import { aoDarComida, aoPegarComidaAlheia, aoReceberComida, observarPartilha } from './cultura';

export const FRUTO_DURA = 72;   // horas até o fruto colhido apodrecer
const ehComida = (o: Objeto) => o.tipo === 'fruto' || o.tipo === 'carne';
const comidaNaMao = (a: Agente, ctx: Contexto) => segurando(a, ctx).filter(ehComida);

// quem ele tem vontade de alimentar agora (e quanto)
function quemPrecisa(a: Agente, ctx: Contexto) {
  let melhor: Agente | null = null, nota = 0;
  for (const o of ctx.agentes) {
    if (o === a || !o.vivo || ehBebe(o, ctx.hora)) continue;   // bebê mama
    const d = Math.hypot(o.x - a.x, o.z - a.z);
    if (d > 45 || o.corpo.fome < 0.45) continue;
    const r = lerRelacao(a, o.id);
    const filho = o.vida.mae === a.id || o.vida.pai === a.id;
    const laco = r.afeto + (filho ? 0.4 : 0) + (ehCrianca(o, ctx.hora) ? 0.15 : 0);
    if (laco < 0.25) continue;
    const n = o.corpo.fome * laco * (1 - Math.min(0.9, d / 60));
    if (n > nota) { nota = n; melhor = o; }
  }
  return { alvo: melhor, nota };
}

// ao terminar de comer num arbusto: leva um fruto se alguém querido está com fome, ou se o frio vem aí
export function colherParaLevar(a: Agente, ctx: Contexto, arbusto: number) {
  if (ctx.frutos[arbusto] <= 0 || a.tecnico.mao.length >= 2) return;
  const frio = ctx.estacao === 'Outono' || ctx.estacao === 'Inverno';
  const alguem = quemPrecisa(a, ctx).alvo || ctx.agentes.some(o => o !== a && o.vivo && ehCrianca(o, ctx.hora) && !ehBebe(o, ctx.hora)
    && (o.vida.mae === a.id || o.vida.pai === a.id));
  if (!alguem && !(frio && ctx.rand() < 0.3)) return;
  ctx.frutos[arbusto]--;
  const b = ARBUSTOS[arbusto];
  const f = ctx.criarObjeto({ tipo: 'fruto', x: b.x, z: b.z, carregadoPor: null, desde: ctx.hora });
  pegar(a, f, ctx);
  a.intencao = 'colheu um fruto para levar';
}

// com a pedra afiada, corta um pedaço da carcaça para levar
export function cortarParaLevar(a: Agente, ctx: Contexto, k: Carcaca) {
  if (k.porcoes <= 1 || a.tecnico.mao.length >= 2 || !sabe(a, 'cortar') || !segurando(a, ctx, 'lasca').length) return;
  if (!quemPrecisa(a, ctx).alvo && ctx.rand() > 0.2) return;
  k.porcoes--;
  const c = ctx.criarObjeto({ tipo: 'carne', x: k.x, z: k.z, carregadoPor: null, desde: k.desde, especie: k.especie });
  pegar(a, c, ctx);
  a.intencao = 'cortou um pedaço de carne para levar';
}

function comer(a: Agente, o: Objeto, ctx: Contexto) {
  if (o.carregadoPor === a.id) a.tecnico.mao = a.tecnico.mao.filter(id => id !== o.id);
  const i = ctx.objetos.indexOf(o);
  if (i >= 0) ctx.objetos.splice(i, 1);
  ctx.objetosMudaram();
  const podre = o.tipo === 'carne' && ctx.hora - (o.desde ?? ctx.hora) > 36;
  a.corpo.fome = Math.max(0, a.corpo.fome - (o.tipo === 'fruto' ? 0.25 : 0.3));
  if (podre) { a.corpo.saude = Math.max(0, a.corpo.saude - 0.08); sinta(a, 'nojo', 0.6); }
  else sinta(a, 'alegria', 0.2 + a.corpo.fome * 0.3);
  a.acao = 'comendo'; a.intencao = o.tipo === 'fruto' ? 'comendo um fruto' : 'comendo um pedaço de carne';
  a.ocupadoAte = ctx.hora + 0.05;
}

// a cada decisão: comer o que tem na mão (ou o que deixaram ao lado dele) quando a fome aperta
export function comerOQueTem(a: Agente, ctx: Contexto): boolean {
  if (a.corpo.fome < 0.45 || ehBebe(a, ctx.hora)) return false;
  const naMao = comidaNaMao(a, ctx)[0];
  if (naMao) { comer(a, naMao, ctx); return true; }
  const noChao = ctx.objetos.find(o => ehComida(o) && !o.carregadoPor && Math.hypot(o.x - a.x, o.z - a.z) < 2.5);
  if (noChao) {
    comer(a, noChao, ctx);
    const quem = noChao.deixadoPor ? ctx.agentes.find(x => x.id === noChao.deixadoPor) : undefined;
    // era para outro: quem deixou e quem ia receber se revoltam
    if (noChao.deixadoPara && noChao.deixadoPara !== a.id && quem !== a)
      aoPegarComidaAlheia(a, quem, ctx.agentes.find(x => x.id === noChao.deixadoPara), ctx);
    else if (quem && quem !== a) {
      aoReceberComida(a, ctx, quem); aoDarComida(quem, ctx); observarPartilha(ctx, quem, true);
      // recebeu de alguém: gratidão
      mudarRelacao(a, quem, { afeto: 0.08, confianca: 0.03, divida: 0.1 });
      mudarRelacao(quem, a, { afeto: 0.02 });
      sinta(a, 'alegria', 0.4);
      a.social.recebeuComida = (a.social.recebeuComida ?? 0) + 1;
      if (a.social.recebeuComida <= 2) ev(a, ctx, `comeu a comida que ${quem.nome} deixou para ${a.sexo === 'F' ? 'ela' : 'ele'}`);
    }
    return true;
  }
  return false;
}

// quanto vale levar comida a alguém agora (entra na decisão)
export function vontadeDePartilhar(a: Agente, ctx: Contexto) {
  if (!comidaNaMao(a, ctx).length || a.corpo.fome > 0.55) return 0;
  const { nota } = quemPrecisa(a, ctx);
  return nota * (0.7 + 0.6 * a.personalidade.amabilidade) * (1 - a.corpo.fome);
}

export function partilhar(a: Agente, ctx: Contexto): string | null {
  const { alvo } = quemPrecisa(a, ctx);
  const comida = comidaNaMao(a, ctx)[0];
  if (!alvo || !comida) return null;
  if (!irParaPonto(a, ctx, alvo, 1.6)) return `levando ${comida.tipo === 'fruto' ? 'um fruto' : 'carne'} para ${alvo.nome}`;
  largar(a, comida, ctx);
  comida.x = alvo.x + 0.3; comida.z = alvo.z + 0.3; comida.deixadoPor = a.id; comida.deixadoPara = alvo.id;
  a.rotacao = Math.atan2(alvo.x - a.x, alvo.z - a.z);
  a.social.deuComida = (a.social.deuComida ?? 0) + 1;
  if (a.social.deuComida <= 3) ev(a, ctx, `deixou ${comida.tipo === 'fruto' ? 'um fruto' : 'um pedaço de carne'} junto de ${alvo.nome}, que estava com fome`);
  sinta(a, 'alegria', 0.25);
  return null;
}
