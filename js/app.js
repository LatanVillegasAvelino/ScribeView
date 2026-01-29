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

const paletteEl = el("palette");
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

const KEY_PREFS = "scribeview:prefs:v2";

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
filterStrength.value = String(prefs.filterStrength ?? 120);
filterPct.textContent = `${filterStrength.value}%`;

highlightColor.value = prefs.highlightColor || "#ffe066";
hlSwatch.style.background = highlightColor.value;

const PALETTE = [
  "#ffe066", "#ffd43b", "#ff922b", "#ff6b6b",
  "#f06595", "#cc5de8", "#845ef7", "#5c7cfa",
  "#339af0", "#22b8cf", "#20c997", "#51cf66",
  "#94d82d", "#adb5bd"
];

function setEnabled(enabled) {
  [
    prevPageBtn, nextPageBtn, pageNumberInput,
    zoomOutBtn, zoomInBtn, rotateBtn, fitWidthBtn, fitPageBtn,
    downloadBtn, searchInput, searchPrevBtn, searchNextBtn,
    clearNotesBtn, fullscreenBtn,
    viewFilter, filterStrength, highlightColor
  ].forEach(b => b.disabled = !enabled);

  // paleta
  paletteEl.querySelectorAll("button").forEach(b => b.disabled = !enabled);
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

/* ===================== Paleta ===================== */
function buildPalette() {
  paletteEl.innerHTML = "";
  for (const c of PALETTE) {
    const b = document.createElement("button");
    b.className = "sw";
    b.type = "button";
    b.title = c;
    b.style.background = c;
    b.addEventListener("click", () => {
      highlightColor.value = c;
      applyHighlightColorUI();
      setActivePalette(c);
    });
    paletteEl.appendChild(b);
  }
  setActivePalette(highlightColor.value);
}

function setActivePalette(color) {
  paletteEl.querySelectorAll(".sw").forEach(sw => sw.classList.remove("active"));
  const match = [...paletteEl.querySelectorAll(".sw")].find(sw => sw.title.toLowerCase() === color.toLowerCase());
  match?.classList.add("active");
}

function applyHighlightColorUI() {
  hlSwatch.style.background = highlightColor.value;
  prefs.highlightColor = highlightColor.value;
  savePrefs(prefs);
  setActivePalette(highlightColor.value);
}

highlightColor.addEventListener("input", () => {
  applyHighlightColorUI();
});
buildPalette();
applyHighlightColorUI();

/* ===================== Filtros (más intensos) ===================== */
function applyFilter() {
  const mode = viewFilter.value;

  // strength: 0..200% -> 0..2.0
  const s = Math.max(0, Math.min(2, Number(filterStrength.value || "0") / 100));
  filterPct.textContent = `${filterStrength.value}%`;

  // Filtros más “pro”: añadimos contraste y saturación controlados
  let f = "none";

  if (mode === "sepia") {
    // sepia fuerte + calidez
    f = `sepia(${Math.min(1, s)}) saturate(${1 + s * 0.7}) contrast(${1.05 + s * 0.10})`;
    pageLayer.style.background = "rgba(210, 190, 140, 0.12)";
  } else if (mode === "grayscale") {
    f = `grayscale(${Math.min(1, s)}) contrast(${1.05 + s * 0.12})`;
    pageLayer.style.background = "rgba(0,0,0,.05)";
  } else if (mode === "invert") {
    // invert parcial o fuerte + hue-rotate suaviza
    f = `invert(${Math.min(1, s)}) hue-rotate(180deg) contrast(${1.05 + s * 0.10})`;
    pageLayer.style.background = "rgba(0,0,0,.05)";
  } else {
    pageLayer.style.background = "rgba(0,0,0,.05)";
  }

  // Aplicar SOLO al canvas para mantener texto nítido
  canvas.style.filter = f;

  prefs.viewFilter = mode;
  prefs.filterStrength = Number(filterStrength.value || "0");
  savePrefs(prefs);
}

viewFilter.addEventListener("change", applyFilter);
filterStrength.addEventListener("input", applyFilter);

/* ===================== Pantalla completa ===================== */
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

/* ===================== Viewer ===================== */
const viewer = createPdfViewer({
  canvas,
  textLayerEl,
  thumbsEl,
  outlineEl,
  viewerWrapEl: viewerWrap,
  onThumbClick: async (page) => goToPage(page),
  onOutlineClick: async (page) => goToPage(page),
  onStatus: setStatus
});

const highlights = initHighlighting({
  textLayerEl,
  highlightLayerEl,
  getCurrentColor: () => highlightColor.value,
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

async function goToPage(page) {
  await viewer.renderPage(page);
  viewer.setActiveThumb(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateNav();
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

async function goToHighlight(id) {
  const list = highlights.getAll();
  const h = list.find(x => x.id === id);
  if (!h) return;

  await goToPage(h.page);

  const rectEl = highlightLayerEl.querySelector(`.hl[data-hid="${id}"]`);
  rectEl?.scrollIntoView({ block: "center", inline: "nearest" });

  pageLayer?.classList.add("flash");
  setTimeout(() => pageLayer?.classList.remove("flash"), 1200);
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

    const colorDot = h.color || "#ffe066";

    div.innerHTML = `
      <div class="noteTop">
        <div><b>Pág. ${h.page}</b></div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="noteMeta">${new Date(h.createdAt).toLocaleTimeString()}</span>
          <span title="Color" style="display:inline-block;width:12px;height:12px;border-radius:4px;background:${colorDot};border:1px solid rgba(127,127,127,.4)"></span>
        </div>
      </div>
      <div class="noteText">${escapeHtml(h.text).slice(0, 170)}</div>
      <div class="noteMeta">${formatDate(h.createdAt)}</div>

      <div class="noteActions">
        <div class="notePalette" aria-label="Cambiar color">
          ${PALETTE.slice(0, 10).map(c => `
            <button class="sw" type="button" data-color="${c}" title="${c}" style="background:${c}"></button>
          `).join("")}
        </div>
        <button class="noteBtn" type="button" data-del="1" title="Borrar highlight">🗑 Borrar</button>
      </div>
    `;

    // Click en el contenedor: ir al highlight
    div.addEventListener("click", async () => {
      await goToHighlight(h.id);
    });

    // Cambiar color (evita que el click “suba” al contenedor)
    div.querySelectorAll('button.sw[data-color]').forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const c = btn.dataset.color;
        highlights.updateHighlightColor(h.id, c);
        // re-render actual page + notes (onChange ya lo hace)
        highlights.renderHighlights(viewer.state.currentPage);
      });
    });

    // Borrar individual
    div.querySelector('button[data-del="1"]').addEventListener("click", (e) => {
      e.stopPropagation();
      highlights.deleteHighlight(h.id);
      highlights.renderHighlights(viewer.state.currentPage);
    });

    notesEl.appendChild(div);
  }
}

/* ===================== Abrir PDF ===================== */
async function openPdfFile(file) {
  if (!file) return;
  if (file.type !== "application/pdf") {
    setStatus("Ese archivo no es un PDF.");
    return;
  }

  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
  currentBlobUrl = URL.createObjectURL(file);

  const arrayBuffer = await file.arrayBuffer();

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

  const { totalPages } = await viewer.loadFromArrayBuffer(arrayBuffer);

  highlights.setDocHash(currentDocHash);

  showViewer();
  setEnabled(true);

  await goToPage(1);
  await viewer.buildThumbnails();
  await viewer.buildOutline();

  await search.clear();
  searchInput.value = "";

  downloadBtn.disabled = false;
  clearNotesBtn.disabled = !highlights.getAll().length;

  // aplicar preferencias
  applyFilter();
  applyHighlightColorUI();

  setStatus(`Listo • ${totalPages} páginas • hash ${currentDocHash.slice(0, 10)}…`);

  if (autoFullscreen.checked) {
    // en algunos móviles puede exigir interacción: si falla, usa botón ⛶
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

/* ===================== Controles ===================== */
prevPageBtn.addEventListener("click", async () => goToPage(viewer.state.currentPage - 1));
nextPageBtn.addEventListener("click", async () => goToPage(viewer.state.currentPage + 1));

pageNumberInput.addEventListener("change", async () => {
  await goToPage(Number(pageNumberInput.value || "1"));
});

zoomOutBtn.addEventListener("click", async () => {
  viewer.setScale(viewer.state.scale - 0.2);
  await goToPage(viewer.state.currentPage);
});
zoomInBtn.addEventListener("click", async () => {
  viewer.setScale(viewer.state.scale + 0.2);
  await goToPage(viewer.state.currentPage);
});
rotateBtn.addEventListener("click", async () => {
  viewer.setRotation(viewer.state.rotation + 90);
  await goToPage(viewer.state.currentPage);
});

fitWidthBtn.addEventListener("click", async () => {
  await viewer.fitWidth();
  await goToPage(viewer.state.currentPage);
});
fitPageBtn.addEventListener("click", async () => {
  await viewer.fitPage();
  await goToPage(viewer.state.currentPage);
});

/* ===================== Búsqueda ===================== */
searchInput.addEventListener("input", async () => {
  await search.buildHits(searchInput.value);
  const has = !!searchInput.value.trim();
  searchPrevBtn.disabled = !has;
  searchNextBtn.disabled = !has;
});
searchNextBtn.addEventListener("click", async () => search.next());
searchPrevBtn.addEventListener("click", async () => search.prev());

/* ===================== Sidebar ===================== */
toggleSidebarBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  sidebar.classList.toggle("hidden");
});

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

/* ===================== Borrar todo highlights ===================== */
clearNotesBtn.addEventListener("click", () => {
  if (!currentDocHash) return;
  clearHighlights(currentDocHash);
  highlights.setDocHash(currentDocHash);
  highlights.renderHighlights(viewer.state.currentPage);
  setStatus("Highlights borrados para este PDF");
});

/* ===================== Recientes ===================== */
clearRecentBtn.addEventListener("click", () => {
  clearRecent();
  renderRecent();
  setStatus("Recientes limpiados");
});

/* ===================== Drag & drop ===================== */
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

/* ===================== Gestos: swipe + tap ===================== */
let touchStartX = 0;
let touchStartY = 0;
let touchLastX = 0;
let touchLastY = 0;
let touchMoved = false;

function selectionEmpty() {
  const s = window.getSelection();
  return !s || s.isCollapsed || String(s).trim().length === 0;
}

function isPDFLoaded() {
  return !!viewer.state.pdfDoc;
}

function withinPageLayer(target) {
  return pageLayer && (target === pageLayer || pageLayer.contains(target));
}

pageLayer.addEventListener("touchstart", (e) => {
  if (!isPDFLoaded()) return;
  const t = e.touches?.[0];
  if (!t) return;
  touchMoved = false;
  touchStartX = touchLastX = t.clientX;
  touchStartY = touchLastY = t.clientY;
}, { passive: true });

pageLayer.addEventListener("touchmove", (e) => {
  if (!isPDFLoaded()) return;
  const t = e.touches?.[0];
  if (!t) return;
  touchLastX = t.clientX;
  touchLastY = t.clientY;
  const dx = touchLastX - touchStartX;
  const dy = touchLastY - touchStartY;
  if (Math.abs(dx) > 12 || Math.abs(dy) > 12) touchMoved = true;
}, { passive: true });

pageLayer.addEventListener("touchend", async (e) => {
  if (!isPDFLoaded()) return;
  if (!selectionEmpty()) return;

  const dx = touchLastX - touchStartX;
  const dy = touchLastY - touchStartY;

  // Swipe horizontal
  if (touchMoved && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
    if (dx < 0) await goToPage(viewer.state.currentPage + 1);
    else await goToPage(viewer.state.currentPage - 1);
    return;
  }

  // Tap: borde izq/der
  const rect = pageLayer.getBoundingClientRect();
  const x = touchLastX - rect.left;
  const w = rect.width || 1;

  const leftZone = w * 0.28;
  const rightZone = w * 0.72;

  if (x <= leftZone) await goToPage(viewer.state.currentPage - 1);
  else if (x >= rightZone) await goToPage(viewer.state.currentPage + 1);
}, { passive: true });

// Desktop click (opcional): click en bordes cambia página (solo si no selecciona texto)
pageLayer.addEventListener("click", async (e) => {
  if (!isPDFLoaded()) return;
  if (!withinPageLayer(e.target)) return;
  if (!selectionEmpty()) return;

  const rect = pageLayer.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const w = rect.width || 1;

  if (x <= w * 0.20) await goToPage(viewer.state.currentPage - 1);
  else if (x >= w * 0.80) await goToPage(viewer.state.currentPage + 1);
});

/* ===================== Teclado ===================== */
window.addEventListener("keydown", async (e) => {
  if (!isPDFLoaded()) return;

  if (e.key === "ArrowLeft") prevPageBtn.click();
  if (e.key === "ArrowRight") nextPageBtn.click();
  if (e.key === "+" || e.key === "=") zoomInBtn.click();
  if (e.key === "-" || e.key === "_") zoomOutBtn.click();
  if (e.key.toLowerCase() === "f") fullscreenBtn.click();
});

/* ===================== Init ===================== */
setEnabled(false);
showDrop();
setStatus("Sin PDF cargado");

renderRecent();
applyFilter();
applyHighlightColorUI();
