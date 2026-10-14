// Adds a sign-up from thedock.life to the Guest List table in Airtable.
// If the email is already on the list, it merges the new interests instead of adding a second row.
const BASE = 'appQSH0Qni0DmPSA1';
const TABLE = 'tbloPQRWIlXwTuyJc'; // Guest List
const API = `https://api.airtable.com/v0/${BASE}/${TABLE}`;
const INTERESTS = ['Suppers on the water', 'Days on the water', 'Gatherings on land', 'Things to take home'];

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

  // Bots fill the hidden field; tell them it worked and save nothing.
  if (clean(data.website, 200)) return json({ ok: true });

  const email = clean(data.email, 200).toLowerCase();
  const first = clean(data.firstName, 100);
  if (!first) return json({ error: 'name required' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'email required' }, 400);
  const interests = Array.isArray(data.interests) ? INTERESTS.filter((i) => data.interests.includes(i)) : [];
  const source = clean(data.source, 60).toLowerCase().replace(/[^a-z0-9_.-]/g, '');

  const auth = { authorization: `Bearer ${env.AIRTABLE_TOKEN.trim()}` };
  const formula = encodeURIComponent(`LOWER({Email})='${email.replace(/'/g, "\\'")}'`);
  const found = await fetch(`${API}?maxRecords=1&filterByFormula=${formula}`, { headers: auth });
  if (!found.ok) return json({ error: 'lookup failed', airtableStatus: found.status }, 502);
  const existing = (await found.json()).records[0];

  if (existing) {
    const had = existing.fields.Interests || [];
    const fields = { Interests: [...new Set([...had, ...interests])] };
    if (!existing.fields['First name']) fields['First name'] = first;
    if (!existing.fields['Last name'] && clean(data.lastName, 100)) fields['Last name'] = clean(data.lastName, 100);
    const saved = await fetch(`${API}/${existing.id}`, {
      method: 'PATCH',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (!saved.ok) return json({ error: 'save failed' }, 502);
    return json({ ok: true });
  }

  const fields = {
    Email: email,
    'First name': first,
    'Last name': clean(data.lastName, 100),
    Interests: interests,
    'Signed up at': new Date().toISOString(),
    Source: source,
  };
  const saved = await fetch(API, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ records: [{ fields }] }),
  });
  if (!saved.ok) return json({ error: 'save failed', airtableStatus: saved.status }, 502);
  return json({ ok: true });
}
