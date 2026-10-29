import { EventEmitter, requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

const native = Platform.OS === "android" ? requireOptionalNativeModule("SherpaTts") : null;
const emitter = native ? new EventEmitter(native) : null;

export const sherpaTtsAvailable = Boolean(native);
export const sherpaSpeak = (text) => native?.speak(text);
export const sherpaStop = () => native?.stop();
export const addVoiceDownloadListener = (listener) =>
  emitter?.addListener("downloadProgress", listener) || { remove() {} };
