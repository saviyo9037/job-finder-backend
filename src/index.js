import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import { startCron } from './cron.js';
import authRoutes from './routes/auth.js';
import jobRoutes from './routes/jobs.js';
import emailRoutes from './routes/email.js';
import settingsRoutes from './routes/settings.js';
import { ensureAdmin } from './utils/ensureAdmin.js';
import { runJobFetch } from './services/jobService.js';
import Job from './models/Job.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

async function start() {
  await connectDB();
  await ensureAdmin();
  startCron();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Auto-fetch MERN jobs on startup if DB is empty or last fetch > 6 hours
  setTimeout(async () => {
    try {
      const count = await Job.countDocuments();
      const settings = await import('./models/Settings.js').then((m) => m.default.findOne());
      const sixHoursAgo = Date.now() - 6 * 60 * 60 * 1000;
      const stale = !settings?.lastFetchedAt || new Date(settings.lastFetchedAt).getTime() < sixHoursAgo;
      if (count === 0 || stale) {
        console.log('[startup] Auto-fetching MERN jobs for South India...');
        await runJobFetch('startup');
      }
    } catch (err) {
      console.error('[startup] Auto-fetch failed:', err.message);
    }
  }, 3000);
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
