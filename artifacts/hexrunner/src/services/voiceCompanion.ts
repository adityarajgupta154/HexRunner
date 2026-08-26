import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import {
  VoiceCompanionController,
  type VoiceAnnouncement,
} from './voiceCompanionController';

const PREFERENCE_KEY = '@hexrunner/voice-companion-enabled';

class VoiceCompanion {
  private enabled = false;
  private readonly controller = new VoiceCompanionController({
    canSpeak: Platform.OS !== 'web',
    now: () => Date.now(),
    speak: (text, callbacks) => {
      Speech.speak(text, {
        rate: 0.95,
        pitch: 1,
        ...callbacks,
      });
    },
    stop: () => {
      void Speech.stop();
    },
  });

  async loadPreference(): Promise<boolean> {
    try {
      this.enabled = (await AsyncStorage.getItem(PREFERENCE_KEY)) === 'true';
    } catch {
      this.enabled = false;
    }
    this.controller.setEnabled(this.enabled);
    return this.enabled;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    try {
      await AsyncStorage.setItem(PREFERENCE_KEY, String(enabled));
    } catch {
      // The in-memory choice remains effective for this session.
    }
    this.controller.setEnabled(enabled);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  beginRun(): void {
    this.controller.beginRun();
  }

  endRun(): void {
    this.controller.endRun();
  }

  pause(): void {
    this.controller.pause();
  }

  resume(): void {
    this.controller.resume();
  }

  announce(announcement: VoiceAnnouncement): boolean {
    return this.controller.announce(announcement);
  }
}

export const voiceCompanion = new VoiceCompanion();