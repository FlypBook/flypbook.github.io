// Privacy-friendly visitor stats (supabase/008_visits.sql). No cookies, no IP addresses, no fingerprinting:
// this device gets a random id kept in its own storage, and the app adds up time on screen and stories
// viewed / finished per day. Signed-in readers are linked to their account. Browsers that send
// Global Privacy Control or Do Not Track are never counted.
(() => {
  const CONFIG = window.FLYPBOOK_CONFIG;
  const optedOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === "1" || window.doNotTrack === "1";
  const pending = { seconds: 0, viewed: 0, finished: 0 };
  window.FlypStats = { viewed() { pending.viewed++; }, finished() { pending.finished++; } };
  if (optedOut || !CONFIG) return;

  function visitorId() {
    try {
      let id = localStorage.getItem("flypbook-visitor");
      if (!id) localStorage.setItem("flypbook-visitor", id = crypto.randomUUID());
      return id;
    } catch { return null; }
  }
  const visitor = visitorId();
  if (!visitor) return;

  const device = /iPad|Tablet/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
    ? "tablet" : /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "phone" : "computer";
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  // Where the visit came from: a ?ref= tag on the link (e.g. ?ref=tiktok), else the referring site's name.
  function source() {
    const ref = new URLSearchParams(location.search).get("ref");
    if (ref) return ref.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40) || "direct";
    try {
      const host = new URL(document.referrer).hostname.replace(/^www\.|^m\./, "");
      if (host && host !== location.hostname) return host.split(".").slice(-2, -1)[0] || host;
    } catch {}
    return "direct";
  }
  const from = source();

  // The signed-in reader's login token, if any (saved by account.js), so the visit is linked to them.
  function token() {
    try {
      const s = JSON.parse(localStorage.getItem("flypbook-login") || "null");
      return s?.access_token && s.expires_at * 1000 > Date.now() ? s.access_token : null;
    } catch { return null; }
  }

  function flush() {
    if (!pending.seconds && !pending.viewed && !pending.finished) return;
    const body = { p_visitor: visitor, p_seconds: Math.round(pending.seconds), p_viewed: pending.viewed,
                   p_finished: pending.finished, p_device: device, p_source: from, p_installed: installed };
    pending.seconds = pending.viewed = pending.finished = 0;
    const auth = token();
    fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/record_visit`, {
      method: "POST", keepalive: true, body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", apikey: CONFIG.supabaseKey, ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    }).catch(() => {});
  }

  // Count time only while the app is on screen. Send a little at a time, and whatever is left when it's closed.
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    if (!document.hidden) pending.seconds += Math.min((now - last) / 1000, 10);
    last = now;
  }, 5000);
  setInterval(flush, 60000);
  setTimeout(() => { pending.seconds += 0.01; flush(); }, 4000);  // count the visit even if it's very short
  document.addEventListener("visibilitychange", () => { last = Date.now(); if (document.hidden) flush(); });
  addEventListener("pagehide", flush);
})();
