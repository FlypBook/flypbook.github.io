// FlypBook: Scroll Like Shakespeare. Feed app.
// Full-screen story cards with their own background video/animation (it swipes with the card),
// a title card intro, narration with big karaoke captions, likes/share/report, an end-of-story
// comprehension question, and a personalized For You feed for signed-in readers.

const CONFIG = window.FLYPBOOK_CONFIG;
const PAGE_SIZE = 10;
const VIDEO_SHARE = 0.3;   // share of stories that get a real video clip (the rest get a gameplay-style scene)
const EXPLORE_EVERY = 5;   // For You: every 5th story is a "something different" pick (about 20%)
const LEVEL_LABEL = { easy: "Easy read", medium: "Medium read", challenging: "Challenging" };
const LEVEL_NUM = { easy: 1, medium: 2, challenging: 3 };
const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M16 6l-4-4-4 4M12 2v13"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4M4 4h13l-2 4 2 4H4"/></svg>',
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
  mode: "latest",       // "latest" (guests) or "foryou" (signed in)
  queue: [],            // For You: ranked stories not yet shown
  feedUser: null,       // whose feed is built right now
  liked: new Set(),
  reported: new Set(),
  answered: new Map(),  // story id -> answer result
};

const narrator = new Narrator({
  onWord: i => showWord(state.stories[state.active], i),
  onEnd: () => endStory(state.stories[state.active]),
});

const acct = () => window.Account || {};
const user = () => acct().user || null;

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
  for (const seg of document.querySelectorAll("#settings .seg")) {
    for (const b of seg.querySelectorAll("button")) {
      b.setAttribute("aria-pressed", String(b.dataset.value === state.settings[seg.dataset.setting]));
    }
  }
  updateMedia();
}
document.querySelectorAll("#settings .seg").forEach(seg => seg.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  state.settings[seg.dataset.setting] = b.dataset.value;
  saveSettings();
  applySettings();
  if (seg.dataset.setting !== "bg" && state.playing) startReading();  // restart with new voice/speed
}));
document.getElementById("settings-btn").addEventListener("click", () => { acct().close?.(); settingsSheet.hidden = !settingsSheet.hidden; });
document.getElementById("settings-close").addEventListener("click", () => { settingsSheet.hidden = true; });

function toast(text) {
  const t = el("div", "toast", text);
  app.append(t);
  setTimeout(() => t.classList.add("out"), 2200);
  setTimeout(() => t.remove(), 2700);
}

// ---------- Loading stories from Supabase ----------
async function api(path, init) {
  const res = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${path}`, {
    ...init, headers: { apikey: CONFIG.supabaseKey, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  if (!res.ok) throw Object.assign(new Error(`Couldn't load stories (${res.status})`), { status: res.status });
  return res.json();
}

const BASE_FIELDS = "id,title,body,genre,tone,reading_level,est_read_seconds,requested_by,created_at,like_count,question_prompt,question_choices";
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
    let rows;
    if (state.mode === "foryou") {
      rows = state.queue.splice(0, PAGE_SIZE);
      if (!state.queue.length) state.done = true;
    } else {
      const offset = state.stories.filter(s => !s.pinned).length;
      rows = await fetchStories(`order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`);
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
  if (banner) state.stories[i].card.querySelector(".ready-banner")?.remove(), state.stories[i].card.append(el("div", "ready-banner", banner));
  feed.scrollTo({ top: i * feed.clientHeight, behavior: "smooth" });
  setTimeout(syncActiveFromScroll, 700);
}

function reindex() {
  state.stories.forEach((s, i) => { s.card.dataset.index = i; });
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

// ---------- For You: rank stories by what this reader engages with (no AI, runs on the phone) ----------
async function buildForYou() {
  const sb = window.sb, me = user();
  const [cands, likes, events, answers] = await Promise.all([
    fetchStories("order=created_at.desc&limit=200"),
    sb.from("likes").select("story_id"),
    sb.from("story_events").select("story_id,event").limit(2000),
    sb.from("answers").select("story_id,correct"),
  ]);
  const byId = new Map(cands.map(s => [s.id, s]));
  state.liked = new Set((likes.data || []).map(l => l.story_id));
  const aff = {};
  const bump = (s, g, t) => { if (!s) return; aff["g:" + s.genre] = (aff["g:" + s.genre] || 0) + g; aff["t:" + s.tone] = (aff["t:" + s.tone] || 0) + t; };
  for (const g of acct().profile?.favorite_genres || []) aff["g:" + g] = (aff["g:" + g] || 0) + 2;
  for (const l of likes.data || []) bump(byId.get(l.story_id), 3, 1.5);
  const finished = new Set();
  for (const e of events.data || []) {
    const s = byId.get(e.story_id);
    if (e.event === "finish") { finished.add(e.story_id); bump(s, 2, 1); }
    else if (e.event === "share") bump(s, 3, 1.5);
    else if (e.event === "skip") bump(s, -1, -0.5);
  }
  for (const a of answers.data || []) { if (a.correct) bump(byId.get(a.story_id), 0.5, 0.2); finished.add(a.story_id); }
  const level = acct().profile?.reading_level || 1.5, now = Date.now();
  const scored = cands.filter(s => !finished.has(s.id)).map(s => {
    const ageDays = (now - new Date(s.created_at)) / 864e5;
    const score = (aff["g:" + s.genre] || 0) + 0.5 * (aff["t:" + s.tone] || 0)
      + Math.max(0, 1 - Math.abs((LEVEL_NUM[s.reading_level] || 2) - level)) * 0.8   // near my reading level
      + Math.max(0, 1 - ageDays / 7)                                               // fresh
      + Math.log1p(s.like_count || 0) * 0.3;                                        // popular
    return { s, score };
  }).sort((a, b) => b.score - a.score);
  // Mix in discovery: every EXPLORE_EVERY-th slot is a random pick from the lower-ranked half.
  const top = scored.map(x => x.s), queue = [];
  const tail = top.splice(Math.ceil(top.length / 2));
  for (let i = 0; top.length || tail.length; i++) {
    const explore = (i % EXPLORE_EVERY === EXPLORE_EVERY - 1 && tail.length) || !top.length;
    queue.push(explore ? tail.splice(Math.floor(Math.random() * tail.length), 1)[0] : top.shift());
  }
  // Everything finished already? Show the newest again rather than an empty feed.
  return queue.length ? queue : cands;
}

/** Rebuild the whole feed (first load, or after logging in/out). */
async function resetFeed() {
  narrator.stop(); state.playing = false;
  state.stories.forEach(releaseMedia);
  state.stories = []; state.active = -1; state.done = false; state.queue = [];
  feed.replaceChildren(); feed.scrollTop = 0;
  state.feedUser = user()?.id || null;
  state.mode = state.feedUser ? "foryou" : "latest";
  if (state.mode === "foryou") {
    try { state.queue = await buildForYou(); } catch (err) { console.error(err); state.mode = "latest"; }
    const answers = await window.sb.from("answers").select("story_id,correct").then(r => r.data || []);
    state.answered = new Map(answers.map(a => [a.story_id, a]));
    const reports = await window.sb.from("reports").select("story_id").then(r => r.data || []);
    state.reported = new Set(reports.map(r => r.story_id));
  } else {
    state.liked = new Set(); state.answered = new Map(); state.reported = new Set();
  }
  const shared = new URLSearchParams(location.search).get("story");  // share links: ?story=<id>
  if (shared && /^[0-9a-f-]{36}$/i.test(shared)) await addStories(await fetchStories(`id=eq.${shared}`), true);
  await loadMore();
  if (!state.stories.length) addMessageCard("No stories yet", "The first stories are on their way. Check back soon.");
  syncActiveFromScroll();
  showReadyStories();
}

/** "Your story is ready": pin the newest finished request to the top of the feed. */
async function showReadyStories() {
  const ready = (acct().unread || []).filter(n => n.type === "story_ready" && n.story_id);
  if (!ready.length) return;
  await openStory(ready[0].story_id, "✨ Your requested story is ready!");
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

function buildCard(story) {
  const d = story.data;
  const card = el("article", "card");

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
  if (d.username) sub.append("requested this · ");
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

  // Like / share / report rail
  const rail = el("div", "rail");
  const likeBtn = railButton(ICON.heart, d.like_count || 0, "Like");
  likeBtn.classList.add("like");
  const shareBtn = railButton(ICON.share, "Share", "Share");
  const reportBtn = railButton(ICON.flag, "Report", "Report this story");
  rail.append(likeBtn, shareBtn, reportBtn);
  likeBtn.addEventListener("click", e => { e.stopPropagation(); toggleLike(story); });
  shareBtn.addEventListener("click", e => { e.stopPropagation(); shareStory(story); });
  reportBtn.addEventListener("click", e => { e.stopPropagation(); reportStory(story); });

  const endcard = el("div", "endcard");
  endcard.addEventListener("click", e => e.stopPropagation());

  const credit = el("div", "credit-line");

  card.append(media, scrim, progress, layer, playmark, rail, endcard, credit);
  card.addEventListener("click", () => togglePlay(story));
  story.card = card;
  story.els = { media, captions, bar, credit, endcard, likeBtn };
  story.page = -1;
  observer.observe(card);
  refreshLike(story);
}

function railButton(icon, label, aria) {
  const b = el("button", "rail-btn");
  b.setAttribute("aria-label", aria);
  b.innerHTML = icon;
  b.append(el("span", null, String(label)));
  return b;
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

// ---------- Likes, sharing, reporting ----------
function needAccount(reason) {
  acct().open ? acct().open("signup", { reason }) : toast(reason);
}

function refreshLike(story) {
  const on = state.liked.has(story.data.id);
  story.els.likeBtn.classList.toggle("on", on);
  story.els.likeBtn.querySelector("span").textContent = formatCount(story.data.like_count || 0);
}
const formatCount = n => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(n));

async function toggleLike(story) {
  if (!user()) return needAccount("Create a free account to like stories and build your For You feed.");
  const id = story.data.id, on = !state.liked.has(id);
  on ? state.liked.add(id) : state.liked.delete(id);
  story.data.like_count = Math.max(0, (story.data.like_count || 0) + (on ? 1 : -1));
  refreshLike(story);
  if (on) story.els.likeBtn.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }], { duration: 320 });
  const q = on ? window.sb.from("likes").insert({ user_id: user().id, story_id: id })
               : window.sb.from("likes").delete().eq("user_id", user().id).eq("story_id", id);
  const { error } = await q;
  if (error && !/duplicate/i.test(error.message)) toast("Couldn't save that like. Try again.");
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
  const box = el("div", "report-box");
  box.innerHTML = `<strong>Report this story?</strong><p>It will be hidden while we review it.</p>`;
  const reasons = ["Inappropriate content", "Hateful or bullying", "Doesn't make sense", "Something else"];
  for (const r of reasons) {
    const b = el("button", "btn-secondary", r);
    b.addEventListener("click", async e => {
      e.stopPropagation();
      const { error } = await window.sb.from("reports").insert({ story_id: story.data.id, user_id: user().id, reason: r });
      box.remove();
      if (error && !/duplicate/i.test(error.message)) return toast("Couldn't send the report. Try again.");
      state.reported.add(story.data.id);
      narrator.stop(); state.playing = false;
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

// Reading signals for the For You feed (signed-in readers only).
function logEvent(story, event, progress) {
  if (!user() || !window.sb) return;
  story.logged = story.logged || new Set();
  if (story.logged.has(event)) return;
  story.logged.add(event);
  window.sb.from("story_events").insert({ user_id: user().id, story_id: story.data.id, event, progress }).then(() => {});
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
  box.replaceChildren();
  const next = el("span", "next-hint");
  next.innerHTML = ICON.up;
  next.append("Swipe up for the next story");
  if (!d.question_prompt || !d.question_choices?.length) {
    box.append(el("strong", null, "The End"), next);
    return;
  }
  box.append(el("div", "q-label", "Quick question"), el("strong", "q-prompt", d.question_prompt));
  const choices = el("div", "q-choices");
  d.question_choices.forEach((c, i) => {
    const b = el("button", "q-choice", c);
    b.addEventListener("click", () => answer(story, i));
    choices.append(b);
  });
  const result = el("div", "q-result");
  box.append(choices, result, next);
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
    console.error(err);
    box.classList.remove("answered");
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
  r.append(el("strong", null, res.correct ? "Nice read! ✅" : "Not quite."));
  if (res.explanation) r.append(el("p", null, res.explanation));
  if (user() && !res.already && res.gained) r.append(el("p", "q-points", `+${res.gained} points · ${res.streak}🔥 day streak`));
  else if (!user() && choice != null) {
    const join = el("button", "btn-link", "Sign up to earn points and streaks");
    join.addEventListener("click", () => needAccount("Create a free account to earn points and keep a reading streak."));
    r.append(join);
  }
}

// ---------- Playback ----------
function startReading() {
  const story = state.stories[state.active];
  if (!story || story.card.classList.contains("reported")) return;
  if (story.ended) {  // replay from the start
    story.ended = false;
    story.card.classList.remove("ended");
    story.word = -1;
  }
  story.card.classList.add("started");
  story.card.classList.remove("paused");
  story.startedAt = story.startedAt || Date.now();
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
  if (acct().isOpen?.()) { acct().close(); return; }
  if (state.stories[state.active] !== story) return;
  state.playing = !state.playing || story.ended;
  if (state.playing) startReading(); else pauseReading();
}

function setActive(index) {
  if (index === state.active) return;
  const prev = state.stories[state.active];
  if (prev) {
    narrator.stop();
    prev.card.classList.remove("paused");
    // Swiped away early? That's a "skip" signal for the For You feed.
    const progress = prev.word > 0 ? prev.word / prev.prepared.words.length : 0;
    if (!prev.ended && prev.startedAt && progress < 0.3) logEvent(prev, "skip", progress);
  }
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
  if (e.target.closest?.("button, input, textarea, select")) return;
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
  } else if (isIOS) {
    btn.hidden = true; hint.hidden = false;
  } else installRow.hidden = true;
}
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// Hooks for account.js
window.App = {
  toast,
  openStory,
  onAuth(_acct, opts = {}) {
    const id = user()?.id || null;
    if (!state.booted) return;
    if (id !== state.feedUser || opts.genresChanged) resetFeed().catch(showError);
    else showReadyStories();
  },
};

// ---------- Start ----------
window.accountReady = new Promise(r => { window.resolveAccount = r; });
async function init() {
  applySettings();
  showInstall();
  const wait = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  // Give the 3D games (and the saved login) a few seconds to load; the feed works without them.
  await Promise.all([loadVideos(), wait(window.gamesReady, 4000), wait(window.accountReady, 3000)]);
  try {
    await resetFeed();
    state.booted = true;
    splash.classList.add("gone");
  } catch (err) {
    showError(err);
  }
}
init();
