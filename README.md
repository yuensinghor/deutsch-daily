# Deutsch Daily

A tiny Android app for learning German with 1–2 natural, spoken-style sentences a day.
Built with Expo (React Native). Offline. No account, no server.

## How it works

- Each day you get **2 new sentences** (change `NEW_PER_DAY` in `src/logic.js`) plus up to **3 recall checks** of older ones.
- New sentence: listen (normal or slow), say it aloud **10 times** (tap the counter each time), optionally use 🎤 Check to see which words the phone heard. Then "Got it ✓".
- Recall check: you see the English, say the German, tap "Show German", then "Again" or "Knew it ✓".
- Old sentences come back after 1, 3, 7, 30 and 90 days.
- Finish everything for the day and your 🔥 streak goes up. Miss a day and it restarts.
- 100 built-in sentences (30 easy, 50 medium, 20 harder), about 2 months at 2 a day.

## Set it up (once)

You need Node.js (LTS) and an Expo account (free).

```bash
# 1. Create a fresh Expo project
npx create-expo-app@latest deutsch-daily --template blank
cd deutsch-daily

# 2. Copy these files over the new project, replacing when asked:
#    App.js, app.json, eas.json, .gitignore, src/ (3 files), scripts/, new-sentences-template.txt, README.md
#    (If the template made App.tsx instead of App.js, delete App.tsx.)

# 3. Install the libraries (npx expo install picks versions that match your Expo SDK)
npx expo install expo-speech expo-speech-recognition expo-clipboard @react-native-async-storage/async-storage

# 4. Check the logic works (optional)
node scripts/test-logic.js
```

## Build the APK and install it on your Pixel

```bash
npx eas-cli login
npx eas-cli build -p android --profile preview
```

When the cloud build finishes, EAS gives you a download link or QR code. Open it on the Pixel, download the `.apk`, and install it (allow "install unknown apps" for your browser if asked).

Note: the 🎤 Check needs a real build like this. It does not work inside Expo Go.

## Push to GitHub

```bash
git init
git add .
git commit -m "Deutsch Daily"
git branch -M main
git remote add origin https://github.com/<your-user>/<repo>.git
git push -u origin main
```

## Adding sentences later

1. Ask Claude for a new batch in the format shown in `new-sentences-template.txt`.
2. In the app tap **⋯**, paste, tap **Import**. Duplicates are skipped. New lines join the end of your queue.

No rebuild or reinstall needed.

## Backup

Your progress and added sentences live only on the phone. Uninstalling or clearing app data deletes them.
Tap **⋯ → Copy backup** now and then and paste it into a note. To restore, paste it into the same box and tap **Import**.

## Files

- `App.js`: the one screen
- `src/logic.js`: scheduling, streak, import, backup (tested by `scripts/test-logic.js`)
- `src/sentences.js`: the 100 built-in sentences
- `src/storage.js`: saves state on the phone
- `app.json`, `eas.json`: Expo and build settings

## Known limits

- The speech check is a rough signal. Phone speech recognition often writes spoken forms differently ("gibt's" vs "gibt es"), so a red word does not always mean a pronunciation mistake.
- No reminder notifications yet (easy to add later).
- Written without a device to test on, so if the first build shows an error, send it to Claude.
