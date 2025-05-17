'use strict';

const Hypercore = require('hypercore');
const Hyperbee = require('hyperbee');
const path = require('path');
const fs = require('fs').promises; // For writing to a file

const CRYPTO_DATA_DB_PATH = './db/crypto-prices';
const OUTPUT_JSON_FILE = './crypto_data_export.json';

async function extractData() {
  let hbee;
  const allData = [];

  try {
    console.log(`Attempting to read Hyperbee from: ${path.resolve(CRYPTO_DATA_DB_PATH)}`);
    const hcore = new Hypercore(path.resolve(CRYPTO_DATA_DB_PATH));
    hbee = new Hyperbee(hcore, { keyEncoding: 'utf-8', valueEncoding: 'json' });
    await hbee.ready();
    console.log('Hyperbee database opened successfully.');

    for await (const entry of hbee.createReadStream()) {
      // Assuming entry.key is 'PAIR/TIMESTAMP'
      const [pair, timestampStr] = entry.key.split('/');
      allData.push({
        pair: pair,
        timestamp: parseInt(timestampStr), // Convert timestamp to number
        averagePrice: entry.value.averagePrice,
        exchanges: entry.value.exchanges // Keep raw array for JSON
      });
    }
    console.log(`Extracted ${allData.length} entries.`);

    // --- Output to JSON file ---
    await fs.writeFile(OUTPUT_JSON_FILE, JSON.stringify(allData, null, 2));
    console.log(`Data exported to ${OUTPUT_JSON_FILE}`);

  } catch (error) {
    console.error('Error extracting data from Hyperbee:', error);
  } finally {
    if (hbee) {
      await hbee.close();
      console.log('Hyperbee closed.');
    }
  }
}

extractData(); 