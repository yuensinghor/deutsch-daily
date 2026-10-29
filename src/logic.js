// Pure logic: no React, no phone APIs. Tested with scripts/test-logic.js

const NEW_PER_DAY = 1;

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

// Presents one new sentence per day. The same sentence remains available after completion.
function buildToday(state, all, today) {
  if (state.today && state.today.date === today) {
    const existing = state.today.cards || [];
    const isCurrentFormat = existing.length <= 1 && existing.every((card) => card.type === "new");
    if (isCurrentFormat) return state;
  }
  const fresh = all
    .filter((s) => !state.learned[s.id])
    .slice(0, NEW_PER_DAY)
    .map((s) => ({ id: s.id, type: "new" }));
  return { ...state, today: { date: today, cards: fresh, done: [] } };
}

function completeCard(state, id, _ok, today) {
  const t = state.today;
  if (!t || t.done.includes(id)) return state;
  const card = t.cards.find((c) => c.id === id);
  if (!card) return state;

  const learned = { ...state.learned };
  learned[id] = { since: today };

  const done = t.done.concat(id);
  let streak = state.streak;
  if (done.length >= t.cards.length && streak.last !== today) {
    const continues = streak.last === addDays(today, -1);
    streak = { count: continues ? streak.count + 1 : 1, last: today };
  }
  return { ...state, learned, today: { ...t, done }, streak };
}

function markSentenceLearned(state, id, today) {
  if (state.learned[id]) return state;
  const learned = { ...state.learned, [id]: { since: today } };
  const t = state.today;
  const done = t && t.cards.some((c) => c.id === id) && !t.done.includes(id)
    ? t.done.concat(id)
    : t?.done || [];
  let streak = state.streak;
  if (t && t.cards.length > 0 && done.length >= t.cards.length && streak.last !== today) {
    streak = { count: streak.last === addDays(today, -1) ? streak.count + 1 : 1, last: today };
  }
  return { ...state, learned, streak, today: t ? { ...t, done } : t };
}

// Streak shown on screen: still alive if you finished today or yesterday.
function currentStreak(state, today) {
  const { count, last } = state.streak;
  return last === today || last === addDays(today, -1) ? count : 0;
}

// ---------- import / backup ----------
function norm(s) {
  return s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[.,!?;:'’"„“()\-–]/g, " ").replace(/\s+/g, " ").trim();
}

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36) + str.length.toString(36);
}

// Import lines may contain German alone or German<TAB>English.
// Keep accepting the old pipe-delimited format for sentences imported with earlier app versions.
function parseImport(text, existingDe) {
  const seen = new Set(existingDe.map(norm));
  const added = [];
  const skipped = [];
  text.split(/\r?\n/).forEach((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("```")) return;
    const tabDelimited = line.includes("\t");
    const parts = line.split(tabDelimited ? "\t" : "|");
    const de = (parts[0]?.trim() || "").replace(/^(?:\d+[.)]\s+|[-*]\s+)/, "");
    const en = (tabDelimited ? parts.slice(1).join("\t") : parts[1] || "").trim();
    if (!de) { skipped.push(line); return; }
    if (["german", "deutsch"].includes(norm(de)) && ["english", "englisch"].includes(norm(en))) return;
    const key = norm(de);
    if (seen.has(key)) { skipped.push(line); return; }
    seen.add(key);
    const legacyLevel = !tabDelimited ? parseInt(parts[3], 10) : 2;
    added.push({
      id: "c" + hash(key), de, en,
      note: !tabDelimited ? (parts[2] || "").trim() : "",
      level: legacyLevel >= 1 && legacyLevel <= 3 ? legacyLevel : 2,
    });
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
  } catch {}
  return null;
}

module.exports = {
  NEW_PER_DAY,
  dateStr, addDays, emptyState, allSentences, buildToday, completeCard, markSentenceLearned,
  currentStreak, norm, parseImport, makeBackup, readBackup,
};
