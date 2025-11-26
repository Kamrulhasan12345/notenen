import { io } from "socket.io-client";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

// ==========================================
// ⚙️ CONFIGURATION
// ==========================================
dotenv.config();
const MONGO_URI =
  "mongodb+srv://mkhasan_db_user:SYEJ4308WXT2mkbj@cluster0.q25mdwf.mongodb.net/?appName=Cluster0";
const JWT_SECRET =
  "28cfbcfccbf939b82b4507a927bada65539539dc7550b4778950716d101a50bee2f55d97385783f1a88e8966dd540dc9e7ae2d45420cad16afd67d27e499a13e";

const SERVER_URL = "http://localhost:4000";

// ==========================================
// 🛠️ MODELS
// ==========================================
const UserSchema = new mongoose.Schema({ name: String, email: String });
const NoteSchema = new mongoose.Schema({
  title: String,
  owner: mongoose.Types.ObjectId,
  members: [{ user: mongoose.Types.ObjectId, role: String }],
  documentState: Buffer,
});
const NoteUpdateSchema = new mongoose.Schema({
  noteId: String,
  sender: String,
  updateBlob: Buffer,
});

const UserModel =
  mongoose.models.NoteNenUser || mongoose.model("NoteNenUser", UserSchema);
const NoteModel =
  mongoose.models.NoteNenNote || mongoose.model("NoteNenNote", NoteSchema);
const NoteUpdateModel =
  mongoose.models.NoteNenUpdate ||
  mongoose.model("NoteNenUpdate", NoteUpdateSchema);

// ==========================================
// 🎨 HELPERS
// ==========================================
const LOG = (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`);
const PASS = (msg) => console.log(`\x1b[32m[PASS]\x1b[0m ${msg}`);
const FAIL = (msg) => {
  console.error(`\x1b[31m[FAIL]\x1b[0m ${msg}`);
  process.exit(1);
};
const SECTION = (msg) =>
  console.log(`\n\x1b[33m================ ${msg} ================\x1b[0m`);

// ✅ GLOBAL WAIT HELPER
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ==========================================
// 🤖 TEST CLIENT
// ==========================================
class TestClient {
  constructor(name, token) {
    this.name = name;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);

    this.socket = io(SERVER_URL, {
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    });

    this.socket.on("yjs_message", (buffer) => {
      try {
        const update = new Uint8Array(buffer);
        const decoder = decoding.createDecoder(update);
        const messageType = decoding.readVarUint(decoder);

        if (messageType === 0) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, 0);
          syncProtocol.readSyncMessage(decoder, encoder, this.doc, null);
          console.log(
            `got some text '${this.doc.getText("content").toString()}' in user '${this.name}'`,
          );
          if (encoding.length(encoder) > 1) {
            this.socket.emit("yjs_message", encoding.toUint8Array(encoder));
          }
        } else if (messageType === 1) {
          awarenessProtocol.applyAwarenessUpdate(
            this.awareness,
            decoding.readVarUint8Array(decoder),
            this,
          );
        }
      } catch (e) {
        console.error(e);
      }
    });

    this.doc.on("update", (update, origin) => {
      if (origin !== this) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 0);
      syncProtocol.writeUpdate(encoder, update);
      this.socket.emit("yjs_message", encoding.toUint8Array(encoder));
    });

    this.awareness.on("update", ({ added, updated, removed }) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, 1);
      awarenessProtocol.writeAwarenessUpdate(
        encoder,
        this.awareness,
        added.concat(updated).concat(removed),
      );
      this.socket.emit("yjs_message", encoding.toUint8Array(encoder));
    });
  }

  join(noteId) {
    this.socket.emit("join_note", { noteId });
  }

  type(text) {
    this.doc.transact(() => {
      this.doc
        .getText("content")
        .insert(this.doc.getText("content").length, text);
    }, this);
  }

  moveCursor(id) {
    this.awareness.setLocalState({ user: { name: this.name }, cursor: id });
  }

  disconnect() {
    this.socket.disconnect();
  }

  get text() {
    return this.doc.getText("content").toString();
  }
}

// ==========================================
// 🚀 EXECUTION FLOW
// ==========================================
async function runSuite() {
  try {
    await mongoose.connect(MONGO_URI);
    LOG("DB Connected. Cleaning old data...");

    await UserModel.deleteMany({ email: /@test.com/ });
    await NoteModel.deleteMany({ title: "SIMULATION_NOTE" });
    await NoteUpdateModel.deleteMany({});

    // SETUP
    const admin = await UserModel.create({
      name: "Admin",
      email: "admin@test.com",
    });
    const editor = await UserModel.create({
      name: "Editor",
      email: "editor@test.com",
    });
    const viewer = await UserModel.create({
      name: "Viewer",
      email: "viewer@test.com",
    });

    const note = await NoteModel.create({
      title: "SIMULATION_NOTE",
      owner: admin._id,
      members: [
        { user: editor._id, role: "editor" },
        { user: viewer._id, role: "viewer" },
      ],
      documentState: Buffer.from([]),
    });
    const noteId = note._id.toString();

    const tAdmin = jwt.sign({ sub: admin._id.toString() }, JWT_SECRET);
    const tEditor = jwt.sign({ sub: editor._id.toString() }, JWT_SECRET);
    const tViewer = jwt.sign({ sub: viewer._id.toString() }, JWT_SECRET);

    // ==========================================================
    // CASE 1: REAL-TIME SYNC
    // ==========================================================
    SECTION("CASE 1: Real-Time Sync");

    const cAdmin = new TestClient("Admin", tAdmin);
    const cEditor = new TestClient("Editor", tEditor);

    cAdmin.join(noteId);
    cEditor.join(noteId);

    // 🛑 CRITICAL WAIT: Give Server 1s to join room and load DB
    LOG("Waiting for server to setup room...");
    await wait(1000);

    cAdmin.type("Hello");
    await wait(500); // Propagation

    cEditor.type(" World");
    await wait(500); // Propagation

    // Compare
    const textA = cAdmin.text;
    const textB = cEditor.text;

    if (textA === textB && textA === "Hello World") {
      PASS(`Sync Success! Both see: "${textA}"`);
    } else {
      FAIL(`Sync mismatch. Admin: '${textA}', Editor: '${textB}'`);
    }

    // ==========================================================
    // CASE 2: SECURITY
    // ==========================================================
    SECTION("CASE 2: Security Check");

    const cViewer = new TestClient("Viewer", tViewer);
    cViewer.join(noteId);
    await wait(1000); // Wait for join

    LOG("Viewer attempting hack...");
    cViewer.type("HACKED");
    await wait(500);

    if (cAdmin.text.includes("HACKED")) {
      FAIL("Viewer successfully wrote to doc!");
    } else {
      PASS("Admin does not see 'HACKED'. Security valid.");
    }

    // ==========================================================
    // CASE 3: ZOMBIE CURSORS
    // ==========================================================
    SECTION("CASE 3: Zombie Cursor Cleanup");

    cEditor.moveCursor(999);
    await wait(200);

    const statesBefore = Array.from(cAdmin.awareness.getStates().values());
    if (statesBefore.length < 2) FAIL("Admin never saw Editor's cursor");

    LOG("Disconnecting Editor...");
    cEditor.disconnect();
    await wait(500); // Wait for server GC

    const statesAfter = Array.from(cAdmin.awareness.getStates().values());

    if (statesAfter.length < statesBefore.length) {
      PASS("Cursor removed.");
    } else {
      FAIL("Zombie cursor remains.");
    }

    // ==========================================================
    // CASE 4: PERSISTENCE
    // ==========================================================
    SECTION("CASE 4: Debouncing");

    await NoteUpdateModel.deleteMany({});

    LOG("Admin typing a dot...");
    cAdmin.type(".");
    await wait(100);

    const logsInstant = await NoteUpdateModel.countDocuments({ noteId });
    if (logsInstant === 0) {
      PASS("Buffer active (0 logs immediate).");
    } else {
      FAIL("Buffer failed (Saved immediately).");
    }

    LOG("Waiting 2.5s for flush...");
    await wait(2500);

    const logsLater = await NoteUpdateModel.countDocuments({ noteId });
    if (logsLater > 0) {
      PASS("Flush successful (Log found).");
    } else {
      FAIL("No logs found after timeout.");
    }

    // ==========================================================
    // CASE 5: LOAD TEST
    // ==========================================================
    SECTION("CASE 5: Bot Army");

    const bots = [];
    for (let i = 0; i < 5; i++) {
      bots.push(new TestClient(`Bot${i}`, tAdmin));
      bots[i].join(noteId);
    }
    await wait(1000);

    LOG("Bots typing...");
    bots.forEach((b, i) => b.type(`[${i}]`));
    await wait(2000);

    const finalText = cAdmin.text;
    let allIn = true;
    for (let i = 0; i < 5; i++) {
      if (!finalText.includes(`[${i}]`)) allIn = false;
    }

    if (allIn) PASS("All bot updates merged.");
    else FAIL(`Stress test failed. Final: ${finalText}`);

    // CLEANUP
    bots.forEach((b) => b.disconnect());
    cAdmin.disconnect();
    cViewer.disconnect();
    await mongoose.disconnect();

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

// ... (Include Imports and Setup from previous script) ...

async function verifyClientReceive() {
  await mongoose.connect(MONGO_URI);

  // 1. Create TWO distinct users
  const userA = await UserModel.create({ name: "UserA", email: "ac@test.com" });
  const userB = await UserModel.create({ name: "UserB", email: "bc@test.com" });

  // 2. Create Note where BOTH are members
  const note = await NoteModel.create({
    title: "VERIFY_NOTE",
    owner: userA._id,
    members: [{ user: userB._id, role: "editor" }],
    documentState: Buffer.from([]),
  });

  // 3. Generate distinct tokens
  const tokenA = jwt.sign({ sub: userA._id.toString() }, JWT_SECRET);
  const tokenB = jwt.sign({ sub: userB._id.toString() }, JWT_SECRET);

  // 4. Connect with distinct identities
  const cSender = new TestClient("Sender (User A)", tokenA);
  const cReceiver = new TestClient("Receiver (User B)", tokenB);

  cSender.join(note._id.toString());
  cReceiver.join(note._id.toString());

  console.log("Waiting for connections...");
  await wait(2000);

  console.log("--- Starting Typing Test ---");

  // Sender types "A"
  cSender.type("A");
  await wait(500);

  // Sender types "B"
  cSender.type("B");
  await wait(5000);

  console.log(`Sender Text: '${cSender.text}'`);
  console.log(`Receiver Text: '${cReceiver.text}'`);

  // Final Proof
  if (cReceiver.text === "AB") {
    PASS("Receiver successfully mutated its internal doc state.");
  } else {
    FAIL(`Receiver state failed. Expected 'AB', got '${cReceiver.text}'`);
  }

  cSender.disconnect();
  cReceiver.disconnect();
  await mongoose.disconnect();
  process.exit(0);
}

verifyClientReceive();

// runSuite();
