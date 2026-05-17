import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { runJobFetch } from '../src/services/jobService.js';
dotenv.config({ path: '../.env' });

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/job-tracker');
    console.log('Connected to DB. Running fetch...');
    const result = await runJobFetch('manual');
    console.log('Fetch complete:', result);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
