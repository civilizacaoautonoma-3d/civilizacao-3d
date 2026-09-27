// Simulação sem interface para validar mudanças no motor.
// Uso: npx tsx scripts/validar.ts [dias] [--tudo] [--rastrear Nome --desde Dia]
//   --salvar arq / --carregar arq: continua uma validação longa em blocos (o [dias] é o dia final, contado desde o início)
//   --rastrear mostra, a cada meia hora do mundo, o que aquele agente está fazendo a partir do dia indicado.
// Roda um mundo novo (não toca em data/) o mais rápido possível e mostra o censo diário.
import { SEED, mulberry32 } from '../../shared/mundo';
import { TEMPO, tempoDoMundo } from '../../shared/clima';
import fs from 'node:fs';
import { DT, censo, horaDoMundo, migrar, mundoNovo, passoDoMundo } from '../src/simulacao';
import { configurarMente, type RegistroDeliberacao } from '../src/deliberacao';
import { provedorTeste } from '../src/provedores';
import { descreverRelacao, melhorPalavra, traduzir } from '../src/social';

const dias = Number(process.argv.slice(2).find((a, i, v) => /^\d+$/.test(a) && v[i - 1] !== '--desde') ?? 30);
const tudo = process.argv.includes('--tudo');
const arg = (nome: string) => { const i = process.argv.indexOf(nome); return i >= 0 ? process.argv[i + 1] : undefined; };
const rastrear = arg('--rastrear');
const desde = Number(arg('--desde') ?? 0);
const VEL = 60;

// a validação usa o deliberador de teste (sem rede, determinístico)
const deliberacoes: RegistroDeliberacao[] = [];
configurarMente({ provedor: provedorTeste, registrar: r => deliberacoes.push(r), avisar: t => registrar(t) });

const carregar = arg('--carregar'), salvar = arg('--salvar');
const salvo = carregar ? JSON.parse(fs.readFileSync(carregar, 'utf8')) : null;
let ms: number = salvo?.ms ?? TEMPO.INICIO_DO_MUNDO;
const rand = mulberry32(SEED * 31 + (salvo?.estado.tick ?? 0));
const e = salvo ? migrar(salvo.estado, horaDoMundo(ms), rand)! : mundoNovo(0, mulberry32(SEED * 17));

const pad = (n: number) => String(n).padStart(2, '0');
const carimbo = () => { const t = tempoDoMundo(ms); return `D${pad(t.diaDoAno)} ${pad(t.hora)}:${pad(t.minuto)}`; };
const contagem = new Map<string, number>();
const rotina = /foi dormir|^(\S+) acordou$|descobriu|encontrou um arbusto|disse "/;

function registrar(t: string) {
  const quem = e.agentes.find(a => t.startsWith(a.nome + ' '));
  const tipo = (quem ? '<agente> ' + t.slice(quem.nome.length + 1) : t).replace(/\d+/g, 'N');
  contagem.set(tipo, (contagem.get(tipo) ?? 0) + 1);
  if (t.startsWith('Censo')) return;
  const deAgente = !!quem;
  if (tudo || (deAgente && !rotina.test(t)) || /chegou de fora|matilha|deixou|descobriu:|aprendeu com|raio|palavra em comum|Nasceu|como um par/.test(t)) console.log(`  [${carimbo()}] ${t}`);
}

const inicio = performance.now();
let diaAnterior = -1, meiaHora = -1;
while (tempoDoMundo(ms).diasTotais < dias + 0.25) {
  passoDoMundo(e, ms, VEL, rand, registrar);
  ms += DT * 1000 * VEL;
  const t = tempoDoMundo(ms);
  const dia = Math.floor(t.diasTotais);
  const alvos = rastrear ? e.agentes.filter(a => rastrear.split(',').includes(a.nome)) : [];
  if (alvos.length && t.diasTotais >= desde && Math.floor(t.diasTotais * 48) !== meiaHora) {
    meiaHora = Math.floor(t.diasTotais * 48);
    for (const alvo of alvos) {
    const c = alvo.corpo, r = (v: number) => v.toFixed(2);
    console.log(`    ${carimbo()} ${alvo.nome} ${alvo.objetivo ?? '-'} ${alvo.acao} "${alvo.intencao}" fome ${r(c.fome)} sede ${r(c.sede)} ` +
      `sono ${r(c.sono)} frio ${r(c.frio)} saúde ${r(c.saude)} pos ${alvo.x.toFixed(0)},${alvo.z.toFixed(0)} ` +
      `ameaça ${alvo.ameaca?.id ?? '-'} comida ${alvo.memoria.filter(m => m.tipo === 'comida').map(m => m.frutos).join('/')}`);
    }
  }
  if (dia !== diaAnterior && t.hora === 12) {
    diaAnterior = dia;
    const ag = e.agentes.map(a => `${a.nome} ${a.vivo ? `saúde ${Math.round(a.corpo.saude * 100)}% fome ${Math.round(a.corpo.fome * 100)}%` : `MORTO (${a.causaMorte})`}`).join(' | ');
    console.log(`Dia ${pad(t.diaDoAno)} ${t.estacao.padEnd(9)} ${censo(e)}  ||  ${ag}`);
  }
}
const seg = (performance.now() - inicio) / 1000;
const porTipo = (t: string) => deliberacoes.filter(d => d.tipo === t);
console.log(`\nDeliberações: ${['plano', 'evento', 'reflexao', 'consequencia'].map(t => `${porTipo(t).length} ${t}`).join(' · ')}`);
const rejeicoes = deliberacoes.flatMap(d => d.rejeitado ?? []);
console.log(`  aplicadas: ${deliberacoes.filter(d => d.aplicado && d.tipo !== 'consequencia').length} · com rejeição: ${rejeicoes.length} · erros: ${deliberacoes.filter(d => d.erro).length}`);
for (const d of deliberacoes.filter(x => x.tipo === 'evento').slice(0, 3)) console.log(`  evento (${d.agente}): ${d.situacao?.evento} -> ${d.aplicado ?? d.erro}`);
console.log(`\nDescobertas (Fase 10): ${e.descobertas.length}`);
for (const d of e.descobertas) console.log(`  dia ${Math.floor(d.quando / 24) + 1} ${d.quem} (${d.como}): ${d.descricao}` +
  (d.transmitidaPara.length ? ` -> passou para ${d.transmitidaPara.map(t => `${t.quem} (dia ${Math.floor(t.quando / 24) + 1})`).join(', ')}` : ''));
for (const a of e.agentes) console.log(`  ${a.nome} sabe: ${Object.keys(a.tecnico.sabe).join(', ') || 'nada'} · tentou ${Object.values(a.tecnico.tentou).reduce((s, v) => s + v, 0)} vezes`);
for (const a of e.agentes) console.log(`  ${a.nome} cavernas: ${JSON.stringify(a.cavernas)} · casa: ${a.lar ?? 'nenhuma'}`);
console.log('\nLinguagem e relações (Fase 11):');
for (const a of e.agentes) {
  const c = a.social.contagem;
  const palavras = Object.keys(a.social.lexico).map(k => ({ k, p: melhorPalavra(a, k) })).filter(x => x.p)
    .map(x => `"${x.p}"=${traduzir(x.k, e)}${e.agentes.some(o => o !== a && melhorPalavra(o, x.k) === x.p) ? '✔' : ''}`);
  console.log(`  ${a.nome}: ${c.falas} falas · ${c.entendidas} entendidas · ${c.desencontros} desencontros · ${c.avisos} avisos ouvidos · dicas ${c.dicasCertas} certas/${c.dicasErradas} erradas`);
  console.log(`    palavras: ${palavras.join(' ') || 'nenhuma'}`);
  for (const [id, r] of Object.entries(a.social.relacoes))
    console.log(`    com ${e.agentes.find(x => x.id === id)?.nome}: ${descreverRelacao(r)} (afeto ${r.afeto.toFixed(2)}, confiança ${r.confianca.toFixed(2)}, respeito ${r.respeito.toFixed(2)}, mágoa ${r.ressentimento.toFixed(2)}, ${Math.round(r.convivencia)} h juntos)`);
}
console.log('\nÁrvore genealógica (Fase 12):');
const dia = (h: number) => Math.floor(h / 24) + 1;
for (const p of e.genealogia) {
  const pais = [p.mae, p.pai].map(id => e.genealogia.find(x => x.id === id)?.nome).filter(Boolean).join(' e ');
  console.log(`  ${p.nome} (${p.sexo}, geração ${p.geracao})${pais ? ` ${p.sexo === 'F' ? 'filha' : 'filho'} de ${pais}` : ' fundador'}` +
    `${p.nascidoEm > 0 ? `, nasceu no dia ${dia(p.nascidoEm)}` : ''}${p.morreuEm !== null ? `, morreu no dia ${dia(p.morreuEm)} (${p.causa})` : ''}`);
}
const tiposObj: Record<string, number> = {};
for (const o of e.objetos) tiposObj[o.tipo] = (tiposObj[o.tipo] ?? 0) + 1;
console.log(`  objetos no mundo: ${Object.entries(tiposObj).map(([k, v]) => `${v} ${k}`).join(', ')}`);
console.log(`\n${dias} dias simulados em ${seg.toFixed(1)} s`);
console.log('\nEventos:');
for (const [k, v] of [...contagem].sort((a, b) => b[1] - a[1])) if (!k.startsWith('Censo')) console.log(`  ${String(v).padStart(6)}  ${k}`);
if (salvar) fs.writeFileSync(salvar, JSON.stringify({ estado: e, ms }));
