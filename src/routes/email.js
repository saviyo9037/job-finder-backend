import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { buildEmailPreview, sendEmail } from '../services/emailService.js';

const router = Router();
router.use(authMiddleware);

router.post('/preview', async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ message: 'jobId required' });
    const preview = await buildEmailPreview(jobId, req.user.id);
    res.json(preview);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/send', async (req, res) => {
  try {
    const { jobId, to, subject, body } = req.body;
    if (!jobId) return res.status(400).json({ message: 'jobId required' });
    const result = await sendEmail(jobId, req.user.id, { to, subject, body });
    res.json({ message: 'Email sent', ...result });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
