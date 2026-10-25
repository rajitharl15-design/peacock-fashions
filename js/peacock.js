"use strict";
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];

const INR = (n) => "₹" + Number(n).toLocaleString("en-IN");
const params = new URLSearchParams(location.search);

let bag = JSON.parse(localStorage.getItem("ms_bag") || "[]");
let wish = JSON.parse(localStorage.getItem("ms_wish") || "[]");

/* ---------- Utils ---------- */
function save(key, v) { localStorage.setItem(key, JSON.stringify(v)); }

/* ---------- Mount shared chrome ---------- */
function overlayHTML() {
  return `
  <div class="overlay" id="overlay"></div>

  <aside class="bag" id="bagDrawer">
    <div class="bag-head"><h3><i class="fas fa-shopping-bag"></i> Bag</h3>
      <button class="del" id="bagClose"><i class="fas fa-xmark fa-lg"></i></button></div>
    <div class="savings-banner">🎉 Prices and offers are as marked · Secured with 100% payment protection</div>
    <div class="progress">
      <p id="shipMsg">Add items or get <b>free delivery</b></p>
      <div class="bar"><i id="shipBar"></i></div>
    </div>
    <div class="bag-list" id="bagList"></div>
    <div class="bag-foot">
      <div class="total"><span>Subtotal</span><span id="bagSubtotal">₹0</span></div>
      <button class="btn-pink" id="checkoutBtn">Proceed to checkout</button>
    </div>
  </aside>

  <aside class="bag" id="wishDrawer">
    <div class="bag-head"><h3><i class="fas fa-heart" style="color:var(--pink)"></i> Wishlist</h3>
      <button class="del" id="wishClose"><i class="fas fa-xmark fa-lg"></i></button></div>
    <div class="bag-list" id="wishList"></div>
  </aside>

  <div class="modal" id="modal">
    <div class="modal-box" id="modalBox"></div>
  </div>

  <!-- Easy order (WhatsApp) -->
  <div class="modal" id="orderModal">
    <div class="modal-box">
      <button class="icon-btn oclose" data-oclose aria-label="Close"><i class="fas fa-xmark"></i></button>
      <h3>Place your order</h3>
      <p class="sub">Fill the details — your order will be sent to us on WhatsApp. We confirm &amp; ship.</p>
      <div class="o-review" id="oReview"></div>
      <input id="oName" class="o-in" type="text" placeholder="Full name">
      <input id="oPhone" class="o-in" type="tel" placeholder="Phone (with WhatsApp)">
      <input id="oAddr" class="o-in" type="text" placeholder="Delivery address">
      <button class="btn-pink" id="oSend"><i class="fab fa-whatsapp"></i> Send order on WhatsApp</button>
      <p class="o-status" id="oStatus"></p>
    </div>
  </div>

  <div class="toast" id="toast"></div>`;
}

function bindHeader() {
  $("#menuBtn").addEventListener("click", () => location.href = "/");
  $("#bagBtn").addEventListener("click", () => { renderBag(); openDrawer("bagDrawer"); });
  $("#wishBtn").addEventListener("click", () => { renderWish(); openDrawer("wishDrawer"); });
  $("#bnBag") && $("#bnBag").addEventListener("click", (e) => { e.preventDefault(); renderBag(); openDrawer("bagDrawer"); });
  $("#bnWish") && $("#bnWish").addEventListener("click", (e) => { e.preventDefault(); renderWish(); openDrawer("wishDrawer"); });
  $("#wishClose").addEventListener("click", () => closeDrawer("wishDrawer"));
  $("#bagClose").addEventListener("click", () => closeDrawer("bagDrawer"));
  $("#overlay").addEventListener("click", closeAllDrawers);
  $("#checkoutBtn").addEventListener("click", openOrder);

  // ---- PWA install ----
  let deferredInstall = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e;
  });
  window.addEventListener("appinstalled", () => {});
  $("#appInstallBtn").addEventListener("click", async () => {
    if (deferredInstall) {
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      return;
    }
    // No programmatic prompt available (e.g. iPhone, or first visit): guide the user.
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    toast(isIOS
      ? 'Tap the Share icon ↓ and choose "Add to Home Screen"'
      : 'Use your browser menu (⋮) → "Add to Home screen / Install app"');
  });

  // ---- Easy order modal ----
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-oclose]")) closeOrder();
  });
  $("#oSend").addEventListener("click", sendOrder);

  const search = $("#searchInput");
  if (search) {
    search.value = params.get("q") || "";
    search.addEventListener("keydown", (e) => {
      if (e.key === "Enter") location.href = "/listing.html?q=" + encodeURIComponent(search.value.trim());
    });
  }
  updateCounts();
}

function openDrawer(id) { $("#" + id).classList.add("show"); $("#overlay").classList.add("show"); }
function closeDrawer(id) { $("#" + id).classList.remove("show"); if (!$("#bagDrawer").classList.contains("show") && !$("#wishDrawer").classList.contains("show")) $("#overlay").classList.remove("show"); }
function closeAllDrawers() {
  $("#bagDrawer").classList.remove("show");
  $("#wishDrawer").classList.remove("show");
  $("#overlay").classList.remove("show");
}

/* ---------- Product card ---------- */
function offPct(p) { return p.old ? Math.round((1 - p.price / p.old) * 100) : 0; }

// Version-stamp image URLs so a freshly published/edited image isn't served
// from the browser/installed-app cache. imgVer is set from the catalog's
// updated_at in boot().
let imgVer = Date.now();
function imgv(u) {
  if (!u) return u;
  return u + (u.includes("?") ? "&" : "?") + "v=" + imgVer;
}

// For locally-served product photos (images/products/...) derive a compressed
// WebP thumbnail path, so cards load a small image instead of the full-res file.
// External/uploaded images are left untouched.
function thumbOf(u) {
  const s = String(u || "").replace(/\\/g, "/");
  if (!s.startsWith("images/products/")) return u;
  const i = s.lastIndexOf("/");
  const base = s.slice(0, i + 1); // e.g. "images/products/"
  const stem = s.slice(i + 1).replace(/\.[^./]+$/, "");
  return base + "thumbs/" + stem + ".webp";
}

// Renders a real uploaded image (thumbnail with full-res srcset, falling back
// to the full image if the thumb is missing), or the icon when none.
function media(p, cls) {
  if (p.img) {
    const full = imgv(p.img);
    const thumb = thumbOf(p.img) === p.img ? full : imgv(thumbOf(p.img));
    const baseAttrs = `class="${cls || ""}" alt="${p.name}" loading="lazy" decoding="async"`;
    if (thumb === full) {
      // No thumbnail available (external/uploads): load the full image directly.
      return `<img ${baseAttrs} src="${full}" onerror="this.style.display='none'">`;
    }
    const fallback = "onerror=\"if(!this.dataset.t){this.dataset.t='1';this.src=this.dataset.f;this.removeAttribute('srcset');this.removeAttribute('sizes')}else{this.style.display='none'}\"";
    return `<img ${baseAttrs} data-f="${full}" src="${thumb}" srcset="${thumb} 500w, ${full} 1000w" sizes="(max-width:600px) 46vw, 24vw" ${fallback}>`;
  }
  return `<span class="icon ${cls || ""}">${p.icon || "🎽"}</span>`;
}

function cardHTML(p) {
  const on = wish.includes(p.id);
  const off = offPct(p);
  return `
    <div class="pcard" data-id="${p.id}">
      <div class="pimg" style="background:${p.grad}" data-open="${p.id}">
        ${media(p, "pimg-img")}
        <button class="wish ${on ? "on" : ""}" data-wish="${p.id}" title="Wishlist"><i class="fa${on ? "s" : "r"} fa-heart"></i></button>
      </div>
      <button class="pbg" data-buy="${p.id}">Add to Bag · ${INR(p.price)}</button>
      <div class="pinfo">
        <div class="brand">Peacock</div>
        <div class="pname" data-open="${p.id}">${p.name}</div>
        <div class="price-row">
          <b>${INR(p.price)}</b>
          ${p.old ? `<span style="color:var(--muted);text-decoration:line-through">${INR(p.old)}</span>` : ""}
          ${off ? `<span class="off">(${off}% OFF)</span>` : ""}
        </div>
        ${off ? `<div class="zero">You are saving ${INR(p.old - p.price)} on this item</div>` : ""}
      </div>
    </div>`;
}

function renderInto(selector, list) {
  const el = $(selector);
  if (!el) return;
  el.innerHTML = list.length ? list.map(cardHTML).join("") : '<div class="empty-state">No products found.</div>';
}

// Build a home row with variety: round-robin across subcategories so no single
// category (e.g. Kids) fills an entire "New in"/"Best" section.
function spreadHome(n) {
  const pimg = PRODUCTS.filter((p) => p.img);
  const subs = [...new Set(pimg.map((p) => p.subcat))];
  const buckets = subs.map((s) => pimg.filter((p) => p.subcat === s));
  const out = [];
  for (let i = 0; out.length < n; i++) {
    let added = false;
    for (const b of buckets) {
      if (i < b.length) { out.push(b[i]); added = true; if (out.length >= n) break; }
    }
    if (!added) break;
  }
  return out;
}

/* ---------- Horizontal category carousel ---------- */
const HCAT_CARDS = [
  { title: "Dresses", cat: "Women", subcat: "Dresses", icon: "👗", grad: "linear-gradient(135deg,#c0574f,#7a1f2b)" },
  { title: "Night Dresses", cat: "Women", subcat: "Night Dresses", icon: "🌙", grad: "linear-gradient(135deg,#5c6aa8,#2a3566)" },
  { title: "Kids Wear", cat: "Kids", subcat: "Kids Wear", icon: "🧸", grad: "linear-gradient(135deg,#4aa3c2,#1f5d75)" },
];

function renderCats(containerId) {
  const el = $(containerId);
  if (!el) return;
  el.innerHTML = HCAT_CARDS.map((c) => {
    const count = PRODUCTS.filter((p) => p.cat === c.cat && p.subcat === c.subcat).length;
    return `
      <a class="hcard" href="/listing.html?cat=${encodeURIComponent(c.cat)}&subcat=${encodeURIComponent(c.subcat)}" style="background:${c.grad}">
        <span class="hcard-icon">${c.icon}</span>
        <span class="hcard-title">${c.title}</span>
        <span class="hcard-sub">${count} items · ${c.cat}</span>
      </a>`;
  }).join("");
}

/* ---------- Modal (size) ---------- */
function previewImage(p) {
  if (!p || !p.img) return;
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.88);display:flex;align-items:center;justify-content:center;z-index:1000;cursor:zoom-out";
  const img = document.createElement("img");
  img.src = imgv(p.img);
  img.style.cssText = "max-width:95vw;max-height:95vh;object-fit:contain;border-radius:8px";
  ov.addEventListener("click", () => ov.remove());
  ov.appendChild(img);
  document.body.appendChild(ov);
}

function openSizeModal(p) {
  const sizes = p.size.join(", ");
  $("#modalBox").innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
      <div class="m-img-wrap" style="width:150px;height:180px;border-radius:8px;background:${p.grad};display:grid;place-items:center;color:#fff;font-size:1.8rem;overflow:hidden;cursor:zoom-in">${media(p, "m-img")}</div>
      <div>
        <h3>${p.name}</h3>
        <div class="sub">${p.cat} · ${p.subcat || ""} · ${INR(p.price)}${p.old ? ` <s style="color:var(--muted)">${INR(p.old)}</s>` : ""}</div>
        <button class="btn-ghost" style="margin-top:8px;cursor:pointer" id="mPreviewBtn"><i class="fas fa-expand"></i> View large image</button>
      </div>
    </div>
    <div class="sub">Select size · <b>${sizes}</b></div>
    <div class="size-row">
      ${p.size.map((s) => `<button class="size-chip" data-sz="${s}">${s}</button>`).join("")}
    </div>
    <div class="modal-foot">
      <button class="btn-ghost addWish" data-wish="${p.id}">♥ Wishlist</button>
      <button class="add" data-confirm="${p.id}">Add to Bag</button>
    </div>`;
  $("#modal").classList.add("show");
  const mwb = $("#modalBox .m-img-wrap");
  if (mwb) mwb.addEventListener("click", () => { closeModal(); previewImage(p); });
  const mbtn = $("#modalBox #mPreviewBtn");
  if (mbtn) mbtn.addEventListener("click", () => { closeModal(); previewImage(p); });
  let sel = null;
  $$(".size-chip", $("#modalBox")).forEach((c) => c.addEventListener("click", () => {
    $$(".size-chip", $("#modalBox")).forEach((x) => { x.style.borderColor = "var(--line)"; x.style.color = "var(--ink)"; });
    c.style.borderColor = "var(--pink)"; c.style.color = "var(--pink)";
    sel = c.dataset.sz;
  }));
  $("#modalBox [data-confirm]").addEventListener("click", () => {
    if (!sel && p.size.length > 1) return toast("Please select a size");
    addToBag(p.id, sel || p.size[0]); closeModal();
  });
  $$("[data-wish]", $("#modalBox")).forEach((b) => b.addEventListener("click", () => { toggleWish(p.id); closeModal(); }));
}
function closeModal() { if ($("#modal")) $("#modal").classList.remove("show"); }

/* ---------- Delegated clicks ---------- */
document.addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]");
  if (open) { const p = productById(open.dataset.open); if (p) openSizeModal(p); return; }

  const buy = e.target.closest("[data-buy]");
  if (buy) { const p = productById(buy.dataset.buy); if (p) openSizeModal(p); return; }

  const wishEl = e.target.closest("[data-wish]");
  if (wishEl) { toggleWish(Number(wishEl.dataset.wish)); return; }

  const del = e.target.closest("[data-del]");
  if (del) { bag = bag.filter((b) => b.key !== del.dataset.del); save("ms_bag", bag); renderBag(); updateCounts(); return; }

  const move = e.target.closest("[data-move]");
  if (move) {
    const p = productById(Number(move.dataset.move));
    if (p) { addToBag(p.id, p.size[0]); toggleWish(p.id, false); }
  }

  if (e.target.closest("[data-wqty]")) {
    const id = e.target.closest("[data-wqty]").dataset.wqty;
    openSizeModal(productById(Number(id)));
  }
});

/* ---------- Bag ---------- */
function addToBag(id, size) {
  const key = id + "" + size;
  const found = bag.find((b) => b.key === key);
  if (found) found.qty++; else bag.push({ key, id: Number(id), size, qty: 1 });
  save("ms_bag", bag);
  updateCounts();
  toast("Item added to bag 🛍️");
}
function bagTotal() { return bag.reduce((s, b) => s + productById(b.id).price * b.qty, 0); }

function renderBag() {
  const list = $("#bagList");
  if (!list) return;
  if (bag.length === 0) {
    list.innerHTML = '<div class="bag-empty">Your bag is empty<br><br>Keep shopping!</div>';
    $("#bagSubtotal").textContent = INR(0);
    setShip(0, 999);
    return;
  }
  list.innerHTML = bag.map((b) => {
    const p = productById(b.id);
    return `<div class="bitem">
      <div class="bitem-img" style="background:${p.grad}">${media(p, "b-img")}</div>
      <div class="bitem-info">
        <div class="bname">${p.name}</div>
        <div class="bsize">Size: ${b.size} · ${p.cat}</div>
        <div class="controls">
          <div class="qty">
            <button data-min="${b.key}">−</button><span>${b.qty}</span><button data-plus="${b.key}">+</button>
          </div>
          <button class="del" data-del="${b.key}"><i class="fas fa-trash-can"></i></button>
        </div>
        <div style="font-weight:700;margin-top:4px">${INR(p.price * b.qty)}</div>
      </div>
    </div>`;
  }).join("");
  const total = bagTotal();
  $("#bagSubtotal").textContent = INR(total);
  setShip(total, 999);
}

/* ---------- Easy order (WhatsApp) ---------- */
function openOrder() {
  if (bag.length === 0) return toast("Your bag is empty");
  renderOrderReview();
  $("#orderModal").classList.add("show");
  $("#oStatus").textContent = "";
}
function closeOrder() { $("#orderModal").classList.remove("show"); }

function renderOrderReview() {
  const items = bag.map((b) => {
    const p = productById(b.id);
    return `${b.qty} × ${p.name}${b.size ? " (" + b.size + ")" : ""} = ${INR(p.price * b.qty)}`;
  }).join("\n");
  const total = bagTotal();
  $("#oReview").innerHTML = `<pre>${items}\n\n<b>Total: ${INR(total)}</b></pre>`;
  $("#oPhone").value = ""; $("#oName").value = ""; $("#oAddr").value = "";
}

async function sendOrder() {
  const name = $("#oName").value.trim();
  const phone = $("#oPhone").value.trim();
  const addr = $("#oAddr").value.trim();
  if (!name || !phone || !addr) return toast("Please fill your name, phone and address");
  if (bag.length === 0) return toast("Your bag is empty");
  const sb = $("#oSend"); if (sb) sb.disabled = true;
  const items = bag.map((b) => {
    const p = productById(b.id);
    return `${b.qty} × ${p.name} (₹${p.price})${b.size ? " [Size " + b.size + "]" : ""} = ₹${p.price * b.qty}`;
  }).join("\n");
  const total = bagTotal();
  // Record the order server-side so it appears in the Peacock admin (Orders).
  let orderNumber = "";
  try {
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, phone, address: addr, total,
        items: bag.map((b) => { const p = productById(b.id); return { name: p.name, size: b.size || "", qty: b.qty, price: p.price }; }),
      }),
    });
    if (res.ok) {
      const d = await res.json();
      if (d && d.order_number) orderNumber = d.order_number;
    }
  } catch (e) {}
  if (sb) sb.disabled = false;
  const text = `*NEW ORDER — Peacock Fashions*\n\n*Order No:* ${orderNumber || "(not recorded)"}\n*Customer:* ${name}\n*Phone:* ${phone}\n*Address:* ${addr}\n\n*Items:*\n${items}\n\n*Total: ₹${total}*`;
  const wa = (window.STORE_CONFIG && window.STORE_CONFIG.whatsappNumber) ? window.STORE_CONFIG.whatsappNumber : "918125491097";
  window.open("https://wa.me/" + wa + "?text=" + encodeURIComponent(text), "_blank");
  $("#oStatus").style.color = "var(--green)";
  $("#oStatus").innerHTML = orderNumber
    ? `✓ Order recorded! <strong>Your order number is ${orderNumber}</strong> — save it to track your order (Peacock Fashions → Track).`
    : "Opening WhatsApp — press Send there to confirm your order.";
  bag = []; save("ms_bag", bag); updateCounts(); renderBag();
}

function setShip(total, freeAbove) {
  const bar = $("#shipBar"), msg = $("#shipMsg");
  if (!bar || !msg) return;
  if (total >= freeAbove) {
    msg.innerHTML = "🎉 <b>You have unlocked FREE delivery!</b>";
    bar.style.width = "100%";
  } else {
    msg.innerHTML = "Add <b>" + INR(freeAbove - total) + "</b> more for FREE delivery";
    bar.style.width = Math.min(100, (total / freeAbove) * 100) + "%";
  }
}

document.addEventListener("click", (e) => {
  const min = e.target.closest("[data-min]");
  const plus = e.target.closest("[data-plus]");
  if (min) {
    const it = bag.find((b) => b.key === min.dataset.min);
    if (it) { it.qty--; if (it.qty <= 0) bag = bag.filter((b) => b.key !== it.key); }
    save("ms_bag", bag); updateCounts(); renderBag();
  }
  if (plus) {
    const it = bag.find((b) => b.key === plus.dataset.plus);
    if (it) it.qty++;
    save("ms_bag", bag); updateCounts(); renderBag();
  }
});
function idx(key) {}
document.addEventListener("click", (e) => {
  const min = e.target.closest("[data-min]");
  if (!min) return;
  const it = bag.find((b) => b.key === min.dataset.min);
  if (it) { it.qty--; if (it.qty <= 0) bag = bag.filter((b) => b.key !== it.key); }
  save("ms_bag", bag); updateCounts(); renderBag();
});

/* ---------- Wishlist ---------- */
function toggleWish(id, force) {
  const has = wish.includes(id);
  if (force === false) wish = wish.filter((w) => w !== id);
  else if (has) wish = wish.filter((w) => w !== id);
  else wish.push(id);
  save("ms_wish", wish);
  updateCounts();
  toast(has ? "Removed from wishlist" : "Saved to wishlist ♥");
  $$("[data-wish]").forEach((b) => {
    if (Number(b.dataset.wish) === id) {
      const on = wish.includes(id);
      b.classList.toggle("on", on);
      b.innerHTML = `<i class="fa${on ? "s" : "r"} fa-heart"></i>`;
    }
  });
}

function renderWish() {
  const list = $("#wishList");
  if (!list) return;
  if (wish.length === 0) {
    list.innerHTML = '<div class="bag-empty">No favourites yet</div>';
    return;
  }
  list.innerHTML = wish.map((id) => {
    const p = productById(id);
    return `<div class="bitem">
      <div class="bitem-img" style="background:${p.grad}">${media(p, "b-img")}</div>
      <div class="bitem-info">
        <div class="bname">${p.name}</div>
        <div class="bsize">${p.cat} · ${INR(p.price)}</div>
        <div class="controls" style="justify-content:flex-start;gap:10px">
          <button class="btn-pink" style="width:auto;padding:8px 14px;font-size:.8rem" data-move="${p.id}">Move to bag</button>
          <button class="del" data-del-wish="${p.id}"><i class="fas fa-trash-can"></i></button>
        </div>
      </div>
    </div>`;
  }).join("");
}

document.addEventListener("click", (e) => {
  const delW = e.target.closest("[data-del-wish]");
  if (delW) { wish = wish.filter((w) => w !== Number(delW.dataset.delWish)); save("ms_wish", wish); updateCounts(); renderWish(); }
});

function updateCounts() {
  const bc = $("#bagCount"), wc = $("#wishCount");
  if (bc) bc.textContent = bag.reduce((s, b) => s + b.qty, 0);
  if (wc) wc.textContent = wish.length;
  const bnb = $("#bnBagCount"), bnw = $("#bnWishCount");
  if (bnb) bnb.textContent = bag.reduce((s, b) => s + b.qty, 0);
  if (bnw) bnw.textContent = wish.length;
}

/* ---------- Toast ---------- */
function toast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove("show"), 1800);
}

/* ---------- Listing ---------- */
const q = (params.get("q") || "").trim().toLowerCase();
const cat = params.get("cat") || "";
const subcat = params.get("subcat") || "";

let listingBound = false;
function initListing() {
  renderCats("#hcatList");
  if (!$("#plpGrid") && !$("#catList")) return;
  const grid = $("#plpGrid");
  if (grid) {
    // filters
    const catList = $("#catList");
    if (catList) {
      catList.innerHTML = `<label><input type="radio" name="cat" value="" ${!cat ? "checked" : ""}> All</label>` +
        CATS.map((c) => `<label><input type="radio" name="cat" value="${c}" ${cat === c ? "checked" : ""}> ${c}</label>`).join("");
    }

    // subcategory tabs for the active category
    const bar = $("#subcatBar");
    let activeSub = subcat;
    let activeCat = cat;
    let renderChips = () => {};
    if (bar) {
      renderChips = () => {
        const subs = [...new Set(PRODUCTS.filter((p) => p.cat === activeCat && p.img).map((p) => p.subcat))]
          .filter((s) => s !== "Readymade Blouses"); // hidden from Peacock nav/filters
        bar.innerHTML = subs.map((s) =>
          `<button class="chip ${s === activeSub ? "chip-on" : ""}" data-sub="${s}">${s}</button>`).join("");
      };
      renderChips();
    }

    const apply = () => {
      const sel = catList ? (document.querySelector('input[name="cat"]:checked')?.value || "") : cat;
      const maxP = $("#priceMax")?.value || 99999;
      const sort = $("#sortBy")?.value || "popularity";
      let list = PRODUCTS.filter((p) => p.img).slice();
      if (sel) list = list.filter((p) => p.cat === sel);
      if (activeSub) list = list.filter((p) => p.subcat === activeSub);
      if (subcat && !activeSub) list = list.filter((p) => p.subcat === subcat);
      if (q) list = list.filter((p) => (p.name + " " + p.cat + " " + p.subcat).toLowerCase().includes(q));
      list = list.filter((p) => p.price <= +maxP);
      if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
      else if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
      else if (sort === "discount") list.sort((a, b) => offPct(b) - offPct(a));
      $("#resultCount").textContent = list.length + " items";
      $("#resultTitle").textContent = sel + (activeSub ? " · " + activeSub : "");
      renderInto("#plpGrid", list);
    };

    // Bind persistent controls once; re-calls (post-catalog refresh) only re-apply.
    if (!listingBound) {
      if (bar) bar.addEventListener("click", (e) => {
        const ch = e.target.closest(".chip");
        if (!ch) return;
        activeSub = activeSub === ch.dataset.sub ? "" : ch.dataset.sub;
        renderChips();
        apply();
      });
      $("#applyFilters").addEventListener("click", apply);
      $$('input[name="cat"]').forEach((r) => r.addEventListener("change", () => {
        activeCat = document.querySelector('input[name="cat"]:checked')?.value || "";
        activeSub = "";
        renderChips();
        apply();
      }));
      $("#sortBy") && $("#sortBy").addEventListener("change", apply);
      $("#priceMax") && $("#priceMax").addEventListener("input", () => {
        $("#priceLabel").textContent = INR($("#priceMax").value);
        apply();
      });
      listingBound = true;
    }
    apply();
    return;
  }
}

/* ---------- Home ---------- */
let homeBound = false;
function initHome() {
  if (!$("#slides")) return;
  if (!homeBound) { // bind carousel once (re-calls only re-render the rows)
    renderCats("#hcatHome");
    let i = 0;
    const slides = $("#slides"), total = $$(".slide", slides).length;
    const go = (n) => {
      i = (n + total) % total;
      slides.style.transform = `translateX(-${i * 100}%)`;
    };
    $("#prev").addEventListener("click", () => go(i - 1));
    $("#next").addEventListener("click", () => go(i + 1));
    setInterval(() => go(i + 1), 5000);
    homeBound = true;
  }

  renderInto("#rowNew", spreadHome(8));
  renderInto("#rowBest", spreadHome(8));
  renderInto("#rowWomen", PRODUCTS.filter((p) => p.cat === "Women" && p.img).slice(0, 6));
  renderInto("#rowMen", PRODUCTS.filter((p) => p.cat === "Men" && p.img).slice(0, 5));
  renderInto("#rowAccess", PRODUCTS.filter((p) => p.cat === "Accessories" && p.img).slice(0, 5));
}

/* ---------- Boot ---------- */
function applyOverrides() {
  try {
    const o = JSON.parse(localStorage.getItem("ms_overrides") || "{}");
    for (const id in o) {
      const p = PRODUCTS.find((x) => x.id === Number(id));
      if (!p) continue;
      const d = o[id];
      if (d.name !== undefined) p.name = d.name;
      if (d.price !== undefined) p.price = +d.price;
      if (d.old !== undefined) p.old = d.old ? +d.old : 0;
      if (d.cat) p.cat = d.cat;
      if (d.subcat) p.subcat = d.subcat;
      if (d.size) p.size = d.size.split(",").map((s) => s.trim()).filter(Boolean);
      if (d.img !== undefined) p.img = d.img;
    }
  } catch (e) {}
}

async function boot() {
  mountApp();
  document.body.insertAdjacentHTML("beforeend", overlayHTML());
  bindHeader();
  $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });

  // Bundled catalog renders instantly, then the published catalog from this
  // site's own backend replaces it when available (admin edits go live).
  initHome();
  initListing();

  try {
    const res = await fetch("/api/catalog", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.products) && data.products.length) {
        PRODUCTS = data.products;
        CATS = [...new Set(PRODUCTS.map((p) => p.cat))];
        SUBCATS = [...new Set(PRODUCTS.map((p) => p.subcat))];
        renderCats("#hcatHome");
        initHome();
        initListing();
      }
    }
  } catch (e) {}
}

document.addEventListener("DOMContentLoaded", boot);