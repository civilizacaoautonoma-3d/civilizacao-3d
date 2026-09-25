import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { SEED, PONTO_INICIAL, ARBUSTOS, mulberry32 } from '../../shared/mundo';
import { estadoDoCeu, tempoDoMundo, TEMPO } from '../../shared/clima';
import type { EntidadeRede, MensagemCliente, MensagemServidor } from '../../shared/protocolo';
import { atualizarAgente, novoAgente, type Agente, type Contexto } from './agente';

// ---------- Configuração ----------
const PORTA = Number(process.env.PORTA ?? 8080);
const MODO = process.env.MODO ?? 'dev';
const TICKS_POR_SEGUNDO = 10;
const DT = 1 / TICKS_POR_SEGUNDO;
const VELOCIDADES = [1, 4, 15, 60];                           // ×60: 1 dia do mundo = 24 segundos
const HORAS_POR_PASSO = (DT * 24) / TEMPO.HORAS_REAIS_POR_DIA / 3600;
const PASTA = path.resolve('data');
const ARQUIVO = path.join(PASTA, 'estado.json');
const EVENTOS = path.join(PASTA, 'eventos.log');
const FATOR_ESTACAO = { 'Primavera': 1, 'Verão': 1.4, 'Outono': 0.8, 'Inverno': 0.3 } as const;

// ---------- Estado ----------
interface EstadoSalvo {
  versao: 2; tick: number; deslocamentoMs: number; velocidadeIdx: number;
  agentes: Agente[]; frutos: number[]; criadoEm?: number;
}

function mundoNovo(): EstadoSalvo {
  console.log('Criando um mundo novo.');
  return {
    versao: 2, tick: 0, deslocamentoMs: 0, velocidadeIdx: 0,
    criadoEm: Date.now(),
    agentes: [
      novoAgente('ag_001', 'Aru', 'M', PONTO_INICIAL.x + 5, PONTO_INICIAL.z + 2),
      novoAgente('ag_002', 'Nia', 'F', PONTO_INICIAL.x + 6, PONTO_INICIAL.z - 2),
    ],
    frutos: ARBUSTOS.map(b => Math.ceil(b.max / 2)),
  };
}

function carregar(): EstadoSalvo {
  try {
    const e = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8')) as EstadoSalvo;
    if (e.versao === 2) { console.log(`Estado carregado (tick ${e.tick}).`); return e; }
    console.log('O estado salvo é de uma versão antiga.');
  } catch { /* primeira execução */ }
  return mundoNovo();
}

const estado = carregar();
if (estado.velocidadeIdx >= VELOCIDADES.length) estado.velocidadeIdx = 0;
const criadoEm = estado.criadoEm ?? TEMPO.INICIO_DO_MUNDO;   // mundos antigos continuam de onde estavam
estado.criadoEm = criadoEm;

// cada mundo começa no Dia 1 às 06:00, no momento em que foi criado
const msMundo = () => TEMPO.INICIO_DO_MUNDO + (Date.now() - criadoEm) + estado.deslocamentoMs;

function salvar() {
  fs.mkdirSync(PASTA, { recursive: true });
  const tmp = ARQUIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(estado));
  fs.renameSync(tmp, ARQUIVO);
}

const pad = (n: number) => String(n).padStart(2, '0');
function carimbo() {
  const t = tempoDoMundo(msMundo());
  return `Ano ${t.ano} · Dia ${t.diaDoAno} · ${pad(t.hora)}:${pad(t.minuto)}`;
}
function registrar(texto: string) {
  const linha = `[${carimbo()}] ${texto}`;
  console.log(linha);
  fs.mkdirSync(PASTA, { recursive: true });
  fs.appendFileSync(EVENTOS, linha + '\n');
}

// ---------- Simulação ----------
const aleatorio = mulberry32(SEED * 31 + estado.tick);

function passo() {
  estado.tick++;
  const vel = VELOCIDADES[estado.velocidadeIdx];
  const ceu = estadoDoCeu(msMundo(), SEED);
  const horaBase = ceu.tempo.diasTotais * 24;
  const base = {
    horas: HORAS_POR_PASSO, dt: DT, luz: ceu.luzDoDia, noite: ceu.luzDoDia < 0.15,
    temperatura: ceu.clima.temperatura, chuva: ceu.clima.chuva, vento: ceu.clima.vento,
    frutos: estado.frutos, agentes: estado.agentes, rand: aleatorio,
    evento: (a: Agente, t: string) => registrar(`${a.nome} ${t}`),
  };

  // com o tempo acelerado, roda vários passos de vida por tick
  for (let s = 0; s < vel; s++) {
    const ctx: Contexto = { ...base, hora: horaBase + s * HORAS_POR_PASSO };
    for (const a of estado.agentes) atualizarAgente(a, ctx);
  }

  // frutos crescem de novo (mais no verão, quase nada no inverno)
  const horas = vel * HORAS_POR_PASSO, fator = FATOR_ESTACAO[ceu.tempo.estacao];
  ARBUSTOS.forEach((b, i) => {
    if (estado.frutos[i] < b.max && aleatorio() < (horas / 8) * fator) estado.frutos[i]++;
  });

  estado.deslocamentoMs += DT * 1000 * (vel - 1);
}

// ---------- Rede ----------
const wss = new WebSocketServer({ port: PORTA });
const enviar = (ws: WebSocket, m: MensagemServidor) => ws.send(JSON.stringify(m));

wss.on('connection', ws => {
  enviar(ws, { tipo: 'boas-vindas', seed: SEED, ticksPorSegundo: TICKS_POR_SEGUNDO, modo: MODO });
  ws.on('message', dados => {
    try {
      const m = JSON.parse(String(dados)) as MensagemCliente;
      if (m.tipo === 'alternar-velocidade' && MODO === 'dev') {
        estado.velocidadeIdx = (estado.velocidadeIdx + 1) % VELOCIDADES.length;
        console.log(`Velocidade do tempo: ×${VELOCIDADES[estado.velocidadeIdx]}`);
      }
    } catch { /* mensagem inválida: ignora */ }
  });
});

const r2 = (v: number) => Math.round(v * 100) / 100;
const paraRede = (a: Agente): EntidadeRede => ({
  id: a.id, nome: a.nome, sexo: a.sexo, x: a.x, y: a.y, z: a.z, rotacao: a.rotacao,
  acao: a.acao, intencao: a.intencao,
  necessidades: {
    fome: r2(a.corpo.fome), sede: r2(a.corpo.sede), sono: r2(a.corpo.sono),
    energia: r2(a.corpo.energia), saude: r2(a.corpo.saude), frio: r2(a.corpo.frio),
  },
  memoria: {
    agua: a.memoria.filter(m => m.tipo === 'agua').length,
    comida: a.memoria.filter(m => m.tipo === 'comida').length,
  },
});

function transmitir() {
  const msg: MensagemServidor = {
    tipo: 'estado', tick: estado.tick, msMundo: msMundo(),
    velocidade: VELOCIDADES[estado.velocidadeIdx],
    entidades: estado.agentes.map(paraRede), frutos: estado.frutos,
  };
  const texto = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(texto);
}

// ---------- Loop com passo fixo (compensa o atraso do timer) ----------
let ultimo = performance.now();
let acumulado = 0;
setInterval(() => {
  const agora = performance.now();
  acumulado += (agora - ultimo) / 1000;
  ultimo = agora;
  let n = 0;
  while (acumulado >= DT && n < 5) { passo(); acumulado -= DT; n++; }
  if (n === 5) acumulado = 0;   // se o computador travar, não tenta recuperar tudo de uma vez
  if (n > 0) transmitir();
}, 20);

setInterval(salvar, 10_000);

const pct = (v: number) => `${Math.round(v * 100)}%`;
setInterval(() => {
  const c = estadoDoCeu(msMundo(), SEED).clima;
  console.log(`[${carimbo()}] tick ${estado.tick} · ${c.tipo} ${c.temperatura.toFixed(1)} °C · ${wss.clients.size} observadores`);
  for (const a of estado.agentes) {
    const n = a.corpo;
    console.log(`   ${a.nome}: ${a.intencao} · fome ${pct(n.fome)} · sede ${pct(n.sede)} · sono ${pct(n.sono)} · ` +
      `energia ${pct(n.energia)} · saúde ${pct(n.saude)}`);
  }
}, 30_000);

const encerrar = () => { salvar(); console.log('Estado salvo.'); process.exit(0); };
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

console.log(`Motor rodando em ws://localhost:${PORTA} (modo ${MODO})`);
