import mongoose from "mongoose";

export const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGO_URI
    if (!mongoURI) {
      throw new Error("MONGO_URI is not defined in environment variables");
    }
    await mongoose.connect(mongoURI);
    console.log("[MONGODB]: MongoDB connected");

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log("[MONGODB]: MongoDB connection closed due to app termination");
      process.exit(0);
    });
  } catch (err) {
    throw new Error(`[MONGODB]: MongoDB connection error: ${err}`);
  }
}

export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    console.log("[MONGODB]: MongoDB disconnected");
  } catch (err) {
    throw new Error(`[MONGODB]: MongoDB disconnection error: ${err}`);
  }
}