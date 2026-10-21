import type { FileBackend } from './device-store';

/**
 * Files in memory for the device store's tests, renaming as iOS does: the old file is deleted
 * first, then the new one moved. Switches make operations fail: `write`, `read` (every one, while
 * set), `rename` (before anything moves) and `move` (the next rename, after the delete: only the
 * moved file is left behind, once).
 */
export function fakeFiles(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const fail = { write: false, read: false, rename: false, move: false };
  const backend: FileBackend = {
    read: (name) =>
      fail.read ? Promise.reject(new Error('read failed')) : Promise.resolve(files.get(name) ?? null),
    write: (name, text) => {
      if (fail.write) return Promise.reject(new Error('disk full'));
      files.set(name, text);
      return Promise.resolve();
    },
    rename: (from, to) => {
      const text = files.get(from);
      if (fail.rename || text === undefined) return Promise.reject(new Error('rename failed'));
      files.delete(to);
      if (fail.move) {
        fail.move = false;
        return Promise.reject(new Error('move failed'));
      }
      files.delete(from);
      files.set(to, text);
      return Promise.resolve();
    },
    remove: (name) => {
      files.delete(name);
      return Promise.resolve();
    },
  };
  return { files, fail, backend };
}
