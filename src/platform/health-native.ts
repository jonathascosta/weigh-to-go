/**
 * Apple Health through the app's own Swift plugin (ios/App/App/WeightHealthPlugin.swift): body mass
 * read and written with this app's sync identifier per day. Loaded only in the app's build.
 */
import { registerPlugin } from '@capacitor/core';
import type { HealthBackend } from '../health/layer';
import type { HealthSample, SampleToWrite } from '../health/reconcile';

interface WeightHealthPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ write: boolean }>;
  read(options: { from?: string }): Promise<{ samples: HealthSample[] }>;
  write(options: { samples: readonly SampleToWrite[] }): Promise<void>;
  remove(options: { syncIds: readonly string[] }): Promise<{ deleted: number }>;
}

const WeightHealth = registerPlugin<WeightHealthPlugin>('WeightHealth');

export const appleHealth: HealthBackend = {
  available: async () => (await WeightHealth.isAvailable()).available,
  authorize: async () => (await WeightHealth.requestAuthorization()).write,
  read: async () => (await WeightHealth.read({})).samples,
  write: async (samples) => {
    if (samples.length > 0) await WeightHealth.write({ samples });
  },
  remove: async (syncIds) => (syncIds.length > 0 ? (await WeightHealth.remove({ syncIds })).deleted : 0),
};
