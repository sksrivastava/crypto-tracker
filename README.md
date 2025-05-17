# Crypto Currency Data Gatherer with Hyperswarm RPC by Sachindra Srivastava

This application collects cryptocurrency price data from the CoinGecko public API, stores it in a Hyperbee database, and exposes it via Hyperswarm RPC. It features scheduled data collection and an on-demand trigger for the data pipeline.

## Features

-   Collects prices for the top 5 cryptocurrencies against USDT from CoinGecko.
-   Calculates average prices from the top 3 exchanges.
-   Stores data in a Hyperbee database (on Hypercore).
-   Exposes data via Hyperswarm RPC with methods:
    -   `getLatestPrices(pairs: string[])`
    -   `getHistoricalPrices(pairs: string[], from: number, to: number)`
    -   `triggerDataCollection()` for on-demand pipeline execution.
-   Schedules automatic data collection every 2 minutes (configurable).
-   Includes a client to demonstrate RPC calls.

## Project Structure

```
.
├── db/                    # Directory for Hypercore/Hyperbee databases
│   ├── crypto-prices/     # Stores collected cryptocurrency price data
│   ├── rpc-client-meta/ # Stores client's DHT seed
│   └── rpc-server-meta/ # Stores server's DHT/RPC seeds and public key
├── src/                   # Source code
│   ├── components/
│   │   └── scheduler.js   # Task scheduler
│   ├── database/
│   │   └── hyperbeeClient.js # Hyperbee database interactions
│   ├── services/
│   │   ├── coingecko.js   # CoinGecko API interactions
│   │   └── rpcService.js  # RPC method handlers
│   ├── client.js          # Example RPC client
│   └── server.js          # Main RPC server application
├── crypto_data_export.json # Optional: Created by the visualization script
├── package.json
├── read_crypto_db_for_visualization.js # Script to export DB data to JSON
└── README.md
```

## Prerequisites

1.  **Node.js:** Ensure Node.js is installed (which includes npm). You can download it from [nodejs.org](https://nodejs.org/).
2.  **Dependencies:** Install project dependencies by navigating to the project root directory in your terminal and running:
    ```bash
    npm install
    ```

## Running the Application

You will need three separate terminal windows/tabs to run all components of the application.

**Step 1: Start the DHT Bootstrap Node (Terminal 1)**

The Hyperswarm network requires at least one bootstrap node for peers to discover each other.

-   **Command:**
    ```bash
    npm run dht
    ```
    (This executes `hyperdht --bootstrap --host 127.0.0.1 --port 30001` as defined in `package.json`)
-   **Expected Output:** Logs from the `hyperdht` process. Keep this terminal running.

**Step 2: Start the Server Application (Terminal 2)**

The server collects data, stores it, and responds to RPC requests.

-   **Command:**
    ```bash
    npm start
    ```
    (This executes `node src/server.js`)
-   **Observe Scheduled Execution:**
    *   Upon starting, the server will immediately run the data collection task once. You'll see logs like:
        ```
        Hyperbee database initialized at: ./db/rpc-server-meta
        Cryptocurrency data Hyperbee initialized.
        DHT node started.
        RPC server started listening on public key: <YOUR_SERVER_PUBLIC_KEY_HEX>
        RPC handlers (getLatestPrices, getHistoricalPrices, triggerDataCollection) are set up.
        Scheduler: Executing scheduled task...
        Running data collection task...
        (Fetching and saving data logs...)
        Scheduler: Task completed successfully.
        Crypto data collection scheduled to run every 120 seconds.
        Server setup complete. Press Ctrl+C to exit.
        ```
    *   The data collection task will then run automatically at the configured interval (default is 120 seconds / 2 minutes). You will see the "Scheduler: Executing scheduled task..." logs periodically.
-   **Important: Note the Server's Public Key**
    *   The server will log its public key: `RPC server started listening on public key: <YOUR_SERVER_PUBLIC_KEY_HEX>`.
    *   Copy this hexadecimal string. You might need it for the client, although the client attempts to read it automatically from `./db/rpc-server-meta/rpc-server-public-key` after the server creates it.
-   Keep this terminal running.

**Step 3: Run the Client Application (Terminal 3)**

The client demonstrates how to connect to the server and use its RPC methods, including triggering on-demand data collection.

-   **Command:**
    1.  The client will first attempt to automatically retrieve the server's public key. Try running:
        ```bash
        npm run client
        ```
    2.  If the automatic retrieval fails (e.g., if running the client very quickly after the server starts for the first time), or if you prefer to be explicit, use the server's public key you noted from Terminal 2:
        ```bash
        npm run client <YOUR_SERVER_PUBLIC_KEY_HEX>
        ```
        (Replace `<YOUR_SERVER_PUBLIC_KEY_HEX>` with the actual key).
-   **Observe Client Output & On-Demand Execution:**
    *   The client will log its actions:
        *   Connecting to the DHT.
        *   Requesting latest prices and printing the response.
        *   Requesting historical prices and printing the response.
        *   **Triggering on-demand data collection:**
            ```
            Client: Requesting on-demand data collection trigger...
            Client: On-demand data collection triggered successfully: Data collection task triggered successfully.
            ```
    *   **Observe Server Logs (Terminal 2) for On-Demand Execution:**
        *   When the client triggers the on-demand collection, you will see corresponding logs in the server's terminal (Terminal 2) indicating that the task is running outside its normal schedule:
            ```
            [RPC triggerDataCollection] Received request.
            Scheduler: Executing task on demand...
            Scheduler: Executing scheduled task...
            Running data collection task...
            (Fetching and saving data logs...)
            Scheduler: Task completed successfully.
            ```

## Observing Data Collection

-   **Scheduled:** Watch the server logs (Terminal 2) for messages like "Scheduler: Executing scheduled task..." appearing at the configured interval.
-   **On-Demand:** Run the client (Terminal 3). When it requests `triggerDataCollection`, check the server logs (Terminal 2) for immediate execution of the task, identifiable by "Scheduler: Executing task on demand...".

## Data Storage and Visualization

-   Collected data is stored in the Hyperbee database at `./db/crypto-prices/`.
-   To export this data for visualization:
    1.  **Stop the server application** (Ctrl+C in Terminal 2) to release file locks.
    2.  Run the export script:
        ```bash
        node read_crypto_db_for_visualization.js
        ```
    3.  This creates a `crypto_data_export.json` file in the project root. You can use this JSON file with various charting libraries or data analysis tools.

## Fresh Start (Clearing Data)

To start the application with a completely fresh database and new server/client identities:

1.  **Stop all running processes** (DHT node, server, client).
2.  Delete the contents of the `db` directory. In your project root:
    ```bash
    rm -rf db/*
    ```
    (Alternatively, delete the specific subdirectories: `db/crypto-prices`, `db/rpc-server-meta`, `db/rpc-client-meta`).
3.  Follow the steps in "Running the Application" again. The server will generate a new public key.

## Error Handling: CoinGecko Rate Limiting

-   The free CoinGecko API has rate limits. If you see `Error: Request failed with status code 429` (Too Many Requests), it means you've exceeded these limits.
-   The application is configured by default to fetch data every 30 seconds (`FETCH_INTERVAL_MS` in `src/server.js`).
-   **To mitigate rate limiting:**
    *   Increase `FETCH_INTERVAL_MS` in `src/server.js` to a larger value (e.g., `5 * 60 * 1000` for 5 minutes).
    *   Consider subscribing to a CoinGecko paid API plan for higher rate limits if you need more frequent updates for a production environment.

