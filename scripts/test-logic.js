// Run with:  node scripts/test-logic.js
const assert = require("assert");
const L = require("../src/logic");
const { SENTENCES } = require("../src/sentences");

const all = (st) => L.allSentences(SENTENCES, st);
let st = L.emptyState();

// Day 1: exactly one new card
st = L.buildToday(st, all(st), "2026-11-01");
assert.strictEqual(st.today.cards.length, 1);
assert(st.today.cards.every((c) => c.type === "new"));
st = L.completeCard(st, st.today.cards[0].id, true, "2026-11-01");
assert.strictEqual(st.streak.count, 1);
assert.strictEqual(L.currentStreak(st, "2026-11-01"), 1);

// Rebuilding the same day changes nothing
assert.strictEqual(L.buildToday(st, all(st), "2026-11-01"), st);

// Day 2: one new sentence, not a scheduled review batch
st = L.buildToday(st, all(st), "2026-11-02");
assert.deepStrictEqual(st.today.cards.map((c) => c.type), ["new"]);
st.today.cards.forEach((c) => { st = L.completeCard(st, c.id, true, "2026-11-02"); });
assert.strictEqual(st.streak.count, 2);

const firstId = SENTENCES[0].id;
assert.strictEqual(st.learned[firstId].since, "2026-11-01");

// Miss a day: streak shows 0 on Nov 5, restarts at 1 after finishing
assert.strictEqual(L.currentStreak(st, "2026-11-03"), 2);
assert.strictEqual(L.currentStreak(st, "2026-11-05"), 0);
st = L.buildToday(st, all(st), "2026-11-05");
st.today.cards.forEach((c) => { st = L.completeCard(st, c.id, false, "2026-11-05"); });
assert.strictEqual(st.streak.count, 1);

// Month/year rollover
assert.strictEqual(L.addDays("2026-12-31", 1), "2027-01-01");
assert.strictEqual(L.addDays("2026-03-01", -1), "2026-02-28");

// Import: valid, optional fields, duplicates, bad lines
const existing = all(L.emptyState()).map((x) => x.de);
const imp = L.parseImport(
  "# comment\nIch bin müde. | I am tired. | simple | 1\n | missing German\n\nIch bin müde! | duplicate | | 2\n" +
  SENTENCES[0].de + " | dup of built-in",
  existing
);
assert.strictEqual(imp.added.length, 1);
assert.strictEqual(imp.added[0].level, 1);
assert.strictEqual(imp.skipped.length, 3);

// Backup round trip
let st2 = L.emptyState();
st2.custom = imp.added;
const back = L.readBackup(L.makeBackup(st2));
assert(back && back.custom.length === 1);
assert.strictEqual(L.readBackup("{not json"), null);

// Built-in data sanity
const ids = new Set(SENTENCES.map((x) => x.id));
assert.strictEqual(ids.size, SENTENCES.length);
assert(SENTENCES.every((x) => x.de && x.en && [1, 2, 3].includes(x.level)));

console.log("All tests passed (" + SENTENCES.length + " sentences).");
