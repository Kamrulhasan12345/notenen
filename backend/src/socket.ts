import { Server as HttpServer } from "http";
import { userInfo } from "os";
import { Server, Socket } from "socket.io";
import { env } from "./config/env.js";
import jwt from 'jsonwebtoken'
import UserModel from "./models/user.model.js";
import { handleYjsSync } from "./socket/yjsHandler.js";
import { NoteModel } from "./models/note.model.js";
import { checkPermission } from "./services/note.service.js";
import { yo } from "zod/locales";

let io: Server

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  })

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) return next(new Error('Authentication error: Token missing'));

      const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string };
      const user = await UserModel.findById(payload.sub).select("_id name email");

      if (!user) return next(new Error('Authentication error: User not found'));

      socket.data.user = user;
      next();

    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    console.log(`User connected: ${user.name} (${user._id}) - Socket ID: ${socket.id}`);

    socket.on('ping', (data) => {
      console.log("Received ping:", data);
      socket.emit('pong', { message: "Hello from Server!", serverTime: new Date() })
    })

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${user.name}`);
      // then remove him from the room and check if everybody in the room is gone to clean up yjs document
    })

    socket.on("join_note", async ({ noteId }) => {
      try {
        const note = await NoteModel.findById(noteId);
        if (!note) return socket.emit("error", "Note not found");

        const userId = socket.data.user._id.toString();
        if (!checkPermission(note, userId, 'read')) {
          return socket.emit("error", "Access Denied");
        }

        // Check Write Access
        const canWrite = checkPermission(note, userId, 'write'); // Assuming your service has this

        socket.join(noteId);
        await handleYjsSync(socket, noteId, canWrite);

        socket.emit("note_joined", { noteId });
        console.log(`User ${userId} joined note ${noteId}`)
      } catch (e) {
        console.error("Error joining note:", e);
        socket.emit("error", "Join failed")
      }
    })
  })
  return io;
}

export const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}