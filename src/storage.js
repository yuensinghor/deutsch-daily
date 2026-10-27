import AsyncStorage from "@react-native-async-storage/async-storage";
import { emptyState } from "./logic";

const KEY = "deutsch-daily.state.v1";

export async function loadState() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return emptyState();
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch (e) {
    return emptyState();
  }
}

export async function saveState(state) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {}
}
