export interface ImpactFlash {
  /** `flash` de 0 (aucun) à 1 : opacité du calque. */
  update(flash: number): void;
  dispose(): void;
}

/**
 * Flash d'écran d'une attaque parfaite de l'humain (spec caméra 3e personne § 6.1) : un calque plein écran,
 * blanc chaud, qui ne capte aucun clic. À créer avant le HUD et les menus pour rester sous leurs panneaux.
 */
export function createImpactFlash(root: HTMLElement): ImpactFlash {
  const layer = document.createElement('div');
  layer.className = 'impact-flash';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.opacity = '0';
  root.append(layer);
  let shown = 0;
  return {
    update(flash): void {
      const opacity = Number.isFinite(flash) ? Math.min(1, Math.max(0, flash)) : 0;
      if (opacity === shown) return;
      shown = opacity;
      layer.style.opacity = String(opacity);
    },
    dispose(): void {
      layer.remove();
    },
  };
}
