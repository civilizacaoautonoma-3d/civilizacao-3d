import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { SEED, WORLD_SIZE, WATER_LEVEL, PONTO_INICIAL, heightAt, mulberry32, resolverColisao } from '../../shared/mundo';
import { tempoDoMundo } from '../../shared/clima';
import type { Acao, EntidadeRede, MensagemCliente, MensagemServidor } from '../../shared/protocolo';

// ---------- Configuração ----------
const PORTA = Number(process.env.PORTA ?? 8080);
const MODO = process.env.MODO ?? 'dev';          // 'dev' permite acelerar o tempo
const TICKS_POR_SEGUNDO = 10;
const DT = 1 / TICKS_POR_SEGUNDO;
const VELOCIDADES = [1, 60, 600, 3600];
const ARQUIVO = path.resolve('data', 'estado.json');
const LIMITE = WORLD_SIZE / 2 - 8;

// ---------- Estado ----------
interface Agente {
  id: string; nome: string; sexo: 'M' | 'F';
  x: number; y: number; z: number; rotacao: number; acao: Acao;
  alvo: { x: number; z: number } | null; espera: number; travado: number;
}
interface EstadoSalvo { versao: 1; tick: number; deslocamentoMs: number; velocidadeIdx: number; agentes: Agente[] }

function novoAgente(id: string, nome: string, sexo: 'M' | 'F', dx: number, dz: number): Agente {
  const x = PONTO_INICIAL.x + dx, z = PONTO_INICIAL.z + dz;
  return { id, nome, sexo, x, y: heightAt(x, z), z, rotacao: 0, acao: 'parado', alvo: null, espera: 0, travado: 0 };
}

function carregar(): EstadoSalvo {
  try {
    const e = JSON.parse(fs.readFileSync(ARQUIVO, 'utf8')) as EstadoSalvo;
    if (e.versao === 1) { console.log(`Estado carregado (tick ${e.tick}).`); return e; }
  } catch { /* primeira execução */ }
  console.log('Criando um mundo novo.');
  return {
    versao: 1, tick: 0, deslocamentoMs: 0, velocidadeIdx: 0,
    agentes: [novoAgente('ag_001', 'Aru', 'M', 5, 2), novoAgente('ag_002', 'Nia', 'F', 6, -2)],
  };
}

const estado = carregar();

function salvar() {
  fs.mkdirSync(path.dirname(ARQUIVO), { recursive: true });
  const tmp = ARQUIVO + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(estado));
  fs.renameSync(tmp, ARQUIVO);
}

// ---------- Comportamento provisório (vira utilidade + necessidades na Fase 5) ----------
const aleatorio = mulberry32(SEED * 31 + estado.tick);
const terraSeca = (x: number, z: number) =>
  Math.abs(x) < LIMITE && Math.abs(z) < LIMITE && heightAt(x, z) > WATER_LEVEL + 0.5;

function escolherAlvo(a: Agente) {
  for (let i = 0; i < 12; i++) {
    const ang = aleatorio() * Math.PI * 2, d = 5 + aleatorio() * 25;
    const x = a.x + Math.cos(ang) * d, z = a.z + Math.sin(ang) * d;
    if (terraSeca(x, z)) return { x, z };
  }
  return null;
}

function atualizarAgente(a: Agente) {
  if (a.espera > 0) { a.espera -= DT; a.acao = 'parado'; return; }
  if (!a.alvo) {
    a.alvo = escolherAlvo(a);
    if (!a.alvo) { a.espera = 2; return; }
  }
  const dx = a.alvo.x - a.x, dz = a.alvo.z - a.z, dist = Math.hypot(dx, dz);
  if (dist < 0.5) {
    a.alvo = null; a.acao = 'parado';
    a.espera = aleatorio() < 0.6 ? 2 + aleatorio() * 8 : 0;
    return;
  }
  const passo = Math.min(dist, 1.4 * DT);                 // 1,4 m/s: caminhada humana
  const nx = a.x + (dx / dist) * passo, nz = a.z + (dz / dist) * passo;
  if (!terraSeca(nx, nz)) { a.alvo = null; return; }

  const antesX = a.x, antesZ = a.z;
  a.x = nx; a.z = nz;
  resolverColisao(a, 0.35);
  const andou = Math.hypot(a.x - antesX, a.z - antesZ);
  a.travado = andou < passo * 0.3 ? a.travado + 1 : 0;
  if (a.travado > 20) { a.alvo = null; a.travado = 0; }   // preso numa árvore: muda de ideia

  a.y = heightAt(a.x, a.z);
  a.rotacao = Math.atan2(dx, dz);
  a.acao = 'andando';
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

const paraRede = (a: Agente): EntidadeRede => ({
  id: a.id, nome: a.nome, sexo: a.sexo, x: a.x, y: a.y, z: a.z, rotacao: a.rotacao, acao: a.acao });

// ---------- Loop principal ----------
setInterval(() => {
  estado.tick++;
  estado.deslocamentoMs += DT * 1000 * (VELOCIDADES[estado.velocidadeIdx] - 1);
  for (const a of estado.agentes) atualizarAgente(a);

  const msg: MensagemServidor = {
    tipo: 'estado', tick: estado.tick, msMundo: Date.now() + estado.deslocamentoMs,
    velocidade: VELOCIDADES[estado.velocidadeIdx], entidades: estado.agentes.map(paraRede),
  };
  const texto = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(texto);
}, 1000 / TICKS_POR_SEGUNDO);

setInterval(salvar, 10_000);

const pad = (n: number) => String(n).padStart(2, '0');
setInterval(() => {
  const t = tempoDoMundo(Date.now() + estado.deslocamentoMs);
  console.log(`[Ano ${t.ano} · Dia ${t.diaDoAno} · ${pad(t.hora)}:${pad(t.minuto)}] tick ${estado.tick} · ` +
    `${estado.agentes.length} agentes · ${wss.clients.size} observadores`);
}, 30_000);

const encerrar = () => { salvar(); console.log('Estado salvo.'); process.exit(0); };
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);

console.log(`Motor rodando em ws://localhost:${PORTA} (modo ${MODO})`);