import cron from 'node-cron';
import { runJobFetch } from './services/jobService.js';

export function startCron() {
  cron.schedule('0 */6 * * *', async () => {
    console.log('[cron] Running scheduled job fetch...');
    try {
      await runJobFetch('cron');
    } catch (err) {
      console.error('[cron] Fetch failed:', err.message);
    }
  });
  console.log('Cron scheduled: every 6 hours');
}
