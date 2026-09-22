import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ---------------- renderer / scene / camera ---------------- */

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

// sky gradient sampled from the flag photograph, reused across the site
const skyTop = new THREE.Color('#123a5c');
const skyBottom = new THREE.Color('#6f93aa');
scene.background = skyTop;
scene.fog = new THREE.Fog(skyBottom.getHex(), 1.5, 6.5);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 1.15, 3.4);
camera.lookAt(0, 0.15, -2.5);

/* ---------------- lights ---------------- */

const hemi = new THREE.HemisphereLight(0xcfe3ee, 0x2a3a2a, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4de, 1.4);
sun.position.set(-6, 8, 4);
scene.add(sun);

/* ---------------- ground ---------------- */

const groundGeo = new THREE.CircleGeometry(40, 64);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a4b2f, roughness: 1 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// invisible raycast plane, larger, always at y=0
const pickPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshBasicMaterial({ visible: false })
);
pickPlane.rotation.x = -Math.PI / 2;
scene.add(pickPlane);

/* ---------------- wind + cursor shader injection ---------------- */

const uniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 0.16 },
  uCursor: { value: new THREE.Vector3(9999, 0, 9999) },
  uCursorRadius: { value: 1.6 },
  uCursorStrength: { value: 0.85 },
};

function injectWind(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWindStrength;
        uniform vec3 uCursor;
        uniform float uCursorRadius;
        uniform float uCursorStrength;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>

        // per-instance base position (local space origin of this blade clump)
        #ifdef USE_INSTANCING
          vec3 instPos = instanceMatrix[3].xyz;
        #else
          vec3 instPos = vec3(0.0);
        #endif

        float heightFactor = clamp(position.y / 1.0, 0.0, 1.0);
        heightFactor = heightFactor * heightFactor;

        float windPhase = instPos.x * 0.6 + instPos.z * 0.9;
        float wind = sin(uTime * 1.3 + windPhase) * 0.6
                   + sin(uTime * 0.55 + windPhase * 2.1) * 0.35;
        vec2 windDir = normalize(vec2(1.0, 0.35));
        transformed.xz += windDir * wind * uWindStrength * heightFactor;

        #ifdef USE_INSTANCING
          vec3 worldInst = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #else
          vec3 worldInst = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        #endif

        vec2 toBlade = worldInst.xz - uCursor.xz;
        float dist = length(toBlade);
        float push = smoothstep(uCursorRadius, 0.0, dist);
        vec2 pushDir = dist > 0.0001 ? normalize(toBlade) : vec2(0.0, 0.0);
        transformed.xz += pushDir * push * uCursorStrength * heightFactor;
        `
      );
    material.userData.shader = shader;
  };
  material.needsUpdate = true;
}

/* ---------------- load + convert to instanced meshes ---------------- */

const loading = document.getElementById('loading');
const loader = new GLTFLoader();

loader.load('../assets/models/grass.glb', (gltf) => {
  // group every mesh by (geometry vertex signature + material) so identical
  // blade "plates" become a single InstancedMesh instead of ~2000 draw calls
  gltf.scene.updateMatrixWorld(true);

  const groups = new Map(); // key -> { geometry, material, matrices: [] }

  gltf.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const geo = obj.geometry;
    const mat = obj.material;
    // "Material" is a single stray reference plane in the source file, not a grass blade
    if (mat.name === 'Material') return;
    const key = geo.attributes.position.count + ':' + (mat.name || mat.uuid);

    if (!groups.has(key)) {
      groups.set(key, { geometry: geo, material: mat, matrices: [] });
    }
    groups.get(key).matrices.push(obj.matrixWorld.clone());
  });

  // the source field isn't centred on its own origin — find its centre first
  const fieldBox = new THREE.Box3();
  for (const g of groups.values()) {
    for (const m of g.matrices) fieldBox.expandByPoint(new THREE.Vector3().setFromMatrixPosition(m));
  }
  const center = fieldBox.getCenter(new THREE.Vector3());

  // cull instances past a radius (sparse ragged patch edge) and a small
  // number of oversized "weed" blades in the source data (up to ~1.9x normal
  // scale) that poke above the mowed field and silhouette against the sky
  const FIELD_RADIUS = 5.5;
  const MAX_SCALE_Y = 1.15;
  const tmpPos = new THREE.Vector3();
  const tmpScale = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();

  const container = new THREE.Group();

  for (const { geometry, material, matrices } of groups.values()) {
    const kept = matrices.filter((m) => {
      m.decompose(tmpPos, tmpQuat, tmpScale);
      return tmpPos.distanceTo(center) <= FIELD_RADIUS && tmpScale.y <= MAX_SCALE_Y;
    });
    if (kept.length === 0) continue;

    geometry.computeBoundingBox();

    material.side = THREE.DoubleSide;
    material.alphaTest = 0.5;
    material.roughness = 0.85;
    material.metalness = 0;
    // mipmapped alpha-cutout foliage textures can fringe/shimmer at distance
    // because transparent texel color bleeds into the minified mip levels
    if (material.map) {
      material.map.generateMipmaps = false;
      material.map.minFilter = THREE.LinearFilter;
      material.map.magFilter = THREE.LinearFilter;
      material.map.needsUpdate = true;
    }
    injectWind(material);

    const inst = new THREE.InstancedMesh(geometry, material, kept.length);
    kept.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.instanceMatrix.needsUpdate = true;
    inst.castShadow = false;
    container.add(inst);
  }

  container.position.set(-center.x, 0, -center.z);

  scene.add(container);
  loading.classList.add('hidden');
  console.log(`grass: ${groups.size} draw calls (was ${Array.from(groups.values()).reduce((n, g) => n + g.matrices.length, 0)} meshes)`);
}, undefined, (err) => {
  console.error('grass load failed', err);
  loading.textContent = 'the field would not grow — check console';
});

/* ---------------- cursor -> ground raycast ---------------- */

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2(9999, 9999);
let pointerActive = false;

function setPointer(x, y) {
  const rect = canvas.getBoundingClientRect();
  pointerNDC.x = ((x - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((y - rect.top) / rect.height) * 2 + 1;
  pointerActive = true;
}

window.addEventListener('pointermove', (e) => setPointer(e.clientX, e.clientY));
window.addEventListener('pointerleave', () => { pointerActive = false; });
window.addEventListener('touchmove', (e) => {
  if (e.touches[0]) setPointer(e.touches[0].clientX, e.touches[0].clientY);
}, { passive: true });

/* ---------------- resize ---------------- */

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);
onResize();

/* ---------------- animate ---------------- */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  uniforms.uTime.value = t;

  if (pointerActive) {
    raycaster.setFromCamera(pointerNDC, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      hit
    )) {
      uniforms.uCursor.value.lerp(hit, 0.35);
    }
  }

  // gentle camera drift so the field doesn't feel static
  camera.position.x = Math.sin(t * 0.06) * 0.8;
  camera.lookAt(0, 0.15, -2.5);

  renderer.render(scene, camera);
}
animate();
