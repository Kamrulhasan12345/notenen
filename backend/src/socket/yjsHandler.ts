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
  const doc = new DocumentHandler(noteId, (id: string) => docs.delete(id));
  await doc.load();
  docs.set(noteId, doc);
  doc.handleConnect();
  return doc;
};

export const handleYjsSync = async (socket: Socket, noteId: string, canWrite: boolean) => {
  const handler = await getOrCreateDoc(noteId);
  const doc = handler.doc;
  const awareness = handler.awareness;
  const userId = socket.data.user._id.toString();

  const myClientIds = new Set<number>();

  // Send Sync Step 1
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0);
  syncProtocol.writeSyncStep1(encoder, doc);
  socket.emit("yjs_message", encoding.toUint8Array(encoder));

  const states = awareness.getStates();
  if (states.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, 1); // Message Type 1: Awareness

    // Get ALL client IDs currently in the map
    const clients = Array.from(states.keys());

    // Encode the state of all these clients
    const buff = awarenessProtocol.encodeAwarenessUpdate(awareness, clients);

    encoding.writeVarUint8Array(awarenessEncoder, buff);
    socket.emit("yjs_message", encoding.toUint8Array(awarenessEncoder));
  }


  // ==================================================
  // 1. DOC UPDATE HANDLER
  // ==================================================
  const onDocUpdate = (update: Uint8Array, origin: any) => {
    // Check SOCKET ID to suppress echo
    if (origin && origin.socketId === socket.id) return;
    if (origin === 'db-load') return;

    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 0);
    syncProtocol.writeUpdate(enc, update);
    socket.emit("yjs_message", encoding.toUint8Array(enc));
  };
  doc.on('update', onDocUpdate);

  // ==================================================
  // 2. AWARENESS HANDLER (Fixed)
  // ==================================================
  const onAwarenessUpdate = ({ added, updated, removed }: any, origin: any) => {
  // Track this socket's client IDs
  if (origin === socket) {
    added.forEach((id: number) => myClientIds.add(id));
  }

  // Broadcast awareness changes to OTHER clients in the room
  const changedClients = added.concat(updated).concat(removed);
  if (changedClients.length > 0) {
    const enc = encoding.createEncoder();
    encoding. writeVarUint(enc, 1);
    const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
    encoding.writeVarUint8Array(enc, update);
    
    // Broadcast to all OTHER sockets in the room
    socket.broadcast.to(noteId).emit("yjs_message", encoding.toUint8Array(enc));
  }
};
  awareness.on('update', onAwarenessUpdate);

  // ==================================================
  // 3. INCOMING MESSAGE HANDLER
  // ==================================================
  socket.on("yjs_message", (buffer) => {
    try {
      const update = new Uint8Array(buffer);
      const decoder = decoding.createDecoder(update);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === 0) { // Sync
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0);

        const origin = { userId, socketId: socket.id };

        doc.transact(() => {
          if (canWrite) {
            syncProtocol.readSyncMessage(decoder, encoder, doc, origin);
          } else {
            syncProtocol.readSyncMessage(decoder, encoder, doc, origin);
          }
        }, origin);

        if (encoding.length(encoder) > 1) {
          socket.emit("yjs_message", encoding.toUint8Array(encoder));
        }
      }
      else if (messageType === 1) { // Awareness
        awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), socket);
      }
    } catch (e) { console.error(e); }
  });

  socket.on("disconnect", () => {
    console.log(`[${noteId} ${userId}] closer to my death ig`)

    doc.off('update', onDocUpdate);
    awareness.off('update', onAwarenessUpdate);
    if (myClientIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(awareness, Array.from(myClientIds), null);
    }
    handler.handleDisconnect();

    console.log(`[${noteId} ${userId}] dead xd`)
  });
};
