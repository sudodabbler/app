import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TRACKS = [
  { title: 'YES', time: '2:52' },
  { title: 'ICON', time: '2:52' },
  { title: 'GET U', time: '3:03' },
  { title: 'KISS', time: '2:55' },
  { title: 'WAITING', time: '3:01' },
  { title: 'VAIN', time: '5:55' },
  { title: 'ALWAYS', time: '3:53' },
  { title: 'FOR YOU, I WOULD', time: '4:18' },
];

/* ---------------- renderer / scene / camera ---------------- */

const canvas = document.createElement('canvas');
document.body.appendChild(canvas);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2c4a37');
scene.fog = new THREE.Fog(0x1c2f21, 11, 20);

// top-down "floating above the field" camera. up must be forced off the
// default (0,1,0) since it's parallel to a straight-down view direction.
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
const OVERVIEW_POS = new THREE.Vector3(0, 13, 0.01);
const OVERVIEW_LOOK = new THREE.Vector3(0, 0, 0);
camera.up.set(0, 0, -1);
camera.position.copy(OVERVIEW_POS);
camera.lookAt(OVERVIEW_LOOK);

const camPos = camera.position.clone();
const camLook = OVERVIEW_LOOK.clone();
const camPosTarget = camera.position.clone();
const camLookTarget = OVERVIEW_LOOK.clone();
const camUp = camera.up.clone();
const camUpTarget = camera.up.clone();

/* ---------------- lights ---------------- */

const hemi = new THREE.HemisphereLight(0xdfe9d8, 0x28321f, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4de, 1.5);
sun.position.set(-5, 10, 3);
scene.add(sun);

/* ---------------- ground ---------------- */

const groundGeo = new THREE.CircleGeometry(40, 64);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a4b2f, roughness: 1 });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

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

/* ---------------- grass: load + convert to instanced meshes ---------------- */

const loading = document.getElementById('loading');
const gltfLoader = new GLTFLoader();

gltfLoader.load('../assets/models/grass.glb', (gltf) => {
  gltf.scene.updateMatrixWorld(true);

  const groups = new Map();

  gltf.scene.traverse((obj) => {
    if (!obj.isMesh) return;
    const geo = obj.geometry;
    const mat = obj.material;
    if (mat.name === 'Material') return; // stray reference plane, not a blade
    const key = geo.attributes.position.count + ':' + (mat.name || mat.uuid);
    if (!groups.has(key)) groups.set(key, { geometry: geo, material: mat, matrices: [] });
    groups.get(key).matrices.push(obj.matrixWorld.clone());
  });

  const fieldBox = new THREE.Box3();
  for (const g of groups.values()) {
    for (const m of g.matrices) fieldBox.expandByPoint(new THREE.Vector3().setFromMatrixPosition(m));
  }
  const center = fieldBox.getCenter(new THREE.Vector3());

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
  grassLoaded = true;
  checkReady();
}, undefined, (err) => {
  console.error('grass load failed', err);
  loading.textContent = 'the field would not grow — check console';
});

/* ---------------- swords: load + rig 8 instances lying in the field ---------------- */

// The source file (Sketchfab FBX->glTF export) bakes a ~50.4deg rotation into
// the top node, so the blade's tip-to-pommel axis runs diagonally across local
// X/Y rather than along a single axis. SWORD_CORRECTION undoes that (rotates
// the measured tip->pommel direction back onto +Y) so our own pitch/yaw rig
// can assume a straight vertical blade. Values below are measured *after*
// that correction is applied (see the sword-peek diagnostic used to derive
// them): tip/pommel Y, and the blade's centerline X, in the corrected frame.
const SWORD_CORRECTION = new THREE.Quaternion(0, 0, 0.42562386138239316, 0.9049001760536581);
const SWORD_TIP_Y = -114.111;
const SWORD_POMMEL_Y = 115.089;
const SWORD_CENTER_Y = (SWORD_TIP_Y + SWORD_POMMEL_Y) / 2;
const SWORD_BLADE_CENTER_X = -0.277;
const SWORD_SCALE = 0.0068;

const BURIED_Y = 0.03;
const REVEALED_Y = 0.15;
const RAISED_Y = 1.3;

const swords = [];
let activeSword = null;
let swordsLoaded = false;
let grassLoaded = false;

function checkReady() {
  if (grassLoaded && swordsLoaded) loading.classList.add('hidden');
}

function makeEngravingTexture(title, time) {
  const cnv = document.createElement('canvas');
  cnv.width = 256;
  cnv.height = 1024;
  const ctx = cnv.getContext('2d');
  ctx.clearRect(0, 0, cnv.width, cnv.height);
  ctx.save();
  ctx.translate(cnv.width / 2, cnv.height / 2);
  ctx.rotate(-Math.PI / 2);

  const fitSize = (text, maxW, base) => {
    let size = base;
    ctx.font = `${size}px "Times New Roman", serif`;
    while (ctx.measureText(text).width > maxW && size > 14) {
      size -= 2;
      ctx.font = `${size}px "Times New Roman", serif`;
    }
    return size;
  };

  const titleSize = fitSize(title.toUpperCase(), 880, 72);
  ctx.font = `${titleSize}px "Times New Roman", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '6px';
  ctx.fillStyle = 'rgba(20,16,10,0.92)';
  ctx.fillText(title.toUpperCase(), 2, -18 + 2);
  ctx.fillStyle = 'rgba(255,248,230,0.55)';
  ctx.fillText(title.toUpperCase(), 0, -18);

  const timeSize = 40;
  ctx.font = `${timeSize}px "Times New Roman", serif`;
  ctx.letterSpacing = '4px';
  ctx.fillStyle = 'rgba(20,16,10,0.9)';
  ctx.fillText(time, 2, 60 + 2);
  ctx.fillStyle = 'rgba(255,248,230,0.5)';
  ctx.fillText(time, 0, 60);
  ctx.restore();

  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const swordLoader = new GLTFLoader();
swordLoader.load('../assets/models/sword.glb', (gltf) => {
  const sourceScene = gltf.scene;
  sourceScene.traverse((o) => {
    if (o.isMesh) {
      o.material.roughness = 0.55;
      o.material.metalness = 0.65;
    }
  });
  // straighten the baked-in diagonal (see SWORD_CORRECTION above) once, here,
  // so every cloned instance inherits a properly vertical blade
  sourceScene.children[0].quaternion.premultiply(SWORD_CORRECTION);

  const N = TRACKS.length;
  const baseRadius = 2.4;

  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const radius = baseRadius + (Math.random() - 0.5) * 0.9;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const lieYaw = Math.random() * Math.PI * 2;

    const outer = new THREE.Group();
    outer.position.set(x, BURIED_Y, z);
    outer.rotation.y = lieYaw;

    const pitch = new THREE.Group();
    pitch.rotation.x = Math.PI / 2; // start lying flat
    outer.add(pitch);

    const scaleGroup = new THREE.Group();
    scaleGroup.scale.setScalar(SWORD_SCALE);
    pitch.add(scaleGroup);

    const centerOffset = new THREE.Group();
    centerOffset.position.y = -SWORD_CENTER_Y;
    scaleGroup.add(centerOffset);

    const mesh = sourceScene.clone(true);
    centerOffset.add(mesh);

    const track = TRACKS[i];
    const decalTex = makeEngravingTexture(track.title, track.time);
    const decalMat = new THREE.MeshBasicMaterial({
      map: decalTex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(26, 108), decalMat);
    decal.position.set(SWORD_BLADE_CENTER_X, -28.8, 2.6);
    centerOffset.add(decal);

    scene.add(outer);

    // generous invisible hitbox at the buried footprint, independent of the
    // animated pose, so clicking works even when mostly hidden by grass
    const hitbox = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.5, 10),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hitbox.position.set(x, 0.25, z);
    scene.add(hitbox);

    swords.push({
      outer, pitch, x, z, lieYaw, hitbox,
      state: 'buried', // 'buried' | 'revealed' | 'raised'
      targetY: BURIED_Y, targetPitch: Math.PI / 2, targetYaw: lieYaw,
      curY: BURIED_Y, curPitch: Math.PI / 2, curYaw: lieYaw,
    });
  }

  swordsLoaded = true;
  checkReady();
}, undefined, (err) => {
  console.error('sword load failed', err);
});

function setSwordState(s, state) {
  s.state = state;
  if (state === 'buried') {
    s.targetY = BURIED_Y; s.targetPitch = Math.PI / 2; s.targetYaw = s.lieYaw;
  } else if (state === 'revealed') {
    s.targetY = REVEALED_Y; s.targetPitch = Math.PI / 2; s.targetYaw = s.lieYaw;
  } else if (state === 'raised') {
    s.targetY = RAISED_Y; s.targetPitch = 0; s.targetYaw = 0;
  }
}

function raiseSword(s) {
  if (activeSword && activeSword !== s) setSwordState(activeSword, 'revealed');
  activeSword = s;
  setSwordState(s, 'raised');
  camLookTarget.set(s.x, 1.3, s.z);
  camPosTarget.set(s.x, 1.65, s.z + 2.35);
  camUpTarget.set(0, 1, 0);
}

function lowerActive() {
  if (!activeSword) return;
  setSwordState(activeSword, 'revealed');
  activeSword = null;
  camLookTarget.copy(OVERVIEW_LOOK);
  camPosTarget.copy(OVERVIEW_POS);
  camUpTarget.set(0, 0, -1);
}

/* ---------------- pointer: move = grass push, click = sword select ---------------- */

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2(9999, 9999);
let pointerActive = false;

function ndcFromEvent(x, y) {
  const rect = canvas.getBoundingClientRect();
  return new THREE.Vector2(
    ((x - rect.left) / rect.width) * 2 - 1,
    -((y - rect.top) / rect.height) * 2 + 1
  );
}

window.addEventListener('pointermove', (e) => {
  pointerNDC.copy(ndcFromEvent(e.clientX, e.clientY));
  pointerActive = true;
});
window.addEventListener('pointerleave', () => { pointerActive = false; });
window.addEventListener('touchmove', (e) => {
  if (e.touches[0]) {
    pointerNDC.copy(ndcFromEvent(e.touches[0].clientX, e.touches[0].clientY));
    pointerActive = true;
  }
}, { passive: true });

function handleSelect(clientX, clientY) {
  const ndc = ndcFromEvent(clientX, clientY);
  raycaster.setFromCamera(ndc, camera);
  const hitboxes = swords.map((s) => s.hitbox);
  const hits = raycaster.intersectObjects(hitboxes, false);

  if (hits.length > 0) {
    const hitSword = swords.find((s) => s.hitbox === hits[0].object);
    if (activeSword === hitSword) lowerActive();
    else raiseSword(hitSword);
  } else if (activeSword) {
    lowerActive();
  }
}

window.addEventListener('click', (e) => handleSelect(e.clientX, e.clientY));

/* ---------------- resize ---------------- */

// how far from centre the ring of swords can reach (base radius + jitter + margin)
const FIELD_VIEW_RADIUS = 3.3;
const halfFovRad = THREE.MathUtils.degToRad(camera.fov / 2);

function overviewHeightFor(aspect) {
  const forVertical = FIELD_VIEW_RADIUS / Math.tan(halfFovRad);
  const forHorizontal = FIELD_VIEW_RADIUS / (Math.tan(halfFovRad) * aspect);
  return Math.max(forVertical, forHorizontal, 8);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  OVERVIEW_POS.y = overviewHeightFor(camera.aspect);
  if (!activeSword) {
    camPosTarget.y = OVERVIEW_POS.y;
    camPos.y = OVERVIEW_POS.y;
    camera.position.y = OVERVIEW_POS.y;
  }
}
window.addEventListener('resize', onResize);
onResize();

/* ---------------- animate ---------------- */

const clock = new THREE.Clock();

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  uniforms.uTime.value = t;

  if (pointerActive && !activeSword) {
    raycaster.setFromCamera(pointerNDC, camera);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
      uniforms.uCursor.value.lerp(hit, 0.35);
    }
  } else {
    uniforms.uCursor.value.lerp(new THREE.Vector3(9999, 0, 9999), 0.1);
  }

  for (const s of swords) {
    s.curY = damp(s.curY, s.targetY, 6, dt);
    s.curPitch = damp(s.curPitch, s.targetPitch, 6, dt);

    // shortest-path yaw damping
    let dYaw = s.targetYaw - s.curYaw;
    dYaw = ((dYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    s.curYaw += dYaw * (1 - Math.exp(-6 * dt));

    s.outer.position.y = s.curY;
    s.outer.rotation.y = s.curYaw;
    s.pitch.rotation.x = s.curPitch;
  }

  camPos.x = damp(camPos.x, camPosTarget.x, 4.5, dt);
  camPos.y = damp(camPos.y, camPosTarget.y, 4.5, dt);
  camPos.z = damp(camPos.z, camPosTarget.z, 4.5, dt);
  camLook.x = damp(camLook.x, camLookTarget.x, 4.5, dt);
  camLook.y = damp(camLook.y, camLookTarget.y, 4.5, dt);
  camLook.z = damp(camLook.z, camLookTarget.z, 4.5, dt);

  camUp.x = damp(camUp.x, camUpTarget.x, 4.5, dt);
  camUp.y = damp(camUp.y, camUpTarget.y, 4.5, dt);
  camUp.z = damp(camUp.z, camUpTarget.z, 4.5, dt);
  camera.up.copy(camUp).normalize();
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  renderer.render(scene, camera);
}
animate();

window.__debugCam = camera;
window.__debugLookTarget = camLook;
Object.defineProperty(window, '__debugActiveSword', { get: () => activeSword });
window.__debugRaise = (i) => raiseSword(swords[i]);
window.__debugLower = () => lowerActive();
window.__debugSwords = swords;
