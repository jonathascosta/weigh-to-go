// @vitest-environment happy-dom
/**
 * Your data's settings rows (the value as text under the label, the select laid over the row) and
 * About, in the website's words and the app's (design §7).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../data/fake-storage.test-helper';
import { choose, resetSettings, settings } from '../i18n';
import { mountSettings } from '../settings-ui';
import { mountAbout } from './about';
import { dayParts } from './log';

beforeEach(() => {
  resetSettings();
  vi.stubGlobal('localStorage', fakeStorage());
  Object.defineProperty(navigator, 'languages', { value: ['en-US'], configurable: true });
  choose({ lang: 'en' });
  document.body.replaceChildren();
});
afterEach(() => {
  resetSettings();
  vi.unstubAllGlobals();
});

describe('the settings rows', () => {
  const mount = () => {
    const box = document.createElement('div');
    document.body.append(box);
    const stop = mountSettings(box);
    const row = (id: string) => {
      const select = box.querySelector<HTMLSelectElement>(`#${id}`)!;
      const face = select.closest('.row')!;
      return {
        select,
        label: face.querySelector('label')!.textContent,
        value: face.querySelector('.row-sub')!.textContent,
        hidden: face.querySelector('.row-sub')!.getAttribute('aria-hidden'),
      };
    };
    return { box, row, stop };
  };

  it('show each value as text under its label, the select named by the label', () => {
    const { row, box } = mount();
    expect(row('setting-lang')).toMatchObject({ label: 'Language · Idioma', value: 'English' });
    expect(row('setting-weight')).toMatchObject({ label: 'Weight unit', value: 'Automatic (lb)' });
    expect(row('setting-height')).toMatchObject({ label: 'Height unit', value: 'Automatic (ft and in)' });
    // The select says its value itself; the text is for the eye.
    expect(row('setting-height').hidden).toBe('true');
    expect(box.querySelectorAll('.row-select')).toHaveLength(3);
    // The select comes first, so the row's face after it draws its focus ring.
    for (const select of box.querySelectorAll('select'))
      expect(select.nextElementSibling?.className).toBe('row-face');
  });

  it('change the language and the units, and go back to automatic', () => {
    const { row } = mount();
    const pick = (id: string, value: string) => {
      const { select } = row(id);
      select.value = value;
      select.dispatchEvent(new Event('change'));
    };
    pick('setting-height', 'cm');
    expect(settings().heightUnit).toBe('cm');
    expect(row('setting-height').value).toBe('cm');
    pick('setting-height', 'auto');
    expect(settings().chosen.heightUnit).toBeNull();
    expect(row('setting-height').value).toBe('Automatic (ft and in)');
    pick('setting-lang', 'pt');
    expect(settings().locale.lang).toBe('pt');
    expect(row('setting-lang')).toMatchObject({ label: 'Idioma · Language', value: 'Português' });
    pick('setting-weight', 'kg');
    expect(row('setting-weight')).toMatchObject({ label: 'Unidade de peso', value: 'kg' });
    expect(row('setting-height')).toMatchObject({
      label: 'Unidade de altura',
      value: 'Automático (pés e pol.)',
    });
  });
});

describe('About', () => {
  const mount = (inApp: boolean) => {
    const box = document.createElement('section');
    document.body.append(box);
    const draw = mountAbout(box, inApp);
    draw(settings());
    return { box, draw };
  };

  it('says on the website where the data is, and links the policy in the reader’s language', () => {
    const { box, draw } = mount(false);
    expect(box.querySelector('h2')!.textContent).toBe('About');
    expect(box.textContent).toContain(
      'Everything runs in your browser: your weigh-ins are stored on this device only. No account, no server of ours, no tracking.',
    );
    expect(box.textContent).not.toContain('Google AdMob');
    expect(box.querySelector('#about-policy')!.getAttribute('href')).toBe('/privacy.html');
    expect(box.textContent).toContain(`Weigh to Go ${__APP_VERSION__} · Made by Jonathas Costa`);
    draw(choose({ lang: 'pt' }));
    expect(box.querySelector('#about-policy')!.getAttribute('href')).toBe('/pt/privacidade.html');
    expect(box.querySelector('#about-policy')!.textContent).toBe('Política de privacidade');
    expect(box.textContent).toContain('Feito por Jonathas Costa');
  });

  it('speaks of the app in the app, with Apple Health, the ads and the bundled policy', () => {
    const { box, draw } = mount(true);
    expect(box.textContent).toContain('Your weigh-ins stay in this app on your iPhone');
    expect(box.textContent).toContain('If you turn on Apple Health, weights are shared with Health');
    // The ads, as design §7 words them (decision 109: they come with the ads).
    expect(box.textContent).toContain(
      'Ads come from Google AdMob: they are not personalised and never receive your weigh-ins, but Google gets what any ad request carries, such as the iPhone’s model and network address. Removing the ads stops those requests.',
    );
    expect(box.textContent).not.toMatch(/browser/);
    expect(box.querySelector('#about-policy')!.getAttribute('href')).toBe('/privacy.html');
    draw(choose({ lang: 'pt' }));
    expect(box.textContent).toContain('Os anúncios vêm do Google AdMob: não são personalizados');
    expect(box.textContent).toContain('Ao remover os anúncios, esses pedidos param.');
    // Their own paragraph, after Apple Health's.
    const paragraphs = [...box.querySelectorAll('.about p')].map((p) => p.textContent);
    expect(paragraphs[2]).toMatch(/^Os anúncios vêm do Google AdMob/);
  });

  it('says the ads are gone and nothing goes to Google once Remove ads is held', () => {
    let held = false;
    const box = document.createElement('section');
    document.body.append(box);
    const draw = mountAbout(box, true, () => held);
    draw(settings());
    expect(box.textContent).toContain('Removing the ads stops those requests.');
    held = true;
    draw(settings());
    expect(box.textContent).toContain(
      'The ads are removed: the app no longer starts Google’s ad software, and nothing more is sent to Google.',
    );
    expect(box.textContent).not.toContain('Ads come from Google AdMob');
    draw(choose({ lang: 'pt' }));
    expect(box.textContent).toContain(
      'Os anúncios foram removidos: o app não inicia mais o software de anúncios do Google, e nada mais é enviado ao Google.',
    );
  });

  it('links the App Store on the website once the app is there, and never in the app', () => {
    const url = 'https://apps.apple.com/app/id1234567890';
    // By default, what the build was given (scripts/app-store.mjs): nothing until APP_STORE_ID is set.
    const byDefault = mount(false).box.querySelector('#about-app-store');
    if (__APP_STORE_URL__ === '') expect(byDefault).toBeNull();
    else expect(byDefault?.getAttribute('href')).toBe(__APP_STORE_URL__);
    const none = document.createElement('section');
    mountAbout(none, false, () => false, '')(settings());
    expect(none.querySelector('#about-app-store')).toBeNull();
    const web = document.createElement('section');
    const drawWeb = mountAbout(web, false, () => false, url);
    drawWeb(settings());
    const link = web.querySelector('#about-app-store')!;
    expect(link.getAttribute('href')).toBe(url);
    // The link is named by where it goes ("App Store" never split over two lines); the backup,
    // how a web diary moves to the app, follows it as text in the same line (WCAG 2.4.4).
    expect(link.textContent).toBe('Weigh to Go for iPhone, on the App\u00a0Store');
    expect(link.parentElement!.textContent).toBe(
      'Weigh to Go for iPhone, on the App\u00a0Store. A backup brings your diary with you.',
    );
    // A link on a line of its own, 44 px high like the policy's (styles.css, .about-link.own-line).
    expect(link.classList.contains('own-line')).toBe(true);
    expect(web.querySelector('#about-policy')!.classList.contains('own-line')).toBe(true);
    drawWeb(choose({ lang: 'pt' }));
    expect(link.textContent).toBe('O Weigh to Go para iPhone, na App\u00a0Store');
    expect(link.parentElement!.textContent).toBe(
      'O Weigh to Go para iPhone, na App\u00a0Store. Um backup leva seu diário junto.',
    );
    const app = document.createElement('section');
    mountAbout(app, true, () => false, url)(settings());
    expect(app.querySelector('#about-app-store')).toBeNull();
  });
});

describe('a day in the log', () => {
  const pieces = (text: string) =>
    dayParts(text)
      .map((p) => (typeof p === 'string' ? p : `[${p.textContent}]`))
      .join('');

  it('breaks after a comma and before the year, never inside a day and month', () => {
    expect(pieces('21 de out. de 2026')).toBe('[21 de out.] [de] [2026]');
    expect(pieces('qua., 21 de out. de 2025')).toBe('[qua.,] [21 de out.] [de] [2025]');
    expect(pieces('Wed, Oct 21, 2025')).toBe('[Wed,] [Oct 21,] [2025]');
    expect(pieces('21 Oct 2026')).toBe('[21 Oct] [2026]');
    expect(pieces('qua., 21 de out.')).toBe('[qua.,] [21 de out.]');
    expect(pieces('Wed 30 Sept')).toBe('[Wed] [30 Sept]');
    expect(pieces('Wed 30 Sept 2025')).toBe('[Wed] [30 Sept] [2025]');
  });
});
