import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs";
import * as pdfjsViewer from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/web/pdf_viewer.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";

export function createPdfViewer({
  canvas,
  textLayerEl,
  thumbsEl,
  outlineEl,
  viewerWrapEl,
  onThumbClick,
  onOutlineClick,
  onStatus
}) {
  const ctx = canvas.getContext("2d", { alpha: false });

  let pdfDoc = null;
  let currentPage = 1;
  let totalPages = 0;
  let scale = 1.2;
  let rotation = 0;

  const pageTextMapCache = new Map(); // page -> { text, ranges }

  async function loadFromArrayBuffer(arrayBuffer) {
    onStatus?.("Cargando PDF…");
    pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    totalPages = pdfDoc.numPages;
    currentPage = 1;
    scale = 1.2;
    rotation = 0;
    pageTextMapCache.clear();

    onStatus?.(`PDF cargado (${totalPages} páginas)`);
    return { totalPages };
  }

  function getOutputScale() {
    // HiDPI: nitidez real
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    return dpr;
  }

  async function renderPage(pageNumber) {
    if (!pdfDoc) return;

    currentPage = Math.min(Math.max(1, pageNumber), totalPages);
    onStatus?.("Renderizando…");

    const page = await pdfDoc.getPage(currentPage);
    const viewport = page.getViewport({ scale, rotation });

    // CSS size
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    // Backing store size (HiDPI)
    const outputScale = getOutputScale();
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);

    // Reset transform then scale
    ctx.setTransform(outputScale, 0, 0, outputScale, 0, 0);

    // Render canvas
    await page.render({
      canvasContext: ctx,
      viewport
    }).promise;

    // Text layer
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

  async function getPageTextMap(pageNumber) {
    if (!pdfDoc) return { text: "", ranges: [] };
    if (pageTextMapCache.has(pageNumber)) return pageTextMapCache.get(pageNumber);

    const page = await pdfDoc.getPage(pageNumber);
    const tc = await page.getTextContent();

    let text = "";
    const ranges = [];
    tc.items.forEach((it, idx) => {
      const start = text.length;
      const chunk = it.str ?? "";
      text += chunk;
      const end = text.length;
      ranges.push({ start, end, itemIndex: idx });
      text += " ";
    });

    const out = { text, ranges };
    pageTextMapCache.set(pageNumber, out);
    return out;
  }

  function setScale(next) { scale = Math.min(4.0, Math.max(0.4, next)); }
  function setRotation(next) { rotation = ((next % 360) + 360) % 360; }

  async function fitWidth() {
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(currentPage);
    const vp1 = page.getViewport({ scale: 1, rotation });

    const padding = 36;
    const available = viewerWrapEl.clientWidth - padding;
    setScale(available / vp1.width);
  }

  async function fitPage() {
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(currentPage);
    const vp1 = page.getViewport({ scale: 1, rotation });

    const padW = 36;
    const padH = 78;
    const availableW = viewerWrapEl.clientWidth - padW;
    const availableH = viewerWrapEl.clientHeight - padH;

    const sW = availableW / vp1.width;
    const sH = availableH / vp1.height;
    setScale(Math.min(sW, sH));
  }

  async function buildThumbnails() {
    if (!pdfDoc) return;
    thumbsEl.innerHTML = "";

    const thumbScale = 0.18;
    const outScale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    for (let p = 1; p <= totalPages; p++) {
      const page = await pdfDoc.getPage(p);
      const tvp = page.getViewport({ scale: Math.max(0.12, thumbScale) });

      const item = document.createElement("div");
      item.className = "thumbItem";
      item.dataset.page = String(p);

      const c = document.createElement("canvas");
      c.className = "thumbCanvas";
      const tctx = c.getContext("2d", { alpha: false });

      // CSS size
      c.style.width = `${Math.floor(tvp.width)}px`;
      c.style.height = `${Math.floor(tvp.height)}px`;

      // HiDPI
      c.width = Math.floor(tvp.width * outScale);
      c.height = Math.floor(tvp.height * outScale);
      tctx.setTransform(outScale, 0, 0, outScale, 0, 0);

      await page.render({ canvasContext: tctx, viewport: tvp }).promise;

      const meta = document.createElement("div");
      meta.className = "thumbMeta";
      meta.innerHTML = `<div><b>Página ${p}</b></div><div class="muted">Toca para ir</div>`;

      item.appendChild(c);
      item.appendChild(meta);

      item.addEventListener("click", () => onThumbClick?.(p));
      thumbsEl.appendChild(item);
    }

    setActiveThumb(currentPage);
  }

  function setActiveThumb(pageNumber) {
    thumbsEl.querySelectorAll(".thumbItem").forEach(el => el.classList.remove("active"));
    thumbsEl.querySelector(`.thumbItem[data-page="${pageNumber}"]`)?.classList.add("active");
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
    fitWidth,
    fitPage,
    getPageTextMap,
    setActiveThumb,
    get state() { return { pdfDoc, currentPage, totalPages, scale, rotation }; }
  };
}
