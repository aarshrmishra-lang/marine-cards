/* Marine Contacts Register — installable, offline business-card register. */
"use strict";

const FIELDS = ["name","name_local","company","company_full","title","department","mobile","phone","email","fax","website","country","address","notes"];
const SEARCH_FIELDS = ["name","name_local","company","company_full","title","department","email","phone","mobile","fax","country","notes","address","ocr_text"];
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm = s => String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const sortKey = s => norm(s).replace(/^[^a-z0-9　-￿]+/, "");
const today = () => new Date().toISOString().slice(0, 10);
let seq = 0;
const newId = () => "m" + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

/* ---------- storage (IndexedDB) ---------- */
const Store = (() => {
  let dbp = null;
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open("marine-cards", 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("cards", { keyPath: "id" }); d.createObjectStore("photos"); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  return {
    async all() { const d = await open(); return req(d.transaction("cards").objectStore("cards").getAll()); },
    async putMany(cards) { const d = await open(); const t = d.transaction("cards", "readwrite"); cards.forEach(c => t.objectStore("cards").put(c)); return done(t); },
    async del(id) { const d = await open(); const t = d.transaction(["cards", "photos"], "readwrite"); t.objectStore("cards").delete(id); t.objectStore("photos").delete(id); return done(t); },
    async getPhoto(id) { const d = await open(); return req(d.transaction("photos").objectStore("photos").get(id)); },
    async putPhoto(id, p) { const d = await open(); const t = d.transaction("photos", "readwrite"); if (p) t.objectStore("photos").put(p, id); else t.objectStore("photos").delete(id); return done(t); },
    async photoKeys() { const d = await open(); return req(d.transaction("photos").objectStore("photos").getAllKeys()); },
    async wipe() { const d = await open(); const t = d.transaction(["cards", "photos"], "readwrite"); t.objectStore("cards").clear(); t.objectStore("photos").clear(); return done(t); }
  };
})();

/* photos are stored as {type, buf:ArrayBuffer} for Safari compatibility */
const photoURLs = new Map();
async function photoURL(id, side = "front") {
  const key = id + ":" + side;
  if (photoURLs.has(key)) return photoURLs.get(key);
  const p = await Store.getPhoto(id).catch(() => null);
  if (!p || !p[side]) return null;
  const url = URL.createObjectURL(new Blob([p[side].buf], { type: p[side].type }));
  photoURLs.set(key, url);
  return url;
}
function forgetPhoto(id) { ["front", "back"].forEach(s => { const k = id + ":" + s; if (photoURLs.has(k)) { URL.revokeObjectURL(photoURLs.get(k)); photoURLs.delete(k); } }); }
async function blobToStored(blob) { return { type: blob.type || "image/jpeg", buf: await blob.arrayBuffer() }; }

/* ---------- state ---------- */
let cards = [], photoIds = new Set(), coFilter = null, query = "";

async function load() {
  try {
    cards = await Store.all();
    photoIds = new Set(await Store.photoKeys());
  } catch (e) {
    cards = [];
    toast("This browser blocked on-device storage. Cards can't be saved here.");
  }
  refresh();
}
function refresh() { if (coFilter && !cards.some(c => c.company === coFilter)) coFilter = null; renderIndex(); render(); }

/* ---------- search & render ---------- */
function terms() { return norm(query).split(/\s+/).filter(Boolean); }
function hay(c) { return norm(SEARCH_FIELDS.map(f => c[f] || "").join(" | ")) + " " + String((c.phone || "") + (c.mobile || "") + (c.fax || "")).replace(/\D/g, ""); }
function matches(c, t) { const h = hay(c); return t.every(x => h.includes(x) || (/^\+?[\d\s\-()]+$/.test(x) && x.replace(/\D/g, "").length > 2 && h.includes(x.replace(/\D/g, "")))); }
function hl(s, t) {
  s = String(s ?? ""); if (!t.length || !s) return esc(s);
  const n = norm(s); if (n.length !== s.length) return esc(s);
  const marks = new Array(s.length).fill(false);
  t.forEach(x => { let i = n.indexOf(x); while (x && i > -1) { for (let k = i; k < i + x.length; k++) marks[k] = true; i = n.indexOf(x, i + x.length); } });
  let out = "", on = false;
  for (let i = 0; i < s.length; i++) { if (marks[i] && !on) { out += "<mark>"; on = true; } if (!marks[i] && on) { out += "</mark>"; on = false; } out += esc(s[i]); }
  return out + (on ? "</mark>" : "");
}
function companyCounts() { const m = {}; cards.forEach(c => { const k = c.company || "Unknown"; m[k] = (m[k] || 0) + 1; }); return m; }
function renderIndex() {
  const counts = companyCounts();
  const names = Object.keys(counts).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  let html = "", last = "";
  names.forEach(n => {
    const L = (sortKey(n)[0] || "#").toUpperCase();
    if (L !== last) { html += `<li class="letter">${esc(L)}</li>`; last = L; }
    html += `<li><button type="button" data-co="${esc(n)}" aria-pressed="${coFilter === n}"><span>${esc(n)}</span><span class="n">${counts[n]}</span></button></li>`;
  });
  if (!names.length) html = `<li class="letter" style="color:var(--muted)">No companies yet</li>`;
  $("idx").innerHTML = html; $("idx2").innerHTML = html;
  $("ccount").textContent = names.length; $("ccount2").textContent = names.length;
  $("coList").innerHTML = names.map(n => `<option value="${esc(n)}">`).join("");
  $("count").textContent = `${cards.length} cards · ${names.length} companies`;
}
function row(label, val, t, opts = {}) {
  if (!val) return "";
  let v = hl(val, t);
  if (opts.tel) v = String(val).split(/\s*\/\s*/).map(p => `<a href="tel:${esc(p.replace(/[^\d+]/g, ""))}">${hl(p, t)}</a>`).join(" / ");
  if (opts.mail) v = String(val).split(/\s*\/\s*/).map(p => { const e = p.replace(/\s*\(.*?\)\s*/g, "").trim(); return `<a href="mailto:${esc(e)}">${hl(p, t)}</a>`; }).join(" / ");
  return `<dt>${label}</dt><dd class="${opts.txt ? "txt" : ""}">${v}${opts.copy ? ` <button class="copy" type="button" data-copy="${esc(val)}">Copy</button>` : ""}</dd>`;
}
function cardHTML(c, t) {
  const role = [c.title, c.department].filter(Boolean).join(" · ");
  const web = c.website ? `<dt>Web</dt><dd>${String(c.website).split(/\s*\/\s*/).map(w => `<a href="${esc(/^https?:/i.test(w) ? w : "https://" + w)}" target="_blank" rel="noopener">${hl(w, t)}</a>`).join(" / ")}</dd>` : "";
  const hasPhoto = photoIds.has(c.id);
  return `<article class="card" data-id="${esc(c.id)}">
    <div class="head"><div class="who"><div class="nm">${hl(c.name, t)}${c.name_local ? `<span class="loc">${hl(c.name_local, t)}</span>` : ""}</div>
      ${role ? `<div class="role">${hl(role, t)}</div>` : ""}
      ${c.company_full && c.company_full !== c.company ? `<div class="co">${hl(c.company_full, t)}</div>` : ""}</div>
      ${hasPhoto ? `<img class="thumb" data-photo="${esc(c.id)}" alt="Card photo">` : ""}</div>
    ${c.uncertain ? `<span class="flagnote">Check against card</span>` : ""}
    <dl class="rows">
      ${row("Mobile", c.mobile, t, { tel: 1, copy: 1 })}${row("Phone", c.phone, t, { tel: 1, copy: 1 })}${row("Email", c.email, t, { mail: 1, copy: 1 })}${row("Fax", c.fax, t)}
      ${web}${row("Address", c.address, t, { txt: 1 })}${row("Country", c.country, t, { txt: 1 })}${row("Notes", c.notes, t, { txt: 1 })}
    </dl>
    <div class="meta"><span>${esc(c.source || "Added on device")}${c.added ? " · " + esc(c.added) : ""}</span><span class="acts"><button class="ghost" type="button" data-edit="${esc(c.id)}">Edit</button></span></div>
  </article>`;
}
function render() {
  const t = terms();
  const rows = cards.filter(c => (!coFilter || c.company === coFilter) && (!t.length || matches(c, t)));
  let st = "";
  if (coFilter) st += `<span class="pill"><span>Company: ${esc(coFilter)}</span><button type="button" id="clrCo" aria-label="Clear company filter">×</button></span>`;
  if (t.length) st += `<span class="pill"><span>“${esc(query)}”</span><button type="button" id="clrQ" aria-label="Clear search">×</button></span>`;
  if (cards.length) st += `<span>${rows.length === cards.length ? `${cards.length} cards · ${Object.keys(companyCounts()).length} companies` : `${rows.length} of ${cards.length} ${rows.length === 1 ? "contact" : "contacts"} shown`}</span>`;
  $("status").innerHTML = st;
  if (!cards.length) {
    $("list").innerHTML = `<div class="empty"><h2>Your register is empty</h2>
      <p>Import the backup file Claude sent you to load your existing cards, or scan your first card.</p>
      <div class="acts"><button class="btn primary" type="button" data-act="import">Import backup file</button><button class="btn flagb" type="button" data-act="scan">Scan a card</button>${isInstalled() ? "" : `<button class="btn" type="button" data-act="install">Install the app</button>`}</div></div>`;
    return;
  }
  if (!rows.length) { $("list").innerHTML = `<div class="empty">No contact matches “${esc(query)}”${coFilter ? ` at ${esc(coFilter)}` : ""}. Try part of a name, a company, or the last digits of a phone number.</div>`; return; }
  const groups = {};
  rows.forEach(c => { (groups[c.company || "Unknown"] = groups[c.company || "Unknown"] || []).push(c); });
  const keys = Object.keys(groups).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  // render progressively so big registers stay snappy on phones
  const html = keys.map(k => {
    const g = groups[k].sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name)));
    return `<section class="group"><h3>${hl(k, t)} <span class="n">${g.length}</span></h3><div class="cards">${g.map(c => cardHTML(c, t)).join("")}</div></section>`;
  }).join("");
  $("list").innerHTML = html;
  loadThumbs();
}
let thumbObs = null;
function loadThumbs() {
  const imgs = [...document.querySelectorAll("img.thumb[data-photo]:not([src])")];
  const go = async img => { const u = await photoURL(img.dataset.photo); if (u) img.src = u; };
  if (!("IntersectionObserver" in window)) { imgs.forEach(go); return; }
  if (!thumbObs) thumbObs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { thumbObs.unobserve(e.target); go(e.target); } }), { rootMargin: "300px" });
  imgs.forEach(i => thumbObs.observe(i));
}

/* ---------- toast ---------- */
function toast(msg, ms = 2600) { const el = $("toast"); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, ms); }

/* ---------- sheets ---------- */
function openSheet(id) { $(id).hidden = false; document.body.style.overflow = "hidden"; }
function closeSheet(id) { $(id).hidden = true; if ([...document.querySelectorAll(".scrim")].every(s => s.hidden)) document.body.style.overflow = ""; if (id === "formSheet") resetForm(); }
document.querySelectorAll(".scrim").forEach(s => {
  s.addEventListener("click", e => { if (e.target === s || e.target.closest("[data-close]")) closeSheet(s.id); });
});
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("viewer").hidden) { $("viewer").hidden = true; return; }
  const open = [...document.querySelectorAll(".scrim")].reverse().find(s => !s.hidden);
  if (open) closeSheet(open.id);
});

/* ---------- list interactions ---------- */
let qt;
$("q").addEventListener("input", e => { clearTimeout(qt); qt = setTimeout(() => { query = e.target.value.trim(); render(); }, 120); });
function pickCompany(e) {
  const b = e.target.closest("button[data-co]"); if (!b) return;
  coFilter = coFilter === b.dataset.co ? null : b.dataset.co;
  renderIndex(); render(); closeSheet("idxSheet"); window.scrollTo({ top: 0 });
}
$("idx").addEventListener("click", pickCompany);
$("idx2").addEventListener("click", pickCompany);
$("idxBtnM").addEventListener("click", () => openSheet("idxSheet"));
$("status").addEventListener("click", e => {
  if (e.target.closest("#clrCo")) { coFilter = null; refresh(); }
  if (e.target.closest("#clrQ")) { query = ""; $("q").value = ""; render(); }
});
$("list").addEventListener("click", async e => {
  const cp = e.target.closest("[data-copy]");
  if (cp) {
    try { await navigator.clipboard.writeText(cp.dataset.copy); toast("Copied"); }
    catch (_) { const r = document.createRange(); r.selectNodeContents(cp.parentElement); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selected — copy it from the menu"); }
    return;
  }
  const ed = e.target.closest("[data-edit]"); if (ed) { openEdit(cards.find(c => c.id === ed.dataset.edit)); return; }
  const ph = e.target.closest("[data-photo]"); if (ph) { showPhoto(ph.src || await photoURL(ph.dataset.photo)); return; }
  const act = e.target.closest("[data-act]");
  if (act && act.dataset.act === "import") $("impFile").click();
  if (act && act.dataset.act === "scan") openScan();
  if (act && act.dataset.act === "install") $("installBtn").click();
});
function showPhoto(src) { if (!src) return; $("viewerImg").src = src; $("viewer").hidden = false; }
$("viewer").addEventListener("click", () => $("viewer").hidden = true);

/* ---------- image handling ---------- */
async function loadBitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch (_) {
    const url = URL.createObjectURL(file);
    try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
}
function drawScaled(src, maxSide, rotate = 0, gray = false) {
  const w0 = src.width, h0 = src.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.round(w0 * k), h = Math.round(h0 * k);
  const c = document.createElement("canvas");
  const swap = rotate % 180 !== 0;
  c.width = swap ? h : w; c.height = swap ? w : h;
  const g = c.getContext("2d");
  g.translate(c.width / 2, c.height / 2); g.rotate(rotate * Math.PI / 180);
  if (gray) g.filter = "grayscale(1) contrast(1.25)";
  g.drawImage(src, -w / 2, -h / 2, w, h);
  return c;
}
const canvasBlob = (c, q = 0.82) => new Promise(r => c.toBlob(r, "image/jpeg", q));

/* ---------- card reading (Tesseract, loaded on demand, cached for offline) ---------- */
const ENGINE = {
  lib: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
  worker: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
  core: simd => `https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/tesseract-core-${simd ? "simd-" : ""}lstm.wasm.js`
};
let workerP = null, ocrProgress = () => {};
function hasSimd() {
  try { return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11])); } catch (_) { return false; }
}
async function blobURLFor(url) {
  const r = await fetch(url, { mode: "cors" });
  if (!r.ok) throw new Error("download failed " + r.status);
  return URL.createObjectURL(new Blob([await r.blob()], { type: "application/javascript" }));
}
async function loadScript(url) {
  if (window.Tesseract) return;
  const src = await blobURLFor(url);
  await new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("script failed")); document.head.appendChild(s); });
}
function getWorker() {
  if (workerP) return workerP;
  workerP = (async () => {
    await loadScript(ENGINE.lib);
    const [workerPath, coreURL] = await Promise.all([blobURLFor(ENGINE.worker), blobURLFor(ENGINE.core(hasSimd()))]);
    const langPath = new URL("lang", location.href).href;
    const w = await Tesseract.createWorker("eng", 1, {
      workerPath, workerBlobURL: false,
      corePath: coreURL + "#tesseract-core.wasm.js",   // the library looks for a ".js" ending
      langPath, gzip: true,
      logger: m => ocrProgress(m)
    });
    await w.setParameters({ tessedit_pageseg_mode: "3", preserve_interword_spaces: "1" });
    try { localStorage.setItem("engineReady", "1"); } catch (_) {}
    return w;
  })();
  workerP.catch(() => { workerP = null; });
  return workerP;
}
async function readImage(bitmap, rotate) {
  const w = await getWorker();
  const run = async r => { const c = drawScaled(bitmap, 2000, r, true); const { data } = await w.recognize(c); return { text: data.text || "", conf: data.confidence || 0, words: (data.text || "").split(/\s+/).filter(x => x.length > 2).length, rotate: r }; };
  if (rotate !== undefined) return run(rotate);
  // try upright; if it reads poorly, try sideways too and keep the best
  let best = await run(0);
  if (best.conf < 62 || best.words < 6) {
    for (const r of [90, 270]) {
      ocrProgress({ status: "trying another angle", progress: 0 });
      const t = await run(r);
      if (t.conf * Math.min(1, t.words / 8) > best.conf * Math.min(1, best.words / 8)) best = t;
    }
  }
  return best;
}

/* ---------- scan / add / edit form ---------- */
let current = null;   // {id|null, front:{bitmap,blob}, back:{...}, rotate, ocr:{front,back}, auto:Set}
function resetForm() {
  current = null;
  $("form").reset();
  ["frontImg", "backImg"].forEach(i => { const im = $(i); if (im.src && im.src.startsWith("blob:") && !im.dataset.keep) URL.revokeObjectURL(im.src); im.removeAttribute("src"); im.dataset.keep = ""; });
  $("backImg").hidden = true; $("frontImg").hidden = false;
  $("retakeBtn").textContent = "Retake"; $("rotateBtn").hidden = false; $("backBtn").hidden = false;
  ["progress", "readNote", "dupNote", "rawBox", "ferr", "delBtn", "removePhotoBtn"].forEach(i => $(i).hidden = true);
  document.querySelectorAll("#fields .filled").forEach(el => el.classList.remove("filled"));
  document.querySelectorAll("#fields .auto").forEach(el => el.remove());
  $("saveBtn").disabled = false;
}
function setPhotoButtons(has) {
  $("retakeBtn").textContent = has ? "Retake" : "Add photo";
  $("rotateBtn").hidden = !has || !(current && current.front);
  $("backBtn").hidden = !has;
}
function setStep(step) { $("pickStep").hidden = step !== "pick"; $("formStep").hidden = step === "pick"; }
function openScan() {
  resetForm();
  current = { id: null, auto: new Set() };
  $("fTitle").textContent = "Scan a card";
  $("fHint").textContent = "Take a photo of the card. The app reads it on this device and fills in the details for you to check.";
  $("fHint").hidden = false;
  setStep("pick");
  openSheet("formSheet");
}
function openManual() {
  resetForm();
  current = { id: null, auto: new Set() };
  $("fTitle").textContent = "Add a card";
  $("fHint").hidden = true;
  setStep("form"); $("photoCol").hidden = true; $("formStep").classList.remove("has-photo");
  if (coFilter) $("f_company").value = coFilter;
  openSheet("formSheet");
  setTimeout(() => $("f_name").focus(), 50);
}
async function openEdit(c) {
  if (!c) return;
  resetForm();
  current = { id: c.id, auto: new Set(), existing: c };
  $("fTitle").textContent = "Edit card"; $("fHint").hidden = true;
  FIELDS.forEach(f => $("f_" + f).value = c[f] || "");
  $("f_uncertain").checked = !!c.uncertain;
  $("delBtn").hidden = false; $("delBtn").textContent = "Delete card"; delArmed = false;
  setStep("form");
  const fu = await photoURL(c.id, "front"), bu = await photoURL(c.id, "back");
  $("photoCol").hidden = false; $("formStep").classList.add("has-photo");
  if (fu) { $("frontImg").src = fu; $("frontImg").dataset.keep = "1"; $("frontImg").hidden = false; $("removePhotoBtn").hidden = false; }
  else { $("frontImg").hidden = true; }
  setPhotoButtons(!!fu);
  if (bu) { $("backImg").src = bu; $("backImg").dataset.keep = "1"; $("backImg").hidden = false; }
  if (c.ocr_text) { $("rawText").textContent = c.ocr_text; $("rawBox").hidden = false; }
  openSheet("formSheet");
}

$("scanBtnD").addEventListener("click", openScan);
$("scanBtnM").addEventListener("click", openScan);
$("addBtnD").addEventListener("click", openManual);
$("skipPhoto").addEventListener("click", () => { const keep = current; openManual(); if (keep) current.id = keep.id; });
$("takePhoto").addEventListener("click", () => $("camInput").click());
$("choosePhoto").addEventListener("click", () => $("fileInput").click());
$("retakeBtn").addEventListener("click", () => $("camInput").click());
$("backBtn").addEventListener("click", () => $("backInput").click());
$("camInput").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) handlePhoto(f, "front"); });
$("fileInput").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) handlePhoto(f, "front"); });
$("backInput").addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) handlePhoto(f, "back"); });
$("rotateBtn").addEventListener("click", () => {
  if (!current || !current.front) { toast("Take or choose a photo first"); return; }
  current.rotate = ((current.rotate || 0) + 90) % 360;
  runRead("front", current.rotate);
});
$("removePhotoBtn").addEventListener("click", () => {
  if (!current) return;
  current.removePhoto = true; current.front = null; current.back = null;
  $("frontImg").removeAttribute("src"); $("backImg").hidden = true; $("removePhotoBtn").hidden = true;
  toast("Photo will be removed when you save");
});
// drop / paste
const drop = $("drop");
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => { const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith("image/")); if (f) handlePhoto(f, "front"); });
document.addEventListener("paste", e => {
  if ($("formSheet").hidden || $("pickStep").hidden) return;
  const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith("image/"));
  if (f) { e.preventDefault(); handlePhoto(f, "front"); }
});
// dropping a photo anywhere on the page starts a scan (desktop)
document.addEventListener("dragover", e => { if ([...(e.dataTransfer?.items || [])].some(i => i.kind === "file")) e.preventDefault(); });
document.addEventListener("drop", e => {
  if (e.target.closest && e.target.closest("#drop")) return;
  const f = [...(e.dataTransfer?.files || [])].find(x => x.type.startsWith("image/"));
  if (f) { e.preventDefault(); if ($("formSheet").hidden) openScan(); handlePhoto(f, "front"); }
});

async function handlePhoto(file, side) {
  if (!current) current = { id: null, auto: new Set() };
  let bmp;
  try { bmp = await loadBitmap(file); } catch (_) { toast("That file couldn't be opened as a photo."); return; }
  const stored = await canvasBlob(drawScaled(bmp, 1400));
  current[side] = { bitmap: bmp, blob: stored };
  current.removePhoto = false;
  const img = side === "front" ? $("frontImg") : $("backImg");
  if (img.src && img.src.startsWith("blob:") && !img.dataset.keep) URL.revokeObjectURL(img.src);
  img.dataset.keep = ""; img.src = URL.createObjectURL(stored); img.hidden = false;
  if (side === "front") current.rotate = 0;
  setPhotoButtons(true);
  setStep("form"); $("photoCol").hidden = false; $("formStep").classList.add("has-photo"); $("fHint").hidden = true;
  runRead(side);
}

async function runRead(side, rotate) {
  const src = current && current[side]; if (!src) return;
  $("progress").hidden = false; $("readNote").hidden = true;
  $("progBar").style.width = "4%";
  $("progText").textContent = "Reading the card…";
  ocrProgress = m => {
    const p = m.status === "recognizing text" ? 0.35 + 0.65 * (m.progress || 0) : 0.05 + 0.3 * (m.progress || 0);
    $("progBar").style.width = Math.round(p * 100) + "%";
    $("progText").textContent = m.status === "recognizing text" ? "Reading the card…" : /load|initializ/.test(m.status || "") ? "Preparing the card reader (first time only)…" : "Reading the card…";
  };
  let res;
  try {
    res = await readImage(src.bitmap, rotate);
  } catch (e) {
    $("progress").hidden = true;
    const n = $("readNote");
    n.textContent = navigator.onLine
      ? "The card reader couldn't start. Type the details below, or try again in a moment."
      : "The card reader needs an internet connection the first time it's used on this device. The photo is kept — type the details below, or connect once and tap Rotate to read it.";
    n.hidden = false;
    return;
  }
  $("progBar").style.width = "100%";
  setTimeout(() => $("progress").hidden = true, 300);
  if (rotate === undefined && side === "front") current.rotate = res.rotate;
  current.ocr = current.ocr || {};
  current.ocr[side] = res.text;
  $("rawText").textContent = [current.ocr.front, current.ocr.back].filter(Boolean).join("\n— back —\n");
  $("rawBox").hidden = false;
  const parsed = CardParser.parseCard(res.text, { companies: Object.keys(companyCounts()), domains: domainMap() });
  fillFields(parsed, side === "back" || !!current.id);
  if (res.conf < 45 || res.words < 4) {
    const n = $("readNote");
    n.textContent = "The photo was hard to read. Check the details, or retake it closer and in better light.";
    n.hidden = false;
  }
  $("f_uncertain").checked = true;
  checkDuplicate();
}
function domainMap() {
  const m = {};
  cards.forEach(c => String(c.email || "").split("/").forEach(e => {
    const d = (e.replace(/\s*\(.*?\)\s*/g, "").trim().toLowerCase().split("@")[1] || "");
    if (d && !/^(gmail|yahoo|hotmail|outlook|icloud|live|qq|163|126|naver|hanmail)\./.test(d)) m[d] = c.company;
  }));
  return m;
}
function fillFields(p, onlyEmpty) {
  ["name", "title", "department", "company", "company_full", "mobile", "phone", "email", "fax", "website", "country", "address"].forEach(f => {
    const el = $("f_" + f); const v = (p[f] || "").trim();
    if (!v) return;
    if (onlyEmpty && el.value.trim()) return;
    if (!onlyEmpty || !el.value.trim()) {
      el.value = v; el.classList.add("filled");
      const lab = el.parentElement.querySelector("label");
      if (lab && !lab.querySelector(".auto")) lab.insertAdjacentHTML("beforeend", `<span class="auto">check</span>`);
      current.auto.add(f);
    }
  });
}
document.querySelectorAll("#fields input,#fields textarea").forEach(el => el.addEventListener("input", () => {
  el.classList.remove("filled"); const a = el.parentElement.querySelector(".auto"); if (a) a.remove();
  if (el.id === "f_name" || el.id === "f_email") checkDuplicate();
}));

let dupTarget = null;
function checkDuplicate() {
  const n = $("dupNote"); dupTarget = null; n.hidden = true;
  const name = norm($("f_name").value).replace(/[^a-z　-￿ ]/g, "").trim();
  const emails = norm($("f_email").value).split(/[\s\/,;]+/).filter(x => x.includes("@"));
  if (!name && !emails.length) return;
  const toks = s => new Set(norm(s).replace(/\(.*?\)/g, "").split(/[^a-z]+/).filter(w => w.length > 1));
  const nt = toks($("f_name").value);
  const hit = cards.find(c => {
    if (current && c.id === current.id) return false;
    const ce = norm(c.email).split(/[\s\/,;()]+/).filter(x => x.includes("@"));
    if (emails.some(e => ce.includes(e) && !/^(info|sales|service|enquir|admin|office|contact|general|support|inquir)/.test(e))) return true;
    const ct = toks(c.name);
    return nt.size >= 2 && ct.size >= 2 && [...nt].every(w => ct.has(w));
  });
  if (!hit) return;
  dupTarget = hit;
  n.innerHTML = `<b>${esc(hit.name)}</b> at ${esc(hit.company)} is already in your register.
    <div class="acts"><button class="btn" type="button" id="dupMerge">Add details to that card</button><button class="btn" type="button" id="dupIgnore">Save as a separate card</button></div>`;
  n.hidden = false;
  $("dupMerge").onclick = () => saveCard("merge");
  $("dupIgnore").onclick = () => { n.hidden = true; dupTarget = null; };
}

let delArmed = false;
$("delBtn").addEventListener("click", async () => {
  if (!current || !current.id) return;
  if (!delArmed) { delArmed = true; $("delBtn").textContent = "Tap again to delete"; return; }
  await Store.del(current.id); forgetPhoto(current.id); photoIds.delete(current.id);
  cards = cards.filter(c => c.id !== current.id);
  closeSheet("formSheet"); refresh(); toast("Card deleted");
});
$("form").addEventListener("submit", e => { e.preventDefault(); saveCard(dupTarget && !$("dupNote").hidden ? "ask" : "save"); });

async function saveCard(mode) {
  if (mode === "ask") { $("dupNote").scrollIntoView({ behavior: "smooth", block: "center" }); toast("Choose whether to add to the existing card or save separately"); return; }
  const d = {}; FIELDS.forEach(f => d[f] = $("f_" + f).value.trim()); d.uncertain = $("f_uncertain").checked;
  if (!d.name || !d.company) { const er = $("ferr"); er.textContent = "Enter at least a name and a company."; er.hidden = false; return; }
  const existingCo = Object.keys(companyCounts()).find(k => k.toLowerCase() === d.company.toLowerCase()); if (existingCo) d.company = existingCo;
  if (!d.company_full) d.company_full = d.company;
  const ocrText = current && current.ocr ? [current.ocr.front, current.ocr.back].filter(Boolean).join("\n") : "";
  let rec;
  if (mode === "merge" && dupTarget) {
    rec = { ...dupTarget };
    FIELDS.forEach(f => {
      if (!d[f]) return;
      if (!rec[f]) rec[f] = d[f];
      else if (["phone", "mobile", "email", "fax"].includes(f)) {
        const have = norm(rec[f]).replace(/\D/g, "");
        d[f].split(/\s*\/\s*/).forEach(p => { const k = f === "email" ? norm(p) : p.replace(/\D/g, ""); if (k && !(f === "email" ? norm(rec[f]).includes(k) : have.includes(k))) rec[f] += " / " + p; });
      }
    });
    rec.uncertain = rec.uncertain || d.uncertain;
    if (ocrText) rec.ocr_text = [rec.ocr_text, ocrText].filter(Boolean).join("\n");
  } else {
    const old = current && current.id ? cards.find(c => c.id === current.id) : null;
    rec = { ...(old || {}), ...d, id: old ? old.id : newId(), source: old ? old.source || "" : (current && current.front ? "Scanned on device" : "Added on device"), added: old ? old.added || today() : today() };
    if (ocrText) rec.ocr_text = ocrText;
  }
  $("saveBtn").disabled = true;
  try {
    await Store.putMany([rec]);
    if (current && (current.front || current.back)) {
      const prev = (await Store.getPhoto(rec.id)) || {};
      const p = { ...prev };
      if (current.front) p.front = await blobToStored(current.front.blob);
      if (current.back) p.back = await blobToStored(current.back.blob);
      await Store.putPhoto(rec.id, p); forgetPhoto(rec.id); photoIds.add(rec.id);
    } else if (current && current.removePhoto && current.id) {
      await Store.putPhoto(rec.id, null); forgetPhoto(rec.id); photoIds.delete(rec.id);
    }
    const i = cards.findIndex(c => c.id === rec.id);
    if (i > -1) cards[i] = rec; else cards.push(rec);
    askPersist();
    closeSheet("formSheet"); refresh();
    toast(mode === "merge" ? `Added to ${rec.name}'s card` : current && current.id ? "Card updated" : "Card saved");
  } catch (err) {
    $("ferr").textContent = /quota/i.test(String(err && err.name)) ? "This device is out of storage space. Free some space or export a backup without photos." : "Couldn't save the card on this device.";
    $("ferr").hidden = false; $("saveBtn").disabled = false;
  }
}
async function askPersist() { try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch (_) {} }

/* ---------- backup / import ---------- */
$("menuBtn").addEventListener("click", () => { openSheet("bkSheet"); updateBackupInfo(); });
$("impBtn").addEventListener("click", () => $("impFile").click());
async function saveFile(name, blob) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && /iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e && e.name === "AbortError") return false; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  return true;
}
const stamp = () => today();
$("expJson").addEventListener("click", async () => {
  const withPhotos = $("incPhotos").checked;
  let photos;
  if (withPhotos) {
    photos = {};
    for (const id of photoIds) {
      const p = await Store.getPhoto(id); if (!p) continue;
      photos[id] = {};
      for (const side of ["front", "back"]) if (p[side]) photos[id][side] = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(new Blob([p[side].buf], { type: p[side].type })); });
    }
  }
  const body = { app: "Marine Contacts Register", version: 2, exported: new Date().toISOString(), cards, ...(photos ? { photos } : {}) };
  if (await saveFile(`marine-contacts-${stamp()}.json`, new Blob([JSON.stringify(body)], { type: "application/json" }))) {
    try { localStorage.setItem("lastBackup", new Date().toISOString()); } catch (_) {}
    toast("Backup exported"); updateBackupInfo();
  }
});
$("expCsv").addEventListener("click", async () => {
  const cols = ["name","name_local","company","company_full","title","department","phone","mobile","fax","email","website","country","address","notes","uncertain","source","added"];
  const q = v => { v = String(v ?? ""); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const rows = [...cards].sort((a, b) => sortKey(a.company).localeCompare(sortKey(b.company)) || sortKey(a.name).localeCompare(sortKey(b.name)));
  const csv = "﻿" + [cols.join(","), ...rows.map(c => cols.map(k => q(c[k])).join(","))].join("\r\n");
  if (await saveFile(`marine-contacts-${stamp()}.csv`, new Blob([csv], { type: "text/csv" }))) toast("Spreadsheet exported");
});
$("impFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  let j;
  try { j = JSON.parse(await f.text()); } catch (_) { toast("That file isn't a register backup. Choose the .json backup file.", 4000); return; }
  const arr = Array.isArray(j) ? j : j.cards;
  if (!Array.isArray(arr)) { toast("That file isn't a register backup. Choose the .json backup file.", 4000); return; }
  const byId = new Map(cards.map(c => [c.id, c]));
  let added = 0, updated = 0;
  const recs = [];
  arr.forEach(c => {
    if (!c || !c.name || !c.company) return;
    const id = String(c.id || newId());
    const clean = {}; [...FIELDS, "source", "added", "uncertain", "ocr_text"].forEach(k => { if (c[k] !== undefined) clean[k] = typeof c[k] === "boolean" ? c[k] : String(c[k]); });
    clean.id = id;
    if (byId.has(id)) updated++; else added++;
    recs.push(clean); byId.set(id, clean);
  });
  try {
    await Store.putMany(recs);
    if (j.photos && typeof j.photos === "object") {
      for (const [id, p] of Object.entries(j.photos)) {
        const out = {};
        for (const side of ["front", "back"]) if (typeof p[side] === "string" && p[side].startsWith("data:image/")) out[side] = await blobToStored(await (await fetch(p[side])).blob());
        if (out.front || out.back) { await Store.putPhoto(id, out); forgetPhoto(id); photoIds.add(id); }
      }
    }
  } catch (_) { toast("Couldn't save the imported cards on this device.", 4000); return; }
  cards = [...byId.values()];
  askPersist(); refresh(); closeSheet("bkSheet");
  toast(`Imported: ${added} new card${added === 1 ? "" : "s"}, ${updated} updated`, 4000);
});
$("prepBtn").addEventListener("click", async () => {
  $("prepBtn").disabled = true; $("engineState").textContent = "Downloading the card reader (about 6 MB)…";
  ocrProgress = () => {};
  try { await getWorker(); $("engineState").textContent = "Ready. Card reading works on this device without internet."; }
  catch (_) { $("engineState").textContent = "Couldn't download the card reader. Connect to the internet and try again."; }
  $("prepBtn").disabled = false;
});
let wipeArmed = false;
$("wipeBtn").addEventListener("click", async () => {
  if (!wipeArmed) { wipeArmed = true; $("wipeBtn").textContent = "Tap again to delete every card"; setTimeout(() => { wipeArmed = false; $("wipeBtn").textContent = "Delete all cards on this device"; }, 5000); return; }
  await Store.wipe(); photoURLs.forEach(u => URL.revokeObjectURL(u)); photoURLs.clear();
  cards = []; photoIds = new Set(); wipeArmed = false; $("wipeBtn").textContent = "Delete all cards on this device";
  closeSheet("bkSheet"); refresh(); toast("All cards deleted from this device");
});
async function updateBackupInfo() {
  let ready = false; try { ready = localStorage.getItem("engineReady") === "1"; } catch (_) {}
  $("engineState").textContent = ready ? "Ready. Card reading works on this device without internet." : "The card reader downloads once (about 6 MB) the first time you scan. Tap below to get it now so scanning also works offline.";
  let last = null; try { last = localStorage.getItem("lastBackup"); } catch (_) {}
  let s = `${cards.length} cards, ${photoIds.size} with photos. `;
  try { if (navigator.storage && navigator.storage.estimate) { const est = await navigator.storage.estimate(); s += `Using ${(est.usage / 1048576).toFixed(1)} MB. `; } } catch (_) {}
  try { if (navigator.storage && navigator.storage.persisted) s += (await navigator.storage.persisted()) ? "Storage is protected from automatic clean-up. " : ""; } catch (_) {}
  s += last ? `Last backup: ${new Date(last).toLocaleDateString()}.` : "No backup exported yet.";
  $("storeState").textContent = s;
}

/* ---------- install & updates ---------- */
const UA = navigator.userAgent;
const PLATFORM = /iPhone|iPod/.test(UA) ? "iphone" : (/iPad/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1)) ? "ipad"
  : /Android/.test(UA) ? "android" : /Macintosh/.test(UA) ? "mac" : /Windows/.test(UA) ? "windows" : "other";
const BROWSER = /EdgA?\//.test(UA) ? "edge" : /SamsungBrowser/.test(UA) ? "samsung" : /CriOS/.test(UA) ? "chrome-ios" : /FxiOS|Firefox/.test(UA) ? "firefox"
  : /Chrome\//.test(UA) ? "chrome" : /Safari\//.test(UA) ? "safari" : "other";
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: window-controls-overlay)").matches || navigator.standalone === true;
const INSTALL_GUIDES = [
  { id: "iphone", title: "iPhone", steps: ["Open this page in <b>Safari</b> (in Chrome on iPhone you can also use the Share button).", "Tap the <b>Share</b> button (the square with an arrow pointing up) at the bottom or top of the screen.", "Scroll down and tap <b>Add to Home Screen</b>.", "Tap <b>Add</b>. The app icon appears on your home screen."] },
  { id: "ipad", title: "iPad", steps: ["Open this page in <b>Safari</b>.", "Tap the <b>Share</b> button at the top right.", "Tap <b>Add to Home Screen</b>, then <b>Add</b>."] },
  { id: "android", title: "Android phone or tablet", steps: ["Open this page in <b>Chrome</b>.", "Tap the <b>⋮</b> menu at the top right.", "Tap <b>Install app</b> (on some phones it says <b>Add to Home screen</b>, then choose <b>Install</b>).", "Tap <b>Install</b>. The app appears with your other apps."], extra: "Samsung Internet: tap the ≡ menu, then <b>Add page to</b> → <b>Home screen</b>." },
  { id: "windows", title: "Windows computer", steps: ["Open this page in <b>Chrome</b> or <b>Microsoft Edge</b>.", "Chrome: click the <b>install icon</b> (a screen with a down arrow) at the right end of the address bar, or open the <b>⋮</b> menu → <b>Cast, save and share</b> → <b>Install page as app…</b>", "Edge: open the <b>…</b> menu → <b>Apps</b> → <b>Install this site as an app</b>.", "Click <b>Install</b>. The app opens in its own window and is added to the Start menu."] },
  { id: "mac", title: "Mac", steps: ["Safari: open the <b>File</b> menu → <b>Add to Dock…</b> → <b>Add</b>.", "Chrome: click the <b>install icon</b> at the right end of the address bar, or open the <b>⋮</b> menu → <b>Cast, save and share</b> → <b>Install page as app…</b>", "Edge: open the <b>…</b> menu → <b>Apps</b> → <b>Install this site as an app</b>."] }
];
function renderInstallSteps() {
  const mineId = PLATFORM === "other" ? "windows" : PLATFORM;
  const mine = INSTALL_GUIDES.find(g => g.id === mineId);
  const others = INSTALL_GUIDES.filter(g => g !== mine);
  const sec = (g, isMine) => `<section class="${isMine ? "mine" : ""}"><h3>${g.title}${isMine ? '<span class="tag">This device</span>' : ""}</h3><ol>${g.steps.map(x => `<li>${x}</li>`).join("")}</ol>${g.extra ? `<p class="hint" style="margin:6px 0 0">${g.extra}</p>` : ""}</section>`;
  let warn = "";
  if (PLATFORM === "iphone" || PLATFORM === "ipad") { if (BROWSER !== "safari" && BROWSER !== "chrome-ios") warn = `<div class="notice warn">On iPhone and iPad, open this page in Safari to install it.</div>`; }
  else if (BROWSER === "firefox") warn = `<div class="notice warn">Firefox can't install apps. Open this page in Chrome or Edge${PLATFORM === "mac" ? " or Safari" : ""} to install it.</div>`;
  $("instSteps").innerHTML = warn + sec(mine, true) + `<details><summary>Steps for other devices</summary><div class="inst" style="margin-top:10px">${others.map(g => sec(g, false)).join("")}</div></details>`;
}
function refreshInstallUI() {
  const installed = isInstalled();
  $("installBtn").hidden = installed;
  $("instReady").hidden = !window.__installEvt;
}
async function promptInstall() {
  const evt = window.__installEvt;
  if (!evt) return false;
  evt.prompt();
  const choice = await evt.userChoice.catch(() => null);
  window.__installEvt = null; refreshInstallUI();
  if (choice && choice.outcome === "accepted") { closeSheet("instSheet"); toast("Installing… open it from your home screen or apps list."); }
  return true;
}
$("installBtn").addEventListener("click", async () => {
  if (await promptInstall()) return;
  renderInstallSteps(); refreshInstallUI(); openSheet("instSheet");
});
$("instNow").addEventListener("click", promptInstall);
window.addEventListener("beforeinstallprompt", () => setTimeout(refreshInstallUI, 0));
window.addEventListener("appinstalled", () => { window.__installEvt = null; refreshInstallUI(); closeSheet("instSheet"); toast("Installed. Open it from your home screen or apps list."); });
window.matchMedia("(display-mode: standalone)").addEventListener?.("change", refreshInstallUI);
refreshInstallUI();

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").then(reg => {
    const watch = w => w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) $("updateBar").hidden = false; });
    if (reg.waiting && navigator.serviceWorker.controller) $("updateBar").hidden = false;
    reg.addEventListener("updatefound", () => watch(reg.installing));
    $("updateBtn").onclick = () => { (reg.waiting || reg.installing)?.postMessage("skipWaiting"); };
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

load();
