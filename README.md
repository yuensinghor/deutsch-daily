# Deutsch Daily

An Android-first sentence practice app for learning natural German a sentence at a time.

## Current practice flow

- Today shows one new German sentence and its English translation.
- Hear the German sentence with Android text-to-speech.
- Mark it learned when you are ready. The next sentence is presented on the next calendar day.
- Open the Library from the top-right menu to see every built-in and imported sentence, check its learned status, and rehearse any sentence again.
- Progress and imported sentences are saved locally on the phone.

## German voice

Android uses Sherpa-ONNX with Piper's `de_DE-dii-high` voice. On first playback, the app downloads the model archive from the official Sherpa-ONNX GitHub release into its private app storage. The download requires internet once; later speech synthesis works offline. Playback is generated on-device, and the model is removed when app data is cleared or the app is uninstalled. The downloadable model is not bundled into the APK.

The app uses the Android system voice on iOS, web, and previews that do not include the Android native module.

## Sentence library

The built-in library contains 160 sentences across everyday conversation, work, travel, food and shopping, home and services, and appointments. Each sentence includes an English translation. Sentence entries are bundled with the app and available offline.

Import a batch from the Library with one paste. Put one sentence on each line; use a tab between German and the optional English translation. German-only lines are accepted. For example:

```text
Kannst du mir kurz helfen?	Can you help me for a moment?
Ich bin gleich wieder da.
Lass uns später telefonieren.
```

The Library combines built-in and imported sentences without labeling their source. Clearing the app's data or uninstalling it removes locally saved progress and imported sentences.

## Build an Android preview APK

```bash
npx eas-cli login
npx eas-cli build -p android --profile preview
```

Download the resulting APK on the Pixel and install it. A rebuild is required for native code or app configuration changes.
