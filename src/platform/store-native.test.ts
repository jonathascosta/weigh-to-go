import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_PROFILE } from '../data/records';
import { memoryStore, type Store } from '../data/store';

const { disk, fs, old } = vi.hoisted(() => {
  const disk = new Map<string, string>();
  const noFile = () => Object.assign(new Error('File does not exist'), { code: 'OS-PLUG-FILE-0008' });
  const fs = {
    readError: null as Error | null,
    readFile: (o: { path: string }) => {
      if (fs.readError) return Promise.reject(fs.readError);
      const data = disk.get(o.path);
      return data === undefined ? Promise.reject(noFile()) : Promise.resolve({ data });
    },
    writeFile: (o: { path: string; data: string }) => {
      disk.set(o.path, o.data);
      return Promise.resolve({ uri: `file:///library/${o.path}` });
    },
    rename: (o: { from: string; to: string }) => {
      const data = disk.get(o.from);
      if (data === undefined) return Promise.reject(noFile());
      disk.delete(o.from);
      disk.set(o.to, data);
      return Promise.resolve();
    },
    deleteFile: (o: { path: string }) => (disk.delete(o.path) ? Promise.resolve() : Promise.reject(noFile())),
  };
  return { disk, fs, old: { store: null as Store | null, deleted: 0 } };
});

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Library: 'LIBRARY' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: fs,
}));
vi.mock('../data/store', async (original) => ({
  ...(await original<typeof import('../data/store')>()),
  openStore: () => Promise.resolve(old.store ?? memoryStore()),
  deleteDatabase: () => {
    old.deleted++;
    return Promise.resolve(true);
  },
}));

const { libraryFiles, openNativeStore } = await import('./store-native');

const weighIn = { date: '2026-10-17', kg: 100, savedAt: '2026-10-17T08:00:00.000Z' };

beforeEach(() => {
  disk.clear();
  fs.readError = null;
  old.store = null;
  old.deleted = 0;
});

describe('libraryFiles', () => {
  it('reads a missing file as none, in the diary folder', async () => {
    expect(await libraryFiles.read('weigh-ins.json')).toBeNull();
    await libraryFiles.write('weigh-ins.json', '{}');
    expect([...disk.keys()]).toEqual(['diary/weigh-ins.json']);
    expect(await libraryFiles.read('weigh-ins.json')).toBe('{}');
  });

  it('never takes a file it fails to read for a missing one', async () => {
    fs.readError = Object.assign(new Error('Permission denied'), { code: 'OS-PLUG-FILE-0012' });
    await expect(libraryFiles.read('weigh-ins.json')).rejects.toThrow('Permission denied');
  });

  it('removes a file, and a missing one without complaint', async () => {
    await libraryFiles.write('a.json', '1');
    await libraryFiles.remove('a.json');
    await libraryFiles.remove('a.json');
    expect(disk.size).toBe(0);
  });
});

describe('openNativeStore', () => {
  it("brings over an earlier build's IndexedDB diary on the first opening, then deletes the database", async () => {
    const earlier = memoryStore();
    await earlier.put([weighIn], { goalKg: 90, heightCm: null });
    old.store = { ...earlier, kind: 'indexeddb', reason: null };
    const store = await openNativeStore();
    expect(await store.weighIns()).toEqual([weighIn]);
    expect(await store.profile()).toEqual({ goalKg: 90, heightCm: null });
    expect(disk.has('diary/weigh-ins.json')).toBe(true);
    expect(old.deleted).toBe(1);
  });

  it('starts empty, touching no database, when there was none', async () => {
    const store = await openNativeStore();
    expect(await store.weighIns()).toEqual([]);
    expect(await store.profile()).toEqual(EMPTY_PROFILE);
    expect(old.deleted).toBe(0);
  });
});
