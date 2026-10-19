const ui = document.getElementById('ui');
if (ui) ui.textContent = 'Volley Club';

// Prévisualisation du rendu (tâche 8, supprimée à la tâche 10).
if (new URLSearchParams(location.search).has('preview')) {
  void import('./render/dev-preview').then((m) => m.startPreview());
}
