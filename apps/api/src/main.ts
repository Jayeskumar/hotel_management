/** Cloud / container entry point. */
import { startServer } from './server.js';

const server = await startServer();

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down`);
  await server.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
