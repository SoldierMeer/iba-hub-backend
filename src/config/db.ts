import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI as string, {
      family: 4, // THIS IS THE MAGIC FIX: Forces Node to strictly use IPv4
      serverSelectionTimeoutMS: 5000, // Fails fast if there is no connection
    });
    console.log(`🗄️  [Database]: MongoDB Connected: ${conn.connection.host}`);
  } catch (error: any) {
    console.error(`❌ [Database Error]: ${error.message}`);
    // Exit process with failure
    process.exit(1);
  }
};

export default connectDB;