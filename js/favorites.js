// ============================================================
//  Favoritos / "Salvos no seu perfil".
//  O backend não tem relação usuário-ficha, então guardamos os
//  IDs salvos no localStorage — separados por usuário (e-mail),
//  para que cada conta tenha sua própria lista.
// ============================================================

function keyFor(email) {
  return `cranium_favs_${email || "anon"}`;
}

export function getFavIds(email) {
  try {
    const raw = localStorage.getItem(keyFor(email));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.map(Number) : [];
  } catch {
    return [];
  }
}

export function isFav(email, id) {
  return getFavIds(email).includes(Number(id));
}

// Alterna o favorito e retorna o novo estado (true = salvo).
export function toggleFav(email, id) {
  id = Number(id);
  const ids = getFavIds(email);
  const idx = ids.indexOf(id);
  if (idx >= 0) {
    ids.splice(idx, 1);
  } else {
    ids.push(id);
  }
  localStorage.setItem(keyFor(email), JSON.stringify(ids));
  return ids.includes(id);
}
