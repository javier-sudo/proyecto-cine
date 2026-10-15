(() => {
  "use strict";

  const config = window.KIMUN_CONFIG || {};
  const fallback = window.KIMUN_FALLBACK || { categories: [] };
  const state = { catalog: fallback, category: "Todos", query: "", cart: new Map() };
  const $ = (selector) => document.querySelector(selector);
  const els = {
    grid: $("#productGrid"), tabs: $("#categoryTabs"), search: $("#searchInput"), summary: $("#catalogSummary"),
    note: $("#syncNote"), empty: $("#emptyState"), cart: $("#cart"), scrim: $("#scrim"), count: $("#cartCount"),
    items: $("#cartItems"), cartEmpty: $("#cartEmpty"), total: $("#cartTotal"), send: $("#sendQuote"), template: $("#productTemplate")
  };

  const money = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
  const clean = (value) => String(value ?? "").trim();
  const key = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  async function loadCatalog() {
    if (!config.apiUrl) {
      els.note.hidden = true;
      useCatalog(fallback);
      return;
    }
    try {
      const url = new URL(config.apiUrl);
      url.searchParams.set("action", "catalog");
      url.searchParams.set("_", Date.now().toString());
      const response = await fetch(url, { method: "GET", redirect: "follow" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload.success || !Array.isArray(payload.categories)) throw new Error(payload.message || "Respuesta no válida");
      useCatalog(payload);
    } catch (error) {
      console.warn("No se pudo cargar el catálogo en vivo", error);
      showNote("El catálogo en vivo no respondió. Se está mostrando una vista de respaldo.");
      useCatalog(fallback);
    }
  }

  function useCatalog(catalog) {
    state.catalog = catalog;
    const total = allProducts().length;
    els.summary.textContent = `${total} ${total === 1 ? "producto" : "productos"} · ${catalog.categories.length} ${catalog.categories.length === 1 ? "categoría" : "categorías"}`;
    renderTabs();
    renderProducts();
  }

  function allProducts() {
    return (state.catalog.categories || []).flatMap((category) =>
      (category.products || []).map((product) => ({ ...product, category: category.name }))
    );
  }

  function renderTabs() {
    const categories = ["Todos", ...(state.catalog.categories || []).map((category) => category.name)];
    els.tabs.replaceChildren(...categories.map((category) => {
      const button = document.createElement("button");
      button.className = `category-tab${state.category === category ? " active" : ""}`;
      button.type = "button";
      button.role = "tab";
      button.setAttribute("aria-selected", state.category === category ? "true" : "false");
      button.textContent = category;
      button.addEventListener("click", () => { state.category = category; renderTabs(); renderProducts(); });
      return button;
    }));
  }

  function renderProducts() {
    const query = key(state.query);
    const products = allProducts().filter((product) => {
      const inCategory = state.category === "Todos" || product.category === state.category;
      const haystack = key([product.name, product.brand, product.detail, product.category].join(" "));
      return inCategory && (!query || haystack.includes(query));
    });
    els.empty.hidden = products.length > 0;
    els.grid.replaceChildren(...products.map(productCard));
  }

  function productCard(product) {
    const node = els.template.content.firstElementChild.cloneNode(true);
    const media = node.querySelector(".product-media");
    const image = node.querySelector("img");
    const name = clean(product.name) || "Producto";
    node.querySelector("h3").textContent = name;
    node.querySelector(".product-copy p").textContent = [product.brand, product.detail].filter(Boolean).join(" · ") || "Disponible por encargo";
    node.querySelector(".product-price").textContent = money.format(Number(product.price) || 0);
    node.querySelector(".product-category").textContent = product.category;
    node.querySelector(".product-placeholder span").textContent = name.slice(0, 1).toUpperCase();
    node.querySelector(".product-placeholder small").textContent = product.category;
    if (product.image) {
      image.alt = name;
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";
      image.addEventListener("load", () => media.classList.add("has-image"));
      image.addEventListener("error", () => {
        media.classList.remove("has-image");
        image.removeAttribute("src");
      });
      image.src = product.image;
    }
    const add = node.querySelector(".add-button");
    const id = clean(product.id) || `${key(product.category)}-${key(name)}`;
    if (state.cart.has(id)) { add.classList.add("added"); add.textContent = "✓"; }
    add.addEventListener("click", () => addToCart({ ...product, id, category: product.category }, add));
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
      const row = document.createElement("div");
      row.className = "cart-row";
      const copy = document.createElement("div");
      const title = document.createElement("h3");
      const meta = document.createElement("p");
      title.textContent = product.name;
      meta.textContent = `${money.format(Number(product.price) || 0)} c/u · ${product.category}`;
      copy.append(title, meta);
      const qty = document.createElement("div");
      qty.className = "qty";
      const minus = qtyButton("−", () => changeQuantity(product.id, -1));
      const value = document.createElement("span");
      value.textContent = quantity;
      const plus = qtyButton("+", () => changeQuantity(product.id, 1));
      qty.append(minus, value, plus);
      row.append(copy, qty);
      return row;
    }));
    const units = entries.reduce((sum, item) => sum + item.quantity, 0);
    const total = entries.reduce((sum, item) => sum + (Number(item.product.price) || 0) * item.quantity, 0);
    els.count.textContent = units;
    els.total.textContent = money.format(total);
    els.send.disabled = entries.length === 0;
  }

  function qtyButton(label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function changeQuantity(id, change) {
    const entry = state.cart.get(id);
    if (!entry) return;
    entry.quantity += change;
    if (entry.quantity <= 0) state.cart.delete(id);
    renderCart();
    renderProducts();
  }

  function sendQuote() {
    const entries = [...state.cart.values()];
    if (!entries.length) return;
    const lines = entries.map(({ product, quantity }) => `• ${quantity} × ${product.name} (${money.format(Number(product.price) || 0)} c/u)`);
    const total = entries.reduce((sum, item) => sum + (Number(item.product.price) || 0) * item.quantity, 0);
    const message = [`Hola ${config.businessName || "KIMUN"}, quisiera cotizar estos productos:`, "", ...lines, "", `Total referencial: ${money.format(total)}`, "", "¿Me confirman stock, IVA y despacho?"];
    window.open(`https://wa.me/${clean(config.whatsapp)}?text=${encodeURIComponent(message.join("\n"))}`, "_blank", "noopener,noreferrer");
  }

  function showNote(message) { els.note.textContent = message; els.note.hidden = false; }
  function openCart() { document.body.classList.add("cart-open"); els.scrim.hidden = false; els.cart.classList.add("open"); els.cart.setAttribute("aria-hidden", "false"); }
  function closeCart() { document.body.classList.remove("cart-open"); els.scrim.hidden = true; els.cart.classList.remove("open"); els.cart.setAttribute("aria-hidden", "true"); }
  function openContact() { window.open(`https://wa.me/${clean(config.whatsapp)}?text=${encodeURIComponent("Hola, necesito ayuda con insumos para una producción audiovisual.")}`, "_blank", "noopener,noreferrer"); }

  els.search.addEventListener("input", (event) => { state.query = event.target.value; renderProducts(); });
  $("#openCart").addEventListener("click", openCart);
  $("#heroQuote").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  els.scrim.addEventListener("click", closeCart);
  els.send.addEventListener("click", sendQuote);
  $("#contactButton").addEventListener("click", openContact);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeCart(); });
  $("#year").textContent = new Date().getFullYear();
  renderCart();
  loadCatalog();
})();
