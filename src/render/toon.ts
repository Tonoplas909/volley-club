import * as THREE from 'three';

/** Épaisseur par défaut du contour (fraction de l'échelle de la coque). */
const DEFAULT_THICKNESS = 0.07;
/** Niveaux de la rampe d'ombrage (sombre, moyen, clair). */
const RAMP_LEVELS = [110, 190, 255];

let ramp: THREE.DataTexture | null = null;
let outlineMat: THREE.MeshBasicMaterial | null = null;

/** Rampe à 3 niveaux, partagée, en NearestFilter : crée les aplats. */
function sharedRamp(): THREE.DataTexture {
  if (!ramp) {
    const data = new Uint8Array(RAMP_LEVELS.length * 4);
    RAMP_LEVELS.forEach((v, i) => {
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    });
    ramp = new THREE.DataTexture(data, RAMP_LEVELS.length, 1, THREE.RGBAFormat);
    ramp.minFilter = THREE.NearestFilter;
    ramp.magFilter = THREE.NearestFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;
  }
  return ramp;
}

/** Matériau à aplats (rampe partagée de 3 niveaux). */
export function toonMaterial(color: THREE.ColorRepresentation): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: sharedRamp() });
}

/** Ajoute une coque inversée noire (même géométrie, légèrement agrandie) en enfant du maillage, et la renvoie. */
export function addOutline(mesh: THREE.Mesh, thickness = DEFAULT_THICKNESS): THREE.Mesh {
  if (!outlineMat) outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  const hull = new THREE.Mesh(mesh.geometry, outlineMat);
  hull.scale.setScalar(1 + thickness);
  hull.castShadow = false;
  hull.receiveShadow = false;
  mesh.add(hull);
  return hull;
}

/** Libère la rampe et le matériau de contour partagés (recréés au besoin à l'usage suivant). */
export function disposeToon(): void {
  ramp?.dispose();
  ramp = null;
  outlineMat?.dispose();
  outlineMat = null;
}
