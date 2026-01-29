// Búsqueda simple:
// 1) Extrae textContent por página (cache).
// 2) Marca coincidencias en la textLayer (cuando está renderizada esa página).
// 3) Permite next/prev resultados en la página actual y salta de página si hace falta.

export function createSearchController({ getPageText, renderPage, getCurrentPage, getTotalPages, getTextLayerEl, onStatus }) {
  let query = "";
  let hits = []; // {page, index} index = token match index
  let currentHit = -1;

  async function buildHits(q) {
    query = (q || "").trim();
    hits = [];
    currentHit = -1;

    if (!query) {
      updateCounter();
      clearMarks();
      return;
    }

    const total = getTotalPages();
    onStatus?.("Buscando…");

    const needle = query.toLowerCase();

    for (let p = 1; p <= total; p++) {
      const text = (await getPageText(p)).toLowerCase();
      let pos = 0;
      while (true) {
        const found = text.indexOf(needle, pos);
        if (found === -1) break;
        hits.push({ page: p, at: found });
        pos = found + Math.max(1, needle.length);
      }
    }

    onStatus?.(`Resultados: ${hits.length}`);
    updateCounter();
    await jumpToFirstIfOnNothing();
    await markOnCurrentPage();
  }

  function updateCounter() {
    const el = document.getElementById("searchCount");
    if (!query) el.textContent = "0";
    else el.textContent = hits.length ? `${currentHit + 1}/${hits.length}` : "0";
  }

  function clearMarks() {
    const textLayer = getTextLayerEl();
    if (!textLayer) return;
    // PDF.js crea spans; nosotros marcamos con .hit
    textLayer.querySelectorAll(".hit").forEach(s => s.classList.remove("hit"));
  }

  async function markOnCurrentPage() {
    clearMarks();
    if (!query) return;

    const page = getCurrentPage();
    const needle = query.toLowerCase();

    // Mapear spans a texto para marcar. (simple: marcar spans que contengan needle)
    // No es perfecto, pero funciona bien en la mayoría de PDFs.
    const textLayer = getTextLayerEl();
    if (!textLayer) return;

    const spans = Array.from(textLayer.querySelectorAll("span"));
    for (const sp of spans) {
      const t = (sp.textContent || "").toLowerCase();
      if (t && t.includes(needle)) sp.classList.add("hit");
    }

    // Enfocar el hit actual si está en esta página
    if (hits.length && currentHit >= 0) {
      const h = hits[currentHit];
      if (h.page === page) {
        const first = textLayer.querySelector(".hit");
        first?.scrollIntoView({ block: "center", inline: "nearest" });
      }
    }
  }

  async function jumpToHit(idx) {
    if (!hits.length) return;
    currentHit = (idx + hits.length) % hits.length;

    const target = hits[currentHit];
    if (target.page !== getCurrentPage()) {
      await renderPage(target.page);
    }
    updateCounter();
    await markOnCurrentPage();
    onStatus?.(`Resultado ${currentHit + 1} de ${hits.length}`);
  }

  async function next() {
    if (!hits.length) return;
    await jumpToHit(currentHit + 1);
  }

  async function prev() {
    if (!hits.length) return;
    await jumpToHit(currentHit - 1);
  }

  async function jumpToFirstIfOnNothing() {
    if (!hits.length) return;
    const currentPage = getCurrentPage();
    const firstOnOrAfter = hits.findIndex(h => h.page >= currentPage);
    await jumpToHit(firstOnOrAfter === -1 ? 0 : firstOnOrAfter);
  }

  return {
    buildHits,
    next,
    prev,
    clear: async () => {
      query = "";
      hits = [];
      currentHit = -1;
      updateCounter();
      clearMarks();
      onStatus?.("Búsqueda limpiada");
    },
    markOnCurrentPage
  };
}
