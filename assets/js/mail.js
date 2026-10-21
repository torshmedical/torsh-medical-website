(() => {
  "use strict";

  const app = document.querySelector("[data-mail-app]");
  if (!app) return;

  const config = window.TORSH_CONFIG || {};
  const endpoint = config.mailEndpoint || "/api/mail";
  const list = app.querySelector("[data-mail-list]");
  const reader = app.querySelector("[data-mail-reader]");
  const status = app.querySelector("[data-mail-state]");
  const heading = app.querySelector("[data-mail-heading]");
  const search = app.querySelector("[data-mail-search]");
  const sidebar = app.querySelector("[data-mail-sidebar]");
  const composeDialog = app.querySelector("[data-compose-dialog]");
  const composeForm = app.querySelector("[data-compose-form]");
  const composeStatus = app.querySelector("[data-compose-state]");
  const fileList = app.querySelector("[data-compose-files]");
  const folderLabels = Object.freeze({ inbox: "Inbox", starred: "Starred", sent: "Sent", trash: "Trash" });
  const state = { folder: "inbox", query: "", messages: [], identity: "", selectedId: "" };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatDate(value, detailed = false) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();
    const sameDay = date.toDateString() === now.toDateString();
    if (detailed) return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
    if (sameDay) return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(date);
  }

  async function api(path, options = {}) {
    const response = await fetch(`${endpoint}${path}`, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "The mail service could not complete that request.");
    return payload;
  }

  function showState(message, kind = "") {
    status.textContent = message;
    status.dataset.state = kind;
    status.hidden = !message;
  }

  function emptyReader() {
    reader.replaceChildren();
    const box = element("div", "mail-empty");
    box.append(element("h2", "", "Select a message"), element("p", "", "Choose a conversation from the list to read it here."));
    reader.append(box);
  }

  function renderMessages() {
    list.replaceChildren();
    if (!state.messages.length) {
      const empty = element("div", "mail-list-empty");
      empty.append(element("strong", "", `No messages in ${folderLabels[state.folder].toLowerCase()}`), element("p", "", state.query ? "Try a different search." : "New messages will appear here."));
      list.append(empty);
      return;
    }
    for (const message of state.messages) {
      const row = element("button", `mail-row${message.is_read ? "" : " is-unread"}${message.id === state.selectedId ? " is-selected" : ""}`);
      row.type = "button";
      row.dataset.messageId = message.id;
      row.setAttribute("aria-label", `${message.subject || "No subject"} from ${message.correspondent}`);
      const star = element("span", `mail-row__star${message.is_starred ? " is-starred" : ""}`, message.is_starred ? "★" : "☆");
      star.setAttribute("aria-hidden", "true");
      const content = element("span", "mail-row__content");
      const top = element("span", "mail-row__top");
      top.append(element("strong", "", message.correspondent || "Unknown sender"), element("time", "", formatDate(message.message_at)));
      const subject = element("span", "mail-row__subject", message.subject || "(No subject)");
      const preview = element("span", "mail-row__preview", message.preview || "");
      content.append(top, subject, preview);
      if (message.has_attachments) content.append(element("span", "mail-row__attachment", "Attachment"));
      row.append(star, content);
      row.addEventListener("click", () => openMessage(message.id));
      list.append(row);
    }
  }

  async function loadMessages() {
    showState("Loading mail…");
    try {
      const params = new URLSearchParams({ folder: state.folder });
      if (state.query) params.set("q", state.query);
      const payload = await api(`/messages?${params}`);
      state.messages = payload.items || [];
      renderMessages();
      const unread = Number(payload.unread || 0);
      const badge = app.querySelector("[data-mail-unread]");
      badge.textContent = String(unread);
      badge.hidden = unread < 1;
      showState("");
    } catch (error) {
      showState(error.message, "error");
      list.replaceChildren();
    }
  }

  function addressLine(message) {
    const wrap = element("div", "mail-reader__address");
    wrap.append(element("strong", "", message.from_name || message.from_email), element("span", "", `<${message.from_email}>`));
    const recipients = [message.to?.length ? `to ${message.to.join(", ")}` : "", message.cc?.length ? `cc ${message.cc.join(", ")}` : ""].filter(Boolean).join(" · ");
    if (recipients) wrap.append(element("small", "", recipients));
    return wrap;
  }

  async function patchMessage(id, values) {
    await api(`/messages/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(values) });
    await loadMessages();
    if (state.selectedId === id && !values.trashed) await openMessage(id, false);
  }

  function actionButton(label, handler, className = "") {
    const button = element("button", `mail-action ${className}`, label);
    button.type = "button";
    button.addEventListener("click", handler);
    return button;
  }

  async function openMessage(id, markRead = true) {
    state.selectedId = id;
    renderMessages();
    reader.replaceChildren(element("p", "mail-reader__loading", "Loading message…"));
    try {
      const message = await api(`/messages/${encodeURIComponent(id)}`);
      reader.replaceChildren();
      const head = element("header", "mail-reader__head");
      const title = element("div", "");
      title.append(element("p", "mail-reader__label", message.direction === "outbound" ? "Sent message" : "Received message"), element("h2", "", message.subject || "(No subject)"));
      const actions = element("div", "mail-reader__actions");
      actions.append(
        actionButton("Back", () => {
          state.selectedId = "";
          emptyReader();
          renderMessages();
        }, "mail-reader__back"),
        actionButton(message.is_starred ? "Unstar" : "Star", () => patchMessage(id, { starred: !message.is_starred })),
        actionButton(message.trashed ? "Restore" : "Move to trash", () => patchMessage(id, { trashed: !message.trashed }))
      );
      head.append(title, actions);
      const meta = element("div", "mail-reader__meta");
      meta.append(addressLine(message), element("time", "", formatDate(message.message_at, true)));
      const body = element("div", "mail-reader__body");
      body.textContent = message.text_body || "This message has no text body.";
      reader.append(head, meta, body);
      if (message.attachments?.length) {
        const attachments = element("section", "mail-reader__attachments");
        attachments.append(element("h3", "", "Attachments"));
        const links = element("div", "");
        for (const attachment of message.attachments) {
          const link = element("a", "mail-attachment", attachment.filename || "Attachment");
          link.href = `${endpoint}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachment.id)}`;
          link.append(element("small", "", `${attachment.content_type} · ${Math.max(1, Math.round(attachment.size / 1024))} KB`));
          links.append(link);
        }
        attachments.append(links);
        reader.append(attachments);
      }
      const footer = element("footer", "mail-reader__footer");
      if (message.direction === "inbound") footer.append(actionButton("Reply", () => openComposer(message), "mail-action--primary"));
      reader.append(footer);
      if (markRead && !message.is_read) await patchMessage(id, { read: true });
    } catch (error) {
      reader.replaceChildren(element("p", "mail-reader__error", error.message));
    }
  }

  function splitAddresses(value) {
    return value.split(/[;,]/).map(item => item.trim()).filter(Boolean);
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
      reader.readAsDataURL(file);
    });
  }

  function updateFileList() {
    fileList.replaceChildren();
    const files = [...composeForm.elements.attachments.files];
    for (const file of files) fileList.append(element("li", "", `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB`));
  }

  function openComposer(replyTo = null) {
    composeForm.reset();
    fileList.replaceChildren();
    composeStatus.textContent = "";
    composeForm.dataset.replyId = replyTo?.id || "";
    if (replyTo) {
      composeForm.elements.to.value = replyTo.from_email;
      composeForm.elements.subject.value = /^re:/i.test(replyTo.subject || "") ? replyTo.subject : `Re: ${replyTo.subject || ""}`;
    }
    if (typeof composeDialog.showModal === "function") composeDialog.showModal();
    else composeDialog.setAttribute("open", "");
    composeForm.elements.to.focus();
  }

  function closeComposer() {
    if (typeof composeDialog.close === "function") composeDialog.close();
    else composeDialog.removeAttribute("open");
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!composeForm.reportValidity()) return;
    const files = [...composeForm.elements.attachments.files];
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > 4 * 1024 * 1024) {
      composeStatus.textContent = "Attachments must total no more than 4 MB.";
      composeStatus.dataset.state = "error";
      return;
    }
    const submit = composeForm.querySelector('[type="submit"]');
    submit.disabled = true;
    composeStatus.textContent = "Sending…";
    composeStatus.dataset.state = "";
    try {
      const attachments = await Promise.all(files.map(async file => ({
        filename: file.name.slice(0, 180),
        type: file.type || "application/octet-stream",
        content: await readFile(file)
      })));
      await api("/send", { method: "POST", body: JSON.stringify({
        to: splitAddresses(composeForm.elements.to.value),
        cc: splitAddresses(composeForm.elements.cc.value),
        bcc: splitAddresses(composeForm.elements.bcc.value),
        subject: composeForm.elements.subject.value,
        text: composeForm.elements.text.value,
        in_reply_to_id: composeForm.dataset.replyId || "",
        attachments
      }) });
      composeStatus.textContent = "Sent.";
      composeStatus.dataset.state = "success";
      setTimeout(closeComposer, 450);
      if (state.folder === "sent") await loadMessages();
    } catch (error) {
      composeStatus.textContent = error.message;
      composeStatus.dataset.state = "error";
    } finally {
      submit.disabled = false;
    }
  }

  async function loadProfile() {
    try {
      const profile = await api("/profile");
      state.identity = profile.email;
      app.querySelector("[data-mail-identity]").textContent = profile.email;
      app.querySelector("[data-compose-from]").textContent = profile.mailbox;
      app.querySelector("[data-mail-avatar]").textContent = (profile.email || "T").charAt(0).toUpperCase();
      await loadMessages();
    } catch (error) {
      showState(error.message, "error");
    }
  }

  for (const button of app.querySelectorAll("[data-mail-folder]")) {
    button.addEventListener("click", () => {
      state.folder = button.dataset.mailFolder;
      state.selectedId = "";
      heading.textContent = folderLabels[state.folder];
      app.querySelectorAll("[data-mail-folder]").forEach(item => item.classList.toggle("is-active", item === button));
      sidebar.classList.remove("is-open");
      emptyReader();
      loadMessages();
    });
  }

  let searchTimer;
  search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = search.value.trim(); loadMessages(); }, 280);
  });
  app.querySelector("[data-mail-refresh]").addEventListener("click", loadMessages);
  app.querySelector("[data-mail-menu]").addEventListener("click", () => sidebar.classList.toggle("is-open"));
  app.querySelector("[data-compose-open]").addEventListener("click", () => openComposer());
  app.querySelector("[data-compose-close]").addEventListener("click", closeComposer);
  app.querySelector("[data-compose-cancel]").addEventListener("click", closeComposer);
  composeForm.elements.attachments.addEventListener("change", updateFileList);
  composeForm.addEventListener("submit", sendMessage);
  composeDialog.addEventListener("click", event => { if (event.target === composeDialog) closeComposer(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") sidebar.classList.remove("is-open"); });

  loadProfile();
})();
