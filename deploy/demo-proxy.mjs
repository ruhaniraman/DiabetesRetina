// Demo deploy only (deploy/DEMO_VERCEL_NGROK.md): one local port for the ngrok tunnel, routed like deploy/Caddyfile.
//   /auth-api/*  -> auth-server 127.0.0.1:4000 /api/*   (/auth-api/internal* is refused: service-to-service only)
//   /ml-api/*    -> ML backend  127.0.0.1:5000 /api/*
// No dependencies:  node deploy/demo-proxy.mjs   (PORT, default 8080)
import http from 'node:http';

const PORT = Number(process.env.PORT || 8080);
const ROUTES = [
  { prefix: '/auth-api', port: 4000, maxBytes: 64 * 1024 },
  { prefix: '/ml-api', port: 5000, maxBytes: 40 * 1024 * 1024 },
];

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

http
  .createServer((req, res) => {
    if (req.url === '/' || req.url === '/proxy-health') return send(res, 200, { ok: true, proxy: 'retina-rescue demo' });
    if (req.url.startsWith('/auth-api/internal')) return send(res, 404, { message: 'Not found.' });
    const route = ROUTES.find((r) => req.url === r.prefix || req.url.startsWith(`${r.prefix}/`));
    if (!route) return send(res, 404, { message: 'Not found.' });
    if (Number(req.headers['content-length'] || 0) > route.maxBytes) return send(res, 413, { message: 'Upload too large.' });

    // Keep only the original client address (the first entry) so the auth-server's rate limits count per visitor
    // when it runs with TRUST_PROXY=1; everything else in the request passes through unchanged.
    const headers = { ...req.headers, host: `127.0.0.1:${route.port}` };
    const client = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    delete headers['x-forwarded-for'];
    delete headers['x-forwarded-host'];
    delete headers['x-forwarded-proto'];
    delete headers.forwarded;
    delete headers['x-real-ip'];
    if (client) headers['x-forwarded-for'] = client;

    const upstream = http.request(
      { host: '127.0.0.1', port: route.port, method: req.method, path: `/api${req.url.slice(route.prefix.length)}`, headers, timeout: 180_000 },
      (up) => {
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
    upstream.on('error', (err) => {
      if (res.headersSent) return res.destroy();
      const down = err.code === 'ECONNREFUSED';
      send(res, down ? 502 : 504, { message: down ? `Service on port ${route.port} is not running.` : 'The service took too long.' });
    });
    req.pipe(upstream);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`demo proxy on http://127.0.0.1:${PORT}  (/auth-api -> :4000, /ml-api -> :5000)`));
