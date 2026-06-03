(function () {
  // Grab the QR code value from the URL
  const urlParams = new URLSearchParams(window.location.search);
  const qrRaw = urlParams.get("qr");

  if (!qrRaw) return;

  // Keep only numeric characters
  const cleaned = qrRaw.replace(/\D/g, "");

  if (!cleaned) return;

  // Fetch uploaded files for this QR code
  fetch(`https://s3download.fly.dev/api/list/${cleaned}`)
    .then((res) => res.json())
    .then((data) => {
      // Hide button if no files exist
      if (!data || !data.files || data.files.length === 0) {
        const toggleBtn = document.getElementById("filedownloadtoggle");

        if (toggleBtn) {
          toggleBtn.style.display = "none";
        }

        return;
      }

      // Required page elements
      const projectContent = document.getElementById("projectContent");
      const toggleBtn = document.getElementById("filedownloadtoggle");

      if (!projectContent || !toggleBtn) return;

      // Create iframe containing the download UI
      const iframe = document.createElement("iframe");

      iframe.src = `https://s3download.fly.dev/${cleaned}`;
      iframe.style.display = "none";
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "none";

      // Insert iframe after project content
      projectContent.insertAdjacentElement("afterend", iframe);

      let showingIframe = false;
      let originalDisplay = projectContent.style.display || "";

      // Toggle between project content and iframe
      toggleBtn.addEventListener("click", () => {
        if (showingIframe) {
          iframe.style.display = "none";
          projectContent.style.display = originalDisplay;
          showingIframe = false;
        } else {
          originalDisplay = projectContent.style.display || "";

          projectContent.style.display = "none";
          iframe.style.display = "block";

          showingIframe = true;
        }
      });
    })
    .catch(() => {
      // Silently ignore fetch errors
    });
})();