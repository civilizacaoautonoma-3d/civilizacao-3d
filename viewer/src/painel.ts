import * as THREE from 'three';
import { PERFIS } from '../../shared/especies';
import type { AnimalRede, EntidadeRede } from '../../shared/protocolo';
import { agentes } from './agentes';
import { animais } from './animais';

// ---------- Painel do ser que está na mira ----------
const painel = document.createElement('div');
painel.id = 'painel';
document.body.append(painel);
const direcao = new THREE.Vector3(), ate = new THREE.Vector3();
let ultimoPainel = 0;

const barra = (nome: string, valor: number, cor: string) =>
  `<div class="linha"><span>${nome}</span><div class="barra"><div style="width:${Math.round(valor * 100)}%;background:${cor}"></div></div><b>${Math.round(valor * 100)}%</b></div>`;

const NOME_EMOCAO: Record<string, [string, string]> = {
  medo: ['Medo', '#d65c5c'], alerta: ['Alerta', '#e0a03c'], calma: ['Calma', '#6fc4b0'],
  satisfacao: ['Satisfação', '#9bd46a'], apego: ['Apego', '#e07ab8'], excitacao: ['Excitação', '#e0763c'],
  dominancia: ['Domínio', '#a58be0'], agressividade: ['Fúria', '#c0392b'], curiosidade: ['Curiosidade', '#5dade2'],
};

function htmlAgente(e: EntidadeRede) {
  const n = e.necessidades;
  const caca = e.caca.tentativas > 0 ? ` · caçou ${e.caca.sucessos} de ${e.caca.tentativas} tentativas` : '';
  return `<h3>${e.nome} <small>${e.sexo === 'M' ? 'homem' : 'mulher'}${e.sentimentos?.jeito.length ? ' · ' + e.sentimentos.jeito.join(', ') : ''}</small></h3>
    <p class="intencao">${e.intencao}</p>
    ${sentimentos(e)}
    ${barra('Fome', n.fome, '#e0763c')}
    ${barra('Sede', n.sede, '#3c9ee0')}
    ${barra('Sono', n.sono, '#8b6fd6')}
    ${barra('Energia', n.energia, '#e0c43c')}
    ${barra('Saúde', n.saude, '#4cc46a')}
    ${barra('Frio', n.frio, '#9ad4e8')}
    ${n.dor > 0.01 ? barra('Dor', n.dor, '#d65c5c') : ''}
    <p class="memoria">Lembra de ${e.memoria.agua} lugar(es) com água, ${e.memoria.comida} arbusto(s)` +
    `${e.memoria.carne ? ` e ${e.memoria.carne} carcaça(s)` : ''}${caca}</p>
    ${mente(e)}`;
}

const NOME_EMO: Record<string, [string, string]> = {
  alegria: ['Alegria', '#e8c547'], confianca: ['Confiança', '#6fc4b0'], medo: ['Medo', '#d65c5c'], surpresa: ['Surpresa', '#5dade2'],
  tristeza: ['Tristeza', '#5b7fc4'], nojo: ['Nojo', '#8bb04a'], raiva: ['Raiva', '#c0392b'], antecipacao: ['Antecipação', '#e0a03c'],
};
const NOME_HUMOR: Record<string, [string, string]> = {
  ansiedade: ['Ansiedade', '#d68a5c'], solidao: ['Solidão', '#8b6fd6'], tedio: ['Tédio', '#9a9a9a'],
  satisfacao: ['Satisfação', '#9bd46a'], tristeza: ['Melancolia', '#5b7fc4'], esperanca: ['Esperança', '#e8c547'],
};

function sentimentos(e: EntidadeRede) {
  const s = e.sentimentos;
  if (!s) return '';
  const agora = s.derivada ? `<p class="titulo">Sente agora: ${s.derivada}</p>` : '';
  const emo = Object.entries(s.emocoes).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([k, v]) => NOME_EMO[k] ? barra(NOME_EMO[k][0], v, NOME_EMO[k][1]) : '').join('');
  const humor = Object.entries(s.humor).filter(([k, v]) => v > 0.2 || k === 'satisfacao')
    .map(([k, v]) => NOME_HUMOR[k] ? barra(NOME_HUMOR[k][0], v, NOME_HUMOR[k][1]) : '').join('');
  return `${agora}${emo ? `<p class="titulo">Emoções</p>${emo}` : ''}<p class="titulo">Humor</p>${humor}`;
}

function mente(e: EntidadeRede) {
  const m = e.mente;
  if (!m) return '';
  const crencas = m.crencas.length
    ? m.crencas.map(c => `<li>${c.enunciado} <b>${Math.round(c.certeza * 100)}%</b></li>`).join('')
    : '<li class="vazio">nenhuma ainda</li>';
  const lembrancas = m.lembrancas.map(l => `<li>${l}</li>`).join('');
  return `<p class="titulo">Acredita que</p><ul class="lista">${crencas}</ul>
    ${lembrancas ? `<p class="titulo">Lembra</p><ul class="lista">${lembrancas}</ul>` : ''}
    <p class="memoria">${m.episodios} lembranças · conhece ${Math.round(m.mapaConhecido * 100)}% do vale</p>`;
}

function idade(dias: number) {
  if (dias < 60) return `${dias} dia${dias === 1 ? '' : 's'}`;
  if (dias < 365) return `${Math.floor(dias / 30)} meses`;
  const anos = Math.floor(dias / 365);
  return `${anos} ano${anos === 1 ? '' : 's'}`;
}

function htmlAnimal(e: AnimalRede) {
  const p = PERFIS[e.especie], n = e.necessidades;
  const nome = p.nome[0].toUpperCase() + p.nome.slice(1);
  const fase = e.crescimento < 1 ? 'filhote' : e.sexo === 'M' ? 'macho' : 'fêmea';
  const emocoes = Object.entries(e.emocoes)
    .map(([k, v]) => (NOME_EMOCAO[k] ? barra(NOME_EMOCAO[k][0], v, NOME_EMOCAO[k][1]) : '')).join('');
  return `<h3>${nome} <small>${fase} · ${idade(e.idadeDias)}</small></h3>
    <p class="intencao">${e.intencao}</p>
    ${barra('Fome', n.fome, '#e0763c')}
    ${barra('Sede', n.sede, '#3c9ee0')}
    ${barra('Sono', n.sono, '#8b6fd6')}
    ${barra('Energia', n.energia, '#e0c43c')}
    ${barra('Saúde', n.saude, '#4cc46a')}
    ${barra('Gordura', n.gordura ?? 0, '#d4a574')}
    ${(n.frio ?? 0) > 0.01 ? barra('Frio', n.frio, '#9ad4e8') : ''}
    <p class="memoria">O que sente</p>
    ${emocoes}`;
}

export function atualizarPainel(camera: THREE.Camera) {
  const agora = performance.now();
  if (agora - ultimoPainel < 150) return;
  ultimoPainel = agora;

  camera.getWorldDirection(direcao);
  let html: string | null = null, melhor = 0.12;
  const testar = (pos: THREE.Vector3, altura: number, alcance: number, gerar: () => string) => {
    ate.copy(pos).setY(pos.y + altura).sub(camera.position);
    const d = ate.length();
    if (d > alcance) return;
    const ang = ate.angleTo(direcao) * Math.max(1, d / 10);   // de longe, bichos pequenos pedem mira mais precisa
    if (ang < melhor) { melhor = ang; html = gerar(); }
  };
  for (const v of agentes.values()) testar(v.grupo.position, 1, 30, () => htmlAgente(v.dados));
  for (const v of animais.values()) {
    if (!v.grupo.visible) continue;
    testar(v.grupo.position, PERFIS[v.dados.especie].altura * 0.6, 40, () => htmlAnimal(v.dados));
  }
  if (!html) { painel.style.display = 'none'; return; }
  painel.style.display = 'block';
  painel.innerHTML = html;
}
