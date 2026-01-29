// Resaltado sencillo por selección: crea rectángulos sobre el texto seleccionado.
// Nota: se guarda en memoria (si recargas, se pierde). Se puede persistir luego con localStorage.

export function initHighlighting({ textLayerEl, highlightLayerEl, onStatus }) {
  const highlightsByPage = new Map(); // pageNumber -> array of rects

  function clearLayer() {
    highlightLayerEl.innerHTML = "";
  }

  function renderHighlights(pageNumber) {
    clearLayer();
    const rects = highlightsByPage.get(pageNumber) || [];
    for (const r of rects) {
      const div = document.createElement("div");
      div.className = "hl";
      div.style.left = `${r.left}px`;
      div.style.top = `${r.top}px`;
      div.style.width = `${r.width}px`;
      div.style.height = `${r.height}px`;
      highlightLayerEl.appendChild(div);
    }
  }

  function addCurrentSelection(pageNumber) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (!textLayerEl.contains(range.commonAncestorContainer)) return;

    const rects = Array.from(range.getClientRects());
    if (rects.length === 0) return;

    const base = textLayerEl.getBoundingClientRect();
    const stored = highlightsByPage.get(pageNumber) || [];

    for (const rr of rects) {
      // Rect relativo a la capa
      const left = rr.left - base.left;
      const top = rr.top - base.top;
      stored.push({
        left,
        top,
        width: rr.width,
        height: rr.height
      });
    }

    highlightsByPage.set(pageNumber, stored);
    sel.removeAllRanges();
    onStatus?.("Resaltado añadido");
    renderHighlights(pageNumber);
  }

  // Doble click para resaltar selección (evita chocar con click normal)
  textLayerEl.addEventListener("dblclick", () => {
    const pageNumber = Number(textLayerEl.dataset.pageNumber || "1");
    addCurrentSelection(pageNumber);
  });

  // API pública
  return {
    renderHighlights,
    clearAll: (pageNumber) => {
      highlightsByPage.set(pageNumber, []);
      renderHighlights(pageNumber);
    }
  };
}
