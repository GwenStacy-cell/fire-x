import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { registerDashboardRoutes } from './api.js';
import { resolveWebPort, getDashboardBaseUrl } from './auth.js';

// ── Standalone offline page (no external deps — served even when bot is booting) ──
const OFFLINE_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Athena Prime — Offline</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    :root{--red:#ef4444;--red-dim:#7f1d1d;--border:#1e1b2e;--bg:#0a0812;--surface:#100e1c;--surface2:#16132a;--text:#e2e0f0;--muted:#6b6885;--accent:#7c3aed}
    body{background:var(--bg);color:var(--text);font-family:'Segoe UI',system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;overflow:hidden}
    /* animated tactical grid */
    body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(124,58,237,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(124,58,237,.04) 1px,transparent 1px);background-size:40px 40px;animation:grid-drift 20s linear infinite;pointer-events:none}
    @keyframes grid-drift{from{background-position:0 0}to{background-position:40px 40px}}
    /* pulsing red glow */
    .glow{position:fixed;top:30%;left:50%;width:420px;height:420px;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(239,68,68,.12) 0%,transparent 70%);animation:pulse 3s ease-in-out infinite;pointer-events:none}
    @keyframes pulse{0%,100%{opacity:.6;transform:translate(-50%,-50%) scale(1)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.15)}}
    .card{position:relative;background:var(--surface);border:1px solid var(--red-dim);border-radius:16px;padding:48px 52px;max-width:540px;width:92%;text-align:center;box-shadow:0 0 60px rgba(239,68,68,.08),0 24px 48px rgba(0,0,0,.6)}
    .card::before{content:'';position:absolute;inset:0;border-radius:16px;background:linear-gradient(135deg,rgba(239,68,68,.04) 0%,transparent 60%);pointer-events:none}
    .badge{display:inline-flex;align-items:center;gap:8px;background:rgba(239,68,68,.12);border:1px solid var(--red-dim);border-radius:999px;padding:5px 14px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--red);margin-bottom:28px}
    .badge-dot{width:8px;height:8px;border-radius:50%;background:var(--red);animation:blink 1.2s step-start infinite}
    @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
    .shield{font-size:56px;margin-bottom:16px;filter:drop-shadow(0 0 18px rgba(239,68,68,.5))}
    h1{font-size:22px;font-weight:700;color:var(--text);letter-spacing:.03em;margin-bottom:8px}
    .subtitle{font-size:13.5px;color:var(--muted);line-height:1.6;margin-bottom:28px}
    .divider{height:1px;background:linear-gradient(90deg,transparent,var(--red-dim),transparent);margin:24px 0}
    .status-row{display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid #1a1730;border-radius:10px;padding:12px 16px;margin-bottom:10px;font-size:12.5px}
    .status-label{color:var(--muted);font-weight:600;letter-spacing:.06em;text-transform:uppercase}
    .status-val{font-weight:700;display:flex;align-items:center;gap:6px}
    .dot-red{width:7px;height:7px;border-radius:50%;background:var(--red);box-shadow:0 0 6px var(--red);flex-shrink:0}
    .dot-yellow{width:7px;height:7px;border-radius:50%;background:#eab308;box-shadow:0 0 6px #eab308;flex-shrink:0;animation:blink 1.6s step-start infinite}
    .footer{margin-top:32px;font-size:11.5px;color:#3d3a52;letter-spacing:.05em;text-transform:uppercase}
    .footer strong{color:#4c4870}
    @media(max-width:480px){.card{padding:36px 24px}}
  </style>
</head>
<body>
  <div class="glow"></div>
  <div class="card">
    <div class="badge"><span class="badge-dot"></span> System Alert</div>
    <div class="shield">🛡️</div>
    <h1>Athena Prime is Offline</h1>
    <p class="subtitle">The bot is currently unavailable or still connecting to Discord.<br>The control plane will resume automatically once the system comes back online.</p>
    <div class="divider"></div>
    <div class="status-row">
      <span class="status-label">Bot Status</span>
      <span class="status-val"><span class="dot-red"></span> Offline / Reconnecting</span>
    </div>
    <div class="status-row">
      <span class="status-label">Web Platform</span>
      <span class="status-val"><span class="dot-yellow"></span> Standby</span>
    </div>
    <div class="status-row">
      <span class="status-label">Dashboard Access</span>
      <span class="status-val" style="color:#4b5563">Suspended</span>
    </div>
    <div class="divider"></div>
    <p class="subtitle" style="margin-bottom:0;font-size:12.5px">If this persists for more than a few minutes, the host server may require a manual restart via the Pterodactyl panel.</p>
    <div class="footer" style="margin-top:20px"><strong>ATHENA PRIME</strong> &nbsp;·&nbsp; Discord SOC Protocol &nbsp;·&nbsp; v4.0.26</div>
  </div>
  <div class="footer" style="margin-top:20px">Auto-refresh in <span id="cd">30</span>s</div>
  <script>
    let s=30;const el=document.getElementById('cd');
    setInterval(()=>{s--;el.textContent=s;if(s<=0)location.reload()},1000);
  </script>
</body>
</html>`;

const PAGE_ROUTES = [
  '/',
  '/dashboard',
  '/overview',
  '/access',
  '/sectrack',
  '/controls',
  '/incidents',
  '/docs',
  '/login'
];

/**
 * Mounts Athena Prime's public website showcase, passwordless !weblogin magic-link auth,
 * live security control REST API, and health endpoint onto the shared Express app.
 */
export function registerWebPlatform(app, client) {
  // Security & live-edit cache headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
    }
    next();
  });

  // ── Bot-offline gate ────────────────────────────────────────────────────────
  // If the Discord client hasn't connected yet (or has disconnected), serve a
  // professional maintenance page instead of broken API responses.
  // /health is always allowed so Pterodactyl uptime checks still work.
  app.use((req, res, next) => {
    if (req.path === '/health') return next();
    if (client?.isReady?.()) return next();
    // Bot is offline / still connecting — return branded offline page
    res.status(503).send(OFFLINE_PAGE);
  });

  // Health endpoint (replaces standalone plain-text http server to avoid port collision)
  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'Athena Prime',
      ready: Boolean(client?.isReady?.()),
      guilds: client?.guilds?.cache?.size || 0,
      uptimeSec: Math.floor(process.uptime())
    });
  });

  // Register JSON API & /auth/magic handlers BEFORE static assets
  registerDashboardRoutes(app, client);

  // Serve editable static website files under <repo>/web
  const webDir = path.resolve(process.cwd(), 'web');
  if (fs.existsSync(webDir)) {
    app.use(express.static(webDir, {
      etag: true,
      maxAge: 0,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }));

    const indexPath = path.join(webDir, 'index.html');
    app.get(PAGE_ROUTES, (_req, res) => {
      if (!fs.existsSync(indexPath)) {
        return res.status(404).send('Athena Prime web UI missing (web/index.html).');
      }
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(indexPath);
    });
  }
}

export { resolveWebPort, getDashboardBaseUrl };
