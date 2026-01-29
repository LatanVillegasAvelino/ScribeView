import { initThemeToggle } from "./theme.js";
import { initHighlighting } from "./highlight.js";
import { createSearchController } from "./search.js";
import { createPdfViewer } from "./pdf-viewer.js";

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

const searchInput = el("searchInput");
const searchPrevBtn = el("searchPrev");
const searchNextBtn = el("searchNext");

const status = el("status");
const sidebar = el("sidebar");
const thumbsEl = el("thumbs");
const outlineEl = el("outline");

const viewerWrap = el("viewerWrap");
const dropZone = el("dropZone");

const canvas = el("pdfCanvas");
const textLayerEl = el("textLayer");
const highlightLayerEl = el("highlightLayer");

const themeToggle = el("themeToggle");
initThemeToggle(themeToggle);

let currentBlobUrl = null;

function setStatus(msg) { status.textContent = msg; }

function setEnabled(enabled) {
  [
    prevPageBtn, nextPageBtn, pageNumberInput, zoomOutBtn, zoomInBtn, rotateBtn,
    downloadBtn, searchInput, searchPrevBtn, searchNextBtn
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

const viewer = createPdfViewer({
  canvas,
  textLayerEl,
  thumbsEl,
  outlineEl,
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
  onStatus: setStatus
});

const search = createSearchController({
  getPageText: (p) => viewer.getPageText(p),
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

  // preparar descarga
  if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
  currentBlobUrl = URL.createObjectURL(file);

  const arrayBuffer = await file.arrayBuffer();
  const { totalPages } = await viewer.loadFromArrayBuffer(arrayBuffer);

  showViewer();
  setEnabled(true);
  await viewer.renderPage(1);
  await viewer.buildThumbnails();
  await viewer.buildOutline();
  highlights.renderHighlights(1);
  updateNav();

  // reset búsqueda
  await search.clear();
  searchInput.value = "";

  downloadBtn.disabled = false;
  setStatus(`Listo • ${totalPages} páginas`);
}

fileInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  await openPdfFile(file);
});

downloadBtn.addEventListener("click", () => {
  if (!currentBlobUrl) return;
  const a = document.createElement("a");
  a.href = currentBlobUrl;
  a.download = "documento.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
});

prevPageBtn.addEventListener("click", async () => {
  const s = viewer.state;
  await viewer.renderPage(s.currentPage - 1);
  viewer.setActiveThumb(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateNav();
});

nextPageBtn.addEventListener("click", async () => {
  const s = viewer.state;
  await viewer.renderPage(s.currentPage + 1);
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

searchInput.addEventListener("input", async () => {
  await search.buildHits(searchInput.value);
  searchPrevBtn.disabled = !searchInput.value.trim();
  searchNextBtn.disabled = !searchInput.value.trim();
});

searchNextBtn.addEventListener("click", async () => search.next());
searchPrevBtn.addEventListener("click", async () => search.prev());

toggleSidebarBtn.addEventListener("click", () => {
  sidebar.classList.toggle("hidden");
});

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tabPane").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    el(`tab-${tab}`).classList.add("active");
  });
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
});

// Estado inicial
setEnabled(false);
showDrop();
setStatus("Sin PDF cargado");
