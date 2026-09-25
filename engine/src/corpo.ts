import type { Acao, Necessidades } from '../../shared/protocolo';

export interface Ambiente {
  temperatura: number; chuva: number; vento: number;
  noite: boolean; abrigado: boolean; acompanhado: boolean;
}

const lim = (v: number) => Math.min(1, Math.max(0, v));

export const novoCorpo = (): Necessidades => ({ fome: 0.3, sede: 0.3, sono: 0.2, energia: 0.9, saude: 1, frio: 0 });

// "horas" = quanto tempo do mundo passou neste passo
export function atualizarCorpo(n: Necessidades, horas: number, acao: Acao, amb: Ambiente) {
  const dormindo = acao === 'dormindo';
  const andando = acao === 'andando';

  // temperatura sentida
  let sentida = amb.temperatura;
  if (!amb.abrigado) sentida -= amb.chuva * 5 + amb.vento * 3;
  if (amb.acompanhado) sentida += 3;   // corpos próximos se aquecem
  if (dormindo) sentida -= 2;
  if (andando) sentida += 1.5;
  n.frio = lim((16 - sentida) / 14);
  const calor = lim((sentida - 28) / 10);

  const metabolismo = dormindo ? 0.35 : 1;   // dormindo, o corpo gasta bem menos
  n.fome = lim(n.fome + horas * (1 / 16) * metabolismo * (1 + n.frio * 0.5));
  n.sede = lim(n.sede + horas * (1 / 10) * metabolismo * (1 + calor));

  if (dormindo) {
    n.sono = lim(n.sono - horas / 7);
    n.energia = lim(n.energia + horas / 5);
  } else {
    n.sono = lim(n.sono + horas * (1 / 18) * (amb.noite ? 1.5 : 1));
    n.energia = lim(n.energia + horas * (andando ? -1 / 6 : 1 / 4));
  }

  let dano = 0;
  if (n.sede >= 1) dano += 1 / 24;
  if (n.fome >= 1) dano += 1 / 72;
  if (n.frio > 0.7) dano += (n.frio - 0.7) / 12;
  if (n.sono >= 1) dano += 1 / 96;
  if (dano > 0) n.saude = lim(n.saude - dano * horas);
  else if (n.fome < 0.6 && n.sede < 0.6 && n.frio < 0.5) n.saude = lim(n.saude + horas / 48);
}

export function causaDaMorte(n: Necessidades) {
  if (n.sede >= 1) return 'sede';
  if (n.fome >= 1) return 'fome';
  if (n.frio > 0.7) return 'frio';
  return 'exaustão';
}
