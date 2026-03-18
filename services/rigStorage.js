// services/rigStorage.js
// CapStash — Rig Monitor persistence and polling
//
// Manages saved rigs: add, remove, load, poll stats
// Each rig has: id, name, localIp, tailscaleIp, port, user, pass
// Polling tries localIp first, falls back to tailscaleIp

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@capstash_rigs';

// ── Rig shape ──────────────────────────────────────────────────────────────
// {
//   id:          string   (uuid-ish)
//   name:        string
//   localIp:     string   (optional)
//   tailscaleIp: string   (optional)
//   port:        string   (default '8332')
//   user:        string
//   pass:        string
// }

// ── Persistence ────────────────────────────────────────────────────────────

export async function loadRigs() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export async function saveRigs(rigs) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(rigs));
  } catch (e) {
    console.warn('[rigStorage] save failed:', e.message);
  }
}

export async function addRig(rig) {
  const rigs = await loadRigs();
  const newRig = {
    ...rig,
    id: `rig_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  };
  rigs.push(newRig);
  await saveRigs(rigs);
  return newRig;
}

export async function updateRig(id, updates) {
  const rigs = await loadRigs();
  const idx  = rigs.findIndex(r => r.id === id);
  if (idx < 0) return;
  rigs[idx] = { ...rigs[idx], ...updates };
  await saveRigs(rigs);
}

export async function deleteRig(id) {
  const rigs = await loadRigs();
  await saveRigs(rigs.filter(r => r.id !== id));
}

// ── RPC polling ────────────────────────────────────────────────────────────

// Try to fetch getmininginfo from a rig
// Tries localIp first if present, then tailscaleIp
// Returns { online, hashrate, blocksFound, difficulty, chain } or { online: false }
export async function pollRig(rig) {
  const port = rig.port || '8332';
  const ips  = [rig.localIp, rig.tailscaleIp].filter(Boolean);

  for (const ip of ips) {
    try {
      const result = await fetchMiningInfo(ip, port, rig.user, rig.pass);
      if (result) {
        return {
          online:      true,
          hashrate:    result.localhashps || 0,
          blocksFound: result.blocks        || 0,
          difficulty:  result.difficulty    || 0,
          chain:       result.chain         || '',
          reachableIp: ip,
        };
      }
    } catch (_) {
      // try next IP
    }
  }
  return { online: false };
}
function base64Encode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < str.length) {
    const a = str.charCodeAt(i++);
    const b = i < str.length ? str.charCodeAt(i++) : 0;
    const c = i < str.length ? str.charCodeAt(i++) : 0;
    result += chars[a >> 2];
    result += chars[((a & 3) << 4) | (b >> 4)];
    result += i - 2 < str.length ? chars[((b & 15) << 2) | (c >> 6)] : '=';
    result += i - 1 < str.length ? chars[c & 63] : '=';
  }
  return result;
}
async function fetchMiningInfo(ip, port, user, pass) {
  const url      = `http://${ip}:${port}/`;
  const body     = JSON.stringify({
    jsonrpc: '1.0',
    id:      'rigmon',
    method:  'getmininginfo',
    params:  [],
  });
  const headers  = {
    'Content-Type':  'application/json',
    'Authorization': 'Basic ' + base64Encode(`${user}:${pass}`),
  };

  const response = await Promise.race([
    fetch(url, { method: 'POST', headers, body }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 5000)
    ),
  ]);

  if (!response.ok) return null;
  const json = await response.json();
  return json.result || null;
}