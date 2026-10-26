(() => {
  "use strict";

  const config = window.KIMUN_CONFIG || {};
  let catalog = window.KIMUN_CATALOG || { sale: { categories: [] }, rental: { categories: [] } };
  const state = { mode: "all", category: "Todos", query: "", visible: 16 };
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
  function loadDriveCatalog() {
    if (!config.apiUrl) return;
    const callback = `kimunCatalog_${Date.now()}`;
    const script = document.createElement("script");
    const cleanup = () => { delete window[callback]; script.remove(); };
    const timer = setTimeout(() => { cleanup(); document.documentElement.dataset.catalogSource = "backup"; }, 60000);
    window[callback] = (payload) => {
      clearTimeout(timer);
      if (payload && payload.success && payload.catalog) {
        catalog = payload.catalog;
        document.documentElement.dataset.catalogSource = "drive";
        renderTabs();
        renderProducts();
      } else {
        document.documentElement.dataset.catalogSource = "backup";
      }
      cleanup();
    };
    script.onerror = () => { clearTimeout(timer); cleanup(); document.documentElement.dataset.catalogSource = "backup"; };
    script.src = `${config.apiUrl}?callback=${encodeURIComponent(callback)}&_=${Date.now()}`;
    document.head.appendChild(script);
  }

  function modeCatalogs() {
    return state.mode === "all" ? [catalog.sale, catalog.rental] : [catalog[state.mode]];
  }

  function allProducts() {
    return modeCatalogs().filter(Boolean).flatMap((entry) => (entry.categories || []).flatMap((category) => category.products || []));
  }

  function availableCategories() {
    return [...new Set(allProducts().map((product) => product.category).filter(Boolean))];
  }

  function setMode(mode) {
    state.mode = ["sale", "rental"].includes(mode) ? mode : "all";
    state.category = "Todos";
    state.visible = 16;
    els.title.textContent = state.mode === "sale"
      ? "Insumos disponibles para venta."
      : state.mode === "rental"
        ? "Iluminación disponible para arriendo."
        : "Venta y arriendo para tu producción.";
    $$(".mode-button").forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    renderTabs();
    renderProducts();
  }

  function renderTabs() {
    const categories = ["Todos", ...availableCategories()];
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
      const haystack = key([product.name, product.brand, product.detail, product.category, product.mode].join(" "));
      return inCategory && (!query || haystack.includes(query));
    });
  }

  function renderProducts() {
    const products = filteredProducts();
    const visible = products.slice(0, state.visible);
    const totalMode = allProducts().length;
    const modeLabel = state.mode === "sale" ? "productos" : state.mode === "rental" ? "equipos de iluminación" : "artículos";
    els.summary.textContent = `${totalMode} ${modeLabel} · ${availableCategories().length} áreas`;
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
    const modeDisplay = key(product.mode) === "rental" ? "Arriendo" : product.mode;
    node.querySelector(".product-category").textContent = `${modeDisplay} · ${product.category}`;
    node.querySelector("h3").textContent = name;
    const details = [product.brand, product.detail, product.availability ? `${product.availability} disponibles` : ""].filter(Boolean);
    node.querySelector(".product-copy p").textContent = details.join(" · ") || "Disponibilidad a confirmar";
    return node;
  }

  $$(".mode-button").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  $$('[data-set-mode]').forEach((link) => link.addEventListener("click", () => setMode(link.dataset.setMode)));
  els.search.addEventListener("input", (event) => { state.query = event.target.value; state.visible = 16; renderProducts(); });
  els.loadMore.addEventListener("click", () => { state.visible += 16; renderProducts(); });
  const generalMessage = "Hola KIMUN, necesito información para una producción audiovisual.";
  $("#headerWhatsapp").href = whatsappUrl(generalMessage);
  $("#contactButton").href = whatsappUrl(generalMessage);
  $("#truckWhatsapp").href = whatsappUrl("Hola KIMUN, quiero consultar la disponibilidad y condiciones del camión de producción.");

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
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) carouselTimer = setInterval(() => showSlide(activeSlide + 1), 3000);
  }

  const truckGallery = $("#truckGallery");
  const truckSlides = $$(`#truckGallery .truck-slide`);
  const truckProgress = $("#truckProgress");
  let activeTruckSlide = 0;
  let truckTimer;

  truckProgress.replaceChildren(...truckSlides.map((_, index) => {
    const marker = document.createElement("span");
    marker.className = index === 0 ? "active" : "";
    return marker;
  }));

  function showTruckSlide(index) {
    activeTruckSlide = (index + truckSlides.length) % truckSlides.length;
    truckSlides.forEach((slide, slideIndex) => slide.classList.toggle("active", slideIndex === activeTruckSlide));
    [...truckProgress.children].forEach((marker, markerIndex) => marker.classList.toggle("active", markerIndex === activeTruckSlide));
  }

  function startTruckGallery() {
    clearInterval(truckTimer);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) truckTimer = setInterval(() => showTruckSlide(activeTruckSlide + 1), 3600);
  }

  truckGallery.addEventListener("mouseenter", () => clearInterval(truckTimer));
  truckGallery.addEventListener("mouseleave", startTruckGallery);

  $("#year").textContent = new Date().getFullYear();
  showSlide(0); startCarousel(); showTruckSlide(0); startTruckGallery(); setMode("all"); loadDriveCatalog();
})();
