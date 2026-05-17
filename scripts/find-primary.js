import dns from 'dns';
import mongoose from 'mongoose';

dns.setDefaultResultOrder('ipv4first');

const cred = process.env.MONGO_USER || 'saviyogeorge123_db_user';
const pass = process.env.MONGO_PASS || process.env.MONGO_PASSWORD;
const base = '8urtpuc.mongodb.net';
const hosts = [
  'ac-65shqmx-shard-00-00',
  'ac-65shqmx-shard-00-01',
  'ac-65shqmx-shard-00-02',
];

if (!pass) {
  console.error('Set MONGO_PASS env var or edit this script');
  process.exit(1);
}

for (const h of hosts) {
  const uri = `mongodb://${cred}:${pass}@${h}.${base}:27017/job-tracker?ssl=true&authSource=admin&directConnection=true`;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    await mongoose.connection.db.collection('_ping').insertOne({ t: Date.now() });
    console.log('PRIMARY host:', h);
    console.log('\nUse in server/.env:');
    console.log(`MONGO_URI=${uri}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.log(h, '->', e.message.split('\n')[0]);
    await mongoose.disconnect().catch(() => {});
  }
}
console.error('No primary found on any shard');
process.exit(1);
