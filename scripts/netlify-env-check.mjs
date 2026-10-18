import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const config = JSON.parse(readFileSync(join(process.env.APPDATA, 'netlify', 'Config', 'config.json'), 'utf8'));
const user = config.users?.[config.userId];
const token = process.env.NETLIFY_AUTH_TOKEN || user?.auth?.token || user?.token;
if (!token) throw new Error('Netlify login required.');
const { siteId } = JSON.parse(readFileSync('.netlify/state.json', 'utf8'));
async function get(path) {
  const response = await fetch('https://api.netlify.com/api/v1' + path, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Netlify HTTP ${response.status}`);
  return response.json();
}
const site = await get('/sites/' + siteId);
const vars = await get(`/accounts/${site.account_id}/env?site_id=${siteId}`);
const required = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_API_BASE_URL'];
const found = {};
for (const name of required) {
  const variable = vars.find(v => v.key === name);
  const value = variable?.values?.find(v => v.context === 'production')?.value || variable?.values?.find(v => v.context === 'all')?.value || site.build_settings?.env?.[name];
  if (value) found[name] = value;
}
console.log(JSON.stringify({ site: site.ssl_url, configured: Object.keys(found), missing: required.filter(key => !found[key]) }, null, 2));
if (required.every(key => found[key])) {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(found.VITE_SUPABASE_URL) || !found.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) throw new Error('Expected valid URL and publishable key. No file written.');
  if (!/^https:\/\//.test(found.VITE_API_BASE_URL)) throw new Error('Production API URL must use HTTPS.');
  writeFileSync('frontend/.env.local', required.map(name => `${name}=${found[name]}`).join('\n') + '\n');
  console.log('Public frontend configuration saved to git-ignored frontend/.env.local. No secret keys copied.');
}
