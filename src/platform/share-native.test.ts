import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const share = vi.fn<(options: { files: string[] }) => Promise<void>>();
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    writeFile: (o: { path: string }) => {
      calls.push(`write ${o.path}`);
      return Promise.resolve({ uri: `file:///cache/${o.path}` });
    },
    deleteFile: (o: { path: string }) => {
      calls.push(`delete ${o.path}`);
      return Promise.resolve();
    },
  },
}));
vi.mock('@capacitor/share', () => ({ Share: { share } }));

const { shareFile, SHARE_CANCELED } = await import('./share-native');

beforeEach(() => {
  calls.length = 0;
  share.mockReset();
});

describe('shareFile', () => {
  it('writes the file to the cache, shares it, and deletes it after', async () => {
    share.mockResolvedValue();
    expect(await shareFile('weigh-to-go.csv', 'a,b')).toBe(true);
    expect(share).toHaveBeenCalledWith({
      title: 'weigh-to-go.csv',
      files: ['file:///cache/exports/weigh-to-go.csv'],
    });
    expect(calls).toEqual(['write exports/weigh-to-go.csv', 'delete exports/weigh-to-go.csv']);
  });

  it('says false when the reader closes the sheet, and still deletes the file', async () => {
    share.mockRejectedValue(new Error(SHARE_CANCELED));
    expect(await shareFile('a.json', '{}')).toBe(false);
    expect(calls).toContain('delete exports/a.json');
  });

  it('passes on any other failure, and still deletes the file', async () => {
    share.mockRejectedValue(new Error("Can't share while sharing is in progress"));
    await expect(shareFile('a.json', '{}')).rejects.toThrow('in progress');
    expect(calls).toContain('delete exports/a.json');
  });
});
