import * as THREE from 'three';
import { TUNING } from '../sim/tuning';
import { addOutline, disposeToon, toonMaterial } from './toon';

const { halfWidth, halfLength, netHeight } = TUNING.court;

const SAND_WIDTH = 24;
const SAND_LENGTH = 32;
const FAR_SAND_SIZE = 240;
const LINE_WIDTH = 0.14;
const LINE_Y = 0.01;
const POST_X = halfWidth + 0.6;
const POST_HEIGHT = netHeight + 0.12;
const POST_RADIUS = 0.04;
const NET_BAND_HEIGHT = 0.1;
const NET_MESH_HEIGHT = 1.0;
const ANTENNA_RADIUS = 0.025;
const ANTENNA_LENGTH = 1.8;
const ANTENNA_BELOW_BAND = 1.0;
const ANTENNA_STRIPES = 9;
const SUN_POSITION = new THREE.Vector3(7, 16, -9);
const SHADOW_EXTENT = 15;
const SHADOW_MAP_SIZE = 2048;

export type SceneBundle = { scene: THREE.Scene; dispose(): void };

/** Libère géométries, matériaux et textures d'un sous-arbre (les sprites partagent leur géométrie). */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry && !(obj as THREE.Sprite).isSprite) mesh.geometry.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const mat of mats) {
      for (const value of Object.values(mat)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      mat.dispose();
    }
  });
}

function skyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#2f7df0');
    grad.addColorStop(0.6, '#8fd3ff');
    grad.addColorStop(1, '#ffe2a8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function netTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 32, 32);
    ctx.strokeStyle = 'rgba(20,20,20,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 32, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((2 * POST_X) / 0.25, NET_MESH_HEIGHT / 0.25);
  return tex;
}

function antennaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 2;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#d62828';
    ctx.fillRect(0, 0, 2, 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 1, 2, 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, ANTENNA_STRIPES);
  return tex;
}

function addGround(scene: THREE.Scene): void {
  const far = new THREE.Mesh(
    new THREE.PlaneGeometry(FAR_SAND_SIZE, FAR_SAND_SIZE),
    new THREE.MeshLambertMaterial({ color: 0xe2b25c }),
  );
  far.rotation.x = -Math.PI / 2;
  far.position.y = -0.02;
  far.receiveShadow = true;
  scene.add(far);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(SAND_WIDTH, SAND_LENGTH),
    new THREE.MeshLambertMaterial({ color: 0xffcf6b }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.receiveShadow = true;
  scene.add(sand);
}

function addLines(scene: THREE.Scene): void {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lengthZ = 2 * halfLength + LINE_WIDTH;
  const lengthX = 2 * halfWidth + LINE_WIDTH;
  const sideGeo = new THREE.PlaneGeometry(LINE_WIDTH, lengthZ);
  const endGeo = new THREE.PlaneGeometry(lengthX, LINE_WIDTH);
  const place = (geo: THREE.PlaneGeometry, x: number, z: number): void => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, LINE_Y, z);
    scene.add(m);
  };
  place(sideGeo, -halfWidth, 0);
  place(sideGeo, halfWidth, 0);
  place(endGeo, 0, -halfLength);
  place(endGeo, 0, halfLength);
}

function addNet(scene: THREE.Scene): void {
  const white = toonMaterial(0xffffff);
  const postGeo = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, POST_HEIGHT, 12);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, toonMaterial(0x9aa3ad));
    addOutline(post).scale.set(1.6, 1.01, 1.6);
    post.position.set(sx * POST_X, POST_HEIGHT / 2, 0);
    post.castShadow = true;
    scene.add(post);
  }

  const band = new THREE.Mesh(new THREE.BoxGeometry(2 * POST_X, NET_BAND_HEIGHT, 0.03), white);
  band.position.set(0, netHeight - NET_BAND_HEIGHT / 2, 0);
  band.castShadow = true;
  addOutline(band).scale.set(1.005, 1.35, 2);
  scene.add(band);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * POST_X, NET_MESH_HEIGHT),
    new THREE.MeshBasicMaterial({
      map: netTexture(),
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  mesh.position.set(0, netHeight - NET_BAND_HEIGHT - NET_MESH_HEIGHT / 2, 0);
  scene.add(mesh);

  const antennaGeo = new THREE.CylinderGeometry(ANTENNA_RADIUS, ANTENNA_RADIUS, ANTENNA_LENGTH, 8);
  const antennaMat = new THREE.MeshLambertMaterial({ map: antennaTexture() });
  for (const sx of [-1, 1]) {
    const antenna = new THREE.Mesh(antennaGeo, antennaMat);
    antenna.position.set(sx * halfWidth, netHeight - ANTENNA_BELOW_BAND + ANTENNA_LENGTH / 2, 0);
    scene.add(antenna);
  }
}

function addLights(scene: THREE.Scene): void {
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
  sun.position.copy(SUN_POSITION);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  const cam = sun.shadow.camera;
  cam.left = -SHADOW_EXTENT;
  cam.right = SHADOW_EXTENT;
  cam.top = SHADOW_EXTENT;
  cam.bottom = -SHADOW_EXTENT;
  cam.near = 1;
  cam.far = 50;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);
}

/** Décor statique : sable, lignes, filet, antennes, ciel et lumières. */
export function createScene(): SceneBundle {
  const scene = new THREE.Scene();
  const sky = skyTexture();
  scene.background = sky;
  addGround(scene);
  addLines(scene);
  addNet(scene);
  addLights(scene);
  return {
    scene,
    dispose() {
      disposeObject(scene);
      disposeToon();
      sky.dispose();
    },
  };
}
