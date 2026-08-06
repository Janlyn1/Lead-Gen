const MULTIPLIERS = {
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000
};

export function parseFollowers(input) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.round(input);
  }

  if (!input) return 0;

  const normalized = String(input).trim().toLowerCase().replace(/,/g, "");
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*([kmb])?/i);
  if (!match) return 0;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return 0;

  const multiplier = MULTIPLIERS[match[2]] || 1;
  return Math.round(value * multiplier);
}

export function isQualified(followers, min = 2000, max = 20000) {
  const count = parseFollowers(followers);
  return count >= min && count <= max;
}

