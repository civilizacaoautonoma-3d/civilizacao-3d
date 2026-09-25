import * as THREE from 'three';

// Controles de toque para celular e tablet: joystick à esquerda para andar,
// arrastar à direita para olhar, botões para pular, correr, ir ao próximo ser vivo e acelerar o tempo.

export const ehToque = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export const toque = { ativo: false, frente: 0, lado: 0, correr: false, pular: false };

interface Acoes { proximo: () => void; tempo: () => void }

const RAIO_JOYSTICK = 55;
const SENSIBILIDADE = 0.0055;

export function iniciarToque(camera: THREE.Camera, acoes: Acoes) {
  const raiz = document.createElement('div');
  raiz.id = 'toque';
  raiz.innerHTML = `
    <div class="zona-andar"><div class="base"><div class="manche"></div></div></div>
    <div class="zona-olhar"></div>
    <div class="botoes">
      <button data-b="proximo">F<small>ir até</small></button>
      <button data-b="tempo">T<small>tempo</small></button>
      <button data-b="correr">⇧<small>correr</small></button>
      <button data-b="pular">⤒<small>pular</small></button>
    </div>`;
  document.body.append(raiz);

  const zonaAndar = raiz.querySelector<HTMLDivElement>('.zona-andar')!;
  const base = raiz.querySelector<HTMLDivElement>('.base')!;
  const manche = raiz.querySelector<HTMLDivElement>('.manche')!;
  const zonaOlhar = raiz.querySelector<HTMLDivElement>('.zona-olhar')!;

  // ---------- Joystick ----------
  let dedoAndar: number | null = null, origem = { x: 0, y: 0 };
  zonaAndar.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    dedoAndar = t.identifier; origem = { x: t.clientX, y: t.clientY };
    base.style.left = `${t.clientX}px`; base.style.top = `${t.clientY}px`; base.classList.add('visivel');
    e.preventDefault();
  }, { passive: false });
  zonaAndar.addEventListener('touchmove', e => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== dedoAndar) continue;
      let dx = t.clientX - origem.x, dy = t.clientY - origem.y;
      const d = Math.hypot(dx, dy);
      if (d > RAIO_JOYSTICK) { dx *= RAIO_JOYSTICK / d; dy *= RAIO_JOYSTICK / d; }
      manche.style.transform = `translate(${dx}px, ${dy}px)`;
      toque.lado = dx / RAIO_JOYSTICK; toque.frente = -dy / RAIO_JOYSTICK;
    }
    e.preventDefault();
  }, { passive: false });
  const soltarAndar = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) if (t.identifier === dedoAndar) {
      dedoAndar = null; toque.frente = 0; toque.lado = 0;
      manche.style.transform = ''; base.classList.remove('visivel');
    }
  };
  zonaAndar.addEventListener('touchend', soltarAndar);
  zonaAndar.addEventListener('touchcancel', soltarAndar);

  // ---------- Olhar em volta ----------
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  let dedoOlhar: number | null = null, ultimo = { x: 0, y: 0 };
  zonaOlhar.addEventListener('touchstart', e => {
    const t = e.changedTouches[0];
    dedoOlhar = t.identifier; ultimo = { x: t.clientX, y: t.clientY };
    e.preventDefault();
  }, { passive: false });
  zonaOlhar.addEventListener('touchmove', e => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== dedoOlhar) continue;
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= (t.clientX - ultimo.x) * SENSIBILIDADE;
      euler.x -= (t.clientY - ultimo.y) * SENSIBILIDADE;
      euler.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, euler.x));
      camera.quaternion.setFromEuler(euler);
      ultimo = { x: t.clientX, y: t.clientY };
    }
    e.preventDefault();
  }, { passive: false });
  const soltarOlhar = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) if (t.identifier === dedoOlhar) dedoOlhar = null;
  };
  zonaOlhar.addEventListener('touchend', soltarOlhar);
  zonaOlhar.addEventListener('touchcancel', soltarOlhar);

  // ---------- Botões ----------
  for (const b of Array.from(raiz.querySelectorAll<HTMLButtonElement>('button'))) {
    const qual = b.dataset.b;
    b.addEventListener('touchstart', e => {
      e.preventDefault(); e.stopPropagation();
      if (qual === 'proximo') acoes.proximo();
      else if (qual === 'tempo') acoes.tempo();
      else if (qual === 'correr') { toque.correr = !toque.correr; b.classList.toggle('ligado', toque.correr); }
      else if (qual === 'pular') toque.pular = true;
    }, { passive: false });
    b.addEventListener('touchend', e => { e.preventDefault(); if (qual === 'pular') toque.pular = false; }, { passive: false });
  }

  return {
    ativar() { toque.ativo = true; raiz.classList.add('ativo'); },
  };
}
