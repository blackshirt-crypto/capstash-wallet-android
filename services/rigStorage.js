// services/rigStorage.js
// N.U.K.A — Persistent rig configuration storage
// Uses AsyncStorage to save rig configs between sessions
// RPC credentials stored in EncryptedStorage for security
import AsyncStorage from '@react-native-async-storage/async-storage';
import EncryptedStorage from 'react-native-encrypted-storage';

const RIGS_KEY = 'nuka_rigs_v1';
const CREDS_PREFIX = 'nuka_creds_';

// Save all rig configs (without credentials)
export async function saveRigs(rigs) {
  const safe = rigs.map(r => ({
    id:      r.id,
    address: r.address,
    label:   r.label,
    alias:   r.alias,
    ip:      r.ip,
    badges:  r.badges,
    threads: r.threads,
  }));
  await AsyncStorage.setItem(RIGS_KEY, JSON.stringify(safe));
}

// Load rig configs
export async function loadRigs() {
  const raw = await AsyncStorage.getItem(RIGS_KEY);
  if (!raw) return [];
  return JSON.parse(raw);
}

// Save credentials separately in encrypted storage
export async function saveCredentials(rigId, user, pass) {
  await EncryptedStorage.setItem(
    CREDS_PREFIX + rigId,
    JSON.stringify({ user, pass })
  );
}

// Load credentials for a rig
export async function loadCredentials(rigId) {
  const raw = await EncryptedStorage.getItem(CREDS_PREFIX + rigId);
  if (!raw) return null;
  return JSON.parse(raw);
}

// Delete a rig and its credentials
export async function deleteRig(rigId, rigs) {
  const updated = rigs.filter(r => r.id !== rigId);
  await saveRigs(updated);
  await EncryptedStorage.removeItem(CREDS_PREFIX + rigId);
  return updated;
}

// Generate unique rig ID
export function generateRigId() {
  return 'rig_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

export default {
  saveRigs,
  loadRigs,
  saveCredentials,
  loadCredentials,
  deleteRig,
  generateRigId,
};