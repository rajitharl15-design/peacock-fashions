"use strict";
const $ = (sel, c = document) => c.querySelector(sel);
const KEY = "ms_overrides";
let overrides = JSON.parse(localStorage.getItem(KEY) || "{}");
let deleted = new Set(JSON.parse(localStorage.getItem("ms_deleted") || "[]"));
function persistDeleted() { localStorage.setItem("ms_deleted", JSON.stringify([...deleted])); }
let activeCat = "";
let activeSubcat = "";

function catOptions(sel) {
  return `<option value="">(none)</option>` + CATS.map((c) => `<option ${c === sel ? "selected" : ""}>${c}</option>`).join("");
}
function subcatOptions(sel, cat) {
  const subs = cat ? [...new Set(PRODUCTS.filter((p) => p.cat === cat).map((p) => p.subcat))] : SUBCATS;
  return `<option value="">(none)</option>` + subs.map((s) => `<option ${s === sel ? "selected" : ""}>${s}</option>`).join("");
}

function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

function renderFilters() {
  const catSel = $("#catFilter");
  if (!catSel) return;
  catSel.innerHTML =
    `<option value="">All categories</option>` +
    CATS.map((c) => `<option value="${esc(c)}" ${c === activeCat ? "selected" : ""}>${esc(c)}</option>`).join("") +
    `<option value="Readymade Blouses" ${activeCat === "Readymade Blouses" ? "selected" : ""}>Readymade Blouses</option>`;
  renderSubcatFilter();
}
function renderCatFilter() {}

function renderSubcatFilter() {
  const el = $("#subcatFilter");
  if (!el) return;
  const subs = activeCat
    ? [...new Set(PRODUCTS.filter((p) => p.cat === activeCat).map((p) => p.subcat))]
    : SUBCATS;
  el.innerHTML = `<option value="">(all subcategories)</option>` +
    subs.map((s) => `<option value="${esc(s)}" ${s === activeSubcat ? "selected" : ""}>${esc(s)}</option>`).join("");
}

function rowHTML(p) {
  const o = overrides[p.id] || {};
  const isDeleted = deleted.has(p.id);
  const effImg = o.img !== undefined ? o.img : p.img;
  const effName = o.name !== undefined ? o.name : p.name;
  const effCat = o.cat || p.cat;
  const effSub = o.subcat || p.subcat;
  return `
  <div class="pm-product ${isDeleted ? "pm-del" : ""}" data-id="${p.id}">
    <img src="${effImg || ""}" alt="${esc(effName)}" onerror="this.style.display='none'">
    <div class="pm-info">
      <h4>${esc(effName)} <span class="pm-id">#${p.id}</span></h4>
      <label>Category <select data-f="cat">${catOptions(effCat)}</select></label>
      <label>Subcategory <select data-f="subcat">${subcatOptions(effSub, effCat)}</select></label>
      <label>Price (₹) <input type="number" min="0" data-f="price" value="${o.price !== undefined ? o.price : p.price}"></label>
      <label>Old Price (₹) <input type="number" min="0" data-f="old" value="${o.old !== undefined ? o.old : p.old || ""}" placeholder="none"></label>
      <label>Sizes <input data-f="size" value="${esc((o.size || (p.size || []).join(",")) || "")}" placeholder="S,M,L"></label>
      <div style="margin-top:10px">
        <button class="btn-link" data-save-p="${p.id}"><i class="fas fa-save"></i> Save</button>
        <label class="btn-link" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer" title="Change image (works from mobile)">
          <i class="fas fa-upload"></i> Change img
          <input type="file" data-upimg="${p.id}" accept="image/*" style="display:none">
        </label>
        ${effImg ? `<button class="btn-link" data-delimg="${p.id}"><i class="fas fa-image"></i> Remove img</button>` : ""}
        <button class="btn-link btn-delete" data-toggle-del="${p.id}"><i class="fas fa-trash-alt"></i> ${isDeleted ? "Undo" : "Delete"}</button>
      </div>
      <span class="pm-saved" id="pmSaved-${p.id}"></span>
    </div>
  </div>`;
}

function renderRows() {
  let list = PRODUCTS.slice();
  if (activeCat === "Readymade Blouses") list = list.filter((p) => p.subcat === "Readymade Blouses");
  else if (activeCat) list = list.filter((p) => p.cat === activeCat);
  if (activeSubcat) list = list.filter((p) => p.subcat === activeSubcat);
  $("#rows").innerHTML = list.map(rowHTML).join("");
  $("#totalCount").textContent = PRODUCTS.length;
  $("#shownCount").textContent = list.length;
  $("#rows").querySelectorAll("input,select").forEach((el) => el.addEventListener("change", onEdit));
  $("#rows").querySelectorAll("[data-save-p]").forEach((b) => b.addEventListener("click", () => {
    persist();
    const el = document.getElementById("pmSaved-" + b.dataset.saveP);
    if (el) { el.textContent = "✓ Saved to this browser (" + new Date().toLocaleTimeString() + ")"; }
  }));
}

function onEdit(e) {
  const el = e.target;
  const card = el.closest(".pm-product");
  if (!card) return;
  const id = Number(card.dataset.id);
  overrides[id] = overrides[id] || {};
  overrides[id][el.dataset.f] = el.value;
  if (overrides[id].old === "0" || overrides[id].old === "") overrides[id].old = 0;
  card.classList.add("pm-dirty");
  markSaved(true);
}

let saveTimer;
function markSaved(on) {
  const s = $("#saveStatus");
  if (on) { s.textContent = "Saving…"; clearTimeout(saveTimer); saveTimer = setTimeout(() => { persist(); s.textContent = "✓ Saved locally to " + new Date().toLocaleTimeString(); }, 400); }
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(overrides));
}

function initToken() {
  const inp = $("#tokenInput");
  if (!inp) return;
  inp.value = localStorage.getItem("pf_token") || "";
  inp.addEventListener("change", () => {
    localStorage.setItem("pf_token", inp.value.trim());
    $("#saveStatus").textContent = "✓ Upload token saved";
  });
}

// Build the final live catalog: apply edits AND drop deleted products.
function finalCatalog() {
  return PRODUCTS.filter((p) => !deleted.has(p.id)).map((p) => {
    const o = overrides[p.id] || {};
    return {
      id: p.id,
      name: o.name !== undefined ? o.name : p.name,
      cat: o.cat || p.cat,
      subcat: o.subcat || p.subcat,
      price: o.price !== undefined ? o.price : p.price,
      old: o.old !== undefined ? o.old : (p.old || 0),
      img: o.img !== undefined ? o.img : p.img,
      size: (o.size || (p.size || []).join(",")).split(",").map((s) => s.trim()).filter(Boolean),
      ...(p.icon ? { icon: p.icon } : {}),
      ...(p.grad ? { grad: p.grad } : {}),
      ...(p.rating ? { rating: p.rating } : {}),
      ...(p.desc ? { desc: p.desc } : {}),
    };
  });
}

async function publish() {
  const list = finalCatalog();
  try {
    const key = localStorage.getItem("peacock_admin_key") || "";
    const res = await fetch("/api/admin/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(key ? { "x-admin-key": key } : {}) },
      body: JSON.stringify({ products: list }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || ("Publish failed (" + res.status + ")"));
    $("#saveStatus").textContent = "✓ Published to store — " + list.length + " products live now";
  } catch (err) {
    $("#saveStatus").textContent = "✗ " + err.message + " (are you signed in? check the Admin login)";
  }
}

function exportDataJS() {
  const list = finalCatalog().map((p) => {
    const fields = [`  { id: ${p.id}`];
    fields.push(`name: ${JSON.stringify(p.name)}`);
    fields.push(`cat: ${JSON.stringify(p.cat)}`);
    fields.push(`subcat: ${JSON.stringify(p.subcat)}`);
    fields.push(`price: ${p.price}`);
    fields.push(`old: ${p.old}`);
    if (p.img) fields.push(`img: ${JSON.stringify(p.img)}`);
    if (p.icon) fields.push(`icon: ${JSON.stringify(p.icon)}`);
    if (p.grad) fields.push(`grad: ${JSON.stringify(p.grad)}`);
    if (p.rating) fields.push(`rating: ${p.rating}`);
    fields.push(`size: ${JSON.stringify(p.size)}`);
    if (p.desc) fields.push(`desc: ${JSON.stringify(p.desc)}`);
    return fields.join(", ") + " },";
  }).join("\n");
  const js = "let PRODUCTS = [\n" + list + "\n];\n\nfunction productById(id) {\n  return PRODUCTS.find((p) => p.id === Number(id));\n}\n\nlet CATS = [\"Women\", \"Men\", \"Kids\", \"Accessories\"];\nlet SUBCATS = [...new Set(PRODUCTS.map((p) => p.subcat))];\n";
  const blob = new Blob([js], { type: "text/javascript" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "data.js";
  a.click();
  URL.revokeObjectURL(a.href);
  $("#saveStatus").textContent = "✓ Exported data.js — replace js/data.js and push (or just use Publish)";
}

function setImageLocal(id, dataUrl) {
  overrides[id] = overrides[id] || {};
  overrides[id].img = dataUrl;
  persist();
  renderRows();
  $("#saveStatus").textContent = "✓ Image saved locally (export data.js to make permanent)";
}

async function uploadToBackend(id, file) {
  const fd = new FormData();
  fd.append("image", file);
  const key = localStorage.getItem("peacock_admin_key") || "";
  const headers = key ? { "x-admin-key": key } : {};
  const res = await fetch("/api/upload", { method: "POST", body: fd, headers });
  if (!res.ok) throw new Error("upload failed");
  const data = await res.json();
  overrides[id] = overrides[id] || {};
  overrides[id].img = data.url;
  persist();
  renderRows();
  $("#saveStatus").textContent = "✓ Image uploaded to server: " + data.url;
}

document.addEventListener("change", (e) => {
  if (e.target && e.target.id === "catFilter") {
    activeCat = e.target.value;
    activeSubcat = "";
    renderFilters();
    renderRows();
    return;
  }
  if (e.target && e.target.id === "subcatFilter") {
    activeSubcat = e.target.value;
    renderRows();
    return;
  }
  const up = e.target.closest("[data-upimg]");
  if (up && up.files && up.files[0]) {
    const id = Number(up.dataset.upimg);
    const file = up.files[0];
    // Downscale long-edge to ~1200px and compress to JPEG so phone photos fit the
    // store's ~1.5MB base64 budget and still save reliably on the free tier.
    compressImage(file).then((dataUrl) => {
      setImageLocal(id, dataUrl);
      $("#saveStatus").textContent = "✓ Image set (auto-compressed). Publish or Export data.js to save permanently.";
    }).catch(() => {
      $("#saveStatus").textContent = "Sorry, that image could not be read.";
    });
    return;
  }
});

// Resize + re-encode an image to JPEG keeping it under budget (default 1.5MB).
function compressImage(file, maxBytes = 1.5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const L = 1200;
      const scale = Math.min(1, L / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      let quality = 0.82;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      // Lower quality until it fits the budget.
      while ((dataUrl.length * 0.75) > maxBytes && quality > 0.35) {
        quality -= 0.1;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      URL.revokeObjectURL(url);
      resolve(dataUrl);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("not an image")); };
    img.src = url;
  });
}

document.addEventListener("click", (e) => {
  const del = e.target.closest("[data-delimg]");
  if (del) {
    const id = Number(del.dataset.delimg);
    overrides[id] = overrides[id] || {};
    overrides[id].img = "";   // "" = no image -> fall back to icon/gradient
    persist();
    renderRows();
    $("#saveStatus").textContent = "✓ Image removed (Publish or Export to save)";
    return;
  }
  const tog = e.target.closest("[data-toggle-del]");
  if (tog) {
    const id = Number(tog.dataset.toggleDel);
    if (deleted.has(id)) deleted.delete(id); else deleted.add(id);
    persistDeleted();
    renderRows();
    $("#saveStatus").textContent = deleted.has(id) ? "Product marked for deletion — click Publish to remove it" : "Product undeleting — click Publish to keep it";
    return;
  }
  const cf = e.target.closest("[data-cat]");
  if (cf) { activeCat = cf.dataset.cat; activeSubcat = ""; renderFilters(); renderRows(); }
  if (e.target.id === "exportBtn") { persist(); exportDataJS(); }
  if (e.target.id === "publishBtn") { persist(); publish(); }
  if (e.target.id === "reloadBtn") {
    if (confirm("Clear all locally saved edits and deletions on this device?")) { localStorage.removeItem(KEY); localStorage.removeItem("ms_deleted"); location.reload(); }
  }
});

// Load the currently published catalog from the backend so the editor reflects
// the live store (including products added/edited/deleted via earlier sessions).
(async function initAdmin() {
  try {
    const r = await fetch("/api/catalog", { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      if (d && Array.isArray(d.products) && d.products.length) {
        PRODUCTS = d.products;
        CATS = [...new Set(PRODUCTS.map((p) => p.cat))];
        SUBCATS = [...new Set(PRODUCTS.map((p) => p.subcat))];
      }
    }
  } catch (e) {}
  initAddForm();
  renderFilters();
  renderRows();
  initToken();
})();

// --- Add product ---
let npLastId = 0;
function initAddForm() {
  const catSel = $("#npCat");
  if (catSel) {
    catSel.innerHTML = CATS.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
    catSel.addEventListener("change", () => {
      const sub = $("#npSubcat");
      if (sub) {
        const subs = catSel.value ? [...new Set(PRODUCTS.filter((p) => p.cat === catSel.value).map((p) => p.subcat))] : [];
        sub.innerHTML = `<option value="">Subcategory…</option>` + subs.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
      }
    });
  }
  btn("#addProductBtn").addEventListener("click", () => {
    const p = $("#npPanel");
    if (p) { p.classList.toggle("hidden"); if (!p.classList.contains("hidden")) $("#npStatus").textContent = ""; }
  });
  btn("#npSave").addEventListener("click", addProduct);
}

function btn(id) { return document.getElementById(id) || { addEventListener() {} }; }

function addProduct() {
  const name = ($("#npName") || {}).value || "";
  const cat = ($("#npCat") || {}).value || "";
  const sub = ($("#npSubcat") || {}).value || "";
  const price = Number(($("#npPrice") || {}).value) || 0;
  const old = Number(($("#npOld") || {}).value) || 0;
  const size = String(($("#npSize") || {}).value || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!name || !cat) { const st = $("#npStatus"); if (st) st.textContent = "Name and Category are required."; return; }
  const id = Math.max(PRODUCTS.reduce((m, p) => Math.max(m, p.id), 0), npLastId) + 1;
  npLastId = id;
  PRODUCTS.push({ id, name, cat, subcat: sub, price, old, size });
  renderFilters();
  renderRows();
  const st = $("#npStatus");
  if (st) st.style.color = "#2e7d32";
  if (st) st.textContent = "✓ Added \"" + name + "\". Click 'Publish to store' to make it live.";
  ["npName", "npPrice", "npOld", "npSize"].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ""; });
}