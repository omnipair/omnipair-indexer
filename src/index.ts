import { log } from "./logger/logger";
import { omnipairIndexer } from "./omnipair_indexer";
import http from "http";

const appStartTime = new Date();

const logger = log.child({
  module: "main"
});

async function main() {
  logger.info("Starting Omnipair Indexer...");

  try {
    // Parse command line arguments for backfill options
    const args = process.argv.slice(2);
    const options: { skipBackfill?: boolean, backfillFromSlot?: number } = {};

    // Check for skip backfill flag
    if (args.includes('--skip-backfill')) {
      options.skipBackfill = true;
      logger.info("Skipping initial backfill");
    }

    // Check for backfill from slot
    const fromSlotIndex = args.indexOf('--backfill-from-slot');
    if (fromSlotIndex !== -1 && args[fromSlotIndex + 1]) {
      const slot = parseInt(args[fromSlotIndex + 1]);
      if (!isNaN(slot)) {
        options.backfillFromSlot = slot;
        logger.info(`Will backfill from slot ${slot}`);
      }
    }

    // Start the Omnipair indexer
    await omnipairIndexer.start(options);
    
    logger.info("Omnipair Indexer started successfully");
  } catch (error) {
    logger.error({ error }, "Failed to start Omnipair Indexer");
    process.exit(1);
  }

  // Health check server
  const server = http.createServer(async (req: any, res: any) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`).pathname;
    
    if (reqUrl === "/") {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      let html = "<html><body>";
      html += `<h1>Omnipair Indexer Health Check</h1>`;
      html += `<p>Started at: ${appStartTime.toLocaleString('en-US', {timeZone: 'America/Vancouver'})}</p>`;
      html += `<p>Status: Running</p>`;
      html += `<p>Uptime: ${Math.floor((Date.now() - appStartTime.getTime()) / 1000)} seconds</p>`;
      html += "</body></html>";
      res.end(html);
    } else if (reqUrl === "/health") {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: "healthy",
        uptime: Math.floor((Date.now() - appStartTime.getTime()) / 1000),
        timestamp: new Date().toISOString()
      }));
    } else if (reqUrl === "/backfill") {
      // Manual backfill endpoint
      if (req.method === 'POST') {
        try {
          const result = await omnipairIndexer.runBackfill();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      } else {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
      }
    } else if (reqUrl === "/gap-fill") {
      // Manual gap fill endpoint
      if (req.method === 'POST') {
        try {
          const result = await omnipairIndexer.runGapFill();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
        }
      } else {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed');
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    logger.info(`Health check server listening on port ${port}`);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await omnipairIndexer.stop();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await omnipairIndexer.stop();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

// Start the application
main().catch((error) => {
  logger.error({ error }, "Unhandled error in main");
  process.exit(1);
});