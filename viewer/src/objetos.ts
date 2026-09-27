// Objetos do mundo (Fase 10): pedras, gravetos, fibras, pedras afiadas, pilhas e fogo.
// Só desenha o que o motor manda; o que está nas mãos acompanha quem carrega.
import * as THREE from 'three';
import { heightAt } from '../../shared/mundo';
import type { ObjetoRede } from '../../shared/protocolo';
import { agentes } from './agentes';

interface ObjetoVisual { grupo: THREE.Group; dados: ObjetoRede; fase: number; chama?: THREE.Group; luz?: THREE.PointLight; brasa?: THREE.Mesh }

const objetos = new Map<number, ObjetoVisual>();
let cena: THREE.Scene | null = null;
export function iniciarObjetos(s: THREE.Scene) { cena = s; }

const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 1, ...extra });
const M = {
  pedra: mat(0x8a8580), lasca: mat(0x5d5a58, { roughness: 0.4, metalness: 0.2 }), graveto: mat(0x6b4a2b), fibra: mat(0xa8a05a),
  carne: mat(0x6a2a22), cinza: mat(0x3a3430), fruto: mat(0xc0392b, { roughness: 0.5 }),
  chama: new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.85, depthWrite: false }),
  miolo: new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.9, depthWrite: false }),
  brasa: new THREE.MeshBasicMaterial({ color: 0xff5a1a }),
  fumaca: new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.25, depthWrite: false }),
};
const G = {
  pedra: new THREE.DodecahedronGeometry(0.14, 0), lasca: new THREE.TetrahedronGeometry(0.12, 0),
  graveto: new THREE.CylinderGeometry(0.025, 0.035, 0.9, 5), fibra: new THREE.ConeGeometry(0.08, 0.35, 5),
  carne: new THREE.SphereGeometry(0.12, 6, 4), chama: new THREE.ConeGeometry(0.28, 0.8, 7), miolo: new THREE.ConeGeometry(0.14, 0.45, 6),
  fumaca: new THREE.SphereGeometry(0.25, 6, 5), brasa: new THREE.SphereGeometry(0.05, 5, 4),
};

function graveto(rot: number, incl = Math.PI / 2) {
  const g = new THREE.Mesh(G.graveto, M.graveto);
  g.rotation.set(incl, 0, rot); g.castShadow = true;
  return g;
}

function criar(o: ObjetoRede): ObjetoVisual {
  const grupo = new THREE.Group();
  const v: ObjetoVisual = { grupo, dados: o, fase: Math.random() * 10 };
  const giro = (o.id * 2.39) % (Math.PI * 2);
  if (o.tipo === 'pedra' || o.tipo === 'lasca') {
    const m = new THREE.Mesh(G[o.tipo], M[o.tipo]); m.position.y = 0.08; m.rotation.set(giro, giro * 1.7, 0); m.castShadow = true; grupo.add(m);
  } else if (o.tipo === 'graveto') {
    const g = graveto(giro); g.position.y = 0.04; grupo.add(g);
    const b = new THREE.Mesh(G.brasa, M.brasa); b.position.set(Math.cos(giro) * 0.42, 0.05, -Math.sin(giro) * 0.42); b.visible = false;
    grupo.add(b); v.brasa = b;
  } else if (o.tipo === 'fibra') {
    for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(G.fibra, M.fibra); f.position.set((i - 1) * 0.07, 0.15, 0); f.rotation.z = (i - 1) * 0.3; grupo.add(f); }
  } else if (o.tipo === 'fruto') {
    const m = new THREE.Mesh(G.carne, M.fruto); m.scale.setScalar(0.6); m.position.y = 0.07; grupo.add(m);
  } else if (o.tipo === 'carne') {
    const m = new THREE.Mesh(G.carne, M.carne); m.scale.set(1.3, 0.6, 1); m.position.y = 0.07; grupo.add(m);
  } else if (o.tipo === 'fogo') {
    // gravetos em cone, chama, luz e fumaça
    for (let i = 0; i < 5; i++) { const g = graveto(0, 0.5); g.rotation.y = (i / 5) * Math.PI * 2; g.position.y = 0.3; grupo.add(g); }
    const cinza = new THREE.Mesh(new THREE.CircleGeometry(0.5, 10), M.cinza); cinza.rotation.x = -Math.PI / 2; cinza.position.y = 0.02; grupo.add(cinza);
    const chama = new THREE.Group();
    const c1 = new THREE.Mesh(G.chama, M.chama); c1.position.y = 0.4; chama.add(c1);
    const c2 = new THREE.Mesh(G.miolo, M.miolo); c2.position.y = 0.28; chama.add(c2);
    for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(G.fumaca, M.fumaca); f.userData.fumaca = i; chama.add(f); }
    grupo.add(chama); v.chama = chama;
    const luz = new THREE.PointLight(0xff8a3a, 6, 14, 1.6); luz.position.y = 0.8; grupo.add(luz); v.luz = luz;
  }
  // pilha é montada em atualizar (muda de tamanho)
  cena?.add(grupo);
  objetos.set(o.id, v);
  return v;
}

// a pilha cresce com o número de gravetos; fibras amarradas aparecem como faixas claras
function montarPilha(v: ObjetoVisual) {
  const qtd = Math.min(16, v.dados.qtd ?? 1), amarrada = v.dados.amarrada ?? 0;
  if (v.grupo.userData.qtd === qtd && v.grupo.userData.amarrada === amarrada) return;
  v.grupo.userData.qtd = qtd; v.grupo.userData.amarrada = amarrada;
  v.grupo.clear();
  const alto = qtd >= 8;   // pilha de abrigo: gravetos em pé, inclinados, formando uma tenda baixa
  for (let i = 0; i < qtd; i++) {
    const ang = (i / qtd) * Math.PI * 2 + i * 0.4;
    const g = alto ? graveto(0, 0.45) : graveto(ang);
    if (alto) { g.rotation.y = ang; g.position.set(Math.cos(ang) * 0.35, 0.42, Math.sin(ang) * 0.35); g.scale.y = 1.6; }
    else g.position.set(Math.cos(ang) * 0.1, 0.04 + Math.floor(i / 4) * 0.05, Math.sin(ang) * 0.1);
    v.grupo.add(g);
  }
  for (let i = 0; i < Math.min(3, amarrada); i++) {
    const faixa = new THREE.Mesh(new THREE.TorusGeometry(alto ? 0.3 - i * 0.06 : 0.16, 0.02, 4, 10), M.fibra);
    faixa.rotation.x = Math.PI / 2; faixa.position.y = alto ? 0.5 + i * 0.18 : 0.08;
    v.grupo.add(faixa);
  }
}

export function aplicarObjetos(lista: ObjetoRede[] | undefined) {
  if (!lista) return;   // sem lista nova: vale a última
  const presentes = new Set<number>();
  for (const o of lista) {
    presentes.add(o.id);
    let v = objetos.get(o.id);
    if (v && v.dados.tipo !== o.tipo) { cena?.remove(v.grupo); objetos.delete(o.id); v = undefined; }   // pedra que virou lasca
    v ??= criar(o);
    v.dados = o;
    if (o.tipo === 'pilha') montarPilha(v);
  }
  for (const [id, v] of objetos) if (!presentes.has(id)) { cena?.remove(v.grupo); objetos.delete(id); }
}

const perto = new THREE.Vector3();
export function animarObjetos(dt: number, camera: THREE.Camera) {
  camera.getWorldPosition(perto);
  const maos = new Map<string, number>();
  for (const v of objetos.values()) {
    const o = v.dados;
    v.fase += dt;
    if (o.carregadoPor) {
      // na mão de quem carrega: um de cada lado, na altura da cintura
      const ag = agentes.get(o.carregadoPor);
      if (!ag) { v.grupo.visible = false; continue; }
      const lado = maos.get(o.carregadoPor) ?? 0; maos.set(o.carregadoPor, lado + 1);
      const r = ag.grupo.rotation.y, s = lado === 0 ? 1 : -1;
      v.grupo.position.set(ag.grupo.position.x + Math.cos(r) * 0.32 * s + Math.sin(r) * 0.15, ag.grupo.position.y + 0.75,
                           ag.grupo.position.z - Math.sin(r) * 0.32 * s + Math.cos(r) * 0.15);
      v.grupo.rotation.y = r;
      v.grupo.visible = true;
    } else {
      v.grupo.position.set(o.x, heightAt(o.x, o.z), o.z);
      v.grupo.visible = v.grupo.position.distanceToSquared(perto) < (o.tipo === 'fogo' ? 250 : 90) ** 2;
    }
    if (v.brasa) v.brasa.visible = !!o.aceso;
    if (v.chama && v.luz) {
      const forca = Math.max(0.25, o.forca ?? 1);
      const tremor = 1 + Math.sin(v.fase * 17) * 0.08 + Math.sin(v.fase * 29) * 0.05;
      v.chama.scale.set(forca * (1 + Math.sin(v.fase * 13) * 0.05), forca * tremor, forca);
      v.luz.intensity = 5 * forca * tremor;
      for (const f of v.chama.children) {
        if (f.userData.fumaca === undefined) continue;
        const t = (v.fase * 0.4 + f.userData.fumaca / 3) % 1;
        f.position.set(Math.sin(v.fase + f.userData.fumaca) * 0.2 * t, 0.9 + t * 2.4, 0);
        f.scale.setScalar(0.6 + t * 1.8);
        f.visible = t < 0.95;
      }
    }
  }
}
