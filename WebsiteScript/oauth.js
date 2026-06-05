(async function () {
  const urlParams = new URLSearchParams(window.location.search);
  const qrRaw = urlParams.get('code');

  if (!qrRaw) return;

  const id = qrRaw.replace(/\D/g, '');

  if (!id) return;

  const projectContent = document.querySelector('iframe');

  if (!projectContent) return;

  // So we don't scroll a tiny viewbox on mobile
  document.getElementsByClassName("embed-wrapper")[0].style.height = '100%'

  function createFixedControl({
    id,
    text,
    side,
    background,
    color = '#FFFFFF',
    textDecoration = 'none'
  }) {
    const el = document.createElement('a');

    el.id = id;
    el.textContent = text;
    el.href = '#';

    el.style.display = 'inline-block';
    // el.style.padding = '10px';
    el.style.zIndex = '100';
    el.style.borderRadius = '10px';
    // el.style.transform = 'translateX(-1px)';
    el.style.height = '40px';
    el.style.paddingInline = '10px'
    el.style.lineHeight = '40px';
    el.style.color = color;
    el.style.background = background;
    el.style.textDecoration = textDecoration;

    const iconsdiv = document.getElementsByClassName('card-share-icons')[0];

    if (!iconsdiv) return null;

    // if (side === 'left') {
      iconsdiv.prepend(el);
    // } else {
      iconsdiv.prepend(el);
    // }

    return el;
  }

  let currentView = 'content';

  const views = {
    content: projectContent,
    download: null,
    upload: null
  };

  function updateLabels() {
    if (downloadToggle) {
      downloadToggle.textContent =
        currentView === 'download'
          ? 'Hide Downloads'
          : 'Download Camp Files';
    }

    if (uploadToggle) {
      uploadToggle.textContent =
        currentView === 'upload'
          ? 'Hide Uploads'
          : 'Upload Files';
    }
  }

  function showView(view) {
    const viewer = document.getElementsByClassName('container')[0].firstElementChild



    if (views.download) {
      views.download.style.display = 'none';
    }

    if (views.upload) {
      views.upload.style.display = 'none';
    }

    projectContent.style.display = 'none';

    switch (view) {
      case 'download':
        viewer.style.height = '80vh'
        views.download.style.display = 'block';
        break;

      case 'upload':
        viewer.style.height = '80vh'
        views.upload.style.display = 'block';
        break;

      default:
        viewer.style.height = ''
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

  let downloadToggle = null;
  let uploadToggle = null;

  const internalBaseUrl = 'https://byte.5ab.dev';
  const externalBaseUrl = 'https://s3download.fly.dev';

  async function canReachInternalHost() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      await fetch(`${internalBaseUrl}/`, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal
      });

      clearTimeout(timeout);
      return true;
    } catch {
      return false;
    }
  }

  async function isUploadAuthenticated() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${externalBaseUrl}/checkauth`, {
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

  try {
    const listResponse = await fetch(
      `${externalBaseUrl}/api/list/${id}`
    );

    const listData = await listResponse.json();

    const hasFiles =
      listData &&
      Array.isArray(listData.files) &&
      listData.files.length > 0;

    if (hasFiles) {
      downloadToggle = createFixedControl({
        id: 'filedownloadtoggle',
        text: 'Download Camp Files',
        side: 'right',
        background: '#543cbf'
      });

      if (downloadToggle) {
        downloadToggle.addEventListener('click', (e) => {
          e.preventDefault();

          if (!views.download) {
            views.download = createIframe(`${externalBaseUrl}/${id}`);
          }

          if (currentView === 'download') {
            showView('content');
          } else {
            showView('download');
          }
        });
      }
    }
  } catch {
    downloadToggle = null;
  }

  let uploadBaseUrl = null;
  let uploadButtonBackground = '#FFFFFF';
  let uploadButtonColor = '#000000';
  let uploadButtonTextDecoration = 'underline';

  if (await canReachInternalHost()) {
    uploadBaseUrl = internalBaseUrl;
    uploadButtonBackground = '#0066cc';
    uploadButtonColor = '#FFFFFF';
    uploadButtonTextDecoration = 'none';
  } else if (await isUploadAuthenticated()) {
    uploadBaseUrl = externalBaseUrl;
  }

  if (uploadBaseUrl) {
    uploadToggle = createFixedControl({
      id: 'fileuploadtoggle',
      text: 'Upload Files',
      side: 'left',
      background: uploadButtonBackground,
      color: uploadButtonColor,
      textDecoration: uploadButtonTextDecoration
    });

    if (uploadToggle) {
      uploadToggle.addEventListener('click', (e) => {
        e.preventDefault();

        if (!views.upload) {
          views.upload = createIframe(
            `${uploadBaseUrl}/${id}/upload`
          );
        }

        if (currentView === 'upload') {
          showView('content');
        } else {
          showView('upload');
        }
      });
    }
  }

  updateLabels();
})();
