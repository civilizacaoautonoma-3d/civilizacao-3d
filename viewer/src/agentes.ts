import * as THREE from 'three';
import type { EntidadeRede } from '../../shared/protocolo';

export interface AgenteVisual {
  grupo: THREE.Group; pose: THREE.Group; corpo: THREE.Mesh; pele: THREE.MeshStandardMaterial;
  alvo: THREE.Vector3; dados: EntidadeRede; fase: number;
}

export const agentes = new Map<string, AgenteVisual>();
let cena: THREE.Scene | null = null;
export function iniciarAgentes(s: THREE.Scene) { cena = s; }

function criarAgente(e: EntidadeRede): AgenteVisual {
  const pele = new THREE.MeshStandardMaterial({ color: e.sexo === 'M' ? 0xb07850 : 0xd09a74 });
  const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(e.sexo === 'M' ? 0.3 : 0.26, e.sexo === 'M' ? 1.05 : 0.95, 4, 8), pele);
  corpo.position.y = 0.8;
  const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), pele);
  cabeca.position.y = 1.72;
  const nariz = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.1), pele);
  nariz.position.set(0, 1.72, 0.2);
  corpo.castShadow = cabeca.castShadow = true;

  const pose = new THREE.Group();          // inclina ou deita o corpo
  pose.add(corpo, cabeca, nariz);
  const grupo = new THREE.Group();         // posição e direção
  grupo.add(pose);
  grupo.position.set(e.x, e.y, e.z);
  grupo.rotation.y = e.rotacao;
  cena?.add(grupo);

  const v: AgenteVisual = { grupo, pose, corpo, pele, alvo: new THREE.Vector3(e.x, e.y, e.z), dados: e, fase: 0 };
  agentes.set(e.id, v);
  return v;
}

export function aplicarEntidades(lista: EntidadeRede[]) {
  const presentes = new Set<string>();
  for (const e of lista) {
    presentes.add(e.id);
    const v = agentes.get(e.id) ?? criarAgente(e);
    v.alvo.set(e.x, e.y, e.z);
    v.dados = e;
  }
  for (const [id, v] of agentes) if (!presentes.has(id)) { cena?.remove(v.grupo); agentes.delete(id); }
}

const CINZA = new THREE.Color(0x777777);

export function animarAgentes(dt: number) {
  const k = 1 - Math.exp(-dt * 10);
  for (const v of agentes.values()) {
    const acao = v.dados.acao;
    const deitado = acao === 'dormindo' || acao === 'morto';
    v.grupo.position.lerp(v.alvo, k);
    if (!deitado) {
      const diff = ((v.dados.rotacao - v.grupo.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      v.grupo.rotation.y += diff * k;
    }
    const inclinacao = deitado ? -Math.PI / 2 : acao === 'comendo' || acao === 'bebendo' ? 0.5
      : acao === 'correndo' ? 0.25 : acao === 'atacando' ? 0.45 : 0;
    v.pose.rotation.x += (inclinacao - v.pose.rotation.x) * k * 0.5;
    v.pose.position.y += ((deitado ? 0.3 : 0) - v.pose.position.y) * k * 0.5;
    if (acao === 'andando' || acao === 'correndo') v.fase += dt * (acao === 'correndo' ? 14 : 8);
    v.corpo.position.y = 0.8 + (acao === 'andando' ? Math.abs(Math.sin(v.fase)) * 0.04 : acao === 'correndo' ? Math.abs(Math.sin(v.fase)) * 0.09 : 0);
    if (acao === 'morto') v.pele.color.lerp(CINZA, k * 0.1);
  }
}
