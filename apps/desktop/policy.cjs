'use strict';
const SITE = 'https://kpnc-meet.pages.dev';
function isMeetURL(value) {
  try { const url = new URL(value); return url.origin === SITE && !url.username && !url.password; }
  catch { return false; }
}
function meetingLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'kpncmeet:' || url.hostname !== 'join' || url.username || url.password) return null;
    const code = url.pathname.replace(/^\//, '').toLowerCase();
    return /^[a-z0-9-]{6,64}$/.test(code) ? `${SITE}/?room=${encodeURIComponent(code)}` : null;
  } catch { return null; }
}
module.exports = {SITE, isMeetURL, meetingLink};
