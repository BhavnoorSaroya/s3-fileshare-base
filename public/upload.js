const id = location.pathname.split("/").filter(Boolean)[0];
const inIframe = window.self !== window.top;

if (inIframe) {
  document.body.classList.add("iframe-minimal");
}

document.getElementById("nsLabel").textContent = `Namespace ${id}`;
document.getElementById("uploadHint").textContent =
  inIframe
    ? "Drop files here to upload"
    : "Files upload directly to object storage using short-lived signed URLs.";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const toasts = document.getElementById("toasts");
const fileList = document.getElementById("fileList");

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
    done(msg = "Done") {
      el.querySelector(".small").textContent = msg;
      bar.style.width = "100%";
      setTimeout(() => el.remove(), 2500);
    },
    fail(msg = "Failed") {
      el.querySelector(".small").textContent = msg;
      el.remove();
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

async function loadFiles() {
  const res = await fetch(`/api/list/${id}`);
  const data = await res.json();

  fileList.innerHTML = "";
  for (const file of data.files) {
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = `
      <div class="file-meta">
        <div class="file-name">${file.name}</div>
        <div class="file-sub">${formatBytes(file.size)} • ${new Date(file.lastModified).toLocaleString()}</div>
      </div>
      <div>
        <a href="/${id}/" style="color: var(--accent)">View</a>
      </div>
    `;
    fileList.appendChild(row);
  }
}

async function signUpload(file) {
  const res = await fetch("/api/sign-upload", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id,
      filename: file.name,
      contentType: file.type || "application/octet-stream",
    }),
  });

  if (!res.ok) {
    throw new Error((await res.json()).error || "Failed to sign upload");
  }

  return await res.json();
}

function uploadWithProgress(url, file, headers, t) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);

    for (const [k, v] of Object.entries(headers || {})) {
      xhr.setRequestHeader(k, v);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        t.setProgress((e.loaded / e.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(file);
  });
}

async function handleFiles(files) {
  for (const file of files) {
    const t = toast(`Uploading ${file.name}`, "Preparing upload...");
    try {
      const signed = await signUpload(file);
      await uploadWithProgress(signed.putUrl, file, signed.headers, t);
      t.done("Uploaded");
    } catch (err) {
      t.fail(err.message || "Upload failed");
    }
  }
  await loadFiles();
}

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const files = [...e.dataTransfer.files];
  if (files.length) handleFiles(files);
});

fileInput.addEventListener("change", () => {
  const files = [...fileInput.files];
  if (files.length) handleFiles(files);
});

loadFiles();