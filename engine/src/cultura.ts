// Cultura, valores e evolução (Fase 14, documentação seções 7, 11 e fase 14).
// Valores não vêm de fábrica: nascem do que cada um vive (quem recebeu comida com fome passa a valorizar partilhar;
// quem viu alguém morrer para um bicho fica cauteloso). Emoções morais aparecem quando o que se valoriza é traído
// (culpa por não ter dividido; indignação quando alguém pega a comida deixada para outro).
// Normas não são leis: são o que cada um percebe que os seus costumam fazer — e isso vira expectativa.
// Crianças herdam crenças e valores de quem as cria; grupos separados divergem. O motor mede essa divergência.
import type { Contexto } from './contexto';
import type { Agente } from './agente';
import { ev, sinta } from './agente';
import { viver } from './emocoes';
import { lerRelacao, melhorPalavra, mudarRelacao } from './social';
import { ehCrianca, idadeDias } from './vida';

export type Valor = 'partilhar' | 'cautela' | 'cuidado' | 'abertura';
export const VALORES: Valor[] = ['partilhar', 'cautela', 'cuidado', 'abertura'];
export interface EstadoCultural {
  valores: Record<Valor, number>;             // -1 … 1 (0 = indiferente)
  normas: { partilhar: number; cuidarDeOrfaos: number };   // quanto acha que os seus costumam fazer (0 … 1)
  culpas: number; indignacoes: number; ultimaCulpa?: number; vendoFomeDesde?: number | null;
}
export const novaCultura = (): EstadoCultural => ({
  valores: { partilhar: 0, cautela: 0, cuidado: 0, abertura: 0 }, normas: { partilhar: 0.3, cuidarDeOrfaos: 0.3 }, culpas: 0, indignacoes: 0,
});

const lim = (v: number, a = -1, b = 1) => Math.min(b, Math.max(a, v));
// quem é jovem muda de valores mais depressa; o adulto é mais firme
const plasticidade = (a: Agente, hora: number) => (ehCrianca(a, hora) ? 1.6 : 1);
export function mudarValor(a: Agente, v: Valor, delta: number, hora: number) {
  a.cultura.valores[v] = lim(a.cultura.valores[v] + delta * plasticidade(a, hora) * (1 - Math.abs(a.cultura.valores[v]) * 0.5));
}

// ---------- A experiência forma valores ----------
export const aoReceberComida = (a: Agente, ctx: Contexto, de: Agente) => {
  mudarValor(a, 'partilhar', 0.03, ctx.hora);
  if (de.comunidade !== a.comunidade) mudarValor(a, 'abertura', 0.06, ctx.hora);   // ajuda de quem é de fora
};
export const aoDarComida = (a: Agente, ctx: Contexto) => mudarValor(a, 'partilhar', 0.01, ctx.hora);
export const aoVerMorte = (a: Agente, ctx: Contexto, porBicho: boolean) => { if (porBicho) mudarValor(a, 'cautela', 0.08, ctx.hora); };
export const aoSerAtacado = (a: Agente, ctx: Contexto) => mudarValor(a, 'cautela', 0.02, ctx.hora);
export const aoCuidar = (a: Agente, ctx: Contexto, horas: number) => mudarValor(a, 'cuidado', horas * 0.01, ctx.hora);
export const aoConferirDica = (a: Agente, ctx: Contexto, de: Agente, certa: boolean) => {
  if (de.comunidade !== a.comunidade) mudarValor(a, 'abertura', certa ? 0.06 : -0.08, ctx.hora);
};

// ---------- Emoções morais ----------
// culpa: com comida na mão, viu alguém querido definhar de fome perto e não levou
export function talvezCulpa(a: Agente, ctx: Contexto, comidaNaMao: boolean) {
  const faminto = comidaNaMao && a.corpo.fome <= 0.5 && a.objetivo !== 'partilhar' && a.acao !== 'dormindo'
    ? ctx.agentes.find(o => o !== a && o.vivo && o.corpo.fome > 0.85 && Math.hypot(o.x - a.x, o.z - a.z) < 15 && lerRelacao(a, o.id).afeto > 0.3)
    : undefined;
  // só pesa se viu o outro com fome por um bom tempo e não fez nada
  if (!faminto) { a.cultura.vendoFomeDesde = null; return; }
  a.cultura.vendoFomeDesde ??= ctx.hora;
  if (ctx.hora - a.cultura.vendoFomeDesde < 1 || ctx.hora - (a.cultura.ultimaCulpa ?? -1e9) < 24) return;
  a.cultura.ultimaCulpa = ctx.hora; a.cultura.culpas++;
  sinta(a, 'tristeza', 0.5); viver(a.sentimentos, 'culpa', ctx.hora, 3);
  mudarValor(a, 'partilhar', 0.08, ctx.hora);
  if (a.cultura.culpas <= 2) ev(a, ctx, `sentiu culpa: tinha comida e ${faminto.nome} passava fome ao lado`);
}
// indignação: alguém comeu a comida que foi deixada para outro (quem deixou e quem ia comer se revoltam)
export function aoPegarComidaAlheia(quem: Agente, deixador: Agente | undefined, para: Agente | undefined, ctx: Contexto) {
  for (const o of [deixador, para]) {
    if (!o || o === quem || !o.vivo || Math.hypot(o.x - quem.x, o.z - quem.z) > 25) continue;
    o.cultura.indignacoes++;
    sinta(o, 'raiva', 0.5); viver(o.sentimentos, 'indignação', ctx.hora, 2);
    mudarRelacao(o, quem, { ressentimento: 0.15, confianca: -0.05 });
    if (o.cultura.indignacoes <= 2) ev(o, ctx, `ficou ${o.sexo === 'F' ? 'indignada' : 'indignado'}: ${quem.nome} comeu a comida que era para ${para?.nome ?? 'outro'}`);
  }
}

// ---------- Normas: o que os seus costumam fazer ----------
// cada vez que vê alguém do próprio grupo dividir (ou não dividir com quem tem fome), a expectativa se ajusta
export function observarPartilha(ctx: Contexto, quem: Agente, dividiu: boolean) {
  for (const o of ctx.agentes) {
    if (o === quem || !o.vivo || o.comunidade !== quem.comunidade || Math.hypot(o.x - quem.x, o.z - quem.z) > 30) continue;
    o.cultura.normas.partilhar = lim(o.cultura.normas.partilhar + (dividiu ? 0.05 : -0.02) * (1 - o.cultura.normas.partilhar), 0, 1);
    // quem espera que os seus dividam, passa a dividir mais (conformidade)
    if (dividiu) mudarValor(o, 'partilhar', 0.004 * o.cultura.normas.partilhar, ctx.hora);
  }
}
export function observarCuidadoDeOrfao(ctx: Contexto, quem: Agente) {
  for (const o of ctx.agentes) {
    if (o === quem || !o.vivo || o.comunidade !== quem.comunidade || Math.hypot(o.x - quem.x, o.z - quem.z) > 30) continue;
    o.cultura.normas.cuidarDeOrfaos = lim(o.cultura.normas.cuidarDeOrfaos + 0.04 * (1 - o.cultura.normas.cuidarDeOrfaos), 0, 1);
    mudarValor(o, 'cuidado', 0.01, ctx.hora);
  }
}

// ---------- Transmissão entre gerações ----------
// a criança perto de quem a cria vai absorvendo o que eles valorizam e no que acreditam
export function transmitir(a: Agente, ctx: Contexto, horas: number) {
  // sem nada que reforce, um valor esfria devagar (em ~2 meses cai pela metade)
  for (const v of VALORES) a.cultura.valores[v] *= 1 - horas * 0.0005;
  if (!ehCrianca(a, ctx.hora) || idadeDias(a, ctx.hora) < 30) return;
  const pais = ctx.agentes.filter(o => o.vivo && (o.id === a.vida.mae || o.id === a.vida.pai) && Math.hypot(o.x - a.x, o.z - a.z) < 10);
  if (!pais.length) return;
  for (const v of VALORES) {
    const media = pais.reduce((s, p) => s + p.cultura.valores[v], 0) / pais.length;
    a.cultura.valores[v] = lim(a.cultura.valores[v] + (media - a.cultura.valores[v]) * horas * 0.02);
  }
  for (const k of ['partilhar', 'cuidarDeOrfaos'] as const) {
    const media = pais.reduce((s, p) => s + p.cultura.normas[k], 0) / pais.length;
    a.cultura.normas[k] = lim(a.cultura.normas[k] + (media - a.cultura.normas[k]) * horas * 0.02, 0, 1);
  }
  // crenças fortes dos pais passam para a criança (com menos certeza: é o que ouviu e viu, não o que viveu)
  if (ctx.rand() > horas * 0.3) return;
  const p = pais[Math.floor(ctx.rand() * pais.length)];
  const fortes = p.mente.crencas.filter(c => c.certeza > 0.45 && !a.mente.crencas.some(x => x.chave === c.chave));
  if (!fortes.length) return;
  const c = fortes[Math.floor(ctx.rand() * fortes.length)];
  a.mente.crencas.push({ ...c, certeza: c.certeza * 0.7, origem: 'transmitida', transmitidaPor: p.id, desde: ctx.hora });
  ev(a, ctx, `aprendeu com ${p.nome} a acreditar que ${c.enunciado}`);
}

// ---------- Como os valores pesam nas decisões ----------
export const pesoDoValor = (a: Agente, v: Valor) => 1 + 0.5 * a.cultura.valores[v];   // 0,5 … 1,5

export function descreverValores(a: Agente) {
  const V = a.cultura.valores, t: string[] = [];
  if (V.partilhar > 0.3) t.push('dividir comida com os seus'); else if (V.partilhar < -0.3) t.push('guardar a comida para si');
  if (V.cautela > 0.3) t.push('não correr riscos');
  if (V.cuidado > 0.3) t.push('cuidar dos pequenos');
  if (V.abertura > 0.3) t.push('se aproximar dos de fora'); else if (V.abertura < -0.3) t.push('desconfiar dos de fora');
  return t;
}

// ---------- Métricas de divergência entre comunidades (para quem observa) ----------
export interface RetratoCultural {
  grupos: { numero: number; vivos: number; palavras: Record<string, string>; valores: Record<Valor, number>; tecnicas: string[]; crencas: string[] }[];
  divergencia: { lingua: number; valores: number; tecnicas: number; crencas: number } | null;
}
export function medirCultura(agentes: Agente[]): RetratoCultural {
  const numeros = [...new Set(agentes.map(a => a.comunidade))].sort();
  const grupos = numeros.map(n => {
    const m = agentes.filter(a => a.vivo && a.comunidade === n);
    // a palavra do grupo para cada coisa: a mais usada entre os membros
    const votos: Record<string, Record<string, number>> = {};
    for (const a of m) for (const c of Object.keys(a.social.lexico)) {
      const p = melhorPalavra(a, c);
      if (p) (votos[c] ??= {})[p] = (votos[c][p] ?? 0) + 1;
    }
    const palavras: Record<string, string> = {};
    for (const [c, v] of Object.entries(votos)) palavras[c] = Object.entries(v).sort((x, y) => y[1] - x[1])[0][0];
    const valores = {} as Record<Valor, number>;
    for (const v of VALORES) valores[v] = m.length ? Math.round(m.reduce((s, a) => s + a.cultura.valores[v], 0) / m.length * 100) / 100 : 0;
    const tecnicas = [...new Set(m.flatMap(a => Object.keys(a.tecnico.sabe)))].sort();
    const crencas = [...new Set(m.flatMap(a => a.mente.crencas.filter(c => c.certeza > 0.4).map(c => c.chave)))].sort();
    return { numero: n, vivos: m.length, palavras, valores, tecnicas, crencas };
  });
  if (grupos.length < 2) return { grupos, divergencia: null };
  const [g1, g2] = grupos;
  // língua: das coisas que os dois grupos nomeiam, quantas têm palavras diferentes (pessoas não entram)
  const comuns = Object.keys(g1.palavras).filter(c => c in g2.palavras && !c.startsWith('pessoa:'));
  const lingua = comuns.length ? comuns.filter(c => g1.palavras[c] !== g2.palavras[c]).length / comuns.length : 1;
  const valores = Math.sqrt(VALORES.reduce((s, v) => s + (g1.valores[v] - g2.valores[v]) ** 2, 0) / VALORES.length);
  const jaccard = (x: string[], y: string[]) => { const u = new Set([...x, ...y]); return u.size ? 1 - x.filter(i => y.includes(i)).length / u.size : 0; };
  const r = (v: number) => Math.round(v * 100) / 100;
  return { grupos, divergencia: { lingua: r(lingua), valores: r(valores), tecnicas: r(jaccard(g1.tecnicas, g2.tecnicas)), crencas: r(jaccard(g1.crencas, g2.crencas)) } };
}
