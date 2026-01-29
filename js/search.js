export function createSearchController({
  getPageTextMap,
  renderPage,
  getCurrentPage,
  getTotalPages,
  getTextLayerEl,
  onStatus
}) {
  let query = "";
  let hits = [];      // {page, start, end}
  let currentHit = -1;

  function clearMarks() {
    const textLayer = getTextLayerEl();
    if (!textLayer) return;
    textLayer.querySelectorAll(".hit").forEach(s => s.classList.remove("hit"));
  }

  function updateCounter() {
    const el = document.getElementById("searchCount");
    if (!query) el.textContent = "0";
    else el.textContent = hits.length ? `${currentHit + 1}/${hits.length}` : "0";
  }

  async function buildHits(q) {
    query = (q || "").trim();
    hits = [];
    currentHit = -1;
    clearMarks();
    updateCounter();

    if (!query) {
      onStatus?.("Búsqueda limpiada");
      return;
    }

    onStatus?.("Buscando…");
    const needle = query.toLowerCase();
    const total = getTotalPages();

    for (let p = 1; p <= total; p++) {
      const map = await getPageTextMap(p);
      const hay = map.text.toLowerCase();

      let pos = 0;
      while (true) {
        const found = hay.indexOf(needle, pos);
        if (found === -1) break;
        hits.push({ page: p, start: found, end: found + needle.length });
        pos = found + Math.max(1, needle.length);
      }
    }

    onStatus?.(`Resultados: ${hits.length}`);
    if (hits.length) await jumpToHit(0);
    updateCounter();
  }

  function rangesToSpanIndices(ranges, matchStart, matchEnd) {
    // Devuelve itemIndex de spans cuyo rango intersecta el match
    const out = [];
    for (const r of ranges) {
      if (r.end <= matchStart) continue;
      if (r.start >= matchEnd) break;
      out.push(r.itemIndex);
    }
    return out;
  }

  async function markOnCurrentPage() {
    clearMarks();
    if (!query || !hits.length) return;

    const page = getCurrentPage();
    const map = await getPageTextMap(page);
    const pageHits = hits
      .map((h, i) => ({...h, i}))
      .filter(h => h.page === page);

    const textLayer = getTextLayerEl();
    const spans = Array.from(textLayer.querySelectorAll("span"));

    for (const h of pageHits) {
      const idxs = rangesToSpanIndices(map.ranges, h.start, h.end);
      for (const idx of idxs) {
        spans[idx]?.classList.add("hit");
      }
    }

    // Enfocar hit actual si está en la página
    if (currentHit >= 0 && hits[currentHit].page === page) {
      const h = hits[currentHit];
      const idxs = rangesToSpanIndices(map.ranges, h.start, h.end);
      const first = spans[idxs[0]];
      first?.scrollIntoView({ block: "center", inline: "nearest" });
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

  return {
    buildHits,
    next: async () => jumpToHit(currentHit + 1),
    prev: async () => jumpToHit(currentHit - 1),
    clear: async () => {
      query = "";
      hits = [];
      currentHit = -1;
      clearMarks();
      updateCounter();
      onStatus?.("Búsqueda limpiada");
    },
    markOnCurrentPage
  };
}
