function normalizeSearchValue(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

function collectSearchValues(value, values) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSearchValues(entry, values));
    return;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((entry) => collectSearchValues(entry, values));
    return;
  }
  values.push(normalizeSearchValue(value));
}

export function matchesSearch(query, ...sources) {
  const tokens = normalizeSearchValue(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;

  const values = [];
  sources.forEach((source) => collectSearchValues(source, values));
  return tokens.every((token) => values.some((value) => value.includes(token)));
}
