import * as THREE from 'three';
import { ARBUSTOS } from '../../shared/mundo';

const MAX = 8;
const dummy = new THREE.Object3D();
const posicoes: THREE.Vector3[] = [];
let frutas: THREE.InstancedMesh | null = null;
let ultimo = '';

export function criarArbustos(scene: THREE.Scene) {
  const copas = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.9, 1),
    new THREE.MeshStandardMaterial({ color: 0x3d7a35, flatShading: true, roughness: 0.9 }), ARBUSTOS.length);
  ARBUSTOS.forEach((b, i) => {
    dummy.position.set(b.x, b.h + 0.55, b.z);
    dummy.rotation.set(0, i, 0);
    dummy.scale.set(1, 0.75, 1);
    dummy.updateMatrix();
    copas.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < MAX; k++) {
      const ang = (k / MAX) * Math.PI * 2 + i;
      posicoes.push(new THREE.Vector3(b.x + Math.cos(ang) * 0.9, b.h + 0.35 + (k % 3) * 0.22, b.z + Math.sin(ang) * 0.9));
    }
  });
  copas.castShadow = copas.receiveShadow = true;
  copas.frustumCulled = false;

  frutas = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xc0282d, roughness: 0.5 }), ARBUSTOS.length * MAX);
  frutas.frustumCulled = false;
  atualizarFrutos(ARBUSTOS.map(() => 0));
  scene.add(copas, frutas);
}

export function atualizarFrutos(frutos: number[]) {
  if (!frutas) return;
  const chave = frutos.join(',');
  if (chave === ultimo) return;
  ultimo = chave;
  for (let i = 0; i < ARBUSTOS.length; i++) {
    for (let k = 0; k < MAX; k++) {
      dummy.position.copy(posicoes[i * MAX + k]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(k < (frutos[i] ?? 0) ? 1 : 0);
      dummy.updateMatrix();
      frutas.setMatrixAt(i * MAX + k, dummy.matrix);
    }
  }
  frutas.instanceMatrix.needsUpdate = true;
}
