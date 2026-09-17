'use strict';
const SITE = 'https://kpnc-meet.pages.dev';
const PREVIEW_SITE = 'https://feat-meet-next.kpnc-meet.pages.dev';
function isMeetURL(value, site = SITE) {
  try { const url = new URL(value); return url.origin === site && !url.username && !url.password; }
  catch { return false; }
}
function meetingLink(value, site = SITE) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'kpncmeet:' || url.hostname !== 'join' || url.username || url.password) return null;
    const code = url.pathname.replace(/^\//, '').toLowerCase();
    return /^[a-z0-9-]{6,64}$/.test(code) ? `${site}/?room=${encodeURIComponent(code)}` : null;
  } catch { return null; }
}
module.exports = {SITE, PREVIEW_SITE, isMeetURL, meetingLink};
