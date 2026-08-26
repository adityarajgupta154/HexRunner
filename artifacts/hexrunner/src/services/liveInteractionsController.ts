import type { LiveInteraction, AcknowledgeLiveInteractionsInput, LiveInteractionsResult } from '@workspace/api-client-react';

export type InteractionsState = {
  events: LiveInteraction[];
  isOffline: boolean;
};

export type InteractionsDependencies = {
  getLiveInteractions: (opts?: { signal?: AbortSignal }) => Promise<LiveInteractionsResult>;
  acknowledgeLiveInteractions: (input: AcknowledgeLiveInteractionsInput, opts?: { signal?: AbortSignal }) => Promise<void>;
  now: () => number;
  setTimeout: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

export class LiveInteractionsController {
  private enabled = false;
  private hasSnapshot = false;
  private state: InteractionsState = { events: [], isOffline: false };
  private dismissedIds = new Set<string>();
  private knownEvents = new Map<string, LiveInteraction>();
  private pendingAcks = new Set<string>();
  private acknowledgedIds = new Set<string>();
  
  private pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private expiryTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private requestTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private isFetching = false;
  private disposed = false;
  private epoch = 0;

  private deps: InteractionsDependencies;
  private onStateChange: (state: InteractionsState) => void;

  constructor(
    deps: InteractionsDependencies,
    onStateChange: (state: InteractionsState) => void
  ) {
    this.deps = deps;
    this.onStateChange = onStateChange;
  }

  update(enabled: boolean, hasSnapshot: boolean) {
    if (this.disposed) return;
    const wasActive = this.enabled && this.hasSnapshot;
    this.enabled = enabled;
    this.hasSnapshot = hasSnapshot;
    const isActive = this.enabled && this.hasSnapshot;

    if (!wasActive && isActive) {
      this.start();
    } else if (wasActive && !isActive) {
      this.stop();
    }
  }

  dismiss(eventId: string) {
    if (this.disposed) return;
    this.dismissedIds.add(eventId);
    if (this.knownEvents.has(eventId)) {
      this.knownEvents.delete(eventId);
      this.publishState();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.enabled = false;
    this.hasSnapshot = false;
    this.stop();
    this.disposed = true;
    this.onStateChange = () => {};
  }

  private start() {
    this.epoch++;
    this.isFetching = false;
    this.clearTimers();
    this.abortCurrentRequest();
    this.poll();
  }

  private stop() {
    this.epoch++;
    this.isFetching = false;
    this.clearTimers();
    this.abortCurrentRequest();
    this.knownEvents.clear();
    this.dismissedIds.clear();
    this.pendingAcks.clear();
    this.acknowledgedIds.clear();
    this.publishState(false);
  }

  private clearTimers() {
    if (this.pollTimeoutId) {
      this.deps.clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = null;
    }
    if (this.expiryTimeoutId) {
      this.deps.clearTimeout(this.expiryTimeoutId);
      this.expiryTimeoutId = null;
    }
    if (this.requestTimeoutId) {
      this.deps.clearTimeout(this.requestTimeoutId);
      this.requestTimeoutId = null;
    }
  }

  private abortCurrentRequest() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private publishState(isOffline = this.state.isOffline) {
    if (this.disposed) return;
    const now = this.deps.now();
    const validEvents: LiveInteraction[] = [];
    
    for (const [id, event] of this.knownEvents.entries()) {
      if (new Date(event.expiresAt).getTime() > now) {
        validEvents.push(event);
      } else {
        this.knownEvents.delete(id);
      }
    }

    validEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    this.state = { events: validEvents, isOffline };
    this.onStateChange(this.state);
    this.scheduleExactExpiry(validEvents);
  }

  private scheduleExactExpiry(events: LiveInteraction[]) {
    if (this.expiryTimeoutId) {
      this.deps.clearTimeout(this.expiryTimeoutId);
      this.expiryTimeoutId = null;
    }
    if (!this.enabled || !this.hasSnapshot || events.length === 0) return;
    const now = this.deps.now();
    const nextExpiry = Math.min(
      ...events.map((event) => new Date(event.expiresAt).getTime()),
    );
    this.expiryTimeoutId = this.deps.setTimeout(() => {
      this.expiryTimeoutId = null;
      this.publishState();
    }, Math.max(0, nextExpiry - now));
  }

  private async poll() {
    if (this.disposed || !this.enabled || !this.hasSnapshot) return;

    this.publishState();

    if (this.isFetching) {
      this.pollTimeoutId = this.deps.setTimeout(() => this.poll(), 5000);
      return;
    }

    this.isFetching = true;
    const currentEpoch = this.epoch;
    this.abortController = new AbortController();

    this.requestTimeoutId = this.deps.setTimeout(() => {
      if (this.epoch === currentEpoch && this.abortController) {
        this.abortController.abort();
      }
    }, 4000);

    try {
      const result = await this.deps.getLiveInteractions({ signal: this.abortController.signal });
      if (this.epoch !== currentEpoch || this.disposed) return;

      const now = this.deps.now();
      const newContestIds: string[] = [];
      const newWaveIds: string[] = [];

      for (const event of result.events) {
        if (new Date(event.expiresAt).getTime() <= now) continue;
        if (this.dismissedIds.has(event.id)) continue;
        
        if (!this.knownEvents.has(event.id)) {
          this.knownEvents.set(event.id, event);
        }

        if (
          !this.acknowledgedIds.has(event.id) &&
          !this.pendingAcks.has(event.id)
        ) {
          this.pendingAcks.add(event.id);
          if (event.kind === 'contest') {
            newContestIds.push(event.id);
          } else if (event.kind === 'wave') {
            newWaveIds.push(event.id);
          }
        }
      }

      this.publishState(false);

      if (newContestIds.length > 0 || newWaveIds.length > 0) {
        const ids = [...newContestIds, ...newWaveIds];
        const ackEpoch = currentEpoch;
        this.deps
          .acknowledgeLiveInteractions(
            {
              contestEventIds: newContestIds,
              waveIds: newWaveIds,
            },
            { signal: this.abortController.signal },
          )
          .then(() => {
            if (this.disposed || this.epoch !== ackEpoch) return;
            ids.forEach((id) => {
              this.pendingAcks.delete(id);
              this.acknowledgedIds.add(id);
            });
          })
          .catch(() => {
            if (this.disposed || this.epoch !== ackEpoch) return;
            ids.forEach((id) => this.pendingAcks.delete(id));
          });
      }

    } catch (e: any) {
      if (this.epoch !== currentEpoch || this.disposed) return;
      this.publishState(true);
    } finally {
      if (this.requestTimeoutId) {
        this.deps.clearTimeout(this.requestTimeoutId);
        this.requestTimeoutId = null;
      }

      if (this.epoch === currentEpoch && !this.disposed) {
        this.isFetching = false;
        this.abortController = null;
        this.pollTimeoutId = this.deps.setTimeout(() => this.poll(), 5000);
      }
    }
  }
}
