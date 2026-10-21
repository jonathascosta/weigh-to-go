import { afterEach, describe, expect, it, vi } from 'vitest';

const shareFile = vi.fn(() => Promise.resolve(false));
vi.mock('./share-native', () => ({ shareFile }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('saveFile', () => {
  it('hands the file to the share sheet in the iPhone app, and says when it was cancelled', async () => {
    vi.stubEnv('MODE', 'ios');
    const { saveFile } = await import('./save');
    expect(await saveFile('a.csv', 'x', 'text/csv')).toBe(false);
    expect(shareFile).toHaveBeenCalledWith('a.csv', 'x');
  });
});
