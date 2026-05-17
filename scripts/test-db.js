import dotenv from 'dotenv';
import dns from 'dns';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const uri = process.env.MONGO_URI;
if (!uri) {
  console.error('MONGO_URI missing in server/.env');
  process.exit(1);
}

console.log('Connecting...');
await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
await mongoose.connection.db.collection('_ping').insertOne({ test: true });
console.log('OK — connected and write succeeded:', mongoose.connection.host);
await mongoose.disconnect();
