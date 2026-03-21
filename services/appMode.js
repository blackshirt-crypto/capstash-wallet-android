// services/appMode.js
// Wanderer / Drifter mode selector — single source of truth

import AsyncStorage from '@react-native-async-storage/async-storage';

export const MODE_KEY      = '@capstash_app_mode';
export const MODE_DRIFTER  = 'drifter';
export const MODE_WANDERER = 'wanderer';

// Wanderer node runs locally on-device
export const WANDERER_NODE_CONFIG = {
  host: '127.0.0.1',
  port: 8332,
  user: 'capstash',
  pass: 'localnode',
  wandererMode: true,
};

export async function getAppMode() {
  try {
    const mode = await AsyncStorage.getItem(MODE_KEY);
    return mode || null;
  } catch (_) {
    return MODE_DRIFTER;
  }
}

export async function setAppMode(mode) {
  await AsyncStorage.setItem(MODE_KEY, mode);
}

export async function clearAppMode() {
  await AsyncStorage.removeItem(MODE_KEY);
}

export async function loadAppMode() {
  return getAppMode();
}

export function isWanderer(mode) {
  return mode === MODE_WANDERER;
}