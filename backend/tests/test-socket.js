// Run this using: node test-socket.js
/* eslint-env node */
import { io } from "socket.io-client";
import axios from "axios";

const API_URL = "http://localhost:4000";

async function test() {
  try {
    console.log("1. Logging in via REST API...");

    // 1. LOGIN to get a real Token
    const loginRes = await axios.post(
      `${API_URL}/api/auth/login`,
      {
        email: "man@gmail.com", // Ensure this user exists in your DB
        password: "man@gmail.com",
      },
      {
        headers: { "x-client-platform": "mobile" },
      },
    );

    const token = loginRes.data.data.accessToken;
    console.log("   Got Access Token:", token.substring(0, 20) + "...");

    console.log("\n2. Connecting to Socket.io...");

    // 2. CONNECT using the token
    const socket = io(API_URL, {
      auth: {
        token: token, // sending token in handshake
      },
    });

    // 3. LISTEN for events
    socket.on("connect", () => {
      console.log("   ✅ Connected to Socket! ID:", socket.id);

      console.log("\n3. Sending 'ping' event...");
      socket.emit("ping", { hello: "world" });
    });

    socket.on("pong", (data) => {
      console.log("   ✅ Received 'pong' from server:", data);
      console.log("\nTEST PASSED! Closing connection.");
      socket.disconnect();
      process.exit(0);
    });

    socket.on("connect_error", (err) => {
      console.error("   ❌ Connection Failed:", err.message);
      process.exit(1);
    });
  } catch (error) {
    console.error("   ❌ Error:", error.response?.data || error.message);
    process.exit(1);
  }
}

test();
