import mongoose from 'mongoose';

export const JOB_STATUSES = ['New', 'Saved', 'Applied', 'Rejected', 'Interview', 'Offer'];

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    company: { type: String, required: true },
    location: { type: String, default: 'Remote' },
    experience: { type: String, default: 'Fresher' },
    jobType: { type: String, enum: ['Remote', 'Hybrid', 'Onsite'], default: 'Remote' },
    source: { type: String, required: true },
    postedDate: { type: Date },
    applyLink: { type: String },
    description: { type: String, default: '' },
    recruiterEmail: { type: String },
    status: { type: String, enum: JOB_STATUSES, default: 'New' },
    saved: { type: Boolean, default: false },
    externalId: { type: String, required: true },
    roleTag: { type: String },
  },
  { timestamps: true }
);

jobSchema.index({ externalId: 1 }, { unique: true });
jobSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Job', jobSchema);
