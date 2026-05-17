import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Settings from '../models/Settings.js';

export async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'saviyogeorge903734@gmail.com').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.warn('ADMIN_PASSWORD not set in .env — admin login will not work');
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({
      email,
      password: hash,
      name: 'Saviyo George',
      role: 'admin',
    });
    console.log('Admin user created');
  } else {
    // Keep password in sync with .env (single-user personal app)
    user.password = hash;
    user.email = email;
    await user.save();
  }

  await Settings.findOneAndUpdate({ userId: user._id }, {}, { upsert: true });
}
