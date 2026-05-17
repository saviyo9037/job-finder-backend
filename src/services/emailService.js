import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import Job from '../models/Job.js';
import Settings from '../models/Settings.js';
import User from '../models/User.js';

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function buildEmailPreview(jobId, userId) {
  const job = await Job.findById(jobId);
  if (!job) throw new Error('Job not found');
  if (!job.recruiterEmail) throw new Error('No recruiter email on this job');

  const settings = await Settings.findOne({ userId });
  const user = await User.findById(userId);
  const name = user?.name || 'Saviyo George';

  const subject = `Application for ${job.title} - ${name}`;
  const body = (settings?.coverLetter || '').replace(
    /\[Job Title\]/gi,
    job.title
  ).replace(/\[Company\]/gi, job.company);

  const attachments = [];
  if (settings?.resumePath && fs.existsSync(settings.resumePath)) {
    attachments.push({
      filename: settings.resumeFilename || 'resume.pdf',
      path: settings.resumePath,
    });
  }

  return {
    to: job.recruiterEmail,
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    subject,
    body,
    attachments: attachments.map((a) => ({ filename: a.filename })),
    job: { id: job._id, title: job.title, company: job.company },
    hasResume: attachments.length > 0,
  };
}

export async function sendEmail(jobId, userId, { to, subject, body } = {}) {
  const preview = await buildEmailPreview(jobId, userId);
  const settings = await Settings.findOne({ userId });

  const mailOptions = {
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: to || preview.to,
    subject: subject || preview.subject,
    text: body || preview.body,
    attachments: [],
  };

  if (settings?.resumePath && fs.existsSync(settings.resumePath)) {
    mailOptions.attachments.push({
      filename: settings.resumeFilename || 'resume.pdf',
      path: settings.resumePath,
    });
  }

  const transporter = getTransporter();
  const info = await transporter.sendMail(mailOptions);

  await Job.findByIdAndUpdate(jobId, { status: 'Applied' });

  return { messageId: info.messageId, accepted: info.accepted };
}
