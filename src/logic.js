// Pure logic: no React, no phone APIs. Tested with scripts/test-logic.js

const INTERVALS = [1, 3, 7, 30, 90]; // days until a learned sentence comes back
const NEW_PER_DAY = 2;               // new sentences per day (set to 1 if you prefer)
const MAX_REVIEWS = 3;               // max recall checks per day
const REPS_GOAL = 10;                // times to say a new sentence aloud

const pad = (n) => String(n).padStart(2, "0");

function dateStr(d = new Date()) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function addDays(s, n) {
  const [y, m, d] = s.split("-").map(Number);
  return dateStr(new Date(y, m - 1, d + n));
}

function emptyState() {
  return { learned: {}, custom: [], streak: { count: 0, last: null }, today: null };
}

function allSentences(base, state) {
  return base.concat(state.custom);
}

// Builds today's list once per day: recall checks first, then new sentences.
function buildToday(state, all, today) {
  if (state.today && state.today.date === today) return state;
  const reviews = Object.entries(state.learned)
    .filter(([, v]) => v.due <= today)
    .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : 0))
    .slice(0, MAX_REVIEWS)
    .map(([id]) => ({ id, type: "review" }));
  const fresh = all
    .filter((s) => !state.learned[s.id])
    .slice(0, NEW_PER_DAY)
    .map((s) => ({ id: s.id, type: "new" }));
  return { ...state, today: { date: today, cards: reviews.concat(fresh), done: [] } };
}

function completeCard(state, id, ok, today) {
  const t = state.today;
  if (!t || t.done.includes(id)) return state;
  const card = t.cards.find((c) => c.id === id);
  if (!card) return state;

  const learned = { ...state.learned };
  if (card.type === "new") {
    learned[id] = { stage: 0, due: addDays(today, INTERVALS[0]), since: today };
  } else {
    const cur = learned[id] || { stage: 0 };
    const stage = ok ? Math.min(cur.stage + 1, INTERVALS.length - 1) : 0;
    learned[id] = { ...cur, stage, due: addDays(today, INTERVALS[stage]) };
  }

  const done = t.done.concat(id);
  let streak = state.streak;
  if (done.length >= t.cards.length && streak.last !== today) {
    const continues = streak.last === addDays(today, -1);
    streak = { count: continues ? streak.count + 1 : 1, last: today };
  }
  return { ...state, learned, today: { ...t, done }, streak };
}

// Streak shown on screen: still alive if you finished today or yesterday.
function currentStreak(state, today) {
  const { count, last } = state.streak;
  return last === today || last === addDays(today, -1) ? count : 0;
}

// ---------- speech check ----------
function norm(s) {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/['’]/g, "")
    .replace(/[.,!?;:"„“()\-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Marks each target word as heard or not. Rough signal only.
function wordDiff(target, heard) {
  const h = new Set(norm(heard).split(" ").filter(Boolean));
  return target.split(/\s+/).map((w) => {
    const n = norm(w);
    return { word: w, ok: n === "" || h.has(n) };
  });
}

// ---------- import / backup ----------
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36) + str.length.toString(36);
}

// Line format:  German | English | note | level(1-3)
function parseImport(text, existingDe) {
  const seen = new Set(existingDe.map(norm));
  const added = [];
  const skipped = [];
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const p = line.split("|").map((x) => x.trim());
    if (p.length < 2 || !p[0] || !p[1]) { skipped.push(line); return; }
    const key = norm(p[0]);
    if (seen.has(key)) { skipped.push(line); return; }
    seen.add(key);
    const lv = parseInt(p[3], 10);
    added.push({ id: "c" + hash(key), de: p[0], en: p[1], note: p[2] || "", level: lv >= 1 && lv <= 3 ? lv : 2 });
  });
  return { added, skipped };
}

function makeBackup(state) {
  return JSON.stringify({ v: 1, learned: state.learned, custom: state.custom, streak: state.streak });
}

function readBackup(text) {
  try {
    const b = JSON.parse(text);
    if (b && b.v === 1 && b.learned && Array.isArray(b.custom) && b.streak) return b;
  } catch (e) {}
  return null;
}

module.exports = {
  INTERVALS, NEW_PER_DAY, MAX_REVIEWS, REPS_GOAL,
  dateStr, addDays, emptyState, allSentences, buildToday, completeCard,
  currentStreak, norm, wordDiff, parseImport, makeBackup, readBackup,
};
