import nodemailer from 'nodemailer';
import { NextResponse } from 'next/server';

type ReminderPayload = {
  title?: string;
  date?: string;
  startTime?: string;
  durationHours?: number;
  location?: string;
  description?: string;
  reminderEmail?: string;
};

function isConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM,
  );
}

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      {
        error: 'Reminder email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.',
      },
      { status: 503 },
    );
  }

  const body = (await request.json()) as ReminderPayload;
  if (!body.reminderEmail || !body.title || !body.date || !body.startTime) {
    return NextResponse.json({ error: 'Missing reminder email, title, date, or start time.' }, { status: 400 });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const durationLine = body.durationHours ? `Duration: ${body.durationHours} hour(s)` : null;
  const locationLine = body.location ? `Location: ${body.location}` : null;
  const descriptionLine = body.description ? `Notes: ${body.description}` : null;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: body.reminderEmail,
    subject: `Reminder: ${body.title} starts in 30 minutes`,
    text: [
      `Your agenda item "${body.title}" is coming up in 30 minutes.`,
      `Date: ${body.date}`,
      `Start time: ${body.startTime}`,
      durationLine,
      locationLine,
      descriptionLine,
    ]
      .filter(Boolean)
      .join('\n'),
  });

  return NextResponse.json({ ok: true });
}
