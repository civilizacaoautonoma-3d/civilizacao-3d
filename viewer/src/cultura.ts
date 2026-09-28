// Quadro da cultura (tecla C): o que cada grupo diz, valoriza e sabe fazer, e quanto os grupos divergem.
import type { CulturaRede } from '../../shared/protocolo';

const quadro = document.createElement('div');
quadro.id = 'cultura';
quadro.style.cssText = 'position:fixed;right:12px;top:12px;max-width:min(560px,92vw);max-height:80vh;overflow:auto;display:none;' +
  'background:rgba(15,18,22,.86);color:#eee;font:13px/1.45 system-ui,sans-serif;padding:12px 14px;border-radius:10px;z-index:20';
document.body.append(quadro);
let ultima: CulturaRede | null = null;

const NOME_VALOR: Record<string, string> = { partilhar: 'Partilhar', cautela: 'Cautela', cuidado: 'Cuidado', abertura: 'Abertura aos de fora' };
const pct = (v: number) => `${Math.round(v * 100)}%`;
function barra(v: number) {
  // -1 … 1: para a esquerda (vermelho) ou direita (verde) do meio
  const w = Math.round(Math.abs(v) * 50);
  return `<span style="display:inline-block;width:100px;height:8px;background:#333;position:relative;vertical-align:middle;border-radius:4px">` +
    `<span style="position:absolute;top:0;height:8px;${v >= 0 ? 'left:50px' : `left:${50 - w}px`};width:${w}px;background:${v >= 0 ? '#6fc46a' : '#d65c5c'};border-radius:4px"></span></span>`;
}

function desenhar() {
  const c = ultima;
  if (!c) { quadro.innerHTML = '<b>Cultura</b><br>esperando dados do motor…'; return; }
  const conceitos = [...new Set(c.grupos.flatMap(g => Object.keys(g.palavras)))].filter(k => !k.startsWith('pessoa:')).sort();
  let h = '<b style="font-size:15px">Cultura dos grupos</b> <small>(C para fechar)</small>';
  if (c.divergencia) {
    const d = c.divergencia;
    h += `<p style="margin:6px 0"><b>Divergência</b> — língua ${pct(d.lingua)} · valores ${pct(d.valores)} · técnicas ${pct(d.tecnicas)} · crenças ${pct(d.crencas)}</p>`;
  }
  h += '<table style="border-collapse:collapse;width:100%"><tr><th style="text-align:left">Coisa</th>' +
    c.grupos.map(g => `<th style="text-align:left">Grupo ${g.numero} <small>(${g.vivos})</small></th>`).join('') + '</tr>';
  for (const k of conceitos) {
    const ws = c.grupos.map(g => g.palavras[k] ?? '—');
    const iguais = ws.every(w => w === ws[0] && w !== '—');
    h += `<tr><td>${c.traducao[k] ?? k}</td>` + ws.map(w => `<td style="color:${iguais ? '#8fd18a' : '#fff'}">"${w}"</td>`).join('') + '</tr>';
  }
  h += '</table><p style="margin:8px 0 2px"><b>Valores (média)</b></p>';
  for (const v of Object.keys(NOME_VALOR))
    h += `<div>${NOME_VALOR[v].padEnd(22)} ${c.grupos.map(g => `G${g.numero} ${barra(g.valores[v] ?? 0)}`).join(' ')}</div>`;
  h += c.grupos.map(g => `<p style="margin:6px 0 0"><b>Grupo ${g.numero} sabe:</b> ${g.tecnicas.join(', ') || 'nada ainda'}</p>`).join('');
  quadro.innerHTML = h;
}

export function aplicarCultura(c: CulturaRede | undefined) { if (c) { ultima = c; if (quadro.style.display !== 'none') desenhar(); } }
export function alternarCultura() {
  quadro.style.display = quadro.style.display === 'none' ? 'block' : 'none';
  if (quadro.style.display !== 'none') desenhar();
}
