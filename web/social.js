// FlypBook social features: profiles (with photos and customization), following and friends,
// posting your own stories, sending stories to friends, and the Inbox. Adds views to the account
// sheet from account.js. Needs supabase/005_social.sql.

await window.accountReady;
const acct = window.Account;
const { sb, body, title, $, esc, msg, render, friendly, loadProfile, GENRES, TONES, LEVEL } = acct.ui;
const App = () => window.App || {};
const toast = t => App().toast?.(t);
const me = () => acct.user;
const sheet = body.closest(".sheet");
const stale = view => sheet.hidden || sheet.dataset.view !== view;   // the reader moved on while we loaded
const COLORS = ["#5b2fb3", "#f0532e", "#e0a526", "#2f7a4b", "#2c5aa0", "#d93f6a", "#23858f", "#18151b"];   // the genre inks
const POST_DRAFT = "flypbook-post-draft";
const MIN_WORDS = 120, MAX_WORDS = 2500;
const ago = t => {
  const s = (Date.now() - new Date(t)) / 1000;
  return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
};
const words = t => (t.trim().match(/\S+/g) || []).length;
function storageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function storageSet(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} }
const missingTables = error => /relation|does not exist|schema cache|function .* does not exist/i.test(error?.message || "");
const notReady = `<p class="fine">This part of FlypBook is still being set up. Check back soon.</p>`;
const avatar = (p, cls) => App().avatar(p, cls);

// ---------- Following ----------
// Who follows me (to label buttons "Follow back" / "Friends"). Refreshed when the Inbox opens.
let followersOfMe = new Set();
async function loadFollowersOfMe() {
  if (!me()) return;
  const { data } = await sb.from("follows").select("follower").eq("followee", me().id);
  followersOfMe = new Set((data || []).map(r => r.follower));
}

/** Follow / Following / Friends button. p needs id and i_follow. */
function followButton(p, onChange) {
  const b = $(`<button class="follow-btn"></button>`);
  let confirming = false;
  const paint = () => {
    const mutual = p.i_follow && (p.follows_me ?? followersOfMe.has(p.id));
    b.textContent = confirming ? "Unfollow?" : p.i_follow ? (mutual ? "Friends" : "Following") : (p.follows_me ?? followersOfMe.has(p.id)) ? "Add back" : "Follow";
    b.classList.toggle("on", !!p.i_follow && !confirming);
    b.classList.toggle("warn", confirming);
  };
  b.addEventListener("click", async e => {
    e.stopPropagation();
    if (!me()) return render("signup", { reason: "Create a free account to follow people and make friends." });
    if (p.i_follow && !confirming) { confirming = true; paint(); setTimeout(() => { confirming = false; paint(); }, 3000); return; }
    confirming = false;
    b.disabled = true;
    const { error } = p.i_follow
      ? await sb.from("follows").delete().eq("follower", me().id).eq("followee", p.id)
      : await sb.from("follows").insert({ follower: me().id, followee: p.id });
    b.disabled = false;
    if (error && !/duplicate/i.test(error.message)) return toast(friendly(error).replace(/^.*?: /, ""));
    p.i_follow = !p.i_follow;
    if (p.i_follow && (p.follows_me ?? followersOfMe.has(p.id))) toast(`You and @${p.username} are friends now!`);
    paint();
    onChange?.(p);
  });
  paint();
  return b;
}

/** One person in a list: picture, names, and a follow button. Tapping opens their profile. */
function personRow(p, { button = true } = {}) {
  const row = $(`<div class="person" role="button" tabindex="0"></div>`);
  const names = $(`<div class="person-names"><strong></strong><span></span></div>`);
  names.querySelector("strong").textContent = p.display_name || p.username;
  names.querySelector("span").textContent = "@" + p.username;
  row.append(avatar(p, "av av-md"), names);
  if (button && me() && p.id !== me().id) row.append(followButton(p));
  row.addEventListener("click", () => render("user", { username: p.username }));
  return row;
}
function listInto(box, rows, empty) {
  box.replaceChildren(...rows.map(p => personRow(p)));
  if (!rows.length) box.innerHTML = `<p class="fine">${empty}</p>`;
}

// ---------- Profile header (mine and other people's) ----------
function profileHeader(p, card) {
  const head = $(`<div class="pf-head"></div>`);
  head.style.setProperty("--pc", p.profile_color || "#5b2fb3");
  const names = $(`<div class="pf-names"><strong></strong><span></span></div>`);
  names.querySelector("strong").textContent = p.display_name || "@" + p.username;
  names.querySelector("span").textContent = ["@" + p.username, p.pronouns].filter(Boolean).join(" · ");
  // Level and title from XP, plus the profile-picture frame unlocked at levels 5 and 8
  const xp = card?.points ?? p.points;
  const pic = avatar(p, "av av-xl");
  if (xp != null && window.Rewards) {
    const lv = window.Rewards.levelOf(xp);
    names.append($(`<em class="pf-level${lv.level >= 11 ? " gold" : ""}">Level ${lv.level} · ${lv.title}</em>`));
    const frame = window.Rewards.frameFor(xp);
    if (frame) pic.classList.add("frame-" + frame);
  }
  head.append(pic, names);
  const wrap = $(`<div class="pf"></div>`);
  wrap.append(head);
  if (p.bio) wrap.append($(`<p class="pf-bio">${esc(p.bio)}</p>`));
  if (card) {
    const counts = $(`<div class="pf-counts"></div>`);
    for (const [kind, n] of [["followers", card.followers], ["following", card.following], ["friends", card.friends], ["posts", card.posts]]) {
      const b = $(`<button><b>${n ?? 0}</b><span>${kind}</span></button>`);
      if (kind !== "posts") b.addEventListener("click", () => {
        if (!me()) return render("signup", { reason: "Create a free account to see who's following who." });
        render("people", { id: card.id, username: card.username, kind });
      });
      counts.append(b);
    }
    wrap.append(counts);
  }
  return wrap;
}

/** A list of stories (title + detail) that open in the feed when tapped. */
function storyList(box, rows, empty) {
  box.replaceChildren(...rows.map(r => {
    const b = $(`<button class="list-item"><span>${esc(r.title || "Story")}</span><em>${esc(r.detail || r.genre || "")}</em></button>`);
    b.addEventListener("click", () => { acct.close(); App().openStory?.(r.id); });
    return b;
  }));
  if (!rows.length) box.innerHTML = `<p class="fine">${empty}</p>`;
}

// ---------- My profile ----------
acct.views.profile = async function viewProfile({ tab = "posts" } = {}) {
  await loadProfile();
  const p = acct.profile;
  if (!p) { body.innerHTML = `<p class="fine">Loading your profile...</p>`; return; }
  title.textContent = "";
  const { data: card } = await sb.rpc("profile_card", { p_username: p.username });
  if (stale("profile")) return;
  body.replaceChildren(profileHeader(p, card || { id: p.id, username: p.username }));
  body.append($(`<div class="stats">
      <div><b>${p.points}</b><span>XP</span></div>
      <div><b>${p.current_streak}</b><span>day streak</span></div>
      <div><b>${p.longest_streak}</b><span>best streak</span></div>
      <div><b>${LEVEL(p.reading_level)}</b><span>reading level</span></div>
    </div>`));
  const actions = $(`<div class="row-btns"><button class="btn-primary" data-a="edit">Edit profile</button><button class="btn-secondary" data-a="friends">Friends</button></div>`);
  actions.querySelector('[data-a="edit"]').addEventListener("click", () => render("editProfile"));
  actions.querySelector('[data-a="friends"]').addEventListener("click", () => render("friends"));
  body.append(actions);

  const tabs = [["posts", "Posts"], ["saved", "Saved"], ["likes", "Likes"], ["requests", "Requests"], ["taste", "Taste"]];
  const seg = $(`<div class="seg tabs">${tabs.map(([k, l]) => `<button data-t="${k}" aria-pressed="${k === tab}">${l}</button>`).join("")}</div>`);
  const box = $(`<div class="list pf-tab"></div>`);
  body.append(seg, box);
  const show = async t => {
    seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === t)));
    box.innerHTML = `<p class="fine">Loading...</p>`;
    await ({ posts: myPosts, saved: mySaved, likes: myLikes, requests: myRequests, taste: myTaste })[t](box);
  };
  seg.addEventListener("click", e => { const b = e.target.closest("button"); if (b) show(b.dataset.t); });
  show(tab);

  const end = $(`<div class="row-btns"><button class="btn-secondary" data-a="out">Log out</button><a class="btn-secondary" href="privacy.html" target="_blank">Privacy</a></div>`);
  end.querySelector('[data-a="out"]').addEventListener("click", async () => { await sb.auth.signOut(); acct.close(); toast("Logged out"); });
  const del = $(`<button class="btn-danger">Delete my account</button>`);
  del.addEventListener("click", () => render("delete"));
  body.append(end, del);
};

const STATUS = { pending: "Checking...", processing: "Checking...", approved: "Live", rejected: "Not published", failed: "Try again" };
async function myPosts(box) {
  const { data, error } = await sb.from("story_submissions").select("id,title,status,reason,story_id,created_at").order("created_at", { ascending: false }).limit(30);
  if (error) { box.innerHTML = missingTables(error) ? notReady : `<p class="fine">${esc(friendly(error))}</p>`; return; }
  box.replaceChildren();
  const write = $(`<button class="btn-primary">Post a story</button>`);
  write.addEventListener("click", () => render("post"));
  box.append(write);
  if (!data.length) box.append($(`<p class="fine">Your own stories show up here. They're checked for safety, then published with your name for everyone to read.</p>`));
  for (const s of data) {
    const row = $(`<div class="post-row">
        <button class="list-item"><span>${esc(s.title)}</span><em data-s="${s.status}">${STATUS[s.status] || s.status}</em></button>
        ${s.status === "rejected" && s.reason ? `<p class="fine">${esc(s.reason)}</p>` : ""}
        <button class="btn-link" data-del>Delete</button></div>`);
    if (s.story_id) row.querySelector(".list-item").addEventListener("click", () => { acct.close(); App().openStory?.(s.story_id); });
    row.querySelector("[data-del]").addEventListener("click", async e => {
      const b = e.currentTarget;
      if (b.textContent !== "Tap again to delete") { b.textContent = "Tap again to delete"; return; }
      if (s.story_id) { const { error } = await sb.rpc("delete_my_story", { p_story: s.story_id }); if (error) return toast(friendly(error)); }
      await sb.from("story_submissions").delete().eq("id", s.id);
      row.remove();
      toast("Story deleted");
    });
    box.append(row);
  }
}
async function mySaved(box) {
  const { data } = await sb.from("saves").select("story_id, stories(title, genre)").order("created_at", { ascending: false }).limit(50);
  storyList(box, (data || []).map(s => ({ id: s.story_id, title: s.stories?.title, genre: s.stories?.genre })), "Tap the bookmark on any story to save it here.");
}
async function myLikes(box) {
  const { data, error } = await sb.rpc("user_likes", { p_user: me().id });
  if (error) { box.innerHTML = missingTables(error) ? notReady : ""; return; }
  storyList(box, (data || []).map(s => ({ id: s.story_id, title: s.title, genre: s.genre })), "Stories you like show up here.");
}
async function myRequests(box) {
  const { data: reqs } = await sb.from("story_requests").select("prompt,status,created_at,story_id").order("created_at", { ascending: false }).limit(20);
  box.replaceChildren();
  const ask = $(`<button class="btn-secondary">Request an AI story</button>`);
  ask.addEventListener("click", () => render("request"));
  box.append(ask);
  for (const r of reqs || []) {
    const row = $(`<button class="list-item"><span>${esc(r.prompt)}</span><em data-s="${r.status}">${r.status}</em></button>`);
    if (r.story_id) row.addEventListener("click", () => { acct.close(); App().openStory?.(r.story_id); });
    box.append(row);
  }
  if (!reqs?.length) box.append($(`<p class="fine">Ask the AI for a story idea, and we'll tell you when it's written.</p>`));
}
function myTaste(box) {
  const t = window.taste, { likes, dislikes } = t.explain();
  box.innerHTML = `
    <p class="fine">FlypBook learns your taste from what you finish, like, save, share and skip. This stays private.</p>
    <div class="label">You're into</div>
    <div class="chips">${likes.length ? likes.map(l => `<span class="chip">${esc(l)}</span>`).join("") : `<span class="fine">Keep reading. It learns fast.</span>`}</div>
    ${dislikes.length ? `<div class="label">Less your thing</div><div class="chips">${dislikes.map(l => `<span class="chip dim">${esc(l)}</span>`).join("")}</div>` : ""}
    <p class="fine">Learned from ${t.seen} ${t.seen === 1 ? "story" : "stories"}.</p>`;
  const reset = $(`<button class="btn-link">Reset my For You recommendations</button>`);
  reset.addEventListener("click", () => { App().resetTaste?.(); myTaste(box); });
  box.append(reset);
}

// ---------- Edit profile (photo, names, bio, color, genres, privacy) ----------
acct.views.editProfile = async function viewEditProfile() {
  await loadProfile();
  const p = acct.profile;
  if (!p) return;
  title.textContent = "Edit profile";
  if (!("display_name" in p)) { body.innerHTML = notReady; return; }
  const genres = new Set(p.favorite_genres || []);
  let color = p.profile_color || COLORS[0];
  body.innerHTML = `
    <div class="avatar-edit">
      <div id="ep-av"></div>
      <div class="avatar-btns">
        <label class="btn-secondary">Upload photo<input type="file" id="ep-file" accept="image/*" hidden></label>
        <button class="btn-link" id="ep-remove" ${p.avatar_url ? "" : "hidden"}>Remove photo</button>
      </div>
    </div>
    <p class="fine">Pick a photo you're OK with everyone seeing. Anyone can report a photo, which hides it until it's reviewed.</p>
    <form class="form" id="ep-form">
      <label>Display name<input id="ep-name" maxlength="30" value="${esc(p.display_name || "")}" placeholder="${esc(p.username)}"></label>
      <label>Pronouns<input id="ep-pro" maxlength="20" value="${esc(p.pronouns || "")}" placeholder="optional"></label>
      <label>Bio<textarea id="ep-bio" maxlength="160" rows="3" placeholder="A line about you (no links)">${esc(p.bio || "")}</textarea></label>
      <div class="label">Profile color</div>
      <div class="swatches">${COLORS.map(c => `<button type="button" data-c="${c}" style="--sw:${c}" aria-label="Color ${c}" aria-pressed="${c === color}"></button>`).join("")}</div>
      <div class="label">Favorite kinds of stories</div>
      <div class="chips">${GENRES.map(g => `<button type="button" class="chip-btn" data-g="${g}" aria-pressed="${genres.has(g)}">${g}</button>`).join("")}</div>
      <div class="label">Who can follow me</div>
      <div class="seg" data-k="who_can_follow"><button type="button" data-v="everyone">Everyone</button><button type="button" data-v="nobody">Only people I follow</button></div>
      <div class="label">Who can see my likes</div>
      <div class="seg" data-k="activity_visibility"><button type="button" data-v="everyone">Everyone</button><button type="button" data-v="friends">Friends</button><button type="button" data-v="nobody">Only me</button></div>
      <button class="btn-primary" type="submit">Save profile</button>
      <p class="form-msg" aria-live="polite"></p>
    </form>`;
  const privacy = { who_can_follow: p.who_can_follow, activity_visibility: p.activity_visibility };
  const paintAvatar = () => body.querySelector("#ep-av").replaceChildren(avatar({ ...p, profile_color: color }, "av av-xl"));
  paintAvatar();
  body.querySelectorAll(".seg[data-k]").forEach(seg => {
    const paint = () => seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === privacy[seg.dataset.k])));
    seg.addEventListener("click", e => { const b = e.target.closest("button"); if (b) { privacy[seg.dataset.k] = b.dataset.v; paint(); } });
    paint();
  });
  body.querySelector(".swatches").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    color = b.dataset.c;
    body.querySelectorAll(".swatches button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    paintAvatar();
  });
  body.querySelectorAll(".chip-btn").forEach(b => b.addEventListener("click", () => {
    genres.has(b.dataset.g) ? genres.delete(b.dataset.g) : genres.add(b.dataset.g);
    b.setAttribute("aria-pressed", genres.has(b.dataset.g));
  }));
  body.querySelector("#ep-file").addEventListener("change", async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    msg("Uploading your photo...");
    try {
      p.avatar_url = await uploadAvatar(file);
      p.avatar_hidden = false;
      paintAvatar();
      body.querySelector("#ep-remove").hidden = false;
      msg("Photo updated.");
    } catch (err) { msg(friendly(err), "error"); }
  });
  body.querySelector("#ep-remove").addEventListener("click", async () => {
    const { error } = await sb.from("profiles").update({ avatar_url: null }).eq("id", me().id);
    if (error) return msg(friendly(error), "error");
    await clearOldAvatars(null);
    p.avatar_url = null; paintAvatar();
    body.querySelector("#ep-remove").hidden = true;
    msg("Photo removed.");
  });
  body.querySelector("#ep-form").addEventListener("submit", async e => {
    e.preventDefault();
    msg("Saving...");
    const changes = {
      display_name: body.querySelector("#ep-name").value.trim() || null,
      pronouns: body.querySelector("#ep-pro").value.trim() || null,
      bio: body.querySelector("#ep-bio").value.trim() || null,
      profile_color: color, favorite_genres: [...genres], ...privacy,
    };
    const { error } = await sb.from("profiles").update(changes).eq("id", me().id);
    if (error) return msg(friendly(error).replace(/^.*?: /, ""), "error");
    Object.assign(acct.profile, changes);
    toast("Profile saved");
    App().onAuth?.(acct, { genresChanged: JSON.stringify([...genres].sort()) !== JSON.stringify([...(p.favorite_genres || [])].sort()) });
    render("profile");
  });
};

/** Shrink a photo to a 256x256 square JPEG (small and quick to load), then upload it. */
async function uploadAvatar(file) {
  if (!/^image\//.test(file.type)) throw new Error("Please choose a photo.");
  const img = await createImageBitmap(file).catch(() => new Promise((ok, fail) => {
    const i = new Image();
    i.onload = () => ok(i); i.onerror = () => fail(new Error("That photo couldn't be opened. Try a JPG or PNG."));
    i.src = URL.createObjectURL(file);
  }));
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
  const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
  const path = `${me().id}/${Date.now()}.jpg`;
  const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw error;
  const url = sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const { error: saveError } = await sb.from("profiles").update({ avatar_url: url }).eq("id", me().id);
  if (saveError) throw saveError;
  await clearOldAvatars(path);
  return url;
}
async function clearOldAvatars(keep) {
  const { data } = await sb.storage.from("avatars").list(me().id);
  const old = (data || []).map(f => `${me().id}/${f.name}`).filter(n => n !== keep);
  if (old.length) await sb.storage.from("avatars").remove(old);
}

// ---------- Someone else's profile ----------
acct.views.user = async function viewUser({ username }) {
  title.textContent = "@" + username;
  body.innerHTML = `<p class="fine">Loading...</p>`;
  const { data: card, error } = await sb.rpc("profile_card", { p_username: username });
  if (stale("user")) return;
  if (error) { body.innerHTML = missingTables(error) ? notReady : `<p class="fine">${esc(friendly(error))}</p>`; return; }
  if (!card) { body.innerHTML = `<p class="fine">This account isn't available.</p>`; return; }
  if (card.is_me) return render("profile");
  title.textContent = "";
  body.replaceChildren(profileHeader(card, card));

  const actions = $(`<div class="row-btns"></div>`);
  if (card.blocked) {
    const unblock = $(`<button class="btn-secondary">Unblock</button>`);
    unblock.addEventListener("click", async () => {
      await sb.from("blocks").delete().eq("blocker", me().id).eq("blocked", card.id);
      toast(`Unblocked @${card.username}`); render("user", { username });
    });
    actions.append(unblock);
  } else if (me() && (card.can_follow || card.i_follow)) {
    actions.append(followButton(card, () => render("user", { username })));
  } else if (me()) {
    actions.append($(`<button class="btn-secondary" disabled>Not accepting followers</button>`));
  } else {
    const join = $(`<button class="btn-primary">Follow</button>`);
    join.addEventListener("click", () => render("signup", { reason: "Create a free account to follow people and make friends." }));
    actions.append(join);
  }
  const more = $(`<button class="btn-secondary">More</button>`);
  more.addEventListener("click", () => userMenu(card, more));
  if (me()) actions.append(more);
  body.append(actions);
  body.append($(`<p class="fine">${card.i_follow && card.follows_me ? "You're friends: you can send each other stories."
    : card.follows_me ? "They follow you. Add them back to be friends." : "Follow each other to become friends."}</p>`));
  body.append($(`<div class="stats">
      <div><b>${card.points}</b><span>XP</span></div>
      <div><b>${card.current_streak}</b><span>day streak</span></div>
      <div><b>${card.longest_streak}</b><span>best streak</span></div>
      <div><b>${new Date(card.joined).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</b><span>joined</span></div>
    </div>`));

  body.append($(`<div class="label">Stories by @${esc(card.username)}</div>`));
  const posts = $(`<div class="list"><p class="fine">Loading...</p></div>`);
  body.append(posts);
  const { data: rows } = await sb.from("stories").select("id,title,genre,like_count").eq("author_id", card.id).order("created_at", { ascending: false }).limit(30);
  storyList(posts, (rows || []).map(r => ({ ...r, detail: `${r.like_count} likes · ${r.genre}` })), "No stories posted yet.");
  if (card.activity_visible) {
    body.append($(`<div class="label">Recently liked</div>`));
    const likes = $(`<div class="list"><p class="fine">Loading...</p></div>`);
    body.append(likes);
    const { data } = await sb.rpc("user_likes", { p_user: card.id });
    storyList(likes, (data || []).map(s => ({ id: s.story_id, title: s.title, genre: s.genre })), "Nothing liked yet.");
  }
};

function userMenu(card, anchor) {
  body.querySelector(".user-menu")?.remove();
  const box = $(`<div class="user-menu list"></div>`);
  const add = (label, fn) => { const b = $(`<button class="list-item"><span>${label}</span></button>`); b.addEventListener("click", fn); box.append(b); };
  if (card.follows_me) add("Remove this follower", async () => {
    await sb.from("follows").delete().eq("follower", card.id).eq("followee", me().id);
    toast("Removed"); render("user", { username: card.username });
  });
  if (card.avatar_url) add("Report profile photo", async () => {
    const { error } = await sb.from("avatar_reports").insert({ profile_id: card.id, user_id: me().id });
    toast(error && !/duplicate/i.test(error.message) ? "Couldn't send the report." : "Thanks. That photo is hidden while we review it.");
    render("user", { username: card.username });
  });
  add(`Block @${esc(card.username)}`, async () => {
    const { error } = await sb.from("blocks").insert({ blocker: me().id, blocked: card.id });
    if (error && !/duplicate/i.test(error.message)) return toast(friendly(error));
    toast(`Blocked @${card.username}. You won't see each other.`);
    render("user", { username: card.username });
  });
  anchor.closest(".row-btns").after(box);
}

// ---------- Followers / following / friends lists ----------
acct.views.people = async function viewPeople({ id, username, kind }) {
  title.textContent = `${kind[0].toUpperCase()}${kind.slice(1)} · @${username}`;
  body.innerHTML = `<div class="list" id="pp-list"><p class="fine">Loading...</p></div>`;
  await loadFollowersOfMe();
  const { data, error } = await sb.rpc("social_list", { p_user: id, p_kind: kind });
  if (stale("people")) return;
  if (error) { body.innerHTML = missingTables(error) ? notReady : `<p class="fine">${esc(friendly(error))}</p>`; return; }
  listInto(body.querySelector("#pp-list"), data || [], kind === "friends" ? "No friends yet." : "Nobody here yet.");
};

// ---------- Inbox: Activity and Friends ----------
function inboxTabs(active) {
  const seg = $(`<div class="seg tabs"><button data-v="notifications" aria-pressed="${active === "notifications"}">Activity</button><button data-v="friends" aria-pressed="${active === "friends"}">Friends</button></div>`);
  seg.addEventListener("click", e => { const b = e.target.closest("button"); if (b && b.dataset.v !== active) render(b.dataset.v); });
  return seg;
}

acct.views.notifications = async function viewNotifications() {
  title.textContent = "Inbox";
  body.replaceChildren(inboxTabs("notifications"), $(`<div class="list" id="nt-list"><p class="fine">Loading...</p></div>`));
  const { data } = await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(40);
  if (stale("notifications")) return;
  const list = body.querySelector("#nt-list");
  if (!data?.length) { list.innerHTML = `<p class="fine">Nothing yet. Follow people, post a story, or request one, and updates show up here.</p>`; return; }
  const actorIds = [...new Set(data.map(n => n.actor_id).filter(Boolean))];
  const people = {};
  if (actorIds.length) {
    const { data: ps } = await sb.from("public_profiles").select("*").in("id", actorIds);
    for (const x of ps || []) people[x.id] = x;
  }
  const unread = new Set(acct.unread.map(n => n.id));
  list.replaceChildren(...data.map(n => {
    const row = $(`<button class="notif-row${unread.has(n.id) ? " unread" : ""}"><span class="notif-text"></span><em>${ago(n.created_at)}</em></button>`);
    row.querySelector(".notif-text").textContent = n.message;
    const who = people[n.actor_id];
    row.prepend(who ? avatar(who, "av av-md") : $(`<span class="av av-md notif-mark"><svg viewBox="0 0 32 32"><use href="#fb-mark"/></svg></span>`));
    row.addEventListener("click", () => {
      if (n.story_id) { acct.close(); App().openStory?.(n.story_id); }
      else if (who) render("user", { username: who.username });
    });
    return row;
  }));
  if (acct.unread.length) await acct.markRead(acct.unread.map(n => n.id));
};

acct.views.friends = async function viewFriends() {
  title.textContent = "Inbox";
  body.replaceChildren(inboxTabs("friends"));
  const search = $(`<input class="search" type="search" placeholder="Find people by name" autocomplete="off" enterkeyhint="search">`);
  const results = $(`<div class="list"></div>`);
  body.append(search, results);
  body.append($(`<div class="label">Your friends</div>`), $(`<div class="list" id="fr-friends"><p class="fine">Loading...</p></div>`));
  body.append($(`<div class="label">People you may know</div>`), $(`<div class="list" id="fr-suggest"><p class="fine">Loading...</p></div>`));
  const links = $(`<div class="row-btns"><button class="btn-secondary" data-k="followers">My followers</button><button class="btn-secondary" data-k="following">Following</button></div>`);
  links.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (b) render("people", { id: me().id, username: acct.profile?.username || "you", kind: b.dataset.k });
  });
  body.append(links);
  let timer;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = search.value.trim();
      if (q.length < 2) { results.replaceChildren(); return; }
      const { data } = await sb.rpc("search_users", { q });
      if (search.value.trim() === q) listInto(results, data || [], "Nobody found with that name.");
    }, 300);
  });
  await loadFollowersOfMe();
  const [friends, suggest] = await Promise.all([sb.rpc("social_list", { p_user: me().id, p_kind: "friends" }), sb.rpc("suggest_users")]);
  if (stale("friends")) return;
  if (friends.error) { body.querySelector("#fr-friends").outerHTML = missingTables(friends.error) ? notReady : ""; return; }
  listInto(body.querySelector("#fr-friends"), friends.data || [], "No friends yet. Follow people, and when they follow you back you're friends.");
  listInto(body.querySelector("#fr-suggest"), suggest.data || [], "No suggestions right now.");
};

// ---------- Send a story to a friend ----------
acct.views.send = async function viewSend({ story }) {
  title.textContent = "Send to a friend";
  body.innerHTML = `<p class="fine">"${esc(story.title)}"</p><div class="list" id="sd-list"><p class="fine">Loading...</p></div>`;
  const { data, error } = await sb.rpc("social_list", { p_user: me().id, p_kind: "friends" });
  if (stale("send")) return;
  const list = body.querySelector("#sd-list");
  if (error) { list.innerHTML = missingTables(error) ? notReady : esc(friendly(error)); return; }
  if (!data?.length) {
    list.innerHTML = `<p class="fine">You can send stories to friends (people you follow who follow you back).</p>`;
    const find = $(`<button class="btn-primary">Find friends</button>`);
    find.addEventListener("click", () => render("friends"));
    list.append(find);
    return;
  }
  list.replaceChildren(...data.map(p => {
    const row = personRow(p, { button: false });
    const send = $(`<button class="follow-btn">Send</button>`);
    send.addEventListener("click", async e => {
      e.stopPropagation();
      send.disabled = true;
      const { error } = await sb.from("story_shares").insert({ from_user: me().id, to_user: p.id, story_id: story.id });
      if (error) { send.disabled = false; return toast(friendly(error).replace(/^.*?: /, "")); }
      send.textContent = "Sent"; send.classList.add("on");
      App().learnSent?.(story.id);
    });
    row.append(send);
    return row;
  }));
};

// ---------- Write: post your own story, or request an AI one ----------
acct.views.create = function viewCreate() {
  title.textContent = "Write";
  body.innerHTML = `
    <button class="choice" data-v="post"><strong>Post your own story</strong><span>Share something that happened to you, or something you made up. Readers hear it narrated, with your name on it.</span></button>
    <button class="choice" data-v="request"><strong>Request an AI story</strong><span>Give the AI an idea and it writes a story around it. We'll tell you when it's ready.</span></button>`;
  body.querySelectorAll(".choice").forEach(b => b.addEventListener("click", () => render(b.dataset.v)));
};

acct.views.post = function viewPost() {
  title.textContent = "Post a story";
  const draft = JSON.parse(storageGet(POST_DRAFT) || "{}");
  body.innerHTML = `<form class="form" id="po-form">
      <label>Title<input id="po-title" required minlength="3" maxlength="100" value="${esc(draft.title || "")}" placeholder="AITA for refusing to share my fries?"></label>
      <label>Your story<textarea id="po-body" rows="12" placeholder="Start with the moment everything went sideways...">${esc(draft.body || "")}</textarea></label>
      <p class="fine" id="po-count"></p>
      <div class="row-2">
        <label>Kind<select id="po-genre"><option value="">Let FlypBook pick</option>${GENRES.map(g => `<option ${draft.genre === g ? "selected" : ""}>${g}</option>`).join("")}</select></label>
        <label>Tone<select id="po-tone"><option value="">Let FlypBook pick</option>${TONES.map(t => `<option ${draft.tone === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      </div>
      <label class="check"><input type="checkbox" id="po-own" required> I wrote this myself. It isn't copied from Reddit or anywhere else.</label>
      <p class="fine">Change names and leave out schools, addresses and anything private. Every story is checked for safety before it goes live (usually within 30 minutes). You can delete it any time from your profile.</p>
      <button class="btn-primary" type="submit">Post story</button>
      <p class="form-msg" aria-live="polite"></p>
    </form>`;
  const titleIn = body.querySelector("#po-title"), text = body.querySelector("#po-body"), count = body.querySelector("#po-count");
  const save = () => {
    storageSet(POST_DRAFT, JSON.stringify({ title: titleIn.value, body: text.value, genre: body.querySelector("#po-genre").value, tone: body.querySelector("#po-tone").value }));
    const n = words(text.value);
    count.textContent = `${n} words · about ${Math.max(1, Math.round(n / 150))} min read` + (n < MIN_WORDS ? ` · at least ${MIN_WORDS} words needed` : n > MAX_WORDS ? ` · ${MAX_WORDS} words max` : "");
    count.dataset.kind = n < MIN_WORDS || n > MAX_WORDS ? "error" : "";
  };
  save();
  body.querySelector("#po-form").addEventListener("input", save);
  body.querySelector("#po-form").addEventListener("submit", async e => {
    e.preventDefault();
    const n = words(text.value);
    if (n < MIN_WORDS) return msg(`Your story needs at least ${MIN_WORDS} words (it has ${n}).`, "error");
    if (n > MAX_WORDS) return msg(`Please keep it under ${MAX_WORDS} words (it has ${n}).`, "error");
    msg("Posting...");
    const { error } = await sb.from("story_submissions").insert({
      user_id: me().id, title: titleIn.value.trim(), body: text.value.trim(),
      genre: body.querySelector("#po-genre").value || null, tone: body.querySelector("#po-tone").value || null,
    });
    if (error) return msg(missingTables(error) ? "Posting isn't open yet. Check back soon." : friendly(error).replace(/^.*?: /, ""), "error");
    storageSet(POST_DRAFT, null);
    body.innerHTML = `<div class="sorry ok"><strong>Posted!</strong><p>Your story is being checked. We'll notify you when it's live, usually within 30 minutes.</p></div>`;
  });
};

// The Inbox badge counts new followers, sends, and posts too, and the Friends tab now has data.
App().onSocialReady?.();
