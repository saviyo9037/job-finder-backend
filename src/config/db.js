import dns from 'dns';
import mongoose from 'mongoose';

dns.setDefaultResultOrder('ipv4first');

export async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGO_URI is not set.');
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000,
    });

    console.log('MongoDB connected:', mongoose.connection.name);
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    console.error(err);
    throw err;
  }
}