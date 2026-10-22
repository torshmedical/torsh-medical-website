/* TORSH v5.0 — dependency-free progressive enhancement.
 * Navigation, local search and editorial pages work without network requests.
 * Enquiry and admin requests use same-origin Cloudflare Worker endpoints.
 */
(() => {
  "use strict";
  document.documentElement.classList.replace("no-js", "js");
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  let searchOpener = null;

  function closeMenu(returnFocus = false) {
    const button = $("[data-menu-toggle]");
    if (!button) return;
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", "Open navigation");
    $("#primary-navigation")?.classList.remove("is-open");
    if (returnFocus) button.focus();
  }

  function filterSearch(value = "") {
    const words = String(value).toLowerCase().trim().split(/\s+/).filter(Boolean);
    let count = 0;
    $$('[data-search-item]').forEach(item => {
      const terms = (item.getAttribute("data-search-terms") || "").toLowerCase();
      const matches = words.every(word => terms.includes(word));
      item.hidden = !matches;
      if (matches) count += 1;
    });
    const status = $("[data-search-count]");
    if (status) status.textContent = `${count} ${count === 1 ? "page" : "pages"}${words.length ? " found" : ""}`;
    const empty = $("[data-search-empty]");
    if (empty) empty.hidden = count !== 0;
  }

  function filterInsights(category = "all") {
    $$('[data-insight-card]').forEach(card => {
      card.hidden = category !== "all" && card.getAttribute("data-category") !== category;
    });
    $$('[data-insight-filter]').forEach(button => {
      const active = button.getAttribute("data-insight-filter") === category;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function openSearch() {
    const dialog = $("#site-search");
    if (!dialog || dialog.open || typeof dialog.showModal !== "function") return;
    searchOpener = document.activeElement;
    closeMenu();
    dialog.showModal();
    document.body.classList.add("dialog-open");
    const input = $("#site-search-input");
    if (input) { input.value = ""; input.focus(); }
    filterSearch();
    filterInsights("all");
  }

  function closeSearch() {
    const dialog = $("#site-search");
    if (dialog?.open) dialog.close();
    document.body.classList.remove("dialog-open");
  }

  function config() { return window.TORSH_CONFIG || {}; }

  function setFormStatus(message, state = "") {
    const node = $("[data-form-status]");
    if (!node) return;
    node.textContent = message;
    node.dataset.state = state;
  }

  async function submitEnquiry(form) {
    if (!form.reportValidity()) return;
    const endpoint = config().enquiryEndpoint;
    if (!endpoint) {
      setFormStatus(`The online form is not available. Please email ${config().contactEmail || "TORSH"}.`, "error");
      return;
    }
    const data = Object.fromEntries(new FormData(form).entries());
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    setFormStatus("Sending your enquiry…", "pending");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(data)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "We could not send the enquiry.");
      form.reset();
      const counter = $("[data-message-count]", form);
      if (counter) counter.textContent = "0";
      setFormStatus(`Thank you. Your reference is ${payload.reference || "recorded"}.`, "success");
    } catch (error) {
      setFormStatus(`${error.message} You can email ${config().contactEmail || "us"} instead.`, "error");
    } finally {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
    }
  }

  function initialiseEnquiryForm() {
    const form = $("[data-enquiry-form]");
    if (!form) return;
    const interest = new URLSearchParams(location.search).get("interest");
    if (interest) {
      const input = $("[data-interest-input]", form);
      if (input) input.value = interest.replace(/-/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
      if (form.elements.category) form.elements.category.value = "product";
    }
    form.addEventListener("submit", event => { event.preventDefault(); submitEnquiry(form); });
    form.elements.message?.addEventListener("input", event => {
      const counter = $("[data-message-count]", form);
      if (counter) counter.textContent = String(event.target.value.length);
    });
  }

  function appendDefinition(list, label, value, link = "") {
    if (!value) return;
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    if (link) {
      const anchor = document.createElement("a");
      anchor.href = link;
      anchor.textContent = value;
      detail.append(anchor);
    } else detail.textContent = value;
    list.append(term, detail);
  }

  function renderAdminItems(items) {
    const list = $("[data-admin-list]");
    if (!list) return;
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "admin-empty";
      empty.textContent = "No enquiries match this filter.";
      list.append(empty);
      return;
    }
    items.forEach(item => {
      const card = document.createElement("article");
      card.className = "admin-card";
      const head = document.createElement("div");
      head.className = "admin-card__head";
      const title = document.createElement("h3");
      title.textContent = item.category_label || item.category;
      const ref = document.createElement("span");
      ref.textContent = item.reference;
      head.append(title, ref);
      const meta = document.createElement("p");
      meta.className = "admin-card__meta";
      meta.textContent = new Date(item.created_at).toLocaleString();
      const definitions = document.createElement("dl");
      appendDefinition(definitions, "Name", item.name);
      appendDefinition(definitions, "Organisation", item.organisation);
      appendDefinition(definitions, "Email", item.email, `mailto:${item.email}`);
      appendDefinition(definitions, "Telephone", item.phone, item.phone ? `tel:${item.phone}` : "");
      appendDefinition(definitions, "Interest", item.interest);
      const message = document.createElement("p");
      message.className = "admin-card__message";
      message.textContent = item.message;
      const actions = document.createElement("div");
      actions.className = "admin-card__actions";
      const select = document.createElement("select");
      select.setAttribute("aria-label", `Status for ${item.reference}`);
      ["new", "in-progress", "resolved"].forEach(value => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value === "in-progress" ? "In progress" : value[0].toUpperCase() + value.slice(1);
        option.selected = value === item.status;
        select.append(option);
      });
      const update = document.createElement("button");
      update.type = "button";
      update.className = "btn btn--outline";
      update.textContent = "Update status";
      update.addEventListener("click", () => updateAdminItem(item.id, select.value, update));
      actions.append(select, update);
      card.append(head, meta, definitions, message, actions);
      list.append(card);
    });
  }

  async function loadAdminItems() {
    const endpoint = config().adminEndpoint;
    const status = $("[data-admin-filter]")?.value || "all";
    const state = $("[data-admin-state]");
    if (!endpoint || !state) return;
    state.textContent = "Loading enquiries…";
    state.dataset.state = "pending";
    try {
      const response = await fetch(`${endpoint}?status=${encodeURIComponent(status)}`, { headers: { "Accept": "application/json" } });
      if (response.status === 401 || response.status === 403) {
        location.replace("/login.html?next=/admin.html");
        return;
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to load enquiries.");
      renderAdminItems(payload.items || []);
      state.textContent = `${(payload.items || []).length} ${(payload.items || []).length === 1 ? "enquiry" : "enquiries"}`;
      state.dataset.state = "success";
    } catch (error) {
      state.textContent = `${error.message} Sign in again or contact the site administrator.`;
      state.dataset.state = "error";
    }
  }

  async function updateAdminItem(id, status, button) {
    button.disabled = true;
    try {
      const response = await fetch(`${config().adminEndpoint}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!response.ok) throw new Error("Status could not be updated.");
      await loadAdminItems();
    } catch (error) {
      const state = $("[data-admin-state]");
      if (state) { state.textContent = error.message; state.dataset.state = "error"; }
    } finally { button.disabled = false; }
  }

  function initialiseAdmin() {
    if (!$("[data-admin-app]")) return;
    $("[data-admin-refresh]")?.addEventListener("click", loadAdminItems);
    $("[data-admin-filter]")?.addEventListener("change", loadAdminItems);
    loadAdminItems();
  }

  function refresh() {
    $$('[data-year]').forEach(node => { node.textContent = String(new Date().getFullYear()); });
    document.body.classList.remove("dialog-open");
    closeMenu();
    filterSearch();
  }

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const logout = target.closest('[data-auth-logout], a[href*="/cdn-cgi/access/logout"]');
    if (logout) {
      event.preventDefault();
      fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } })
        .finally(() => location.replace("/login.html"));
      return;
    }
    if (target.closest("[data-search-open]")) { openSearch(); return; }
    if (target.closest("[data-search-close]")) { closeSearch(); return; }
    const insightFilter = target.closest('[data-insight-filter]');
    if (insightFilter) { filterInsights(insightFilter.getAttribute('data-insight-filter') || 'all'); return; }
    if (target.closest(".search-results a")) closeSearch();
    const dialog = $("#site-search");
    if (target === dialog && dialog.open) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeSearch();
    }
    const button = target.closest("[data-menu-toggle]");
    if (button) {
      const open = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      $("#primary-navigation")?.classList.toggle("is-open", open);
      return;
    }
    if (target.closest("#primary-navigation a") || !target.closest(".site-header")) closeMenu();
  });

  document.addEventListener("input", event => {
    if (event.target instanceof HTMLInputElement && event.target.id === "site-search-input") filterSearch(event.target.value);
  });
  document.addEventListener("close", event => {
    if (event.target instanceof Element && event.target.id === "site-search") {
      document.body.classList.remove("dialog-open");
      if (searchOpener instanceof HTMLElement && searchOpener.isConnected) searchOpener.focus();
      searchOpener = null;
    }
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && $("#site-search")?.open) { event.preventDefault(); closeSearch(); return; }
    if (event.key === "Escape" && $("[data-menu-toggle]")?.getAttribute("aria-expanded") === "true") closeMenu(true);
    const editable = event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true]");
    if (event.key === "/" && !editable && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); openSearch(); }
  });
  document.addEventListener("focusin", event => {
    if ($("[data-menu-toggle]")?.getAttribute("aria-expanded") === "true" && event.target instanceof Element && !event.target.closest(".site-header")) closeMenu();
  });
  window.addEventListener("resize", () => { if (window.innerWidth > 860) closeMenu(); }, { passive: true });
  window.TorshSite = Object.freeze({ refresh, closeMenu, openSearch, closeSearch, loadAdminItems });

  function start() { refresh(); initialiseEnquiryForm(); initialiseAdmin(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
