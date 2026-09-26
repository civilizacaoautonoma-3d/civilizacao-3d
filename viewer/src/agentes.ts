import * as THREE from 'three';
import type { EntidadeRede } from '../../shared/protocolo';

export interface AgenteVisual {
  grupo: THREE.Group; pose: THREE.Group; corpo: THREE.Mesh; cabeca: THREE.Group; pele: THREE.MeshStandardMaterial;
  corPele: THREE.Color; balao: THREE.Sprite; simbolo: string;
  alvo: THREE.Vector3; dados: EntidadeRede; fase: number;
}

export const agentes = new Map<string, AgenteVisual>();
let cena: THREE.Scene | null = null;
export function iniciarAgentes(s: THREE.Scene) { cena = s; }

// ---------- Símbolo da emoção acima da cabeça ----------
const SIMBOLO: Record<string, string> = {
  alegria: '😊', confianca: '🙂', medo: '😨', surpresa: '😲', tristeza: '😢', nojo: '🤢', raiva: '😠', antecipacao: '🤔',
  'alívio': '😮‍💨', orgulho: '😤', 'frustração': '😣', 'decepção': '😞', luto: '😭',
};
const texturas = new Map<string, THREE.CanvasTexture>();
function texturaDe(simbolo: string) {
  let t = texturas.get(simbolo);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.font = '96px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(simbolo, 64, 70);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    texturas.set(simbolo, t);
  }
  return t;
}

function criarAgente(e: EntidadeRede): AgenteVisual {
  const corPele = new THREE.Color(e.sexo === 'M' ? 0xb07850 : 0xd09a74);
  const pele = new THREE.MeshStandardMaterial({ color: corPele.clone() });
  const corpo = new THREE.Mesh(new THREE.CapsuleGeometry(e.sexo === 'M' ? 0.3 : 0.26, e.sexo === 'M' ? 1.05 : 0.95, 4, 8), pele);
  corpo.position.y = 0.8;
  // cabeça num pivô no pescoço: baixa de tristeza, levanta de surpresa, vira de nojo
  const cabeca = new THREE.Group();
  cabeca.position.y = 1.55;
  const cranio = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), pele);
  cranio.position.y = 0.17;
  const nariz = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.1), pele);
  nariz.position.set(0, 0.17, 0.2);
  cabeca.add(cranio, nariz);
  corpo.castShadow = cranio.castShadow = true;

  const pose = new THREE.Group();          // inclina ou deita o corpo
  pose.add(corpo, cabeca);
  const balao = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  balao.position.y = 2.25; balao.scale.setScalar(0.45); balao.visible = false;
  const grupo = new THREE.Group();         // posição e direção
  grupo.add(pose, balao);
  grupo.position.set(e.x, e.y, e.z);
  grupo.rotation.y = e.rotacao;
  cena?.add(grupo);

  const v: AgenteVisual = { grupo, pose, corpo, cabeca, pele, corPele, balao, simbolo: '',
    alvo: new THREE.Vector3(e.x, e.y, e.z), dados: e, fase: 0 };
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
const VERMELHO = new THREE.Color(0xc0503a);
const cor = new THREE.Color();

export function animarAgentes(dt: number) {
  const k = 1 - Math.exp(-dt * 10);
  const agora = performance.now() / 1000;
  for (const v of agentes.values()) {
    const acao = v.dados.acao;
    const deitado = acao === 'dormindo' || acao === 'morto';
    const s = v.dados.sentimentos;
    const emocao = !deitado && s && s.intensidade > 0.25 ? s.dominante : null;
    const forca = s?.intensidade ?? 0;

    v.grupo.position.lerp(v.alvo, k);
    if (!deitado) {
      const diff = ((v.dados.rotacao - v.grupo.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      v.grupo.rotation.y += diff * k;
    }

    // postura: ação + emoção (medo encolhe e treme, raiva avança, tristeza curva, alegria saltita)
    let inclinacao = deitado ? -Math.PI / 2 : acao === 'comendo' || acao === 'bebendo' ? 0.5
      : acao === 'correndo' ? 0.25 : acao === 'atacando' ? 0.45 : 0;
    let cabecaX = 0, cabecaY = 0, altura = 1;
    if (emocao === 'medo') { inclinacao -= 0.12 * forca; altura = 1 - 0.08 * forca; }
    else if (emocao === 'raiva') inclinacao += 0.15 * forca;
    else if (emocao === 'tristeza') { inclinacao += 0.12 * forca; cabecaX = 0.5 * forca; }
    else if (emocao === 'surpresa') cabecaX = -0.35 * forca;
    else if (emocao === 'nojo') cabecaY = 0.6 * forca;
    else if (emocao === 'antecipacao') inclinacao += 0.06;
    v.pose.rotation.x += (inclinacao - v.pose.rotation.x) * k * 0.5;
    v.pose.position.y += ((deitado ? 0.3 : 0) - v.pose.position.y) * k * 0.5;
    v.pose.scale.y += (altura - v.pose.scale.y) * k;
    v.cabeca.rotation.x += (cabecaX - v.cabeca.rotation.x) * k * 0.6;
    v.cabeca.rotation.y += (cabecaY - v.cabeca.rotation.y) * k * 0.6;
    v.pose.position.x = emocao === 'medo' ? Math.sin(agora * 40) * 0.012 * forca : 0;   // tremendo

    if (acao === 'andando' || acao === 'correndo') v.fase += dt * (acao === 'correndo' ? 14 : 8);
    const pulinho = emocao === 'alegria' && acao === 'parado' ? Math.abs(Math.sin(agora * 5)) * 0.05 * forca : 0;
    v.corpo.position.y = 0.8 + pulinho + (acao === 'andando' ? Math.abs(Math.sin(v.fase)) * 0.04
      : acao === 'correndo' ? Math.abs(Math.sin(v.fase)) * 0.09 : 0);

    // cor: morto acinzenta; raiva avermelha
    if (acao === 'morto') v.pele.color.lerp(CINZA, k * 0.1);
    else {
      cor.copy(v.corPele);
      if (emocao === 'raiva') cor.lerp(VERMELHO, 0.35 * forca);
      v.pele.color.lerp(cor, k);
    }

    // balão com o símbolo da emoção (ou da emoção complexa do momento); 💤 dormindo
    const simbolo = acao === 'dormindo' ? '💤' : acao === 'morto' ? '' :
      s?.derivada && SIMBOLO[s.derivada] ? SIMBOLO[s.derivada] : emocao ? SIMBOLO[emocao] ?? '' : '';
    if (simbolo !== v.simbolo) {
      v.simbolo = simbolo;
      v.balao.visible = simbolo !== '';
      if (simbolo) { (v.balao.material as THREE.SpriteMaterial).map = texturaDe(simbolo); (v.balao.material as THREE.SpriteMaterial).needsUpdate = true; }
    }
    (v.balao.material as THREE.SpriteMaterial).opacity = acao === 'dormindo' ? 0.8 : 0.5 + 0.5 * Math.min(1, forca + (s?.derivada ? 0.4 : 0));
    v.balao.position.y = (deitado ? 1.1 : 2.25) + Math.sin(agora * 2) * 0.04;
  }
}
