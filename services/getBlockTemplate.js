// services/getBlockTemplate.js
// Template fetch + block submit for CapStash mining engine

/**
 * Make a direct RPC call with rig-specific credentials
 */
async function rigRpc(ip, user, pass, method, params = []) {
  const url = `http://${ip}`;
  const body = JSON.stringify({
    jsonrpc: '1.0',
    id: method,
    method,
    params,
  });
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'Authorization': 'Basic ' + btoa(`${user}:${pass}`),
    },
    body,
  });
  const json = await response.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/**
 * Fetch a block template from the Qt node
 * @param {string} ip - host:port
 * @param {string} user - RPC username
 * @param {string} pass - RPC password
 */
export async function getBlockTemplate(ip, user, pass) {
  try {
    const template = await rigRpc(ip, user, pass, 'getblocktemplate', [{ rules: ['segwit'] }]);
    return template;
  } catch (error) {
    console.error('[getBlockTemplate] Failed to fetch template:', error.message);
    throw error;
  }
}

/**
 * Submit a solved block to the network
 * @param {string} ip - host:port
 * @param {string} user - RPC username
 * @param {string} pass - RPC password
 * @param {string} blockHex - Fully serialized block as hex string
 */
export async function submitBlock(ip, user, pass, blockHex) {
  try {
    const result = await rigRpc(ip, user, pass, 'submitblock', [blockHex]);
    if (result === null) {
      console.log('[submitBlock] ✅ BLOCK ACCEPTED!');
    } else {
      console.warn('[submitBlock] ❌ Block rejected:', result);
    }
    return result;
  } catch (error) {
    console.error('[submitBlock] Failed to submit block:', error.message);
    throw error;
  }
}