import mongoose from 'mongoose';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/sugarcane_shop');
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}
