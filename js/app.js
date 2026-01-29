import { initThemeToggle } from "./theme.js";
import { initHighlighting } from "./highlight.js";
import { createSearchController } from "./search.js";
import { createPdfViewer } from "./pdf-viewer.js";
import { sha256Hex, addRecent, loadRecent, clearRecent, clearHighlights } from "./storage.js";

const el = (id) => document.getElementById(id);

const fileInput = el("fileInput");
const downloadBtn = el("downloadBtn");
const toggleSidebarBtn = el("toggleSidebar");

const prevPageBtn = el("prevPage");
const nextPageBtn = el("nextPage");
const pageNumberInput = el("pageNumber");
const pageCountLabel = el("pageCount");
const zoomOutBtn = el("zoomOut");
const zoomInBtn = el("zoomIn");
const rotateBtn = el("rotate");
const fitWidthBtn = el("fitWidth");
const fitPageBtn = el("fitPage");

const fullscreenBtn = el("fullscreenBtn");
const autoFullscreen = el("autoFullscreen");

const viewFilter = el("viewFilter");
const filterStrength = el("filterStrength");
const filterPct = el("filterPct");

const highlightColor = el("highlightColor");
const hlSwatch = el("hlSwatch");

const searchInput = el("searchInput");
const searchPrevBtn = el("searchPrev");
const searchNextBtn = el("searchNext");

const status = el("status");
const sidebar = el("sidebar");
const thumbsEl = el("thumbs");
const outlineEl = el("outline");
const notesEl = el("notes");
const clearNotesBtn = el("clearNotes");

const recentEl = el("recent");
const clearRecentBtn = el("clearRecent");

const viewerWrap = el("viewerWrap");
const dropZone = el("dropZone");

const pageLayer = el("pageLayer");
const canvas = el("pdfCanvas");
const textLayerEl = el("textLayer");
const highlightLayerEl = el("highlightLayer");

const themeToggle = el("themeToggle");
initThemeToggle(themeToggle);

let currentBlobUrl = null;
let currentDocHash = null;
let currentFileMeta = null;

const KEY_PREFS = "scribeview:prefs:v1";

function setStatus(msg) { status.textContent = msg; }

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(KEY_PREFS) || "{}"); }
  catch { return {}; }
}
function savePrefs(p) {
  localStorage.setItem(KEY_PREFS, JSON.stringify(p));
}

const prefs = loadPrefs();
autoFullscreen.checked = !!prefs.autoFullscreen;
viewFilter.value = prefs.viewFilter || "none";
filterStrength.value = String(prefs.filterStrength ?? 60);
filterPct.textContent = `${filterStrength.value}%`;
highlightColor.value = prefs.highlightColor || "#ffe066";
hlSwatch.style.background = highlightColor.value;

function setEnabled(enabled) {
  [
    prevPageBtn, nextPageBtn, pageNumberInput,
    zoomOutBtn, zoomInBtn, rotateBtn, fitWidthBtn, fitPageBtn,
    downloadBtn, searchInput, searchPrevBtn, searchNextBtn,
    clearNotesBtn, fullscreenBtn,
    viewFilter, filterStrength, highlightColor
  ].forEach(b => b.disabled = !enabled);
}

function updateNav() {
  const s = viewer.state;
  prevPageBtn.disabled = !(s.pdfDoc && s.currentPage > 1);
  nextPageBtn.disabled = !(s.pdfDoc && s.currentPage < s.totalPages);
  pageNumberInput.value = s.currentPage;
  pageNumberInput.min = 1;
  pageNumberInput.max = s.totalPages || 1;
  pageCountLabel.textContent = `/ ${s.totalPages || 0}`;
}

function showViewer() {
  dropZone.classList.add("hidden");
  viewerWrap.classList.remove("hidden");
}

function showDrop() {
  viewerWrap.classList.add("hidden");
  dropZone.classList.remove("hidden");
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}

function renderRecent() {
  const list = loadRecent();
  if (!list.length) {
    recentEl.innerHTML = `<div class="muted">Sin recientes.</div>`;
    return;
  }
  recentEl.innerHTML = "";
  for (const r of list) {
    const div = document.createElement("div");
    div.className = "recentItem";
    div.innerHTML = `
      <div class="noteTop">
        <div><b>${escapeHtml(r.name || "PDF")}</b></div>
        <div class="noteMeta">${new Date(r.lastOpened).toLocaleDateString()}</div>
      </div>
      <div class="noteMeta">hash: ${r.hash.slice(0, 10)}… • ${(r.size/1024/1024).toFixed(2)} MB</div>
      <div class="noteMeta">Último: ${formatDate(r.lastOpened)}</div>
      <div class="noteMeta">*Para reabrir debes seleccionar el archivo otra vez*</div>
    `;
    recentEl.appendChild(div);
  }
}

function renderNotes(list) {
  if (!currentDocHash) {
    notesEl.innerHTML = `<div class="muted">Abre un PDF para ver anotaciones.</div>`;
    return;
  }
  if (!list.length) {
    notesEl.innerHTML = `<div class="muted">Aún no hay highlights. Selecciona texto y doble click.</div>`;
    return;
  }

  notesEl.innerHTML = "";
  for (const h of list) {
    const div = document.createElement("div");
    div.className = "noteItem";
    div.dataset.hid = h.id;
    div.innerHTML = `
      <div class="noteTop">
        <div><b>Pág. ${h.page}</b></div>
        <div class="noteMeta">${new Date(h.createdAt).toLocaleTimeString()}</div>
      </div>
      <div class="noteText">${escapeHtml(h.text).slice(0, 160)}</div>
      <div class="noteMeta">${formatDate(h.createdAt)}</div>
      <div class="noteMeta">Color: <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${h.color || "#ffe066"};border:1px solid rgba(127,127,127,.4)"></span></div>
    `;
    div.addEventListener("click", async () => {
      await goToHighlight(h.id);
    });
    notesEl.appendChild(div);
  }
}

async function goToHighlight(id) {
  const list = highlights.getAll();
  const h = list.find(x => x.id === id);
  if (!h) return;

  await viewer.renderPage(h.page);
  viewer.setActiveThumb(h.page);
  highlights.renderHighlights(h.page);
  await search.markOnCurrentPage();
  updateNav();

  const rectEl = highlightLayerEl.querySelector(`.hl[data-hid="${id}"]`);
  rectEl?.scrollIntoView({ block: "center", inline: "nearest" });

  pageLayer?.classList.add("flash");
  setTimeout(() => pageLayer?.classList.remove("flash"), 1200);
}

/* ============ Filtros visuales ============ */
function applyFilter() {
  const mode = viewFilter.value;
  const pct = Number(filterStrength.value || "0") / 100;
  filterPct.textContent = `${filterStrength.value}%`;

  // filtro CSS aplicado al render (canvas + text/highlight están encima)
  // En lugar de filtrar todo el pageLayer (que afecta texto),
  // aplicamos filtro solo al canvas para mantener texto nítido.
  let f = "none";
  if (mode === "sepia") f = `sepia(${pct}) contrast(1.02)`;
  if (mode === "grayscale") f = `grayscale(${pct})`;
  if (mode === "invert") f = `invert(${pct})`;

  canvas.style.filter = f;

  // Fondo “papel” suave si sepia
  if (mode === "sepia" && pct > 0.05) {
    pageLayer.style.background = "rgba(210, 190, 140, 0.10)";
  } else {
    pageLayer.style.background = "rgba(0,0,0,.05)";
  }

  prefs.viewFilter = mode;
  prefs.filterStrength = Number(filterStrength.value || "0");
  savePrefs(prefs);
}

viewFilter.addEventListener("change", applyFilter);
filterStrength.addEventListener("input", applyFilter);

/* ============ Color picker de resaltado ============ */
function applyHighlightColorUI() {
  hlSwatch.style.background = highlightColor.value;
  prefs.highlightColor = highlightColor.value;
  savePrefs(prefs);
}
highlightColor.addEventListener("input", applyHighlightColorUI);
applyHighlightColorUI();

/* ============ Pantalla completa ============ */
async function toggleFullscreen() {
  const target = document.documentElement;
  try {
    if (!document.fullscreenElement) {
      await target.requestFullscreen?.();
      setStatus("Pantalla completa activada");
    } else {
      await document.exitFullscreen?.();
      setStatus("Pantalla completa desactivada");
    }
  } catch {
    setStatus("Pantalla completa no disponible en este navegador.");
  }
}

fullscreenBtn.addEventListener("click", toggleFullscreen);
autoFullscreen.addEventListener("change", () => {
  prefs.autoFullscreen = autoFullscreen.checked;
  savePrefs(prefs);
});

/* ============ Viewer ============ */
const viewer = createPdfViewer({
  canvas,
  textLayerEl,
  thumbsEl,
  outlineEl,
  viewerWrapEl: viewerWrap,
  onThumbClick: async (page) => {
    await viewer.renderPage(page);
    viewer.setActiveThumb(page);
    highlights.renderHighlights(page);
    await search.markOnCurrentPage();
    updateNav();
  },
  onOutlineClick: async (page) => {
    await viewer.renderPage(page);
    viewer.setActiveThumb(page);
    highlights.renderHighlights(page);
    await search.markOnCurrentPage();
    updateNav();
  },
  onStatus: setStatus
});

const highlights = initHighlighting({
  textLayerEl,
  highlightLayerEl,
  getCurrentColor: () => highlightColor.value,   // <-- color elegido por usuario
  onStatus: setStatus,
  onChange: (list) => {
    renderNotes(list);
    clearNotesBtn.disabled = !(currentDocHash && list.length);
  }
});

const search = createSearchController({
  getPageTextMap: (p) => viewer.getPageTextMap(p),
  renderPage: async (p) => {
    await viewer.renderPage(p);
    viewer.setActiveThumb(p);
    highlights.renderHighlights(p);
    updateNav();
  },
  getCurrentPage: () => viewer.state.currentPage,
  getTotalPages: () => viewer.state.totalPages,
  getTextLayerEl: () => textLayerEl,
  onStatus: setStatus
});

async function openPdfFile(file) {
  if (!file) return;
  if (file.type !== "application/pdf") {
    setStatus("Ese archivo no es un PDF.");
    return;
  }

  // URL para descarga
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
  currentBlobUrl = URL.createObjectURL(file);

  const arrayBuffer = await file.arrayBuffer();

  // Hash del documento
  setStatus("Calculando hash…");
  currentDocHash = await sha256Hex(arrayBuffer);
  currentFileMeta = { name: file.name, size: file.size };

  addRecent({
    name: file.name,
    size: file.size,
    hash: currentDocHash,
    lastOpened: Date.now()
  });
  renderRecent();

  // Cargar PDF
  const { totalPages } = await viewer.loadFromArrayBuffer(arrayBuffer);

  // Highlights por hash
  highlights.setDocHash(currentDocHash);

  showViewer();
  setEnabled(true);

  // Render
  await viewer.renderPage(1);
  await viewer.buildThumbnails();
  await viewer.buildOutline();
  highlights.renderHighlights(1);
  updateNav();

  // filtro actual
  applyFilter();
  applyHighlightColorUI();

  // reset búsqueda
  await search.clear();
  searchInput.value = "";

  downloadBtn.disabled = false;
  clearNotesBtn.disabled = !highlights.getAll().length;
  setStatus(`Listo • ${totalPages} páginas • hash ${currentDocHash.slice(0, 10)}…`);

  // Pantalla completa si "Auto"
  if (autoFullscreen.checked) {
    // Nota: algunos móviles exigen que sea por click; si falla, queda el botón ⛶.
    await toggleFullscreen();
  }
}

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  await openPdfFile(file);
});

downloadBtn.addEventListener("click", () => {
  if (!currentBlobUrl) return;
  const a = document.createElement("a");
  a.href = currentBlobUrl;
  a.download = currentFileMeta?.name || "documento.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
});

prevPageBtn.addEventListener("click", async () => {
  await viewer.renderPage(viewer.state.currentPage - 1);
  viewer.setActiveThumb(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateNav();
});

nextPageBtn.addEventListener("click", async () => {
  await viewer.renderPage(viewer.state.currentPage + 1);
  viewer.setActiveThumb(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateNav();
});

pageNumberInput.addEventListener("change", async () => {
  const n = Number(pageNumberInput.value || "1");
  await viewer.renderPage(n);
  viewer.setActiveThumb(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateNav();
});

zoomOutBtn.addEventListener("click", async () => {
  viewer.setScale(viewer.state.scale - 0.2);
  await viewer.renderPage(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateNav();
});

zoomInBtn.addEventListener("click", async () => {
  viewer.setScale(viewer.state.scale + 0.2);
  await viewer.renderPage(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateNav();
});

rotateBtn.addEventListener("click", async () => {
  viewer.setRotation(viewer.state.rotation + 90);
  await viewer.renderPage(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateNav();
});

fitWidthBtn.addEventListener("click", async () => {
  await viewer.fitWidth();
  await viewer.renderPage(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateNav();
});

fitPageBtn.addEventListener("click", async () => {
  await viewer.fitPage();
  await viewer.renderPage(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateNav();
});

searchInput.addEventListener("input", async () => {
  await search.buildHits(searchInput.value);
  const has = !!searchInput.value.trim();
  searchPrevBtn.disabled = !has;
  searchNextBtn.disabled = !has;
});
searchNextBtn.addEventListener("click", async () => search.next());
searchPrevBtn.addEventListener("click", async () => search.prev());

toggleSidebarBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  sidebar.classList.toggle("hidden");
});

// Cerrar sidebar tocando fuera (móvil)
document.addEventListener("click", (e) => {
  const isMobile = window.matchMedia("(max-width: 980px)").matches;
  if (!isMobile) return;

  const clickedInside = sidebar.contains(e.target) || toggleSidebarBtn.contains(e.target);
  if (!clickedInside && !sidebar.classList.contains("hidden")) sidebar.classList.add("hidden");
});

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tabPane").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    el(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// Borrar highlights del PDF actual
clearNotesBtn.addEventListener("click", () => {
  if (!currentDocHash) return;
  clearHighlights(currentDocHash);
  highlights.setDocHash(currentDocHash);
  highlights.renderHighlights(viewer.state.currentPage);
  setStatus("Highlights borrados para este PDF");
});

// Limpiar recientes
clearRecentBtn.addEventListener("click", () => {
  clearRecent();
  renderRecent();
  setStatus("Recientes limpiados");
});

// Drag & drop
["dragenter","dragover"].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add("dragover");
  });
});
["dragleave","drop"].forEach(evt => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
  });
});
dropZone.addEventListener("drop", async (e) => {
  const file = e.dataTransfer?.files?.[0];
  await openPdfFile(file);
});

// Teclado
window.addEventListener("keydown", async (e) => {
  const s = viewer.state;
  if (!s.pdfDoc) return;

  if (e.key === "ArrowLeft") prevPageBtn.click();
  if (e.key === "ArrowRight") nextPageBtn.click();
  if (e.key === "+" || e.key === "=") zoomInBtn.click();
  if (e.key === "-" || e.key === "_") zoomOutBtn.click();
  if (e.key.toLowerCase() === "f") fullscreenBtn.click(); // tecla F
});

// Inicial
setEnabled(false);
showDrop();
setStatus("Sin PDF cargado");
renderRecent();
applyFilter();
applyHighlightColorUI();
