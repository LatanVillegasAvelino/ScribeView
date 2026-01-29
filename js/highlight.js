import { loadHighlights, saveHighlights } from "./storage.js";

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
}

function hexToRgba(hex, alpha = 0.35) {
  const h = String(hex || "").replace("#", "").trim();
  if (h.length !== 6) return `rgba(255,224,102,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function initHighlighting({
  textLayerEl,
  highlightLayerEl,
  getCurrentColor,     // <-- NUEVO
  onStatus,
  onChange
}) {
  let docHash = null;
  let store = []; // [{id,page,rects:[{x,y,w,h}],text,createdAt,color}]

  function setDocHash(hash) {
    docHash = hash;
    store = docHash ? loadHighlights(docHash) : [];
    onChange?.(store);
  }

  function persist() {
    if (!docHash) return;
    saveHighlights(docHash, store);
    onChange?.(store);
  }

  function clearLayer() {
    highlightLayerEl.innerHTML = "";
  }

  function renderHighlights(pageNumber) {
    clearLayer();
    const layerRect = textLayerEl.getBoundingClientRect();
    const W = layerRect.width || 1;
    const H = layerRect.height || 1;

    const items = store.filter(h => h.page === pageNumber);

    for (const h of items) {
      for (const r of h.rects) {
        const div = document.createElement("div");
        div.className = "hl";
        div.dataset.hid = h.id;
        div.style.left = `${r.x * W}px`;
        div.style.top = `${r.y * H}px`;
        div.style.width = `${r.w * W}px`;
        div.style.height = `${r.h * H}px`;
        div.style.background = hexToRgba(h.color, 0.38);
        div.style.outline = `1px solid ${hexToRgba(h.color, 0.55)}`;
        highlightLayerEl.appendChild(div);
      }
    }
  }

  function selectionToNormalizedRects() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    if (!textLayerEl.contains(range.commonAncestorContainer)) return null;

    const rects = Array.from(range.getClientRects());
    if (!rects.length) return null;

    const base = textLayerEl.getBoundingClientRect();
    const W = base.width || 1;
    const H = base.height || 1;

    const norm = rects.map(rr => ({
      x: (rr.left - base.left) / W,
      y: (rr.top - base.top) / H,
      w: rr.width / W,
      h: rr.height / H
    }));

    const text = sel.toString().trim();
    sel.removeAllRanges();

    return { rects: norm, text };
  }

  function addHighlight(pageNumber) {
    if (!docHash) return;

    const out = selectionToNormalizedRects();
    if (!out) return;

    const chosen = getCurrentColor?.() || "#ffe066";

    const entry = {
      id: uid(),
      page: pageNumber,
      rects: out.rects,
      text: out.text || "(sin texto)",
      createdAt: Date.now(),
      color: chosen
    };

    store.unshift(entry);
    persist();
    onStatus?.("Resaltado guardado");
    renderHighlights(pageNumber);
  }

  function deleteHighlight(id) {
    store = store.filter(h => h.id !== id);
    persist();
  }

  function clearAllForDoc() {
    store = [];
    persist();
  }

  // Doble click = crear highlight
  textLayerEl.addEventListener("dblclick", () => {
    const pageNumber = Number(textLayerEl.dataset.pageNumber || "1");
    addHighlight(pageNumber);
  });

  return {
    setDocHash,
    renderHighlights,
    getAll: () => store.slice(),
    deleteHighlight,
    clearAllForDoc,
  };
}
