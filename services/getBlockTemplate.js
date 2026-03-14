// services/getBlockTemplate.js
import { Buffer } from 'buffer';

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
    console.log('[getBlockTemplate] RAW:', JSON.stringify(template, null, 2));
    return template;
  } catch (error) {
    console.error('[getBlockTemplate] Failed:', error.message);
    throw error;
  }
}

/**
 * Submit a solved block to the node
 * @param {object} nodeConfig - { ip, port, rpcuser, rpcpassword }
 * @param {string} blockHex - fully serialized block as hex string
 */
export async function submitBlock(nodeConfig, blockHex) {
  try {
    const result = await rigRpc(nodeConfig, 'submitblock', [blockHex]);
    return result;
  } catch (error) {
    console.error('[submitBlock] Failed:', error.message);
    throw error;
  }
}