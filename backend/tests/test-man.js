import readline from 'readline';
import { io } from "socket.io-client";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

// ⚙️ CONFIG
const SERVER_URL = "http://localhost:4000";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.clear();
  console.log("\x1b[36m=== 🔐 MANUAL LOGIN & TEST CLIENT ===\x1b[0m\n");

  const email = await ask("📧 Email: ");
  const password = await ask("🔑 Password: ");

  console.log("\nLogging in...");

  try {
    // 1. PERFORM LOGIN
    const res = await fetch(`${SERVER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const body = await res.json();

    if (!res.ok) throw new Error(body.message || "Login failed");

    // Extract Token (Adjust path if your API is different, e.g. body.token)
    const token = body.data?.accessToken;

    if (!token) {
      throw new Error("Token not found in response (looked for body.data.accessToken)");
    }

    console.log(`\x1b[32m✅ Login Success!\x1b[0m`);
    
    // 2. JOIN NOTE
    const noteId = await ask("\n📝 Enter Note ID to join: ");
    
    if (noteId.trim()) {
      startCollaboration(token, noteId.trim(), email);
    } else {
      process.exit(0);
    }

  } catch (err) {
    console.error(`\x1b[31m❌ Error: ${err.message}\x1b[0m`);
    process.exit(1);
  }
}

function startCollaboration(token, noteId, userEmail) {
  console.log(`\nConnecting to Note \x1b[33m${noteId}\x1b[0m...`);

  const doc = new Y.Doc();
  const awareness = new awarenessProtocol.Awareness(doc);
  
  const socket = io(SERVER_URL, {
    auth: { token },
    transports: ["websocket"]
  });

  // --- SOCKET HANDLERS ---

  socket.on("connect", () => {
    socket.emit("join_note", { noteId });
  });

  socket.on("note_joined", () => {
    console.log(`\x1b[32m✅ Joined Room! Starting Sync...\x1b[0m`);
    
    // =========================================================
    // ⚡ FIX: INITIATE SYNC FROM CLIENT SIDE
    // =========================================================
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // Message Type: Sync
    syncProtocol.writeSyncStep1(encoder, doc); // Send "Here is what I have (Nothing)"
    socket.emit("yjs_message", encoding.toUint8Array(encoder));
    
    console.log(`\x1b[90m(Type text and press Enter to append to document)\x1b[0m\n`);
    printDoc(doc);
  });

  socket.on("error", (msg) => {
    console.error(`\x1b[31mServer Error: ${msg}\x1b[0m`);
  });

  // --- YJS HANDLERS ---

  socket.on("yjs_message", (buffer) => {
    try {
      const update = new Uint8Array(buffer);
      const decoder = decoding.createDecoder(update);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === 0) { // Sync
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0);
        syncProtocol.readSyncMessage(decoder, encoder, doc, null);
        
        if (encoding.length(encoder) > 1) {
          socket.emit("yjs_message", encoding.toUint8Array(encoder));
        }
      } 
      else if (messageType === 1) { // Awareness
        awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), "socket");
      }
    } catch (e) { console.error(e); }
  });

  // Listen for remote updates to print them
  doc.on("update", (update, origin) => {
    if (origin !== "local") {
      printDoc(doc);
    }
  });

  // --- USER INPUT HANDLER ---
  rl.on("line", (input) => {
    // Move cursor up to overwrite the input line for cleaner UI
    process.stdout.moveCursor(0, -1);
    process.stdout.clearLine(1);

    if (!input) return;

    // Append text to Yjs Doc
    doc.transact(() => {
      const currentText = doc.getText("content");
      currentText.insert(currentText.length, " " + input);
    }, "local"); // Origin 'local'

    // Send update
    const update = Y.encodeStateAsUpdate(doc); // Or simpler: verify 'update' listener fires
  });
  
  // Need to hook into the local update to send it
  doc.on("update", (update, origin) => {
    if (origin === "local") {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0);
      syncProtocol.writeUpdate(encoder, update);
      socket.emit("yjs_message", encoding.toUint8Array(encoder));
      printDoc(doc);
    }
  });
}

function printDoc(doc) {
  const text = doc.getText("content").toString();
  // Clear console slightly to show "Live" view
  // process.stdout.write('\x1Bc'); 
  console.log(`\x1b[36m[DOC CONTENT]:\x1b[0m ${text}`);
}

main();