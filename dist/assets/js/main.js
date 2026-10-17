/* TORSH v4.0 — Progressive enhancement, with no external dependencies.
 * Core pages, product links and content work without JavaScript.
 * Search filters existing page links in the browser: no network request,
 * cookies, tracking, browser storage or enquiry submission is performed.
 */
(() => {
  "use strict";
  document.documentElement.classList.replace("no-js", "js");
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const emailIsValid = value => typeof value === "string" && /^[^\s@<>?]+@[^\s@<>?]+\.[^\s@<>?]+$/.test(value.trim());
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
    $$("[data-search-item]").forEach(item => {
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
      card.hidden = category !== 'all' && card.getAttribute('data-category') !== category;
    });
    $$('[data-insight-filter]').forEach(button => {
      const active = button.getAttribute('data-insight-filter') === category;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
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
    filterInsights('all');
  }

  function closeSearch() {
    const dialog = $("#site-search");
    if (dialog?.open) dialog.close();
    document.body.classList.remove("dialog-open");
  }

  function refresh() {
    const config = window.TORSH_CONFIG || {};
    $$("[data-year]").forEach(node => { node.textContent = String(new Date().getFullYear()); });
    const ready = emailIsValid(config.contactEmail);
    $$("[data-contact-pending]").forEach(node => { node.hidden = ready; });
    $$("[data-contact-ready]").forEach(node => { node.hidden = !ready; });
    if (ready) {
      const email = config.contactEmail.trim();
      const href = "mailto:" + email + "?subject=" + encodeURIComponent(config.contactSubject || "Enquiry — TORSH");
      $$("[data-contact-link]").forEach(node => { node.setAttribute("href", href); });
      $$("[data-contact-email]").forEach(node => { node.textContent = email; node.setAttribute("href", href); });
    } else {
      $$("[data-contact-link], [data-contact-email]").forEach(node => { node.removeAttribute("href"); });
    }
    document.body.classList.remove("dialog-open");
    closeMenu();
    filterSearch();
  }

  document.addEventListener("click", event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-search-open]")) { openSearch(); return; }
    if (target.closest("[data-search-close]")) { closeSearch(); return; }
    const insightFilter = target.closest('[data-insight-filter]');
    if (insightFilter) {
      filterInsights(insightFilter.getAttribute('data-insight-filter') || 'all');
      return;
    }
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
  // The native dialog contains focus. Capture the non-bubbling close event
  // to restore the opener and release scroll locking.
  document.addEventListener("close", event => {
    if (event.target instanceof Element && event.target.id === "site-search") {
      document.body.classList.remove("dialog-open");
      if (searchOpener instanceof HTMLElement && searchOpener.isConnected) searchOpener.focus();
      searchOpener = null;
    }
  }, true);
  document.addEventListener("keydown", event => {
    // Close on the first Esc press, including when a search input has text.
    if (event.key === "Escape" && $("#site-search")?.open) {
      event.preventDefault(); closeSearch(); return;
    }
    if (event.key === "Escape" && $("[data-menu-toggle]")?.getAttribute("aria-expanded") === "true") closeMenu(true);
    const editable = event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable=true]");
    if (event.key === "/" && !editable && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault(); openSearch();
    }
  });
  document.addEventListener("focusin", event => {
    if ($("[data-menu-toggle]")?.getAttribute("aria-expanded") === "true" && event.target instanceof Element && !event.target.closest(".site-header")) closeMenu();
  });
  window.addEventListener("resize", () => { if (window.innerWidth > 860) closeMenu(); }, { passive: true });
  // Used by the optional, self-contained review HTML when changing pages.
  window.TorshSite = Object.freeze({ refresh, closeMenu, openSearch, closeSearch });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", refresh, { once: true });
  else refresh();
})();
