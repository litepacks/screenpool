import type { Browser } from 'puppeteer-core';
import type { SessionOptions, BrowserSessionInfo } from './types.js';
import { BrowserSessionImpl } from './session.js';
import { ActionError } from '../actions/errors.js';
import { createJobId } from '../utils/uuid.js';

export class SessionManager {
  private sessions = new Map<string, BrowserSessionImpl>();
  private finishedManifests = new Map<string, any>();

  saveFinishedManifest(sessionId: string, recordingId: string | undefined, manifest: any): void {
    this.finishedManifests.set(sessionId, manifest);
    if (recordingId) {
      this.finishedManifests.set(recordingId, manifest);
    }
  }

  getFinishedManifest(id?: string): any | undefined {
    if (id && this.sessions.has(id)) {
      const session = this.sessions.get(id);
      if ((session as any)?.finishedManifest) {
        return (session as any).finishedManifest;
      }
    }
    if (!id) {
      const values = Array.from(this.finishedManifests.values());
      return values[values.length - 1];
    }
    return this.finishedManifests.get(id);
  }

  constructor(private readonly getBrowser: () => Browser) {}

  async create(options: SessionOptions = {}): Promise<BrowserSessionImpl> {
    const browser = this.getBrowser();
    const sessionId = `session_${createJobId()}`;

    const session = new BrowserSessionImpl(sessionId, browser, options);
    await session.init();

    this.sessions.set(sessionId, session);
    return session;
  }

  get(sessionId: string): BrowserSessionImpl | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    if (session.state === 'closed' || session.state === 'expired') {
      if ((session as any).finishedManifest) {
        this.saveFinishedManifest(sessionId, (session as any).finishedManifest.id, (session as any).finishedManifest);
      }
      this.sessions.delete(sessionId);
      return undefined;
    }

    return session;
  }

  require(sessionId: string): BrowserSessionImpl {
    const session = this.get(sessionId);
    if (!session) {
      throw new ActionError(
        'SESSION_NOT_FOUND',
        `Session with id ${sessionId} was not found or is closed.`,
      );
    }
    return session;
  }

  list(): BrowserSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.getInfo());
  }

  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.close();
      if ((session as any).finishedManifest) {
        this.saveFinishedManifest(sessionId, (session as any).finishedManifest.id, (session as any).finishedManifest);
      }
      this.sessions.delete(sessionId);
    }
  }

  async closeAll(): Promise<void> {
    const all = Array.from(this.sessions.values());
    await Promise.all(all.map((s) => s.close().catch(() => undefined)));
    this.sessions.clear();
  }

  findActiveRecordingSession(): BrowserSessionImpl | undefined {
    for (const session of this.sessions.values()) {
      if (session.state !== 'closed' && session.state !== 'expired' && session.record.get()) {
        return session;
      }
    }
    return undefined;
  }
}
