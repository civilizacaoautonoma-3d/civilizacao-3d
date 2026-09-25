import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { SEED, mulberry32 } from '../../shared/mundo';
import { estadoDoCeu, tempoDoMundo, TEMPO } from '../../shared/clima';
import type { MensagemCliente, MensagemServidor } from '../../shared/protocolo';
import { DT, TICKS_POR_SEGUNDO, censo, horaDoMundo, migrar, mundoNovo, passoDoMundo, retrato, type Estado } from './simulacao';

// ---------- Configuração ----------
const PORTA = Number(process.env.PORTA ?? 8080);
const MODO = process.env.MODO ?? 'dev';
const VELOCIDADES = [1, 4, 15, 60];                           // ×60: 1 dia do mundo = 24 segundos
const PASTA = path.resolve('data');
const ARQUIVO = path.join(PASTA, 'estado.json');
const EVENTOS = path.join(PASTA, 'eventos.log');

// ---------- Estado ----------
// cada mundo começa no Dia 1 às 06:00, no momento em que foi criado
const msMundoDe = (e: { criadoEm?: number; deslocamentoMs: number }) =>
  TEMPO.INICIO_DO_MUNDO + (Date.now() - (e.criadoEm ?? TEMPO.INICIO_DO_MUNDO)) + e.deslocamentoMs;

function carregar(): Estado {
  try {
    const dados = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8'));
    const versaoAntiga = dados.versao;
    const e = migrar(dados, horaDoMundo(msMundoDe(dados)), mulberry32(SEED * 17 + (dados.tick ?? 0)));
    if (e) {
      console.log(versaoAntiga === 3 ? `Estado carregado (tick ${e.tick}).`
        : `Estado da versão ${versaoAntiga} atualizado: os animais chegaram ao vale (tick ${e.tick}).`);
      return e;
    }
    console.log('O estado salvo é de uma versão antiga.');
  } catch { /* primeira execução */ }
  console.log('Criando um mundo novo.');
  return mundoNovo(Date.now(), mulberry32(SEED * 17));
}

const estado = carregar();
if (estado.velocidadeIdx >= VELOCIDADES.length) estado.velocidadeIdx = 0;
const msMundo = () => msMundoDe(estado);

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
  const vel = VELOCIDADES[estado.velocidadeIdx];
  passoDoMundo(estado, msMundo(), vel, aleatorio, registrar);
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

function transmitir() {
  if (wss.clients.size === 0) return;
  const texto = JSON.stringify(retrato(estado, msMundo(), VELOCIDADES[estado.velocidadeIdx]));
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
  console.log(`   ${censo(estado)}`);
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
