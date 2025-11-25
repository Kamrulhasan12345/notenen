import http from 'http';
import app from './app.js';
import { env } from './config/env.js'; // Use our typed Env
import { connectDB, disconnectDB } from './config/database.js';
import { initSocket } from './socket.js';

const startServer = async () => {
  // 1. Connect to Database
  await connectDB();

  const server = http.createServer(app);

  initSocket(server);

  // 2. Start Server
  server.listen(env.PORT, () => {
    console.log(`Server is running on http://localhost:${env.PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
  });


  const shutdown = async () => {
    console.log('\nServer is shutting down...');

    // Stop accepting new HTTP requests
    server.close(async () => {
      console.log('HTTP Server closed.');

      // Close DB Connection
      await disconnectDB();

      // Exit the process (0 = success)
      process.exit(0);
    });
  };

  // Listen for termination signals
  process.on('SIGINT', shutdown);  // Ctrl + C
  process.on('SIGTERM', shutdown); // Docker stop / Cloud provider stop
};


startServer();