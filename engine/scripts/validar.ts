// Simulação sem interface para validar mudanças no motor.
// Uso: npx tsx scripts/validar.ts [dias] [--tudo] [--rastrear Nome --desde Dia]
//   --rastrear mostra, a cada meia hora do mundo, o que aquele agente está fazendo a partir do dia indicado.
// Roda um mundo novo (não toca em data/) o mais rápido possível e mostra o censo diário.
import { SEED, mulberry32 } from '../../shared/mundo';
import { TEMPO, tempoDoMundo } from '../../shared/clima';
import { DT, censo, mundoNovo, passoDoMundo } from '../src/simulacao';

const dias = Number(process.argv.slice(2).find((a, i, v) => /^\d+$/.test(a) && v[i - 1] !== '--desde') ?? 30);
const tudo = process.argv.includes('--tudo');
const arg = (nome: string) => { const i = process.argv.indexOf(nome); return i >= 0 ? process.argv[i + 1] : undefined; };
const rastrear = arg('--rastrear');
const desde = Number(arg('--desde') ?? 0);
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
let diaAnterior = -1, meiaHora = -1;
while (tempoDoMundo(ms).diasTotais < dias + 0.25) {
  passoDoMundo(e, ms, VEL, rand, registrar);
  ms += DT * 1000 * VEL;
  const t = tempoDoMundo(ms);
  const dia = Math.floor(t.diasTotais);
  const alvo = rastrear ? e.agentes.find(a => a.nome === rastrear) : undefined;
  if (alvo && t.diasTotais >= desde && Math.floor(t.diasTotais * 48) !== meiaHora) {
    meiaHora = Math.floor(t.diasTotais * 48);
    const c = alvo.corpo, r = (v: number) => v.toFixed(2);
    console.log(`    ${carimbo()} ${alvo.nome} ${alvo.objetivo ?? '-'} ${alvo.acao} "${alvo.intencao}" fome ${r(c.fome)} sede ${r(c.sede)} ` +
      `sono ${r(c.sono)} frio ${r(c.frio)} saúde ${r(c.saude)} pos ${alvo.x.toFixed(0)},${alvo.z.toFixed(0)} ` +
      `ameaça ${alvo.ameaca?.id ?? '-'} comida ${alvo.memoria.filter(m => m.tipo === 'comida').map(m => m.frutos).join('/')}`);
  }
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
