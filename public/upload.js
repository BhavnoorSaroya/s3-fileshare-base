const id = location.pathname.split("/").filter(Boolean)[0];
const inIframe = window.self !== window.top;

if (inIframe) {
  // document.body.classList.add("iframe-minimal");
  console.log("In iframe")
}

document.getElementById("nsLabel").textContent = `QR code ${id}`;
document.getElementById("uploadHint").textContent =
  inIframe
    ? "Drop files or folders here to upload"
    : "Files upload directly to object storage using short-lived, signed, upload URLs.";

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const toasts = document.getElementById("toasts");
const fileList = document.getElementById("fileList");

function createFolderPickerInput() {
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  input.setAttribute("webkitdirectory", "");
  input.style.display = "none";
  document.body.appendChild(input);
  return input;
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
      <div class="file-actions">
      <!--  <a href="/${id}/" style="color: var(--accent)">View</a> -->
        <button class="delete-btn" data-filename="${file.name}">Delete</button>
      </div>
    `;
    fileList.appendChild(row);
  }

  fileList.querySelectorAll(".delete-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const filename = btn.dataset.filename;
      if (!confirm(`Delete "${filename}"?`)) return;
      btn.disabled = true;
      btn.textContent = "Deleting...";
      try {
        const res = await fetch(`/api/delete/${id}/${encodeURIComponent(filename)}`, { method: "POST" });
        if (!res.ok) throw new Error("Delete failed");
        await loadFiles();
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = "Delete";
      }
    });
  });
}


async function signUpload(file) {
  const filepath = file._relativePath || file.webkitRelativePath || file.name;
  const res = await fetch("/api/sign-upload", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id,
      filename: file.name,
      filepath,
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
    const displayName = file.webkitRelativePath || file.name;
    const t = toast(`Uploading ${displayName}`, "Preparing upload...");
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

async function readDirectoryEntry(dirEntry) {
  const files = [];
  const reader = dirEntry.createReader();
  const readEntries = () => {
    return new Promise((resolve) => {
      reader.readEntries((entries) => {
        resolve(entries);
      });
    });
  };

  let allEntries = [];
  while (true) {
    const entries = await readEntries();
    if (entries.length === 0) break;
    allEntries = allEntries.concat(entries);
  }

  for (const entry of allEntries) {
    if (entry.isFile) {
      const file = await new Promise((resolve) => {
        entry.file(resolve);
      });
      file._relativePath = entry.fullPath.replace(/^\//, "");
      files.push(file);
    } else if (entry.isDirectory) {
      const subFiles = await readDirectoryEntry(entry);
      files.push(...subFiles);
    }
  }
  return files;
}

async function getDroppedFiles(dataTransfer) {
  const files = [];
  const items = dataTransfer.items;

  if (items) {
    const entries = [];
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }

    if (entries.length > 0) {
      const isSingleFile = entries.length === 1 && entries[0].isFile;

      for (const entry of entries) {
        if (entry.isFile) {
          const file = await new Promise((resolve) => {
            entry.file(resolve);
          });
          if (isSingleFile) {
            file._relativePath = file.name;
          } else {
            file._relativePath = entry.fullPath.replace(/^\//, "");
          }
          files.push(file);
        } else if (entry.isDirectory) {
          const dirFiles = await readDirectoryEntry(entry);
          files.push(...dirFiles);
        }
      }
      return files;
    }
  }

  return [...dataTransfer.files];
}

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const files = await getDroppedFiles(e.dataTransfer);
  if (files.length) handleFiles(files);
});

fileInput.addEventListener("change", () => {
  const files = [...fileInput.files];
  if (files.length) handleFiles(files);
});

dropzone.addEventListener("click", async (e) => {
  if (e.target === fileInput) {
    return;
  }

  const wantsFolder = e.altKey || e.metaKey;
  if (!wantsFolder) {
    fileInput.click();
    return;
  }

  const folderInput = createFolderPickerInput();
  folderInput.addEventListener("change", async () => {
    const files = [...folderInput.files];
    if (files.length) {
      await handleFiles(files);
    }
    folderInput.remove();
  }, { once: true });
  folderInput.click();
});

loadFiles();
