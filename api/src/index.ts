import app from './app';
import pool from './config/database';
import { DataController } from './controllers/dataController';

const PORT = process.env.PORT || 3000;

let server: any;

// Graceful shutdown function
const gracefulShutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down gracefully`);
  
  if (server) {
    server.close(async () => {
      console.log('HTTP server closed');
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
    await DataController.initializeOlpValueService();
  } catch (error) {
    console.error('Failed to initialize OlpValueService:', error);
  }
});

process.on('unhandledRejection', (err: any) => {
  console.error('Unhandled Promise Rejection:', err);
  if (server) {
    server.close(async () => {
      await pool.end();
      process.exit(1);
    });
  } else {
    pool.end().then(() => process.exit(1));
  }
});

export default server;
