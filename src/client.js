'use strict';

const RPC = require('@hyperswarm/rpc');
const DHT = require('hyperdht');
const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');
const crypto = require('crypto');
const path = require('path');

// Configuration
const CLIENT_DHT_PORT = 50001;
const DHT_BOOTSTRAP = [{ host: '127.0.0.1', port: 30001 }]; // Must match server's DHT bootstrap
const CLIENT_META_DB_PATH = './db/rpc-client-meta';
const SERVER_PUBLIC_KEY_FILE_PATH = './db/rpc-server-meta/rpc-server-public-key'; // Path where server.js saves its public key

let dht, rpc;

async function initializeClientMetaDB() {
  const core = new Hypercore(path.resolve(CLIENT_META_DB_PATH));
  const bee = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'binary' });
  await bee.ready();
  return bee;
}

async function getOrCreateClientDhtSeed(db) {
  let seed = (await db.get('dht-seed'))?.value;
  if (!seed) {
    seed = crypto.randomBytes(32);
    await db.put('dht-seed', seed);
    console.log('Client: Generated and stored new DHT seed.');
  }
  return seed;
}

async function getServerPublicKey() {
  try {
    // The server stores its public key in its own Hyperbee.
    // For the client to discover it without prior knowledge and without a shared discovery key for the meta DB,
    // this example will read it from where the server explicitly stores it after startup.
    // This is a simplification for this example. A more robust solution might involve a known discovery key for the server's metaDB.
    const serverMetaCore = new Hypercore(path.resolve(path.dirname(SERVER_PUBLIC_KEY_FILE_PATH)));
    const serverMetaBee = new Hyperbee(serverMetaCore, { keyEncoding: 'utf-8', valueEncoding: 'utf-8' }); // server stores it as utf-8 string
    await serverMetaBee.ready();
    const pkFromDb = (await serverMetaBee.get('rpc-server-public-key'))?.value;
    await serverMetaBee.close();
    if (pkFromDb) return Buffer.from(pkFromDb, 'hex');
    
    console.warn('Could not read server public key from its meta DB. Trying direct file read as fallback (less ideal).');
    // Fallback for simpler scenarios if the above is too complex or server isn't using a separate meta hyperbee for PK
    // However, the server.js IS writing to rpc-server-public-key in its meta db.
    // The path SERVER_PUBLIC_KEY_FILE_PATH refers to a key *within* a hyperbee, not a direct file.
    // Let's assume server public key is passed via arguments or needs to be known.
    // For this example, we will rely on serverPublicKeyArg or a hardcoded one from server output.
    return null;

  } catch (error) {
    console.error('Client: Error trying to read server public key from its meta DB:', error.message);
    console.log('Client: Please provide the server public key as a command line argument or ensure the server has run and stored it.');
    return null;
  }
}

async function main() {
  let serverPubKeyHex = process.argv[2];

  if (!serverPubKeyHex) {
    console.log('Client: Server public key not provided as argument. Attempting to retrieve from server metadata...');
    const pkBuffer = await getServerPublicKey();
    if (pkBuffer) {
      serverPubKeyHex = pkBuffer.toString('hex');
      console.log('Client: Retrieved server public key:', serverPubKeyHex);
    } else {
      console.error('Client: Server public key is required. Please run the server first to generate its public key, then provide it as an argument to the client.');
      console.error('Usage: node src/client.js <server_public_key_hex>');
      console.error('The server will log its public key on startup.');
      return;
    }
  }

  const serverPubKey = Buffer.from(serverPubKeyHex, 'hex');

  // 1. Initialize Client Metadata DB (for its own DHT seed)
  const clientMetaDB = await initializeClientMetaDB();

  // 2. Setup DHT for client
  const dhtSeed = await getOrCreateClientDhtSeed(clientMetaDB);
  dht = new DHT({
    port: CLIENT_DHT_PORT,
    keyPair: DHT.keyPair(dhtSeed),
    bootstrap: DHT_BOOTSTRAP,
  });
  await dht.ready();
  console.log('Client: DHT node started.');

  // 3. Setup RPC client
  rpc = new RPC({ dht });

  // --- Example 1: Get Latest Prices ---
  console.log('\nClient: Requesting latest prices for BTC-USDT and ETH-USDT...');
  const latestPricesPayload = { pairs: ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'] }; // Added SOL for more variety
  const latestPricesReqRaw = Buffer.from(JSON.stringify(latestPricesPayload), 'utf-8');
  
  try {
    const latestPricesRespRaw = await rpc.request(serverPubKey, 'getLatestPrices', latestPricesReqRaw, { timeout: 20000 });
    const latestPricesResp = JSON.parse(latestPricesRespRaw.toString('utf-8'));
    
    if (latestPricesResp.error) {
        console.error('Client: Error from server (getLatestPrices):', latestPricesResp.error);
    } else {
        console.log('Client: Latest Prices Response:', latestPricesResp);
    }
  } catch (e) {
    console.error('Client: Error requesting latest prices:', e.message);
  }

  // --- Example 2: Get Historical Prices ---
  console.log('\nClient: Requesting historical prices for BTC-USDT...');
  const toTimestamp = Date.now();
  const fromTimestamp = toTimestamp - (60 * 60 * 1000); // Last 1 hour

  const historicalPricesPayload = {
    pairs: ['BTC-USDT'],
    from: fromTimestamp,
    to: toTimestamp,
  };
  const historicalPricesReqRaw = Buffer.from(JSON.stringify(historicalPricesPayload), 'utf-8');

  try {
    const historicalPricesRespRaw = await rpc.request(serverPubKey, 'getHistoricalPrices', historicalPricesReqRaw, { timeout: 20000 });
    const historicalPricesResp = JSON.parse(historicalPricesRespRaw.toString('utf-8'));

    if (historicalPricesResp.error) {
        console.error('Client: Error from server (getHistoricalPrices):', historicalPricesResp.error);
    } else {
        console.log('Client: Historical Prices Response (BTC-USDT for last hour):', historicalPricesResp);
    }
  } catch (e) {
    console.error('Client: Error requesting historical prices:', e.message);
  }

  // --- Example 3: Trigger On-Demand Data Collection ---
  console.log('\nClient: Requesting on-demand data collection trigger...');
  // No payload is needed for this request, send an empty object or null if required by RPC library for empty body
  const triggerPayloadRaw = Buffer.from(JSON.stringify({}), 'utf-8'); 

  try {
    const triggerRespRaw = await rpc.request(serverPubKey, 'triggerDataCollection', triggerPayloadRaw, { timeout: 30000 }); // Increased timeout as task might take time
    const triggerResp = JSON.parse(triggerRespRaw.toString('utf-8'));
    
    if (triggerResp.success) {
      console.log('Client: On-demand data collection triggered successfully:', triggerResp.message);
    } else {
      console.error('Client: Error triggering data collection:', triggerResp.message);
    }
  } catch (e) {
    console.error('Client: Error requesting on-demand data collection trigger:', e.message);
  }
  
  // Clean up
  console.log('\nClient: Operations complete. Closing connections.');
  await rpc.destroy().catch(e => console.error('Client: Error destroying RPC:', e));
  await dht.destroy().catch(e => console.error('Client: Error destroying DHT:', e));
  await clientMetaDB.close().catch(e => console.error('Client: Error closing client meta DB:', e));
  console.log('Client: Shutdown complete.');
}

main().catch(error => {
  console.error('Client: Fatal error:', error);
  if (dht) dht.destroy().catch(e => console.error('Client: Error destroying DHT during fatal error handling:', e));
  process.exit(1);
}); 