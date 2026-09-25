import * as THREE from 'three';
import { PERFIS, type Especie } from '../../shared/especies';
import type { AnimalRede, CarcacaRede } from '../../shared/protocolo';

// Modelos provisórios feitos de primitivas (até a Fase 4, com Blender).
// Frente do animal = +z, igual aos agentes.

export interface AnimalVisual {
  grupo: THREE.Group; pose: THREE.Group; cabeca: THREE.Group; pernas: THREE.Group[]; asas: THREE.Group[]; cauda: THREE.Group | null;
  alvo: THREE.Vector3; dados: AnimalRede; fase: number;
}

export const animais = new Map<string, AnimalVisual>();
const carcacas = new Map<number, { grupo: THREE.Group; estragada: boolean; materiais: THREE.MeshStandardMaterial[] }>();
let cena: THREE.Scene | null = null;
export function iniciarAnimais(s: THREE.Scene) { cena = s; }

const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 1 });
const PELAGEM: Record<Especie, number> = { coelho: 0x8b7355, cervo: 0x8f5f36, lobo: 0x6e6964, javali: 0x4a3a2e, ave: 0x7a5a3a, peixe: 0x9aaba3 };
const MATERIAIS = {
  coelho: mat(PELAGEM.coelho), cervo: mat(PELAGEM.cervo), lobo: mat(PELAGEM.lobo), javali: mat(PELAGEM.javali),
  ave: mat(PELAGEM.ave), aveMacho: mat(0x3a5a8c), bico: mat(0xd9a441),
  peixe: new THREE.MeshStandardMaterial({ color: PELAGEM.peixe, roughness: 0.35, metalness: 0.4 }),
  nadadeira: new THREE.MeshStandardMaterial({ color: 0x5f7a70, roughness: 0.6, side: THREE.DoubleSide }),
  claro: mat(0xe8dcc8), escuro: mat(0x241e1a), chifre: mat(0xcdbb95), focinho: mat(0x6b5448),
};
const CARNE = 0x6a2a22, ESTRAGADA = 0x4b4a2c;

const esfera = new THREE.SphereGeometry(1, 10, 8);
const caixa = new THREE.BoxGeometry(1, 1, 1);
const perna = (r: number, len: number) => new THREE.CylinderGeometry(r, r * 0.75, len, 5).translate(0, -len / 2, 0);

function peca(geo: THREE.BufferGeometry, m: THREE.Material, pos: [number, number, number], esc: [number, number, number] = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(...pos);
  mesh.scale.set(...esc);
  mesh.castShadow = true;
  return mesh;
}

function pivo(pos: [number, number, number], ...filhos: THREE.Object3D[]) {
  const g = new THREE.Group();
  g.position.set(...pos);
  g.add(...filhos);
  return g;
}

// monta o corpo; "pelo" permite trocar o material (carcaças usam cor de carne)
function montar(especie: Especie, sexo: 'M' | 'F', pelo: THREE.Material, claro: THREE.Material) {
  const pose = new THREE.Group();
  const pernas: THREE.Group[] = [];
  const asas: THREE.Group[] = [];
  let cauda: THREE.Group | null = null;
  let cabeca: THREE.Group;
  const esc = MATERIAIS.escuro;

  if (especie === 'peixe') {
    pose.add(peca(esfera, pelo, [0, 0.05, 0], [0.045, 0.06, 0.15]));
    const barbatana = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.06, 3).scale(0.2, 1, 1), MATERIAIS.nadadeira);
    barbatana.position.set(0, 0.12, -0.01);
    pose.add(barbatana);
    const leque = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.09, 3).scale(0.15, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, -0.045), MATERIAIS.nadadeira);
    cauda = pivo([0, 0.05, -0.14], leque);
    pose.add(cauda);
    cabeca = pivo([0, 0.05, 0.12], peca(esfera, MATERIAIS.escuro, [0.03, 0.015, 0], [0.01, 0.01, 0.01]),
      peca(esfera, MATERIAIS.escuro, [-0.03, 0.015, 0], [0.01, 0.01, 0.01]));
    pose.add(cabeca);
  } else if (especie === 'ave') {
    // pássaro: um pouco maior que o real para dar para ver de longe
    const penas = pelo === MATERIAIS.ave && sexo === 'M' ? MATERIAIS.aveMacho : pelo;
    pose.add(peca(esfera, penas, [0, 0.12, 0], [0.08, 0.075, 0.13]));
    pose.add(peca(esfera, claro, [0, 0.1, 0.03], [0.06, 0.055, 0.08]));
    const cauda = peca(caixa, penas, [0, 0.13, -0.15], [0.07, 0.015, 0.12]);
    cauda.rotation.x = -0.25; pose.add(cauda);
    cabeca = pivo([0, 0.18, 0.1],
      peca(esfera, penas, [0, 0.02, 0.02], [0.055, 0.055, 0.055]),
      peca(new THREE.ConeGeometry(0.018, 0.06, 4).rotateX(Math.PI / 2), MATERIAIS.bico, [0, 0.015, 0.09]),
      peca(esfera, MATERIAIS.escuro, [0.035, 0.035, 0.05], [0.01, 0.01, 0.01]),
      peca(esfera, MATERIAIS.escuro, [-0.035, 0.035, 0.05], [0.01, 0.01, 0.01]));
    pose.add(cabeca);
    for (const lado of [-1, 1]) {
      const asa = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.11).translate(0.1 * lado, 0, 0), penas);
      asa.castShadow = true;
      const pp = pivo([0.05 * lado, 0.14, 0], asa);
      asas.push(pp); pose.add(pp);
    }
  } else if (especie === 'coelho') {
    pose.add(peca(esfera, pelo, [0, 0.14, 0], [0.14, 0.13, 0.2]));
    pose.add(peca(esfera, claro, [0, 0.17, -0.2], [0.045, 0.045, 0.045]));
    cabeca = pivo([0, 0.2, 0.14],
      peca(esfera, pelo, [0, 0.03, 0.04], [0.08, 0.08, 0.09]),
      peca(caixa, pelo, [0.035, 0.14, 0], [0.03, 0.15, 0.05]),
      peca(caixa, pelo, [-0.035, 0.14, 0], [0.03, 0.15, 0.05]),
      peca(esfera, esc, [0, 0.03, 0.125], [0.015, 0.015, 0.015]));
    pose.add(cabeca);
  } else if (especie === 'cervo') {
    const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.75, 4, 8).rotateX(Math.PI / 2), pelo);
    corpo.position.set(0, 0.95, 0); corpo.castShadow = true;
    pose.add(corpo, peca(esfera, claro, [0, 1.05, -0.62], [0.07, 0.09, 0.05]));
    const pescoco = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.55, 6).translate(0, 0.27, 0), pelo);
    pescoco.rotation.x = 0.55; pescoco.castShadow = true;
    const chifres: THREE.Object3D[] = [];
    if (sexo === 'M') {
      const galho = new THREE.CylinderGeometry(0.015, 0.025, 0.4, 4).translate(0, 0.2, 0);
      for (const lado of [-1, 1]) {
        const c = new THREE.Mesh(galho, MATERIAIS.chifre);
        c.position.set(0.06 * lado, 0.58, 0.18); c.rotation.set(-0.3, 0, -0.5 * lado);
        const ponta = new THREE.Mesh(galho, MATERIAIS.chifre);
        ponta.position.set(0.12 * lado, 0.72, 0.2); ponta.rotation.set(0.4, 0, -0.9 * lado); ponta.scale.setScalar(0.6);
        chifres.push(c, ponta);
      }
    }
    cabeca = pivo([0, 1.05, 0.45], pescoco,
      peca(caixa, pelo, [0, 0.52, 0.3], [0.15, 0.17, 0.32]),
      peca(caixa, pelo, [0.07, 0.62, 0.2], [0.04, 0.12, 0.03]),
      peca(caixa, pelo, [-0.07, 0.62, 0.2], [0.04, 0.12, 0.03]),
      peca(esfera, esc, [0, 0.5, 0.47], [0.03, 0.03, 0.03]),
      ...chifres);
    pose.add(cabeca);
    const g = perna(0.04, 0.8);
    for (const [x, z] of [[0.14, 0.38], [-0.14, 0.38], [0.14, -0.38], [-0.14, -0.38]]) {
      const pp = pivo([x, 0.82, z], new THREE.Mesh(g, pelo));
      pernas.push(pp); pose.add(pp);
    }
  } else if (especie === 'javali') {
    // corpo pesado, cernelha alta, cabeça em cunha e focinho achatado
    const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.55, 4, 8).rotateX(Math.PI / 2), pelo);
    corpo.position.set(0, 0.5, 0); corpo.scale.set(0.9, 1.05, 1); corpo.castShadow = true;
    const cernelha = peca(esfera, pelo, [0, 0.66, 0.2], [0.22, 0.2, 0.28]);
    const rabo = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.2, 4).translate(0, -0.1, 0), pelo);
    rabo.position.set(0, 0.55, -0.52); rabo.rotation.x = -0.3;
    pose.add(corpo, cernelha, rabo);
    const presas: THREE.Object3D[] = [];
    if (sexo === 'M') {
      const g = new THREE.ConeGeometry(0.015, 0.09, 4);
      for (const lado of [-1, 1]) {
        const d = new THREE.Mesh(g, MATERIAIS.claro);
        d.position.set(0.06 * lado, -0.07, 0.3); d.rotation.set(-0.8, 0, 0.3 * lado);
        presas.push(d);
      }
    }
    const orelha = new THREE.ConeGeometry(0.04, 0.09, 4);
    const o1 = new THREE.Mesh(orelha, pelo), o2 = new THREE.Mesh(orelha, pelo);
    o1.position.set(0.07, 0.12, -0.02); o2.position.set(-0.07, 0.12, -0.02);
    cabeca = pivo([0, 0.55, 0.45],
      new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 6).rotateX(Math.PI / 2).translate(0, 0, 0.12), pelo),
      peca(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8).rotateX(Math.PI / 2), MATERIAIS.focinho, [0, -0.02, 0.33]),
      o1, o2, ...presas);
    pose.add(cabeca);
    const g = perna(0.04, 0.4);
    for (const [x, z] of [[0.12, 0.28], [-0.12, 0.28], [0.12, -0.28], [-0.12, -0.28]]) {
      const pp = pivo([x, 0.4, z], new THREE.Mesh(g, pelo));
      pernas.push(pp); pose.add(pp);
    }
  } else {
    const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.55, 4, 8).rotateX(Math.PI / 2), pelo);
    corpo.position.set(0, 0.6, 0); corpo.castShadow = true;
    const cauda = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.45, 5).translate(0, -0.22, 0), pelo);
    cauda.position.set(0, 0.66, -0.44); cauda.rotation.x = -0.7; cauda.castShadow = true;
    pose.add(corpo, cauda);
    const orelha = new THREE.ConeGeometry(0.04, 0.1, 4);
    const o1 = new THREE.Mesh(orelha, pelo), o2 = new THREE.Mesh(orelha, pelo);
    o1.position.set(0.06, 0.13, -0.02); o2.position.set(-0.06, 0.13, -0.02);
    cabeca = pivo([0, 0.7, 0.42],
      peca(caixa, pelo, [0, 0.03, 0.04], [0.17, 0.16, 0.2]),
      peca(caixa, claro, [0, -0.01, 0.2], [0.08, 0.07, 0.16]),
      peca(esfera, esc, [0, 0.01, 0.285], [0.022, 0.022, 0.022]),
      o1, o2);
    pose.add(cabeca);
    const g = perna(0.035, 0.55);
    for (const [x, z] of [[0.1, 0.26], [-0.1, 0.26], [0.1, -0.26], [-0.1, -0.26]]) {
      const pp = pivo([x, 0.56, z], new THREE.Mesh(g, pelo));
      pernas.push(pp); pose.add(pp);
    }
  }
  return { pose, cabeca, pernas, asas, cauda };
}

function criarAnimal(e: AnimalRede): AnimalVisual {
  const { pose, cabeca, pernas, asas, cauda } = montar(e.especie, e.sexo, MATERIAIS[e.especie], MATERIAIS.claro);
  const grupo = new THREE.Group();
  grupo.add(pose);
  grupo.position.set(e.x, e.y, e.z);
  grupo.rotation.y = e.rotacao;
  cena?.add(grupo);
  const v: AnimalVisual = { grupo, pose, cabeca, pernas, asas, cauda, alvo: new THREE.Vector3(e.x, e.y, e.z), dados: e, fase: Math.random() * 6 };
  animais.set(e.id, v);
  return v;
}

function criarCarcaca(k: CarcacaRede) {
  const materiais = [new THREE.MeshStandardMaterial({ color: CARNE, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0x8a6d5a, roughness: 1 })];
  const { pose } = montar(k.especie, 'F', materiais[0], materiais[1]);
  const grupo = new THREE.Group();
  const deitado = new THREE.Group();
  deitado.add(pose);
  deitado.rotation.z = Math.PI / 2;               // caído de lado
  deitado.position.y = PERFIS[k.especie].raio * 0.8;
  grupo.add(deitado);
  grupo.position.set(k.x, k.y, k.z);
  grupo.rotation.y = k.rotacao;
  cena?.add(grupo);
  const c = { grupo, estragada: false, materiais };
  carcacas.set(k.id, c);
  return c;
}

export function aplicarAnimais(lista: AnimalRede[], listaCarcacas: CarcacaRede[]) {
  const presentes = new Set<string>();
  for (const e of lista) {
    presentes.add(e.id);
    const v = animais.get(e.id) ?? criarAnimal(e);
    v.alvo.set(e.x, e.y, e.z);
    v.dados = e;
  }
  for (const [id, v] of animais) if (!presentes.has(id)) { cena?.remove(v.grupo); animais.delete(id); }

  const ks = new Set<number>();
  for (const k of listaCarcacas) {
    ks.add(k.id);
    const c = carcacas.get(k.id) ?? criarCarcaca(k);
    if (k.estragada !== c.estragada) { c.estragada = k.estragada; c.materiais[0].color.setHex(k.estragada ? ESTRAGADA : CARNE); }
    const max = PERFIS[k.especie].porcoesDeCarne;
    c.grupo.scale.setScalar(0.55 + 0.45 * Math.min(1, k.porcoes / max));   // vai sendo comida
  }
  for (const [id, c] of carcacas) if (!ks.has(id)) { cena?.remove(c.grupo); carcacas.delete(id); }
}

export function contarAnimais() {
  const n: Record<Especie, number> = { coelho: 0, cervo: 0, lobo: 0, javali: 0, ave: 0, peixe: 0 };
  for (const v of animais.values()) n[v.dados.especie]++;
  return n;
}

const perto = new THREE.Vector3();

export function animarAnimais(dt: number, camera: THREE.Camera) {
  const k = 1 - Math.exp(-dt * 10);
  camera.getWorldPosition(perto);
  for (const v of animais.values()) {
    const e = v.dados, acao = e.acao;
    v.grupo.visible = v.grupo.position.distanceToSquared(perto) < 170 * 170;
    if (!v.grupo.visible) { v.grupo.position.copy(v.alvo); continue; }

    const movendo = acao === 'andando' || acao === 'correndo';
    v.grupo.position.lerp(v.alvo, k);
    if (acao !== 'dormindo' && acao !== 'morto') {
      const diff = ((e.rotacao - v.grupo.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      v.grupo.rotation.y += diff * k;
    }
    const tamanho = 0.45 + 0.55 * e.crescimento;
    const largura = 1 + (e.necessidades.gordura ?? 0) * 0.18;   // gordos no outono, magros no fim do inverno
    v.grupo.scale.set(tamanho * largura, tamanho, tamanho);

    if (movendo) v.fase += dt * (acao === 'correndo' ? 16 : 7);
    const amp = acao === 'correndo' ? 0.9 : movendo ? 0.45 : 0;
    const dormindo = acao === 'dormindo' || acao === 'escondido';
    v.pernas.forEach((p, i) => {
      const alvo = dormindo ? 1.3 : Math.sin(v.fase + (i === 0 || i === 3 ? 0 : Math.PI)) * amp;
      p.rotation.x += (alvo - p.rotation.x) * Math.min(1, k * 2);
    });

    // asas: batem no voo, fechadas no chão ou no galho
    v.asas.forEach((a, i) => {
      const lado = i === 0 ? -1 : 1;
      const alvo = movendo ? Math.sin(performance.now() / (acao === 'correndo' ? 40 : 60) + v.fase) * 0.9 * lado : -1.2 * lado;
      a.rotation.z += (alvo - a.rotation.z) * Math.min(1, movendo ? 1 : k * 2);
    });

    // cauda do peixe: ondula nadando, mais rápido quando foge
    if (v.cauda) v.cauda.rotation.y = Math.sin(performance.now() / (acao === 'correndo' ? 50 : movendo ? 120 : 400) + v.fase) * (movendo ? 0.6 : 0.2);

    const altura = PERFIS[e.especie].altura;
    let y = 0;
    if (e.especie === 'coelho' && movendo) y = Math.abs(Math.sin(v.fase * 0.7)) * (acao === 'correndo' ? 0.15 : 0.06);   // pulinhos
    if (dormindo) y = e.especie === 'coelho' ? -0.03 : -altura * 0.5;
    v.pose.position.y += (y - v.pose.position.y) * Math.min(1, k * 2);

    const fucando = acao === 'fucando';
    const cabecaBaixa = acao === 'comendo' || acao === 'bebendo' ? 0.9 : fucando ? 0.75 + Math.sin(performance.now() / 180) * 0.12
      : dormindo ? 0.4 : acao === 'atacando' ? 0.35 : 0;
    v.cabeca.rotation.x += (cabecaBaixa - v.cabeca.rotation.x) * k;
    const inclinacao = acao === 'atacando' ? 0.15 : 0;
    v.pose.rotation.x += (inclinacao - v.pose.rotation.x) * k;
  }
}
