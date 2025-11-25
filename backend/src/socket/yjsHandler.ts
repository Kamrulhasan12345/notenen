import { Socket } from "socket.io";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import { NoteModel } from "../models/note.model.js";
import { NoteUpdateModel } from "../models/noteUpdate.model.js";
import { Mutex } from "async-mutex";

type DocEntry = {
  doc: Y.Doc,
  updatesCount: number;
  mutex: Mutex;
}

const activeDocs = new Map<string, DocEntry>();

// In memory caching
const loadDoc = async (noteId: string) => {
  if (activeDocs.has(noteId)) return activeDocs.get(noteId)!;

  const mutex = new Mutex()
  const doc = new Y.Doc()
  const entry: DocEntry = { doc, updatesCount: 0, mutex };
  activeDocs.set(noteId, entry);

  await mutex.runExclusive(async () => {
    // load snapshot
    const note = await NoteModel.findById(noteId);
    if (note && note.documentState && note.documentState.length > 0) {
      Y.applyUpdate(doc, note.documentState);
    }


    // load incremental history
    const updates = await NoteUpdateModel.find({ noteId }).sort({ createdAt: 1 });
    updates.forEach(u => {
      Y.applyUpdate(doc, u.updateBlob);
    });
    entry.updatesCount = updates.length;
  })
  return entry;
}

const persistUpdate = async (noteId: string, userId: string, update: Uint8Array) => {
  const entry = activeDocs.get(noteId);
  if (!entry) return;

  await entry.mutex.runExclusive(async () => {
    Y.applyUpdate(entry.doc, update);


    // log history 
    await NoteUpdateModel.create({
      noteId,
      sender: userId,
      updateBlob: Buffer.from(update)
    })
    entry.updatesCount++;


    // snapshot strategy (every 50 edits)
    if (entry.updatesCount >= 50) {
      const snapshot = Y.encodeStateAsUpdate(entry.doc);
      const content = entry.doc.getText("content").toString();

      await NoteModel.findByIdAndUpdate(noteId, {
        documentState: Buffer.from(snapshot),
        content
      })

      entry.updatesCount = 0;
      console.log(`[Yjs] Snapshotted note ${noteId}`);
    }
  });
}

export const handleYjsSync = async (socket: Socket, noteId: string) => {
  const entry = await loadDoc(noteId);

  // send initial state
  const encoder = encoding.createEncoder();
  syncProtocol.writeSyncStep1(encoder, entry.doc);
  socket.emit('yjs_sync', encoding.toUint8Array(encoder));

  // listen for updates
  socket.on("yjs_update", async (update) => {
    // broadcast to others
    socket.to(noteId).emit("yjs_update", update);

    // save to db
    // convert back to Uint8Array if socketio sent a Buffer
    const updateUint8 = new Uint8Array(update);
    await persistUpdate(noteId, socket.data.user._id, updateUint8);
  })
}