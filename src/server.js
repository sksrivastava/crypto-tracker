'use strict';

const RPC = require('@hyperswarm/rpc');
const DHT = require('hyperdht');
const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');
const crypto = require('crypto');
const path = require('path');

const dbClient = require('./database/hyperbeeClient');
const coingeckoService = require('./services/coingecko');
const { setupRpcHandlers } = require('./services/rpcService');
const Scheduler = require('./components/scheduler');

// Configuration
const DHT_PORT = 40001;
const DHT_BOOTSTRAP = [{ host: '127.0.0.1', port: 30001 }];
const SERVER_META_DB_PATH = './db/rpc-server-meta'; // For DHT/RPC seeds
const CRYPTO_DATA_DB_PATH = './db/crypto-prices';   // For actual cryptocurrency data
const FETCH_INTERVAL_MS = 30 * 1000; // 30 seconds

let dht, rpc, rpcServer, cryptoDB, scheduler;

async function initializeServerMetaDB() {
  const core = new Hypercore(path.resolve(SERVER_META_DB_PATH));
  const bee = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'binary' });
  await bee.ready();
  return bee;
}

async function getOrCreateSeed(db, seedName) {
  let seed = (await db.get(seedName))?.value;
  if (!seed) {
    seed = crypto.randomBytes(32);
    await db.put(seedName, seed);
    console.log(`Generated and stored new seed for ${seedName}`);
  }
  return seed;
}

async function main() {
  // 1. Initialize server metadata DB (for DHT/RPC seeds)
  const serverMetaDB = await initializeServerMetaDB();

  // 2. Initialize Crypto Data DB
  cryptoDB = await dbClient.initDB(CRYPTO_DATA_DB_PATH);
  console.log('Cryptocurrency data Hyperbee initialized.');

  // 3. Setup DHT
  const dhtSeed = await getOrCreateSeed(serverMetaDB, 'dht-seed');
  dht = new DHT({
    port: DHT_PORT,
    keyPair: DHT.keyPair(dhtSeed),
    bootstrap: DHT_BOOTSTRAP,
  });
  await dht.ready();
  console.log('DHT node started.');

  // 4. Setup RPC Server
  const rpcSeed = await getOrCreateSeed(serverMetaDB, 'rpc-seed');
  rpc = new RPC({ seed: rpcSeed, dht });
  rpcServer = rpc.createServer();
  await rpcServer.listen();
  const serverPublicKey = rpcServer.publicKey.toString('hex');
  console.log('RPC server started listening on public key:', serverPublicKey);
  // Store server public key for client or display purposes
  await serverMetaDB.put('rpc-server-public-key', serverPublicKey);

  // Define Data Collection Task (must be defined before Scheduler uses it)
  const dataCollectionTask = async () => {
    console.log('Running data collection task...');
    try {
      const cryptoData = await coingeckoService.fetchTopCryptoData();
      if (cryptoData && cryptoData.length > 0) {
        for (const dataPoint of cryptoData) {
          await dbClient.savePriceData(cryptoDB, dataPoint);
        }
        console.log(`Collected and saved data for ${cryptoData.length} crypto pairs.`);
      } else {
        console.log('No new crypto data fetched.');
      }
    } catch (error) {
      console.error('Error during data collection task:', error);
    }
  };

  // Initialize Scheduler (must be done before it's passed to RPC handlers)
  scheduler = new Scheduler(dataCollectionTask, FETCH_INTERVAL_MS);

  // 5. Setup RPC Handlers (now `scheduler` is a valid instance)
  setupRpcHandlers(rpcServer, cryptoDB, scheduler);

  // 6. Start the Scheduled Data Collection
  scheduler.start(); // Starts immediately and then intervals

  console.log(`Crypto data collection scheduled to run every ${FETCH_INTERVAL_MS / 1000} seconds.`);
  console.log('Server setup complete. Press Ctrl+C to exit.');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    if (scheduler) scheduler.stop();
    if (rpcServer) await rpcServer.close().catch(e => console.error('Error closing RPC server:', e));
    if (rpc) await rpc.destroy().catch(e => console.error('Error destroying RPC:', e));
    if (dht) await dht.destroy().catch(e => console.error('Error destroying DHT:', e));
    if (cryptoDB) await cryptoDB.close().catch(e => console.error('Error closing crypto DB:', e));
    if (serverMetaDB) await serverMetaDB.close().catch(e => console.error('Error closing server meta DB:', e));
    console.log('Server shut down gracefully.');
    process.exit(0);
  });
}

main().catch(error => {
  console.error('Fatal error during server startup:', error);
  process.exit(1);
}); 