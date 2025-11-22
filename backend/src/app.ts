import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import authRouter from "./routes/auth.routes.js"; // Import the router
import { errorHandler } from "./middlewares/error.middleware.js";


export const app = express();

// Dynamic CORS Configuration
app.use(cors({
  origin: function (requestOrigin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!requestOrigin) return callback(null, true);

    const allowedPatterns = [
      /^http:\/\/localhost:\d+$/,
      /^https:\/\/.*\.github\.dev$/,
      /^https:\/\/.*\.app\.github\.dev$/,
      /^https:\/\/your-production-site\.com$/
    ];

    const isAllowed = allowedPatterns.some(pattern => pattern.test(requestOrigin));

    if (isAllowed) {
      callback(null, true); // Reflect the origin back to the browser
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Essential for Cookies to work
}));

app.use(cookieParser());
app.use(express.json());

app.use("/api/auth", authRouter);


app.get('/health', (_req, res) => {
  res.status(200).json({ message: 'ok' });
});


app.use(errorHandler)

export default app