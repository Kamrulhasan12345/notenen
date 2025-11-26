import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import { NoteModel } from "../models/note.model.js"; // Adjust path
import { NoteUpdateModel } from "../models/noteUpdate.model.js";

export class DocumentHandler {
  public doc: Y.Doc;
  public awareness: awarenessProtocol.Awareness; // Shared Awareness Instance
  public noteId: string;

  // Lifecycle
  public activeConnections: number = 0;
  private cleanupCallback: (noteId: string) => void;
  private gcTimeout: NodeJS.Timeout | null = null;

  // Persistence (Buffering)
  private updateBuffer: Uint8Array[] = [];
  private lastSenderId: string | null = null;
  private saveTimeout: NodeJS.Timeout | null = null;

  // Config
  private readonly DEBOUNCE_MS = 2000;
  private readonly MAX_BUFFER_LEN = 50;
  private saveCount: number = 0;

  constructor(noteId: string, cleanupCallback: (id: string) => void) {
    this.noteId = noteId;
    this.cleanupCallback = cleanupCallback;
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);

    // CRITICAL: The listener that captures updates from Yjs
    this.doc.on('update', (update: Uint8Array, origin: any) => {
      if (origin === 'db-load') return;

      // Logic to find the User ID string
      let sender = this.lastSenderId;

      if (typeof origin === 'string') {
        sender = origin;
      } else if (typeof origin === 'object' && origin !== null && origin.userId) {
        sender = origin.userId; // Extract it from the object
      }

      if (sender) {
        this.bufferUpdate(update, sender);
      }
    });
  }

  // ==========================================
  // 1. LOADING
  // ==========================================
  async load() {
    // A. Snapshot
    const note = await NoteModel.findById(this.noteId);
    if (note && note.documentState && note.documentState.length > 0) {
      Y.applyUpdate(this.doc, note.documentState);
    }

    // B. Logs
    const updates = await NoteUpdateModel.find({ noteId: this.noteId }).sort({ createdAt: 1 });

    // CRITICAL: Use 'db-load' origin so we don't trigger a save loop
    this.doc.transact(() => {
      updates.forEach(u => Y.applyUpdate(this.doc, u.updateBlob));
    }, 'db-load');

    this.saveCount = updates.length;
    console.log(`[${this.noteId}] Loaded. Batches in history: ${this.saveCount}`);
  }

  // ==========================================
  // 2. BUFFERING
  // ==========================================
  private bufferUpdate(update: Uint8Array, senderId: string) {
    this.updateBuffer.push(update);
    this.lastSenderId = senderId;

    if (this.updateBuffer.length >= this.MAX_BUFFER_LEN) {
      this.flushBuffer();
      return;
    }

    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.flushBuffer();
    }, this.DEBOUNCE_MS);
  }

  private async flushBuffer() {
    if (this.updateBuffer.length === 0 || !this.lastSenderId) return;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    const updatesToSave = this.updateBuffer;
    this.updateBuffer = [];
    const merged = Y.mergeUpdates(updatesToSave);

    try {
      await NoteUpdateModel.create({
        noteId: this.noteId,
        sender: this.lastSenderId,
        updateBlob: Buffer.from(merged),
        createdAt: new Date()
      });

      this.saveCount++;

      if (this.saveCount >= 50) {
        await this.compact();
        console.log(`[${this.noteId}] compacted from flushBuffer`)
      }

      console.log(`[${this.noteId}] yeah saved it in flushBuffer`)
    } catch (err) {
      console.error(`[${this.noteId}] Save failed:`, err);
    }
  }

  // ==========================================
  // 3. COMPACTION
  // ==========================================
  private async compact() {
    console.log(`[${this.noteId}] Compacting...`);
    this.saveCount = 0;

    const snapshot = Y.encodeStateAsUpdate(this.doc);
    const content = this.doc.getText("content").toString(); // Adjust "content" if you use a specific Yjs type name

    await NoteModel.findByIdAndUpdate(this.noteId, {
      documentState: Buffer.from(snapshot),
      content: content,
      updatedAt: new Date()
    });

    await NoteUpdateModel.deleteMany({ noteId: this.noteId });
    console.log(`[${this.noteId}] compacted successfully`)
  }

  // ==========================================
  // 4. LIFECYCLE
  // ==========================================
  handleConnect() {
    this.activeConnections++;
    if (this.gcTimeout) {
      clearTimeout(this.gcTimeout);
      this.gcTimeout = null;
    }
  }

  handleDisconnect() {
    this.activeConnections--;
    console.log(`[${this.noteId}] yoo we're -1. current: ${this.activeConnections}`)
    if (this.activeConnections <= 0) {
      this.gcTimeout = setTimeout(() => {
        this.destroy();
      }, 30000);
    }
    console.log(`[${this.noteId}] yeah actually -1`)
  }

  async destroy() {
    console.log(`${this.noteId} nuclear blast`)
    await this.flushBuffer();
    await this.compact();
    this.awareness.destroy(); // Stop memory leak
    this.doc.destroy();
    this.cleanupCallback(this.noteId);
    console.log(`[${this.noteId}] Destroyed xd.`);
  }
}