import type { SessionManager } from './manager.js';

export class SessionCleanupTask {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly manager: SessionManager,
    private readonly intervalMs = 30_000,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.runCleanup();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private runCleanup(): void {
    const now = Date.now();
    for (const info of this.manager.list()) {
      if (info.expiresAt) {
        const expTime = new Date(info.expiresAt).getTime();
        if (now >= expTime) {
          void this.manager.close(info.id).catch(() => undefined);
        }
      }
    }
  }
}
