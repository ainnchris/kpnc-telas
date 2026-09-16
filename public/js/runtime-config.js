(() => {
  'use strict';
  const PREVIEW_HOST = 'feat-meet-next.kpnc-meet.pages.dev';
  if (location.hostname === PREVIEW_HOST) {
    window.KPNC_API_URL = 'https://kpnc-meet-api-preview.erikchristian2.workers.dev';
  }
})();
