import { Router } from 'express';
import Job, { JOB_STATUSES } from '../models/Job.js';
import { authMiddleware } from '../middleware/auth.js';
import { runJobFetch, getDashboardStats, getFetchLogs } from '../services/jobService.js';
import { getMernTitleRegex, getTargetLocationRegex } from '../utils/filters.js';

const router = Router();
router.use(authMiddleware);

router.get('/fetch-logs', async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);
    const logs = await getFetchLogs(limit);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/stats', async (_req, res) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const {
      status,
      saved,
      search,
      location,
      jobType,
      source,
      preset,
      page = '1',
      limit = '50',
    } = req.query;

    const filter = {};
    const and = [];

    if (status) filter.status = status;
    if (saved === 'true') filter.saved = true;
    if (location) filter.location = new RegExp(location, 'i');
    if (jobType) filter.jobType = jobType;
    if (source) filter.source = source;

    if (preset === 'mern-india' || preset === 'uiux-india' || preset === 'default') {
      const locRx = new RegExp(getTargetLocationRegex(), 'i');
      let roleRx;
      if (preset === 'uiux-india') {
        roleRx = new RegExp('ui/ux|designer|ui |ux ', 'i');
      } else if (preset === 'mern-india') {
        roleRx = new RegExp('mern|react|node|full[\\s-]?stack|front[\\s-]?end|back[\\s-]?end|mongodb|express|javascript', 'i');
      } else {
        roleRx = new RegExp(getMernTitleRegex(), 'i');
      }

      and.push({
        $and: [
          {
            $or: [
              { location: locRx },
              { description: locRx },
            ],
          },
          {
            $or: [
              { title: roleRx },
              { description: roleRx },
              { roleTag: roleRx },
            ],
          },
        ],
      });
    }

    if (search) {
      and.push({
        $or: [
          { title: new RegExp(search, 'i') },
          { company: new RegExp(search, 'i') },
          { description: new RegExp(search, 'i') },
        ],
      });
    }

    if (and.length === 1) Object.assign(filter, and[0]);
    else if (and.length > 1) filter.$and = and;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [jobs, total] = await Promise.all([
      Job.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum).lean(),
      Job.countDocuments(filter),
    ]);

    res.json({ jobs, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/manual', async (req, res) => {
  try {
    const { title, company, location, source, applyLink, description, roleTag } = req.body;
    
    if (!title || !company || !source || !applyLink) {
      return res.status(400).json({ message: 'Title, company, source, and applyLink are required.' });
    }

    const job = new Job({
      title,
      company,
      location: location || 'Remote',
      source,
      applyLink,
      description: description || '',
      roleTag: roleTag || title,
      status: 'New',
      saved: false,
      postedDate: new Date(),
      externalId: `manual:${Date.now()}`
    });

    await job.save();
    res.status(201).json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/fetch-now', async (_req, res) => {
  try {
    const result = await runJobFetch('manual');
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!JOB_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${JOB_STATUSES.join(', ')}` });
    }
    const job = await Job.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.patch('/:id/save', async (req, res) => {
  try {
    const { saved } = req.body;
    const updates = { saved: Boolean(saved) };
    if (saved) updates.status = 'Saved';
    const job = await Job.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json(job);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const job = await Job.findByIdAndDelete(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json({ message: 'Job deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
