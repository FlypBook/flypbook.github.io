// FlypBook: Scroll Like Shakespeare. Feed app.
// Full-screen story cards with their own background video/animation (it swipes with the card),
// a title card intro, narration with big karaoke captions, and an end card.

const CONFIG = window.FLYPBOOK_CONFIG;
const PAGE_SIZE = 10;
const VIDEO_SHARE = 0.3;   // share of stories that get a real video clip (the rest get a gameplay-style scene)
const LEVEL_LABEL = { easy: "Easy read", medium: "Medium read", challenging: "Challenging" };
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
};

const app = document.getElementById("app");
const feed = document.getElementById("feed");
const splash = document.getElementById("splash");
const splashStatus = document.getElementById("splash-status");
const settingsSheet = document.getElementById("settings");

const state = {
  stories: [],          // { data, prepared, card, els, word, ended, media }
  active: -1,
  playing: false,       // the reader wants narration running (persists across swipes)
  loading: false,
  done: false,
  videos: [],
  settings: loadSettings(),
};

const narrator = new Narrator({
  onWord: i => showWord(state.stories[state.active], i),
  onEnd: () => endStory(state.stories[state.active]),
});

// ---------- Settings (saved on this device only) ----------
function loadSettings() {
  const defaults = {
    narration: "on",
    rate: "1",
    bg: matchMedia("(prefers-reduced-motion: reduce)").matches ? "dim" : "on",
  };
  try { return { ...defaults, ...JSON.parse(localStorage.getItem("flypbook-settings") || "{}") }; }
  catch { return defaults; }
}
function saveSettings() {
  try { localStorage.setItem("flypbook-settings", JSON.stringify(state.settings)); } catch {}
}
function applySettings() {
  app.dataset.bg = state.settings.bg;
  for (const seg of document.querySelectorAll(".seg")) {
    for (const b of seg.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(b.dataset.value === state.settings[seg.dataset.setting]));
    }
  }
  updateMedia();
}
document.querySelectorAll(".seg").forEach(seg => seg.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  state.settings[seg.dataset.setting] = b.dataset.value;
  saveSettings();
  applySettings();
  if (seg.dataset.setting !== "bg" && state.playing) startReading();  // restart with new voice/speed
}));
document.getElementById("settings-btn").addEventListener("click", () => { settingsSheet.hidden = !settingsSheet.hidden; });
document.getElementById("settings-close").addEventListener("click", () => { settingsSheet.hidden = true; });

// ---------- Loading stories from Supabase ----------
async function api(path) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${path}`, { headers: { apikey: CONFIG.supabaseKey } });
  if (!res.ok) throw Object.assign(new Error(`Couldn't load stories (${res.status})`), { status: res.status });
  return res.json();
}

const BASE_FIELDS = "id,title,body,genre,tone,reading_level,est_read_seconds,requested_by,created_at";
let storyFields = BASE_FIELDS + ",audio_url,word_times";

async function fetchStories(query) {
  try {
    return await api(`stories?select=${storyFields}&${query}`);
  } catch (err) {
    if (err.status !== 400 || storyFields === BASE_FIELDS) throw err;
    storyFields = BASE_FIELDS;  // database doesn't have narration columns yet
    return api(`stories?select=${storyFields}&${query}`);
  }
}

async function loadMore() {
  if (state.loading || state.done) return;
  state.loading = true;
  try {
    const offset = state.stories.filter(s => !s.pinned).length;
    const rows = await fetchStories(`order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`);
    if (rows.length < PAGE_SIZE) state.done = true;
    await addStories(rows.filter(r => !state.stories.some(s => s.data.id === r.id)));
    if (state.done) addMessageCard("You're all caught up", "New stories drop every few hours. Come back soon.");
  } finally {
    state.loading = false;
  }
}

async function addStories(rows, pinned = false) {
  const ids = [...new Set(rows.map(r => r.requested_by).filter(Boolean))];
  const names = {};
  if (ids.length) {
    for (const u of await api(`public_usernames?select=id,username&id=in.(${ids.join(",")})`)) names[u.id] = u.username;
  }
  for (const row of rows) {
    const prepared = prepareStory(row.body);
    prepared.audioUrl = row.audio_url || null;
    prepared.times = row.word_times || null;
    const story = { data: { ...row, username: names[row.requested_by] }, prepared, word: -1, ended: false, pinned };
    story.seed = hash(row.id);
    buildCard(story);
    state.stories.push(story);
  }
  updateMedia();
}

async function loadVideos() {
  try {
    const res = await fetch("videos.json", { cache: "no-cache" });
    if (res.ok) state.videos = await res.json();
  } catch {}
}

function hash(text) {
  let h = 2166136261;
  for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------- Cards ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function buildCard(story) {
  const d = story.data;
  const card = el("article", "card");
  card.dataset.index = state.stories.length;

  const media = el("div", "media");
  const scrim = el("div", "scrim");
  const progress = el("div", "progress");
  const bar = el("i");
  progress.append(bar);

  const layer = el("div", "layer");

  // Title card
  const tc = el("div", "titlecard");
  const head = el("div", "tc-head");
  const avatar = el("div", "avatar", d.username ? d.username[0].toUpperCase() : "F");
  const who = el("div", "tc-who");
  who.append(el("strong", null, d.username ? "@" + d.username : "FlypBook Stories"));
  const sub = el("span");
  if (d.username) { sub.append("requested this · "); }
  sub.append(`${Math.max(1, Math.round(d.est_read_seconds / 60))} min story`);
  who.append(sub);
  head.append(avatar, who);
  const tags = el("div", "tc-tags");
  tags.append(el("span", "tag", d.genre), el("span", "tag", LEVEL_LABEL[d.reading_level] || d.reading_level),
              el("span", "tag ai", "AI-generated"));
  tc.append(head, el("h2", "tc-title", d.title), tags);

  const mini = el("div", "mini");
  mini.append(el("span", "tag ai", "AI"), el("span", null, d.title));

  const captions = el("div", "captions");
  const cta = el("div", "cta");
  cta.innerHTML = ICON.play;
  cta.append("Tap to read along");
  layer.append(tc, mini, captions, cta);

  const playmark = el("div", "playmark");
  playmark.innerHTML = ICON.play;

  const endcard = el("div", "endcard");
  const endHint = el("span");
  endHint.innerHTML = ICON.up;
  endHint.append("Swipe up for the next story");
  endcard.append(el("strong", null, "The End"), endHint);

  const credit = el("div", "credit-line");

  card.append(media, scrim, progress, layer, playmark, endcard, credit);
  card.addEventListener("click", () => togglePlay(story));
  story.card = card;
  story.els = { media, captions, bar, credit };
  story.page = -1;
  insertBeforeMessage(card);
  observer.observe(card);
}

function addMessageCard(title, text) {
  if (feed.querySelector(".message-card")) return;
  const card = el("article", "card message-card");
  const layer = el("div", "layer");
  layer.append(el("h2", null, title), el("p", null, text));
  card.append(layer);
  feed.append(card);
}

function insertBeforeMessage(card) {
  const msg = feed.querySelector(".message-card");
  if (msg) feed.insertBefore(card, msg); else feed.append(card);
}

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
    // If the video can't load, swap in a code-drawn scene.
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

/** Keep media only on the visible card and its neighbors; animate only the visible one. */
function updateMedia() {
  const on = state.settings.bg !== "off";
  state.stories.forEach((story, i) => {
    const near = Math.abs(i - state.active) <= 1;
    if (!near || !on) { releaseMedia(story); return; }
    ensureMedia(story);
    const m = story.media;
    if (i === state.active) {
      if (m.kind === "video") m.el.play().catch(() => {});
      else m.renderer.start();
    } else if (m.kind === "video") m.el.pause();
    else m.renderer.stop();
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
  story.els.bar.style.width = `${((i + 1) / words.length) * 100}%`;
}

function endStory(story) {
  if (!story) return;
  story.ended = true;
  story.card.classList.add("ended");
  story.card.classList.remove("paused");
}

// ---------- Playback ----------
function startReading() {
  const story = state.stories[state.active];
  if (!story) return;
  if (story.ended) {  // replay from the start
    story.ended = false;
    story.card.classList.remove("ended");
    story.word = -1;
  }
  story.card.classList.add("started");
  story.card.classList.remove("paused");
  narrator.play(story.prepared, Math.max(0, story.word), {
    rate: Number(state.settings.rate),
    narration: state.settings.narration === "on",
  });
}

function pauseReading() {
  narrator.stop();
  const story = state.stories[state.active];
  if (story && story.card.classList.contains("started") && !story.ended) story.card.classList.add("paused");
}

function togglePlay(story) {
  if (!settingsSheet.hidden) { settingsSheet.hidden = true; return; }
  if (state.stories[state.active] !== story) return;
  state.playing = !state.playing || story.ended;
  if (state.playing) startReading(); else pauseReading();
}

function setActive(index) {
  if (index === state.active) return;
  const prev = state.stories[state.active];
  if (prev) { narrator.stop(); prev.card.classList.remove("paused"); }
  state.active = index;
  updateMedia();
  if (state.playing) startReading();
  if (index >= state.stories.length - 3) loadMore().catch(showError);
}

const observer = new IntersectionObserver(entries => {
  for (const e of entries) if (e.isIntersecting) setActive(Number(e.target.dataset.index));
}, { root: feed, threshold: 0.6 });

// Backup for the observer: work out the visible card from the scroll position.
let scrollTimer;
feed.addEventListener("scroll", () => {
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(syncActiveFromScroll, 120);
});
function syncActiveFromScroll() {
  const i = Math.round(feed.scrollTop / Math.max(1, feed.clientHeight));
  if (i >= 0 && i < state.stories.length) setActive(i);
}

// Keyboard (computers): space = play/pause, arrows = next/previous story
document.addEventListener("keydown", e => {
  if (e.target.closest?.("button")) return;
  if (e.key === " ") { e.preventDefault(); const s = state.stories[state.active]; if (s) togglePlay(s); }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    feed.scrollBy({ top: (e.key === "ArrowDown" ? 1 : -1) * feed.clientHeight, behavior: "smooth" });
  }
});

// Leaving the app pauses reading and videos.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (state.playing) { state.playing = false; pauseReading(); }
    state.stories.forEach(s => s.media?.kind === "video" && s.media.el.pause());
  } else updateMedia();
});

function showError(err) {
  console.error(err);
  splashStatus.textContent = "Couldn't load stories. Check your connection and refresh.";
}

// ---------- Start ----------
async function init() {
  applySettings();
  // Give the 3D games up to 4s to load; if they can't (old phone, offline), the 2D scenes are used.
  await Promise.all([loadVideos(), Promise.race([window.gamesReady, new Promise(r => setTimeout(r, 4000))])]);
  const shared = new URLSearchParams(location.search).get("story");  // share links: ?story=<id>
  try {
    if (shared && /^[0-9a-f-]{36}$/i.test(shared)) {
      await addStories(await fetchStories(`id=eq.${shared}`), true);
    }
    await loadMore();
    if (!state.stories.length) addMessageCard("No stories yet", "The first stories are on their way. Check back soon.");
    syncActiveFromScroll();
    splash.classList.add("gone");
  } catch (err) {
    showError(err);
  }
}
init();
