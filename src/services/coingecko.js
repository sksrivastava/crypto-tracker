'use strict';

const axios = require('axios');

const API_BASE_URL = 'https://api.coingecko.com/api/v3';

/**
 * Fetches the top N cryptocurrencies by market capitalization.
 * @param {number} n - The number of top cryptocurrencies to fetch.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of coin objects.
 * Each object contains at least 'id' and 'symbol'.
 */
async function getTopCoins(n = 5) {
  try {
    const response = await axios.get(`${API_BASE_URL}/coins/markets`, {
      params: {
        vs_currency: 'usd', // Used for sorting by market cap and getting general price info
        order: 'market_cap_desc',
        per_page: n,
        page: 1,
        sparkline: false,
        price_change_percentage: '1h,24h,7d', // Example, can be adjusted
      },
    });
    // We primarily need the coin 'id' for further API calls
    return response.data.map(coin => ({ id: coin.id, symbol: coin.symbol.toUpperCase() }));
  } catch (error) {
    console.error('Error fetching top coins from CoinGecko:', error.message);
    if (error.response) {
      console.error('CoinGecko API Error:', error.response.status, error.response.data);
    }
    return []; // Return empty array on error to prevent downstream failures
  }
}

/**
 * Fetches ticker data for a given coin ID and calculates the average price against USDT
 * from the top N exchanges.
 * @param {string} coinId - The CoinGecko ID of the cryptocurrency (e.g., 'bitcoin').
 * @param {string} targetCurrency - The target currency to get the price against (e.g., 'USDT').
 * @param {number} numExchanges - The number of top exchanges to consider for the average.
 * @returns {Promise<Object|null>} A promise resolving to an object with { averagePrice, exchanges } or null if an error occurs.
 */
async function getAveragePrice(coinId, targetCurrency = 'USDT', numExchanges = 3) {
  try {
    const response = await axios.get(`${API_BASE_URL}/coins/${coinId}/tickers`);
    const tickers = response.data.tickers;

    // Filter for tickers that trade against the target currency (e.g., USDT)
    // And have a trust score (higher is better, sort by it)
    // Coingecko API returns target as the coin symbol, e.g. 'USDT'
    const usdtTickers = tickers
      .filter(ticker => ticker.target === targetCurrency.toUpperCase() && ticker.trust_score === 'green') // Prioritize 'green' trust score
      .sort((a, b) => b.converted_volume.usd - a.converted_volume.usd); // Sort by volume in USD as a proxy for "top"

    if (usdtTickers.length === 0) {
      // Fallback if no green trust score tickers, try any USDT ticker sorted by volume
      const allUsdtTickers = tickers
        .filter(ticker => ticker.target === targetCurrency.toUpperCase())
        .sort((a, b) => b.converted_volume.usd - a.converted_volume.usd);
      
      if (allUsdtTickers.length === 0) {
        console.warn(`No tickers found for ${coinId} against ${targetCurrency}`);
        return null;
      }
      usdtTickers.push(...allUsdtTickers); // Use these if no green ones
    }


    const topTickers = usdtTickers.slice(0, numExchanges);

    if (topTickers.length === 0) {
      console.warn(`Could not find enough exchanges for ${coinId} against ${targetCurrency}. Found ${usdtTickers.length}`);
      return null;
    }

    let totalPrice = 0;
    const exchangeNames = [];

    for (const ticker of topTickers) {
      // 'last' price is usually the most recent traded price for the pair on that exchange
      totalPrice += ticker.last; 
      exchangeNames.push(ticker.market.name);
    }

    const averagePrice = totalPrice / topTickers.length;

    return {
      averagePrice: parseFloat(averagePrice.toFixed(8)), // Ensure reasonable precision
      exchanges: exchangeNames,
    };
  } catch (error) {
    console.error(`Error fetching tickers for ${coinId} from CoinGecko:`, error.message);
     if (error.response) {
      console.error('CoinGecko API Error:', error.response.status, error.response.data);
    }
    return null;
  }
}


/**
 * Fetches and processes price data for the top N cryptocurrencies.
 * @returns {Promise<Array<Object>>} Array of objects like { pair: 'BTC-USDT', timestamp, averagePrice, exchanges }
 */
async function fetchTopCryptoData() {
  const topCoins = await getTopCoins(5);
  if (!topCoins || topCoins.length === 0) {
    console.log('No top coins fetched, skipping price data retrieval.');
    return [];
  }

  const results = [];
  const targetCurrency = 'USDT'; // Tether

  for (const coin of topCoins) {
    console.log(`Fetching price for ${coin.id} (${coin.symbol})...`);
    const priceData = await getAveragePrice(coin.id, targetCurrency, 3);

    if (priceData) {
      results.push({
        pair: `${coin.symbol}-${targetCurrency}`,
        timestamp: Date.now(),
        averagePrice: priceData.averagePrice,
        exchanges: priceData.exchanges,
        coinGeckoId: coin.id // Store for potential future use
      });
    } else {
      console.warn(`Could not retrieve average price for ${coin.id}`);
    }
    // Add a small delay to avoid hitting API rate limits too quickly
    await new Promise(resolve => setTimeout(resolve, 500)); 
  }
  return results;
}

module.exports = {
  getTopCoins,
  getAveragePrice,
  fetchTopCryptoData,
}; 