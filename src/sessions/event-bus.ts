export type SessionEventType =
  | 'recording.started'
  | 'recording.stopped'
  | 'session.started'
  | 'session.closed'
  | 'page.created'
  | 'page.ready'
  | 'page.activated'
  | 'page.navigated'
  | 'page.closed'
  | 'page.failed'
  | 'observation.created'
  | 'action.started'
  | 'target.resolved'
  | 'action.executed'
  | 'action.completed'
  | 'action.failed'
  | 'verification.completed'
  | 'console'
  | 'page.error'
  | 'request.failed'
  | 'response.error'
  | 'artifact.created';

export interface SessionEvent {
  sequence: number;
  id: string;
  timestamp: string;
  elapsedMs: number;
  sessionId: string;
  pageId?: string;
  actionId?: string;
  observationId?: string;
  type: SessionEventType;
  data?: Record<string, unknown>;
}

export type SessionEventListener = (event: SessionEvent) => void;
export type Cleanup = () => void;

export class SessionEventBus {
  private listeners = new Set<SessionEventListener>();
  private sequenceCounter = 0;
  private startTime: number;

  constructor(readonly sessionId: string) {
    this.startTime = Date.now();
  }

  emit(
    type: SessionEventType,
    payload: {
      pageId?: string;
      actionId?: string;
      observationId?: string;
      data?: Record<string, unknown>;
    } = {},
  ): SessionEvent {
    this.sequenceCounter++;
    const now = Date.now();
    const event: SessionEvent = {
      sequence: this.sequenceCounter,
      id: `evt_${this.sequenceCounter}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date(now).toISOString(),
      elapsedMs: Math.max(0, now - this.startTime),
      sessionId: this.sessionId,
      pageId: payload.pageId,
      actionId: payload.actionId,
      observationId: payload.observationId,
      type,
      data: payload.data,
    };

    for (const listener of Array.from(this.listeners)) {
      try {
        listener(event);
      } catch {
        // Prevent listener error from breaking event stream
      }
    }

    return event;
  }

  subscribe(listener: SessionEventListener): Cleanup {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
