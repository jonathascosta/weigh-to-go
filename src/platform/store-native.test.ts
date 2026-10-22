import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_PROFILE } from '../data/records';
import { memoryStore, type Store } from '../data/store';

const { disk, fs, old, calls } = vi.hoisted(() => {
  const calls: string[] = [];
  const disk = new Map<string, string>();
  const noFile = () => Object.assign(new Error('File does not exist'), { code: 'OS-PLUG-FILE-0008' });
  const fs = {
    readError: null as Error | null,
    readFile: (o: { path: string }) => {
      calls.push(`readFile ${o.path}`);
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
    deleteFile: (o: { path: string }) => {
      calls.push(`deleteFile ${o.path}`);
      return disk.delete(o.path) ? Promise.resolve() : Promise.reject(noFile());
    },
    // Like iOS: a folder that isn't there can't be listed; the root always can.
    readdir: (o: { path: string }) => {
      calls.push(`readdir ${o.path}`);
      const prefix = o.path === '' ? '' : `${o.path}/`;
      const entries = [...disk.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
      if (o.path !== '' && entries.length === 0) return Promise.reject(noFile());
      return Promise.resolve({
        files: [...new Set(entries.map((e) => e.split('/')[0]))].map((name) => ({ name })),
      });
    },
  };
  return { disk, fs, calls, old: { store: null as Store | null, deleted: 0, deletes: true } };
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
    return Promise.resolve(old.deletes);
  },
}));

const { libraryFiles, openNativeStore } = await import('./store-native');

const weighIn = { date: '2026-10-17', kg: 100, savedAt: '2026-10-17T08:00:00.000Z' };

beforeEach(() => {
  calls.length = 0;
  disk.clear();
  fs.readError = null;
  old.store = null;
  old.deleted = 0;
  old.deletes = true;
});

describe('libraryFiles', () => {
  it("never asks for a file that isn't there, so a first launch logs no failed call", async () => {
    expect(await libraryFiles.read('weigh-ins.json')).toBeNull();
    await libraryFiles.remove('weigh-ins.json');
    expect(calls.filter((c) => !c.startsWith('readdir'))).toEqual([]);
    await openNativeStore();
    expect(calls.filter((c) => c.startsWith('readFile') || c.startsWith('deleteFile'))).toEqual([]);
  });

  it('reads a missing file as none, in the diary folder', async () => {
    expect(await libraryFiles.read('weigh-ins.json')).toBeNull();
    await libraryFiles.write('weigh-ins.json', '{}');
    expect([...disk.keys()]).toEqual(['diary/weigh-ins.json']);
    expect(await libraryFiles.read('weigh-ins.json')).toBe('{}');
  });

  it('never takes a file it fails to read for a missing one', async () => {
    await libraryFiles.write('weigh-ins.json', '{}');
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
    await earlier.put([weighIn], { goalKg: 90, heightCm: null, birthYear: null, sex: null });
    old.store = { ...earlier, kind: 'indexeddb', reason: null };
    const store = await openNativeStore();
    expect(await store.weighIns()).toEqual([weighIn]);
    expect(await store.profile()).toEqual({ goalKg: 90, heightCm: null, birthYear: null, sex: null });
    expect(disk.has('diary/weigh-ins.json')).toBe(true);
    expect(old.deleted).toBe(1);
  });

  it('brings over a goal and height alone, too', async () => {
    const earlier = memoryStore();
    await earlier.setProfile({ goalKg: 80, heightCm: 170, birthYear: null, sex: null });
    old.store = { ...earlier, kind: 'indexeddb', reason: null };
    const store = await openNativeStore();
    expect(await store.profile()).toEqual({ goalKg: 80, heightCm: 170, birthYear: null, sex: null });
    expect(old.deleted).toBe(1);
  });

  it('erases the diary and an earlier database still there', async () => {
    const store = await openNativeStore();
    await store.put([weighIn]);
    await store.clear();
    expect(await store.weighIns()).toEqual([]);
    expect(old.deleted).toBe(1);
  });

  it("keeps the earlier database when its diary couldn't be written", async () => {
    await libraryFiles.write(
      'weigh-ins.json',
      JSON.stringify({
        app: 'weigh-to-go',
        format: 1,
        weighIns: [],
        profile: { goalKg: 90, heightCm: null, birthYear: null, sex: null },
      }),
    );
    const earlier = memoryStore();
    await earlier.put([weighIn]);
    old.store = { ...earlier, kind: 'indexeddb', reason: null };
    const write = fs.writeFile;
    fs.writeFile = () => Promise.reject(new Error('disk full'));
    try {
      const store = await openNativeStore();
      expect(await store.weighIns()).toEqual([]);
      expect(old.deleted).toBe(0);
    } finally {
      fs.writeFile = write;
    }
  });

  it("says erasing failed when the earlier database won't go", async () => {
    const store = await openNativeStore();
    old.deletes = false;
    await expect(store.clear()).rejects.toThrow("Couldn't delete");
  });

  it('lists the diary folder, empty when there is none', async () => {
    expect(await libraryFiles.list()).toEqual([]);
    await libraryFiles.write('weigh-ins.json', '{}');
    expect(await libraryFiles.list()).toEqual(['weigh-ins.json']);
  });

  it('starts empty, touching no database, when there was none', async () => {
    const store = await openNativeStore();
    expect(await store.weighIns()).toEqual([]);
    expect(await store.profile()).toEqual(EMPTY_PROFILE);
    expect(old.deleted).toBe(0);
  });
});
