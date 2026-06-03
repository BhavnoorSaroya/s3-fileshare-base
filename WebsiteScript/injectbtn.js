(async function () {
  //
  // =========================
  // DEBUG CONFIG
  // =========================
  //
  const DEBUG = true;
  const NS = "[file-ui]";

  function debug(...args) {
    if (DEBUG) console.log(NS, ...args);
  }

  function warn(...args) {
    if (DEBUG) console.warn(NS, ...args);
  }

  function error(...args) {
    if (DEBUG) console.error(NS, ...args);
  }

  debug("script loaded");

  //
  // =========================
  // QR PARSING
  // =========================
  //
  const urlParams = new URLSearchParams(window.location.search);
  const qrRaw = urlParams.get('code');

  debug("qrRaw:", qrRaw);

  if (!qrRaw) {
    warn("no qr param found, exiting");
    return;
  }

  const id = qrRaw.replace(/\D/g, '');

  debug("cleaned id:", id);

  if (!id) {
    warn("qr present but no numeric id extracted");
    return;
  }

  //
  // =========================
  // DOM HOOKS
  // =========================
  //
//   const projectContent = document.getElementById('projectContent');

  const projectContent = document.querySelector('iframe')


  if (!projectContent) {
    error("missing #projectContent, aborting");
    return;
  }

  const cards = document.querySelectorAll('.card');
  const controlHost = cards?.[1];

  if (!controlHost) {
    error("second .card not found, aborting UI injection");
    return;
  }

  debug("DOM hooks ready");

  //
  // =========================
  // STATE
  // =========================
  //
  let currentView = 'content';

  const views = {
    content: projectContent,
    download: null,
    upload: null
  };

  function logState(action) {
    debug("state:", {
      action,
      currentView,
      hasDownload: !!views.download,
      hasUpload: !!views.upload
    });
  }

  //
  // =========================
  // VIEW SWITCHING
  // =========================
  //
  function setView(view) {
    debug("switching view ->", view);

    if (views.download) views.download.style.display = 'none';
    if (views.upload) views.upload.style.display = 'none';

    projectContent.style.display = 'none';

    if (view === 'download') {
      views.download.style.display = 'block';
    } else if (view === 'upload') {
      views.upload.style.display = 'block';
    } else {
      projectContent.style.display = '';
      view = 'content';
    }

    currentView = view;

    logState("setView");
    updateLabels();
  }

  //
  // =========================
  // IFRAME FACTORY
  // =========================
  //
  function createIframe(src) {
    debug("creating iframe:", src);

    const iframe = document.createElement('iframe');

    iframe.src = src;
    iframe.style.display = 'none';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';

    projectContent.insertAdjacentElement('afterend', iframe);

    debug("iframe injected into DOM");

    return iframe;
  }

  //
  // =========================
  // CONTROL FACTORY
  // =========================
  //
  function createControlEl(tag, text, side) {
    debug("creating control:", { tag, text, side });

    const el = document.createElement(tag);
    el.textContent = text;

    el.style.display = 'inline-block';
    el.style.margin = '8px';
    el.style.cursor = 'pointer';

    el.style.float = side === 'left' ? 'left' : 'right';

    controlHost.appendChild(el);

    debug("control appended to .card[1]");

    return el;
  }

  //
  // =========================
  // LABEL UPDATES
  // =========================
  //
  function updateLabels() {
    if (downloadBtn) {
      downloadBtn.textContent =
        currentView === 'download'
          ? 'Hide Downloads'
          : 'Download Files';
    }

    if (uploadBtn) {
      uploadBtn.textContent =
        currentView === 'upload'
          ? 'Hide Uploads'
          : 'Upload Files';
    }

    debug("labels updated");
  }

  //
  // =========================
  // CONTROLS
  // =========================
  //
  let downloadBtn = createControlEl('button', 'Download Files', 'right');
  let uploadBtn = null;

  //
  // =========================
  // DOWNLOAD CHECK
  // =========================
  //
  async function fetchDownloads() {
    const url = `https://s3download.fly.dev/api/list/${id}`;

    debug("fetching download list:", url);

    try {
      const res = await fetch(url);
      const data = await res.json();

      debug("download response:", data);

      const hasFiles =
        data?.files && Array.isArray(data.files) && data.files.length > 0;

      debug("hasFiles:", hasFiles);

      if (!hasFiles) {
        warn("no files found -> hiding download button");
        downloadBtn.style.display = 'none';
        return;
      }

      downloadBtn.addEventListener('click', () => {
        debug("download button clicked");

        if (!views.download) {
          views.download = createIframe(
            `https://s3download.fly.dev/${id}`
          );
        }

        setView(currentView === 'download' ? 'content' : 'download');
      });

    } catch (e) {
      error("download fetch failed:", e);
      downloadBtn.style.display = 'none';
    }
  }

  //
  // =========================
  // UPLOAD CHECK
  // =========================
  //
  async function canReachUpload() {
    debug("checking upload server reachability");

    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3000);

      const res = await fetch('https://s3.bikecamp.ca/', {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(t);

      const ok = res.ok;

      debug("upload server reachable:", ok);

      return ok;
    } catch (e) {
      warn("upload server unreachable:", e.message);
      return false;
    }
  }

  async function initUpload() {
    const ok = await canReachUpload();

    if (!ok) {
      warn("upload disabled (server unreachable)");
      return;
    }

    uploadBtn = createControlEl('a', 'Upload Files', 'left');
    uploadBtn.href = '#';

    uploadBtn.addEventListener('click', (e) => {
      e.preventDefault();

      debug("upload button clicked");

      if (!views.upload) {
        views.upload = createIframe(
          `https://s3.bikecamp.ca/${id}/upload`
        );
      }

      setView(currentView === 'upload' ? 'content' : 'upload');
    });

    debug("upload control initialized");
  }

  //
  // =========================
  // INIT
  // =========================
  //
  logState("init start");

  await fetchDownloads();
  await initUpload();

  updateLabels();

  logState("init complete");
})();