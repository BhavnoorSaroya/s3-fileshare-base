(async function () {
  const urlParams = new URLSearchParams(window.location.search);
  const qrRaw = urlParams.get('code');

  if (!qrRaw) return;

  const id = qrRaw.replace(/\D/g, '');

  if (!id) return;

  const projectContent = document.querySelector("iframe")

  if (!projectContent) return;

  function createFixedControl({
    id,
    text,
    side,
    background = '#ff2e2eff'
  }) {
    const el = document.createElement('button');

    el.id = id;
    el.textContent = text;
    el.style.position = 'fixed';
    el.style.bottom = '0';
    el.style[side] = '0';
    el.style.padding = '16px';
    el.style.zIndex = '100';
    el.style.border = '0';
    el.style.background = background;

    document.body.appendChild(el);

    return el;
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

  const downloadToggle = createFixedControl({
    id: 'filedownloadtoggle',
    text: 'Download Files',
    side: 'right'
  });

  let currentView = 'content';

  const views = {
    content: projectContent,
    download: null
  };

  function updateLabels() {
    downloadToggle.textContent =
      currentView === 'download'
        ? 'Hide Downloads'
        : 'Download Files';
  }

  function showView(view) {
    if (views.download) {
      views.download.style.display = 'none';
    }

    projectContent.style.display = 'none';

    switch (view) {
      case 'download':
        views.download.style.display = 'block';
        break;

      default:
        projectContent.style.display = '';
        view = 'content';
    }

    currentView = view;
    updateLabels();
  }

  try {
    const listResponse = await fetch(
      `https://s3download.fly.dev/api/list/${id}`
    );

    const listData = await listResponse.json();

    const hasFiles =
      listData &&
      Array.isArray(listData.files) &&
      listData.files.length > 0;

    if (!hasFiles) {
      downloadToggle.style.display = 'none';
      return;
    }

    downloadToggle.addEventListener('click', () => {
      if (!views.download) {
        views.download = createIframe(`https://s3download.fly.dev/${id}`);
      }

      if (currentView === 'download') {
        showView('content');
      } else {
        showView('download');
      }
    });
  } catch {
    downloadToggle.style.display = 'none';
  }
})();
