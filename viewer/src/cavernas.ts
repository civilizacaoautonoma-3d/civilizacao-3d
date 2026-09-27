// Cavernas: domo de rocha com a boca virada para baixo do morro (a posição vem de shared/mundo, igual no motor).
import * as THREE from 'three';
import { CAVERNAS, heightAt } from '../../shared/mundo';

const ABERTURA = 1.4;   // radianos de boca (as paredes do motor deixam ~0,7 rad de cada lado)

export function criarCavernas(scene: THREE.Scene) {
  const rocha = new THREE.MeshStandardMaterial({ color: 0x77716a, flatShading: true, roughness: 0.95, side: THREE.DoubleSide });
  const chao = new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 1 });
  const bloco = new THREE.MeshStandardMaterial({ color: 0x8a8782, flatShading: true, roughness: 0.9 });
  for (const c of CAVERNAS) {
    const grupo = new THREE.Group();
    grupo.position.set(c.x, heightAt(c.x, c.z) - 0.35, c.z);

    // domo com uma fatia aberta (centrada em phi = 0, que aponta para -x), depois girado para a boca olhar para "dir"
    const geo = new THREE.SphereGeometry(c.r + 0.9, 26, 12, ABERTURA / 2, Math.PI * 2 - ABERTURA, 0, Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // rocha irregular: empurra cada vértice um pouco para fora ou para dentro (determinístico)
      const n = Math.sin(v.x * 2.1 + c.id) * Math.cos(v.z * 1.7 - c.id) * 0.5 + Math.sin(v.y * 3.3 + v.x) * 0.3;
      v.multiplyScalar(1 + n * 0.12);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const domo = new THREE.Mesh(geo, rocha);
    domo.scale.y = 0.9;
    domo.castShadow = true; domo.receiveShadow = true;
    const giro = new THREE.Group();
    giro.rotation.y = Math.atan2(Math.cos(c.dir), -Math.sin(c.dir));
    giro.add(domo);
    grupo.add(giro);

    // chão escuro por dentro
    const piso = new THREE.Mesh(new THREE.CircleGeometry(c.r + 0.6, 20), chao);
    piso.rotation.x = -Math.PI / 2; piso.position.y = 0.4;
    grupo.add(piso);

    // pedras grandes dos dois lados da boca
    for (const lado of [-1, 1]) {
      const a = c.dir + lado * (ABERTURA / 2 + 0.1);
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), bloco);
      b.position.set(Math.sin(a) * (c.r + 0.8), 0.5, Math.cos(a) * (c.r + 0.8));
      b.scale.set(1, 1.3, 1); b.rotation.set(c.id + lado, lado, 0);
      b.castShadow = true;
      grupo.add(b);
    }
    scene.add(grupo);
  }
}
