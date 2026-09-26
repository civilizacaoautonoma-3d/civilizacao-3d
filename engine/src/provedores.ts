// Quem pensa pelos agentes: o Claude (API da Anthropic) ou um deliberador de teste local e determinístico.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { EsquemaEvento, EsquemaPlano, EsquemaReflexao, type Provedor, type Resposta, type Situacao } from './deliberacao';

// ---------- Prompt: ontologia neutra, sem mundo real ----------
const SISTEMA = `Você é a mente de um ser humano que vive num vale selvagem, no começo de tudo.
Você não tem linguagem, nomes, ferramentas, fogo, roupas, casa, nem conhece nada do mundo além do que aparece na situação:
suas sensações, sentimentos, jeito de ser, lembranças, crenças e o que percebe agora. Os bichos são conhecidos só pela aparência.
Não invente objetos, técnicas, lugares ou conhecimentos que não estejam na situação — se não está escrito, você não sabe.
Pense como esse ser pensaria: em primeira pessoa, com frases curtas e simples, a partir do que sente e lembra.
Use apenas as ações e os lugares (L1, L2…) listados. Responda só no formato pedido.`;

const PEDIDO: Record<Situacao['tipo'], string> = {
  plano: `Você acabou de acordar. Pense no seu dia: escreva o que passa pela sua cabeça (pensamento), escolha até 4 prioridades
entre as ações possíveis (com um lugar da lista quando fizer sentido e um peso de 1 a 3) e, se quiser, lugares a evitar hoje.`,
  evento: `Algo marcante acabou de acontecer. Pense no que sente agora (pensamento) e escolha UMA ação possível para o momento
(com um lugar da lista, se fizer sentido).`,
  reflexao: `O dia acabou e você vai dormir. Pense no que viveu hoje (resumo, em uma ou duas frases) e, se alguma conclusão
nasceu das suas lembranças, escreva até 2 crenças curtas com o quanto você acredita nelas (certeza de 0 a 1).
Crenças podem estar erradas — são só o que você concluiu.`,
};

const lista = (titulo: string, itens: string[]) => (itens.length ? `${titulo}:\n${itens.map(i => `- ${i}`).join('\n')}\n` : '');

export function descreverSituacao(s: Situacao) {
  return [
    s.evento ? `O que aconteceu: ${s.evento}\n` : '',
    `Agora: ${s.momento}, ${s.estacao}, ${s.tempo}.`,
    `Seu corpo: ${s.corpo.length ? s.corpo.join(', ') : 'bem'}.`,
    s.sente ? `Você sente: ${s.sente}.` : '',
    s.humor.length ? `Você anda: ${s.humor.join(', ')}.` : '',
    s.jeito.length ? `Seu jeito: ${s.jeito.join(', ')}.` : '',
    s.outro.charAt(0).toUpperCase() + s.outro.slice(1) + '.',
    '',
    lista('O que percebe agora', s.percebe),
    lista('Lugares que você conhece', s.lugares.map(l => `${l.id}: ${l.descricao}`)),
    lista('Lugares que você acha perigosos', s.perigos),
    lista('O que você acredita', s.crencas),
    lista('Lembranças que marcaram', s.lembrancas),
    lista('Seus últimos dias', s.diario),
    `Ações possíveis agora: ${s.acoesPossiveis.join(', ')}.`,
    '',
    PEDIDO[s.tipo],
  ].filter(Boolean).join('\n');
}

// ---------- Claude ----------
// modelo barato para a rotina (plano do dia); modelo maior para momentos marcantes e reflexão (documentação, 21.1)
export function provedorClaude(modeloRotina = process.env.MENTE_MODELO_ROTINA ?? 'claude-haiku-4-5',
                               modeloProfundo = process.env.MENTE_MODELO_PROFUNDO ?? 'claude-opus-5'): Provedor {
  const client = new Anthropic();
  return {
    nome: `Claude (${modeloRotina} / ${modeloProfundo})`,
    sincrono: false,
    async pensar(s: Situacao): Promise<Resposta> {
      const profundo = s.tipo !== 'plano';
      const modelo = profundo ? modeloProfundo : modeloRotina;
      const messages: Anthropic.MessageParam[] = [{ role: 'user', content: descreverSituacao(s) }];
      const resposta = s.tipo === 'plano'
        ? await client.messages.parse({ model: modelo, max_tokens: 4000, system: SISTEMA, messages,
            output_config: { format: zodOutputFormat(EsquemaPlano) } })
        : s.tipo === 'evento'
        ? await client.messages.parse({ model: modelo, max_tokens: 8000, system: SISTEMA, messages,
            output_config: { format: zodOutputFormat(EsquemaEvento), effort: 'low' } })
        : await client.messages.parse({ model: modelo, max_tokens: 8000, system: SISTEMA, messages,
            output_config: { format: zodOutputFormat(EsquemaReflexao), effort: 'medium' } });
      if (resposta.stop_reason === 'refusal') throw new Error('o modelo recusou');
      if (resposta.stop_reason === 'max_tokens') throw new Error('resposta cortada (max_tokens)');
      if (!resposta.parsed_output) throw new Error('resposta fora do formato');
      return resposta.parsed_output as Resposta;
    },
  };
}

// ---------- Deliberador de teste (sem rede, determinístico) ----------
// Segue o mesmo contrato do LLM, a partir da mesma situação. Serve para validar o motor sem gastar e sem chave.
export const provedorTeste: Provedor = {
  nome: 'deliberador de teste',
  sincrono: true,
  pensar(s: Situacao): Resposta {
    const tem = (p: string) => s.corpo.some(c => c.includes(p));
    const lugar = (tipo: string) => s.lugares.find(l => l.tipo === tipo || (tipo === 'comida' && l.tipo === 'carne'))?.id ?? null;
    if (s.tipo === 'plano') {
      const prioridades: { acao: typeof s.acoesPossiveis[number]; lugar: string | null; peso: number }[] = [];
      if (tem('fome')) prioridades.push({ acao: 'comer', lugar: lugar('comida'), peso: tem('muita fome') ? 3 : 2 });
      if (tem('sede')) prioridades.push({ acao: 'beber', lugar: lugar('agua'), peso: tem('muita sede') ? 3 : 2 });
      if (s.humor.includes('sozinho') && s.acoesPossiveis.includes('aproximar')) prioridades.push({ acao: 'aproximar', lugar: null, peso: 2 });
      if (s.humor.includes('entediado') || !prioridades.length) prioridades.push({ acao: 'explorar', lugar: null, peso: 1 });
      const palavras: Record<string, string> = { comer: 'comer', beber: 'beber água', aproximar: 'ficar perto da outra pessoa', explorar: 'andar e ver lugares novos' };
      return {
        pensamento: `${s.corpo.length ? `Sinto ${s.corpo.join(' e ')}.` : 'Acordei bem.'}${s.sente ? ` Sinto ${s.sente}.` : ''} Hoje quero ${prioridades.map(p => palavras[p.acao] ?? p.acao).join(', depois ')}.`,
        prioridades, evitar: [],
      };
    }
    if (s.tipo === 'evento') {
      const acao = s.acoesPossiveis.includes('fugir') ? 'fugir'
        : s.evento?.includes('outra pessoa') && s.acoesPossiveis.includes('aproximar') ? 'aproximar'
        : s.evento?.includes('morrer') ? 'abrigar' : 'descansar';
      const reacao: Record<string, string> = { fugir: 'Preciso sair daqui.', aproximar: 'Quero ficar junto.', abrigar: 'Quero me esconder.', descansar: 'Vou ficar parado olhando.' };
      return { pensamento: `${s.evento ?? 'Algo aconteceu'}. ${reacao[acao]}`, acao, lugar: null };
    }
    const atacado = s.lembrancas.filter(l => l.startsWith('foi atacado por'));
    const crencas = atacado.length && atacado[0].includes('várias vezes')
      ? [{ enunciado: `${atacado[0].replace('foi atacado por ', '').replace(' (várias vezes)', '')} machuca quem chega perto`, certeza: 0.6 }] : [];
    return { resumo: s.lembrancas.length ? `Lembro que ${s.lembrancas[0]}.` : 'Foi um dia calmo.', crencas };
  },
};

// sem chave nem configuração: usa o de teste. MENTE_LLM=claude | teste | desligado força a escolha.
export function escolherProvedor(): Provedor | null {
  const escolha = process.env.MENTE_LLM ?? (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? 'claude' : 'teste');
  if (escolha === 'desligado') return null;
  if (escolha === 'claude') return provedorClaude();
  return provedorTeste;
}
