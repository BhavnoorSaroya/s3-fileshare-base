(async function () {
  const urlParams = new URLSearchParams(window.location.search);
  const qrRaw = urlParams.get('qr');

  if (!qrRaw) return;

  const id = qrRaw.replace(/\D/g, '');

  if (!id) return;

  const projectContent = document.getElementById('projectContent');

  if (!projectContent) return;

  function createFixedControl({
    id,
    text,
    side,
    background = '#ff2e2eff',
    isAnchor = false
  }) {
    const el = document.createElement(isAnchor ? 'a' : 'button');

    el.id = id;
    el.textContent = text;

    el.style.position = 'fixed';
    el.style.bottom = '0';
    el.style[side] = '0';
    el.style.padding = '16px';
    el.style.zIndex = '100';

    if (isAnchor) {
      el.href = '#';
      el.style.color = '#0066cc';
      el.style.background = '#fff';
      el.style.textDecoration = 'underline';
    } else {
      el.style.border = '0';
      el.style.background = background;
    }

    document.body.appendChild(el);

    return el;
  }

  let currentView = 'content';

  const views = {
    content: projectContent,
    upload: null
  };

  function updateLabels() {
    if (uploadToggle) {
      uploadToggle.textContent =
        currentView === 'upload'
          ? 'Hide Uploads'
          : 'Upload Files';
    }
  }

  function showView(view) {
    if (views.upload) {
      views.upload.style.display = 'none';
    }

    projectContent.style.display = 'none';

    switch (view) {
      case 'upload':
        views.upload.style.display = 'block';
        break;

      default:
        projectContent.style.display = '';
        view = 'content';
    }

    currentView = view;
    updateLabels();
  }

  function createIframe(src) {
    const iframe = document.createElement('iframe');

    iframe.src = src;
    iframe.style.display = 'none';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';

    projectContent.insertAdjacentElement('afterend', iframe);

    return iframe;
  }

  let uploadToggle = null;

  async function isUploadAuthenticated() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch('https://s3download.fly.dev/checkauth', {
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return false;
      }

      const payload = await response.json();
      return Boolean(payload && payload.authenticated);
    } catch {
      return false;
    }
  }

  if (await isUploadAuthenticated()) {
    uploadToggle = createFixedControl({
      id: 'fileuploadtoggle',
      text: 'Upload Files',
      side: 'left',
      isAnchor: true
    });

    uploadToggle.addEventListener('click', (e) => {
      e.preventDefault();

      if (!views.upload) {
        views.upload = createIframe(
          `https://s3download.fly.dev/${id}/upload`
        );
      }

      if (currentView === 'upload') {
        showView('content');
      } else {
        showView('upload');
      }
    });

    updateLabels();
  }
})();
