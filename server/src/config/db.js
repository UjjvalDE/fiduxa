import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI);

    console.log("-----------------------------------");
    console.log("       MONGODB CONNECTED");
    console.log("-----------------------------------");
    console.log(`Database: ${connection.connection.name}`);
    console.log(`Host: ${connection.connection.host}`);
    console.log("-----------------------------------");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

export default connectDB;
