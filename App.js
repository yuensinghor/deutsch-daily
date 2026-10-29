import React, { useEffect, useState } from "react";
import {
  AppState, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SENTENCES } from "./src/sentences";
import { loadState, saveState } from "./src/storage";
import {
  addVoiceDownloadListener, sherpaSpeak, sherpaStop, sherpaTtsAvailable,
} from "./modules/sherpa-tts";
import {
  allSentences, buildToday, completeCard, currentStreak, dateStr,
  markSentenceLearned, parseImport,
} from "./src/logic";

const C = {
  bg: "#000000", text: "#FFFFFF", dim: "#A1A1A6", faint: "#3A3A3C",
  panel: "#1C1C1E", accent: "#FF9F0A", good: "#30D158",
};

export default function App() {
  const [state, setState] = useState(null);
  const [view, setView] = useState("today");
  const [libraryId, setLibraryId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [importText, setImportText] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [speechMessage, setSpeechMessage] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("");
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    loadState().then((loaded) => setState(buildToday(loaded, allSentences(SENTENCES, loaded), dateStr())));
  }, []);

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        setState((current) => current ? buildToday(current, allSentences(SENTENCES, current), dateStr()) : current);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const subscription = addVoiceDownloadListener(({ progress }) => {
      setVoiceStatus(progress >= 100 ? "Loading German voice…" : `Downloading German voice · ${progress}%`);
    });
    return () => subscription?.remove();
  }, []);

  const sentences = state ? allSentences(SENTENCES, state) : [];
  const bank = Object.fromEntries(sentences.map((item) => [item.id, item]));
  const todayCard = state?.today?.cards?.[0];
  const todaySentence = todayCard ? bank[todayCard.id] : null;
  const selectedSentence = libraryId ? bank[libraryId] : null;
  const learnedCount = sentences.filter((item) => state?.learned?.[item.id]).length;
  const streak = state ? currentStreak(state, dateStr()) : 0;
  const completedToday = Boolean(todayCard && state?.today?.done?.includes(todayCard.id));

  async function speak(text) {
    setSpeechMessage("");
    setSpeaking(true);
    if (!sherpaTtsAvailable) {
      setSpeaking(false);
      setSpeechMessage("The Sherpa German voice engine is missing from this APK. Build a new Android APK from the updated project.");
      return;
    }

    setVoiceStatus("Preparing Dii high German voice…");
    try {
      await sherpaSpeak(text);
    } catch (error) {
      setSpeechMessage(error?.message || "Could not play the Dii high German voice. Connect to the internet and try again.");
    } finally {
      setVoiceStatus("");
      setSpeaking(false);
    }
  }

  function stopSpeaking() {
    sherpaStop();
    setVoiceStatus("");
    setSpeaking(false);
  }

  function completeToday() {
    if (!todayCard || completedToday) return;
    stopSpeaking();
    setState((current) => completeCard(current, todayCard.id, true, dateStr()));
  }

  function runImport() {
    const text = importText.trim();
    if (!text) { setImportMessage("Type or paste at least one German sentence."); return; }

    const existing = sentences.map((item) => item.de);
    const { added, skipped } = parseImport(text, existing);
    if (!added.length) {
      setImportMessage("No new sentences added. " + skipped.length + " duplicate or empty German line(s) skipped.");
      return;
    }
    setState((current) => {
      const updated = { ...current, custom: current.custom.concat(added) };
      const todayIsEmpty = current.today?.date === dateStr() && (current.today.cards || []).length === 0;
      if (!todayIsEmpty) return updated;
      const readyForNewSentence = { ...updated, today: null };
      return buildToday(readyForNewSentence, allSentences(SENTENCES, readyForNewSentence), dateStr());
    });
    setImportMessage("Added " + added.length + " sentence(s) to your library." +
      (skipped.length ? " Skipped " + skipped.length + " duplicate or empty German line(s)." : ""));
    setImportText("");
  }

  function markSelectedLearned() {
    if (!libraryId) return;
    setState((current) => markSentenceLearned(current, libraryId, dateStr()));
  }

  if (!state) return <View style={styles.root} />;

  const sentence = view === "library" ? selectedSentence : todaySentence;
  const sentenceIsLearned = Boolean(sentence && state.learned?.[sentence.id]);
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        {view === "today" ? (
          <Text style={styles.streak} accessibilityLabel={streak + " day streak"}>🔥 {streak}</Text>
        ) : (
          <Pressable onPress={() => { stopSpeaking(); setLibraryId(null); setView("today"); }} style={styles.headerBack} accessibilityRole="button" accessibilityLabel="Back to today">
            <Text style={styles.headerBackText}>‹ Today</Text>
          </Pressable>
        )}
        {view === "library" ? <Text style={styles.headerTitle}>Library</Text> : <View style={styles.headerSpacer} />}
        {view === "today" ? (
          <Pressable onPress={() => { stopSpeaking(); setLibraryId(null); setView("library"); }} hitSlop={16} accessibilityRole="button" accessibilityLabel="Open sentence library">
            <Text style={styles.menu}>⋯</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => { setImportMessage(""); setShowAdd(true); }} hitSlop={16} accessibilityRole="button" accessibilityLabel="Import sentences">
            <Text style={styles.importMenu}>＋</Text>
          </Pressable>
        )}
      </View>

      {view === "library" && !selectedSentence ? (
        <ScrollView contentContainerStyle={styles.libraryWrap}>
          <View style={styles.libraryIntro}>
            <Text style={styles.libraryTitle}>Your sentences</Text>
            <Text style={styles.librarySubtitle}>{learnedCount} learned · {sentences.length - learnedCount} to learn</Text>
          </View>
          <Pressable style={styles.importButton} onPress={() => { setImportMessage(""); setShowAdd(true); }} accessibilityRole="button">
            <Text style={styles.importButtonText}>＋  Import sentences</Text>
          </Pressable>
          {sentences.map((item) => {
            const learned = Boolean(state.learned?.[item.id]);
            return (
              <Pressable key={item.id} style={styles.libraryItem} onPress={() => { setLibraryId(item.id); setSpeechMessage(""); }} accessibilityRole="button">
                <Text style={styles.libraryDe}>{item.de}</Text>
                {item.en ? <Text style={styles.libraryEn}>{item.en}</Text> : null}
                <Text style={[styles.libraryStatus, learned ? styles.learnedStatus : styles.unlearnedStatus]}>
                  {learned ? "✓ Learned" : "Not learned yet"}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : sentence ? (
        <View style={styles.practiceScreen}>
          {view === "library" ? (
            <Pressable onPress={() => { stopSpeaking(); setLibraryId(null); }} style={styles.backButton} accessibilityRole="button">
              <Text style={styles.backText}>‹  Library</Text>
            </Pressable>
          ) : null}
          <ScrollView contentContainerStyle={styles.sentenceContent}>
            <Text style={styles.de}>{sentence.de}</Text>
            {sentence.en ? <Text style={styles.en}>{sentence.en}</Text> : null}
            {view === "library" ? (
              <Text style={[styles.learnedTag, sentenceIsLearned ? styles.learnedStatus : styles.unlearnedStatus]}>
                {sentenceIsLearned ? "✓ Learned · available to rehearse anytime" : "Not learned yet · practise whenever you like"}
              </Text>
            ) : null}
            {speechMessage ? <Text style={styles.speechMessage}>{speechMessage}</Text> : null}
            {voiceStatus ? <Text style={styles.voiceStatus}>{voiceStatus}</Text> : null}
          </ScrollView>
          <View style={styles.bottomActions}>
            <Pressable style={styles.listenButton} onPress={() => speaking ? stopSpeaking() : speak(sentence.de)}>
              <Text style={styles.listenButtonText}>{speaking ? "■  Stop" : "▶  Hear sentence"}</Text>
            </Pressable>
            {view === "today" && !completedToday ? (
              <Pressable style={styles.learnButton} onPress={completeToday}>
                <Text style={styles.learnButtonText}>I’ve learned this sentence</Text>
              </Pressable>
            ) : null}
            {view === "library" && !sentenceIsLearned ? (
              <Pressable style={styles.learnButton} onPress={markSelectedLearned}>
                <Text style={styles.learnButtonText}>I’ve learned this sentence</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.emptyToday}>
          <Text style={styles.emptyTitle}>That’s all for today</Text>
          <Text style={styles.emptyText}>Come back tomorrow for your next sentence. You can revisit learned sentences in your library.</Text>
        </View>
      )}

      <Modal visible={showAdd} animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={styles.root}>
          <View style={styles.header}>
            <Text style={styles.modalTitle}>Import sentences</Text>
            <Pressable onPress={() => setShowAdd(false)} hitSlop={16} accessibilityRole="button" accessibilityLabel="Close">
              <Text style={styles.menu}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalHint}>Paste a whole batch at once, one sentence per line: German, then a tab, then English (optional). A German-only line is fine.</Text>
            <TextInput
              style={styles.input}
              multiline
              value={importText}
              onChangeText={setImportText}
              placeholder="German sentence [TAB] English translation (optional)\nOne sentence per line"
              placeholderTextColor={C.dim}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.importExample}>Example: Guten Morgen.  [TAB]  Good morning.</Text>
            {importMessage ? <Text style={styles.speechMessage}>{importMessage}</Text> : null}
            <Pressable style={styles.learnButton} onPress={runImport}>
              <Text style={styles.learnButtonText}>Add to library</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingTop: (StatusBar.currentHeight || 24) + 8 },
  header: { height: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 22 },
  streak: { color: C.accent, fontSize: 17, fontWeight: "700", minWidth: 50 },
  headerBack: { minWidth: 70, paddingVertical: 8 },
  headerBackText: { color: C.dim, fontSize: 15, fontWeight: "600" },
  headerTitle: { color: C.text, fontSize: 17, fontWeight: "700" },
  headerSpacer: { flex: 1 },
  menu: { color: C.dim, fontSize: 26, paddingHorizontal: 4 },
  importMenu: { color: C.text, fontSize: 28, paddingHorizontal: 4 },
  practiceScreen: { flex: 1, paddingHorizontal: 25, paddingTop: 24, paddingBottom: 18 },
  backButton: { alignSelf: "flex-start", marginBottom: 26, paddingVertical: 4 },
  backText: { color: C.dim, fontSize: 15, fontWeight: "600" },
  sentenceContent: { flexGrow: 1, justifyContent: "center", paddingBottom: 24 },
  de: { color: C.text, fontSize: 34, lineHeight: 45, fontWeight: "700" },
  en: { color: C.dim, fontSize: 18, lineHeight: 27, marginTop: 20 },
  learnedTag: { color: C.good, fontSize: 14, marginTop: 24 },
  speechMessage: { color: C.accent, fontSize: 14, lineHeight: 20, marginTop: 16 },
  voiceStatus: { color: C.dim, fontSize: 14, lineHeight: 20, textAlign: "center", marginTop: 12 },
  bottomActions: { paddingBottom: 18 },
  listenButton: { backgroundColor: C.text, borderRadius: 18, minHeight: 62, alignItems: "center", justifyContent: "center" },
  listenButtonText: { color: C.bg, fontSize: 19, fontWeight: "700" },
  learnButton: { marginTop: 12, borderRadius: 16, minHeight: 56, paddingHorizontal: 18, backgroundColor: C.panel, alignItems: "center", justifyContent: "center" },
  learnButtonText: { color: C.text, fontSize: 16, fontWeight: "600" },
  libraryWrap: { paddingHorizontal: 22, paddingBottom: 44 },
  libraryIntro: { marginTop: 18, marginBottom: 8 },
  libraryTitle: { color: C.text, fontSize: 27, fontWeight: "700" },
  librarySubtitle: { color: C.dim, fontSize: 15, lineHeight: 22, marginTop: 8 },
  importButton: { backgroundColor: C.panel, borderRadius: 14, minHeight: 50, alignItems: "center", justifyContent: "center", marginTop: 14, marginBottom: 8 },
  importButtonText: { color: C.text, fontSize: 16, fontWeight: "600" },
  libraryItem: { backgroundColor: C.panel, borderRadius: 16, padding: 17, marginTop: 12 },
  libraryDe: { color: C.text, fontSize: 19, lineHeight: 27, fontWeight: "600" },
  libraryEn: { color: C.dim, fontSize: 15, lineHeight: 22, marginTop: 8 },
  libraryStatus: { fontSize: 13, fontWeight: "600", marginTop: 10 },
  learnedStatus: { color: C.good },
  unlearnedStatus: { color: C.dim },
  emptyToday: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyTitle: { color: C.text, fontSize: 23, lineHeight: 31, fontWeight: "700", textAlign: "center" },
  emptyText: { color: C.dim, fontSize: 16, lineHeight: 24, textAlign: "center", marginTop: 12 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: "600" },
  modalContent: { padding: 20, paddingBottom: 48 },
  modalHint: { color: C.dim, fontSize: 15, lineHeight: 23 },
  input: { backgroundColor: C.panel, color: C.text, borderRadius: 14, padding: 14, minHeight: 200, marginTop: 16, fontSize: 15, textAlignVertical: "top" },
  importExample: { color: C.dim, fontSize: 14, lineHeight: 21, marginTop: 12 },
});
