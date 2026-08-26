import {
  endPresence,
  heartbeatPresence,
} from '@workspace/api-client-react';

const HEARTBEAT_INTERVAL_MS = 5_000;
const MAX_ACCURACY_METERS = 100;

export type PresenceLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  mocked?: boolean;
};

type RunPresenceDependencies = {
  heartbeat: typeof heartbeatPresence;
  end: typeof endPresence;
  now: () => number;
  setInterval: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setInterval>;
  clearInterval: (intervalId: ReturnType<typeof setInterval>) => void;
};

const defaultDependencies: RunPresenceDependencies = {
  heartbeat: heartbeatPresence,
  end: endPresence,
  now: () => Date.now(),
  setInterval: (callback, delay) => setInterval(callback, delay),
  clearInterval: (intervalId) => clearInterval(intervalId),
};

export class RunPresencePublisher {
  private activeRunId: string | null = null;
  private presenceSessionId: string | null = null;
  private presenceSessionSequence = 0;
  private epoch = 0;
  private enabled = false;
  private heartbeatPending = false;
  private lastHeartbeatAttemptAt = 0;
  private operationQueue: Promise<void> = Promise.resolve();
  private latestLocation: PresenceLocation | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly dependencies: RunPresenceDependencies =
      defaultDependencies,
  ) {}

  beginRun(clientRunId: string, enabled: boolean): void {
    this.clearHeartbeatTimer();
    this.activeRunId = clientRunId;
    this.presenceSessionId = this.createPresenceSessionId(clientRunId);
    this.epoch += 1;
    this.enabled = enabled;
    this.lastHeartbeatAttemptAt = 0;
    this.latestLocation = null;
  }

  publishLocation(clientRunId: string, location: PresenceLocation): void {
    if (
      this.activeRunId !== clientRunId ||
      !this.enabled ||
      location.mocked ||
      !Number.isFinite(location.latitude) ||
      location.latitude < -90 ||
      location.latitude > 90 ||
      !Number.isFinite(location.longitude) ||
      location.longitude < -180 ||
      location.longitude > 180 ||
      (typeof location.accuracy === 'number' &&
        (!Number.isFinite(location.accuracy) ||
          location.accuracy < 0 ||
          location.accuracy > MAX_ACCURACY_METERS))
    ) {
      return;
    }

    const isFirstLocation = this.latestLocation === null;
    this.latestLocation = location;
    if (isFirstLocation) {
      this.startHeartbeatTimer();
    }
    this.attemptHeartbeat(clientRunId, location);
  }

  private attemptHeartbeat(
    clientRunId: string,
    location: PresenceLocation,
  ): void {
    if (
      this.activeRunId !== clientRunId ||
      !this.enabled ||
      this.heartbeatPending
    ) {
      return;
    }

    const now = this.dependencies.now();
    if (now - this.lastHeartbeatAttemptAt < HEARTBEAT_INTERVAL_MS) return;

    const epoch = this.epoch;
    const presenceSessionId = this.presenceSessionId;
    if (!presenceSessionId) return;
    const accuracyMeters =
      typeof location.accuracy === 'number' &&
      Number.isFinite(location.accuracy)
      ? Math.min(MAX_ACCURACY_METERS, Math.max(0, location.accuracy))
      : MAX_ACCURACY_METERS;

    this.lastHeartbeatAttemptAt = now;
    this.heartbeatPending = true;
    this.enqueue(async () => {
      try {
        if (
          this.activeRunId !== clientRunId ||
          this.presenceSessionId !== presenceSessionId ||
          this.epoch !== epoch ||
          !this.enabled
        ) {
          return;
        }

        await this.dependencies.heartbeat({
          clientRunId: presenceSessionId,
          lat: location.latitude,
          lng: location.longitude,
          accuracyMeters,
          mocked: Boolean(location.mocked),
        });
      } catch {
        console.warn('[HexRunner] Presence heartbeat failed.');
      } finally {
        this.heartbeatPending = false;
      }
    });
  }

  pauseRun(clientRunId: string): void {
    if (this.activeRunId !== clientRunId || !this.enabled) return;

    const presenceSessionId = this.presenceSessionId;
    this.clearHeartbeatTimer();
    this.latestLocation = null;
    this.presenceSessionId = null;
    this.enabled = false;
    this.epoch += 1;
    if (presenceSessionId) {
      this.enqueueEnd(presenceSessionId);
    }
  }

  resumeRun(clientRunId: string): void {
    if (this.activeRunId !== clientRunId || this.enabled) return;

    this.enabled = true;
    this.presenceSessionId = this.createPresenceSessionId(clientRunId);
    this.epoch += 1;
    this.lastHeartbeatAttemptAt = 0;
    this.latestLocation = null;
  }

  endRun(clientRunId: string): void {
    if (this.activeRunId !== clientRunId) return;

    const presenceSessionId = this.presenceSessionId;
    this.clearHeartbeatTimer();
    this.latestLocation = null;
    this.activeRunId = null;
    this.presenceSessionId = null;
    this.enabled = false;
    this.epoch += 1;
    if (presenceSessionId) {
      this.enqueueEnd(presenceSessionId);
    }
  }

  private enqueueEnd(clientRunId: string): void {
    this.enqueue(async () => {
      try {
        await this.dependencies.end({ clientRunId });
      } catch {
        console.warn('[HexRunner] Unable to end live presence.');
      }
    });
  }

  private startHeartbeatTimer(): void {
    this.clearHeartbeatTimer();
    this.heartbeatTimer = this.dependencies.setInterval(() => {
      const clientRunId = this.activeRunId;
      const location = this.latestLocation;
      if (clientRunId && location && this.enabled) {
        this.attemptHeartbeat(clientRunId, location);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private createPresenceSessionId(clientRunId: string): string {
    this.presenceSessionSequence += 1;
    const uniquePrefix = `presence_${this.dependencies.now().toString(36)}_${this.presenceSessionSequence.toString(36)}_`;
    return `${uniquePrefix}${clientRunId}`.slice(0, 128);
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer) {
      this.dependencies.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private enqueue(operation: () => Promise<void>): void {
    this.operationQueue = this.operationQueue.then(operation, operation);
  }
}

export const runPresence = new RunPresencePublisher();