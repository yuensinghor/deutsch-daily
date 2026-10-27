import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppState, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from "react-native";
import * as Speech from "expo-speech";
import * as Clipboard from "expo-clipboard";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import { SENTENCES } from "./src/sentences";
import { loadState, saveState } from "./src/storage";
import {
  REPS_GOAL, allSentences, buildToday, completeCard, currentStreak, dateStr,
  makeBackup, parseImport, readBackup, wordDiff,
} from "./src/logic";

const C = {
  bg: "#000000", text: "#FFFFFF", dim: "#8E8E93", faint: "#3A3A3C",
  panel: "#1C1C1E", accent: "#FF9F0A", good: "#30D158", bad: "#FF453A",
};

export default function App() {
  const [state, setState] = useState(null);
  const [reps, setReps] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const [micMsg, setMicMsg] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [importText, setImportText] = useState("");
  const [addMsg, setAddMsg] = useState("");

  // load once, then make sure today's list exists
  useEffect(() => {
    loadState().then((s) => setState(buildToday(s, allSentences(SENTENCES, s), dateStr())));
  }, []);

  // save on every change
  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  // new day while the app stays open in the background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") {
        setState((prev) => (prev ? buildToday(prev, allSentences(SENTENCES, prev), dateStr()) : prev));
      }
    });
    return () => sub.remove();
  }, []);

  const bank = useMemo(() => {
    const map = {};
    if (state) allSentences(SENTENCES, state).forEach((s) => { map[s.id] = s; });
    return map;
  }, [state && state.custom]);

  const today = dateStr();
  const cards = state ? state.today.cards : [];
  const doneIds = state ? state.today.done : [];
  const card = cards.find((c) => !doneIds.includes(c.id));
  const sentence = card ? bank[card.id] : null;
  const streak = state ? currentStreak(state, today) : 0;

  // reset per-card UI when the card changes
  useEffect(() => {
    setReps(0); setRevealed(false); setHeard(""); setMicMsg("");
  }, [card && card.id]);

  // ---------- speech ----------
  const speak = useCallback((text, rate) => {
    Speech.stop();
    Speech.speak(text, { language: "de-DE", rate });
  }, []);

  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("result", (e) => {
    const t = e.results && e.results[0] ? e.results[0].transcript : "";
    setHeard(t);
  });
  useSpeechRecognitionEvent("error", (e) => {
    setListening(false);
    setMicMsg("Mic check failed (" + (e.error || "unknown") + "). Try again.");
  });

  async function startMic() {
    setMicMsg(""); setHeard("");
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) { setMicMsg("Allow the microphone to use the check."); return; }
    Speech.stop();
    ExpoSpeechRecognitionModule.start({ lang: "de-DE", interimResults: true, maxAlternatives: 1 });
  }

  function stopMic() {
    ExpoSpeechRecognitionModule.stop();
  }

  // ---------- actions ----------
  function finish(ok) {
    Speech.stop();
    setState((s) => completeCard(s, card.id, ok, dateStr()));
  }

  function reveal() {
    setRevealed(true);
    speak(sentence.de, 0.9);
  }

  function runImport() {
    const txt = importText.trim();
    if (!txt) { setAddMsg("Paste sentences or a backup first."); return; }

    if (txt.startsWith("{")) {
      const b = readBackup(txt);
      if (!b) { setAddMsg("That backup could not be read."); return; }
      setState((s) => buildToday({ ...s, learned: b.learned, custom: b.custom, streak: b.streak, today: null },
        allSentences(SENTENCES, { custom: b.custom }), dateStr()));
      setAddMsg("Backup restored.");
      setImportText("");
      return;
    }

    const existing = allSentences(SENTENCES, state).map((s) => s.de);
    const { added, skipped } = parseImport(txt, existing);
    if (added.length === 0) {
      setAddMsg("Nothing new added. " + skipped.length + " line(s) skipped (duplicate or wrong format).");
      return;
    }
    setState((s) => {
      const custom = s.custom.concat(added);
      const keepToday = s.today && s.today.cards.length > 0;
      return buildToday({ ...s, custom, today: keepToday ? s.today : null },
        allSentences(SENTENCES, { custom }), dateStr());
    });
    setAddMsg("Added " + added.length + " sentence(s)." + (skipped.length ? " Skipped " + skipped.length + "." : ""));
    setImportText("");
  }

  async function copyBackup() {
    await Clipboard.setStringAsync(makeBackup(state));
    setAddMsg("Backup copied. Paste it into a note to keep it safe.");
  }

  async function pasteClipboard() {
    const t = await Clipboard.getStringAsync();
    setImportText(t || "");
  }

  if (!state) return <View style={s.root} />;

  // ---------- screens ----------
  let body;
  if (cards.length === 0) {
    body = (
      <Center title="All caught up" sub={"No new sentences left and nothing to review.\nOpen ⋯ and paste a new batch."} />
    );
  } else if (!card) {
    body = (
      <Center title="Done for today" sub={"🔥 " + streak + (streak === 1 ? " day" : " days") + " in a row\nSee you tomorrow."} />
    );
  } else if (card.type === "new") {
    const diff = heard ? wordDiff(sentence.de, heard) : null;
    body = (
      <ScrollView contentContainerStyle={s.cardWrap}>
        <Text style={s.tag}>New · {"●".repeat(sentence.level)}{"○".repeat(3 - sentence.level)}</Text>
        <Text style={s.de}>{sentence.de}</Text>
        <Text style={s.en}>{sentence.en}</Text>
        {sentence.note ? <Text style={s.note}>{sentence.note}</Text> : null}

        <View style={s.row}>
          <Btn label="🔊 Listen" onPress={() => speak(sentence.de, 0.95)} />
          <Btn label="🐢 Slow" onPress={() => speak(sentence.de, 0.55)} />
          <Btn label={listening ? "■ Stop" : "🎤 Check"} onPress={listening ? stopMic : startMic} />
        </View>

        {diff ? (
          <Text style={s.diff}>
            {diff.map((d, i) => (
              <Text key={i} style={{ color: d.ok ? C.good : C.bad }}>{d.word + " "}</Text>
            ))}
          </Text>
        ) : null}
        {micMsg ? <Text style={s.micMsg}>{micMsg}</Text> : null}

        <Pressable style={s.repBtn} onPress={() => setReps((r) => r + 1)}>
          <Text style={s.repTxt}>I said it aloud</Text>
          <Text style={s.repCount}>{reps} / {REPS_GOAL}</Text>
        </Pressable>

        <Pressable
          style={[s.main, reps < REPS_GOAL && s.mainOff]}
          disabled={reps < REPS_GOAL}
          onPress={() => finish(true)}
        >
          <Text style={[s.mainTxt, reps < REPS_GOAL && { color: C.dim }]}>
            {reps < REPS_GOAL ? "Say it " + REPS_GOAL + " times to finish" : "Got it ✓"}
          </Text>
        </Pressable>
      </ScrollView>
    );
  } else {
    body = (
      <ScrollView contentContainerStyle={s.cardWrap}>
        <Text style={s.tag}>Recall</Text>
        <Text style={s.deHidden}>{sentence.en}</Text>
        {!revealed ? (
          <Pressable style={s.main} onPress={reveal}>
            <Text style={s.mainTxt}>Show German</Text>
          </Pressable>
        ) : (
          <>
            <Text style={s.de}>{sentence.de}</Text>
            {sentence.note ? <Text style={s.note}>{sentence.note}</Text> : null}
            <View style={s.row}>
              <Btn label="🔊 Listen" onPress={() => speak(sentence.de, 0.95)} />
              <Btn label="🐢 Slow" onPress={() => speak(sentence.de, 0.55)} />
            </View>
            <View style={s.row}>
              <Pressable style={[s.half, { backgroundColor: C.panel }]} onPress={() => finish(false)}>
                <Text style={s.mainTxtLight}>Again</Text>
              </Pressable>
              <Pressable style={[s.half, { backgroundColor: C.text }]} onPress={() => finish(true)}>
                <Text style={s.mainTxt}>Knew it ✓</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={s.header}>
        <Text style={s.streak}>🔥 {streak}</Text>
        <Text style={s.progress}>
          {cards.length > 0 ? Math.min(doneIds.length + 1, cards.length) + " / " + cards.length : ""}
        </Text>
        <Pressable onPress={() => { setAddMsg(""); setShowAdd(true); }} hitSlop={16}>
          <Text style={s.menu}>⋯</Text>
        </Pressable>
      </View>

      {body}

      <Modal visible={showAdd} animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={s.root}>
          <View style={s.header}>
            <Text style={s.modalTitle}>Add sentences or restore</Text>
            <Pressable onPress={() => setShowAdd(false)} hitSlop={16}>
              <Text style={s.menu}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={s.note}>
              One sentence per line:{"\n"}German | English | note | level (1-3){"\n"}
              Note and level are optional. Or paste a backup.
            </Text>
            <TextInput
              style={s.input}
              multiline
              value={importText}
              onChangeText={setImportText}
              placeholder="Paste here"
              placeholderTextColor={C.dim}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {addMsg ? <Text style={s.micMsg}>{addMsg}</Text> : null}
            <View style={s.row}>
              <Btn label="Paste" onPress={pasteClipboard} />
              <Btn label="Copy backup" onPress={copyBackup} />
            </View>
            <Pressable style={s.main} onPress={runImport}>
              <Text style={s.mainTxt}>Import</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Btn({ label, onPress }) {
  return (
    <Pressable style={s.btn} onPress={onPress}>
      <Text style={s.btnTxt}>{label}</Text>
    </Pressable>
  );
}

function Center({ title, sub }) {
  return (
    <View style={s.center}>
      <Text style={s.bigTitle}>{title}</Text>
      <Text style={s.centerSub}>{sub}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: (StatusBar.currentHeight || 24) + 8 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 8 },
  streak: { color: C.accent, fontSize: 22, fontWeight: "700" },
  progress: { color: C.dim, fontSize: 16 },
  menu: { color: C.text, fontSize: 28, paddingHorizontal: 6 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: "600" },

  cardWrap: { padding: 20, paddingBottom: 48 },
  tag: { color: C.dim, fontSize: 14, marginBottom: 16 },
  de: { color: C.text, fontSize: 30, lineHeight: 40, fontWeight: "700" },
  deHidden: { color: C.text, fontSize: 26, lineHeight: 36, fontWeight: "600", marginBottom: 24 },
  en: { color: C.dim, fontSize: 18, lineHeight: 26, marginTop: 14 },
  note: { color: C.dim, fontSize: 14, lineHeight: 20, marginTop: 14, fontStyle: "italic" },

  row: { flexDirection: "row", gap: 10, marginTop: 24 },
  btn: { flex: 1, backgroundColor: C.panel, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  btnTxt: { color: C.text, fontSize: 15 },

  diff: { fontSize: 20, lineHeight: 30, marginTop: 20, fontWeight: "600" },
  micMsg: { color: C.dim, fontSize: 14, marginTop: 12 },

  repBtn: { marginTop: 28, borderWidth: 1.5, borderColor: C.faint, borderRadius: 16, paddingVertical: 18, alignItems: "center" },
  repTxt: { color: C.text, fontSize: 17 },
  repCount: { color: C.accent, fontSize: 28, fontWeight: "700", marginTop: 4 },

  main: { marginTop: 16, backgroundColor: C.text, borderRadius: 16, paddingVertical: 18, alignItems: "center" },
  mainOff: { backgroundColor: C.panel },
  mainTxt: { color: C.bg, fontSize: 18, fontWeight: "700" },
  mainTxtLight: { color: C.text, fontSize: 18, fontWeight: "700" },
  half: { flex: 1, borderRadius: 16, paddingVertical: 18, alignItems: "center" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  bigTitle: { color: C.text, fontSize: 32, fontWeight: "700" },
  centerSub: { color: C.dim, fontSize: 18, lineHeight: 28, textAlign: "center", marginTop: 14 },

  input: { backgroundColor: C.panel, color: C.text, borderRadius: 14, padding: 14, minHeight: 200, marginTop: 16, fontSize: 15, textAlignVertical: "top" },
});
