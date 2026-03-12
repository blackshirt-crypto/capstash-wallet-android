// services/getBlockTemplate.js
// Block template fetch + block submit for CapStash mining engine

/**
 * Make an RPC call using nodeConfig { ip, port, rpcuser, rpcpassword }
 */
async function rigRpc(nodeConfig, method, params = []) {
  const { ip, port, rpcuser, rpcpassword } = nodeConfig;
  const url = `http://${ip}:${port}`;

  const body = JSON.stringify({
    jsonrpc: '1.0',
    id: method,
    method,
    params,
  });

  // Buffer.from instead of btoa — required for React Native
  const auth = Buffer.from(`${rpcuser}:${rpcpassword}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'Authorization': `Basic ${auth}`,
    },
    body,
  });

  const json = await response.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/**
 * Fetch a block template from the node
 * @param {object} nodeConfig - { ip, port, rpcuser, rpcpassword }
 */
export async function getBlockTemplate(nodeConfig) {
  try {
    const template = await rigRpc(
      nodeConfig,
      'getblocktemplate',
      [{ rules: ['segwit'] }],
    );
    return template;
  } catch (error) {
    console.error('[getBlockTemplate] Failed:', error.message);
    throw error;
  }
}

/**
 * Submit a solved block to the network
 * @param {object} nodeConfig - { ip, port, rpcuser, rpcpassword }
 * @param {string} blockHex - Fully serialized block as hex string
 */
export async function submitBlock(nodeConfig, blockHex) {
  try {
    const result = await rigRpc(nodeConfig, 'submitblock', [blockHex]);
    if (result === null) {
      console.log('[submitBlock] ✅ BLOCK ACCEPTED');
    } else {
      console.warn('[submitBlock] ❌ Block rejected:', result);
    }
    return result;
  } catch (error) {
    console.error('[submitBlock] Failed:', error.message);
    throw error;
  }
}