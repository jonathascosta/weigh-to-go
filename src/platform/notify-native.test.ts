import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ln, files } = vi.hoisted(() => {
  const files = new Map<string, string>();
  const ln = {
    display: 'prompt',
    pending: [] as { id: number }[],
    delivered: [] as { id: number }[],
    calls: [] as string[],
    listener: null as ((action: { actionId: string }) => void) | null,
  };
  return { ln, files };
});

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: () => Promise.resolve({ display: ln.display }),
    requestPermissions: () => Promise.resolve({ display: 'granted' }),
    schedule: (o: { notifications: { id: number; schedule: { at: Date } }[] }) => {
      ln.calls.push(`schedule ${o.notifications.map((n) => n.id).join(',')}`);
      expect(o.notifications.every((n) => n.schedule.at instanceof Date)).toBe(true);
      ln.pending = [
        ...ln.pending.filter((p) => !o.notifications.some((n) => n.id === p.id)),
        ...o.notifications,
      ];
      return Promise.resolve({ notifications: o.notifications });
    },
    getPending: () => Promise.resolve({ notifications: ln.pending }),
    cancel: (o: { notifications: { id: number }[] }) => {
      ln.calls.push(`cancel ${o.notifications.map((n) => n.id).join(',')}`);
      ln.pending = ln.pending.filter((p) => !o.notifications.some((n) => n.id === p.id));
      return Promise.resolve();
    },
    getDeliveredNotifications: () => Promise.resolve({ notifications: ln.delivered }),
    removeDeliveredNotificationsById: (o: { ids: number[] }) => {
      ln.delivered = ln.delivered.filter((d) => !o.ids.includes(d.id));
      return Promise.resolve();
    },
    addListener: (_: string, listener: (action: { actionId: string }) => void) => {
      ln.listener = listener;
      return Promise.resolve({ remove: () => Promise.resolve() });
    },
  },
}));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Library: 'LIBRARY' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    readFile: (o: { path: string }) => {
      const data = files.get(o.path);
      return data === undefined
        ? Promise.reject(Object.assign(new Error('missing'), { code: 'OS-PLUG-FILE-0008' }))
        : Promise.resolve({ data });
    },
    writeFile: (o: { path: string; data: string }) => {
      files.set(o.path, o.data);
      return Promise.resolve({ uri: '' });
    },
    readdir: (o: { path: string }) => {
      const prefix = o.path === '' ? '' : `${o.path}/`;
      const entries = [...files.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length));
      if (o.path !== '' && entries.length === 0) {
        return Promise.reject(Object.assign(new Error('missing'), { code: 'OS-PLUG-FILE-0008' }));
      }
      return Promise.resolve({
        files: [...new Set(entries.map((e) => e.split('/')[0]))].map((name) => ({ name })),
      });
    },
  },
}));

const { phoneNotifier } = await import('./notify-native');

const text = { title: 'Daily weigh-in', body: 'Time.' };
const plan = (...days: number[]) =>
  days.map((d) => ({ id: 20261000 + d, day: `2026-10-${String(d)}`, at: new Date(2026, 9, d, 8) }));

beforeEach(() => {
  ln.display = 'prompt';
  ln.pending = [];
  ln.delivered = [];
  ln.calls = [];
  files.clear();
});

describe('phoneNotifier', () => {
  it("reads iOS's permission", async () => {
    expect(await phoneNotifier.permission()).toBe('prompt');
    ln.display = 'denied';
    expect(await phoneNotifier.permission()).toBe('denied');
    expect(await phoneNotifier.ask()).toBe(true);
  });

  it('schedules first, then cancels only what is no longer planned', async () => {
    await phoneNotifier.replace(plan(21, 22), text);
    await phoneNotifier.replace(plan(22, 23), text);
    expect(ln.calls).toEqual(['schedule 20261021,20261022', 'schedule 20261022,20261023', 'cancel 20261021']);
    expect(ln.pending.map((p) => p.id).sort()).toEqual([20261022, 20261023]);
    await phoneNotifier.replace([], text);
    expect(ln.pending).toEqual([]);
  });

  it('takes away the shown reminders asked for', async () => {
    ln.delivered = [{ id: 20261020 }, { id: 20261021 }];
    expect(await phoneNotifier.delivered()).toEqual([20261020, 20261021]);
    await phoneNotifier.removeDelivered([20261020]);
    expect(ln.delivered).toEqual([{ id: 20261021 }]);
  });

  it('opens the weigh-in on a tap only', () => {
    const opened = vi.fn();
    phoneNotifier.onOpen(opened);
    ln.listener?.({ actionId: 'dismiss' });
    ln.listener?.({ actionId: 'tap' });
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('reads a broken setting file as none', async () => {
    files.set('settings/reminder.json', '{"on": tru');
    expect(await phoneNotifier.readSetting()).toBeNull();
  });

  it('keeps the setting in a file, none at first', async () => {
    expect(await phoneNotifier.readSetting()).toBeNull();
    await phoneNotifier.writeSetting({ on: true, time: { hour: 7, minute: 0 } });
    expect(files.has('settings/reminder.json')).toBe(true);
    expect(await phoneNotifier.readSetting()).toEqual({ on: true, time: { hour: 7, minute: 0 } });
  });
});
