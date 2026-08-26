import type { DiscoveryAnchorInput, DiscoveryAnchorEndInput, DiscoveryAnchorResult, GetNearbyPresenceParams, NearbyPresenceResult, ExactPresence, AnonymousPresence } from '@workspace/api-client-react';

export type LivePresenceLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  mocked: boolean;
};

export type PresenceState = {
  isLoading: boolean;
  hasSnapshot: boolean;
  exactRunners: ExactPresence[];
  anonymousRunners: AnonymousPresence[];
  ambientCount: number;
  isStale: boolean;
  isOffline: boolean;
};

export type PresenceMode = 'home' | 'run';

export type ControllerDependencies = {
  updateDiscoveryAnchor: (input: DiscoveryAnchorInput, opts?: { signal?: AbortSignal }) => Promise<DiscoveryAnchorResult>;
  endDiscoveryAnchor: (input: DiscoveryAnchorEndInput, opts?: { signal?: AbortSignal }) => Promise<void>;
  getNearbyPresence: (params: GetNearbyPresenceParams, opts?: { signal?: AbortSignal }) => Promise<NearbyPresenceResult>;
  now: () => number;
  setTimeout: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
  createSessionId: () => string;
};

export function getCardinalDirection(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): string {
  if (fromLat === toLat && fromLng === toLng) return 'N';
  const dLng = ((toLng - fromLng) * Math.PI) / 180;
  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  if (brng < 0) {
    brng += 360;
  }
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(((brng %= 360) < 0 ? brng + 360 : brng) / 45) % 8;
  return directions[index];
}

export type GhostTarget = {
  runner: ExactPresence;
  direction: string;
};

export function selectGhostTarget(
  exactRunners: ExactPresence[],
  location: LivePresenceLocation | null
): GhostTarget | null {
  if (!exactRunners || exactRunners.length === 0 || !location) return null;
  
  let nearest: ExactPresence | null = null;
  for (const runner of exactRunners) {
    if (!nearest || runner.distanceMeters < nearest.distanceMeters) {
      nearest = runner;
    }
  }
  
  if (!nearest) return null;
  
  return {
    runner: nearest,
    direction: getCardinalDirection(
      location.latitude,
      location.longitude,
      nearest.lat,
      nearest.lng
    )
  };
}

const POLL_INTERVAL_MS = 5000;
const FETCH_TIMEOUT_MS = 4000;
const STALE_THRESHOLD_MS = 10000;
const EVICT_THRESHOLD_MS = 30000;
const MAX_ACCURACY_METERS = 100;

export class LivePresenceController {
  private enabled = false;
  private mode: PresenceMode = 'home';
  private location: LivePresenceLocation | null = null;
  private state: PresenceState = {
    isLoading: false,
    hasSnapshot: false,
    exactRunners: [],
    anonymousRunners: [],
    ambientCount: 0,
    isStale: false,
    isOffline: false,
  };
  private lastSuccessTime = 0;
  private epoch = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private requestTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private isFetching = false;
  private isWaitingForLocation = false;
  private disposed = false;
  private clientSessionId: string | null = null;
  private onStateChange: (state: PresenceState) => void;
  private deps: ControllerDependencies;

  constructor(
    deps: ControllerDependencies,
    onStateChange: (state: PresenceState) => void
  ) {
    this.deps = deps;
    this.onStateChange = onStateChange;
  }

  update(enabled: boolean, mode: PresenceMode, location: LivePresenceLocation | null) {
    if (this.disposed) return;
    
    const wasEnabled = this.enabled;
    const wasMode = this.mode;

    this.enabled = enabled;
    this.mode = mode;
    this.location = location;

    // Transitioning from Home -> Run should immediately drop the anchor,
    // and if switching modes, we shouldn't resume polling with the old session
    if (wasMode === 'home' && mode === 'run' && this.clientSessionId) {
       this.endAnchor();
    }

    if (!wasEnabled && enabled) {
      this.start();
    } else if (wasEnabled && !enabled) {
      this.stop();
    } else if (wasEnabled && enabled && wasMode !== mode && mode === 'home') {
       // if we somehow transitioned run -> home while enabled, we should restart the polling cleanly
       this.start();
    } else if (wasEnabled && enabled && this.isWaitingForLocation) {
       // Location wake-up: if we were waiting on invalid location and we got a valid fix, poll immediately.
       const hasValidLocation = this.location && !(this.location.mocked ?? false) && (this.location.accuracy ?? 999) <= MAX_ACCURACY_METERS;
       if (hasValidLocation) {
         this.clearTimers();
         this.poll();
       }
    }
  }

  private endAnchor() {
    if (this.clientSessionId) {
      this.deps.endDiscoveryAnchor({ clientSessionId: this.clientSessionId }).catch(() => {});
      this.clientSessionId = null;
    }
  }

  dispose() {
    this.disposed = true;
    this.enabled = false;
    this.epoch += 1;
    this.clearTimers();
    this.abortCurrentRequest();
    this.endAnchor();
    // Prevent any future state callbacks.
    this.onStateChange = () => {};
  }

  private setState(partial: Partial<PresenceState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...partial };
    this.onStateChange(this.state);
  }

  private start() {
    this.epoch += 1;
    this.lastSuccessTime = 0;
    this.isFetching = false;
    this.isWaitingForLocation = false;
    this.clearTimers();
    this.abortCurrentRequest();
    
    if (this.mode === 'home') {
       this.clientSessionId = this.deps.createSessionId();
    }

    this.setState({
      isLoading: true,
      hasSnapshot: false,
      exactRunners: [],
      anonymousRunners: [],
      ambientCount: 0,
      isStale: false,
      isOffline: false
    });
    this.poll();
  }

  private stop() {
    this.epoch += 1;
    this.isWaitingForLocation = false;
    this.clearTimers();
    this.abortCurrentRequest();
    this.endAnchor();
    this.setState({
      isLoading: false,
      hasSnapshot: false,
      exactRunners: [],
      anonymousRunners: [],
      ambientCount: 0,
      isStale: false,
      isOffline: false
    });
  }
  
  private clearTimers() {
    if (this.timeoutId) {
      this.deps.clearTimeout(this.timeoutId);
      this.timeoutId = null;
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

  private async poll() {
    if (this.disposed || !this.enabled) return;
    
    const currentEpoch = this.epoch;
    const now = this.deps.now();
    let nextStale = this.state.isStale;

    if (this.lastSuccessTime > 0) {
      const timeSinceSuccess = now - this.lastSuccessTime;
      if (timeSinceSuccess > EVICT_THRESHOLD_MS) {
        this.setState({
          exactRunners: [],
          anonymousRunners: [],
          ambientCount: 0,
          isStale: false,
          hasSnapshot: false
        });
        nextStale = false;
      } else if (timeSinceSuccess > STALE_THRESHOLD_MS) {
        nextStale = true;
      } else {
        nextStale = false;
      }
    }

    if (this.state.isStale !== nextStale) {
      this.setState({ isStale: nextStale });
    }

    if (this.isFetching) {
      this.timeoutId = this.deps.setTimeout(() => this.poll(), POLL_INTERVAL_MS);
      return;
    }

    const loc = this.location;
    const hasValidLocation = loc && !(loc.mocked ?? false) && (loc.accuracy ?? 999) <= MAX_ACCURACY_METERS;

    if (!hasValidLocation) {
      this.isWaitingForLocation = true;
      this.timeoutId = this.deps.setTimeout(() => this.poll(), POLL_INTERVAL_MS);
      return;
    }

    this.isWaitingForLocation = false;
    this.isFetching = true;
    this.abortController = new AbortController();
    
    // Setup request timeout
    this.requestTimeoutId = this.deps.setTimeout(() => {
      if (this.epoch === currentEpoch && this.abortController) {
        this.abortController.abort();
      }
    }, FETCH_TIMEOUT_MS);

    try {
      if (this.mode === 'home') {
        if (!this.clientSessionId) {
          this.clientSessionId = this.deps.createSessionId();
        }
        await this.deps.updateDiscoveryAnchor(
          {
            lat: loc.latitude,
            lng: loc.longitude,
            accuracyMeters: loc.accuracy,
            mocked: false,
            clientSessionId: this.clientSessionId,
          },
          { signal: this.abortController.signal }
        );
      }

      const result = await this.deps.getNearbyPresence(
        { radiusMeters: 2000, limit: 100 },
        { signal: this.abortController.signal }
      );

      if (this.epoch !== currentEpoch || this.disposed) return;

      this.lastSuccessTime = this.deps.now();
      
      const exact: ExactPresence[] = [];
      const anon: AnonymousPresence[] = [];
      
      for (const r of result.runners) {
        if (r.visibility === 'exact') {
          exact.push(r as ExactPresence);
        } else if (r.visibility === 'anonymous') {
          anon.push(r as AnonymousPresence);
        }
      }

      this.setState({
        isLoading: false,
        hasSnapshot: true,
        exactRunners: exact,
        anonymousRunners: anon,
        ambientCount: result.ambientCount,
        isStale: false,
        isOffline: false
      });

    } catch {
      if (this.epoch !== currentEpoch || this.disposed) return;
      this.setState({
        isOffline: true,
        isLoading: false
      });
    } finally {
      if (this.requestTimeoutId) {
        this.deps.clearTimeout(this.requestTimeoutId);
        this.requestTimeoutId = null;
      }
      
      if (this.epoch === currentEpoch && !this.disposed) {
        this.isFetching = false;
        this.abortController = null;
        this.timeoutId = this.deps.setTimeout(() => this.poll(), POLL_INTERVAL_MS);
      }
    }
  }
}
