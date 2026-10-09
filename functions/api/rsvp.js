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
  if (!/^[a-z0-9]{8}$/.test(code)) return json({ error: 'not found' }, 404);

  const attending = data.attending === true;
  const email = clean(data.email, 200);
  const phone = clean(data.phone, 40);
  const allergies = clean(data.allergies, 2000);
  const potluck = clean(data.potluck, 2000);
  const keep = !attending && data.keep === true;
  if (attending && !email && !phone) return json({ error: 'contact required' }, 400);
  if (keep && !email) return json({ error: 'email required' }, 400);
  if (attending && !allergies) return json({ error: 'allergies required' }, 400);
  if (attending && data.release !== true) return json({ error: 'release required' }, 400);

  const auth = { authorization: `Bearer ${env.AIRTABLE_TOKEN.trim()}` };
  const formula = encodeURIComponent(`LOWER(RIGHT(RECORD_ID(),8))='${code}'`);
  const found = await fetch(`${API}?maxRecords=1&filterByFormula=${formula}`, { headers: auth });
  if (!found.ok) return json({ error: 'lookup failed', airtableStatus: found.status }, 502);
  const record = (await found.json()).records[0];
  if (!record) return json({ error: 'not found' }, 404);

  const fields = {
    RSVP: attending ? 'Yes' : 'No',
    'Allergies and dietary restrictions': attending ? allergies : '',
    'Favorite thing to eat by the water': attending ? potluck : '',
    'Keep on guest list': keep,
    'Guest note': clean(data.note, 2000),
    'Replied at': new Date().toISOString(),
  };
  if (attending) fields['Photo release'] = true;
  if (attending && record.fields['Plus one allowed'] === true) {
    const bringing = data.plusOne === true;
    fields['Bringing a plus one'] = bringing;
    fields['Plus one first name'] = bringing ? clean(data.plusFirst, 100) : '';
    fields['Plus one last name'] = bringing ? clean(data.plusLast, 100) : '';
    fields['Plus one allergies'] = bringing ? clean(data.plusAllergies, 2000) : '';
    fields['Plus one email'] = bringing ? clean(data.plusEmail, 200) : '';
    fields['Plus one mobile'] = bringing ? clean(data.plusPhone, 40) : '';
  }
  const first = clean(data.firstName, 100);
  const last = clean(data.lastName, 100);
  const suffix = clean(data.suffix, 20);
  if (first) fields['First name'] = first;
  if (last) fields['Last name'] = last;
  fields.Suffix = suffix;
  if (first && last) fields['Full name'] = [first, last, suffix].filter(Boolean).join(' ');
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
