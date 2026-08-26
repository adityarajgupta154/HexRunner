import type {
  SendWaveInput,
  SendWaveResult,
} from '@workspace/api-client-react';

export type WaveActionStatus =
  | 'idle'
  | 'pending'
  | 'sent'
  | 'throttled'
  | 'blocked'
  | 'offline'
  | 'failed';

export type WaveActionState = {
  status: WaveActionStatus;
};

type StatusError = {
  status?: unknown;
  name?: unknown;
};

export function classifyWaveError(error: unknown): WaveActionStatus {
  const candidate =
    error && typeof error === 'object' ? (error as StatusError) : null;
  if (candidate?.status === 429) return 'throttled';
  if (candidate?.status === 403) return 'blocked';
  if (
    typeof candidate?.status !== 'number' ||
    candidate?.name === 'AbortError'
  ) {
    return 'offline';
  }
  return 'failed';
}

export type WaveActionDependencies = {
  sendWave: (input: SendWaveInput) => Promise<SendWaveResult>;
  createIdempotencyKey: () => string;
  setTimeout: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

export class WaveActionController {
  private interactionToken: string | null = null;
  private idempotencyKey = '';
  private state: WaveActionState = { status: 'idle' };
  private epoch = 0;
  private closeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly deps: WaveActionDependencies;
  private onStateChange: (state: WaveActionState) => void;
  private onSent: () => void;

  constructor(
    deps: WaveActionDependencies,
    onStateChange: (state: WaveActionState) => void,
    onSent: () => void,
  ) {
    this.deps = deps;
    this.onStateChange = onStateChange;
    this.onSent = onSent;
  }

  select(interactionToken: string | null) {
    if (this.disposed) return;
    this.epoch += 1;
    this.clearCloseTimer();
    this.interactionToken = interactionToken;
    this.idempotencyKey = interactionToken
      ? this.deps.createIdempotencyKey()
      : '';
    this.setState('idle');
  }

  async send() {
    if (
      this.disposed ||
      !this.interactionToken ||
      this.state.status === 'pending' ||
      this.state.status === 'sent'
    ) {
      return;
    }
    const token = this.interactionToken;
    const idempotencyKey = this.idempotencyKey;
    const currentEpoch = this.epoch;
    this.setState('pending');
    try {
      await this.deps.sendWave({
        interactionToken: token,
        idempotencyKey,
      });
      if (this.disposed || this.epoch !== currentEpoch) return;
      this.setState('sent');
      this.closeTimeoutId = this.deps.setTimeout(() => {
        this.closeTimeoutId = null;
        if (this.disposed || this.epoch !== currentEpoch) return;
        this.onSent();
      }, 1_500);
    } catch (error) {
      if (this.disposed || this.epoch !== currentEpoch) return;
      this.setState(classifyWaveError(error));
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.epoch += 1;
    this.clearCloseTimer();
    this.interactionToken = null;
    this.onStateChange = () => {};
    this.onSent = () => {};
  }

  private setState(status: WaveActionStatus) {
    this.state = { status };
    this.onStateChange(this.state);
  }

  private clearCloseTimer() {
    if (!this.closeTimeoutId) return;
    this.deps.clearTimeout(this.closeTimeoutId);
    this.closeTimeoutId = null;
  }
}