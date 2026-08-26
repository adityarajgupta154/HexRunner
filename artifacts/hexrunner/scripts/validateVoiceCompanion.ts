import assert from 'node:assert/strict';
import {
  VoiceCompanionController,
  isCurrentSafetyAnnouncement,
} from '../src/services/voiceCompanionController.ts';

function createHarness(canSpeak = true) {
  let now = 1_000;
  let stopped = 0;
  const spoken: string[] = [];
  const callbacks: Array<{
    onDone: () => void;
    onStopped: () => void;
    onError: () => void;
  }> = [];
  const controller = new VoiceCompanionController({
    canSpeak,
    now: () => now,
    speak: (text, nextCallbacks) => {
      spoken.push(text);
      callbacks.push(nextCallbacks);
    },
    stop: () => {
      stopped += 1;
    },
  });
  return {
    controller,
    spoken,
    callbacks,
    get stopped() {
      return stopped;
    },
    advance(ms: number) {
      now += ms;
    },
  };
}

{
  const test = createHarness();
  test.controller.setEnabled(true);
  test.controller.beginRun();
  assert.equal(test.controller.announce({ id: 'km:1', text: 'One kilometre.' }), true);
  assert.equal(test.controller.announce({ id: 'km:1', text: 'Duplicate.' }), false);
  assert.deepEqual(test.spoken, ['One kilometre.']);

  test.controller.announce({ id: 'territory:1', text: 'Territory.', priority: 20 });
  test.controller.announce({ id: 'contest:1', text: 'Contest.', priority: 10 });
  test.controller.announce({ id: 'safety:1', text: 'Safety.', priority: 100 });
  test.callbacks[0].onDone();
  assert.deepEqual(test.spoken, ['One kilometre.', 'Safety.']);
  test.callbacks[1].onDone();
  assert.deepEqual(test.spoken, ['One kilometre.', 'Safety.', 'Territory.']);
}

{
  const test = createHarness();
  test.controller.setEnabled(true);
  test.controller.beginRun();
  assert.equal(test.controller.announce({
    id: 'safety:a',
    text: 'Safety.',
    cooldownKey: 'safety',
    cooldownMs: 1_000,
  }), true);
  assert.equal(test.controller.announce({
    id: 'safety:b',
    text: 'Safety again.',
    cooldownKey: 'safety',
    cooldownMs: 1_000,
  }), false);
  test.advance(1_001);
  assert.equal(test.controller.announce({
    id: 'safety:c',
    text: 'Safety later.',
    cooldownKey: 'safety',
    cooldownMs: 1_000,
  }), true);
}

{
  const test = createHarness();
  test.controller.setEnabled(true);
  test.controller.beginRun();
  test.controller.announce({ id: 'km:1', text: 'One kilometre.' });
  test.controller.pause();
  assert.equal(test.stopped, 1);
  test.controller.resume();
  test.controller.setEnabled(false);
  assert.equal(test.stopped, 2);
  assert.equal(test.controller.announce({ id: 'km:2', text: 'Two kilometres.' }), false);
}

{
  const test = createHarness();
  test.controller.setEnabled(true);
  test.controller.beginRun();
  test.controller.announce({ id: 'old', text: 'Old utterance.' });
  const staleCallback = test.callbacks[0];
  test.controller.pause();
  test.controller.resume();
  test.controller.announce({ id: 'new', text: 'New utterance.' });
  staleCallback.onStopped();
  test.controller.announce({ id: 'queued', text: 'Queued utterance.' });
  assert.deepEqual(test.spoken, ['Old utterance.', 'New utterance.']);
  test.callbacks[1].onDone();
  assert.deepEqual(test.spoken, ['Old utterance.', 'New utterance.', 'Queued utterance.']);
}

{
  const test = createHarness(false);
  test.controller.setEnabled(true);
  test.controller.beginRun();
  assert.equal(test.controller.announce({ id: 'km:1', text: 'One kilometre.' }), false);
  assert.deepEqual(test.spoken, []);
}

assert.equal(isCurrentSafetyAnnouncement({
  requestedRunId: 'run-a',
  requestedAreaId: 'area-a',
  currentRunId: 'run-a',
  currentAreaId: 'area-b',
  isRunning: true,
}), false);
assert.equal(isCurrentSafetyAnnouncement({
  requestedRunId: 'run-a',
  requestedAreaId: 'area-a',
  currentRunId: 'run-b',
  currentAreaId: 'area-a',
  isRunning: true,
}), false);
assert.equal(isCurrentSafetyAnnouncement({
  requestedRunId: 'run-a',
  requestedAreaId: 'area-a',
  currentRunId: 'run-a',
  currentAreaId: 'area-a',
  isRunning: false,
}), false);
assert.equal(isCurrentSafetyAnnouncement({
  requestedRunId: 'run-a',
  requestedAreaId: 'area-a',
  currentRunId: 'run-a',
  currentAreaId: 'area-a',
  isRunning: true,
}), true);

console.log('Voice companion controller checks passed.');