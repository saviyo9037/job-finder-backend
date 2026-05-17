import Job from '../models/Job.js';
import FetchLog from '../models/FetchLog.js';
import Settings from '../models/Settings.js';
import User from '../models/User.js';
import { fetchAllJobs } from './jobFetchers.js';

export async function upsertJobs(jobs) {
  let inserted = 0;
  let skipped = 0;

  for (const job of jobs) {
    try {
      const result = await Job.updateOne(
        { externalId: job.externalId },
        { $setOnInsert: { ...job, status: 'New', saved: false } },
        { upsert: true }
      );
      if (result.upsertedCount > 0) inserted++;
      else skipped++;
    } catch (err) {
      if (err.code === 11000) skipped++;
      else console.error('Upsert error:', err.message);
    }
  }

  return { inserted, skipped, total: jobs.length };
}

export async function runJobFetch(trigger = 'manual') {
  const started = Date.now();
  console.log(`[${trigger}] Fetching jobs...`);

  try {
    const { jobs, sources } = await fetchAllJobs();
    const stats = await upsertJobs(jobs);
    const durationMs = Date.now() - started;

    const admin = await User.findOne({ role: 'admin' });
    if (admin) {
      await Settings.findOneAndUpdate(
        { userId: admin._id },
        { lastFetchedAt: new Date() },
        { upsert: true }
      );
    }

    await FetchLog.create({
      trigger,
      status: 'success',
      inserted: stats.inserted,
      skipped: stats.skipped,
      total: stats.total,
      durationMs,
      sources,
    });

    console.log(
      `[${trigger}] Done: ${stats.inserted} new, ${stats.skipped} duplicates (${durationMs}ms)`
    );

    return { ...stats, fetchedAt: new Date(), trigger, durationMs, sources };
  } catch (err) {
    const durationMs = Date.now() - started;
    await FetchLog.create({
      trigger,
      status: 'failed',
      durationMs,
      error: err.message,
    });
    console.error(`[${trigger}] Fetch failed:`, err.message);
    throw err;
  }
}

export async function getFetchLogs(limit = 20) {
  return FetchLog.find().sort({ createdAt: -1 }).limit(limit).lean();
}

export async function getDashboardStats() {
  const [total, statusCounts, settings, lastLog] = await Promise.all([
    Job.countDocuments(),
    Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Settings.findOne().lean(),
    FetchLog.findOne().sort({ createdAt: -1 }).lean(),
  ]);

  const byStatus = Object.fromEntries(statusCounts.map((s) => [s._id, s.count]));
  const savedCount = await Job.countDocuments({ saved: true });

  return {
    total,
    new: byStatus.New || 0,
    applied: byStatus.Applied || 0,
    saved: savedCount,
    rejected: byStatus.Rejected || 0,
    interviews: byStatus.Interview || 0,
    offers: byStatus.Offer || 0,
    lastFetchedAt: settings?.lastFetchedAt || lastLog?.createdAt || null,
    lastFetch: lastLog || null,
  };
}
