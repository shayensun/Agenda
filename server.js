const http = require('http');
const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const FALLBACK_LOCATIONS = [
  { displayName: 'Shanghai Hongqiao International Airport, Shanghai, China', subtitle: 'airport · Shanghai · China', lat: '31.1979', lon: '121.3363' },
  { displayName: 'Shanghai Pudong International Airport, Shanghai, China', subtitle: 'airport · Shanghai · China', lat: '31.1443', lon: '121.8083' },
  { displayName: 'The Bund, Huangpu, Shanghai, China', subtitle: 'landmark · Shanghai · China', lat: '31.2400', lon: '121.4900' },
  { displayName: 'Beijing Capital International Airport, Beijing, China', subtitle: 'airport · Beijing · China', lat: '40.0799', lon: '116.6031' },
  { displayName: 'Tokyo Station, Tokyo, Japan', subtitle: 'station · Tokyo · Japan', lat: '35.6812', lon: '139.7671' },
  { displayName: 'San Francisco International Airport, California, United States', subtitle: 'airport · California · United States', lat: '37.6213', lon: '-122.3790' },
  { displayName: 'JFK Airport, New York, United States', subtitle: 'airport · New York · United States', lat: '40.6413', lon: '-73.7781' },
  { displayName: 'Paris Charles de Gaulle Airport, Paris, France', subtitle: 'airport · Paris · France', lat: '49.0097', lon: '2.5479' }
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error('Request body too large.'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(data));
    request.on('error', reject);
  });
}

function parseSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '0');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  if (!host || !port || !user || !pass || !from) {
    return null;
  }
  return {
    host,
    port,
    user,
    pass,
    from,
    secure: port === 465 || process.env.SMTP_SECURE === 'true',
  };
}

function encodeBase64(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function escapeHeader(value) {
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

function buildEmailText(payload) {
  return [
    `Your agenda item "${payload.title}" is coming up in 30 minutes.`,
    `Date: ${payload.date}`,
    `Start time: ${payload.startTime}`,
    payload.durationHours ? `Duration: ${payload.durationHours} hour(s)` : '',
    payload.location ? `Location: ${payload.location}` : '',
    payload.description ? `Notes: ${payload.description}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function sendCommand(connection, command, expectedCodes) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const expected = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];

    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) {
        return;
      }
      const lastLine = lines[lines.length - 1];
      if (!/^\d{3}[ -]/.test(lastLine) || lastLine[3] === '-') {
        return;
      }

      cleanup();
      const code = Number(lastLine.slice(0, 3));
      if (!expected.includes(code)) {
        reject(new Error(`SMTP command failed (${code}): ${lastLine}`));
        return;
      }
      resolve(lines.join('\n'));
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      connection.off('data', onData);
      connection.off('error', onError);
      connection.off('close', onClose);
    };

    const onClose = () => {
      cleanup();
      reject(new Error('SMTP connection closed unexpectedly.'));
    };

    connection.on('data', onData);
    connection.on('error', onError);
    connection.on('close', onClose);

    if (command) {
      connection.write(`${command}\r\n`);
    }
  });
}

function createConnection(config) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host }, () => resolve(socket))
      : net.createConnection({ host: config.host, port: config.port }, () => resolve(socket));
    socket.once('error', onError);
    socket.once('connect', () => socket.off('error', onError));
    socket.setEncoding('utf8');
  });
}

async function sendReminderEmail(payload) {
  const config = parseSmtpConfig();
  if (!config) {
    throw new Error('Reminder email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.');
  }

  const connection = await createConnection(config);
  const hostname = 'agenda.local';

  try {
    await sendCommand(connection, '', 220);
    await sendCommand(connection, `EHLO ${hostname}`, 250);
    await sendCommand(connection, 'AUTH LOGIN', 334);
    await sendCommand(connection, encodeBase64(config.user), 334);
    await sendCommand(connection, encodeBase64(config.pass), 235);
    await sendCommand(connection, `MAIL FROM:<${escapeHeader(config.from)}>`, 250);
    await sendCommand(connection, `RCPT TO:<${escapeHeader(payload.reminderEmail)}>`, [250, 251]);
    await sendCommand(connection, 'DATA', 354);

    const subject = `Reminder: ${escapeHeader(payload.title)} starts in 30 minutes`;
    const message = [
      `From: ${escapeHeader(config.from)}`,
      `To: ${escapeHeader(payload.reminderEmail)}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      buildEmailText(payload).replace(/\n/g, '\r\n'),
      '.',
    ].join('\r\n');

    await sendCommand(connection, message, 250);
    await sendCommand(connection, 'QUIT', 221);
  } finally {
    connection.end();
  }
}

function getFallbackSuggestions(query) {
  const search = query.toLowerCase();
  return FALLBACK_LOCATIONS.filter((item) =>
    [item.displayName, item.subtitle].filter(Boolean).some((value) => value.toLowerCase().includes(search))
  ).slice(0, 5);
}

async function handleLocationSearch(request, response, url) {
  const query = (url.searchParams.get('q') || '').trim();
  if (query.length < 3) {
    return json(response, 200, { suggestions: [] });
  }

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '5',
  });

  try {
    const upstream = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AgendaCalendar/1.0 (location search proxy)',
        'Accept-Language': 'en-US,en;q=0.8',
      },
    });

    if (!upstream.ok) {
      throw new Error('Location search failed.');
    }

    const results = await upstream.json();
    const suggestions = results.map((result) => ({
      displayName: result.display_name,
      lat: result.lat,
      lon: result.lon,
      subtitle: [result.type, result.address?.city, result.address?.state, result.address?.country].filter(Boolean).join(' · '),
    }));

    if (suggestions.length > 0) {
      return json(response, 200, { suggestions, source: 'nominatim' });
    }
  } catch (error) {
    // Fall through to the local fallback catalog below.
  }

  return json(response, 200, { suggestions: getFallbackSuggestions(query), source: 'fallback' });
}

async function handleReminder(request, response) {
  let body;
  try {
    body = JSON.parse((await readBody(request)) || '{}');
  } catch {
    return json(response, 400, { error: 'Invalid JSON body.' });
  }

  if (!body.reminderEmail || !body.title || !body.date || !body.startTime) {
    return json(response, 400, { error: 'Missing reminder email, title, date, or start time.' });
  }

  try {
    await sendReminderEmail(body);
    return json(response, 200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send reminder email.';
    const status = message.includes('not configured') ? 503 : 502;
    return json(response, status, { error: message });
  }
}

function serveStatic(response, pathname) {
  const resolved = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.normalize(resolved).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
    });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (request.method === 'GET' && url.pathname === '/api/location-search') {
      await handleLocationSearch(request, response, url);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/reminders') {
      await handleReminder(request, response);
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Method not allowed');
      return;
    }

    serveStatic(response, url.pathname);
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error.' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Agenda app running at http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`);
});
