<button
  style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;border:none;border-radius:8px;cursor:pointer;background:#f3f4f6;color:#111;"
  onclick="
(async()=>{
  const code = new URLSearchParams(location.search).get('code') || '';
  const shareUrl = `https://bytecamp.ca?qr=${encodeURIComponent(code)}`;

  try {
    if (navigator.canShare && navigator.canShare({ url: shareUrl })) {
      await navigator.share({
        url: shareUrl,
        text: `Check out this project from Byte Camp!`
      });
      return;
    }
  } catch (e) {}

  try {
    await navigator.clipboard.writeText(shareUrl);
    alert('Copied to clipboard');
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = shareUrl;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    alert('Copied to clipboard');
  }
})()"
>
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/>
    <line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>
  </svg>
</button>