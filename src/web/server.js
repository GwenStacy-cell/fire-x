import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { registerDashboardRoutes } from './api.js';
import { resolveWebPort, getDashboardBaseUrl } from './auth.js';

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
