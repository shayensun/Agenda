# 2026 Agenda Calendar

A lightweight planner-style calendar for 2026 that now runs in this environment with **zero npm dependencies** so the preview can actually start.

## Features

- 2026 monthly calendar with Monday-first layout
- Daily agenda form with start-time dropdown and duration in hours
- Edit and delete agenda items
- Monthly agenda list and search
- Rough-to-precise location search through `/api/location-search`
- Optional reminder emails sent 30 minutes before an event starts
- `localStorage` persistence

## Run locally

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Email reminders

Reminder emails are sent through `/api/reminders`. Configure these environment variables if you want actual email delivery:

```bash
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

Notes:

- the browser tab must stay open because reminders are checked from the client every minute
- the agenda item must include a start time and reminder email
- without SMTP configuration, the UI still runs but reminder delivery returns a clear error message
- this zero-dependency server supports direct TLS SMTP (`465`) and plain SMTP auth; if your provider requires STARTTLS on `587`, use a compatible SMTP relay or set up a TLS-enabled endpoint

## Location search

Type at least 3 characters in the Location field. The app calls `/api/location-search`, which first tries OpenStreetMap Nominatim and falls back to a built-in travel/location catalog when upstream access is blocked, so suggestions still appear in preview.
