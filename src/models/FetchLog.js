import mongoose from 'mongoose';

const fetchLogSchema = new mongoose.Schema(
  {
    trigger: { type: String, enum: ['cron', 'manual', 'startup'], required: true },
    status: { type: String, enum: ['success', 'failed'], required: true },
    inserted: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    durationMs: { type: Number },
    error: { type: String },
    sources: [{ type: String }],
  },
  { timestamps: true }
);

fetchLogSchema.index({ createdAt: -1 });

export default mongoose.model('FetchLog', fetchLogSchema);
