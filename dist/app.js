(() => {
  "use strict";

  const config = window.KIMUN_CONFIG || {};
  const catalog = window.KIMUN_CATALOG || { sale: { categories: [] }, rental: { categories: [] } };
  const state = { mode: "sale", category: "Todos", query: "", visible: 16, cart: new Map() };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const els = {
    grid: $("#productGrid"), tabs: $("#categoryTabs"), search: $("#searchInput"), summary: $("#catalogSummary"),
    title: $("#catalogTitle"), empty: $("#emptyState"), cart: $("#cart"), scrim: $("#scrim"), count: $("#cartCount"),
    items: $("#cartItems"), cartEmpty: $("#cartEmpty"), send: $("#sendQuote"),
    template: $("#productTemplate"), loadMore: $("#loadMore"), results: $("#catalogResults")
  };

  const clean = (value) => String(value ?? "").trim();
  const key = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  function currentCatalog() { return catalog[state.mode] || { categories: [] }; }
  function allProducts() { return currentCatalog().categories.flatMap((category) => category.products || []); }

  function setMode(mode) {
    state.mode = mode === "rental" ? "rental" : "sale";
    state.category = "Todos";
    state.query = "";
    state.visible = 16;
    els.search.value = "";
    els.title.textContent = state.mode === "sale" ? "Insumos disponibles para venta." : "Equipos disponibles en rental.";
    els.search.placeholder = state.mode === "sale" ? "Buscar insumo, marca o detalle…" : "Buscar HMI, Fresnel, LED, grip…";
    $$(".mode-button").forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    renderTabs();
    renderProducts();
  }

  function renderTabs() {
    const categories = ["Todos", ...currentCatalog().categories.map((category) => category.name)];
    els.tabs.replaceChildren(...categories.map((category) => {
      const button = document.createElement("button");
      button.className = `category-tab${state.category === category ? " active" : ""}`;
      button.type = "button";
      button.role = "tab";
      button.setAttribute("aria-selected", state.category === category ? "true" : "false");
      button.textContent = category;
      button.addEventListener("click", () => { state.category = category; state.visible = 16; renderTabs(); renderProducts(); });
      return button;
    }));
  }

  function filteredProducts() {
    const query = key(state.query);
    return allProducts().filter((product) => {
      const inCategory = state.category === "Todos" || product.category === state.category;
      const haystack = key([product.name, product.brand, product.detail, product.category].join(" "));
      return inCategory && (!query || haystack.includes(query));
    });
  }

  function renderProducts() {
    const products = filteredProducts();
    const visible = products.slice(0, state.visible);
    const totalMode = allProducts().length;
    els.summary.textContent = `${totalMode} ${state.mode === "sale" ? "productos" : "equipos"} · ${currentCatalog().categories.length} áreas`;
    els.empty.hidden = products.length > 0;
    els.grid.replaceChildren(...visible.map(productCard));
    els.results.textContent = products.length ? `Mostrando ${visible.length} de ${products.length}` : "0 resultados";
    const remaining = Math.max(0, products.length - visible.length);
    els.loadMore.hidden = remaining === 0;
    els.loadMore.textContent = `Mostrar más (${remaining})`;
  }

  function productCard(product) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const name = clean(product.name) || "Artículo";
    node.querySelector(".product-code").textContent = clean(product.id).toUpperCase();
    node.querySelector(".product-category").textContent = `${product.mode} · ${product.category}`;
    node.querySelector("h3").textContent = name;
    const details = [product.brand, product.detail, product.availability ? `${product.availability} disponibles` : ""].filter(Boolean);
    node.querySelector(".product-copy p").textContent = details.join(" · ") || "Disponibilidad a confirmar";
    const add = node.querySelector(".add-button");
    if (state.cart.has(product.id)) { add.classList.add("added"); add.textContent = "✓"; }
    add.setAttribute("aria-label", `Agregar ${name}`);
    add.addEventListener("click", () => addToCart(product, add));
    return node;
  }

  function addToCart(product, button) {
    const current = state.cart.get(product.id);
    state.cart.set(product.id, { product, quantity: (current?.quantity || 0) + 1 });
    button.classList.add("added");
    button.textContent = "✓";
    renderCart();
    openCart();
  }

  function renderCart() {
    const entries = [...state.cart.values()];
    els.cartEmpty.hidden = entries.length > 0;
    els.items.hidden = entries.length === 0;
    els.items.replaceChildren(...entries.map(({ product, quantity }) => {
      const row = document.createElement("div"); row.className = "cart-row";
      const copy = document.createElement("div");
      const title = document.createElement("h3"); title.textContent = product.name;
      const meta = document.createElement("p"); meta.textContent = `${product.mode} · ${product.category}`;
      copy.append(title, meta);
      const qty = document.createElement("div"); qty.className = "qty";
      qty.append(qtyButton("−", () => changeQuantity(product.id, -1)), Object.assign(document.createElement("span"), { textContent: quantity }), qtyButton("+", () => changeQuantity(product.id, 1)));
      row.append(copy, qty); return row;
    }));
    const units = entries.reduce((sum, item) => sum + item.quantity, 0);
    els.count.textContent = units; els.send.disabled = !entries.length;
  }

  function qtyButton(label, handler) { const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.addEventListener("click", handler); return button; }
  function changeQuantity(id, change) { const entry = state.cart.get(id); if (!entry) return; entry.quantity += change; if (entry.quantity <= 0) state.cart.delete(id); renderCart(); renderProducts(); }

  function sendQuote() {
    const entries = [...state.cart.values()]; if (!entries.length) return;
    const lines = entries.map(({ product, quantity }) => `• ${quantity} × ${product.name} — ${product.mode}`);
    const message = [`Hola ${config.businessName || "KIMUN"}, quisiera cotizar:`, "", ...lines, "", "¿Me confirman disponibilidad y condiciones?"].join("\n");
    window.open(`https://wa.me/${clean(config.whatsapp)}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  function openCart() { document.body.classList.add("cart-open"); els.scrim.hidden = false; els.cart.classList.add("open"); els.cart.setAttribute("aria-hidden", "false"); }
  function closeCart() { document.body.classList.remove("cart-open"); els.scrim.hidden = true; els.cart.classList.remove("open"); els.cart.setAttribute("aria-hidden", "true"); }
  function openContact() { window.open(`https://wa.me/${clean(config.whatsapp)}?text=${encodeURIComponent("Hola KIMUN, necesito cotizar para una producción audiovisual.")}`, "_blank", "noopener,noreferrer"); }

  $$(".mode-button").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  $$('[data-set-mode]').forEach((link) => link.addEventListener("click", () => setMode(link.dataset.setMode)));
  els.search.addEventListener("input", (event) => { state.query = event.target.value; state.visible = 16; renderProducts(); });
  els.loadMore.addEventListener("click", () => { state.visible += 16; renderProducts(); });
  $("#openCart").addEventListener("click", openCart); $("#closeCart").addEventListener("click", closeCart); els.scrim.addEventListener("click", closeCart);
  els.send.addEventListener("click", sendQuote); $("#contactButton").addEventListener("click", openContact);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeCart(); });
  $("#year").textContent = new Date().getFullYear();
  renderCart(); setMode("sale");
})();
