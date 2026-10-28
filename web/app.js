// FlypBook: Scroll Like Shakespeare. Feed app.
// TikTok-inspired: full-screen cards that autoplay (muted until the first tap, as browsers require),
// a right-side rail (like / comment / save / share), bottom-left info, a bottom nav, feed tabs, and a
// comment drawer. Improvements: captions never sit under buttons, a scrubbable progress bar with time,
// tap-to-pause stops EVERYTHING (voice + background), and gentle "take a break" reminders.

const CONFIG = window.FLYPBOOK_CONFIG;
const PAGE_SIZE = 10;
// Share of stories that get a real video clip (the rest get a code-drawn scene), per background setting.
const VIDEO_SHARE = { mix: 0.3, games: 0, real: 1, calm: 0.5 };
// Calm / satisfying scenes (Settings > Background > Calm). Everything else counts as gameplay.
const CALM_SCENES = new Set(["OrbsScene", "WavesScene", "PendulumScene", "MarbleRun", "HydraulicPress", "SoapCut",
  "BallPour", "PotteryWheel", "LaserEngrave", "Stack3D", "Domino3D", "JellyHop", "SandSliceScene"]);
// For You: every Nth story is a "something different" pick, per Settings > Feed > Discovery.
const EXPLORE_EVERY = { less: 8, normal: 5, more: 3 };
const SHORT_SECONDS = 180;   // "quick reads" are under 3 minutes
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

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const SETTING_DEFAULTS = {
  narration: "on", rate: "1", voice: "any",
  capsize: "m", capstyle: "varied", hlcolor: "varied", contrast: "normal",
  bg: reduceMotion ? "dim" : "on", bgtype: "mix", motion: reduceMotion ? "reduce" : "auto",
  autoplay: "on", length: "any", readers: "on", explore: "normal", hide: [],
  breaks: "25",
  notify_follows: true, notify_sends: true, notify_posts: true,
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

// ---------- Settings (saved on this device, and synced to the account when signed in) ----------
// Each setting: [key, label, [[value, button text], ...]]. Rendered into the Settings sheet.
const SETTINGS_UI = [
  ["Listening", [
    ["narration", "Narration", [["on", "Voice on"], ["off", "Read silently"]]],
    ["rate", "Speed", [["0.8", "0.8×"], ["1", "1×"], ["1.2", "1.2×"], ["1.5", "1.5×"]]],
    ["voice", "Favorite narrator", [["any", "Any"], ["af_heart", "Heart"], ["af_heart,af_sky", "Sky"], ["am_liam", "Liam"], ["phone", "Phone"]],
      "Stories read by your favorite show up more. Phone uses your phone's own voice for every story."],
  ]],
  ["Captions", [
    ["capsize", "Text size", [["s", "S"], ["m", "M"], ["l", "L"], ["xl", "XL"]]],
    ["capstyle", "Look", [["varied", "New look each story"], ["classic", "Always classic"]]],
    ["hlcolor", "Highlight color", [["varied", "Mix"], ["#f5d35c", "Butter"], ["#bba6f2", "Lilac"], ["#ff8a65", "Coral"], ["#9fe3b8", "Mint"]]],
    ["contrast", "Contrast", [["normal", "Normal"], ["high", "High"]]],
  ]],
  ["Background", [
    ["bg", "Background", [["on", "On"], ["dim", "Dim"], ["off", "Off"]]],
    ["bgtype", "What plays", [["mix", "Mix"], ["games", "Gameplay"], ["real", "Real clips"], ["calm", "Calm"]]],
    ["motion", "Motion", [["auto", "Full"], ["reduce", "Reduced"]]],
  ]],
  ["Feed", [
    ["autoplay", "Next story", [["on", "Plays by itself"], ["off", "Waits for a tap"]]],
    ["length", "Story length", [["any", "Any"], ["short", "Quick"], ["long", "Longer"]]],
    ["readers", "Stories by readers", [["on", "Show"], ["off", "Hide"]]],
    ["explore", "Discovery", [["less", "Less"], ["normal", "Normal"], ["more", "More"]],
      "How often For You mixes in something different from your usual."],
    ["hide", "Hide these kinds", "genres"],
  ]],
  ["Wellbeing", [
    ["breaks", "Break reminder", [["off", "Off"], ["15", "15 min"], ["25", "25 min"], ["45", "45 min"]]],
  ]],
  ["Notifications", [
    ["notify_follows", "New followers", [[true, "On"], [false, "Off"]]],
    ["notify_sends", "Stories friends send", [[true, "On"], [false, "Off"]]],
    ["notify_posts", "New posts from people I follow", [[true, "On"], [false, "Off"]]],
  ], "account"],
];
const FEED_SETTINGS = new Set(["length", "readers", "hide", "voice", "explore"]);

function loadSettings() {
  try { return { ...SETTING_DEFAULTS, ...JSON.parse(localStorage.getItem("flypbook-settings") || "{}") }; }
  catch { return { ...SETTING_DEFAULTS }; }
}
let settingsSyncTimer;
function saveSettings() {
  try { localStorage.setItem("flypbook-settings", JSON.stringify(state.settings)); } catch {}
  // Signed in: keep the same settings on every device (and tell the server which notifications to send).
  clearTimeout(settingsSyncTimer);
  if (user()) settingsSyncTimer = setTimeout(() => window.sb.from("profiles").update({ settings: state.settings }).eq("id", user().id).then(() => {}), 1500);
}
function applySettings() {
  const s = state.settings;
  Object.assign(app.dataset, { bg: s.bg, capsize: s.capsize, contrast: s.contrast, motion: s.motion });
  window.FlypScenes = {
    allow: name => s.bgtype === "calm" ? CALM_SCENES.has(name) : s.bgtype === "games" ? !CALM_SCENES.has(name) : true,
    weight: name => window.taste.sceneWeight(name),
  };
  state.stories.forEach(applyCaptionLook);
  renderSettings();
  updateMedia();
}

function renderSettings() {
  const box = document.getElementById("settings-body");
  if (!box) return;
  box.replaceChildren();
  for (const [section, items, only] of SETTINGS_UI) {
    if (only === "account" && !user()) continue;
    box.append(el("div", "settings-section", section));
    for (const [key, label, options, hint] of items) {
      const row = el("div", "setting");
      row.append(el("span", null, label));
      if (options === "genres") {
        const chips = el("div", "chips");
        for (const g of GENRES) {
          const b = el("button", "chip-btn", g);
          b.setAttribute("aria-pressed", String(state.settings.hide.includes(g)));
          b.addEventListener("click", () => {
            const hide = new Set(state.settings.hide);
            hide.has(g) ? hide.delete(g) : hide.add(g);
            changeSetting("hide", [...hide]);
          });
          chips.append(b);
        }
        row.append(chips);
      } else {
        const seg = el("div", "seg");
        for (const [value, text] of options) {
          const b = el("button", null, text);
          b.setAttribute("aria-pressed", String(state.settings[key] === value));
          b.addEventListener("click", () => changeSetting(key, value));
          seg.append(b);
        }
        row.append(seg);
      }
      if (hint) row.append(el("p", "fine", hint));
      box.append(row);
    }
  }
  if (user()) {
    const edit = el("button", "btn-secondary", "Edit profile and privacy");
    edit.addEventListener("click", () => acct().open?.("editProfile"));
    box.append(edit);
  }
  const reset = el("button", "btn-link", "Reset my For You recommendations");
  reset.addEventListener("click", () => resetTaste());
  box.append(reset);
}
function changeSetting(key, value) {
  const old = state.settings[key];
  state.settings[key] = value;
  saveSettings();
  if (key === "bgtype") state.stories.forEach(releaseMedia);
  applySettings();
  if ((key === "narration" || key === "rate" || key === "voice") && state.playing) startReading();
  if (FEED_SETTINGS.has(key) && JSON.stringify(old) !== JSON.stringify(value)) {
    clearTimeout(state.feedTimer);
    state.feedTimer = setTimeout(() => resetFeed().catch(showError), 900);   // wait for more taps, then rebuild once
  }
}
document.getElementById("settings-btn").addEventListener("click", () => { closeSheets(); renderSettings(); settingsSheet.hidden = false; });
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
// Newer columns, newest first; each is dropped if the database doesn't have it yet.
let optional = ["author_id", "source", "comment_count", "audio_url", "word_times"];
async function fetchStories(query) {
  for (;;) {
    try { return await api(`stories?select=${[BASE_FIELDS, ...optional].join(",")}&${query}`); }
    catch (err) { if (err.status !== 400 || !optional.length) throw err; optional = optional.slice(1); }
  }
}

/** Server-side filters from Settings > Feed (kinds to hide, story length) plus a Discover pick. */
function filterQuery() {
  const s = state.settings, q = [];
  if (state.filter) q.push(`genre=eq.${encodeURIComponent(state.filter)}`);
  else if (s.hide.length) q.push(`genre=not.in.(${s.hide.map(g => encodeURIComponent(`"${g}"`)).join(",")})`);
  if (s.length === "short") q.push(`est_read_seconds=lt.${SHORT_SECONDS}`);
  if (s.length === "long") q.push(`est_read_seconds=gte.${SHORT_SECONDS}`);
  return q.length ? "&" + q.join("&") : "";
}
/** Client-side filters (Settings > Feed > Stories by readers). */
const allowed = r => state.settings.readers !== "off" || r.source !== "user";

/** Load stories by id, keeping the given order. */
async function fetchByIds(ids) {
  if (!ids.length) return [];
  const rows = await fetchStories(`id=in.(${ids.join(",")})`);
  const byId = new Map(rows.map(r => [r.id, r]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

async function loadMore() {
  if (state.loading || state.done) return;
  state.loading = true;
  try {
    let rows;
    if (state.mode === "ranked") {
      rows = state.queue.splice(0, PAGE_SIZE);
      if (!state.queue.length) state.done = true;
    } else if (state.mode === "friends") {
      const page = state.queue.splice(0, PAGE_SIZE);
      rows = (await fetchByIds(page.map(p => p.story_id))).map(r => {
        const via = page.find(p => p.story_id === r.id);
        return { ...r, via: via.reason === "liked" ? `liked by @${via.username}` : null };
      });
      if (!state.queue.length) state.done = true;
    } else {
      const offset = state.offset || 0;
      rows = await fetchStories(`order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}${filterQuery()}`);
      state.offset = offset + rows.length;
      if (rows.length < PAGE_SIZE) state.done = true;
      rows = rows.filter(allowed);
    }
    await addStories(rows.filter(r => !state.stories.some(s => s.data.id === r.id)));
    if (state.done) {
      if (state.mode === "friends" && !state.stories.length) addMessageCard("Your Friends feed is empty", "Follow people from Inbox > Friends. Stories they post and like show up here.");
      else addMessageCard("You're all caught up", "New stories drop every few hours. Come back soon.");
    }
  } finally {
    state.loading = false;
  }
}

/** Public names and pictures for requesters and writers. */
async function namesFor(rows) {
  const ids = [...new Set(rows.flatMap(r => [r.requested_by, r.author_id]).filter(Boolean))];
  const names = {};
  if (!ids.length) return names;
  try { for (const u of await api(`public_profiles?select=*&id=in.(${ids.join(",")})`)) names[u.id] = u; }
  catch { for (const u of await api(`public_usernames?select=id,username&id=in.(${ids.join(",")})`)) names[u.id] = u; }
  return names;
}

function makeStory(row, names, pinned = false) {
  const prepared = prepareStory(row.body);
  prepared.audioUrl = row.audio_url || null;
  prepared.times = row.word_times || null;
  const data = { ...row, username: names[row.requested_by]?.username, author: names[row.author_id]?.username, authorProfile: names[row.author_id] };
  const story = { data, prepared, word: -1, ended: false, pinned };
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

// ---------- For You ranking: the taste model (taste.js) learns each reader's patterns on the phone ----------
const finishedLocal = new Set(JSON.parse((() => { try { return localStorage.getItem("flypbook-finished") || "[]"; } catch { return "[]"; } })()));
function rememberFinished(id) {
  finishedLocal.add(id);
  try { localStorage.setItem("flypbook-finished", JSON.stringify([...finishedLocal].slice(-1500))); } catch {}
}

async function buildForYou() {
  const cands = (await fetchStories(`order=created_at.desc&limit=300${filterQuery()}`)).filter(allowed);
  const names = await namesFor(cands);
  for (const c of cands) c.author = names[c.author_id]?.username;
  const finished = new Set(finishedLocal), now = Date.now(), model = window.taste;
  let level = 1.6;
  if (user()) {
    const sb = window.sb;
    const [likes, events, answers] = await Promise.all([
      sb.from("likes").select("story_id"), sb.from("story_events").select("story_id,event").limit(2000), sb.from("answers").select("story_id"),
    ]);
    for (const e of events.data || []) if (e.event === "finish") finished.add(e.story_id);
    for (const a of answers.data || []) finished.add(a.story_id);
    level = acct().profile?.reading_level || level;
    // A brand-new model on this device learns once from the account's history (likes, finishes, skips).
    if (!model.seeded) {
      const byId = new Map(cands.map(s => [s.id, s]));
      for (const g of acct().profile?.favorite_genres || []) model.learn([`g:${g}`], 1, 0.5);
      for (const l of likes.data || []) { const s = byId.get(l.story_id); if (s) model.learn(TasteModel.features(s), 1, 1.5); }
      for (const e of events.data || []) {
        const s = byId.get(e.story_id);
        if (s && e.event === "finish") model.learn(TasteModel.features(s), 1);
        if (s && e.event === "skip") model.learn(TasteModel.features(s), 0);
      }
      model.seeded = true; model.save();
    }
  }
  const voice = state.settings.voice;
  // Early on, try more variety; as the model learns, trust it more.
  const curiosity = 0.35 / Math.sqrt(1 + model.seen / 15);
  const scored = cands.filter(s => !finished.has(s.id)).map(s => {
    const f = TasteModel.features(s);
    const ageDays = (now - new Date(s.created_at)) / 864e5;
    const score = model.predict(f)                                                   // what this reader tends to enjoy
      + curiosity * model.novelty(f)                                                 // try what it hasn't learned yet
      + Math.max(0, 1 - Math.abs((LEVEL_NUM[s.reading_level] || 2) - level)) * 0.08 // near my reading level
      + Math.max(0, 1 - ageDays / 7) * 0.12                                          // fresh
      + Math.log1p((s.like_count || 0) + (s.comment_count || 0)) * 0.04              // popular with everyone
      + (voice !== "any" && voice !== "phone" && TasteModel.voiceOf(s) === voice ? 0.15 : 0)
      + Math.random() * 0.03;                                                        // break ties differently each time
    return { s, score };
  }).sort((a, b) => b.score - a.score);
  const top = scored.map(x => x.s), queue = [];
  const tail = top.splice(Math.ceil(top.length / 2));
  const every = EXPLORE_EVERY[state.settings.explore] || 5;
  for (let i = 0; top.length || tail.length; i++) {
    const explore = (i % every === every - 1 && tail.length) || !top.length;
    queue.push(explore ? tail.splice(Math.floor(Math.random() * tail.length), 1)[0] : top.shift());
  }
  return queue.length ? queue : cands;
}

/** Turn how a reader reacted to a story into a lesson for the taste model. */
function learnFrom(story, label, weight = 1) {
  const bg = story.media?.kind === "video" ? "RealClip" : story.media?.renderer?.scene?.constructor?.name;
  window.taste.learn(TasteModel.features(story.data, bg), label, weight);
}
function learnFromLeaving(story) {
  if (story.learned || !story.startedAt) return;
  story.learned = true;
  const seconds = (Date.now() - story.startedAt) / 1000;
  const progress = story.ended ? 1 : Math.max(0, story.word) / story.prepared.words.length;
  if (story.ended) return learnFrom(story, 1);
  if (seconds < 4 && progress < 0.1) return learnFrom(story, 0, 1.2);      // swiped away almost right away
  learnFrom(story, Math.min(1, progress * 1.15), 0.8);
}
function resetTaste() {
  window.taste = new TasteModel({ seeded: true });
  window.taste.onChange = syncTaste;
  window.taste.save();
  toast("Your For You recommendations were reset.");
  if (state.tab === "foryou") resetFeed().catch(showError);
}
// Signed-in readers: keep the taste model on the account too, so it follows them to other devices.
let tasteTimer;
function syncTaste() {
  clearTimeout(tasteTimer);
  if (user()) tasteTimer = setTimeout(() => window.sb.from("profiles").update({ taste: window.taste.toJSON() }).eq("id", user().id).then(() => {}), 15000);
}
window.taste.onChange = syncTaste;

/** Rebuild the feed (first load, switching tabs/filters, logging in or out). */
async function resetFeed() {
  narrator.stop();
  state.stories.forEach(releaseMedia);
  state.stories = []; state.active = -1; state.done = false; state.queue = []; state.offset = 0;
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
  state.mode = state.tab === "foryou" ? "ranked" : state.tab === "friends" && user() ? "friends" : "latest";
  if (state.mode === "ranked") {
    try { state.queue = await buildForYou(); } catch (err) { console.error(err); state.mode = "latest"; }
  }
  if (state.mode === "friends") {
    const { data, error } = await window.sb.rpc("friend_feed", { p_limit: 150 });
    if (error) { console.error(error); state.mode = "latest"; } else state.queue = data || [];
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
  if (b.dataset.feed === "friends" && !user()) return needAccount("Create a free account to follow friends and see what they read.");
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
  // Printing-ink highlight colors (butter, lilac, coral, mint, sky, rose), each with a dark ink for text on it.
  colors: [["#f5d35c", "#1b1400"], ["#bba6f2", "#1a0f3d"], ["#ff8a65", "#2b0d00"], ["#9fe3b8", "#0b2a10"],
           ["#8fd3ff", "#00263b"], ["#ffb3c7", "#33000e"]],
};

// Each kind of story has its own printed ink, like the colored band on an old paperback.
// "light" inks get dark text on them.
const GENRE_INK = {
  "aita": ["#f0532e"], "tifu": ["#f29b2b", "light"], "entitled people": ["#d93f6a"], "malicious compliance": ["#2f7a4b"],
  "petty revenge": ["#b8321f"], "family drama": ["#2c5aa0"], "friendship drama": ["#ef8fb2", "light"], "school drama": ["#23858f"],
  "workplace drama": ["#6b6a2a"], "roommate drama": ["#a3662a"], "wholesome twist": ["#f5d35c", "light"], "mystery": ["#1f5c3f"],
  "unexplained / eerie": ["#4a2e73"],
};
const genreInk = g => GENRE_INK[g] || ["#5b2fb3"];
function captionStyle(seed) {
  const r = mulberry32(seed ^ 0x9e3779b9), pick = a => a[Math.floor(r() * a.length)];
  let font = pick(CAPTION.fonts), highlight = pick(CAPTION.highlights);
  // Markers and plates already have a background; keep the outline treatment off them.
  let treatment = pick(CAPTION.treatments);
  if (highlight === "h-marker" && treatment === "t-stroke") treatment = "t-shadow";
  let [hl, ink] = pick(CAPTION.colors);
  // Settings > Captions can lock the look and/or the highlight color.
  if (state.settings.capstyle === "classic") [font, treatment, highlight] = ["f-sans", "t-stroke", "h-ink"];
  if (state.settings.hlcolor !== "varied") [hl, ink] = CAPTION.colors.find(c => c[0] === state.settings.hlcolor) || [hl, ink];
  return { classes: [font, treatment, highlight], hl, ink };
}
const CAPTION_CLASSES = [...CAPTION.fonts, ...CAPTION.treatments, ...CAPTION.highlights];
function applyCaptionLook(story) {
  const style = captionStyle(story.seed), card = story.card;
  card.classList.remove(...CAPTION_CLASSES);
  card.classList.add(...style.classes);
  card.style.setProperty("--hl", style.hl);
  card.style.setProperty("--hl-ink", style.ink);
}

/** A tappable @name that opens that reader's profile. */
function personLink(prefix, username) {
  const b = el("button", "by", `${prefix}@${username}`);
  b.addEventListener("click", e => { e.stopPropagation(); openUser(username); });
  return b;
}
function openUser(username) {
  if (!username) return;
  pauseReading();
  acct().open?.("user", { username });
}

/** A round profile picture: the uploaded photo, or the first letter on the reader's color. */
function avatar(p, cls = "av") {
  const a = el("span", cls);
  a.style.setProperty("--pc", p?.profile_color || "#5b2fb3");
  if (p?.avatar_url) {
    const img = document.createElement("img");
    img.src = p.avatar_url; img.alt = ""; img.loading = "lazy";
    img.addEventListener("error", () => { img.remove(); a.textContent = (p.username || "?")[0].toUpperCase(); }, { once: true });
    a.append(img);
  } else a.textContent = (p?.display_name || p?.username || "?")[0].toUpperCase();
  return a;
}

function buildCard(story) {
  const d = story.data;
  const card = el("article", "card");
  story.card = card;
  applyCaptionLook(story);
  const media = el("div", "media");
  const scrim = el("div", "scrim");

  // Meta line: the genre's ink band, how long, who wrote or asked for it
  const [ink, tone] = genreInk(d.genre);
  card.style.setProperty("--band", ink);
  const chapter = el("div", "chapter");
  chapter.append(el("span", `band${tone ? " " + tone : ""}`, d.genre), el("span", null, `${minutes(d.est_read_seconds)} read`));
  if (d.source === "user" && d.author) chapter.append(personLink("by ", d.author));
  else chapter.append(el("span", null, "AI story"));
  if (d.username) chapter.append(personLink("requested by ", d.username));
  if (d.via) chapter.append(el("span", "via", d.via));

  // Opening: a little paperback cover (genre band, title, writer) turns in, then the words start
  const intro = el("div", "intro");
  const cover = el("div", "cover");
  const band = el("div", `cover-band${tone ? " " + tone : ""}`);
  band.append(el("span", "cover-kind", d.genre), el("span", "cover-mark", "F"));
  const foot = el("div", "cover-foot");
  foot.append(el("span", null, d.source === "user" && d.author ? `@${d.author}` : "FlypBook"), el("span", null, LEVEL_LABEL[d.reading_level] || minutes(d.est_read_seconds)));
  cover.append(band, el("h2", null, d.title), foot);
  intro.append(cover);
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
  shareBtn.addEventListener("click", stop(() => shareMenu(story)));
  moreBtn.addEventListener("click", stop(() => moreMenu(story)));

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
  if (on) learnFrom(story, 1, 1.5);
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
  if (on) learnFrom(story, 1, 1.5);
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
    learnFrom(story, 1, 2);
  } catch {}
}

/** A small printed menu that slides up over the reading bar. items: [[label, action], ...] */
function cardMenu(story, title, items) {
  story.card.querySelector(".report-box")?.remove();
  const box = el("div", "report-box");
  box.append(el("strong", null, title));
  for (const [label, action] of items) {
    const b = el("button", "btn-secondary", label);
    b.addEventListener("click", e => { e.stopPropagation(); box.remove(); action(); });
    box.append(b);
  }
  const cancel = el("button", "btn-link", "Cancel");
  cancel.addEventListener("click", e => { e.stopPropagation(); box.remove(); });
  box.append(cancel);
  box.addEventListener("click", e => e.stopPropagation());
  story.card.append(box);
}
function shareMenu(story) {
  if (!user()) return shareStory(story);
  cardMenu(story, "Share this story", [
    ["Send to a friend", () => { pauseReading(); acct().open?.("send", { story: story.data }); }],
    ["Share a link", () => shareStory(story)],
  ]);
}
window.addEventListener("flyp:sent", e => { const s = state.stories.find(x => x.data.id === e.detail); if (s) learnFrom(s, 1, 2); });
function moreMenu(story) {
  const items = [["Not interested", () => notInterested(story)]];
  if (story.data.author) items.push([`About @${story.data.author}`, () => openUser(story.data.author)]);
  items.push(["Report this story", () => reportStory(story)]);
  cardMenu(story, story.data.title, items);
}
function notInterested(story) {
  learnFrom(story, 0, 3);
  story.learned = true;
  toast("Got it. You'll see fewer stories like this.");
  const i = state.stories.indexOf(story);
  if (i >= 0 && i < state.stories.length - 1) feed.scrollTo({ top: (i + 1) * feed.clientHeight, behavior: "smooth" });
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

const commentTitle = n => (n ? `${formatCount(n)} ${n === 1 ? "comment" : "comments"}` : "Comments");

async function openComments(story) {
  closeSheets();
  commentStory = story;
  commentsSheet.hidden = false;
  document.getElementById("comments-title").textContent = commentTitle(story.data.comment_count);
  commentList.innerHTML = `<p class="fine">Loading...</p>`;
  commentForm.hidden = false;
  commentInput.placeholder = user() ? "Add a comment..." : "Log in to comment";
  let rows = [];
  try { rows = await api(`comment_feed?select=*&story_id=eq.${story.data.id}&order=created_at.desc&limit=100`); }
  catch { commentList.innerHTML = `<p class="fine">Comments are coming soon.</p>`; return; }
  if (commentStory !== story) return;
  commentList.replaceChildren();
  if (!rows.length) commentList.append(el("p", "fine", "No comments yet. Say what you think of it."));
  rows.forEach(c => commentList.append(commentRow(c)));
}

function commentRow(c) {
  const row = el("div", "cmt");
  const pic = avatar(c);
  pic.addEventListener("click", () => openUser(c.username));
  row.append(pic);
  const mid = el("div");
  const name = el("button", "nm", `${c.display_name ? c.display_name + " " : ""}@${c.username} · ${timeAgo(c.created_at)}`);
  name.addEventListener("click", () => openUser(c.username));
  mid.append(name, el("div", "tx", c.body));
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
  const me = acct().profile || {};
  commentList.prepend(commentRow({ ...data, username: me.username || "you", display_name: me.display_name,
    avatar_url: me.avatar_hidden ? null : me.avatar_url, profile_color: me.profile_color }));
  learnFrom(commentStory, 1, 1.5);
  commentStory.data.comment_count = (commentStory.data.comment_count || 0) + 1;
  refreshRail(commentStory);
  document.getElementById("comments-title").textContent = commentTitle(commentStory.data.comment_count);
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
  if (nav === "create") return acct().open?.(user() ? "create" : "signup", { reason: "Create an account to post your own stories or request one." });
  if (nav === "inbox") return acct().open?.(user() ? "notifications" : "signup", { reason: "Create an account to get notified when your stories are ready." });
  if (nav === "me") return acct().open?.(user() ? "profile" : "signup");
}));

// ---------- Background media (lives inside each card) ----------
function pickVideo(story) {
  const share = VIDEO_SHARE[state.settings.bgtype] ?? 0.3;
  if (story.noVideo || !state.videos.length || (story.seed % 100) / 100 >= share) return null;
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
  rememberFinished(story.data.id);
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
  // Settings > Favorite narrator > Phone: skip the recording and use the phone's own voice.
  const prepared = state.settings.voice === "phone" ? { ...story.prepared, audioUrl: null, times: null } : story.prepared;
  narrator.play(prepared, Math.max(0, story.word), playOpts());
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
    learnFromLeaving(prev);
  }
  state.active = index;
  state.viewed++;
  if (maybeBreak()) return;
  // Settings > Feed > Next story: plays by itself, or waits for a tap.
  state.playing = state.settings.autoplay !== "off" || state.viewed <= 1;
  updateMedia();
  if (state.playing) startReading();
  else { const s = state.stories[index]; s?.card.classList.add("paused"); }
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
  if (state.settings.breaks === "off") return false;
  const limit = Number(state.settings.breaks) || 25;      // minutes; roughly one story a minute and a half
  const stories = Math.round(limit * 0.6);
  const mins = (Date.now() - state.lastBreak) / 60000;
  if (state.viewed < stories && mins < limit) return false;
  state.viewed = 0; state.lastBreak = Date.now();
  breakShowing = true;
  narrator.stop(); state.playing = false; updateMedia();
  const card = el("div", "card break-card");
  card.style.cssText = "position:absolute;inset:0;z-index:12;background:rgba(11,8,18,0.94)";
  const layer = el("div", "layer");
  layer.append(el("div", "break-kicker", `${limit} minutes in`), el("h2", null, "Bookmark it here?"),
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
  toast, openStory, avatar, openUser, resetTaste, GENRES,
  pause: () => pauseReading(),
  refreshFeed: () => resetFeed().catch(showError),
  learnSent: id => window.dispatchEvent(new CustomEvent("flyp:sent", { detail: id })),
  onAuth(_acct, opts = {}) {
    const p = acct().profile;
    if (p && state.syncedFor !== p.id) {
      state.syncedFor = p.id;
      // Settings saved on the account win, so they follow the reader to every device.
      if (p.settings && Object.keys(p.settings).length) {
        state.settings = { ...SETTING_DEFAULTS, ...state.settings, ...p.settings };
        try { localStorage.setItem("flypbook-settings", JSON.stringify(state.settings)); } catch {}
        applySettings();
      } else saveSettings();
      // Keep whichever taste model has learned more (this device's, or the one on the account).
      if ((p.taste?.seen || 0) > window.taste.seen) {
        window.taste = new TasteModel(p.taste);
        window.taste.onChange = syncTaste;
        window.taste.save();
      } else if (window.taste.seen) syncTaste();
    }
    if (!state.booted) return;
    renderSettings();
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
