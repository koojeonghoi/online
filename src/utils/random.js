export function shuffleArray(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateShortId(prefix = 'id_', rng = Math.random) {
  return prefix + rng().toString(36).slice(2, 11);
}
