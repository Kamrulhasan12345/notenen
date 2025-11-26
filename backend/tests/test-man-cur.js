import readline from "readline";
import { io } from "socket.io-client";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const SERVER_URL = "http://localhost:4000";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.clear();
  console.log("\x1b[36m=== 🔐 MANUAL LOGIN & TEST CLIENT ===\x1b[0m\n");

  const email = await ask("📧 Email: ");
  const password = await ask("🔑 Password: ");

  console.log("\nLogging in...");

  try {
    const res = await fetch(`${SERVER_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const body = await res.json();
    if (!res.ok) throw new Error(body.message || "Login failed");

    const token = body.data?.accessToken; // Adjust path if needed
    console.log(`\x1b[32m✅ Login Success!\x1b[0m`);

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
    transports: ["websocket"],
  });

  // --- SOCKET HANDLERS ---
  socket.on("connect", () => {
    socket.emit("join_note", { noteId });
  });

  socket.on("note_joined", () => {
    console.log(`\x1b[32m✅ Joined Room!\x1b[0m`);
    console.log(
      `\x1b[90mCommands:\n - Type text to append\n - Type '/move 5' to move cursor to index 5\x1b[0m\n`,
    );

    // 1. Initiate Sync
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.writeSyncStep1(encoder, doc);
    socket.emit("yjs_message", encoding.toUint8Array(encoder));

    // 2. Set Local Awareness (Who am I?)
    awareness.setLocalState({
      user: { name: userEmail, color: "#ff0000" },
      cursor: null, // Start with no cursor
    });
  });

  // --- YJS HANDLERS ---
  socket.on("yjs_message", (buffer) => {
    try {
      const update = new Uint8Array(buffer);
      const decoder = decoding.createDecoder(update);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === 0) {
        // Sync
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0);
        syncProtocol.readSyncMessage(decoder, encoder, doc, null);
        if (encoding.length(encoder) > 1) {
          socket.emit("yjs_message", encoding.toUint8Array(encoder));
        }
      } else if (messageType === 1) {
        // Awareness
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(decoder),
          "socket",
        );
      }
    } catch (e) {
      console.error(e);
    }
  });

  // --- LISTEN FOR REMOTE CURSORS ---
  awareness.on("change", ({ added, updated, removed }) => {
    const states = awareness.getStates();

    states.forEach((state, clientId) => {
      // Don't show my own cursor
      if (clientId === doc.clientID) return;

      if (state.user && state.cursor) {
        console.log(
          `\x1b[35m[👀 CURSOR] ${state.user.name} is at index ${state.cursor.anchor}\x1b[0m`,
        );
      } else if (state.user && !state.cursor) {
        // User exists but has no cursor selection
        // console.log(`[👤 USER] ${state.user.name} is online`);
      }
    });
  });

  // --- LISTEN FOR DOC UPDATES ---
  doc.on("update", (update, origin) => {
    if (origin !== "local") {
      printDoc(doc);
    }
  });

  // --- INPUT HANDLER ---
  rl.on("line", (input) => {
    process.stdout.moveCursor(0, -1);
    process.stdout.clearLine(1);

    if (!input) return;

    // COMMAND: Move Cursor
    if (input.startsWith("/move ")) {
      const idx = parseInt(input.split(" ")[1]);
      if (!isNaN(idx)) {
        awareness.setLocalState({
          ...awareness.getLocalState(),
          cursor: { anchor: idx, head: idx },
        });

        // Broadcast awareness immediately
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 1);
        const buff = awarenessProtocol.encodeAwarenessUpdate(awareness, [
          doc.clientID,
        ]);
        encoding.writeVarUint8Array(encoder, buff);
        socket.emit("yjs_message", encoding.toUint8Array(encoder));

        console.log(`\x1b[90m> You moved to index ${idx}\x1b[0m`);
      }
      return;
    }

    // COMMAND: Text Input
    doc.transact(() => {
      const currentText = doc.getText("content");
      currentText.insert(currentText.length, " " + input);
    }, "local");

    // Send update
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(doc)); // Full state or diff
    socket.emit("yjs_message", encoding.toUint8Array(encoder));

    printDoc(doc);
  });
}

function printDoc(doc) {
  const text = doc.getText("content").toString();
  console.log(`\x1b[36m[DOC]:\x1b[0m ${text}`);
}

main();
