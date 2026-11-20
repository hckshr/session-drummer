// Inline src/* into index.html, then wrap into worker.js and deploy-mcp.js (Cloudflare MCP execute payload)
const fs = require('fs'); const d = __dirname;
const rd = f => fs.readFileSync(d + '/src/' + f, 'utf8');
const js = ['analysis.js', 'patterns.js', 'drums.js', 'app.js'].map(rd).join('\n;\n').replace(/<\/script/gi, '<\\/script');
const kit = rd('kit.json'); const kitHash = require('crypto').createHash('sha1').update(kit).digest('hex').slice(0, 10);
const KITURL = '/kit.json?v=' + kitHash;
let html = rd('index.template.html').replace('/*KITURL*/', KITURL).replace('/*CSS*/', () => rd('style.css')).replace('/*JS*/', () => js);
fs.writeFileSync(d + '/index.html', html);
fs.writeFileSync(d + '/kit.json', kit);
const worker = `const KIT = ${JSON.stringify(kit)};
export default {
  async fetch(request) {
    const HTML = ${JSON.stringify(html)};
    const url = new URL(request.url);
    if ((request.method === 'HEAD' || request.method === 'GET') && url.pathname === '/kit.json') {
      return new Response(request.method === 'HEAD' ? null : KIT, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*' } });
    }
    if ((request.method === 'HEAD' || request.method === 'GET') && url.pathname !== '/' && url.pathname !== '/index.html') return new Response('Not found', { status: 404 });
    if (request.method === 'HEAD' || request.method === 'GET') {
      return new Response(request.method === 'HEAD' ? null : HTML, {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'public, max-age=120',
          'x-content-type-options': 'nosniff',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'permissions-policy': 'microphone=(self)'
        }
      });
    }
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
};
`;
fs.writeFileSync(d + '/worker.js', worker);
const deploy = `async () => {
  const worker = ${JSON.stringify(worker)};
  const metadata = { main_module: 'worker.js', compatibility_date: '2026-11-15' };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('worker.js', new Blob([worker], { type: 'application/javascript+module' }), 'worker.js');
  const upload = await cloudflare.request({ method: 'PUT', path: \`/accounts/\${accountId}/workers/scripts/session-drummer\`, body: form });
  const subdomain = await cloudflare.request({ method: 'POST', path: \`/accounts/\${accountId}/workers/scripts/session-drummer/subdomain\`, body: { enabled: true } });
  return { uploadSuccess: upload.success, script: upload.result && { id: upload.result.id, modified_on: upload.result.modified_on }, errors: upload.errors, subdomain: subdomain && subdomain.result };
}
`;
fs.writeFileSync(d + '/deploy-mcp.js', deploy);
console.log('built', html.length, 'bytes html');
