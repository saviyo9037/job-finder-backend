import dns from 'dns';
import mongoose from 'mongoose';

// Fixes mongodb+srv DNS issues on some Windows networks
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error(
      'MONGO_URI is not set. Configure MONGO_URI in Render environment variables or in server/.env.'
    );
  }

  const options = { serverSelectionTimeoutMS: 20000 };

  // directConnection to a single host can land on a secondary → "not primary"
  if (uri.includes('directConnection=true')) {
    console.warn(
      'Warning: directConnection=true may cause "not primary" errors. ' +
        'Use mongodb+srv or a full replica-set URI from Atlas instead.'
    );
  }

  await mongoose.connect(uri, options);
  console.log('MongoDB connected:', mongoose.connection.name);
}
