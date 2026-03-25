// services/nodeService.js
// CapStash — Wanderer Node Manager
// JS wrapper around the CapStashNode native module (NodeModule.java)
//
// Provides start/stop/status for the local CapStashd foreground service.

import { NativeModules } from 'react-native';

const { CapStashNode } = NativeModules;

if (!CapStashNode) {
  console.error('[nodeService] CapStashNode native module not found — rebuild required');
}

/**
 * Start the CapStashd foreground service.
 * Returns true on success.
 */
export async function startNode() {
  if (!CapStashNode) return false;
  try {
    const result = await CapStashNode.startNode();
    console.log('[nodeService] startNode result:', result);
    return true;
  } catch (e) {
    console.error('[nodeService] startNode failed:', e.message);
    return false;
  }
}

/**
 * Stop the CapStashd foreground service.
 * Returns true on success.
 */
export async function stopNode() {
  if (!CapStashNode) return false;
  try {
    await CapStashNode.stopNode();
    console.log('[nodeService] stopNode called');
    return true;
  } catch (e) {
    console.error('[nodeService] stopNode failed:', e.message);
    return false;
  }
}

/**
 * Check if CapStashd binary has been extracted to device storage.
 * Returns true if ready to run.
 */
export async function isNodeExtracted() {
  if (!CapStashNode) return false;
  try {
    return await CapStashNode.isNodeExtracted();
  } catch (e) {
    return false;
  }
}

/**
 * Get the node data directory path on device.
 * e.g. /data/user/0/com.capstashwallet/files/capstash
 */
export async function getNodeDataDir() {
  if (!CapStashNode) return null;
  try {
    return await CapStashNode.getDataDir();
  } catch (e) {
    return null;
  }
}
