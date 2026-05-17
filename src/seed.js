import dotenv from 'dotenv';
import dns from 'dns';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

import bcrypt from 'bcryptjs';
import { connectDB } from './config/db.js';
import User from './models/User.js';
import Settings from './models/Settings.js';

async function seed() {
  await connectDB();

  const usersToSeed = [
    {
      email: (process.env.ADMIN_EMAIL || 'saviyogeorge903734@gmail.com').toLowerCase(),
      password: process.env.ADMIN_PASSWORD || 'admin123',
      name: 'Saviyo George',
    },
    {
      email: 'sebing403@gmail.com',
      password: process.env.ADMIN_PASSWORD || 'admin123',
      name: 'Sebin G',
    }
  ];

  for (const u of usersToSeed) {
    const hash = await bcrypt.hash(u.password, 10);
    let user = await User.findOne({ email: u.email });
    if (!user) {
      user = await User.create({
        email: u.email,
        password: hash,
        name: u.name,
        role: 'admin',
      });
      console.log(`Admin user created: ${u.email}`);
    } else {
      user.password = hash;
      await user.save();
      console.log(`Admin password reset for: ${u.email}`);
    }

    await Settings.findOneAndUpdate(
      { userId: user._id },
      {},
      { upsert: true }
    );
  }

  console.log('Seed complete');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
