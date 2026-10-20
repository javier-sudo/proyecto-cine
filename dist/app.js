(() => {
  "use strict";

  const config = window.KIMUN_CONFIG || {};
  const catalog = window.KIMUN_CATALOG || { sale: { categories: [] }, rental: { categories: [] } };
  const state = { mode: "sale", category: "Todos", query: "", visible: 16 };
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const els = {
    grid: $("#productGrid"), tabs: $("#categoryTabs"), search: $("#searchInput"), summary: $("#catalogSummary"),
    title: $("#catalogTitle"), empty: $("#emptyState"),
    template: $("#productTemplate"), loadMore: $("#loadMore"), results: $("#catalogResults")
  };

  const clean = (value) => String(value ?? "").trim();
  const key = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const whatsappUrl = (message) => `https://wa.me/${clean(config.whatsapp)}?text=${encodeURIComponent(message)}`;

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
    const whatsapp = node.querySelector(".whatsapp-button");
    const message = `Hola ${config.businessName || "KIMUN"}, me interesa ${name} (${product.mode} · ${product.category}). ¿Me confirman disponibilidad y condiciones?`;
    whatsapp.href = whatsappUrl(message);
    whatsapp.setAttribute("aria-label", `Consultar por ${name} en WhatsApp`);
    return node;
  }

  $$(".mode-button").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  $$('[data-set-mode]').forEach((link) => link.addEventListener("click", () => setMode(link.dataset.setMode)));
  els.search.addEventListener("input", (event) => { state.query = event.target.value; state.visible = 16; renderProducts(); });
  els.loadMore.addEventListener("click", () => { state.visible += 16; renderProducts(); });
  const generalMessage = "Hola KIMUN, necesito información para una producción audiovisual.";
  $("#headerWhatsapp").href = whatsappUrl(generalMessage);
  $("#contactButton").href = whatsappUrl(generalMessage);

  const carousel = $("#heroCarousel");
  const slides = $$(".hero-slide");
  let activeSlide = 0;
  let carouselTimer;

  for (let index = slides.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [slides[index], slides[randomIndex]] = [slides[randomIndex], slides[index]];
  }
  slides.forEach((slide) => carousel.appendChild(slide));

  function showSlide(index) {
    activeSlide = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => slide.classList.toggle("active", slideIndex === activeSlide));
  }

  function startCarousel() {
    clearInterval(carouselTimer);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) carouselTimer = setInterval(() => showSlide(activeSlide + 1), 5000);
  }

  $("#year").textContent = new Date().getFullYear();
  showSlide(0); startCarousel(); setMode("sale");
})();
