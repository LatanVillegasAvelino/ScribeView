// PDF Viewer basado en PDF.js (CDN)
// Render: canvas + textLayer. Miniaturas. Outline (marc: marcadores).

// PDF.js ES module desde CDN:
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";
import * as pdfjsViewer from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/web/pdf_viewer.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";

export function createPdfViewer({ canvas, textLayerEl, thumbsEl, outlineEl, onThumbClick, onOutlineClick, onStatus }) {
  const ctx = canvas.getContext("2d");

  let pdfDoc = null;
  let currentPage = 1;
  let totalPages = 0;
  let scale = 1.2;
  let rotation = 0;

  const pageTextCache = new Map(); // page -> string

  async function loadFromArrayBuffer(arrayBuffer) {
    onStatus?.("Cargando PDF…");
    pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    totalPages = pdfDoc.numPages;
    currentPage = 1;
    scale = 1.2;
    rotation = 0;
    pageTextCache.clear();

    onStatus?.(`PDF cargado (${totalPages} páginas)`);
    return { totalPages };
  }

  async function renderPage(pageNumber) {
    if (!pdfDoc) return;

    currentPage = Math.min(Math.max(1, pageNumber), totalPages);
    onStatus?.("Renderizando…");

    const page = await pdfDoc.getPage(currentPage);
    const viewport = page.getViewport({ scale, rotation });

    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    // Render canvas
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Render text layer
    textLayerEl.innerHTML = "";
    textLayerEl.style.width = `${viewport.width}px`;
    textLayerEl.style.height = `${viewport.height}px`;
    textLayerEl.dataset.pageNumber = String(currentPage);

    const textContent = await page.getTextContent();
    const textLayer = new pdfjsViewer.TextLayer({
      textContentSource: textContent,
      container: textLayerEl,
      viewport
    });
    await textLayer.render();

    onStatus?.(`Listo • Zoom ${(scale * 100).toFixed(0)}% • Rotación ${rotation}°`);
  }

  async function getPageText(pageNumber) {
    if (!pdfDoc) return "";
    if (pageTextCache.has(pageNumber)) return pageTextCache.get(pageNumber);

    const page = await pdfDoc.getPage(pageNumber);
    const tc = await page.getTextContent();
    const text = tc.items.map(i => i.str).join(" ");
    pageTextCache.set(pageNumber, text);
    return text;
  }

  function setScale(next) { scale = Math.min(4.0, Math.max(0.4, next)); }
  function setRotation(next) { rotation = ((next % 360) + 360) % 360; }

  async function buildThumbnails() {
    if (!pdfDoc) return;
    thumbsEl.innerHTML = "";

    const thumbScale = 0.18;

    for (let p = 1; p <= totalPages; p++) {
      const page = await pdfDoc.getPage(p);
      const vp = page.getViewport({ scale: 1 });
      const tvp = page.getViewport({ scale: Math.max(0.12, thumbScale) });

      const item = document.createElement("div");
      item.className = "thumbItem";
      item.dataset.page = String(p);

      const c = document.createElement("canvas");
      c.className = "thumbCanvas";
      const tctx = c.getContext("2d");
      c.width = Math.floor(tvp.width);
      c.height = Math.floor(tvp.height);

      await page.render({ canvasContext: tctx, viewport: tvp }).promise;

      const meta = document.createElement("div");
      meta.className = "thumbMeta";
      meta.innerHTML = `<div><b>Página ${p}</b></div><div class="muted">${Math.floor(vp.width)}×${Math.floor(vp.height)}</div>`;

      item.appendChild(c);
      item.appendChild(meta);

      item.addEventListener("click", () => onThumbClick?.(p));

      thumbsEl.appendChild(item);
    }

    setActiveThumb(currentPage);
  }

  function setActiveThumb(pageNumber) {
    thumbsEl.querySelectorAll(".thumbItem").forEach(el => el.classList.remove("active"));
    const active = thumbsEl.querySelector(`.thumbItem[data-page="${pageNumber}"]`);
    active?.classList.add("active");
  }

  async function buildOutline() {
    if (!pdfDoc) return;
    outlineEl.innerHTML = "";

    const outline = await pdfDoc.getOutline();
    if (!outline || outline.length === 0) {
      outlineEl.innerHTML = `<div class="muted">Este PDF no tiene marcadores.</div>`;
      return;
    }

    const renderItems = (items, depth = 0) => {
      for (const it of items) {
        const div = document.createElement("div");
        div.className = "outlineItem";
        if (depth) div.classList.add("outlineIndent");
        div.textContent = it.title || "(Sin título)";

        div.addEventListener("click", async () => {
          const page = await resolveOutlineToPage(it);
          if (page) onOutlineClick?.(page);
        });

        outlineEl.appendChild(div);

        if (it.items && it.items.length) renderItems(it.items, depth + 1);
      }
    };

    renderItems(outline);
  }

  async function resolveOutlineToPage(outlineItem) {
    try {
      if (!outlineItem.dest) return null;
      const dest = await pdfDoc.getDestination(outlineItem.dest);
      if (!dest) return null;

      // dest[0] es una ref a página
      const pageIndex = await pdfDoc.getPageIndex(dest[0]);
      return pageIndex + 1;
    } catch {
      return null;
    }
  }

  return {
    loadFromArrayBuffer,
    renderPage,
    buildThumbnails,
    buildOutline,
    setScale,
    setRotation,
    getPageText,
    setActiveThumb,
    get state() {
      return { pdfDoc, currentPage, totalPages, scale, rotation };
    }
  };
}
