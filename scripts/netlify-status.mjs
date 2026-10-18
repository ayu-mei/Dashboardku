import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const config = JSON.parse(readFileSync(join(process.env.APPDATA, 'netlify', 'Config', 'config.json'), 'utf8'));
const user = config.users?.[config.userId];
const token = process.env.NETLIFY_AUTH_TOKEN || user?.auth?.token || user?.token;
if (!token) {
  console.log(JSON.stringify({ authenticated: false, configKeys: Object.keys(config), userKeys: Object.keys(user || {}), authKeys: Object.keys(user?.auth || {}) }));
  process.exit(1);
}
const { siteId } = JSON.parse(readFileSync('.netlify/state.json', 'utf8'));
try {
  const response = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Netlify HTTP ${response.status}`);
  const site = await response.json();
  console.log(JSON.stringify({ authenticated: true, id: site.id, name: site.name, url: site.ssl_url || site.url, repository: site.build_settings?.repo_url, deployedAt: site.published_deploy?.published_at || null }, null, 2));
} catch (error) { console.error('Netlify check failed: ' + error.message); process.exitCode = 1; }
