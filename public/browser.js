const id = location.pathname.split("/").filter(Boolean)[0];
if (!id || !/^\d{4,5}$/.test(id)) {
  document.getElementById("nsLabel").textContent = "You need to access this page via a Google Sheet";
} else {
  document.getElementById("nsLabel").textContent = `QR code ${id}`;
}

const fileList = document.getElementById("fileList");
const toasts = document.getElementById("toasts");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const downloadHint = document.getElementById("downloadHint");

let files = [];
let activeDownloads = new Set();
let bulkDownloadActive = false;

function escapeHtml(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function updateHint(message) {
  if (downloadHint) downloadHint.textContent = message;
}

function updateDownloadAllButton() {
  if (!downloadAllBtn) return;

  if (!files.length) {
    downloadAllBtn.disabled = true;
    downloadAllBtn.textContent = "Download all";
    return;
  }

  if (bulkDownloadActive) {
    downloadAllBtn.disabled = true;
    return;
  }

  downloadAllBtn.disabled = activeDownloads.size > 0;
  downloadAllBtn.textContent = "Download all";
}

function getFileRow(name) {
  return Array.from(fileList.querySelectorAll(".file-row")).find((row) => row.dataset.fileName === name) || null;
}

function setFileRowState(name, isBusy) {
  const row = getFileRow(name);
  if (!row) return;
  row.disabled = isBusy;
  row.classList.toggle("is-downloading", isBusy);

  const status = row.querySelector(".file-affordance");
  if (status) {
    status.innerHTML = isBusy ? "Downloading..." : `        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-down-icon lucide-file-down"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>`;
  }
}

function setLoadingState() {
  fileList.innerHTML = `<div class="file-empty">Loading files...</div>`;
  updateHint("Loading files...");
  if (downloadAllBtn) downloadAllBtn.disabled = true;
}

function setEmptyState(message) {
  fileList.innerHTML = `<div class="file-empty">${escapeHtml(message)}</div>`;
  updateHint("Files will appear here when they are ready.");
  updateDownloadAllButton();
}

function toast(title, detail) {
  const el = document.createElement("div");
  el.className = "toast";
  el.innerHTML = `
    <strong>${title}</strong>
    <div class="small">${detail || ""}</div>
    <div class="progress"><div></div></div>
  `;
  toasts.appendChild(el);

  const bar = el.querySelector(".progress > div");
  return {
    setProgress(pct) {
      bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
    },
    setDetail(msg) {
      el.querySelector(".small").textContent = msg;
    },
    done(msg = "Done") {
      el.querySelector(".small").textContent = msg;
      bar.style.width = "100%";
      setTimeout(() => el.remove(), 2500);
    },
    fail(msg = "Failed") {
      el.querySelector(".small").textContent = msg;
    }
  };
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

async function getFiles() {
  const res = await fetch(`/api/list/${id}`);
  return await res.json();
}

async function getDownloadUrl(name) {
  const res = await fetch(`/api/download-url/${id}/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error("Could not get download URL");
  return await res.json();
}

async function progressiveDownload(name) {
  if (activeDownloads.has(name)) return false;

  activeDownloads.add(name);
  setFileRowState(name, true);
  updateDownloadAllButton();

  const t = toast(`Downloading ${name}`, "Preparing...");
  try {
    const { url } = await getDownloadUrl(name);
    const res = await fetch(url);

    if (!res.ok || !res.body) {
      throw new Error(`Download failed: ${res.status}`);
    }

    const total = Number(res.headers.get("content-length") || 0);
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    const reader = res.body.getReader();

    let received = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;

      if (total > 0) {
        t.setProgress((received / total) * 100);
        t.setDetail(`${formatBytes(received)} / ${formatBytes(total)}`);
      } else {
        t.setDetail(`${formatBytes(received)}`);
      }
    }

    const blob = new Blob(chunks, { type: contentType });
    const a = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);

    a.href = objectUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    t.done("Saved to browser");
    return true;
  } catch (err) {
    t.fail(err.message || "Download failed");
    return false;
  } finally {
    activeDownloads.delete(name);
    setFileRowState(name, false);
    updateDownloadAllButton();
  }
}

async function downloadAllFiles() {
  if (bulkDownloadActive || !files.length) return;

  bulkDownloadActive = true;
  updateHint(`Downloading ${files.length} file${files.length === 1 ? "" : "s"}...`);

  try {
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      if (downloadAllBtn) {
        downloadAllBtn.textContent = `Downloading ${index + 1}/${files.length}...`;
      }
      await progressiveDownload(file.name);
    }
    updateHint("Click any file to download again.");
  } finally {
    bulkDownloadActive = false;
    updateDownloadAllButton();
  }
}

async function render() {
  setLoadingState();

  try {
    const data = await getFiles();
    files = Array.isArray(data.files) ? data.files : [];
    fileList.innerHTML = "";

    if (!files.length) {
      setEmptyState("No files yet.");
      return;
    }

    updateHint("Click any file to download, or grab everything at once.");

    for (const file of files) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "file-row";
      row.dataset.fileName = file.name;
      row.setAttribute("aria-label", `Download ${file.name}`);
      row.innerHTML = `
        <div class="file-meta">
          <div class="file-name">${escapeHtml(file.name)}</div>
        <!--  <div class="file-sub">${formatBytes(file.size)} • ${new Date(file.lastModified).toLocaleString()}</div> -->
        </div>
        <div class="file-affordance" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-down-icon lucide-file-down"><path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>
        </div>
      `;

      row.addEventListener("click", () => {
        progressiveDownload(file.name);
      });

      fileList.appendChild(row);
    }

    updateDownloadAllButton();
  } catch (err) {
    files = [];
    setEmptyState("Could not load files.");
    toast("Could not load files", err.message || "Please try again.").fail(err.message || "Please try again.");
  }
}

if (downloadAllBtn) {
  downloadAllBtn.addEventListener("click", downloadAllFiles);
}

render();
