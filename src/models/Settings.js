import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    resumePath: { type: String },
    resumeFilename: { type: String },
    coverLetter: {
      type: String,
      default: `Dear Hiring Manager,

I am writing to express my interest in the position. I am a MERN stack developer with hands-on experience building web applications using React, Node.js, Express, and MongoDB.

I would welcome the opportunity to discuss how my skills align with your team's needs.

Best regards,
Saviyo George`,
    },
    lastFetchedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.model('Settings', settingsSchema);
