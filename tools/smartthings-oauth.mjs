#!/usr/bin/env node
/*
 * Ayudante OAuth de SmartThings (sólo si quieres cambio de entrada "global").
 * Node 18+. Sin dependencias.
 *
 *   1) node tools/smartthings-oauth.mjs url <clientId> <redirectUri>
 *      → abre la URL, autoriza, y copia el ?code=XXXX del redirect.
 *   2) node tools/smartthings-oauth.mjs token <clientId> <clientSecret> <redirectUri> <code>
 *      → imprime el refresh_token para js/config.js.
 *   3) node tools/smartthings-oauth.mjs devices <accessToken>
 *      → lista tus dispositivos para encontrar el deviceId del televisor.
 */
const [, , cmd, ...a] = process.argv;
const SCOPES = 'r:devices:* x:devices:*';

if (cmd === 'url') {
  const [clientId, redirect] = a;
  const u = new URL('https://api.smartthings.com/oauth/authorize');
  u.search = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirect, scope: SCOPES });
  console.log(u.toString());
} else if (cmd === 'token') {
  const [clientId, secret, redirect, code] = a;
  const res = await fetch('https://api.smartthings.com/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirect })
  });
  const json = await res.json();
  if (!res.ok) { console.error(json); process.exit(1); }
  console.log('access_token :', json.access_token, '(caduca en 24 h)');
  console.log('refresh_token:', json.refresh_token, '← pon esto en config.js');
} else if (cmd === 'devices') {
  const res = await fetch('https://api.smartthings.com/v1/devices', { headers: { Authorization: `Bearer ${a[0]}` } });
  const { items = [] } = await res.json();
  for (const d of items) {
    const caps = d.components?.find(c => c.id === 'main')?.capabilities.map(c => c.id) ?? [];
    const input = caps.filter(c => c.includes('mediaInputSource'));
    console.log(`${d.deviceId}  ${d.label || d.name}${input.length ? '  [' + input.join(', ') + ']' : ''}`);
  }
} else {
  console.log('Uso: url | token | devices  (ver cabecera del fichero)');
}
