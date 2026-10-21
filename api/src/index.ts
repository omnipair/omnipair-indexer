import app from './app';
import pool from './config/database';
import { startActivityInvalidationListener, stopActivityInvalidationListener } from './services/activityInvalidationService';
import { startPoolInvalidationListener, stopPoolInvalidationListener } from './services/poolInvalidationService';
import { perfMetrics } from './utils/perfMetrics';
import { getTokenLogoService } from './services/tokenLogoService';

const PORT = process.env.PORT || 3000;
const tokenLogos = getTokenLogoService();
tokenLogos?.start();

let server: any;

// Graceful shutdown function
const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully`);
  perfMetrics.stopReporting();
  await stopActivityInvalidationListener();
  await stopPoolInvalidationListener();
  
  if (server) {
    server.close(async () => {
      console.log('HTTP server closed');
      await tokenLogos?.stop();
      await pool.end();
      console.log('Database pool closed');
      process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
      console.error('Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
  } else {
    await tokenLogos?.stop();
    await pool.end();
    process.exit(0);
  }
};

// Graceful shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    await startActivityInvalidationListener();
  } catch (error) {
    console.error('Failed to start activity invalidation listener:', error);
  }
  try {
    await startPoolInvalidationListener();
  } catch (error) {
    console.error('Failed to start pool invalidation listener:', error);
  }
});

process.on('unhandledRejection', (err: any) => {
  console.error('Unhandled Promise Rejection:', err);
  if (server) {
    server.close(async () => {
      await tokenLogos?.stop();
      await pool.end();
      process.exit(1);
    });
  } else {
    pool.end().then(() => process.exit(1));
  }
});

export default server;
