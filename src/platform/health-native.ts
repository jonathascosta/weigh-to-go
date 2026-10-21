/**
 * Apple Health through the app's own Swift plugin (ios/App/App/WeightHealthPlugin.swift): body mass
 * read and written with this app's sync identifier per day. Loaded only in the app's build.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { HealthBackend, WriteStatus } from '../health/layer';
import type { HealthSample, SampleToWrite } from '../health/reconcile';

interface WeightHealthPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  requestAuthorization(): Promise<{ write: boolean }>;
  writeStatus(): Promise<{ status: WriteStatus }>;
  read(): Promise<{ samples: HealthSample[] }>;
  write(options: { samples: readonly SampleToWrite[] }): Promise<void>;
  remove(options: { syncIds: readonly string[] }): Promise<{ deleted: number }>;
  removeAll(): Promise<{ deleted: number }>;
}

const WeightHealth = registerPlugin<WeightHealthPlugin>('WeightHealth');

/** Whether the native plugin is registered: logged as an error if not, so the simulator check fails. */
function registered(): boolean {
  if (Capacitor.isPluginAvailable('WeightHealth')) return true;
  console.error('weigh-to-go: the WeightHealth plugin is not registered');
  return false;
}

export const appleHealth: HealthBackend = {
  available: async () => registered() && (await WeightHealth.isAvailable()).available,
  authorize: async () => (await WeightHealth.requestAuthorization()).write,
  writeStatus: async () => (await WeightHealth.writeStatus()).status,
  read: async () => (await WeightHealth.read()).samples,
  write: async (samples) => {
    if (samples.length > 0) await WeightHealth.write({ samples });
  },
  remove: async (syncIds) => (syncIds.length > 0 ? (await WeightHealth.remove({ syncIds })).deleted : 0),
  removeAll: async () => (await WeightHealth.removeAll()).deleted,
};
