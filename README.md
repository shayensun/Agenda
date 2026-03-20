# 2026 Agenda Calendar

A lightweight planner-style calendar built with Next.js, React, TypeScript, and Tailwind CSS.

## Features

- 2026 monthly calendar with Monday-first layout
- Daily agenda form with start-time dropdown and duration in hours
- Edit and delete agenda items
- Monthly agenda list and search
- Location lookup suggestions powered by an internal Next.js proxy to OpenStreetMap Nominatim
- Optional reminder emails sent 30 minutes before an event starts
- localStorage persistence

## Run locally

```bash
npm install
npm run dev
```

## Email reminders

Reminder emails are sent through `app/api/reminders/route.ts`, so you need to configure SMTP variables before they can work:

```bash
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

Important notes:

- the browser tab must stay open because reminders are checked from the client every minute
- the agenda item must include a start time and reminder email
- the UI shows whether each reminder is armed, sent, or failed so the status is visible in preview
- without SMTP configuration, the UI will still work but reminder delivery will fail gracefully

## Location search

The rough-location search in the form now calls `app/api/location-search/route.ts` first, which makes preview behavior more reliable than calling OpenStreetMap directly from the browser. Type at least 3 characters to see suggested places, then click **Use** to fill the exact match.
