(() => {
  "use strict";

  const app = document.querySelector("[data-auth-app]");
  if (!app) return;

  const config = window.TORSH_CONFIG || {};
  const endpoint = config.authEndpoint || "/api/auth";
  const requestForm = app.querySelector("[data-auth-request-form]");
  const verifyForm = app.querySelector("[data-auth-verify-form]");
  const emailInput = requestForm.elements.email;
  const codeInput = verifyForm.elements.code;
  const state = app.querySelector("[data-auth-state]");
  const destination = app.querySelector("[data-auth-destination]");
  let email = "";

  function nextPage() {
    const requested = new URLSearchParams(location.search).get("next");
    return requested === "/admin.html" ? "/admin.html" : "/mail.html";
  }

  function showState(message, kind = "") {
    state.textContent = message;
    state.dataset.state = kind;
  }

  async function api(path, options = {}) {
    const response = await fetch(`${endpoint}${path}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The secure sign-in service could not complete that request.");
    return payload;
  }

  async function requestCode(event) {
    event?.preventDefault();
    if (!requestForm.reportValidity()) return;
    email = emailInput.value.trim().toLowerCase();
    const button = requestForm.querySelector('[type="submit"]');
    button.disabled = true;
    showState("Sending your code…");
    try {
      const payload = await api("/request-code", { method: "POST", body: JSON.stringify({ email }) });
      destination.textContent = email;
      requestForm.hidden = true;
      verifyForm.hidden = false;
      showState(payload.message || "Check your email for the six-digit code.", "success");
      codeInput.focus();
    } catch (error) {
      showState(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function verifyCode(event) {
    event.preventDefault();
    if (!verifyForm.reportValidity()) return;
    const button = verifyForm.querySelector('[type="submit"]');
    button.disabled = true;
    showState("Checking your code…");
    try {
      await api("/verify-code", { method: "POST", body: JSON.stringify({ email, code: codeInput.value.trim() }) });
      showState("Signed in. Opening your workspace…", "success");
      location.replace(nextPage());
    } catch (error) {
      showState(error.message, "error");
      codeInput.select();
    } finally {
      button.disabled = false;
    }
  }

  requestForm.addEventListener("submit", requestCode);
  verifyForm.addEventListener("submit", verifyCode);
  app.querySelector("[data-auth-resend]").addEventListener("click", requestCode);
  app.querySelector("[data-auth-change]").addEventListener("click", () => {
    verifyForm.hidden = true;
    requestForm.hidden = false;
    codeInput.value = "";
    showState("");
    emailInput.focus();
  });
  codeInput.addEventListener("input", () => { codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6); });

  fetch(`${endpoint}/profile`, { credentials: "same-origin", headers: { Accept: "application/json" } })
    .then(response => response.ok ? response.json() : null)
    .then(profile => { if (profile?.email) location.replace(nextPage()); })
    .catch(() => {});
})();
