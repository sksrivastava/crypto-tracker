'use strict';

const dbClient = require('../database/hyperbeeClient');

/**
 * Sets up RPC handlers on the given RPC server instance.
 * @param {RPCServer} rpcServer - The Hyperswarm RPC server instance.
 * @param {Hyperbee} hbee - The initialized Hyperbee instance.
 * @param {Scheduler} scheduler - The scheduler instance.
 */
function setupRpcHandlers(rpcServer, hbee, scheduler) {
  if (!hbee) {
    throw new Error('Hyperbee instance must be provided to setupRpcHandlers.');
  }
  if (!scheduler) {
    throw new Error('Scheduler instance must be provided to setupRpcHandlers.');
  }

  rpcServer.respond('getLatestPrices', async (reqRaw) => {
    try {
      const { pairs } = JSON.parse(reqRaw.toString('utf-8'));
      if (!Array.isArray(pairs)) {
        throw new Error('Invalid request: pairs must be an array.');
      }

      const results = [];
      for (const pair of pairs) {
        const latestPriceData = await dbClient.getLatestPrice(hbee, pair);
        results.push(latestPriceData); // Will be null if not found, handled by client
      }
      return Buffer.from(JSON.stringify(results), 'utf-8');
    } catch (error) {
      console.error('[RPC getLatestPrices] Error:', error.message);
      // Return an error object in the response structure for the client to handle
      return Buffer.from(JSON.stringify({ error: error.message || 'Failed to get latest prices.' }), 'utf-8');
    }
  });

  rpcServer.respond('getHistoricalPrices', async (reqRaw) => {
    try {
      const { pairs, from, to } = JSON.parse(reqRaw.toString('utf-8'));
      if (!Array.isArray(pairs) || typeof from !== 'number' || typeof to !== 'number') {
        throw new Error('Invalid request: pairs must be an array, from and to must be numbers.');
      }

      const results = {};
      for (const pair of pairs) {
        const historicalData = await dbClient.getHistoricalPrices(hbee, pair, from, to);
        results[pair] = historicalData;
      }
      return Buffer.from(JSON.stringify(results), 'utf-8');
    } catch (error) {
      console.error('[RPC getHistoricalPrices] Error:', error.message);
      return Buffer.from(JSON.stringify({ error: error.message || 'Failed to get historical prices.' }), 'utf-8');
    }
  });

  // New RPC method to trigger on-demand data collection
  rpcServer.respond('triggerDataCollection', async (reqRaw) => {
    console.log('[RPC triggerDataCollection] Received request.');
    try {
      // No payload expected for this request, but good practice to handle it if any
      // const requestPayload = JSON.parse(reqRaw.toString('utf-8')); 

      await scheduler.runOnDemand();
      const response = { success: true, message: 'Data collection task triggered successfully.' };
      return Buffer.from(JSON.stringify(response), 'utf-8');
    } catch (error) {
      console.error('[RPC triggerDataCollection] Error:', error.message);
      const errorResponse = { success: false, message: error.message || 'Failed to trigger data collection.' };
      return Buffer.from(JSON.stringify(errorResponse), 'utf-8');
    }
  });

  console.log('RPC handlers (getLatestPrices, getHistoricalPrices, triggerDataCollection) are set up.');
}

module.exports = {
  setupRpcHandlers,
}; 