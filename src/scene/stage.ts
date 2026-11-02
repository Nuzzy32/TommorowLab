import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Renderer, scene, camera and lights, plus the helpers every other scene module builds with.
// Everything made through `T` (geometries, materials, textures) is released by `dispose`.
export function createStage(host: HTMLElement, onContextLost: () => void) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const cvs = renderer.domElement;
  cvs.className = 'scene-canvas';
  cvs.setAttribute('aria-hidden', 'true');
  host.appendChild(cvs);
  const lost = (e: Event) => { e.preventDefault(); onContextLost(); };
  cvs.addEventListener('webglcontextlost', lost);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1.7, 0.5, 400);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xc4cdc8, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6ea, 1.9);
  sun.position.set(-12, 26, -10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 80 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  scene.add(sun);

  const trash: { dispose(): void }[] = [];
  const T = <X extends { dispose(): void }>(x: X) => (trash.push(x), x);
  const M = (color: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) =>
    T(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o }));
  const world = new THREE.Group();
  scene.add(world);
  const box = (parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, cast = true) => {
    const m = new THREE.Mesh(T(new THREE.BoxGeometry(w, h, d)), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const sh = new THREE.Mesh(T(new THREE.PlaneGeometry(160, 160)), T(new THREE.ShadowMaterial({ opacity: 0.12 })));
  sh.rotation.x = -Math.PI / 2;
  sh.position.y = 0.001;
  sh.receiveShadow = true;
  scene.add(sh);

  const dummy = new THREE.Object3D();
  // One draw call for every copy of a prop; rows are [x, y, z, rotY?, scaleX?, scaleY?, scaleZ?].
  const many = (geo: THREE.BufferGeometry, mat: THREE.Material, at: number[][], cast = true, colors?: THREE.ColorRepresentation[]) => {
    const m = T(new THREE.InstancedMesh(T(geo), mat, at.length));
    at.forEach(([x, y, z, ry = 0, sx = 1, sy = 1, sz = 1], i) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, ry, 0);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (colors) m.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    });
    m.castShadow = cast;
    m.receiveShadow = true;
    world.add(m);
    return m;
  };
  const merge = (...gs: THREE.BufferGeometry[]) => T(mergeGeometries(gs) ?? gs[0]);

  const size = { w: 0, h: 0 };
  const ro = new ResizeObserver(() => {
    size.w = host.clientWidth;
    size.h = host.clientHeight;
    if (size.w && size.h) { renderer.setSize(size.w, size.h, false); camera.aspect = size.w / size.h; camera.updateProjectionMatrix(); }
  });
  ro.observe(host);

  return {
    host, reduced, renderer, cvs, scene, camera, hemi, sun, world, size, T, M, box, many, merge,
    dispose() {
      ro.disconnect();
      cvs.removeEventListener('webglcontextlost', lost);
      trash.forEach(x => x.dispose());
      renderer.dispose();
      // Free the GL context now; browsers cap live contexts per page and StrictMode mounts twice.
      renderer.forceContextLoss();
      cvs.remove();
    },
  };
}
export type Stage = ReturnType<typeof createStage>;
