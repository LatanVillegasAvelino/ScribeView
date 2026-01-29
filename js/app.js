import { initThemeToggle } from "./theme.js";
import { initHighlighting } from "./highlight.js";
import { createSearchController } from "./search.js";
import { createPdfViewer } from "./pdf-viewer.js";
import { sha256Hex, addRecent, loadRecent, clearRecent, clearHighlights } from "./storage.js";

const el = (id) => document.getElementById(id);

const fileInput = el("fileInput");
const downloadBtn = el("downloadBtn");
const toggleSidebarBtn = el("toggleSidebar");

const zoomOutBtn = el("zoomOut");
const zoomInBtn = el("zoomIn");
const rotateBtn = el("rotate");
const fitWidthBtn = el("fitWidth");
const fitPageBtn = el("fitPage");

const fullscreenBtn = el("fullscreenBtn");
const autoFullscreen = el("autoFullscreen");

const searchToggle = el("searchToggle");
const searchPanel = el("searchPanel");
const searchClose = el("searchClose");
const searchInput = el("searchInput");
const searchPrevBtn = el("searchPrev");
const searchNextBtn = el("searchNext");

const viewFilter = el("viewFilter");
const filterStrength = el("filterStrength");
const filterPct = el("filterPct");

const paletteEl = el("palette");
const highlightColor = el("highlightColor");
const hlSwatch = el("hlSwatch");

const status = el("status");
const pageIndicator = el("pageIndicator");

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
const pageFX = el("pageFX");

const canvas = el("pdfCanvas");
const textLayerEl = el("textLayer");
const highlightLayerEl = el("highlightLayer");

const hlMenu = el("hlMenu");
const hlMenuPalette = el("hlMenuPalette");
const hlMenuApply = el("hlMenuApply");
const hlMenuCancel = el("hlMenuCancel");

const themeToggle = el("themeToggle");
initThemeToggle(themeToggle);

let currentBlobUrl = null;
let currentDocHash = null;
let currentFileMeta = null;

const KEY_PREFS = "scribeview:prefs:v5";

const PALETTE = [
  "#ffe066", "#ffd43b", "#ff922b", "#ff6b6b",
  "#f06595", "#cc5de8", "#845ef7", "#5c7cfa",
  "#339af0", "#22b8cf", "#20c997", "#51cf66",
  "#94d82d", "#adb5bd"
];

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

function showViewer() {
  dropZone.classList.add("hidden");
  viewerWrap.classList.remove("hidden");
}
function showDrop() {
  viewerWrap.classList.add("hidden");
  dropZone.classList.remove("hidden");
}

function setEnabled(enabled) {
  [
    downloadBtn, fullscreenBtn, searchToggle,
    zoomOutBtn, zoomInBtn, rotateBtn, fitWidthBtn, fitPageBtn,
    viewFilter, filterStrength, highlightColor,
    clearNotesBtn, searchInput, searchPrevBtn, searchNextBtn
  ].forEach(b => b.disabled = !enabled);

  paletteEl.querySelectorAll("button").forEach(b => b.disabled = !enabled);
}

function updateFooter() {
  const s = viewer.state;
  pageIndicator.textContent = `Página ${s.currentPage || 0} / ${s.totalPages || 0}`;
}

/* ===== Paleta ===== */
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
highlightColor.addEventListener("input", applyHighlightColorUI);
buildPalette();
applyHighlightColorUI();

/* ===== Filtros ===== */
function applyFilter() {
  const mode = viewFilter.value;
  const s = Math.max(0, Math.min(2, Number(filterStrength.value || "0") / 100));
  filterPct.textContent = `${filterStrength.value}%`;

  let f = "none";
  if (mode === "sepia") {
    f = `sepia(${Math.min(1, s)}) saturate(${1 + s * 0.7}) contrast(${1.05 + s * 0.10})`;
  } else if (mode === "grayscale") {
    f = `grayscale(${Math.min(1, s)}) contrast(${1.05 + s * 0.12})`;
  } else if (mode === "invert") {
    f = `invert(${Math.min(1, s)}) hue-rotate(180deg) contrast(${1.05 + s * 0.10})`;
  }
  canvas.style.filter = f;

  prefs.viewFilter = mode;
  prefs.filterStrength = Number(filterStrength.value || "0");
  savePrefs(prefs);
}
viewFilter.addEventListener("change", applyFilter);
filterStrength.addEventListener("input", applyFilter);

/* ===== Fullscreen + FIX: refit ===== */
async function toggleFullscreen() {
  const target = document.documentElement;
  try {
    if (!document.fullscreenElement) await target.requestFullscreen?.();
    else await document.exitFullscreen?.();
  } catch {
    setStatus("Pantalla completa no disponible.");
  }
}
fullscreenBtn.addEventListener("click", toggleFullscreen);

autoFullscreen.addEventListener("change", () => {
  prefs.autoFullscreen = autoFullscreen.checked;
  savePrefs(prefs);
});

// FIX CRÍTICO: al entrar/salir de fullscreen, reajusta el PDF
async function refitAfterLayoutChange() {
  if (!viewer.state.pdfDoc) return;
  // espera 2 frames para que CSS aplique el layout
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  await viewer.fitPage();
  await viewer.renderPage(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateFooter();
}
document.addEventListener("fullscreenchange", () => {
  refitAfterLayoutChange();
});

/* ===== Búsqueda ===== */
function openSearchPanel() {
  searchPanel.classList.remove("hidden");
  setTimeout(() => searchInput.focus(), 0);
}
function closeSearchPanel() {
  searchPanel.classList.add("hidden");
}
searchToggle.addEventListener("click", () => {
  if (searchPanel.classList.contains("hidden")) openSearchPanel();
  else closeSearchPanel();
});
searchClose.addEventListener("click", closeSearchPanel);

/* ===== Viewer ===== */
const viewer = createPdfViewer({
  canvas,
  textLayerEl,
  thumbsEl,
  outlineEl,
  viewerWrapEl: viewerWrap,
  onThumbClick: async (page) => goToPage(page, page > viewer.state.currentPage ? "next" : "prev"),
  onOutlineClick: async (page) => goToPage(page, page > viewer.state.currentPage ? "next" : "prev"),
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
    updateFooter();
  },
  getCurrentPage: () => viewer.state.currentPage,
  getTotalPages: () => viewer.state.totalPages,
  getTextLayerEl: () => textLayerEl,
  onStatus: setStatus
});

/* ===== Animación hoja ===== */
function fxOn(){ pageFX.classList.remove("fxOff"); pageFX.classList.add("fxOn"); }
function fxOff(){ pageFX.classList.remove("fxOn"); pageFX.classList.add("fxOff"); }

function flipOut(dir){
  pageLayer.classList.remove("flipOutNext","flipInNext","flipOutPrev","flipInPrev");
  fxOn();
  pageLayer.classList.add(dir === "prev" ? "flipOutPrev" : "flipOutNext");
}
function flipIn(dir){
  pageLayer.classList.remove("flipOutNext","flipInNext","flipOutPrev","flipInPrev");
  pageLayer.classList.add(dir === "prev" ? "flipInPrev" : "flipInNext");
  setTimeout(() => fxOff(), 160);
  setTimeout(() => pageLayer.classList.remove("flipInNext","flipInPrev"), 240);
}

async function goToPage(page, dir="next"){
  if(!viewer.state.pdfDoc) return;
  const target = Math.min(Math.max(1,page), viewer.state.totalPages);
  if(target === viewer.state.currentPage) return;

  flipOut(dir);
  setTimeout(async ()=>{
    await viewer.renderPage(target);
    viewer.setActiveThumb(viewer.state.currentPage);
    highlights.renderHighlights(viewer.state.currentPage);
    await search.markOnCurrentPage();
    updateFooter();
    flipIn(dir);
  }, 160);
}

/* ===== Recientes / Notes ===== */
function formatDate(ts){ return new Date(ts).toLocaleString(); }
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}
function renderRecent(){
  const list = loadRecent();
  if(!list.length){ recentEl.innerHTML = `<div class="muted">Sin recientes.</div>`; return; }
  recentEl.innerHTML = "";
  for(const r of list){
    const div = document.createElement("div");
    div.className = "recentItem";
    div.innerHTML = `
      <div><b>${escapeHtml(r.name || "PDF")}</b></div>
      <div class="muted">hash: ${r.hash.slice(0,10)}… • ${(r.size/1024/1024).toFixed(2)} MB</div>
      <div class="muted">Último: ${formatDate(r.lastOpened)}</div>
    `;
    recentEl.appendChild(div);
  }
}
function renderNotes(list){
  if(!currentDocHash){ notesEl.innerHTML = `<div class="muted">Abre un PDF para ver anotaciones.</div>`; return; }
  if(!list.length){ notesEl.innerHTML = `<div class="muted">Aún no hay highlights.</div>`; return; }

  notesEl.innerHTML = "";
  for(const h of list){
    const div = document.createElement("div");
    div.className = "noteItem";
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
        <b>Pág. ${h.page}</b>
        <span style="width:12px;height:12px;border-radius:4px;background:${h.color || "#ffe066"};border:1px solid rgba(127,127,127,.4)"></span>
      </div>
      <div style="margin-top:6px;font-size:13px;">${escapeHtml(h.text).slice(0,170)}</div>
      <div class="muted" style="margin-top:6px;">${formatDate(h.createdAt)}</div>
    `;
    div.addEventListener("click", async ()=>{
      await goToPage(h.page, h.page > viewer.state.currentPage ? "next" : "prev");
      highlightLayerEl.querySelector(`.hl[data-hid="${h.id}"]`)?.scrollIntoView({ block:"center" });
    });
    notesEl.appendChild(div);
  }
}

/* ===== Abrir PDF ===== */
async function openPdfFile(file){
  if(!file) return;
  if(file.type !== "application/pdf"){ setStatus("Ese archivo no es un PDF."); return; }

  if(currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
  currentBlobUrl = URL.createObjectURL(file);

  const arrayBuffer = await file.arrayBuffer();
  setStatus("Calculando hash…");
  currentDocHash = await sha256Hex(arrayBuffer);
  currentFileMeta = { name:file.name, size:file.size };

  addRecent({ name:file.name, size:file.size, hash:currentDocHash, lastOpened:Date.now() });
  renderRecent();

  const { totalPages } = await viewer.loadFromArrayBuffer(arrayBuffer);
  highlights.setDocHash(currentDocHash);

  showViewer();
  setEnabled(true);

  await viewer.renderPage(1);
  await viewer.buildThumbnails();
  await viewer.buildOutline();

  highlights.renderHighlights(1);
  await search.clear();

  downloadBtn.disabled = false;
  clearNotesBtn.disabled = !highlights.getAll().length;

  applyFilter();
  applyHighlightColorUI();

  updateFooter();
  setStatus(`Listo • ${totalPages} páginas`);

  // al abrir: ajusta a página para evitar “aire”
  await viewer.fitPage();
  await viewer.renderPage(1);
  highlights.renderHighlights(1);
  updateFooter();

  if(autoFullscreen.checked) await toggleFullscreen();
}

fileInput.addEventListener("change", async (e)=>{
  const file = e.target.files?.[0];
  await openPdfFile(file);
});

downloadBtn.addEventListener("click", ()=>{
  if(!currentBlobUrl) return;
  const a = document.createElement("a");
  a.href = currentBlobUrl;
  a.download = currentFileMeta?.name || "documento.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
});

/* ===== Controles ===== */
zoomOutBtn.addEventListener("click", async ()=>{
  viewer.setScale(viewer.state.scale - 0.2);
  await viewer.renderPage(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateFooter();
});
zoomInBtn.addEventListener("click", async ()=>{
  viewer.setScale(viewer.state.scale + 0.2);
  await viewer.renderPage(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateFooter();
});
rotateBtn.addEventListener("click", async ()=>{
  viewer.setRotation(viewer.state.rotation + 90);
  await viewer.renderPage(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateFooter();
});
fitWidthBtn.addEventListener("click", async ()=>{
  await viewer.fitWidth();
  await viewer.renderPage(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateFooter();
});
fitPageBtn.addEventListener("click", async ()=>{
  await viewer.fitPage();
  await viewer.renderPage(viewer.state.currentPage);
  highlights.renderHighlights(viewer.state.currentPage);
  await search.markOnCurrentPage();
  updateFooter();
});

/* ===== Búsqueda ===== */
searchInput.addEventListener("input", async ()=>{
  await search.buildHits(searchInput.value);
  const has = !!searchInput.value.trim();
  searchPrevBtn.disabled = !has;
  searchNextBtn.disabled = !has;
});
searchNextBtn.addEventListener("click", async ()=>search.next());
searchPrevBtn.addEventListener("click", async ()=>search.prev());

/* ===== Sidebar ===== */
toggleSidebarBtn.addEventListener("click",(e)=>{
  e.stopPropagation();
  sidebar.classList.toggle("hidden");
});
document.addEventListener("click",(e)=>{
  const isMobile = window.matchMedia("(max-width: 980px)").matches;
  if(!isMobile) return;
  const inside = sidebar.contains(e.target) || toggleSidebarBtn.contains(e.target);
  if(!inside && !sidebar.classList.contains("hidden")) sidebar.classList.add("hidden");
});
document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".tab").forEach(b=>b.classList.remove("active"));
    document.querySelectorAll(".tabPane").forEach(p=>p.classList.remove("active"));
    btn.classList.add("active");
    el(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

/* ===== Borrar highlights ===== */
clearNotesBtn.addEventListener("click", ()=>{
  if(!currentDocHash) return;
  clearHighlights(currentDocHash);
  highlights.setDocHash(currentDocHash);
  highlights.renderHighlights(viewer.state.currentPage);
  setStatus("Highlights borrados para este PDF");
});

/* ===== Recientes ===== */
clearRecentBtn.addEventListener("click", ()=>{
  clearRecent();
  renderRecent();
  setStatus("Recientes limpiados");
});

/* ===== Drag & drop ===== */
["dragenter","dragover"].forEach(evt=>{
  dropZone.addEventListener(evt,(e)=>{ e.preventDefault(); });
});
dropZone.addEventListener("drop", async (e)=>{
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  await openPdfFile(file);
});

/* ===== Gestos pasar página ===== */
let sx=0, sy=0, lx=0, ly=0, moved=false;
function selectionEmpty(){
  const s = window.getSelection();
  return !s || s.isCollapsed || String(s).trim().length === 0;
}
function loaded(){ return !!viewer.state.pdfDoc; }

pageLayer.addEventListener("touchstart",(e)=>{
  if(!loaded()) return;
  const t=e.touches?.[0]; if(!t) return;
  moved=false; sx=lx=t.clientX; sy=ly=t.clientY;
},{passive:true});
pageLayer.addEventListener("touchmove",(e)=>{
  if(!loaded()) return;
  const t=e.touches?.[0]; if(!t) return;
  lx=t.clientX; ly=t.clientY;
  if(Math.abs(lx-sx)>12 || Math.abs(ly-sy)>12) moved=true;
},{passive:true});
pageLayer.addEventListener("touchend", async ()=>{
  if(!loaded()) return;
  if(!selectionEmpty()) return;

  const dx=lx-sx, dy=ly-sy;
  if(moved && Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.2){
    if(dx<0) await goToPage(viewer.state.currentPage+1,"next");
    else await goToPage(viewer.state.currentPage-1,"prev");
    return;
  }
  const r=pageLayer.getBoundingClientRect();
  const x=lx-r.left, w=r.width||1;
  if(x<=w*0.28) await goToPage(viewer.state.currentPage-1,"prev");
  else if(x>=w*0.72) await goToPage(viewer.state.currentPage+1,"next");
},{passive:true});

/* ===== INIT ===== */
setEnabled(false);
showDrop();
setStatus("Sin PDF cargado");
renderRecent();
applyFilter();
applyHighlightColorUI();
updateFooter();
