// Saves one guest's reply onto their own row in Airtable.
const BASE = 'appQSH0Qni0DmPSA1';
const TABLE = 'Guests';
const API = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLE)}`;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const clean = (value, max) => String(value || '').trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  if (!env.AIRTABLE_TOKEN) return json({ error: 'not configured' }, 503);

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'bad request' }, 400);
  }

  const code = clean(data.code, 16).toLowerCase();
  if (!/^[a-z0-9]{4,16}$/.test(code)) return json({ error: 'not found' }, 404);

  const attending = data.attending === true;
  const email = clean(data.email, 200);
  const phone = clean(data.phone, 40);
  const allergies = clean(data.allergies, 2000);
  const potluck = clean(data.potluck, 2000);
  if (!email && !phone) return json({ error: 'contact required' }, 400);
  if (attending && !allergies) return json({ error: 'allergies required' }, 400);

  const auth = { authorization: `Bearer ${env.AIRTABLE_TOKEN}` };
  const formula = encodeURIComponent(`LOWER({Guest code})='${code}'`);
  const found = await fetch(`${API}?maxRecords=1&filterByFormula=${formula}`, { headers: auth });
  if (!found.ok) return json({ error: 'lookup failed' }, 502);
  const record = (await found.json()).records[0];
  if (!record) return json({ error: 'not found' }, 404);

  const fields = {
    RSVP: attending ? 'Yes' : 'No',
    'Allergies and dietary restrictions': allergies,
    'Potluck answer': potluck,
    'Replied at': new Date().toISOString(),
  };
  if (email) fields.Email = email;
  if (phone) fields.Mobile = phone;

  const saved = await fetch(`${API}/${record.id}`, {
    method: 'PATCH',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!saved.ok) return json({ error: 'save failed' }, 502);

  return json({ ok: true });
}
