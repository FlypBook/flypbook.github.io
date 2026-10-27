// FlypBook accounts: sign-up (with the neutral age screen), login, profile, requests,
// notifications, and account deletion. Uses Supabase Auth (free).
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const CONFIG = window.FLYPBOOK_CONFIG;
const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);
window.sb = sb;

const GENRES = ["aita", "tifu", "entitled people", "malicious compliance", "petty revenge", "family drama",
  "friendship drama", "school drama", "workplace drama", "roommate drama", "wholesome twist", "mystery", "unexplained / eerie"];
const TONES = ["funny", "dramatic", "suspenseful", "heartwarming", "eerie", "satisfying"];
const AGE_BLOCK_KEY = "flypbook-signup-blocked";

const acct = { user: null, profile: null, unread: [] };
window.Account = acct;

// ---------- small DOM helpers ----------
const $ = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function storageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

const sheet = $(`<section class="sheet account-sheet" hidden aria-label="Account">
  <div class="grabber"></div>
  <div class="sheet-head"><h2 id="acct-title">Account</h2><button class="icon-btn" data-close aria-label="Close">&times;</button></div>
  <div id="acct-body"></div>
</section>`);
document.getElementById("app").append(sheet);
sheet.querySelector("[data-close]").addEventListener("click", () => closeSheet());
const body = sheet.querySelector("#acct-body"), title = sheet.querySelector("#acct-title");

function openSheet(view, opts) {
  document.getElementById("settings").hidden = true;
  sheet.hidden = false;
  render(view, opts);
}
function closeSheet() { sheet.hidden = true; }
acct.open = openSheet;
acct.close = closeSheet;
acct.isOpen = () => !sheet.hidden;

// ---------- auth state ----------
async function loadProfile() {
  if (!acct.user) { acct.profile = null; return; }
  const { data } = await sb.from("profiles").select("*").eq("id", acct.user.id).maybeSingle();
  acct.profile = data;
}
async function loadUnread() {
  if (!acct.user) { acct.unread = []; return; }
  const { data } = await sb.from("notifications").select("*").eq("read", false).order("created_at", { ascending: false }).limit(20);
  acct.unread = data || [];
}
async function refresh() {
  await loadProfile();
  await loadUnread();
  updateTopbar();
  window.App?.onAuth?.(acct);
}
sb.auth.onAuthStateChange((event, session) => {
  const changed = (session?.user?.id || null) !== (acct.user?.id || null);
  acct.user = session?.user || null;
  if (changed || event === "USER_UPDATED") refresh();
});

// ---------- top bar buttons: requests (+), notifications (bell), profile ----------
const bar = document.getElementById("topbar");
const actions = $(`<div class="top-actions">
  <button class="icon-btn" id="req-btn" aria-label="Request a story"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
  <button class="icon-btn" id="bell-btn" aria-label="Notifications"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span class="badge" hidden></span></button>
  <button class="icon-btn" id="me-btn" aria-label="Profile"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg></button>
</div>`);
const settingsBtn = document.getElementById("settings-btn");
bar.insertBefore(actions, settingsBtn);
actions.append(settingsBtn);
actions.querySelector("#req-btn").addEventListener("click", () => openSheet(acct.user ? "request" : "signup", { reason: "Create an account to request your own stories." }));
actions.querySelector("#bell-btn").addEventListener("click", () => openSheet(acct.user ? "notifications" : "signup", { reason: "Create an account to get notified when your stories are ready." }));
actions.querySelector("#me-btn").addEventListener("click", () => openSheet(acct.user ? "profile" : "signup"));
function updateTopbar() {
  const badge = actions.querySelector(".badge");
  badge.hidden = !acct.unread.length;
  badge.textContent = acct.unread.length > 9 ? "9+" : acct.unread.length;
  actions.querySelector("#me-btn").classList.toggle("signed-in", !!acct.user);
}

// ---------- views ----------
function render(view, opts = {}) {
  ({ signup: viewSignup, login: viewLogin, profile: viewProfile, request: viewRequest, notifications: viewNotifications, forgot: viewForgot })[view](opts);
}
function tabs(active) {
  return `<div class="seg auth-tabs"><button data-tab="signup" aria-pressed="${active === "signup"}">Sign up</button><button data-tab="login" aria-pressed="${active === "login"}">Log in</button></div>`;
}
function wireTabs() { body.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => render(b.dataset.tab))); }
function msg(text, kind = "info") { const m = body.querySelector(".form-msg"); if (m) { m.textContent = text; m.dataset.kind = kind; } }

// Sign up, step 1: a neutral age screen (no minimum age mentioned anywhere).
function viewSignup({ reason } = {}) {
  title.textContent = "Join FlypBook";
  if (storageGet(AGE_BLOCK_KEY)) { body.innerHTML = tabs("signup") + sorryHtml(); wireTabs(); return; }
  body.innerHTML = `${tabs("signup")}
    ${reason ? `<p class="fine">${esc(reason)}</p>` : `<p class="fine tag-line">Scroll Like Shakespeare.</p>`}
    <form class="form" id="dob-form">
      <label>When's your birthday?<input type="date" id="dob" required max="${new Date().toISOString().slice(0, 10)}"></label>
      <button class="btn-primary" type="submit">Continue</button>
      <p class="form-msg" aria-live="polite"></p>
    </form>`;
  wireTabs();
  body.querySelector("#dob-form").addEventListener("submit", e => {
    e.preventDefault();
    const v = body.querySelector("#dob").value;
    if (!v) return msg("Please enter your birthday.", "error");
    const dob = new Date(v + "T00:00:00"), now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    if (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate())) age--;
    if (age < 0 || age > 120) return msg("Please enter a real date.", "error");
    if (age < 13) {
      storageSet(AGE_BLOCK_KEY, "1");     // remember on this device only; nothing is sent anywhere
      body.innerHTML = tabs("signup") + sorryHtml(); wireTabs();
      return;
    }
    viewSignupDetails();                  // the birthday itself is never stored or sent
  });
}
function sorryHtml() {
  return `<div class="sorry"><strong>Sorry, you can't create an account right now.</strong>
    <p>You can still read and listen to every story without an account.</p></div>`;
}

// Sign up, step 2: account details.
function viewSignupDetails() {
  const chosen = new Set();
  body.innerHTML = `<form class="form" id="su-form">
      <label>Username<input id="su-user" required minlength="3" maxlength="20" pattern="[a-z0-9_]{3,20}" autocomplete="username" placeholder="lowercase, numbers, _"></label>
      <label>Email<input id="su-email" type="email" required autocomplete="email"></label>
      <label>Password<input id="su-pass" type="password" required minlength="8" autocomplete="new-password" placeholder="at least 8 characters"></label>
      <div class="label">Pick your favorite kinds of stories</div>
      <div class="chips" id="su-genres">${GENRES.map(g => `<button type="button" class="chip-btn" data-g="${g}">${g}</button>`).join("")}</div>
      <p class="fine">By signing up you agree to our <a href="privacy.html" target="_blank">privacy policy</a>.</p>
      <button class="btn-primary" type="submit">Create account</button>
      <p class="form-msg" aria-live="polite"></p>
    </form>`;
  body.querySelectorAll(".chip-btn").forEach(b => b.addEventListener("click", () => {
    chosen.has(b.dataset.g) ? chosen.delete(b.dataset.g) : chosen.add(b.dataset.g);
    b.setAttribute("aria-pressed", chosen.has(b.dataset.g));
  }));
  body.querySelector("#su-form").addEventListener("submit", async e => {
    e.preventDefault();
    const username = body.querySelector("#su-user").value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return msg("Usernames are 3-20 lowercase letters, numbers, or _.", "error");
    msg("Creating your account...");
    const { data: taken } = await sb.from("public_usernames").select("id").eq("username", username).maybeSingle();
    if (taken) return msg("That username is taken. Try another.", "error");
    const { error } = await sb.auth.signUp({
      email: body.querySelector("#su-email").value.trim(),
      password: body.querySelector("#su-pass").value,
      options: {
        data: { username, favorite_genres: [...chosen], is_13_plus: true },
        emailRedirectTo: location.origin + location.pathname,
      },
    });
    if (error) return msg(friendly(error), "error");
    body.innerHTML = `<div class="sorry ok"><strong>Check your email!</strong>
      <p>We sent a link to confirm your account. Open it on this device to start earning points and streaks.</p></div>`;
  });
}

function viewLogin() {
  title.textContent = "Welcome back";
  body.innerHTML = `${tabs("login")}
    <form class="form" id="li-form">
      <label>Email<input id="li-email" type="email" required autocomplete="email"></label>
      <label>Password<input id="li-pass" type="password" required autocomplete="current-password"></label>
      <button class="btn-primary" type="submit">Log in</button>
      <button class="btn-link" type="button" id="forgot">Forgot password?</button>
      <p class="form-msg" aria-live="polite"></p>
    </form>`;
  wireTabs();
  body.querySelector("#forgot").addEventListener("click", () => render("forgot"));
  body.querySelector("#li-form").addEventListener("submit", async e => {
    e.preventDefault();
    msg("Logging in...");
    const { error } = await sb.auth.signInWithPassword({ email: body.querySelector("#li-email").value.trim(), password: body.querySelector("#li-pass").value });
    if (error) return msg(friendly(error), "error");
    closeSheet();
    window.App?.toast("Welcome back!");
  });
}

function viewForgot() {
  title.textContent = "Reset password";
  body.innerHTML = `<form class="form" id="fp-form">
      <label>Email<input id="fp-email" type="email" required autocomplete="email"></label>
      <button class="btn-primary" type="submit">Send reset link</button>
      <p class="form-msg" aria-live="polite"></p></form>`;
  body.querySelector("#fp-form").addEventListener("submit", async e => {
    e.preventDefault();
    const { error } = await sb.auth.resetPasswordForEmail(body.querySelector("#fp-email").value.trim(), { redirectTo: location.origin + location.pathname });
    msg(error ? friendly(error) : "If that email has an account, a reset link is on its way.", error ? "error" : "info");
  });
}

const LEVEL = l => (l < 1.67 ? "Easy" : l < 2.34 ? "Medium" : "Challenging");
async function viewProfile() {
  await loadProfile();
  const p = acct.profile;
  if (!p) { body.innerHTML = `<p class="fine">Loading your profile...</p>`; return; }
  title.textContent = "@" + p.username;
  const genres = new Set(p.favorite_genres || []);
  body.innerHTML = `
    <div class="stats">
      <div><b>${p.points}</b><span>points</span></div>
      <div><b>${p.current_streak}🔥</b><span>day streak</span></div>
      <div><b>${p.longest_streak}</b><span>best streak</span></div>
      <div><b>${LEVEL(p.reading_level)}</b><span>reading level</span></div>
    </div>
    <div class="label">Favorite kinds of stories</div>
    <div class="chips" id="pf-genres">${GENRES.map(g => `<button type="button" class="chip-btn" data-g="${g}" aria-pressed="${genres.has(g)}">${g}</button>`).join("")}</div>
    <div class="label">Your story requests</div>
    <div id="pf-requests" class="list"><p class="fine">Loading...</p></div>
    <div class="row-btns">
      <button class="btn-secondary" id="pf-out">Log out</button>
      <a class="btn-secondary" href="privacy.html" target="_blank">Privacy</a>
    </div>
    <button class="btn-danger" id="pf-delete">Delete my account</button>`;
  body.querySelectorAll(".chip-btn").forEach(b => b.addEventListener("click", async () => {
    genres.has(b.dataset.g) ? genres.delete(b.dataset.g) : genres.add(b.dataset.g);
    b.setAttribute("aria-pressed", genres.has(b.dataset.g));
    await sb.from("profiles").update({ favorite_genres: [...genres] }).eq("id", acct.user.id);
    window.App?.onAuth?.(acct, { genresChanged: true });
  }));
  body.querySelector("#pf-out").addEventListener("click", async () => { await sb.auth.signOut(); closeSheet(); window.App?.toast("Logged out"); });
  body.querySelector("#pf-delete").addEventListener("click", viewDelete);
  const { data: reqs } = await sb.from("story_requests").select("prompt,status,created_at,story_id").order("created_at", { ascending: false }).limit(10);
  const list = body.querySelector("#pf-requests");
  if (list) list.innerHTML = reqs?.length ? reqs.map(r => `<div class="list-item"><span>${esc(r.prompt)}</span><em data-s="${r.status}">${r.status}</em></div>`).join("")
    : `<p class="fine">No requests yet. Tap + to ask for a story.</p>`;
}

function viewDelete() {
  title.textContent = "Delete account";
  body.innerHTML = `<form class="form" id="del-form">
      <p>This permanently deletes your account, points, streaks, likes, and requests. Stories you requested stay up, but without your name.</p>
      <label>Type DELETE to confirm<input id="del-confirm" autocomplete="off"></label>
      <button class="btn-danger" type="submit">Delete forever</button>
      <p class="form-msg" aria-live="polite"></p></form>`;
  body.querySelector("#del-form").addEventListener("submit", async e => {
    e.preventDefault();
    if (body.querySelector("#del-confirm").value.trim() !== "DELETE") return msg("Type DELETE (in capitals) to confirm.", "error");
    msg("Deleting...");
    const { error } = await sb.rpc("delete_my_account");
    if (error) return msg(friendly(error), "error");
    await sb.auth.signOut();
    closeSheet();
    window.App?.toast("Your account and data were deleted.");
  });
}

function viewRequest() {
  title.textContent = "Request a story";
  body.innerHTML = `<form class="form" id="rq-form">
      <label>What should it be about?<textarea id="rq-text" required minlength="5" maxlength="200" rows="3" placeholder="a mystery at a summer camp with a twist ending"></textarea></label>
      <div class="row-2">
        <label>Kind<select id="rq-genre"><option value="">Any</option>${GENRES.map(g => `<option>${g}</option>`).join("")}</select></label>
        <label>Tone<select id="rq-tone"><option value="">Any</option>${TONES.map(t => `<option>${t}</option>`).join("")}</select></label>
      </div>
      <p class="fine">New stories are written a few times a day. We'll notify you when yours is ready, and it'll be shared with everyone (credited to you).</p>
      <button class="btn-primary" type="submit">Send request</button>
      <p class="form-msg" aria-live="polite"></p></form>`;
  body.querySelector("#rq-form").addEventListener("submit", async e => {
    e.preventDefault();
    const prompt = body.querySelector("#rq-text").value.trim();
    if (prompt.length < 5) return msg("Tell us a little more (at least 5 characters).", "error");
    const { error } = await sb.from("story_requests").insert({
      user_id: acct.user.id, prompt,
      genre: body.querySelector("#rq-genre").value || null, tone: body.querySelector("#rq-tone").value || null,
    });
    if (error) return msg(/limit/i.test(error.message) ? "You've used all your requests for today. Try again tomorrow!" : friendly(error), "error");
    body.innerHTML = `<div class="sorry ok"><strong>Request sent!</strong><p>Your story is in the queue. We'll let you know when it's ready.</p></div>`;
  });
}

async function viewNotifications() {
  title.textContent = "Notifications";
  const { data } = await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(20);
  body.innerHTML = data?.length
    ? `<div class="list">${data.map(n => `<button class="list-item notif" data-story="${n.story_id || ""}"><span>${esc(n.message)}</span><em>${new Date(n.created_at).toLocaleDateString()}</em></button>`).join("")}</div>`
    : `<p class="fine">Nothing yet. Request a story with + and we'll tell you when it's ready.</p>`;
  body.querySelectorAll(".notif[data-story]").forEach(b => b.dataset.story && b.addEventListener("click", () => { closeSheet(); window.App?.openStory(b.dataset.story); }));
  if (acct.unread.length) {
    await sb.from("notifications").update({ read: true }).in("id", acct.unread.map(n => n.id));
    acct.unread = []; updateTopbar();
  }
}

function friendly(error) {
  const m = error?.message || String(error);
  if (/Invalid login/i.test(m)) return "Wrong email or password.";
  if (/Email not confirmed/i.test(m)) return "Please confirm your email first (check your inbox).";
  if (/already registered/i.test(m)) return "That email already has an account. Try logging in.";
  if (/rate limit/i.test(m)) return "Too many tries right now. Please wait a few minutes.";
  if (/Account cannot be created/i.test(m)) return "Sorry, you can't create an account right now.";
  return m;
}

acct.markRead = async ids => {
  if (!ids.length) return;
  await sb.from("notifications").update({ read: true }).in("id", ids);
  acct.unread = acct.unread.filter(n => !ids.includes(n.id)); updateTopbar();
};

// Start: read the saved session (also handles the link from a confirmation email).
const { data: { session } } = await sb.auth.getSession();
acct.user = session?.user || null;
await refresh();
window.resolveAccount?.();
