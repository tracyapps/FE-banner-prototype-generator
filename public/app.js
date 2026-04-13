const form = document.querySelector("#extract-form");
const statusNode = document.querySelector("#status");
const resultsNode = document.querySelector("#results");
const notesNode = document.querySelector("#notes");
const previewFrame = document.querySelector("#preview-frame");
const refreshPreviewButton = document.querySelector("#refresh-preview");

const fields = {
  title: document.querySelector("#pen-title"),
  externalCss: document.querySelector("#external-css"),
  html: document.querySelector("#html-panel"),
  css: document.querySelector("#css-panel"),
  js: document.querySelector("#js-panel"),
};

const meta = {
  resultTitle: document.querySelector("#result-title"),
  sourceUrl: document.querySelector("#source-url"),
  primaryCss: document.querySelector("#primary-css"),
  heroSelector: document.querySelector("#hero-selector"),
  codepenData: document.querySelector("#codepen-data"),
};

let latestResult = null;

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const url = String(formData.get("url") || "").trim();

  if (!url) {
    setStatus("Enter a marketplace URL first.", true);
    return;
  }

  setStatus("Inspecting the live site and building the CodePen payload...");
  resultsNode.classList.add("is-hidden");

  try {
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Unable to inspect that site.");
    }

    latestResult = payload;
    hydrateForm(payload);
    setStatus("Prototype extracted. Review the generated panels, then open it in CodePen.");
    resultsNode.classList.remove("is-hidden");
    renderPreview();
  } catch (error) {
    setStatus(error.message || "Unable to inspect that site.", true);
  }
});

refreshPreviewButton.addEventListener("click", () => {
  renderPreview();
});

Object.values(fields).forEach((field) => {
  field.addEventListener("input", syncCodepenPayload);
});

function hydrateForm(payload) {
  meta.resultTitle.textContent = payload.title;
  meta.sourceUrl.textContent = payload.sourceUrl;
  meta.primaryCss.textContent = payload.primaryStylesheet || "Manual CSS selection needed";
  meta.heroSelector.textContent = payload.heroSelectorUsed;

  fields.title.value = payload.title;
  fields.externalCss.value = payload.externalCssUrls.join("\n");
  fields.html.value = payload.html;
  fields.css.value = payload.css;
  fields.js.value = payload.js;

  notesNode.innerHTML = "";
  payload.notes.forEach((note) => {
    const item = document.createElement("p");
    item.className = "note";
    item.textContent = note;
    notesNode.appendChild(item);
  });

  syncCodepenPayload();
}

function syncCodepenPayload() {
  if (!latestResult) {
    return;
  }

  const payload = {
    title: fields.title.value.trim() || latestResult.title,
    description: latestResult.description,
    private: false,
    html: fields.html.value,
    css: fields.css.value,
    js: fields.js.value,
    css_external: collectExternalCss().join(";"),
    css_pre_processor: "none",
    js_pre_processor: "none",
    layout: "left",
  };

  meta.codepenData.value = JSON.stringify(payload);
}

function renderPreview() {
  const cssLinks = collectExternalCss()
    .map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join("\n");

  const srcdoc = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${cssLinks}
    <style>${fields.css.value}</style>
  </head>
  <body>
    ${fields.html.value}
    <script>${fields.js.value.replace(/<\/script>/gi, "<\\/script>")}<\/script>
  </body>
</html>`;

  previewFrame.srcdoc = srcdoc;
}

function collectExternalCss() {
  return fields.externalCss.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function setStatus(message, isError = false) {
  statusNode.textContent = message;
  statusNode.classList.toggle("is-error", isError);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
