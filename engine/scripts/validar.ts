// Simulação sem interface para validar mudanças no motor.
// Uso: npx tsx scripts/validar.ts [dias] [--tudo]
// Roda um mundo novo (não toca em data/) o mais rápido possível e mostra o censo diário.
import { SEED, mulberry32 } from '../../shared/mundo';
import { TEMPO, tempoDoMundo } from '../../shared/clima';
import { DT, censo, mundoNovo, passoDoMundo } from '../src/simulacao';

const dias = Number(process.argv.find(a => /^\d+$/.test(a)) ?? 30);
const tudo = process.argv.includes('--tudo');
const VEL = 60;

const e = mundoNovo(0, mulberry32(SEED * 17));
const rand = mulberry32(SEED * 31);
let ms = TEMPO.INICIO_DO_MUNDO;

const pad = (n: number) => String(n).padStart(2, '0');
const carimbo = () => { const t = tempoDoMundo(ms); return `D${pad(t.diaDoAno)} ${pad(t.hora)}:${pad(t.minuto)}`; };
const contagem = new Map<string, number>();
const rotina = /foi dormir|^(\S+) acordou$|descobriu|encontrou um arbusto/;

function registrar(t: string) {
  const tipo = t.replace(/\d+/g, 'N').replace(/^(Aru|Nia) /, '<agente> ');
  contagem.set(tipo, (contagem.get(tipo) ?? 0) + 1);
  if (t.startsWith('Censo')) return;
  const deAgente = /^(Aru|Nia) /.test(t);
  if (tudo || (deAgente && !rotina.test(t)) || /chegou de fora|matilha|deixou/.test(t)) console.log(`  [${carimbo()}] ${t}`);
}

const inicio = performance.now();
let diaAnterior = -1;
while (tempoDoMundo(ms).diasTotais < dias + 0.25) {
  passoDoMundo(e, ms, VEL, rand, registrar);
  ms += DT * 1000 * VEL;
  const t = tempoDoMundo(ms);
  const dia = Math.floor(t.diasTotais);
  if (dia !== diaAnterior && t.hora === 12) {
    diaAnterior = dia;
    const ag = e.agentes.map(a => `${a.nome} ${a.vivo ? `saúde ${Math.round(a.corpo.saude * 100)}% fome ${Math.round(a.corpo.fome * 100)}%` : `MORTO (${a.causaMorte})`}`).join(' | ');
    console.log(`Dia ${pad(t.diaDoAno)} ${t.estacao.padEnd(9)} ${censo(e)}  ||  ${ag}`);
  }
}
const seg = (performance.now() - inicio) / 1000;
console.log(`\n${dias} dias simulados em ${seg.toFixed(1)} s`);
console.log('\nEventos:');
for (const [k, v] of [...contagem].sort((a, b) => b[1] - a[1])) if (!k.startsWith('Censo')) console.log(`  ${String(v).padStart(6)}  ${k}`);
