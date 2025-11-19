import 'dotenv/config';
import http from 'http';
import { app } from './app.js';

const PORT = Number(process.env.PORT) || 4000;

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

