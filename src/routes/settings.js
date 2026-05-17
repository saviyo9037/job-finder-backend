import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import Settings from '../models/Settings.js';
import User from '../models/User.js';

const router = Router();
router.use(authMiddleware);

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.pdf';
    cb(null, `resume-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF, DOC, DOCX allowed'));
  },
});

router.get('/profile', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    const settings = await Settings.findOne({ userId: req.user.id }).lean();
    res.json({
      user,
      settings: {
        coverLetter: settings?.coverLetter || '',
        resumeFilename: settings?.resumeFilename || null,
        hasResume: Boolean(settings?.resumePath),
        lastFetchedAt: settings?.lastFetchedAt || null,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/cover-letter', async (req, res) => {
  try {
    const { coverLetter } = req.body;
    const settings = await Settings.findOneAndUpdate(
      { userId: req.user.id },
      { coverLetter },
      { upsert: true, new: true }
    );
    res.json(settings);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/resume', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Resume file required' });

    const existing = await Settings.findOne({ userId: req.user.id });
    if (existing?.resumePath && fs.existsSync(existing.resumePath)) {
      fs.unlinkSync(existing.resumePath);
    }

    const settings = await Settings.findOneAndUpdate(
      { userId: req.user.id },
      {
        resumePath: req.file.path,
        resumeFilename: req.file.originalname,
      },
      { upsert: true, new: true }
    );

    res.json({
      message: 'Resume uploaded',
      resumeFilename: settings.resumeFilename,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
