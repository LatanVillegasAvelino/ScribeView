const KEY_RECENT = "scribeview:recent:v1";
const KEY_HL_PREFIX = "scribeview:highlights:v1:";

export async function sha256Hex(arrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const bytes = new Uint8Array(digest);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function loadHighlights(docHash) {
  try {
    const raw = localStorage.getItem(KEY_HL_PREFIX + docHash);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHighlights(docHash, highlights) {
  localStorage.setItem(KEY_HL_PREFIX + docHash, JSON.stringify(highlights));
}

export function clearHighlights(docHash) {
  localStorage.removeItem(KEY_HL_PREFIX + docHash);
}

export function loadRecent() {
  try {
    const raw = localStorage.getItem(KEY_RECENT);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveRecent(list) {
  localStorage.setItem(KEY_RECENT, JSON.stringify(list));
}

export function addRecent(item) {
  const list = loadRecent();
  const filtered = list.filter(x => x.hash !== item.hash);
  filtered.unshift(item);
  saveRecent(filtered.slice(0, 12));
  return filtered.slice(0, 12);
}

export function clearRecent() {
  localStorage.removeItem(KEY_RECENT);
}
