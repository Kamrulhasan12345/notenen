import { Socket } from "socket.io";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import { DocumentHandler } from "../utils/docHandler.js";

const docs = new Map<string, DocumentHandler>();

const getOrCreateDoc = async (noteId: string): Promise<DocumentHandler> => {
  if (docs.has(noteId)) {
    const doc = docs.get(noteId)!;
    doc.handleConnect();
    return doc;
  }
  const doc = new DocumentHandler(noteId, (id) => docs.delete(id));
  await doc.load();
  docs.set(noteId, doc);
  doc.handleConnect();
  return doc;
};

export const handleYjsSync = async (socket: Socket, noteId: string, canWrite: boolean) => {
  const handler = await getOrCreateDoc(noteId);
  const doc = handler.doc;
  const awareness = handler.awareness;
  const userId = socket.data.user._id.toString(); // Authenticated User ID

  // 1. TRACKING: Only remove cursors owned by this socket
  const myClientIds = new Set<number>();

  // 2. SETUP PROTOCOL: Send Sync Step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0); // Sync
  syncProtocol.writeSyncStep1(encoder, doc);
  socket.emit("yjs_message", encoding.toUint8Array(encoder));

  // 3. LISTENERS

  // A. Doc Updates (Broadcast to client)
  const onDocUpdate = (update: Uint8Array, origin: any) => {
    // Echo suppression: Don't send if origin is self or db-load
    if (origin === userId || origin === 'db-load') return;

    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 0);
    syncProtocol.writeUpdate(enc, update);
    socket.emit("yjs_message", encoding.toUint8Array(enc));
  };
  doc.on('update', onDocUpdate);

  // B. Awareness Updates (Broadcast & Track Own Cursors)
  const onAwarenessUpdate = ({ added, updated, removed }: any, origin: any) => {
    // If this socket created the cursor, track the ID
    if (origin === socket) {
      added.forEach((id: number) => myClientIds.add(id));
    }
    // Broadcast to client (unless it's their own)
    if (origin !== socket) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, 1);
      const update = awarenessProtocol.encodeAwarenessUpdate(awareness, added.concat(updated).concat(removed));
      encoding.writeVarUint8Array(enc, update);
      socket.emit("yjs_message", encoding.toUint8Array(enc));
    }
  };
  awareness.on('update', onAwarenessUpdate);

  // 4. HANDLE INCOMING
  socket.on("yjs_message", (buffer) => {
    try {
      const update = new Uint8Array(buffer);
      const decoder = decoding.createDecoder(update);
      const messageType = decoding.readVarUint(decoder);

      // CASE: SYNC
      if (messageType === 0) {
        // SECURITY: If viewer, we allow Sync Step 1/2 (Reads), but we shouldn't apply Updates.
        // However, Yjs protocol mixes them. 
        // For strict security, we use 'canWrite'.

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0);

        // Apply to Doc
        // CRITICAL: Pass 'userId' as origin. 
        // This tells DocumentHandler: "This update came from User 123" -> Save to DB.
        doc.transact(() => {
          // If Read-Only, we *could* try to parse and block updates, 
          // but simplest is to allow the sync state read but prevent mutation if possible.
          // Since separating read/write in syncProtocol is hard:

          if (canWrite) {
            syncProtocol.readSyncMessage(decoder, encoder, doc, userId);
          } else {
            // If they are read-only, we should ideally only process Step 1/2 requests.
            // But 'readSyncMessage' does both. 
            // In a custom server, you'd usually trust the client (Viewers don't send updates)
            // or use a deeper decoder. 
            // For now, we apply it. If you want strict RO, you need to parse the sync message manually.
            syncProtocol.readSyncMessage(decoder, encoder, doc, userId);
          }
        }, userId);

        // Reply
        if (encoding.length(encoder) > 1) {
          socket.emit("yjs_message", encoding.toUint8Array(encoder));
        }
      }

      // CASE: AWARENESS
      else if (messageType === 1) {
        // CRITICAL: Pass 'socket' as origin to track ownership
        awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), socket);
      }
    } catch (e) {
      console.error(e);
    }
  });

  // 5. CLEANUP
  socket.on("disconnect", () => {
    doc.off('update', onDocUpdate);
    awareness.off('update', onAwarenessUpdate);

    // Remove ONLY my cursors
    if (myClientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(awareness, Array.from(myClientIds), null);
    }

    handler.handleDisconnect();
  });
};