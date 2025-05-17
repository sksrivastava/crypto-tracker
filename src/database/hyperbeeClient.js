'use strict';

const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');
const path = require('path');

let hbee; // Singleton Hyperbee instance

/**
 * Initializes the Hyperbee database.
 * @param {string} storagePath - Path to store Hypercore data (e.g., './db/rpc-server').
 * @returns {Promise<Hyperbee>}
 */
async function initDB(storagePath = './db/hyperdata') {
  if (hbee) return hbee;

  // Ensure the directory exists, Hypercore might not create it.
  // This step is usually handled by ensuring ./db/hyperdata exists or is created beforehand.
  // For this example, we assume the directory will be created if it doesn't exist or Hypercore handles it.

  const hcore = new Hypercore(path.resolve(storagePath)); 
  hbee = new Hyperbee(hcore, { keyEncoding: 'utf-8', valueEncoding: 'json' });
  await hbee.ready();
  console.log('Hyperbee database initialized at:', storagePath);
  return hbee;
}

/**
 * Saves price data to Hyperbee.
 * @param {Hyperbee} db - The Hyperbee instance.
 * @param {string} pair - The currency pair (e.g., 'BTC-USDT').
 * @param {number} timestamp - The timestamp of the data.
 * @param {number} averagePrice - The average price.
 * @param {Array<string>} exchanges - The list of exchanges used for the average.
 * @returns {Promise<void>}
 */
async function savePriceData(db, { pair, timestamp, averagePrice, exchanges }) {
  if (!db) throw new Error('Hyperbee instance is not initialized. Call initDB first.');
  const key = `${pair}/${timestamp}`;
  const value = { averagePrice, exchanges };
  try {
    await db.put(key, value);
    // console.log(`Saved data for ${key}:`, value);
  } catch (error) {
    console.error(`Error saving data for ${key}:`, error);
  }
}

/**
 * Gets the latest price data for a given pair.
 * @param {Hyperbee} db - The Hyperbee instance.
 * @param {string} pair - The currency pair (e.g., 'BTC-USDT').
 * @returns {Promise<Object|null>} The latest price data or null if not found.
 */
async function getLatestPrice(db, pair) {
  if (!db) throw new Error('Hyperbee instance is not initialized.');
  const prefix = `${pair}/`;
  let latestEntry = null;

  try {
    // Iterate in reverse to find the newest entry for the pair
    for await (const entry of db.createReadStream({ gte: prefix, lte: prefix + '\xff', reverse: true, limit: 1 })) {
      latestEntry = {
        pair,
        timestamp: parseInt(entry.key.split('/')[1]),
        ...entry.value
      };
      break; 
    }
  } catch (error) {
    console.error(`Error fetching latest price for ${pair}:`, error);
    return null;
  }
  return latestEntry;
}

/**
 * Gets historical price data for a given pair within a time range.
 * @param {Hyperbee} db - The Hyperbee instance.
 * @param {string} pair - The currency pair (e.g., 'BTC-USDT').
 * @param {number} fromTimestamp - The start of the time range (inclusive).
 * @param {number} toTimestamp - The end of the time range (inclusive).
 * @returns {Promise<Array<Object>>} An array of price data objects.
 */
async function getHistoricalPrices(db, pair, fromTimestamp, toTimestamp) {
  if (!db) throw new Error('Hyperbee instance is not initialized.');
  const results = [];
  const startKey = `${pair}/${fromTimestamp}`;
  const endKey = `${pair}/${toTimestamp}`;

  try {
    for await (const entry of db.createReadStream({ gte: startKey, lte: endKey })) {
      // Double check the pair, as gte/lte on string keys can sometimes include adjacent prefixes
      if (entry.key.startsWith(`${pair}/`)) {
         results.push({
            pair,
            timestamp: parseInt(entry.key.split('/')[1]),
            ...entry.value
        });
      }
    }
  } catch (error) {
    console.error(`Error fetching historical prices for ${pair}:`, error);
  }
  return results.sort((a,b) => a.timestamp - b.timestamp); // Ensure chronological order
}

module.exports = {
  initDB,
  savePriceData,
  getLatestPrice,
  getHistoricalPrices,
  getDB: () => hbee // Allow access to the raw hbee instance if needed elsewhere
}; 