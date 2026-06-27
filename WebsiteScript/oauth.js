(async function () {
  const urlParams = new URLSearchParams(window.location.search);
  const qrRaw = urlParams.get('code');
  const uploadEnabledByQuery = urlParams.get('upload') === '1';

  if (!qrRaw) return;

  const id = qrRaw.replace(/\D/g, '');

  if (!id) return;

  const projectContent = document.querySelector('iframe');

  if (!projectContent) return;

  // So we don't scroll a tiny viewbox on mobile
  document.getElementsByClassName("cardr")[0].style.height = '100%'

  function createFixedControl({
    id,
    text,
    background,
    color = '#FFFFFF',
    textDecoration = 'none'
  }) {
    const el = document.createElement('a');

    el.id = id;
    el.textContent = text;
    el.href = '#';

    el.style.display = 'inline-block';
    el.style.zIndex = '100';
    el.style.borderRadius = '8px';
    el.style.height = '40px';
    el.style.paddingInline = '10px'
    el.style.marginInline = '5px'
    el.style.lineHeight = '40px';
    el.style.color = color;
    el.style.background = background;
    el.style.textDecoration = textDecoration;

    // where the share icons are
    const iconsdiv = document.getElementsByClassName('card-share-icons')[0];

    if (!iconsdiv) return null;

    iconsdiv.prepend(el);

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
    viewer.style.overflow = 'hidden'



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
    iframe.style.height = '80vh';
    iframe.style.border = 'none';
    // iframe.style.overflow = 'hidden'

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
      const timeout = setTimeout(() => controller.abort(), 1200);

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

  const uploadState = {
    enabled: uploadEnabledByQuery,
    uploadBaseUrl: null,
    buttonBackground: '#ffa7a7ff',
    buttonColor: '#000000',
    buttonTextDecoration: 'none'
  };

  function openUploadView() {
    if (!uploadState.uploadBaseUrl) {
      return;
    }

    if (!views.upload) {
      views.upload = createIframe(
        `${uploadState.uploadBaseUrl}/${id}/upload`
      );
    }

    if (currentView === 'upload') {
      showView('content');
    } else {
      showView('upload');
    }
  }

  async function initializeUploadState() {
    if (!uploadState.enabled) {
      return false;
    }

    if (await canReachInternalHost()) {
      uploadState.uploadBaseUrl = internalBaseUrl;
      uploadState.buttonBackground = '#0066cc';
      uploadState.buttonColor = '#FFFFFF';
      uploadState.buttonTextDecoration = 'none';
      return true;
    }

    uploadState.uploadBaseUrl = externalBaseUrl;
    // uploadState.shouldAuthOnClick = !isAuthenticated;
    return true;
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

  if (await initializeUploadState()) {
    uploadToggle = createFixedControl({
      id: 'fileuploadtoggle',
      text: 'Upload Files',
      background: uploadState.buttonBackground,
      color: uploadState.buttonColor,
      textDecoration: uploadState.buttonTextDecoration
    });

    if (uploadToggle) {
      uploadToggle.addEventListener('click', (e) => {
        e.preventDefault();

        openUploadView();
      });
    }
  }

  updateLabels();
})();
