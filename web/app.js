// FlypBook: Scroll Like Shakespeare. Feed app.
// TikTok-inspired: full-screen cards that autoplay (muted until the first tap, as browsers require),
// a right-side rail (like / comment / save / share), bottom-left info, a bottom nav, feed tabs, and a
// comment drawer. Improvements: captions never sit under buttons, a scrubbable progress bar with time,
// tap-to-pause stops EVERYTHING (voice + background), and gentle "take a break" reminders.

const CONFIG = window.FLYPBOOK_CONFIG;
const PAGE_SIZE = 10;
const VIDEO_SHARE = 0.3;     // share of stories that get a real video clip (the rest get a gameplay scene)
const EXPLORE_EVERY = 5;     // For You: every 5th story is a "something different" pick (about 20%)
const BREAK_AFTER = { stories: 15, minutes: 25 };
const LEVEL_LABEL = { easy: "Easy read", medium: "Medium read", challenging: "Challenging" };
const LEVEL_NUM = { easy: 1, medium: 2, challenging: 3 };
const GENRES = ["aita", "tifu", "entitled people", "malicious compliance", "petty revenge", "family drama",
  "friendship drama", "school drama", "workplace drama", "roommate drama", "wholesome twist", "mystery", "unexplained / eerie"];
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  // One hand-tuned line-icon set: 24px grid, 1.75 stroke, round joins.
  heart: '<svg viewBox="0 0 24 24" class="ln"><path d="M12 20.2c-.3 0-.6-.1-.8-.3C7.6 17 3.5 13.8 3.5 9.6 3.5 7 5.4 5 7.9 5c1.6 0 3 .8 4.1 2.3C13.1 5.8 14.5 5 16.1 5c2.5 0 4.4 2 4.4 4.6 0 4.2-4.1 7.4-7.7 10.3-.2.2-.5.3-.8.3z"/></svg>',
  comment: '<svg viewBox="0 0 24 24" class="ln"><path d="M20 11.6c0 3.9-3.6 7-8 7-1 0-2-.2-2.9-.5L4.5 19.5l1.2-3.6C4.6 14.7 4 13.2 4 11.6c0-3.9 3.6-7 8-7s8 3.1 8 7z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/></svg>',
  save: '<svg viewBox="0 0 24 24" class="ln"><path d="M7 3.8h10c.6 0 1 .4 1 1v15.4l-6-3.9-6 3.9V4.8c0-.6.4-1 1-1z"/></svg>',
  share: '<svg viewBox="0 0 24 24" class="ln"><path d="M12 15V3.8M8 7.6l4-3.8 4 3.8"/><path d="M6.5 11H5.8c-.7 0-1.3.6-1.3 1.3v6.4c0 .7.6 1.3 1.3 1.3h12.4c.7 0 1.3-.6 1.3-1.3v-6.4c0-.7-.6-1.3-1.3-1.3h-.7"/></svg>',
  more: '<svg viewBox="0 0 24 24" class="ln"><path d="M5.5 12h.01M12 12h.01M18.5 12h.01"/></svg>',
};

const app = document.getElementById("app");
const feed = document.getElementById("feed");
const splash = document.getElementById("splash");
const splashStatus = document.getElementById("splash-status");
const settingsSheet = document.getElementById("settings");
const startBtn = document.getElementById("start-btn");
const commentsSheet = document.getElementById("comments");
const discoverSheet = document.getElementById("discover");
const filterChip = document.getElementById("filter-chip");

const state = {
  stories: [],          // { data, prepared, card, els, word, ended, media }
  active: -1,
  playing: true,        // autoplay: stories play unless the reader pauses
  loading: false,
  done: false,
  videos: [],
  settings: loadSettings(),
  tab: "foryou",        // "foryou" or "latest"
  filter: null,         // a genre picked in Discover
  mode: "latest",
  queue: [],
  feedUser: null,
  liked: new Set(),
  saved: new Set(),
  reported: new Set(),
  answered: new Map(),
  viewed: 0,
  lastBreak: Date.now(),
};

const narrator = new Narrator({
  onWord: i => showWord(state.stories[state.active], i),
  onEnd: () => endStory(state.stories[state.active]),
  onBlocked: () => askForStartTap(),
});

const acct = () => window.Account || {};
const user = () => acct().user || null;

// ---------- Settings (saved on this device only) ----------
function loadSettings() {
  const defaults = { narration: "on", rate: "1", bg: matchMedia("(prefers-reduced-motion: reduce)").matches ? "dim" : "on" };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem("flypbook-settings") || "{}") }; }
  catch { return defaults; }
}
function saveSettings() { try { localStorage.setItem("flypbook-settings", JSON.stringify(state.settings)); } catch {} }
function applySettings() {
  app.dataset.bg = state.settings.bg;
  for (const seg of document.querySelectorAll("#settings .seg")) {
    for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.value === state.settings[seg.dataset.setting]));
  }
  updateMedia();
}
document.querySelectorAll("#settings .seg").forEach(seg => seg.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  state.settings[seg.dataset.setting] = b.dataset.value;
  saveSettings(); applySettings();
  if (seg.dataset.setting !== "bg" && state.playing) startReading();
}));
document.getElementById("settings-btn").addEventListener("click", () => { closeSheets(); settingsSheet.hidden = false; });
document.getElementById("settings-close").addEventListener("click", () => { settingsSheet.hidden = true; });
for (const s of [commentsSheet, discoverSheet]) s.querySelector("[data-close]").addEventListener("click", () => { s.hidden = true; });

function closeSheets() {
  settingsSheet.hidden = commentsSheet.hidden = discoverSheet.hidden = true;
  acct().close?.();
}
const anySheetOpen = () => !settingsSheet.hidden || !commentsSheet.hidden || !discoverSheet.hidden || acct().isOpen?.();

function toast(text) {
  const t = el("div", "toast", text);
  app.append(t);
  setTimeout(() => t.classList.add("out"), 2200);
  setTimeout(() => t.remove(), 2700);
}

// ---------- Sound on open ----------
// FlypBook tries to start with sound right away. Installed apps (and sites you visit a lot) are
// allowed to; otherwise browsers require one tap first. In that case the opening screen asks
// for a single "Tap to start reading", and after that every story plays with sound by itself.
let tapConsumedUntil = 0;
/** Ask the browser (with a silent, zero-length clip) whether sound may start without a tap. */
async function canPlaySound() {
  try {
    if (navigator.getAutoplayPolicy) return navigator.getAutoplayPolicy("mediaelement") === "allowed";
    const probe = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=");
    await probe.play();
    return true;
  } catch { return false; }
}
function askForStartTap() {
  state.awaitingStart = true;
  narrator.stop();
  state.playing = false;
  updateMedia();
  splash.classList.remove("gone");
  splashStatus.textContent = "";
  startBtn.hidden = false;
}
startBtn.addEventListener("click", e => {
  e.stopPropagation();
  state.awaitingStart = false;
  startBtn.hidden = true;
  splash.classList.add("gone");
  tapConsumedUntil = Date.now() + 400;
  const s = state.stories[state.active];
  if (s) { s.introDone = true; s.card.classList.remove("intro-on"); }
  startReading();        // inside the tap, so the browser allows sound from now on
});

// ---------- Loading stories from Supabase ----------
async function api(path, init) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${path}`, {
    ...init, headers: { apikey: CONFIG.supabaseKey, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw Object.assign(new Error(`Couldn't load stories (${res.status})`), { status: res.status });
  return res.json();
}

const BASE_FIELDS = "id,title,body,genre,tone,reading_level,est_read_seconds,requested_by,created_at,like_count,question_prompt,question_choices";
let optional = ["comment_count", "audio_url", "word_times"];   // newer columns; dropped if the database doesn't have them yet
async function fetchStories(query) {
  for (;;) {
    try { return await api(`stories?select=${[BASE_FIELDS, ...optional].join(",")}&${query}`); }
    catch (err) { if (err.status !== 400 || !optional.length) throw err; optional = optional.slice(1); }
  }
}

async function loadMore() {
  if (state.loading || state.done) return;
  state.loading = true;
  try {
    let rows;
    if (state.mode === "ranked") {
      rows = state.queue.splice(0, PAGE_SIZE);
      if (!state.queue.length) state.done = true;
    } else {
      const offset = state.stories.filter(s => !s.pinned).length;
      const genre = state.filter ? `&genre=eq.${encodeURIComponent(state.filter)}` : "";
      rows = await fetchStories(`order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}${genre}`);
      if (rows.length < PAGE_SIZE) state.done = true;
    }
    await addStories(rows.filter(r => !state.stories.some(s => s.data.id === r.id)));
    if (state.done) addMessageCard("You're all caught up", "New stories drop every few hours. Come back soon.");
  } finally {
    state.loading = false;
  }
}

async function namesFor(rows) {
  const ids = [...new Set(rows.map(r => r.requested_by).filter(Boolean))];
  const names = {};
  if (ids.length) for (const u of await api(`public_usernames?select=id,username&id=in.(${ids.join(",")})`)) names[u.id] = u.username;
  return names;
}

function makeStory(row, names, pinned = false) {
  const prepared = prepareStory(row.body);
  prepared.audioUrl = row.audio_url || null;
  prepared.times = row.word_times || null;
  const story = { data: { ...row, username: names[row.requested_by] }, prepared, word: -1, ended: false, pinned };
  story.seed = hash(row.id);
  buildCard(story);
  return story;
}

async function addStories(rows, pinned = false) {
  const names = await namesFor(rows);
  for (const row of rows) { const s = makeStory(row, names, pinned); insertCard(s.card); state.stories.push(s); }
  reindex();
  updateMedia();
}

/** Put a story right after the current one (or jump to it if it's already in the feed). */
async function openStory(id, banner) {
  let i = state.stories.findIndex(s => s.data.id === id);
  if (i < 0) {
    const rows = await fetchStories(`id=eq.${id}`);
    if (!rows.length) return toast("That story isn't available.");
    const s = makeStory(rows[0], await namesFor(rows), true);
    i = Math.max(0, state.active + 1);
    const before = state.stories[i]?.card || feed.querySelector(".message-card");
    before ? feed.insertBefore(s.card, before) : feed.append(s.card);
    state.stories.splice(i, 0, s);
    reindex();
  }
  if (banner) { state.stories[i].card.querySelector(".ready-banner")?.remove(); state.stories[i].card.append(el("div", "ready-banner", banner)); }
  closeSheets();
  feed.scrollTo({ top: i * feed.clientHeight, behavior: "smooth" });
  setTimeout(syncActiveFromScroll, 700);
}

function reindex() { state.stories.forEach((s, i) => { s.card.dataset.index = i; }); }

async function loadVideos() {
  try { const res = await fetch("videos.json", { cache: "no-cache" }); if (res.ok) state.videos = await res.json(); } catch {}
}

function hash(text) {
  let h = 2166136261;
  for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------- For You ranking (runs on the phone, no AI) ----------
async function buildForYou() {
  const genre = state.filter ? `&genre=eq.${encodeURIComponent(state.filter)}` : "";
  const cands = await fetchStories(`order=created_at.desc&limit=200${genre}`);
  const aff = {}, finished = new Set(), now = Date.now();
  const byId = new Map(cands.map(s => [s.id, s]));
  const bump = (s, g, t) => { if (!s) return; aff["g:" + s.genre] = (aff["g:" + s.genre] || 0) + g; aff["t:" + s.tone] = (aff["t:" + s.tone] || 0) + t; };
  let level = 1.6;
  if (user()) {
    const sb = window.sb;
    const [likes, events, answers] = await Promise.all([
      sb.from("likes").select("story_id"), sb.from("story_events").select("story_id,event").limit(2000), sb.from("answers").select("story_id,correct"),
    ]);
    for (const g of acct().profile?.favorite_genres || []) aff["g:" + g] = (aff["g:" + g] || 0) + 2;
    for (const l of likes.data || []) bump(byId.get(l.story_id), 3, 1.5);
    for (const e of events.data || []) {
      const s = byId.get(e.story_id);
      if (e.event === "finish") { finished.add(e.story_id); bump(s, 2, 1); }
      else if (e.event === "share") bump(s, 3, 1.5);
      else if (e.event === "skip") bump(s, -1, -0.5);
    }
    for (const a of answers.data || []) { if (a.correct) bump(byId.get(a.story_id), 0.5, 0.2); finished.add(a.story_id); }
    level = acct().profile?.reading_level || level;
  }
  const scored = cands.filter(s => !finished.has(s.id)).map(s => {
    const ageDays = (now - new Date(s.created_at)) / 864e5;
    const score = (aff["g:" + s.genre] || 0) + 0.5 * (aff["t:" + s.tone] || 0)
      + Math.max(0, 1 - Math.abs((LEVEL_NUM[s.reading_level] || 2) - level)) * 0.8   // near my reading level
      + Math.max(0, 1 - ageDays / 7)                                               // fresh
      + Math.log1p((s.like_count || 0) + (s.comment_count || 0)) * 0.4;             // popular
    return { s, score };
  }).sort((a, b) => b.score - a.score);
  const top = scored.map(x => x.s), queue = [];
  const tail = top.splice(Math.ceil(top.length / 2));
  for (let i = 0; top.length || tail.length; i++) {
    const explore = (i % EXPLORE_EVERY === EXPLORE_EVERY - 1 && tail.length) || !top.length;
    queue.push(explore ? tail.splice(Math.floor(Math.random() * tail.length), 1)[0] : top.shift());
  }
  return queue.length ? queue : cands;
}

/** Rebuild the feed (first load, switching tabs/filters, logging in or out). */
async function resetFeed() {
  narrator.stop();
  state.stories.forEach(releaseMedia);
  state.stories = []; state.active = -1; state.done = false; state.queue = [];
  feed.replaceChildren(); feed.scrollTop = 0;
  state.feedUser = user()?.id || null;
  document.querySelectorAll(".feed-tabs button").forEach(b => b.setAttribute("aria-current", String(b.dataset.feed === state.tab)));
  filterChip.hidden = !state.filter;
  filterChip.textContent = state.filter ? `#${state.filter}  ✕` : "";
  if (user()) {
    const sb = window.sb;
    const [likes, saves, answers, reports] = await Promise.all([
      sb.from("likes").select("story_id"), sb.from("saves").select("story_id"),
      sb.from("answers").select("story_id,correct"), sb.from("reports").select("story_id"),
    ]);
    state.liked = new Set((likes.data || []).map(r => r.story_id));
    state.saved = new Set((saves.data || []).map(r => r.story_id));
    state.answered = new Map((answers.data || []).map(a => [a.story_id, a]));
    state.reported = new Set((reports.data || []).map(r => r.story_id));
  } else {
    state.liked = new Set(); state.saved = new Set(); state.answered = new Map(); state.reported = new Set();
  }
  state.mode = state.tab === "foryou" ? "ranked" : "latest";
  if (state.mode === "ranked") {
    try { state.queue = await buildForYou(); } catch (err) { console.error(err); state.mode = "latest"; }
  }
  const shared = new URLSearchParams(location.search).get("story");  // share links: ?story=<id>
  if (shared && /^[0-9a-f-]{36}$/i.test(shared) && !state.sharedShown) {
    state.sharedShown = true;
    await addStories(await fetchStories(`id=eq.${shared}`), true);
  }
  await loadMore();
  if (!state.stories.length) addMessageCard("No stories yet", "The first stories are on their way. Check back soon.");
  state.playing = true;
  syncActiveFromScroll();
  showReadyStories();
}

document.querySelectorAll(".feed-tabs button").forEach(b => b.addEventListener("click", () => {
  if (state.tab === b.dataset.feed) { feed.scrollTo({ top: 0, behavior: "smooth" }); return; }
  state.tab = b.dataset.feed; resetFeed().catch(showError);
}));
filterChip.addEventListener("click", () => { state.filter = null; resetFeed().catch(showError); });

async function showReadyStories() {
  const ready = (acct().unread || []).filter(n => n.type === "story_ready" && n.story_id);
  if (!ready.length) return;
  await openStory(ready[0].story_id, "Your requested story is ready");
  acct().markRead?.(ready.map(n => n.id));
  toast("Your requested story is ready!");
}

// ---------- Cards ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
const minutes = s => `${Math.max(1, Math.round(s / 60))} min`;
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Every story gets its own caption look: font, text treatment, highlight color and method.
const CAPTION = {
  fonts: ["f-sans", "f-serif", "f-grot", "f-round"],
  treatments: ["t-stroke", "t-shadow", "t-plate"],
  highlights: ["h-ink", "h-marker", "h-underline", "h-glow", "h-box", "h-spot", "h-bounce"],
  colors: [["#ffd43b", "#1b1400"], ["#7af7ff", "#00262b"], ["#ff8fab", "#33000e"], ["#b9fbc0", "#0b2a10"],
           ["#ffb86b", "#2e1600"], ["#c4b5fd", "#1a0f3d"], ["#ff6b6b", "#2b0000"], ["#fde68a", "#2a2000"]],
};
function captionStyle(seed) {
  const r = mulberry32(seed ^ 0x9e3779b9), pick = a => a[Math.floor(r() * a.length)];
  const font = pick(CAPTION.fonts), highlight = pick(CAPTION.highlights);
  // Markers and plates already have a background; keep the outline treatment off them.
  let treatment = pick(CAPTION.treatments);
  if (highlight === "h-marker" && treatment === "t-stroke") treatment = "t-shadow";
  const [hl, ink] = pick(CAPTION.colors);
  return { classes: [font, treatment, highlight], hl, ink };
}

function buildCard(story) {
  const d = story.data;
  const card = el("article", "card");
  const style = captionStyle(story.seed);
  card.classList.add(...style.classes);
  card.style.setProperty("--hl", style.hl);
  card.style.setProperty("--hl-ink", style.ink);
  const media = el("div", "media");
  const scrim = el("div", "scrim");

  // Chapter line: what kind of story, how long, who asked for it
  const chapter = el("div", "chapter");
  chapter.append(el("span", null, d.genre), el("span", null, minutes(d.est_read_seconds)), el("span", null, "AI story"));
  if (d.username) chapter.append(el("span", "by", `requested by @${d.username}`));

  // Opening: the title, centered like a chapter heading, then it fades into the captions
  const intro = el("div", "intro");
  intro.append(el("small", null, LEVEL_LABEL[d.reading_level] || "A FlypBook story"), el("h2", null, d.title), el("div", "rule"));
  const captions = el("div", "captions");

  const playmark = el("div", "playmark");
  playmark.innerHTML = ICON.play;

  // Reading bar: actions in one row, page count on the right
  const readbar = el("div", "readbar");
  const actions = el("div", "actions");
  const likeBtn = actBtn(ICON.heart, d.like_count || 0, "Like", "like");
  const commentBtn = actBtn(ICON.comment, d.comment_count || 0, "Comments", "comment");
  const saveBtn = actBtn(ICON.save, "", "Save", "save");
  const shareBtn = actBtn(ICON.share, "", "Share", "share");
  const moreBtn = actBtn(ICON.more, "", "More options", "more");
  actions.append(likeBtn, commentBtn, saveBtn, shareBtn, moreBtn);
  const pagec = el("div", "pagec", `p. 1 / ${story.prepared.pages.length}`);
  readbar.append(actions, pagec);
  const stop = fn => e => { e.stopPropagation(); fn(); };
  likeBtn.addEventListener("click", stop(() => toggleLike(story)));
  commentBtn.addEventListener("click", stop(() => openComments(story)));
  saveBtn.addEventListener("click", stop(() => toggleSave(story)));
  shareBtn.addEventListener("click", stop(() => shareStory(story)));
  moreBtn.addEventListener("click", stop(() => reportStory(story)));

  // Scrubbable progress line + time readout
  const scrub = el("div", "scrub");
  const track = el("div", "track"), fill = el("div", "fill"), knob = el("div", "knob");
  track.append(fill, knob); scrub.append(track);
  const scrubTime = el("div", "scrub-time");
  wireScrub(story, scrub, scrubTime);

  const endcard = el("div", "endcard");
  endcard.addEventListener("click", e => e.stopPropagation());
  const credit = el("div", "credit-line");

  card.append(media, scrim, chapter, intro, captions, playmark, readbar, scrub, scrubTime, endcard, credit);
  wireTaps(story, card);
  story.card = card;
  story.els = { media, captions, fill, knob, credit, endcard, likeBtn, commentBtn, saveBtn, pagec };
  story.page = -1;
  observer.observe(card);
  refreshRail(story);
}

function actBtn(icon, label, aria, cls) {
  const b = el("button", `act-btn ${cls}`);
  b.setAttribute("aria-label", aria);
  b.innerHTML = icon;
  if (label !== "") b.append(el("span", null, String(label)));
  return b;
}

/** Single tap = pause/play everything. Double tap = like (with a heart burst). */
function wireTaps(story, card) {
  let last = 0, timer;
  card.addEventListener("click", e => {
    if (Date.now() < tapConsumedUntil) return;           // that tap turned the sound on
    if (anySheetOpen()) { closeSheets(); return; }
    const now = Date.now();
    if (now - last < 280) {
      clearTimeout(timer); last = 0;
      burstHeart(card, e);
      if (!state.liked.has(story.data.id)) toggleLike(story);
      return;
    }
    last = now;
    timer = setTimeout(() => togglePlay(story), 260);
  });
}
function burstHeart(card, e) {
  const r = card.getBoundingClientRect();
  const h = el("div", "heart-burst");
  h.innerHTML = ICON.heart;
  h.style.left = `${e.clientX - r.left}px`; h.style.top = `${e.clientY - r.top}px`;
  card.append(h);
  setTimeout(() => h.remove(), 850);
}

function addMessageCard(title, text) {
  if (feed.querySelector(".message-card")) return;
  const card = el("article", "card message-card");
  const layer = el("div", "layer");
  layer.append(el("h2", null, title), el("p", null, text));
  card.append(layer);
  feed.append(card);
}
function insertCard(card) {
  const msg = feed.querySelector(".message-card");
  if (msg) feed.insertBefore(card, msg); else feed.append(card);
}

// ---------- Scrubbing ----------
function storySeconds(story) {
  const t = story.prepared.times;
  return t?.length ? t[t.length - 1] / 1000 + 1 : story.data.est_read_seconds;
}
function wordAtFraction(story, f) {
  const t = story.prepared.times, n = story.prepared.words.length;
  if (!t?.length) return Math.min(n - 1, Math.max(0, Math.round(f * (n - 1))));
  const ms = f * t[t.length - 1];
  let i = 0; while (i < n - 1 && t[i + 1] <= ms) i++;
  return i;
}
function wireScrub(story, scrub, label) {
  let dragging = false;
  const at = e => { const r = scrub.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  const show = f => {
    const i = wordAtFraction(story, f);
    story.word = i; showWord(story, i);
    label.textContent = `${clock(f * storySeconds(story))} / ${clock(storySeconds(story))}`;
  };
  scrub.addEventListener("pointerdown", e => {
    e.stopPropagation(); dragging = true; scrub.setPointerCapture(e.pointerId);
    scrub.classList.add("active"); story.card.classList.add("scrubbing", "reading");
    narrator.stop(); show(at(e));
  });
  scrub.addEventListener("pointermove", e => { if (dragging) show(at(e)); });
  const end = e => {
    if (!dragging) return;
    dragging = false; scrub.classList.remove("active"); story.card.classList.remove("scrubbing");
    if (story.ended) { story.ended = false; story.card.classList.remove("ended"); }
    state.playing = true; startReading();
  };
  scrub.addEventListener("pointerup", end);
  scrub.addEventListener("pointercancel", end);
  scrub.addEventListener("click", e => e.stopPropagation());
}

// ---------- Likes, saves, sharing, reporting ----------
function needAccount(reason) { acct().open ? acct().open("signup", { reason }) : toast(reason); }
const formatCount = n => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n));

function refreshRail(story) {
  const id = story.data.id;
  story.els.likeBtn.classList.toggle("on", state.liked.has(id));
  story.els.likeBtn.querySelector("span").textContent = formatCount(story.data.like_count || 0);
  story.els.commentBtn.querySelector("span").textContent = formatCount(story.data.comment_count || 0);
  story.els.saveBtn.classList.toggle("on", state.saved.has(id));
}

async function toggleLike(story) {
  if (!user()) return needAccount("Create a free account to like stories and build your For You feed.");
  const id = story.data.id, on = !state.liked.has(id);
  on ? state.liked.add(id) : state.liked.delete(id);
  story.data.like_count = Math.max(0, (story.data.like_count || 0) + (on ? 1 : -1));
  refreshRail(story);
  if (on) story.els.likeBtn.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 320 });
  const q = on ? window.sb.from("likes").insert({ user_id: user().id, story_id: id })
               : window.sb.from("likes").delete().eq("user_id", user().id).eq("story_id", id);
  const { error } = await q;
  if (error && !/duplicate/i.test(error.message)) toast("Couldn't save that like. Try again.");
}

async function toggleSave(story) {
  if (!user()) return needAccount("Create a free account to save stories for later.");
  const id = story.data.id, on = !state.saved.has(id);
  on ? state.saved.add(id) : state.saved.delete(id);
  refreshRail(story);
  toast(on ? "Saved to your profile" : "Removed from saved");
  const q = on ? window.sb.from("saves").insert({ user_id: user().id, story_id: id })
               : window.sb.from("saves").delete().eq("user_id", user().id).eq("story_id", id);
  const { error } = await q;
  if (error && !/duplicate/i.test(error.message)) toast("Couldn't save that. Try again.");
}

async function shareStory(story) {
  const url = `${location.origin}${location.pathname}?story=${story.data.id}`;
  const text = `"${story.data.title}" on FlypBook. Scroll Like Shakespeare.`;
  try {
    if (navigator.share) await navigator.share({ title: story.data.title, text, url });
    else { await navigator.clipboard.writeText(url); toast("Link copied!"); }
    logEvent(story, "share");
  } catch {}
}

function reportStory(story) {
  if (!user()) return needAccount("Create a free account to report stories.");
  if (state.reported.has(story.data.id)) return toast("You already reported this story.");
  story.card.querySelector(".report-box")?.remove();
  const box = el("div", "report-box");
  box.innerHTML = `<strong>Report this story?</strong><p>It will be hidden while we review it.</p>`;
  for (const r of ["Inappropriate content", "Hateful or bullying", "Doesn't make sense", "Something else"]) {
    const b = el("button", "btn-secondary", r);
    b.addEventListener("click", async e => {
      e.stopPropagation();
      const { error } = await window.sb.from("reports").insert({ story_id: story.data.id, user_id: user().id, reason: r });
      box.remove();
      if (error && !/duplicate/i.test(error.message)) return toast("Couldn't send the report. Try again.");
      state.reported.add(story.data.id);
      pauseReading();
      story.card.classList.add("reported");
      story.card.append(el("div", "reported-note", "Thanks for reporting. This story is hidden while we review it. Swipe up to keep reading."));
    });
    box.append(b);
  }
  const cancel = el("button", "btn-link", "Cancel");
  cancel.addEventListener("click", e => { e.stopPropagation(); box.remove(); });
  box.append(cancel);
  box.addEventListener("click", e => e.stopPropagation());
  story.card.append(box);
}

function logEvent(story, event, progress) {
  if (!user() || !window.sb) return;
  story.logged = story.logged || new Set();
  if (story.logged.has(event)) return;
  story.logged.add(event);
  window.sb.from("story_events").insert({ user_id: user().id, story_id: story.data.id, event, progress }).then(() => {});
}

// ---------- Comments ----------
let commentStory = null;
const commentList = document.getElementById("comments-list");
const commentForm = document.getElementById("comment-form");
const commentInput = document.getElementById("comment-input");
const timeAgo = t => {
  const s = (Date.now() - new Date(t)) / 1000;
  return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};

async function openComments(story) {
  closeSheets();
  commentStory = story;
  commentsSheet.hidden = false;
  document.getElementById("comments-title").textContent = `${formatCount(story.data.comment_count || 0)} comments`;
  commentList.innerHTML = `<p class="fine">Loading...</p>`;
  commentForm.hidden = false;
  commentInput.placeholder = user() ? "Add a comment..." : "Log in to comment";
  let rows = [];
  try { rows = await api(`comment_feed?select=*&story_id=eq.${story.data.id}&order=created_at.desc&limit=100`); }
  catch { commentList.innerHTML = `<p class="fine">Comments are coming soon.</p>`; return; }
  if (commentStory !== story) return;
  commentList.replaceChildren();
  if (!rows.length) commentList.append(el("p", "fine", "No comments yet. Be the first!"));
  rows.forEach(c => commentList.append(commentRow(c)));
}

function commentRow(c) {
  const row = el("div", "cmt");
  row.append(el("div", "av", (c.username || "?")[0].toUpperCase()));
  const mid = el("div");
  mid.append(el("div", "nm", `@${c.username} · ${timeAgo(c.created_at)}`), el("div", "tx", c.body));
  const act = el("button", "act", user()?.id === c.user_id ? "Delete" : "Report");
  act.addEventListener("click", () => commentAction(c, row, act.textContent));
  row.append(mid, act);
  return row;
}

async function commentAction(c, row, kind) {
  if (!user()) return needAccount("Create a free account to report comments.");
  const sb = window.sb;
  const { error } = kind === "Delete"
    ? await sb.from("comments").delete().eq("id", c.id)
    : await sb.from("comment_reports").insert({ comment_id: c.id, user_id: user().id, reason: "reported in app" });
  if (error && !/duplicate/i.test(error.message)) return toast("Couldn't do that. Try again.");
  row.remove();
  if (commentStory) { commentStory.data.comment_count = Math.max(0, (commentStory.data.comment_count || 1) - 1); refreshRail(commentStory); }
  toast(kind === "Delete" ? "Comment deleted" : "Thanks! That comment is hidden for review.");
}

commentInput.addEventListener("focus", () => { if (!user()) { commentInput.blur(); needAccount("Create a free account to join the conversation."); } });
commentForm.addEventListener("submit", async e => {
  e.preventDefault();
  const body = commentInput.value.trim();
  if (!body || !commentStory) return;
  if (!user()) return needAccount("Create a free account to join the conversation.");
  const btn = commentForm.querySelector("button"); btn.disabled = true;
  const { data, error } = await window.sb.from("comments").insert({ story_id: commentStory.data.id, user_id: user().id, body }).select().single();
  btn.disabled = false;
  if (error) return toast(error.message.replace(/^.*?: /, ""));
  commentInput.value = "";
  commentList.querySelector(".fine")?.remove();
  commentList.prepend(commentRow({ ...data, username: acct().profile?.username || "you" }));
  commentStory.data.comment_count = (commentStory.data.comment_count || 0) + 1;
  refreshRail(commentStory);
  document.getElementById("comments-title").textContent = `${formatCount(commentStory.data.comment_count)} comments`;
});

// ---------- Discover ----------
async function openDiscover() {
  closeSheets();
  discoverSheet.hidden = false;
  const chips = document.getElementById("discover-genres");
  chips.replaceChildren(...GENRES.map(g => {
    const b = el("button", "chip-btn", g);
    b.setAttribute("aria-pressed", String(state.filter === g));
    b.addEventListener("click", () => { state.filter = state.filter === g ? null : g; discoverSheet.hidden = true; resetFeed().catch(showError); });
    return b;
  }));
  const top = document.getElementById("discover-top");
  try {
    const rows = await fetchStories("order=like_count.desc,created_at.desc&limit=10");
    top.replaceChildren(...rows.map(r => {
      const b = el("button", "list-item");
      b.append(el("span", null, r.title), el("em", null, `${formatCount(r.like_count || 0)} likes · ${r.genre}`));
      b.addEventListener("click", () => openStory(r.id));
      return b;
    }));
  } catch { top.innerHTML = `<p class="fine">Couldn't load top stories.</p>`; }
}

// ---------- Bottom navigation ----------
document.querySelectorAll("#bottomnav button").forEach(b => b.addEventListener("click", () => {
  const nav = b.dataset.nav;
  if (nav === "home") { const wasOpen = anySheetOpen(); closeSheets(); if (!wasOpen) feed.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (nav === "discover") return openDiscover();
  closeSheets();
  if (nav === "create") return acct().open?.(user() ? "request" : "signup", { reason: "Create an account to request your own stories." });
  if (nav === "inbox") return acct().open?.(user() ? "notifications" : "signup", { reason: "Create an account to get notified when your stories are ready." });
  if (nav === "me") return acct().open?.(user() ? "profile" : "signup");
}));

// ---------- Background media (lives inside each card) ----------
function pickVideo(story) {
  if (story.noVideo || !state.videos.length || (story.seed % 100) / 100 >= VIDEO_SHARE) return null;
  return state.videos[Math.floor(story.seed / 100) % state.videos.length];
}
function ensureMedia(story) {
  if (story.media) return;
  const video = pickVideo(story);
  if (video) {
    const v = document.createElement("video");
    v.muted = true; v.loop = true; v.playsInline = true;
    v.setAttribute("playsinline", ""); v.setAttribute("muted", "");
    v.preload = "metadata";
    if (video.poster) v.poster = video.poster;
    v.src = video.url;
    v.addEventListener("error", () => { releaseMedia(story); story.noVideo = true; ensureMedia(story); updateMedia(); }, { once: true });
    story.els.media.append(v);
    story.media = { kind: "video", el: v };
    story.els.credit.innerHTML = "";
    const a = el("a", null, `Video: ${video.by} / ${video.source || "Pixabay"}`);
    a.href = video.link; a.target = "_blank"; a.rel = "noopener";
    a.addEventListener("click", e => e.stopPropagation());
    story.els.credit.append(a);
  } else {
    const c = document.createElement("canvas");
    story.els.media.append(c);
    story.media = { kind: "scene", el: c, renderer: new SceneRenderer(c, story.seed) };
  }
}
function releaseMedia(story) {
  if (!story.media) return;
  if (story.media.kind === "video") { story.media.el.removeAttribute("src"); story.media.el.load(); }
  else story.media.renderer.dispose();
  story.els.media.replaceChildren();
  story.els.credit.replaceChildren();
  story.media = null;
}
/** Media only on the visible card and its neighbors. Only the visible one moves, and only while playing. */
function updateMedia() {
  const on = state.settings.bg !== "off";
  state.stories.forEach((story, i) => {
    const near = Math.abs(i - state.active) <= 1;
    if (!near || !on) { releaseMedia(story); return; }
    ensureMedia(story);
    const m = story.media, live = i === state.active && state.playing && !document.hidden;
    if (m.kind === "video") live ? m.el.play().catch(() => {}) : m.el.pause();
    else live ? m.renderer.start() : m.renderer.stop();
  });
}

// ---------- Captions ----------
function renderPage(story, pageIndex) {
  if (story.page === pageIndex) return;
  story.page = pageIndex;
  const { words, pages } = story.prepared;
  const page = pages[pageIndex];
  const p = el("p", "fresh");
  story.spans = {};
  for (let i = page.firstWord; i <= page.lastWord; i++) {
    const s = el("span", "w", words[i].text);
    story.spans[i] = s;
    p.append(s, " ");
  }
  story.els.captions.replaceChildren(p);
}
function showWord(story, i) {
  if (!story) return;
  const { words } = story.prepared;
  story.word = i;
  renderPage(story, words[i].page);
  for (const [k, s] of Object.entries(story.spans)) {
    const n = Number(k);
    s.classList.toggle("past", n < i);
    s.classList.toggle("now", n === i);
    s.classList.toggle("next", n > i);
  }
  const f = (i + 1) / words.length;
  story.els.fill.style.width = `${f * 100}%`;
  story.els.knob.style.left = `${f * 100}%`;
  story.els.pagec.textContent = `p. ${words[i].page + 1} / ${story.prepared.pages.length}`;
}

// ---------- End of story: the comprehension question ----------
function endStory(story) {
  if (!story) return;
  story.ended = true;
  story.card.classList.add("ended");
  story.card.classList.remove("paused");
  logEvent(story, "finish", 1);
  renderEndcard(story);
}
function renderEndcard(story) {
  const d = story.data, box = story.els.endcard;
  box.replaceChildren(); box.classList.remove("answered");
  const next = el("span", "next-hint");
  next.innerHTML = ICON.up;
  next.append("Swipe up for the next story");
  if (!d.question_prompt || !d.question_choices?.length) { box.append(el("strong", null, "The End"), next); return; }
  box.append(el("div", "q-label", "Quick question"), el("strong", "q-prompt", d.question_prompt));
  const choices = el("div", "q-choices");
  d.question_choices.forEach((c, i) => {
    const b = el("button", "q-choice", c);
    b.dataset.l = "ABCD"[i];
    b.addEventListener("click", () => answer(story, i));
    choices.append(b);
  });
  box.append(choices, el("div", "q-result"), next);
  const prev = state.answered.get(d.id);
  if (prev && prev.answer_index != null) showAnswer(story, prev, null);
}
async function answer(story, choice) {
  const box = story.els.endcard;
  if (box.classList.contains("answered")) return;
  box.classList.add("answered");
  let res;
  try {
    if (user()) {
      const { data, error } = await window.sb.rpc("submit_answer", { p_story: story.data.id, p_choice: choice });
      if (error) throw error;
      res = data;
      if (acct().profile) Object.assign(acct().profile, { points: data.points, current_streak: data.streak, reading_level: data.level });
    } else {
      res = await api("rpc/check_answer", { method: "POST", body: JSON.stringify({ p_story: story.data.id, p_choice: choice }) });
    }
  } catch (err) {
    console.error(err); box.classList.remove("answered");
    return toast("Couldn't check that answer. Try again.");
  }
  state.answered.set(story.data.id, res);
  showAnswer(story, res, choice);
}
function showAnswer(story, res, choice) {
  const box = story.els.endcard;
  box.classList.add("answered");
  box.querySelectorAll(".q-choice").forEach((b, i) => {
    b.disabled = true;
    b.classList.toggle("right", i === res.answer_index);
    b.classList.toggle("wrong", choice != null && i === choice && !res.correct);
  });
  const r = box.querySelector(".q-result");
  r.replaceChildren();
  r.append(el("strong", null, res.correct ? "Sharp reading. That's right." : "Not quite."));
  if (res.explanation) r.append(el("p", null, res.explanation));
  if (user() && !res.already && res.gained) r.append(el("p", "q-points", `+${res.gained} points · ${res.streak}-day streak`));
  else if (!user() && choice != null) {
    const join = el("button", "btn-link", "Sign up to earn points and streaks");
    join.addEventListener("click", () => needAccount("Create a free account to earn points and keep a reading streak."));
    r.append(join);
  }
}

// ---------- Playback: pause/play controls the voice AND the background together ----------
const playOpts = () => ({ rate: Number(state.settings.rate), narration: state.settings.narration === "on" });
const INTRO_MS = 1700;

function startReading() {
  const story = state.stories[state.active];
  if (!story || story.card.classList.contains("reported") || breakShowing || state.awaitingStart) return;
  if (story.ended) { story.ended = false; story.card.classList.remove("ended"); story.word = -1; }
  state.playing = true;
  story.card.classList.remove("paused");
  story.startedAt = story.startedAt || Date.now();
  updateMedia();
  // First time on a story: show its title like a chapter heading, then start reading.
  if (!story.introDone) {
    story.introDone = true;
    story.card.classList.add("intro-on");
    story.introTimer = setTimeout(() => {
      story.card.classList.remove("intro-on");
      if (state.stories[state.active] === story && state.playing) beginNarration(story);
    }, INTRO_MS);
    return;
  }
  beginNarration(story);
}
function beginNarration(story) {
  story.card.classList.add("reading");
  narrator.play(story.prepared, Math.max(0, story.word), playOpts());
}
function pauseReading() {
  state.playing = false;
  const s = state.stories[state.active];
  if (s?.introTimer) { clearTimeout(s.introTimer); s.introTimer = null; s.card.classList.remove("intro-on"); }
  narrator.stop();
  const story = state.stories[state.active];
  if (story && !story.ended) story.card.classList.add("paused");
  updateMedia();
}
function togglePlay(story) {
  if (state.stories[state.active] !== story) return;
  if (story.ended) return startReading();
  state.playing ? pauseReading() : startReading();
}

function setActive(index) {
  if (index === state.active) return;
  const prev = state.stories[state.active];
  if (prev) {
    narrator.stop();
    prev.card.classList.remove("paused");
    if (prev.introTimer) { clearTimeout(prev.introTimer); prev.introTimer = null; prev.card.classList.remove("intro-on"); }
    const progress = prev.word > 0 ? prev.word / prev.prepared.words.length : 0;
    if (!prev.ended && prev.startedAt && progress < 0.3) logEvent(prev, "skip", progress);
  }
  state.active = index;
  state.viewed++;
  state.playing = true;                    // like TikTok: the next story just plays
  if (maybeBreak()) return;
  updateMedia();
  startReading();
  if (index >= state.stories.length - 3) loadMore().catch(showError);
}

const observer = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) setActive(Number(e.target.dataset.index));
}, { root: feed, threshold: 0.6 });
let scrollTimer;
feed.addEventListener("scroll", () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(syncActiveFromScroll, 120); });
function syncActiveFromScroll() {
  const i = Math.round(feed.scrollTop / Math.max(1, feed.clientHeight));
  if (i >= 0 && i < state.stories.length) setActive(i);
}

// ---------- "Take a break?" (healthier than endless scrolling) ----------
let breakShowing = false;
function maybeBreak() {
  const mins = (Date.now() - state.lastBreak) / 60000;
  if (state.viewed < BREAK_AFTER.stories && mins < BREAK_AFTER.minutes) return false;
  state.viewed = 0; state.lastBreak = Date.now();
  breakShowing = true;
  narrator.stop(); state.playing = false; updateMedia();
  const card = el("div", "card break-card");
  card.style.cssText = "position:absolute;inset:0;z-index:12;background:rgba(11,8,18,0.94)";
  const layer = el("div", "layer");
  layer.append(el("div", "break-kicker", `${BREAK_AFTER.stories} stories in`), el("h2", null, "Bookmark it here?"),
    el("p", null, "You've been reading for a while. Stretch, grab some water, or keep going. Your call."));
  const keep = el("button", "btn-primary", "Keep reading");
  const rest = el("button", "btn-secondary", "Take a break");
  keep.addEventListener("click", () => { card.remove(); breakShowing = false; startReading(); });
  rest.addEventListener("click", () => { layer.replaceChildren(el("h2", null, "See you soon"), el("p", null, "Your place is saved. Swipe up when you're back.")); setTimeout(() => { card.remove(); breakShowing = false; }, 2500); });
  layer.append(keep, rest);
  card.append(layer);
  app.append(card);
  return true;
}

// Keyboard (computers): space = play/pause, arrows = next/previous story
document.addEventListener("keydown", e => {
  if (e.target.closest?.("button, input, textarea, select")) return;
  if (e.key === " ") { e.preventDefault(); const s = state.stories[state.active]; if (s) togglePlay(s); }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); feed.scrollBy({ top: (e.key === "ArrowDown" ? 1 : -1) * feed.clientHeight, behavior: "smooth" }); }
});
// Leaving the app pauses everything.
document.addEventListener("visibilitychange", () => { if (document.hidden && state.playing) pauseReading(); });

function showError(err) {
  console.error(err);
  splashStatus.textContent = "Couldn't load stories. Check your connection and refresh.";
}

// ---------- Install as an app (no app store) ----------
let installPrompt = null;
const installRow = document.getElementById("install-row");
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; showInstall(); });
function showInstall() {
  if (standalone || !installRow) return;
  installRow.hidden = false;
  const btn = installRow.querySelector("button"), hint = installRow.querySelector(".fine");
  if (installPrompt) {
    btn.hidden = false; hint.hidden = true;
    btn.onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; installRow.hidden = true; };
  } else if (isIOS) { btn.hidden = true; hint.hidden = false; }
  else installRow.hidden = true;
}
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// Hooks for account.js
window.App = {
  toast, openStory,
  onAuth(_acct, opts = {}) {
    if (!state.booted) return;
    if ((user()?.id || null) !== state.feedUser || opts.genresChanged) resetFeed().catch(showError);
    else showReadyStories();
  },
};

// ---------- Start: play immediately ----------
window.accountReady = new Promise(r => { window.resolveAccount = r; });
async function init() {
  applySettings();
  showInstall();
  const wait = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  const [, , , soundOk] = await Promise.all([loadVideos(), wait(window.gamesReady, 4000), wait(window.accountReady, 3000), canPlaySound()]);
  state.awaitingStart = !soundOk;
  try {
    await resetFeed();
    state.booted = true;
    if (state.awaitingStart) { askForStartTap(); return; }
    splash.classList.add("gone");
    startReading();                       // plays with sound right away
  } catch (err) {
    showError(err);
  }
}
init();
