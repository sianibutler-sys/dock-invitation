// Looks up one guest by their personal code and returns only what the page needs.
const BASE = 'appQSH0Qni0DmPSA1';
const TABLE = 'Guests';
const API = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function onRequestGet({ request, env, waitUntil }) {
  if (!env.AIRTABLE_TOKEN) return json({ error: 'not configured' }, 503);

  const code = (new URL(request.url).searchParams.get('code') || '').toLowerCase();
  if (!/^[a-z0-9]{8}$/.test(code)) return json({ error: 'not found' }, 404);

  const auth = { authorization: `Bearer ${env.AIRTABLE_TOKEN}` };
  const formula = encodeURIComponent(`LOWER(RIGHT(RECORD_ID(),8))='${code}'`);
  const res = await fetch(`${API}?maxRecords=1&filterByFormula=${formula}`, { headers: auth });
  if (!res.ok) return json({ error: 'lookup failed' }, 502);

  const record = (await res.json()).records[0];
  if (!record) return json({ error: 'not found' }, 404);

  const f = record.fields;
  if (f['Invite status'] !== 'Opened') {
    waitUntil(
      fetch(`${API}/${record.id}`, {
        method: 'PATCH',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ fields: { 'Invite status': 'Opened' } }),
      })
    );
  }

  return json({
    firstName: f['First name'] || '',
    fullName: f['Full name'] || '',
    plusOne: f['Plus one allowed'] === true,
    rsvp: f['RSVP'] === 'Yes' || f['RSVP'] === 'No' ? f['RSVP'] : '',
  });
}
