// FlypBook rewards ("carrot and stick"): XP and levels, a daily goal ring, a streak that can be at risk,
// quiz combos, and things you unlock by leveling up. Signed-in readers: the database keeps score
// (supabase/006_rewards.sql), so XP can't be faked. Guests: the same rules run on this phone.
//
// Carrots: XP for finishing (+20), right answers (+15, x2 on a 3-in-a-row combo), the daily goal (+30),
//          likes (+2) and comments (+5); levels with titles; unlockable highlight colors and profile frames.
//          (Narrator voices are never locked.)
// Sticks:  only finished stories fill the goal ring; the streak ends at midnight unless you hit your
//          goal (the ring warns you after 8 PM); a wrong answer breaks the combo. Never taken away: XP.

const XP = { finish: 20, correct: 15, goal: 30, like: 2, comment: 5 };
// XP needed to reach each level (level 1 starts at 0).
const LEVEL_XP = [0, 100, 280, 540, 880, 1300, 1800, 2400, 3100, 3900, 4800, 5800, 6900, 8100, 9400];
// A new title at every level, so each level-up means something.
const TITLES = ["First Page", "Page-Turner", "Bookworm", "Chapter Chaser", "Storyteller", "Plot Twister", "Bard", "Wordsmith",
  "Playwright", "Laureate", "Shakespeare"];
// What each level unlocks. "setting" entries unlock one option in Settings.
const UNLOCKS = [
  { level: 2, label: "Lilac highlight", setting: ["hlcolor", "#bba6f2"] },
  { level: 3, label: "Coral highlight", setting: ["hlcolor", "#ff8a65"] },
  { level: 4, label: "Mint highlight", setting: ["hlcolor", "#9fe3b8"] },
  { level: 5, label: "An ink frame around your profile picture" },
  { level: 8, label: "A gold frame around your profile picture" },
  { level: 11, label: "The title Shakespeare, in gold" },
];
const GOALS = [1, 3, 5, 10];
const LOCAL_KEY = "flypbook-rewards";

const today = () => new Date().toLocaleDateString("en-CA");            // YYYY-MM-DD on this phone
const dayDiff = (a, b) => Math.round((new Date(a + "T12:00") - new Date(b + "T12:00")) / 864e5);
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } };

function levelOf(xp) {
  let level = 1;
  while (level < LEVEL_XP.length && xp >= LEVEL_XP[level]) level++;
  const floor = LEVEL_XP[level - 1], next = LEVEL_XP[level] ?? floor + 1500;
  return { level, title: TITLES[Math.min(level, TITLES.length) - 1], floor, next, into: xp - floor, span: next - floor };
}

const Rewards = {
  signedIn: false,
  p: null,          // progress: { xp, goal, today, streak, best, freezes, goal_done }
  combo: 0,
  levelOf,
  UNLOCKS,

  /** Is a Settings option locked? Returns the unlock (with its level) or null. */
  lockFor(key, value) {
    const u = UNLOCKS.find(x => x.setting && x.setting[0] === key && x.setting[1] === value);
    return u && levelOf(this.p?.xp || 0).level < u.level ? u : null;
  },
  frameFor(xp) { const l = levelOf(xp || 0).level; return l >= 8 ? "gold" : l >= 5 ? "ink" : ""; },

  // ---------- guest mode: the same rules, saved on this phone ----------
  local() {
    let s;
    try { s = JSON.parse(localStorage.getItem(LOCAL_KEY) || "null"); } catch {}
    s = s || { xp: 0, goal: 3, day: today(), today: 0, streak: 0, best: 0, last: null, freezes: 0, done: {}, combo: 0 };
    if (s.day !== today()) { s.day = today(); s.today = 0; s.done = {}; }
    return s;
  },
  saveLocal(s) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(s)); } catch {} },
  fromLocal(s) {
    const gap = s.last ? dayDiff(today(), s.last) : 99;
    const streak = gap <= 1 || (gap === 2 && s.freezes > 0) ? s.streak : 0;
    return { xp: s.xp, goal: s.goal, today: s.today, streak, best: s.best, freezes: s.freezes, goal_done: s.last === today() };
  },
  localAward(kind, id) {
    const s = this.local(), key = kind + ":" + id;
    if (s.done[key]) return { gained: 0, goal_hit: false };
    s.done[key] = 1;
    let gained = XP[kind] || 0, goalHit = false;
    if (kind === "finish") {
      s.today++;
      if (s.today >= s.goal && s.last !== today()) {
        goalHit = true; gained += XP.goal;
        const gap = s.last ? dayDiff(today(), s.last) : 99;
        if (gap === 1) s.streak++;
        else if (gap === 2 && s.freezes > 0) { s.streak++; s.freezes--; }
        else s.streak = 1;
        if (s.streak % 7 === 0) s.freezes = Math.min(2, s.freezes + 1);
        s.best = Math.max(s.best, s.streak); s.last = today();
      }
    }
    s.xp += gained;
    this.saveLocal(s);
    return { ...this.fromLocal(s), gained, goal_hit: goalHit };
  },

  // ---------- events from the app ----------
  async load(account) {
    this.signedIn = !!account?.user;
    if (this.signedIn) {
      const { data, error } = await window.sb.rpc("my_progress", { p_tz: tz() });
      if (!error && data) this.p = data;
      else { this.signedIn = false; this.p = this.fromLocal(this.local()); }   // rewards not set up on the server yet
    } else this.p = this.fromLocal(this.local());
    this.combo = this.local().combo || 0;
    UI.render();
  },
  async award(kind, story) {
    if (!story?.id) return;
    const before = levelOf(this.p?.xp || 0).level;
    let r;
    if (this.signedIn) {
      const { data, error } = await window.sb.rpc("award_xp", { p_story: story.id, p_kind: kind, p_tz: tz() });
      if (error) return;
      r = data;
    } else r = this.localAward(kind, story.id);
    this.p = { ...this.p, ...r };
    this.celebrate(r, before);
  },
  /** After a quiz answer. Signed in: the server's result. Guests: score it here. Returns what to show. */
  answered(storyId, res) {
    const before = levelOf(this.p?.xp || 0).level;
    let gained = 0, combo = 0;
    if (this.signedIn) {
      gained = res.gained || 0; combo = res.combo || 0;
      if (res.points != null) this.p = { ...this.p, xp: res.points };
    } else if (!res.already) {
      const s = this.local();
      if (!s.done["correct:" + storyId]) {
        s.done["correct:" + storyId] = 1;
        s.combo = res.correct ? (s.combo || 0) + 1 : 0;
        combo = s.combo;
        gained = res.correct ? XP.correct * (combo >= 3 ? 2 : 1) : 0;
        s.xp += gained;
        this.saveLocal(s);
        this.p = { ...this.fromLocal(s) };
      }
    }
    if (!res.already) this.combo = combo;
    if (gained) this.celebrate({ gained }, before);
    else UI.render();
    return { gained, combo };
  },
  async setGoal(goal) {
    if (this.signedIn) {
      await window.sb.from("profiles").update({ daily_goal: goal }).eq("id", window.Account.user.id);
      const { data } = await window.sb.rpc("my_progress", { p_tz: tz() });
      if (data) this.p = data;
    } else {
      const s = this.local(); s.goal = goal; this.saveLocal(s); this.p = this.fromLocal(s);
    }
    UI.render();
  },

  celebrate(r, levelBefore) {
    UI.render();
    if (r.gained) UI.floatXP(r.gained);
    if (r.goal_hit) {
      UI.pulse();
      window.App?.toast?.(`Daily goal done. ${this.p.streak}-day streak, +${XP.goal} XP`);
    }
    const now = levelOf(this.p.xp || 0);
    if (now.level > levelBefore) setTimeout(() => UI.levelUp(now), r.goal_hit ? 1600 : 400);
  },
};

// ---------- what the reader sees ----------
const UI = {
  els: null,
  mount() {
    const actions = document.querySelector("#topbar .top-actions");
    if (!actions || this.els) return;
    const btn = document.createElement("button");
    btn.className = "goal-ring";
    btn.setAttribute("aria-label", "Your daily goal and streak");
    btn.innerHTML = `<svg viewBox="0 0 40 40" class="ring"><circle class="track" cx="20" cy="20" r="16"/><circle class="fill" cx="20" cy="20" r="16"/></svg>
      <span class="flame"><svg viewBox="0 0 24 24"><path d="M12 21.5c-3.9 0-6.8-2.8-6.8-6.5 0-2.9 1.7-5 3.4-6.8.4 1.6 1.3 2.7 2.4 3.2-.2-3.2 1.3-6.2 4-8.4.3 3 1.6 4.8 2.9 6.5 1 1.4 1.9 3 1.9 5.3 0 3.9-3.1 6.7-7.8 6.7z"/></svg><b></b></span>`;
    btn.addEventListener("click", () => this.openSheet());
    actions.prepend(btn);
    this.els = { btn, fill: btn.querySelector(".fill"), count: btn.querySelector("b") };
    this.render();
    setInterval(() => this.render(), 60000);   // the "at risk" warning turns on at 8 PM
  },
  render() {
    if (!this.els || !Rewards.p) return;
    const p = Rewards.p, frac = Math.min(1, (p.today || 0) / (p.goal || 3));
    const C = 2 * Math.PI * 16;
    this.els.fill.style.strokeDasharray = `${C * frac} ${C}`;
    this.els.count.textContent = p.streak || 0;
    const atRisk = !p.goal_done && p.streak > 0 && new Date().getHours() >= 20;
    this.els.btn.classList.toggle("done", !!p.goal_done);
    this.els.btn.classList.toggle("risk", atRisk);
    this.els.btn.classList.toggle("cold", !p.streak && !p.goal_done);
    if (atRisk) {
      const key = "flypbook-risk-" + today();
      try {
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          const left = Math.max(1, p.goal - p.today);
          setTimeout(() => window.App?.toast?.(`Your ${p.streak}-day streak ends at midnight. ${left} more ${left === 1 ? "story" : "stories"}.`), 2500);
        }
      } catch {}
    }
    if (this.sheet && !this.sheet.hidden) this.fillSheet();
  },
  floatXP(n) {
    const chip = document.createElement("div");
    chip.className = "xp-float";
    chip.textContent = `+${n} XP`;
    document.getElementById("app").append(chip);
    setTimeout(() => chip.remove(), 1500);
  },
  pulse() {
    this.els?.btn.classList.remove("pulse");
    void this.els?.btn.offsetWidth;
    this.els?.btn.classList.add("pulse");
  },
  levelUp(lv) {
    const unlocked = UNLOCKS.filter(u => u.level === lv.level);
    const card = document.createElement("div");
    card.className = "levelup";
    card.innerHTML = `<div class="levelup-card">
        <div class="levelup-num">${lv.level}</div>
        <small>Level up</small>
        <strong></strong>
        ${unlocked.length ? `<p>Unlocked: ${unlocked.map(u => u.label).join(", ")}</p>` : ""}
        <button class="btn-primary">Keep going</button></div>`;
    card.querySelector("strong").textContent = lv.title;
    card.querySelector("button").addEventListener("click", () => card.remove());
    card.addEventListener("click", e => { if (e.target === card) card.remove(); });
    document.getElementById("app").append(card);
  },

  // ---------- the progress page ----------
  sheet: null,
  openSheet() {
    if (!this.sheet) {
      this.sheet = document.createElement("section");
      this.sheet.className = "sheet progress-sheet";
      this.sheet.setAttribute("aria-label", "Your progress");
      this.sheet.innerHTML = `<div class="grabber"></div><div class="sheet-head"><h2>Your progress</h2><button class="icon-btn" aria-label="Close">&times;</button></div><div class="pg-body"></div>`;
      this.sheet.querySelector(".icon-btn").addEventListener("click", () => { this.sheet.hidden = true; });
      document.getElementById("app").append(this.sheet);
    }
    window.App?.closeSheets?.();
    window.App?.pause?.();
    this.sheet.hidden = false;
    this.fillSheet();
  },
  fillSheet() {
    const p = Rewards.p || {}, lv = levelOf(p.xp || 0), body = this.sheet.querySelector(".pg-body");
    const nextUnlock = UNLOCKS.find(u => u.level > lv.level);
    body.innerHTML = `
      <div class="pg-level">
        <div class="pg-badge">${lv.level}</div>
        <div><strong>${lv.title}</strong><span>${p.xp || 0} XP · ${lv.span - lv.into} XP to level ${lv.level + 1}</span>
          <div class="pg-bar"><i style="width:${Math.round(100 * lv.into / lv.span)}%"></i></div></div>
      </div>
      <div class="pg-cards">
        <div class="pg-card"><b>${p.today || 0}<small>/${p.goal || 3}</small></b><span>stories today</span></div>
        <div class="pg-card ${p.streak ? "hot" : ""}"><b>${p.streak || 0}</b><span>day streak${p.best ? ` · best ${p.best}` : ""}</span></div>
        <div class="pg-card"><b>${p.freezes || 0}</b><span>streak ${p.freezes === 1 ? "freeze" : "freezes"}</span></div>
      </div>
      <p class="fine">${p.goal_done ? "Today's goal is done. Anything more is a bonus." :
        `Finish ${Math.max(0, (p.goal || 3) - (p.today || 0))} more ${(p.goal || 3) - (p.today || 0) === 1 ? "story" : "stories"} today to ${p.streak ? "keep" : "start"} your streak. It resets at midnight.`}
        Every 7-day streak earns a freeze that saves one missed day.</p>
      <div class="label">Daily goal</div>
      <div class="seg pg-goal">${GOALS.map(g => `<button data-g="${g}" aria-pressed="${g === p.goal}">${g} ${g === 1 ? "story" : "stories"}</button>`).join("")}</div>
      <div class="label">How to earn XP</div>
      <div class="pg-earn">
        <div><span>Finish a story</span><b>+${XP.finish}</b></div>
        <div><span>Answer the question right</span><b>+${XP.correct}</b></div>
        <div><span>Three right in a row (combo)</span><b>×2</b></div>
        <div><span>Hit your daily goal</span><b>+${XP.goal}</b></div>
        <div><span>Like / comment</span><b>+${XP.like} / +${XP.comment}</b></div>
      </div>
      <div class="label">Unlocks</div>
      <div class="pg-unlocks">${UNLOCKS.map(u => `<div class="${u.level <= lv.level ? "got" : ""}"><em>Lv ${u.level}</em><span>${u.label}</span></div>`).join("")}</div>
      ${nextUnlock ? `<p class="fine">Next unlock at level ${nextUnlock.level}: ${nextUnlock.label}.</p>` : ""}
      ${Rewards.signedIn ? "" : `<p class="fine">Your progress is saved on this phone. Create a free account to keep it everywhere.</p>`}`;
    body.querySelectorAll(".pg-goal button").forEach(b => b.addEventListener("click", () => Rewards.setGoal(Number(b.dataset.g))));
  },
};
Rewards.ui = UI;
window.Rewards = Rewards;
