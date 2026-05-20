const id = location.pathname.split("/").filter(Boolean)[0];
if (!id || !/^\d{4,5}$/.test(id)) {
  document.getElementById("nsLabel").textContent = "You need to access this page via a Google Sheet";
} else {
  document.getElementById("nsLabel").textContent = `Namespace ${id}`;
}

const fileList = document.getElementById("fileList");
const toasts = document.getElementById("toasts");

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
  } catch (err) {
    t.fail(err.message || "Download failed");
  }
}

async function render() {
  const data = await getFiles();
  fileList.innerHTML = "";

  if (!data.files.length) {
    fileList.innerHTML = `<div class="small">No files yet.</div>`;
    return;
  }

  for (const file of data.files) {
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `
      <div class="file-meta">
        <div class="file-name">${file.name}</div>
        <div class="file-sub">${formatBytes(file.size)} • ${new Date(file.lastModified).toLocaleString()}</div>
      </div>
      <div>
        <button>Download</button>
      </div>
    `;

    row.querySelector("button").addEventListener("click", () => {
      progressiveDownload(file.name);
    });

    fileList.appendChild(row);
  }
}

render();