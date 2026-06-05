const state = {
  products: [],
  cart: JSON.parse(localStorage.getItem("direct-cart") || "[]"),
  serverConfig: null,
  settings: JSON.parse(localStorage.getItem("direct-settings") || "null"),
  search: "",
  sort: "featured",
};

const elements = {
  storeName: document.querySelector("#store-name"),
  footerStoreName: document.querySelector("#footer-store-name"),
  heroDiscount: document.querySelector("#hero-discount"),
  productGrid: document.querySelector("#product-grid"),
  emptyState: document.querySelector("#empty-state"),
  syncStatus: document.querySelector("#sync-status"),
  searchInput: document.querySelector("#search-input"),
  sortSelect: document.querySelector("#sort-select"),
  cartButton: document.querySelector("#cart-button"),
  cartCount: document.querySelector("#cart-count"),
  cartDrawer: document.querySelector("#cart-drawer"),
  cartItems: document.querySelector("#cart-items"),
  cartEmpty: document.querySelector("#cart-empty"),
  checkout: document.querySelector("#checkout"),
  cartSavings: document.querySelector("#cart-savings"),
  cartTotal: document.querySelector("#cart-total"),
  whatsappButton: document.querySelector("#whatsapp-button"),
  customerName: document.querySelector("#customer-name"),
  customerLocation: document.querySelector("#customer-location"),
  settingsButton: document.querySelector("#settings-button"),
  settingsDrawer: document.querySelector("#settings-drawer"),
  overlay: document.querySelector("#overlay"),
  connectionNotice: document.querySelector("#connection-notice"),
  settingStoreName: document.querySelector("#setting-store-name"),
  settingWhatsapp: document.querySelector("#setting-whatsapp"),
  settingDiscount: document.querySelector("#setting-discount"),
  settingHideOutOfStock: document.querySelector("#setting-hide-out-of-stock"),
  specialPriceList: document.querySelector("#special-price-list"),
  saveSettings: document.querySelector("#save-settings"),
  resetSettings: document.querySelector("#reset-settings"),
  toast: document.querySelector("#toast"),
};

init();

async function init() {
  bindEvents();
  try {
    const [configResponse, productsResponse] = await Promise.all([
      fetch("/api/config"),
      fetch("/api/products"),
    ]);

    if (!configResponse.ok || !productsResponse.ok) {
      const errorBody = await productsResponse.json().catch(() => ({}));
      throw new Error(errorBody.error || "No se pudo cargar el catálogo.");
    }

    state.serverConfig = await configResponse.json();
    const catalog = await productsResponse.json();
    state.products = catalog.products;
    state.settings = {
      storeName: state.settings?.storeName || state.serverConfig.storeName,
      whatsappNumber:
        state.settings?.whatsappNumber || state.serverConfig.whatsappNumber,
      discount:
        state.settings?.discount ?? state.serverConfig.defaultDiscount,
      hideOutOfStock: state.settings?.hideOutOfStock ?? false,
      specialPrices: state.settings?.specialPrices || {},
    };

    elements.syncStatus.textContent =
      catalog.source === "tiendanube"
        ? `Sincronizado con Tiendanube · ${formatTime(catalog.syncedAt)}`
        : "Vista de demostración · falta conectar Tiendanube";
    updateConnectionNotice(catalog.source);
    removeUnavailableCartItems();
    renderAll();
  } catch (error) {
    elements.syncStatus.textContent = "No se pudo cargar";
    elements.productGrid.innerHTML = `
      <div class="notice demo">
        <strong>No pudimos abrir el catálogo.</strong><br>
        ${escapeHtml(error.message)}
      </div>`;
  }
}

function bindEvents() {
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderProducts();
  });

  elements.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderProducts();
  });

  elements.productGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add]");
    if (!button) return;
    const productId = button.dataset.productId;
    const card = button.closest(".product-card");
    const variantId = card.querySelector(".variant-select").value;
    addToCart(productId, variantId);
  });

  elements.productGrid.addEventListener("change", (event) => {
    if (!event.target.matches(".variant-select")) return;
    updateCardPrice(event.target.closest(".product-card"), event.target.value);
  });

  elements.cartItems.addEventListener("click", (event) => {
    const action = event.target.closest("[data-cart-action]");
    if (!action) return;
    const key = action.dataset.key;
    const item = state.cart.find((cartItem) => cartItem.key === key);
    if (!item) return;

    if (action.dataset.cartAction === "increase") item.quantity += 1;
    if (action.dataset.cartAction === "decrease") item.quantity -= 1;
    if (action.dataset.cartAction === "remove" || item.quantity <= 0) {
      state.cart = state.cart.filter((cartItem) => cartItem.key !== key);
    }
    persistCart();
    renderCart();
  });

  elements.cartButton.addEventListener("click", () => openDrawer(elements.cartDrawer));
  elements.settingsButton.addEventListener("click", () => {
    populateSettings();
    openDrawer(elements.settingsDrawer);
  });
  elements.overlay.addEventListener("click", closeDrawers);
  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", closeDrawers);
  });

  elements.saveSettings.addEventListener("click", saveSettings);
  elements.resetSettings.addEventListener("click", resetSettings);
  elements.whatsappButton.addEventListener("click", sendWhatsAppOrder);
}

function renderAll() {
  applyBranding();
  renderProducts();
  renderCart();
}

function applyBranding() {
  const name = state.settings.storeName || "Catálogo directo";
  const discount = clamp(Number(state.settings.discount), 0, 90);
  elements.storeName.textContent = name;
  elements.footerStoreName.textContent = name;
  elements.heroDiscount.textContent =
    discount > 0 ? `${formatNumber(discount)}% OFF` : "PRECIO ÚNICO";
  document.title = `${name} · Catálogo directo`;
}

function renderProducts() {
  if (!state.settings) return;
  let products = state.products.filter((product) => {
    const haystack = `${product.name} ${product.description}`.toLowerCase();
    const matchesSearch = haystack.includes(state.search);
    const hasStock = product.variants.some(isInStock);
    return matchesSearch && (!state.settings.hideOutOfStock || hasStock);
  });

  products = [...products].sort((a, b) => {
    if (state.sort === "price-asc") return minDirectPrice(a) - minDirectPrice(b);
    if (state.sort === "price-desc") return minDirectPrice(b) - minDirectPrice(a);
    if (state.sort === "name") return a.name.localeCompare(b.name, "es");
    return 0;
  });

  elements.productGrid.innerHTML = products.map(productCardHtml).join("");
  elements.emptyState.classList.toggle("hidden", products.length > 0);
}

function productCardHtml(product) {
  const firstAvailable =
    product.variants.find((variant) => isInStock(variant)) || product.variants[0];
  if (!firstAvailable) return "";
  const directPrice = getDirectPrice(product, firstAvailable);
  const reduction = getReductionPercent(firstAvailable.price, directPrice);
  const hasStock = product.variants.some(isInStock);

  return `
    <article class="product-card" data-product-id="${escapeHtml(product.id)}">
      <div class="product-image">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">
        ${reduction > 0 ? `<span class="discount-badge">-${reduction}%</span>` : ""}
      </div>
      <div class="product-body">
        <h3>${escapeHtml(product.name)}</h3>
        <p class="product-description">${escapeHtml(product.description || "Consultanos por más detalles.")}</p>
        <select class="variant-select" aria-label="Elegir variante de ${escapeHtml(product.name)}">
          ${product.variants
            .map(
              (variant) => `
                <option value="${escapeHtml(variant.id)}" ${variant.id === firstAvailable.id ? "selected" : ""} ${!isInStock(variant) ? "disabled" : ""}>
                  ${escapeHtml(variant.name)}${!isInStock(variant) ? " · Sin stock" : ""}
                </option>`,
            )
            .join("")}
        </select>
        <div class="price-line">
          <span class="direct-price">${formatMoney(directPrice)}</span>
          ${directPrice < firstAvailable.price ? `<span class="original-price">${formatMoney(firstAvailable.price)}</span>` : ""}
        </div>
        <button class="add-button" data-add data-product-id="${escapeHtml(product.id)}" ${!hasStock ? "disabled" : ""}>
          ${hasStock ? "Agregar al pedido" : "Sin stock"}
        </button>
      </div>
    </article>`;
}

function updateCardPrice(card, variantId) {
  const product = state.products.find((item) => item.id === card.dataset.productId);
  const variant = product?.variants.find((item) => item.id === variantId);
  if (!product || !variant) return;
  const directPrice = getDirectPrice(product, variant);
  card.querySelector(".direct-price").textContent = formatMoney(directPrice);
  const oldPrice = card.querySelector(".original-price");
  if (oldPrice) {
    oldPrice.textContent = formatMoney(variant.price);
    oldPrice.classList.toggle("hidden", directPrice >= variant.price);
  } else if (directPrice < variant.price) {
    card.querySelector(".price-line").insertAdjacentHTML(
      "beforeend",
      `<span class="original-price">${formatMoney(variant.price)}</span>`,
    );
  }
  const badge = card.querySelector(".discount-badge");
  const reduction = getReductionPercent(variant.price, directPrice);
  if (badge) {
    badge.textContent = `-${reduction}%`;
    badge.classList.toggle("hidden", reduction <= 0);
  }
}

function addToCart(productId, variantId) {
  const product = state.products.find((item) => item.id === productId);
  const variant = product?.variants.find((item) => item.id === variantId);
  if (!product || !variant || !isInStock(variant)) return;
  const key = `${productId}:${variantId}`;
  const existing = state.cart.find((item) => item.key === key);
  if (existing) {
    if (variant.stock === null || existing.quantity < variant.stock) {
      existing.quantity += 1;
    }
  } else {
    state.cart.push({ key, productId, variantId, quantity: 1 });
  }
  persistCart();
  renderCart();
  showToast(`${product.name} se agregó al pedido`);
}

function renderCart() {
  const resolvedItems = state.cart.map(resolveCartItem).filter(Boolean);
  const quantity = resolvedItems.reduce((total, item) => total + item.quantity, 0);
  elements.cartCount.textContent = String(quantity);
  elements.cartEmpty.classList.toggle("hidden", resolvedItems.length > 0);
  elements.checkout.classList.toggle("hidden", resolvedItems.length === 0);

  elements.cartItems.innerHTML = resolvedItems
    .map(
      ({ key, product, variant, quantity, directPrice }) => `
        <div class="cart-item">
          <img src="${escapeHtml(product.image)}" alt="">
          <div>
            <strong>${escapeHtml(product.name)}</strong>
            <small>${escapeHtml(variant.name)}</small>
            <div class="quantity-control">
              <button data-cart-action="decrease" data-key="${escapeHtml(key)}" aria-label="Quitar uno">−</button>
              <span>${quantity}</span>
              <button data-cart-action="increase" data-key="${escapeHtml(key)}" aria-label="Agregar uno">+</button>
            </div>
          </div>
          <div class="cart-item-price">
            <strong>${formatMoney(directPrice * quantity)}</strong>
            <button data-cart-action="remove" data-key="${escapeHtml(key)}">Quitar</button>
          </div>
        </div>`,
    )
    .join("");

  const totals = calculateTotals(resolvedItems);
  elements.cartTotal.textContent = formatMoney(totals.direct);
  elements.cartSavings.textContent = formatMoney(totals.original - totals.direct);
}

function resolveCartItem(item) {
  const product = state.products.find((candidate) => candidate.id === item.productId);
  const variant = product?.variants.find(
    (candidate) => candidate.id === item.variantId,
  );
  if (!product || !variant) return null;
  return {
    ...item,
    product,
    variant,
    directPrice: getDirectPrice(product, variant),
  };
}

function calculateTotals(items) {
  return items.reduce(
    (totals, item) => ({
      original: totals.original + item.variant.price * item.quantity,
      direct: totals.direct + item.directPrice * item.quantity,
    }),
    { original: 0, direct: 0 },
  );
}

function sendWhatsAppOrder() {
  const phone = String(state.settings.whatsappNumber || "").replace(/\D/g, "");
  if (phone.length < 10) {
    showToast("Revisá el número de WhatsApp en Ajustes.");
    return;
  }

  const items = state.cart.map(resolveCartItem).filter(Boolean);
  if (!items.length) return;
  const totals = calculateTotals(items);
  const name = elements.customerName.value.trim();
  const location = elements.customerLocation.value.trim();
  const lines = [
    `Hola, quiero hacer este pedido en ${state.settings.storeName}:`,
    "",
    ...items.map(
      (item) =>
        `• ${item.quantity}x ${item.product.name} (${item.variant.name}) — ${formatMoney(item.directPrice * item.quantity)}`,
    ),
    "",
    `*Total estimado: ${formatMoney(totals.direct)}*`,
    `Ahorro por compra directa: ${formatMoney(totals.original - totals.direct)}`,
    "",
    name ? `Nombre: ${name}` : "",
    location ? `Localidad: ${location}` : "",
    "",
    "¿Me confirmás stock, forma de pago y entrega? Gracias.",
  ].filter((line, index, all) => line || all[index - 1] !== "");

  const url = `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function populateSettings() {
  elements.settingStoreName.value = state.settings.storeName;
  elements.settingWhatsapp.value = state.settings.whatsappNumber;
  elements.settingDiscount.value = state.settings.discount;
  elements.settingHideOutOfStock.checked = state.settings.hideOutOfStock;
  elements.specialPriceList.innerHTML = state.products
    .map((product) => {
      const price = state.settings.specialPrices[product.id] ?? "";
      return `
        <label class="special-price-row">
          <span title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</span>
          <input type="number" min="0" step="1" placeholder="Automático" value="${escapeHtml(price)}" data-special-price="${escapeHtml(product.id)}">
        </label>`;
    })
    .join("");
}

function saveSettings() {
  const specialPrices = {};
  document.querySelectorAll("[data-special-price]").forEach((input) => {
    const value = Number(input.value);
    if (input.value !== "" && Number.isFinite(value) && value >= 0) {
      specialPrices[input.dataset.specialPrice] = value;
    }
  });

  state.settings = {
    storeName: elements.settingStoreName.value.trim() || "Catálogo directo",
    whatsappNumber: elements.settingWhatsapp.value.replace(/\D/g, ""),
    discount: clamp(Number(elements.settingDiscount.value), 0, 90),
    hideOutOfStock: elements.settingHideOutOfStock.checked,
    specialPrices,
  };
  localStorage.setItem("direct-settings", JSON.stringify(state.settings));
  renderAll();
  closeDrawers();
  showToast("Ajustes guardados");
}

function resetSettings() {
  localStorage.removeItem("direct-settings");
  state.settings = {
    storeName: state.serverConfig.storeName,
    whatsappNumber: state.serverConfig.whatsappNumber,
    discount: state.serverConfig.defaultDiscount,
    hideOutOfStock: false,
    specialPrices: {},
  };
  populateSettings();
  renderAll();
  showToast("Se restablecieron los ajustes");
}

function updateConnectionNotice(source) {
  const connected = source === "tiendanube";
  elements.connectionNotice.classList.toggle("demo", !connected);
  elements.connectionNotice.innerHTML = connected
    ? "<strong>Tiendanube conectada.</strong><br>Los productos y el stock se cargan desde tu tienda."
    : "<strong>Modo demostración.</strong><br>El catálogo ya funciona. Para mostrar tus productos reales, completá las credenciales de Tiendanube en el servidor.";
}

function getDirectPrice(product, variant) {
  const special = Number(state.settings.specialPrices[product.id]);
  if (Number.isFinite(special) && special >= 0) return special;
  const discount = clamp(Number(state.settings.discount), 0, 90);
  return roundPrice(variant.price * (1 - discount / 100));
}

function minDirectPrice(product) {
  return Math.min(
    ...product.variants.filter(isInStock).map((variant) => getDirectPrice(product, variant)),
  );
}

function getReductionPercent(original, direct) {
  if (!original || direct >= original) return 0;
  return Math.round((1 - direct / original) * 100);
}

function roundPrice(value) {
  return Math.round(value);
}

function isInStock(variant) {
  return variant.stock === null || variant.stock > 0;
}

function removeUnavailableCartItems() {
  state.cart = state.cart.filter((item) => {
    const product = state.products.find((candidate) => candidate.id === item.productId);
    const variant = product?.variants.find(
      (candidate) => candidate.id === item.variantId,
    );
    return variant && isInStock(variant);
  });
  persistCart();
}

function persistCart() {
  localStorage.setItem("direct-cart", JSON.stringify(state.cart));
}

function openDrawer(drawer) {
  closeDrawers();
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  elements.overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeDrawers() {
  document.querySelectorAll(".drawer.open").forEach((drawer) => {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
  });
  elements.overlay.classList.add("hidden");
  document.body.style.overflow = "";
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.remove("hidden");
  toastTimer = setTimeout(() => elements.toast.classList.add("hidden"), 2400);
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value);
}

function formatTime(isoDate) {
  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
