import { serve, type ServerType } from '@hono/node-server';
import type { ScreenPool } from '../ScreenPool.js';
import { createScreenPoolApp, type CreateScreenPoolAppOptions } from './createScreenPoolApp.js';

export interface CreateScreenPoolServerOptions extends CreateScreenPoolAppOptions {
  port?: number;
  host?: string;
}

export interface ScreenPoolServer {
  app: ReturnType<typeof createScreenPoolApp>;
  server: ServerType;
  port: number;
  listen: () => Promise<{ port: number; host: string }>;
  close: () => Promise<void>;
}

/** Create Hono app + Node HTTP server for ScreenPool. */
export function createScreenPoolServer(
  pool: ScreenPool,
  options: CreateScreenPoolServerOptions = {},
): ScreenPoolServer {
  const app = createScreenPoolApp(pool, options);
  const requestedPort = options.port ?? 3000;
  const hostname = options.host ?? '0.0.0.0';

  let server: ServerType | null = null;
  let boundPort = requestedPort;

  return {
    app,
    get port() {
      return boundPort;
    },
    get server() {
      if (!server) {
        throw new Error('Server not started. Call listen() first.');
      }
      return server;
    },
    listen: () =>
      new Promise<{ port: number; host: string }>((resolve) => {
        server = serve({ fetch: app.fetch, port: requestedPort, hostname }, () => {
          if (server) {
            const addr = server.address();
            if (addr && typeof addr === 'object') {
              boundPort = addr.port;
            }
          }
          resolve({ port: boundPort, host: hostname });
        });
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

export { createScreenPoolApp } from './createScreenPoolApp.js';
export type { CreateScreenPoolAppOptions } from './createScreenPoolApp.js';
