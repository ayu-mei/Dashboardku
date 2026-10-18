// Upload only dist/ as a DRAFT; never replace the existing production site.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const config = JSON.parse(readFileSync(join(process.env.APPDATA, 'netlify', 'Config', 'config.json'), 'utf8'));
const user = config.users?.[config.userId];
const token = process.env.NETLIFY_AUTH_TOKEN || user?.auth?.token || user?.token;
if (!token) throw new Error('Log into Netlify first.');
const { siteId } = JSON.parse(readFileSync('.netlify/state.json', 'utf8'));
const directory = resolve('frontend/dist');
const files = {};
function collect(folder, prefix = '') {
  for (const name of readdirSync(folder)) {
    const diskPath = join(folder, name), path = prefix + '/' + name;
    if (statSync(diskPath).isDirectory()) collect(diskPath, path);
    else {
      if (!/\.(html|js|css)$/.test(path) && !['/_headers','/_redirects'].includes(path)) throw new Error('Unexpected file in dist: ' + path);
      const content = readFileSync(diskPath);
      files[path] = { content, sha: createHash('sha1').update(content).digest('hex') };
    }
  }
}
collect(directory);
if (!files['/index.html'] || !files['/_headers']) throw new Error('Build the frontend first.');
async function api(path, options = {}) {
  const response = await fetch('https://api.netlify.com/api/v1' + path, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Netlify HTTP ${response.status}`);
  return response.json();
}
const deploy = await api(`/sites/${siteId}/deploys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: true, title: 'Refraksi React responsive frontend preview', files: Object.fromEntries(Object.entries(files).map(([path,file])=>[path,file.sha])) }) });
await Promise.all((deploy.required || []).map(async sha => {
  const [path,file] = Object.entries(files).find(([,file])=>file.sha===sha);
  await api(`/deploys/${deploy.id}/files${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file.content });
}));
let current = deploy;
for (let i=0;i<20;i++) {
  current = await api('/deploys/' + deploy.id);
  if (['ready','error'].includes(current.state)) break;
  await new Promise(resolve=>setTimeout(resolve,1500));
}
const result = { id: current.id, state: current.state, draft: true, url: current.deploy_ssl_url || current.deploy_url };
writeFileSync('.netlify/refraksi-draft.json', JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if (current.state === 'error') process.exitCode = 1;
