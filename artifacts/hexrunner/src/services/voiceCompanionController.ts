export type VoiceAnnouncement = {
  id: string;
  text: string;
  priority?: number;
  cooldownKey?: string;
  cooldownMs?: number;
};

type QueueItem = VoiceAnnouncement & { priority: number };

export type VoiceCompanionDependencies = {
  canSpeak: boolean;
  now: () => number;
  speak: (
    text: string,
    callbacks: {
      onDone: () => void;
      onStopped: () => void;
      onError: () => void;
    },
  ) => void;
  stop: () => void;
};

export function isCurrentSafetyAnnouncement({
  requestedRunId,
  requestedAreaId,
  currentRunId,
  currentAreaId,
  isRunning,
}: {
  requestedRunId: string;
  requestedAreaId: string;
  currentRunId: string | null;
  currentAreaId: string | null;
  isRunning: boolean;
}): boolean {
  return (
    isRunning &&
    requestedRunId === currentRunId &&
    requestedAreaId === currentAreaId
  );
}

export class VoiceCompanionController {
  private readonly dependencies: VoiceCompanionDependencies;
  private enabled = false;
  private active = false;
  private speaking = false;
  private queue: QueueItem[] = [];
  private spokenIds = new Set<string>();
  private cooldowns = new Map<string, number>();
  private generation = 0;

  constructor(dependencies: VoiceCompanionDependencies) {
    this.dependencies = dependencies;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  beginRun(): void {
    this.generation += 1;
    if (this.speaking) this.dependencies.stop();
    this.speaking = false;
    this.active = true;
    this.queue = [];
    this.spokenIds.clear();
  }

  endRun(): void {
    this.active = false;
    this.stop();
    this.spokenIds.clear();
  }

  pause(): void {
    this.active = false;
    this.stop();
  }

  resume(): void {
    this.active = true;
    this.drain();
  }

  announce(announcement: VoiceAnnouncement): boolean {
    if (!this.enabled || !this.active || !this.dependencies.canSpeak) return false;
    if (this.spokenIds.has(announcement.id)) return false;

    const now = this.dependencies.now();
    if (announcement.cooldownKey) {
      const lastSpokenAt = this.cooldowns.get(announcement.cooldownKey);
      if (
        lastSpokenAt !== undefined &&
        now - lastSpokenAt < (announcement.cooldownMs ?? 15 * 60 * 1000)
      ) {
        return false;
      }
      this.cooldowns.set(announcement.cooldownKey, now);
    }

    this.spokenIds.add(announcement.id);
    this.queue.push({ ...announcement, priority: announcement.priority ?? 0 });
    this.queue.sort((a, b) => b.priority - a.priority);
    this.drain();
    return true;
  }

  private stop(): void {
    this.generation += 1;
    this.queue = [];
    this.speaking = false;
    this.dependencies.stop();
  }

  private drain(): void {
    if (
      this.speaking ||
      !this.enabled ||
      !this.active ||
      !this.dependencies.canSpeak
    ) {
      return;
    }
    const next = this.queue.shift();
    if (!next) return;

    this.speaking = true;
    const utteranceGeneration = this.generation;
    const finish = () => {
      if (!this.speaking || utteranceGeneration !== this.generation) return;
      this.speaking = false;
      this.drain();
    };
    try {
      this.dependencies.speak(next.text, {
        onDone: finish,
        onStopped: finish,
        onError: finish,
      });
    } catch {
      finish();
    }
  }
}