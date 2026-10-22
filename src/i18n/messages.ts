/**
 * Every string the page shows, in English and Portuguese (Brazilian wording, for every Portuguese
 * reader). The Portuguese dictionary has the English one's type, so a missing key, or one that
 * takes other values, fails the type check.
 *
 * A message is text; a function of its values when it has some (already formatted, so numbers and
 * dates follow the locale), each language writing the whole sentence its own way; or a pair of
 * plural forms, picked with `count` in ./index.ts. In text, **this** is shown in bold.
 */

/** The parts of the header's summary sentence, formatted. */
export interface SummaryParts {
  readonly from: string;
  /** The weight lost or gained since the first weigh-in, without a sign. */
  readonly change: string;
  readonly share: string;
  /** "45 days". */
  readonly days: string;
  readonly lost: boolean;
  /** The weekly pace over the whole period, without a sign; null below three weigh-ins. */
  readonly pace: string | null;
  readonly paceGaining: boolean;
  /** The last 3 weeks: null when they hold too few weigh-ins. */
  readonly recent:
    | { readonly stable: true }
    | { readonly stable: false; readonly pace: string; readonly down: boolean }
    | null;
  readonly avg7: string | null;
}

/** The parts of Today's short line, formatted. */
export interface TodayParts {
  /** The change since the first weigh-in, signed: "−7.3 kg". */
  readonly change: string;
  readonly from: string;
  /** The weekly pace over the whole period, without a sign; null without one. */
  readonly pace: string | null;
  /**
   * The pace's direction when it isn't the change's (a diary that fell, then climbed back up):
   * "gaining" or "losing"; null when they agree, and the sign of the change says it.
   */
  readonly paceWay: 'gaining' | 'losing' | null;
}

/** The parts of the line under the chart, formatted. */
export interface ProjectionParts {
  readonly method: string;
  readonly pace: string;
  readonly value: string;
  readonly day: string;
  readonly band: { readonly lo: string; readonly hi: string } | null;
}

/** What a merge did, as formatted numbers of days. */
export interface MergeParts {
  readonly added: string;
  readonly updated: string;
  readonly kept: string;
  readonly unchanged: string;
}

/** The parts of the line under the % chart, formatted. */
export interface PctFootParts {
  readonly method: string;
  /** The share lost by the horizon. */
  readonly pct: string;
  readonly day: string;
  readonly weight: string;
  /** The starting weight the shares are of. */
  readonly start: string;
}

/** The parts of the line under the constant-rate chart, formatted. */
export interface CurveFootParts {
  readonly rate: string;
  readonly r2: string;
  /** The straight line, when there is one. */
  readonly line: {
    readonly perDay: string;
    readonly r2: string;
    readonly horizon: string;
    readonly curveEnd: string;
    readonly lineEnd: string;
  } | null;
  /** Whether both explain the weigh-ins about equally well. */
  readonly close: boolean;
}

/** The parts of the simulator's summary, formatted. */
export interface SimParts {
  readonly rate: string;
  /** Null when past the goal day, like day90: the summary says nothing of the days after it. */
  readonly week: string | null;
  readonly month: string | null;
  readonly year: string | null;
  readonly firstDay: string;
  readonly day90: string | null;
  /** When it reaches the target (typed) or the goal; day is null without weigh-ins to count from. */
  readonly reach: {
    readonly typed: boolean;
    readonly weight: string;
    readonly days: string;
    readonly day: string | null;
  } | null;
  /** Whether the target typed is not below the starting weight. */
  readonly targetAbove: boolean;
}

/** The parts of the hiccup rule, formatted. */
export interface RulesParts {
  /** "in the daily weigh-ins". */
  readonly basis: string;
  /** "3 days". */
  readonly days: string;
  readonly gain: string;
  /** The dip allowed, or null when any dip ends a climb. */
  readonly tolerance: string | null;
}

/** The parts of the Percentage loss card's line, formatted. */
export type PctSumParts =
  | { readonly kind: 'since'; readonly pct: string; readonly day: string }
  | { readonly kind: 'gained'; readonly pct: string; readonly day: string }
  | { readonly kind: 'goal'; readonly pct: string; readonly progress: string; readonly goal: string }
  | { readonly kind: 'reached'; readonly pct: string; readonly goal: string };

/** The parts of the Compound daily rate card's line, formatted. */
export interface RateSumParts {
  /** "0.032%", without a sign. */
  readonly rate: string;
  /** "0.21 kg", without a sign. */
  readonly week: string;
  readonly way: 'losing' | 'gaining' | 'steady';
  /** Over the last 3 weeks, or the whole period when they hold too few weigh-ins. */
  readonly recent: boolean;
  /** The last weigh-in, when it is weeks old ("23 Jun"): the 3 weeks are the diary's, to it. */
  readonly to: string | null;
}

/** The parts of the Hiccups card's line, formatted. */
export interface HiccupSumParts {
  /** "3 climbs". */
  readonly climbs: string;
  readonly single: boolean;
  /** "365 days": the period. */
  readonly days: string;
  /** The last climb: when it ended and how long it lasted ("5 days"), or null while it goes on. */
  readonly end: string | null;
  readonly lasted: string | null;
  /** While the last climb goes on: since when; else null. */
  readonly since: string | null;
}

/** The parts of the Calendar card's line, formatted. */
export interface CalendarSumParts {
  /** "3 months" for the last months, or null when the months shown hold every weigh-in. */
  readonly months: string | null;
  /** The last weigh-in's month, when it is weeks old ("Jun 2026"): the months are to it. */
  readonly to: string | null;
  /** The first weigh-in, for "Since …". */
  readonly from: string;
  /** "41 days". */
  readonly down: string;
  readonly up: string;
  /** Days with no change worth a colour, with their word ("1 steady"); null for none. */
  readonly flat: string | null;
  readonly none: string;
}

/** The parts of the Weekdays card's line, formatted. */
export interface WeekdaySumParts {
  /** The weekday of the lowest mean change, the change, and its direction as shown. */
  readonly low: string;
  readonly lowChange: string;
  readonly lowWay: 'fall' | 'rise' | 'flat';
  /** The weekday of the highest. */
  readonly high: string;
  readonly highChange: string;
  readonly highWay: 'fall' | 'rise' | 'flat';
}

const enCalendarSum = (p: CalendarSumParts): string => {
  const head =
    p.months === null
      ? `Since ${p.from}`
      : p.to === null
        ? `Last ${p.months}`
        : `In the ${p.months} to ${p.to}`;
  const flat = p.flat === null ? '' : `, ${p.flat}`;
  return `${head}: ${p.down} down, ${p.up} up${flat} and ${p.none} without a weigh-in.`;
};

const ptCalendarSum = (p: CalendarSumParts): string => {
  const head =
    p.months === null
      ? `Desde ${p.from}`
      : p.to === null
        ? `Últimos ${p.months}`
        : `Nos ${p.months} até ${p.to}`;
  const flat = p.flat === null ? '' : `, ${p.flat}`;
  return `${head}: ${p.down} de queda, ${p.up} de subida${flat} e ${p.none} sem pesagem.`;
};

/** "a, b and c" (or "a, b e c"): the summary's horizons, those before the goal. */
const listed = (items: readonly (string | null)[], and: string): string => {
  const kept = items.filter((x): x is string => x !== null);
  const lastItem = kept.pop();
  if (lastItem === undefined) return '';
  return kept.length ? `${kept.join(', ')} ${and} ${lastItem}` : lastItem;
};

const enSim = (p: SimParts): string => {
  const horizons = listed(
    [
      p.week === null ? null : `${p.week} a week`,
      p.month === null ? null : `${p.month} in 30 days`,
      p.year === null ? null : `${p.year} in a year`,
    ],
    'and',
  );
  const later = p.day90 !== null ? `; after 90 days the same rate means ${p.day90} a day.` : '.';
  let text =
    horizons !== ''
      ? `**${p.rate} a day** is ${horizons}. On the first day that is ${p.firstDay}${later}`
      : `On the first day, **${p.rate} a day** is ${p.firstDay}.`;
  if (p.reach) {
    const what = p.reach.typed ? 'the target' : 'your goal';
    text += p.reach.day
      ? ` It would reach ${what} of ${p.reach.weight} in ${p.reach.days} (${p.reach.day}).`
      : ` It would reach ${what} of ${p.reach.weight} in ${p.reach.days}.`;
  } else if (p.targetAbove) text += ' The target is not below the starting weight.';
  return text;
};

const ptSim = (p: SimParts): string => {
  const horizons = listed(
    [
      p.week === null ? null : `${p.week} por semana`,
      p.month === null ? null : `${p.month} em 30 dias`,
      p.year === null ? null : `${p.year} em um ano`,
    ],
    'e',
  );
  const later = p.day90 !== null ? `; depois de 90 dias, a mesma taxa representa ${p.day90} por dia.` : '.';
  let text =
    horizons !== ''
      ? `**${p.rate} ao dia** equivale a ${horizons}. No primeiro dia são ${p.firstDay}${later}`
      : `No primeiro dia, **${p.rate} ao dia** são ${p.firstDay}.`;
  if (p.reach) {
    const what = p.reach.typed ? 'ao peso-alvo' : 'à meta';
    text += p.reach.day
      ? ` Chegaria ${what} de ${p.reach.weight} em ${p.reach.days} (${p.reach.day}).`
      : ` Chegaria ${what} de ${p.reach.weight} em ${p.reach.days}.`;
  } else if (p.targetAbove) text += ' O peso-alvo não está abaixo do peso de partida.';
  return text;
};

const enCurveFoot = (p: CurveFootParts): string => {
  let text = `Fitted curve: **${p.rate} lost a day** (R² ${p.r2})`;
  if (p.line)
    text += `; line: **${p.line.perDay} lost a day** (R² ${p.line.r2}). In ${p.line.horizon}, the curve reaches ${p.line.curveEnd} and the line ${p.line.lineEnd}.`;
  else text += '.';
  if (p.close)
    text +=
      ' With the data so far, both models explain your weight almost equally well; the difference only shows with time.';
  return text;
};

const ptCurveFoot = (p: CurveFootParts): string => {
  let text = `Curva ajustada: perda de **${p.rate} ao dia** (R² ${p.r2})`;
  if (p.line)
    text += `; reta: perda de **${p.line.perDay} por dia** (R² ${p.line.r2}). Em ${p.line.horizon}, a curva chega a ${p.line.curveEnd} e a reta a ${p.line.lineEnd}.`;
  else text += '.';
  if (p.close)
    text +=
      ' Com os dados até agora, os dois modelos explicam o seu peso quase igualmente bem; a diferença só aparece com o tempo.';
  return text;
};

const enSummary = (p: SummaryParts): string => {
  let text = `Since ${p.from} you have ${p.lost ? 'lost' : 'gained'} **${p.change}** (${p.share} of your starting weight) in ${p.days}`;
  if (p.pace !== null)
    text += p.paceGaining ? `, gaining ${p.pace} a week on average` : `, an average of ${p.pace} a week`;
  text += '.';
  if (p.recent?.stable === true) text += ' Over the last 3 weeks it has held steady';
  else if (p.recent)
    text += ` Over the last 3 weeks it has ${p.recent.down ? 'fallen' : 'risen'} ${p.recent.pace} a week`;
  if (p.avg7 !== null)
    text += p.recent ? `, and your 7-day average is **${p.avg7}**.` : ` Your 7-day average is **${p.avg7}**.`;
  else if (p.recent) text += '.';
  return text;
};

const ptSummary = (p: SummaryParts): string => {
  let text = `Desde ${p.from} você ${p.lost ? 'perdeu' : 'ganhou'} **${p.change}** (${p.share} do peso inicial) em ${p.days}`;
  if (p.pace !== null)
    text += p.paceGaining
      ? `, um ganho médio de ${p.pace} por semana`
      : `, um ritmo médio de ${p.pace} por semana`;
  text += '.';
  if (p.recent?.stable === true) text += ' Nas últimas 3 semanas o peso ficou estável';
  else if (p.recent)
    text += ` Nas últimas 3 semanas o peso ${p.recent.down ? 'caiu' : 'subiu'} ${p.recent.pace} por semana`;
  if (p.avg7 !== null)
    text += p.recent
      ? `, e a média dos últimos 7 dias está em **${p.avg7}**.`
      : ` A média dos últimos 7 dias está em **${p.avg7}**.`;
  else if (p.recent) text += '.';
  return text;
};

export const en = {
  'page.home.title': 'Weigh to Go · A weight diary that stays on your device',
  'page.home.description':
    'Log your weigh-ins and see your trend, projections, weekly averages and more. Weigh to Go runs entirely in your browser: your data never leaves your device.',
  'page.home.ogDescription':
    'Log your weigh-ins and see your trend, projections, weekly averages and more, entirely in your browser.',
  'page.notFound.title': 'Page not found · Weigh to Go',

  skip: 'Skip to content',
  'footer.madeBy': 'Made by',
  'footer.privacy': 'Privacy',
  'frame.open': 'Open Weigh to Go in its own tab',

  'nav.label': 'Diary',
  'nav.today': 'Today',
  'nav.progress': 'Progress',
  'nav.analysis': 'Analysis',
  'nav.data': 'Your data',
  'nav.backupDue': '(backup due)',
  'empty.haveBackup': 'Have a backup? Import it here',

  'home.heading': 'Your weight diary, on your device',
  'home.lede':
    "Log a weigh-in a day and Weigh to Go shows where you're heading: the trend under the daily noise, projections, weekly averages, the days you climb back up, and more.",
  'home.privacy': 'Everything runs in your browser: your weigh-ins are stored on this device only.',
  'home.noscript': 'Weigh to Go needs JavaScript, which is turned off.',
  'home.placeholder': 'Loading your diary…',

  'notFound.heading': 'Page not found',
  'notFound.text': "There's nothing here.",
  'notFound.link': 'Go to your diary',

  // The privacy policy (privacy.html, pt/privacidade.html), one key per paragraph.
  'privacy.title': 'Privacy policy · Weigh to Go',
  'privacy.description':
    'What Weigh to Go does with your data, on the website and in the iPhone app: your weigh-ins stay on your device, and we never receive them.',
  'privacy.heading': 'Privacy policy',
  'privacy.updated': 'Last updated 22 October 2026',
  'privacy.toc': 'On this page',
  'privacy.short.heading': 'In short',
  'privacy.short.1': 'Weigh to Go runs no server of its own: no accounts, no analytics.',
  'privacy.short.2':
    'We never receive your weights or the dates of your weigh-ins. They stay on your device (and in Apple Health, if you turn it on in the app), and go only where you send them.',
  'privacy.short.3':
    'The website shows no ads, and the page itself sends nothing anywhere; GitHub, which hosts it, logs visits (see below).',
  'privacy.short.4':
    'The iPhone app shows only non-personalised ads from Google, whose ad software collects some data about the device, as described below. Buying “Remove ads” stops both.',
  'privacy.web.heading': 'The website',
  'privacy.web.storage':
    'On weightogo.jonathas.net, your diary is kept in your browser’s storage on that device, with your screen preferences, such as the language and units. Another browser or device starts empty: a backup file is the only way the diary moves between them.',
  'privacy.web.requests':
    'The site’s security policy forbids the page to load from other sites or send data. Its code and fonts come from the site itself, and so does the copy of the site’s files the browser keeps for offline use. Backups and CSV files are made in the page and saved to your device.',
  'privacy.web.host':
    'The site is served by GitHub Pages. Like any host’s, GitHub’s servers log technical details of each visit, such as your IP address and browser, as GitHub’s privacy statement describes. We don’t see those logs, and your weigh-ins are never in them.',
  'privacy.web.hostLink': 'GitHub General Privacy Statement',
  'privacy.app.heading': 'The iPhone app',
  'privacy.app.storage':
    'Everything you type stays in the app’s own files and storage on your iPhone. Like any app’s data, it is in your iPhone’s backup if you use iCloud Backup or back up to a computer; those backups are kept by Apple or on your computer, not by us. With Apple Health on, the weights you type are in Health too, which Apple keeps as it keeps the rest of your Health data.',
  'privacy.app.exports':
    'A backup or CSV file you export goes only where you send it, through the share sheet (Files, AirDrop, Mail or another app you choose); the app keeps no copy once the sheet closes. The backup holds what you typed in the app (weights, goal, height and, if you gave them, year of birth and sex); the CSV also has the days read from Apple Health.',
  'privacy.app.apple':
    'If you turn on “Share with App Developers” in your iPhone’s settings, Apple shares crash reports and statistics about how you use the app with us, as it does for every app. It is off unless you turn it on.',
  'privacy.profile.heading': 'Height, year of birth and sex',
  'privacy.profile.text':
    'You can give your height, year of birth and sex, each optional, for BMI and the body composition estimates, which are worked out on your device. They are kept with your diary and in your backup file, never sent to us or anyone else, and never read from or written to Apple Health. Erasing everything removes them.',
  'privacy.health.heading': 'Apple Health',
  'privacy.health.optional':
    'Apple Health is optional, and off until you turn it on in the app. The app then reads and writes weight only: it reads the readings of a smart scale or another app, and saves there the weights you type.',
  'privacy.health.memory':
    'What the app reads from Health stays on your iPhone, in memory while the app is open. It isn’t kept in the app’s files (only for a moment, in a CSV you export) or in its backup file, so it never reaches iCloud through us. The app reads it again from Health each time it opens.',
  'privacy.health.ads':
    'Health data is never used for ads, nor for anything but your diary in the app, and never reaches Google.',
  'privacy.health.control':
    'You control the app’s access in the Health app: tap your picture, then Apps under Privacy, Weigh to Go.',
  'privacy.reminder.heading': 'The daily reminder',
  'privacy.reminder.text':
    'The app’s daily reminder, off until you turn it on, is a set of local notifications planned on your iPhone. Nothing is sent anywhere to show them.',
  'privacy.ads.heading': 'Ads in the app',
  'privacy.ads.banner':
    'The iPhone app shows a banner ad from Google AdMob; the website shows no ads. The app shows only non-personalised ads: it never asks to track you and doesn’t use your device’s advertising identifier (IDFA).',
  'privacy.ads.collects':
    'To show ads, measure them and prevent fraud, Google’s ad software in the app (the Google Mobile Ads SDK) collects data about your device and how the ads are used: for example your IP address, the device’s model and operating system, an identifier the iPhone keeps for this app’s maker (IDFV, not the advertising identifier, IDFA), advertising data such as the ads shown and your interactions with them, an approximate location worked out from the IP address, and crash and performance data. Google uses that data as its own policies describe:',
  'privacy.ads.googlePolicy': 'Google Privacy Policy',
  'privacy.ads.googlePartners': 'How Google uses information from sites or apps that use its services',
  'privacy.ads.retention':
    'Google keeps this data for as long as its policies say. What it receives from the app never holds a weigh-in, its date or anything from Apple Health.',
  'privacy.ads.consent':
    'In the European Economic Area, the United Kingdom and Switzerland, Google’s consent message appears in the app, and the app starts Google’s ad software only once you consent. If you refuse, the app doesn’t start Google’s ad software and shows no ads.',
  'privacy.ads.consentTool':
    'The message comes from Google’s consent tool, which the app starts before any ad and which contacts Google to know whether a message is needed where you are.',
  'privacy.ads.choices':
    'There, and in US states whose laws give you choices, you can change your choices in the app, under Your data › iPhone app › “Privacy choices”.',
  'privacy.ads.remove':
    'Buying “Remove ads” stops the ads, and the app no longer starts Google’s ad software or its consent tool, so it sends Google nothing.',
  'privacy.purchase.heading': 'The purchase and ratings',
  'privacy.purchase.text':
    '“Remove ads” is a one-time purchase handled by Apple: we receive no payment details. The app checks the purchase on your iPhone, with Apple’s own tools and no purchase service in between.',
  'privacy.purchase.rating':
    'When the app asks for a rating, it uses the iPhone’s own prompt: a rating you give goes to Apple, not to us.',
  'privacy.children.heading': 'Children',
  'privacy.children.text': 'Weigh to Go isn’t made for children.',
  'privacy.delete.heading': 'Deleting everything',
  'privacy.delete.web':
    'On the website: “Your data › Erase everything”, or clear the site’s data in your browser’s settings.',
  'privacy.delete.app':
    'In the app: “Your data › Erase everything”, which can also delete the weights the app saved in Apple Health. Deleting the app erases its files but leaves those weights in Health: use “Erase everything” first, or delete them in the Health app. Earlier backups of your iPhone keep their copy until they are replaced or deleted.',
  'privacy.delete.health':
    'To take back the app’s access to Health, open the Health app, tap your picture, then Apps under Privacy, Weigh to Go.',
  'privacy.rights.heading': 'Legal bases and your rights',
  'privacy.rights.diary':
    'Your diary and your Health data: we process none of it. It stays with you, and the section above says how to delete it.',
  'privacy.rights.ads':
    'Google’s ad software: where the law asks for it, it runs on your consent, given in Google’s message; elsewhere, on our legitimate interest in funding a free app with non-personalised ads. Google’s consent tool, which asks for that consent, runs on our legitimate interest in asking, as the law requires. Google may process the data outside your country, for example in the United States.',
  'privacy.rights.messages':
    'A message you send us: we use it to answer you, on our legitimate interest in answering you.',
  'privacy.rights.ours':
    'We hold nothing about you except a message you send us, which you can ask us to show you or delete, and, if you turned it on, Apple’s anonymous crash reports and usage statistics.',
  'privacy.rights.google':
    'Google answers for the data its ad software collects: make requests about it to Google, as its privacy policy explains.',
  'privacy.rights.choices':
    'Where the app shows “Privacy choices”, you can withdraw your consent or object there at any time. Anywhere, deleting the app or buying “Remove ads” stops the collection.',
  'privacy.rights.complaint':
    'You can also complain to a data-protection authority: the ANPD in Brazil, or your local authority in the European Economic Area, the United Kingdom or Switzerland.',
  'privacy.changes.heading': 'Changes',
  'privacy.changes.text':
    'If what the app or the website does with data changes, this policy changes with it, and so does the date at the top.',
  'privacy.contact.heading': 'Who we are and contact',
  'privacy.contact.who':
    'Weigh to Go is made by Jonathas Costa, who is responsible for the data this policy describes (the controller).',
  'privacy.contact.text': 'Questions and requests go through the project’s issues on GitHub:',
  'privacy.contact.link': 'Weigh to Go’s issues on GitHub',
  'privacy.contact.public': 'Issues are public: don’t post your weights or other personal data there.',
  'privacy.contact.messages':
    'An issue, with your GitHub username, is public and stays on GitHub until it is deleted. You can edit what you wrote or delete your comments; editing keeps earlier versions in the edit history, where you or we can delete them. We’ll delete an issue you opened if you ask in it. Copies made outside our reach, such as notification emails or archives of public GitHub activity, may remain.',

  'settings.label': 'Settings',
  'settings.language': 'Language',
  'settings.weightUnit': 'Weight unit',
  'settings.heightUnit': 'Height unit',
  'settings.auto': 'Automatic',
  'settings.sections': 'Sections',
  'settings.sectionsOn': (on: number, total: number) =>
    on === total
      ? `All ${String(total)} shown`
      : on === 0
        ? 'None shown'
        : `${String(on)} of ${String(total)} shown`,
  'settings.goal': 'Goal',
  'settings.height': 'Height',
  'settings.notSet': 'Not set',
  'settings.birthYear': 'Year of birth',
  'settings.birthYearNone': 'Not set',
  // The year as typed ("1983", never grouped) and the age reached this year.
  'settings.birthYearValue': (year: string, age: string) => `${year} · ${age} this year`,
  'settings.sex': 'Sex, for the formulas',
  'profile.sex.leaveOut': 'Leave out',
  'profile.sex.leftOut': 'Left out',
  'profile.sex.female': 'Female',
  'profile.sex.male': 'Male',
  'profile.sex.help':
    'The formulas were made from data on women and men separately. Choose the one that fits your body, or leave it out: the estimates that need it won’t show.',
  'profile.note':
    'Height, year of birth and sex are used only for BMI and the body composition estimates, and stay on this device. Each is optional.',
  'profile.birthYear.change': 'Change year of birth',
  'profile.birthYear.help':
    'Only the year: the formulas use your age, which moves on by itself each January.',
  'profile.birthYear.bad': (lo: string, hi: string) =>
    `Type the year you were born, from ${lo} to ${hi}, or leave it empty to remove it. The formulas are for adults.`,
  'profile.birthYear.saved': (year: string) => `Year of birth saved: ${year}.`,
  'profile.birthYear.removed': 'Year of birth removed.',
  'profile.saved': 'Details saved.',
  'profile.failed': "Couldn't save the change. Try again.",
  'unit.kg': 'kg',
  'unit.lb': 'lb',
  'unit.cm': 'cm',
  'unit.ftin': 'ft and in',

  'word.weighIn': { one: 'weigh-in', other: 'weigh-ins' },
  'word.day': { one: 'day', other: 'days' },
  'word.point': { one: 'point', other: 'points' },
  'word.month': { one: 'month', other: 'months' },

  'summary.none': 'No weigh-ins yet',
  'summary.start':
    'Log your first weigh-in to begin. The trend shows from the second, projections from the third.',
  'summary.period': (from: string, to: string, count: string) => `${from} to ${to} · ${count}`,
  'summary.periodOne': (day: string, count: string) => `${day} · ${count}`,
  'summary.first': (weight: string) =>
    `First weigh-in logged: **${weight}**. Keep logging to see your trend and projections.`,
  'summary.take': enSummary,
  'today.take': (p: TodayParts) =>
    p.pace === null
      ? `**${p.change}** since ${p.from}.`
      : `**${p.change}** since ${p.from}, ${p.paceWay === null ? '' : `${p.paceWay} `}about ${p.pace} a week.`,
  'today.spark': 'Last 30 days',
  'today.sparkMore': 'Progress',
  'today.sparkLink': 'Last 30 days, see Progress',

  'kpi.label': 'Key figures',
  'kpi.current': 'Current weight',
  'kpi.loss': 'Total loss',
  'kpi.pace': 'Average pace',
  'kpi.avg7': '7-day average',
  'kpi.min': 'Lowest',
  'kpi.max': 'Highest',
  'kpi.perWeek': (unit: string) => `${unit}/wk`,
  'kpi.on': (day: string) => `on ${day}`,
  'kpi.vsPrevious': 'vs. previous',
  'kpi.lossOf': (share: string, start: string) => `${share} of the starting ${start}`,
  'kpi.recentPace': 'Last 3 weeks:',
  'kpi.wholePeriod': 'over the whole period',
  'kpi.needsThree': 'needs 3 weigh-ins',
  'kpi.vsWeekBefore': 'vs. 7 days before',
  'kpi.window': 'over a 7-day window',
  'kpi.needsWeek': 'needs 7 days of weigh-ins',
  'kpi.today': 'today',
  'kpi.ago': (days: string) => `${days} ago`,

  'entry.title': 'Log a weigh-in',
  'entry.date': 'Date',
  'entry.weight': 'Weight',
  'entry.save': 'Save',
  'entry.example': (example: string) => `e.g. ${example}`,
  'entry.saved': (weight: string, day: string) => `Saved: ${weight} on ${day}.`,
  'entry.updated': (weight: string, day: string) => `Updated: ${weight} on ${day}.`,
  'entry.exists': (weight: string) => `There is already ${weight} on this date. Saving replaces it.`,
  'entry.badDate': 'Choose the date of the weigh-in.',
  'entry.futureDate': "That day hasn't come yet. Choose today or an earlier day.",
  'entry.badWeight': (unit: string, example: string) => `Type the weight in ${unit}, for example ${example}.`,
  'entry.failed': "Couldn't save the weigh-in. Try again.",
  'entry.reload': "Couldn't save: the diary can't reach its data. Reload the page.",
  'entry.full': "Couldn't save: this device is out of storage space.",
  'entry.today': (day: string) => `Today, ${day}`,
  'entry.last': (weight: string, when: string) => `Last: ${weight}, ${when}`,
  'entry.loggedToday': (weight: string) => `Today: ${weight}. Saving replaces it.`,
  'entry.savedSub': (change: string | null, avg7: string | null) =>
    [change === null ? null : `${change} vs. the last one`, avg7 === null ? null : `7-day average ${avg7}`]
      .filter((part) => part !== null)
      .join(' · '),
  'entry.undoHint': (seconds: string) => `Undo is available for ${seconds} seconds.`,
  'entry.undo': 'Undo',
  'entry.undone': 'Undone.',
  'entry.changedSince': 'This weigh-in changed since; nothing was undone.',
  'entry.change': 'Change',
  'entry.another': 'Another day',
  'entry.firstHint': 'Today is already in. Type your weight and press Save.',

  'paste.open': 'Paste several days at once',
  'paste.help': (example: string, unit: string) =>
    `One weigh-in per line, a date and a weight, like “${example}”. Weights are read in ${unit} unless a line says kg or lb. Days already logged are replaced.`,
  'paste.label': 'Weigh-ins to import',
  'paste.button': 'Import lines',
  'paste.confirm': 'Yes, import',
  'paste.cancel': 'Cancel',
  'paste.overwrites': (days: string) =>
    `${days} already logged will get the weight from the paste instead. Import anyway?`,
  'paste.changed': (added: string, replaced: string) =>
    `New: ${added}. Replaced with a different weight: ${replaced}.`,
  'paste.empty': 'Paste at least one line first.',
  'paste.none': (example: string) => `No line was recognised. Use “${example}”, one per line.`,
  'paste.done': (saved: string) => `Imported ${saved}.`,
  'paste.repeated': (lines: string) => `${lines} repeated a day, so the last of each was kept.`,
  'paste.bad': (count: string) => `Lines not recognised (${count}):`,
  'paste.readAs': (line: string, day: string) => `The line “${line}” was read as ${day}. Is that right?`,
  'paste.swap': 'Read day and month the other way',
  'paste.word.line': { one: 'line', other: 'lines' },

  'chart.title': 'Weight over time',
  'chart.layers': 'Layers',
  'chart.options': 'Chart options',
  'chart.view': 'View',
  'chart.done': 'Done',
  'preset.essential': 'Essential',
  'preset.detailed': 'Detailed',
  'preset.custom': 'Custom',
  'preset.note.essential': 'Weigh-ins, the 7-day average, the projection and the goal.',
  'preset.note.detailed': 'Adds the daily line, the projection range, highest and lowest, and hiccups.',
  'preset.note.custom': 'Your own choice of layers, kept on this device.',
  'chart.estimate': 'estimate',
  'chart.rangeLabel': (lo: string, hi: string) => `likely ${lo} to ${hi}`,
  'chart.everything': 'All on',
  'chart.method': 'Projection',
  'chart.horizon': 'Horizon',
  'chart.period': 'Period',
  'chart.empty': 'Log your first weigh-in to see the chart.',
  'chart.lastWeighIn': 'last weigh-in',
  'chart.max': (weight: string) => `high ${weight}`,
  'chart.min': (weight: string) => `low ${weight}`,
  'chart.inDays': (change: string, days: string) => `${change} in ${days}`,
  'chart.roleDescription': 'chart',
  'chart.keys': 'Use the left and right arrow keys, Home and End to read each day.',
  'chart.goal': (weight: string) => `Goal ${weight}`,
  'chart.bmi': (bmi: string, weight: string) => `BMI ${bmi} · ${weight}`,
  'chart.aria': (from: string, to: string, first: string, last: string) =>
    `Chart of your weight from ${from} to ${to}, going from ${first} to ${last}. Every weigh-in is also in the table below.`,
  'chart.foot': (p: ProjectionParts) =>
    `Projection ${p.method} (${p.pace} a week): **${p.value}** on ${p.day}${p.band ? `, likely between ${p.band.lo} and ${p.band.hi}` : ''}. It extends the past pace; it is not a promise.`,
  'chart.footNone': 'The projection appears from the third weigh-in.',
  'chart.footFallback':
    'The last 3 weeks hold fewer than 5 weigh-ins, so this projection uses the whole period.',

  'layer.points': 'Weigh-ins',
  'layer.line': 'Daily line',
  'layer.avg7': '7-day average',
  'layer.trend': 'Smoothed trend',
  'layer.weekly': 'Weekly averages',
  'layer.weekRange': 'Weekly low–high range',
  'layer.regression': 'Trend line',
  'layer.projection': 'Projection',
  'layer.band': 'Projection range',
  'layer.extremes': 'Highest and lowest',
  'layer.events': 'Biggest drop and rise',
  'layer.hiccups': 'Hiccups',
  'layer.goal': 'Goal',
  'layer.bmi': 'BMI lines',

  'method.linear': 'Whole period',
  'method.recent': 'Last 3 weeks',
  'method.smoothed': 'Smoothed trend',
  'method.linear.name': 'over the whole period',
  'method.recent.name': 'over the last 3 weeks',
  'method.smoothed.name': 'by the smoothed trend',
  'period.all': 'All',

  'tip.weight': 'Weight',
  'tip.vsDay': 'vs. the day before',
  'tip.vsPrevious': 'vs. the previous weigh-in',
  'tip.avg7': '7-day average',
  'tip.trend': 'Smoothed trend',
  'tip.regression': 'Trend line',
  'tip.projection': 'Projection',
  'tip.band': 'Likely range',
  'tip.range': (lo: string, hi: string) => `${lo} to ${hi}`,
  'tip.in': 'In',
  'tip.projectionOn': (day: string) => `Projection · ${day}`,

  'word.week': { one: 'week', other: 'weeks' },
  'unit.aWeek': 'a week',
  'unit.aDay': 'a day',
  'section.blocks': 'Blocks',
  'layer.milestones': (a: string, b: string, c: string) => `Milestones ${a}, ${b}, ${c}…`,

  'pct.title': 'Percentage loss',
  'pct.note':
    'How much of your starting weight you have lost, in %. Paces, projections and milestones are in % too, so you can compare them with references like 5% or 10% of your weight.',
  'pct.block.kpis': 'Figures in %',
  'pct.block.chart': 'Chart',
  'pct.block.weekly': 'Weekly pace in %',
  'pct.block.milestones': 'Milestones table',
  'pct.kpisEmpty': 'The figures in % appear from the second weigh-in.',
  'pct.kpi.loss': 'Lost so far',
  'pct.kpi.lossOf': (start: string) => `of the starting weight of ${start}`,
  'pct.kpi.pace': 'Pace over the period',
  'pct.kpi.aMonth': (pct: string) => `about ${pct} a month`,
  'pct.kpi.recent': 'Last 3 weeks',
  'pct.kpi.vsStart': 'against the starting weight',
  'pct.kpi.last7': 'Last 7 days',
  'pct.kpi.last7Sub': '7-day average vs. 7 days before',
  'pct.kpi.vsCurrent': 'Pace vs. current weight',
  'pct.kpi.method': (method: string) => `${method}: `,
  'pct.kpi.goal': 'Goal in %',
  'pct.kpi.goalReached': 'goal reached',
  'pct.kpi.progress': (share: string) => `${share} of the way covered`,
  'pct.kpi.next': 'Next milestone',
  'pct.kpi.nextOn': (day: string) => `expected on ${day}`,
  'pct.kpi.nextNever': 'not reached at the chosen pace',
  'pct.needsRecent': 'needs 5 weigh-ins in the last 3 weeks',
  'pct.needsTwoWeeks': 'needs 2 weeks of weigh-ins',
  'pct.needsLastWeek': 'needs 4 weigh-ins in the last 7 days',
  'pct.needsWeekAgo': 'needs weigh-ins from about a week ago',
  'pct.band.rising': 'weight rising at this pace',
  'pct.band.flat': 'weight about stable',
  'pct.band.below': (lo: string, hi: string) => `below the ${lo} to ${hi} range`,
  'pct.band.within': (lo: string, hi: string) => `within the ${lo} to ${hi} range`,
  'pct.band.above': (hi: string) => `above ${hi} a week`,
  'pct.chartEmpty': 'The % chart appears from the second weigh-in.',
  'pct.aria': (from: string, to: string, lost: string) =>
    `Chart of the share of your starting weight lost, from ${from} to ${to}, now ${lost}.`,
  'pct.milestoneLine': (pct: string, weight: string) => `${pct} · ${weight}`,
  'pct.tip.loss': 'Lost so far',
  'pct.tip.weight': 'Projected weight',
  'pct.pp': (points: string) => `${points} pp`,
  'pct.foot': (p: PctFootParts) =>
    `Projection ${p.method}: **${p.pct}** lost by ${p.day} (${p.weight}). Percentages are of the starting weight of ${p.start}.`,
  'pct.weekly.title': 'Weekly pace in %',
  'pct.weekly.note': (lo: string, hi: string) =>
    `How much each week's average fell from the week before, in % of the weight. The shaded band marks ${lo} to ${hi} a week, a pace often cited as sustainable.`,
  'pct.weekly.empty': 'Appears from the second week of weigh-ins.',
  'pct.weekly.band': (lo: string, hi: string) => `${lo} to ${hi} a week`,
  'pct.weekly.aria': (weeks: string) => `Bar chart of the weekly change of the average, ${weeks}.`,
  'pct.weekly.keys': 'Use the left and right arrow keys, Home and End to read each week.',
  'pct.weekly.week': (from: string, to: string) => `Week of ${from} to ${to}`,
  'pct.weekly.drop': 'Drop',
  'pct.weekly.rise': 'Rise',
  'pct.weekly.mean': "Week's average",
  'pct.weekly.previous': 'Week before',
  'pct.weekly.noteName': 'Note',
  'pct.weekly.partialThis': 'this week has days without a weigh-in',
  'pct.weekly.partialBefore': 'the week before has days without a weigh-in',
  'pct.weekly.partialBoth': 'both weeks have days without a weigh-in',
  'pct.weekly.legendFull': 'both weeks fully logged',
  'pct.weekly.legendPartial': 'faded: this week or the one before has days without a weigh-in',
  'pct.ms.title': 'Loss milestones',
  'pct.ms.note': 'When each milestone was reached, or would be, at each projection pace.',
  'pct.ms.milestone': 'Milestone',
  'pct.ms.target': 'Target weight',
  'pct.ms.status': 'Status',
  'pct.ms.goal': (pct: string) => `Goal (${pct})`,
  'pct.ms.reached': (day: string) => `reached on ${day}`,
  'pct.ms.toGo': (weight: string) => `${weight} to go`,
  'pct.ms.never': 'never at this pace',
  'pct.ms.empty': 'The milestones appear from the first weigh-in.',
  'pct.ms.fallback': 'The last 3 weeks hold fewer than 5 weigh-ins, so that column waits for more.',

  'rate.title': 'Compound daily rate',
  'rate.note': (unit: string) =>
    `Each day's loss as a % of the weight the day before, like compound interest in reverse. At the same rate, the loss in ${unit} gets a little smaller each day, because the weight it applies to shrinks too.`,
  'rate.block.kpis': 'Rate figures',
  'rate.block.days': "Each day's rate",
  'rate.block.curve': (unit: string) => `Constant % or constant ${unit}`,
  'rate.block.simulator': 'Simulator',
  'rate.empty': 'Appears from the third weigh-in.',
  'rate.perDay': (unit: string) => `${unit}/day`,
  'rate.kpi.mean': 'Mean rate over the period',
  'rate.kpi.meanSub': (week: string) => `≈ ${week} a week, compounded`,
  'rate.kpi.fitted': 'Fitted rate',
  'rate.kpi.fittedSub': (r2: string) => `regression over every day · R² ${r2}`,
  'rate.kpi.recent': 'Last 3 weeks',
  'rate.kpi.recentSub': (week: string) => `≈ ${week} a week`,
  'rate.kpi.today': (unit: string) => `The rate in ${unit} today`,
  'rate.kpi.todaySub': (weight: string) => `at the start, the same rate meant ${weight} a day`,
  'rate.kpi.lose10': (pct: string) => `To lose ${pct} of today's weight`,
  'rate.kpi.lose10Sub': (weight: string) => `at the fitted rate, down to ${weight}`,
  'rate.kpi.diff': (days: string) => `Difference in ${days}`,
  'rate.kpi.diffSub': (pct: string, weight: string, unit: string) =>
    `constant %: ${pct} · constant ${unit}: ${weight}`,
  'rate.window': 'Window',
  'rate.layer.bars': 'Daily rate',
  'rate.layer.rolling': 'Rolling average of the rate',
  'rate.layer.mean': 'Mean rate over the period',
  'rate.days.note':
    "Bars: each day's loss in % of the weight the day before (above zero, a loss). Line: the rolling window's average rate. Dashed: the period's mean rate. When the line stays near the dashes, the rate is constant.",
  'rate.days.mean': (rate: string) => `mean ${rate} a day`,
  'rate.days.aria': (count: string) => `Bar chart of the daily rate between consecutive weigh-ins, ${count}.`,
  'rate.days.keys': 'Use the left and right arrow keys, Home and End to read each weigh-in.',
  'rate.tip.loss': 'Loss that day',
  'rate.tip.gain': 'Gain that day',
  'rate.tip.perDay': (rate: string) => `${rate} a day`,
  'rate.tip.change': 'Change',
  'rate.tip.previous': 'Previous weigh-in',
  'rate.tip.rolling': (days: string) => `Rolling average over ${days}`,
  'rate.oneYear': '1 year',
  'rate.curve.title': (unit: string) => `Constant rate or constant ${unit}?`,
  'rate.curve.note': (unit: string) =>
    `The curve assumes the same % of your weight a day; the line, the same ${unit} a day. They nearly match at first and drift apart with time.`,
  'rate.curve.constantPct': 'Constant % curve',
  'rate.curve.constantKg': (unit: string) => `Constant ${unit} line`,
  'rate.curve.simulation': 'Simulation',
  'rate.curve.aria': (from: string, to: string) =>
    `Chart of your weigh-ins from ${from}, with the constant-rate curve and the straight line projected to ${to}.`,
  'rate.curve.foot': enCurveFoot,
  'rate.tip.weighIn': 'Weigh-in',
  'rate.tip.constantPct': 'Constant %',
  'rate.tip.constantKg': (unit: string) => `Constant ${unit}`,
  'sim.title': 'Constant rate simulator',
  'sim.note': (unit: string) => `Pick a rate a day and see, day by day, what it means in ${unit}.`,
  'sim.rate': 'Rate a day',
  'sim.start': 'Starting weight',
  'sim.target': 'Target weight',
  'sim.current': 'last weigh-in',
  'sim.goal': 'your goal',
  'sim.optional': 'optional',
  'sim.mine': 'Use my current rate',
  'sim.needsRate': (lo: string, hi: string) => `Type a rate between ${lo} and ${hi} a day.`,
  'sim.needsStart': 'Type a starting weight, or log a weigh-in.',
  'sim.badStart': (unit: string, example: string) =>
    `Type the starting weight in ${unit}, for example ${example}, or leave it empty for the last weigh-in.`,
  'sim.badTarget': (unit: string, example: string) =>
    `Type the target weight in ${unit}, for example ${example}, or leave it empty.`,
  'sim.summary': enSim,
  'sim.col.day': 'Day',
  'sim.col.date': 'Date',
  'sim.col.weight': 'Weight',
  'sim.col.lossDay': 'Lost that day',
  'sim.col.lossTotal': 'Lost in total',
  'sim.col.pct': '% lost',
  'sim.row.goal': 'Goal',
  'sim.row.target': 'Target',
  'sim.partialDay': 'part of a day',

  'hiccups.title': 'Hiccups',
  'hiccups.note':
    'Stretches when your weight climbed for several days in a row and interrupted the descent. Set below what counts as a hiccup.',
  'hiccups.basis': 'Measure on',
  'hiccups.minDays': 'Climbing for at least',
  'hiccups.minGain': 'Minimum gain',
  'hiccups.tolerance': 'Dips allowed in between',
  'hiccups.basis.kg': 'Daily weigh-ins',
  'hiccups.basis.avg7': '7-day average',
  'hiccups.basis.trend': 'Smoothed trend',
  'hiccups.basisIn.kg': 'in the daily weigh-ins',
  'hiccups.basisIn.avg7': 'in the 7-day average',
  'hiccups.basisIn.trend': 'in the smoothed trend',
  'hiccups.none': 'none',
  'hiccups.upTo': (weight: string) => `up to ${weight}`,
  'hiccups.rules': (p: RulesParts) =>
    `A hiccup is a climb **${p.basis}** that lasts **${p.days} or more** from the low point to the peak and adds up to **${p.gain} or more**. ${p.tolerance === null ? 'Any dip interrupts the climb.' : `Dips of up to ${p.tolerance} in between don't interrupt it.`}`,
  'hiccups.kpis': 'Hiccup figures',
  'hiccups.empty': 'Hiccups show from the third weigh-in.',
  'hiccups.kpi.count': 'Hiccups found',
  'hiccups.kpi.countSub': (days: string) => `in ${days} of records`,
  'hiccups.kpi.countNone': 'none with the chosen rules',
  'hiccups.kpi.climbing': 'Days climbing',
  'hiccups.kpi.climbingSub': (share: string) => `${share} of the period`,
  'hiccups.kpi.regained': 'Weight regained',
  'hiccups.kpi.regainedSub': (share: string) => `sum of the climbs; ${share} of the net loss`,
  'hiccups.kpi.regainedNoLoss': 'sum of the climbs; there is no net loss to compare',
  'hiccups.kpi.biggest': 'Biggest hiccup',
  'hiccups.kpi.biggestSub': (from: string, to: string, days: string) => `${from} to ${to}, in ${days}`,
  'hiccups.kpi.back': 'Back to the weight before',
  'hiccups.kpi.backSub': (recovered: string, total: string) =>
    `on average, after the peak (recovered: ${recovered} of ${total})`,
  'hiccups.kpi.backNone': 'no hiccup recovered yet',
  'hiccups.kpi.noHiccups': 'no hiccups',
  'hiccups.kpi.now': 'Now',
  'hiccups.now.ongoing': 'In a hiccup',
  'hiccups.now.ongoingSub': (day: string, gain: string) => `since ${day}, ${gain} so far`,
  'hiccups.now.returning': 'Returning',
  'hiccups.now.returningSub': (weight: string, day: string) => `${weight} to go to the weight of ${day}`,
  'hiccups.now.none': 'No hiccup',
  'hiccups.now.recoveredOn': (day: string) => `the last one was recovered on ${day}`,
  'hiccups.now.never': 'no long climb so far',
  'hiccups.aria': (from: string, to: string, count: string) =>
    `Chart of your weight from ${from} to ${to}, with the hiccups found marked (${count}). They are also in the table below.`,
  'hiccups.legend.band': 'hiccup (from the low point to the peak)',
  'hiccups.legend.back': 'way back to the weight before the hiccup',
  'hiccups.tip.hiccup': 'Hiccup',
  'hiccups.tip.gain': 'Gain in the hiccup',
  'hiccups.col.start': 'Start',
  'hiccups.col.peak': 'Peak',
  'hiccups.col.days': 'Days climbing',
  'hiccups.col.daysShort': 'Days',
  'hiccups.col.weight': 'Weight',
  'hiccups.col.gain': 'Gain',
  'hiccups.col.gainPct': 'Gain %',
  'hiccups.col.back': 'Back to the weight before',
  'hiccups.fromTo': (from: string, to: string) => `${from} → ${to}`,
  'hiccups.backOn': (day: string, days: string) => `on ${day}, ${days} after the peak`,
  'hiccups.ongoing': 'ongoing',
  'hiccups.notYet': 'not yet',
  'hiccups.tableEmpty':
    'No hiccup with the chosen rules. Try a shorter minimum length or a smaller minimum gain.',

  'sections.kpis': 'Key figures',
  'sections.chart': 'Main chart',
  'sections.percent': 'Percentage loss',
  'sections.rate': 'Compound daily rate',
  'sections.hiccups': 'Hiccups',
  'sections.body': 'Body composition',
  'sections.goal': 'Goal',
  'sections.bmi': 'BMI',
  'sections.facts': 'Facts',
  'sections.variation': 'Day-to-day variation',
  'sections.weeks': 'Weekly averages',
  'sections.weekdays': 'Weekdays',
  'sections.calendar': 'Calendar',
  'sections.log': 'Weigh-ins',

  'goal.title': 'Goal',
  'goal.label': 'Goal weight',
  'goal.save': 'Save',
  'goal.none': 'Set a goal to see how much is left and when you would reach it at each pace.',
  'goal.noWeighIns': (goal: string) => `Your goal is ${goal}. Log a weigh-in to see the plan to reach it.`,
  'goal.reached': (unit: string, goal: string) => `${unit} below your goal of ${goal}. Goal reached.`,
  'goal.toGo': (unit: string, goal: string) => `${unit} to go to ${goal}`,
  'goal.covered': (share: string) => `${share} of the way`,
  'goal.pace.linear': 'At the pace of the whole period',
  'goal.pace.recent': 'At the pace of the last 3 weeks',
  'goal.pace.smoothed': 'At the smoothed trend’s pace',
  'goal.paceSub': (days: string, pace: string) => `in ${days}, at ${pace} a week`,
  'goal.never': 'never at this pace',
  'goal.aboveStart': (goal: string, start: string) =>
    `Your goal of ${goal} is not below your starting weight of ${start}: there is nothing to lose to reach it.`,
  'goal.saved': (goal: string) => `Goal saved: ${goal}.`,
  'goal.removed': 'Goal removed.',
  'goal.bad': (unit: string) => `Type the goal in ${unit}, or leave the field empty to remove it.`,

  'bmi.title': 'BMI',
  'bmi.height': 'Height',
  'bmi.feet': 'Feet',
  'bmi.inches': 'Inches',
  'bmi.ftTag': 'ft',
  'bmi.inTag': 'in',
  'bmi.none': 'Enter your height to see your BMI now and at the start, and the weight for each band.',
  'bmi.noWeighIns': (height: string) => `Height saved: ${height}. Log a weigh-in to see your BMI.`,
  'bmi.saved': (height: string) => `Height saved: ${height}.`,
  'bmi.removed': 'Height removed.',
  'bmi.badCm': 'Type your height in cm, between 100 and 250, or leave it empty to remove it.',
  'bmi.badFtIn': 'Type your height in whole feet and inches (under 12), or leave both empty to remove it.',
  'bmi.band.under': 'Underweight',
  'bmi.band.normal': 'Healthy weight',
  'bmi.band.over': 'Overweight',
  'bmi.band.obese1': 'Obesity class I',
  'bmi.band.obese2': 'Obesity class II',
  'bmi.band.obese3': 'Obesity class III',
  'bmi.scaleAria': (bmi: string, band: string) => `BMI ${bmi} on the scale of bands: ${band}`,
  'bmi.start': 'BMI at the start',
  'bmi.reduced': (points: string) => `down ${points} since the start`,
  'bmi.notReduced': 'not lower than at the start yet',
  'bmi.target': (bmi: string) => `Weight for a BMI below ${bmi}`,
  'bmi.toGo': (weight: string) => `${weight} to go`,
  'bmi.caveat':
    'BMI is a rough, population-level measure: it doesn’t account for muscle, age or body composition.',

  'facts.title': 'Facts',
  'facts.note': 'Records, runs and equivalences of the period.',
  'facts.empty': 'Log your first weigh-in to see the facts.',
  'facts.on': (day: string) => `on ${day}`,
  'facts.onOver': (day: string, days: string) => `on ${day}, over ${days}`,
  'facts.drop': 'Biggest drop between weigh-ins',
  'facts.rise': 'Biggest rise between weigh-ins',
  'facts.dropRun': 'Longest run of drops',
  'facts.riseRun': 'Longest run of rises',
  'facts.runEnd': (day: string) => `ending on ${day}`,
  'facts.counts': 'Drops, rises and flat days',
  'facts.countsValue': (drops: string, rises: string, flats: string) => `${drops} · ${rises} · ${flats}`,
  'facts.dropShare': (share: string) => `${share} of the comparisons were drops`,
  'facts.swing': 'Typical day-to-day swing',
  'facts.plusMinus': (weight: string) => `±${weight}`,
  'facts.swingDetail': 'which is why the 7-day average says more than a single weigh-in',
  'facts.range': 'Range of the period',
  'facts.rangeDetail': 'between the highest and the lowest weigh-in',
  'facts.mean': 'Average weight of the period',
  'facts.meanDetail': 'the mean of every weigh-in',
  'facts.aboveMin': 'Distance from the lowest',
  'facts.atMin': 'you are at the lowest of the period',
  'facts.minAgo': (days: string) => `the lowest was ${days} ago`,
  'facts.energy': 'Energy equivalent of the loss',
  'facts.about': (value: string) => `≈ ${value}`,
  'facts.energyDetail': (perKg: string, kg: string, days: string, diet: string) =>
    `at ${perKg} kcal per ${kg}, about ${days} days of a ${diet} kcal diet`,
  'facts.bottles': (litres: string) => `In ${litres}-litre water bottles`,
  'facts.bottlesDetail': 'the weight you no longer carry',
  'facts.bestWeek': 'Best week',
  'facts.bestWeekDetail': (day: string) => `in the average, the week of ${day}`,
  'facts.straight': 'How straight the descent was',
  'facts.straightDetail': 'fit of the trend line; 1 would be a perfect line',
  'facts.aboveTrend': 'Weigh-ins above the trend',
  'facts.of': (part: string, total: string) => `${part} of ${total}`,
  'facts.aboveTrendDetail': 'days the scale read above the smoothed trend',
  'facts.missing': 'Days without a weigh-in',
  'facts.missingDetail': (days: string) => `in a period of ${days}`,
  'facts.steady': 'Consistency',
  'facts.steadyDetail': 'every day of the period has a weigh-in',

  'variation.title': 'Day-to-day variation',
  'variation.note': (unit: string) =>
    `The change in ${unit} from the previous weigh-in. It follows the period chosen on the main chart.`,
  'variation.down': 'fell',
  'variation.up': 'rose',
  'variation.gap': 'faded: over more than one day',
  'variation.empty': 'The variation appears from the second weigh-in.',
  'variation.none': 'No changes in this period.',
  'variation.aria': (count: string) => `Bar chart of the change from the previous weigh-in, ${count}.`,

  'weekdays.title': 'Weekdays',
  'weekdays.note': 'The mean change from the day before, for each day of the week.',
  'weekdays.empty': 'Appears once there are weigh-ins on consecutive days.',
  'weekdays.aria': 'Chart of the mean change from the day before, a row for each day of the week.',
  'weekdays.keys': 'Use the up and down arrow keys, Home and End to read each day of the week.',
  'weekdays.mean': 'Mean change',
  'weekdays.count': 'Comparisons',
  'weekdays.noData': 'no weigh-ins a day apart yet',
  'weekdays.fallsMost': (day: string, change: string) => `The day that falls most: **${day} (${change})**.`,
  'weekdays.risesLeast': (day: string, change: string) => `The day that rises least: **${day} (${change})**.`,
  'weekdays.risesMost': (day: string, change: string) => `The day that rises most: **${day} (${change})**.`,
  'weekdays.fallsLeast': (day: string, change: string) => `The day that falls least: **${day} (${change})**.`,

  'calendar.title': 'Calendar',
  'calendar.note':
    'Each square is a day. The colour shows whether the weight fell or rose, and its strength, by how much.',
  'calendar.span': 'Months',
  'calendar.months': (n: string) => `Last ${n}`,
  'calendar.down': 'fell',
  'calendar.up': 'rose',
  'calendar.flat': 'same, or nothing to compare',
  'calendar.none': 'no weigh-in',
  'calendar.strength': 'Stronger colour, bigger change.',
  'calendar.empty': 'Log your first weigh-in to see the calendar.',
  'calendar.shown': (shown: string, total: string) => `Showing the latest ${shown} (of ${total}).`,
  'calendar.earlier': (months: string) => `Show ${months} earlier`,
  'calendar.roleDescription': 'calendar',
  'calendar.aria': (count: string) =>
    `Calendar of the days, coloured by the change from the previous weigh-in, ${count}. Every weigh-in and its change are also in the Weigh-ins table.`,
  'calendar.keys':
    'Use the arrow keys to move by a day or a week, Home and End to go to the first or last day.',

  'weeks.title': 'Weekly averages',
  'weeks.note':
    'Weeks from Monday to Sunday. The bar shows the range between the week’s lowest and highest, on the same scale for every week. Change is against the week before.',
  'weeks.week': 'Week',
  'weeks.mean': (unit: string) => `Average (${unit})`,
  'weeks.bar': 'Range',
  'weeks.min': 'Low',
  'weeks.max': 'High',
  'weeks.n': 'Weigh-ins',
  'weeks.delta': 'Change',
  'weeks.range': (from: string, to: string) => `${from} – ${to}`,
  'weeks.lowHigh': (low: string, high: string) => `low ${low}, high ${high}`,
  'weeks.empty': 'No weeks yet.',
  'weeks.more': (shown: string, total: string) => `Showing the latest ${shown} weeks of ${total}.`,

  'table.label': (title: string) => `Table: ${title}`,
  'table.count': (shown: string, total: string) => `${shown} of ${total}`,
  'analysis.lede': 'Each card says its point. Open one for the detail.',
  'analysis.allHidden': 'Every analysis card is hidden.',
  'analysis.showThem': 'Show them in Your data › Settings',
  'empty.progress': 'The chart and figures appear from the second weigh-in.',
  'empty.analysis': 'The analysis cards appear from the second weigh-in.',
  'empty.log': 'Log a weigh-in',
  'card.options': 'Options',
  'card.rangeShort': (lo: string, hi: string) => `likely ${lo}–${hi}`,
  'rate.readout.rolling': (days: string) => `${days}-day average`,
  'rate.readout.loss': 'Loss',
  'rate.readout.gain': 'Gain',
  'rate.readout.none': 'No change',
  'card.rules': 'Rules',
  'card.optionsOf': (title: string) => `Options: ${title}`,
  'card.blocks': 'Show',
  'card.preset.custom': 'Your own choice of blocks and layers, kept on this device.',
  'card.needsFirst': 'Appears from the first weigh-in.',
  'card.needsSecond': 'Appears from the second weigh-in.',
  'card.needsThird': 'Appears from the third weigh-in.',
  'pct.preset.essential': 'The figures and the % chart.',
  'pct.preset.detailed': 'Adds the weekly pace in % and the milestones table.',
  'pct.sum': (p: PctSumParts) =>
    p.kind === 'since'
      ? `**${p.pct}** lost since ${p.day}.`
      : p.kind === 'gained'
        ? `**${p.pct}** gained since ${p.day}.`
        : p.kind === 'goal'
          ? `**${p.pct}** lost; ${p.progress} of the way to the ${p.goal} goal.`
          : `**${p.pct}** lost; the ${p.goal} goal is reached.`,
  'rate.preset.essential': 'The rate figures and each day’s rate.',
  'rate.preset.detailed': 'Adds the constant-% curve and the simulator.',
  'rate.sum': (p: RateSumParts) => {
    const over = !p.recent
      ? 'over the whole period'
      : p.to === null
        ? 'over the last 3 weeks'
        : `over the last 3 weeks of the diary, to ${p.to}`;
    if (p.way === 'steady') return `Steady ${over}: **${p.rate} a day**.`;
    return `${p.way === 'losing' ? 'Losing' : 'Gaining'} **${p.rate} a day** ${over}, about ${p.week} a week.`;
  },
  'word.climb': { one: 'climb', other: 'climbs' },
  'hiccups.rulesTitle': 'Hiccup rules',
  'hiccups.sum': (p: HiccupSumParts) => {
    if (p.single)
      return p.since === null
        ? `**${p.climbs}** back up in ${p.days}: it ended on ${String(p.end)} and lasted ${String(p.lasted)}.`
        : `**${p.climbs}** back up in ${p.days}, since ${p.since} and still going on.`;
    return p.since === null
      ? `**${p.climbs}** back up in ${p.days}; the last, ending on ${String(p.end)}, lasted ${String(p.lasted)}.`
      : `**${p.climbs}** back up in ${p.days}; the last, since ${p.since}, is still going on.`;
  },
  'hiccups.sumNone': 'No climbs back up under the current rules.',
  'goal.change': 'Change goal',
  'bmi.change': 'Change height',
  'bmi.sum': (now: string, diff: string, way: 'lower' | 'higher' | 'same', on: string | null) => {
    const when = on === null ? 'now' : `on ${on}`;
    return way === 'same'
      ? `**${now}** ${when}, the same as at the start.`
      : `**${now}** ${when}, ${diff} ${way} than at the start.`;
  },
  'bmi.sumNone': 'Add your height to see it.',
  'body.title': 'Body composition (estimates)',
  'body.sum': (fat: string, bmr: string, on: string | null) =>
    on === null
      ? `Estimated **${fat}** body fat and **${bmr}** a day at rest, from formulas.`
      : `On ${on}, estimated **${fat}** body fat and **${bmr}** a day at rest, from formulas.`,
  'body.sumLean': (lean: string, water: string | null, on: string | null) => {
    const what =
      water === null
        ? `lean mass **${lean}**, from a formula`
        : `lean mass **${lean}** and body water **${water}**, from formulas`;
    return `${on === null ? 'Estimated' : `On ${on}, estimated`} ${what}.`;
  },
  'body.sumNeeds': 'Appears once your height, year of birth and sex are set.',
  'body.adults': 'These estimates are for adults: the formulas were made from adults’ data.',
  'body.adultsFrom': 'They start from your weigh-ins in the year you turn 18.',
  'body.needs':
    'These estimates use your height, year of birth and sex. Each one is optional and stays on this device.',
  'body.caveat':
    'Estimates from formulas, not measurements. They follow your weight, and can’t tell a change in fat from a change in muscle.',
  'body.change': 'Change details',
  'body.fat': 'Body fat',
  'body.lean': 'Lean mass',
  'body.water': 'Body water',
  'body.bmr': 'Calories at rest (BMR)',
  'body.chips': 'Estimate on the chart',
  'body.chip.fat': 'Body fat',
  'body.chip.lean': 'Lean mass',
  'body.chip.water': 'Water',
  'body.chip.bmr': 'BMR',
  'body.kcalDay': (n: string) => `${n}\u00a0kcal a day`,
  'body.kcal': (n: string) => `${n}\u00a0kcal`,
  'body.litres': (n: string) => `${n}\u00a0L`,
  'body.waterShare': (pct: string) => `${pct} of your weight`,
  'body.atStart': (value: string) => `${value} at the start`,
  'body.sameAsStart': 'the same as at the start',
  'body.err.fat': 'Deurenberg formula, about ±4\u2060–\u20605\u00a0points',
  'body.err.lean': (weight: string) => `Boer formula, about ±${weight}`,
  'body.err.water': 'Watson formula, about ±4\u00a0L',
  'body.err.bmr': 'Mifflin-St Jeor formula, about ±10%',
  'body.needsYear': 'Needs your year of birth',
  'body.range': (lo: string, hi: string) => `range ${lo}–${hi}`,
  'body.legend.line': 'Estimate at each weigh-in',
  'body.legend.band': 'The formula’s usual error',
  'body.chart.fat': 'Body fat estimate over time (Deurenberg formula)',
  'body.chart.lean': 'Lean mass estimate over time (Boer formula)',
  'body.chart.water': 'Body water estimate over time (Watson formula)',
  'body.chart.bmr': 'Calories at rest estimate over time (Mifflin-St Jeor formula)',
  'body.aria': (first: string, last: string, value: string, range: string) =>
    `From ${first} to ${last}; at the last weigh-in ${value}, ${range}.`,
  'body.about': 'About the formulas',
  'body.about.bmr':
    '**BMR**, Mifflin-St Jeor (1990): the energy your body uses at complete rest, from weight, height, age and sex. Within about 10% for most adults, more for some. A whole day uses more, since moving and digesting add to it.',
  'body.about.fat':
    '**Body fat**, Deurenberg (1991): from BMI, age and sex. About 4\u2060–\u20605 points either way; it reads too high for very muscular people, and is less sure at a very high or very low BMI.',
  'body.about.lean': (weight: string) =>
    `**Lean mass**, Boer (1984): everything that isn’t fat (muscle, bone, organs and water), from weight, height and sex. About ${weight} either way. It goes down a little whenever your weight does, because the formula assumes part of any loss is lean; it can’t tell whether yours is.`,
  'body.about.water':
    '**Body water**, Watson (1980): from weight, height, sex and, for men, age. About 4 litres either way. It can’t see the day-to-day swings in water that move the scale.',
  'body.about.left':
    'Muscle, bone and visceral fat aren’t shown: no formula estimates them reliably from weight. A scan measures them; body-composition scales estimate them in another way.',
  'body.about.adults':
    'The formulas were made from adults’ data, and each value uses your age in the year of that weigh-in. They are estimates for interest, not a diagnosis.',
  'facts.sum': (n: string, days: string, drop: { value: string; over: string | null } | null) =>
    drop === null
      ? `${n} in ${days}.`
      : drop.over === null
        ? `${n} in ${days}; the biggest one-day drop was ${drop.value}.`
        : `${n} in ${days}; the biggest drop was ${drop.value}, over ${drop.over}.`,
  'variation.sum': (typical: string, within: string) =>
    `A typical day moves **±${typical}**; 8 days in 10 stay within ±${within}.`,
  'variation.sumNeeds': 'Appears once there are weigh-ins on consecutive days.',
  'weekdays.sum': (p: WeekdaySumParts) =>
    `${p.lowWay === 'fall' ? 'Biggest fall' : p.lowWay === 'rise' ? 'Smallest rise' : 'Steady'}: **${p.low}** (${p.lowChange} on average); ` +
    `${p.highWay === 'rise' ? 'biggest rise' : p.highWay === 'fall' ? 'smallest fall' : 'steady'}: **${p.high}** (${p.highChange}).`,
  'weekdays.sumNeeds': 'Needs two weeks of weigh-ins.',
  'calendar.sum': enCalendarSum,
  'word.steady': { one: 'steady', other: 'steady' },
  'log.title': 'Weigh-ins',
  'log.note': 'Every weigh-in saved, newest first. Choose a day to change or delete it.',
  'log.date': 'Date',
  'log.weight': (unit: string) => `Weight (${unit})`,
  'log.change': 'Change',
  'log.avg7': '7-day average',
  'log.delete': 'Delete',
  'log.deleteDay': (day: string) => `Delete the weigh-in of ${day}`,
  'log.deleted': (day: string) => `Deleted the weigh-in of ${day}.`,
  'log.failed': "Couldn't delete the weigh-in. Try again.",
  'log.empty': 'No weigh-ins yet.',
  'log.more': (shown: string, total: string) => `Showing the latest ${shown} of ${total}.`,
  'log.showMore': 'Show more',
  'log.showAll': 'Show all',
  'log.editHint': 'Opens the day to change or delete it.',
  'log.undoFailed': "Couldn't undo: the weigh-in stays deleted. You can log it again.",
  'log.undoChangeFailed': "Couldn't undo: the new weight stays. You can change it again.",

  'data.group.backup': 'Backup',
  'data.group.app': 'iPhone app',
  'data.group.about': 'About',
  'data.due': 'Due',
  'about.web': 'No account, no server of ours, no tracking.',
  'about.app.storage':
    'Your weigh-ins stay in this app on your iPhone, and in your iPhone’s backup if you use iCloud Backup or back up to a computer. We keep nothing: no account, no server of ours, no analytics.',
  'about.app.shared': 'If you turn on Apple Health, weights are shared with Health on this iPhone.',
  'about.app.ads':
    'Ads come from Google AdMob: they are not personalised and never receive your weigh-ins, but Google gets what any ad request carries, such as the iPhone’s model and network address. Removing the ads stops those requests.',
  'ads.choices': 'Privacy choices',
  'ads.choicesFailed': 'Google’s privacy choices couldn’t open. Try again when you’re online.',
  'about.app.adsRemoved':
    'The ads are removed: the app no longer starts Google’s ad software, and nothing more is sent to Google.',
  'iap.title': 'Remove ads',
  'iap.ready': 'One payment, for good; no subscription.',
  'iap.note': (family: boolean): string =>
    `Pay once and the ads are gone straight away, on every iPhone with this Apple Account${family ? ', and for your Family Sharing group' : ''}, offline too.`,
  'iap.buy': (price: string) => `Buy · ${price}`,
  'iap.buying': 'Opening the App Store…',
  'iap.buyingButton': 'Buying…',
  'iap.pending': 'Waiting for approval. The ads go away as soon as the purchase is approved.',
  'iap.failed': 'The purchase didn’t go through. Try again later.',
  'iap.offline': 'The App Store can’t be reached. Try again when you’re online.',
  'iap.unavailable': '“Remove ads” isn’t available from the App Store just now. Try again later.',
  'iap.notAllowed':
    'Purchases are turned off on this iPhone, in Screen Time’s Content & Privacy Restrictions. Once they are allowed, come back here.',
  'iap.tryAgain': 'Try again',
  'iap.held': 'Ads removed. Thank you.',
  'iap.restore': 'Restore purchases',
  'iap.restoreNote': 'Bought on another iPhone? Get it back here.',
  'iap.restoring': 'Asking the App Store…',
  'iap.restored': 'Purchase restored.',
  'iap.restoreNone': 'No purchase to restore for this Apple Account.',
  'iap.restoreOffline': 'Couldn’t reach the App Store. Try again.',
  'iap.restoreFailed': 'Nothing was restored. Try again.',
  'about.privacy': 'Privacy policy',
  'about.version': (version: string) => `Weigh to Go ${version}`,
  'data.note':
    'Everything stays in this browser. A backup file is the only copy outside it: export one now and then, and use it to move to another device.',
  'data.export': 'Export backup',
  'data.exportCsv': 'Export CSV',
  'data.csvFormat': 'CSV format',
  'data.csvFormat.auto': (example: string) => `Automatic (${example})`,
  'data.csvFormat.semicolon': 'Semicolons, decimal comma (Excel in Portuguese and most of Europe)',
  'data.csvFormat.comma': 'Commas, decimal point (Excel in English)',
  'csv.headers': {
    date: 'date',
    weight: 'weight',
    change: 'change',
    average7: 'average_7_days',
    trend: 'trend',
    lostPct: 'lost_pct',
    bodyFat: 'body_fat_deurenberg_pct',
    leanMass: 'lean_mass_boer',
    bodyWater: 'body_water_watson_l',
    bmr: 'bmr_mifflin_kcal',
    savedAt: 'saved_at',
  },
  'data.exportFailed': "Couldn't save the file. Try again.",
  'data.import': 'Import backup',
  'data.erase': 'Erase everything',
  'data.lastBackup': (when: string) => `Last backup exported on ${when}.`,
  'data.neverBackedUp': 'No backup exported yet.',
  'data.exported': (file: string) => `Saved ${file}.`,
  'data.read': (count: string, skipped: string | null) =>
    `The file holds ${count}${skipped ? ` (${skipped} skipped)` : ''}. Add it to what is here, or replace everything?`,
  'word.record': { one: 'record', other: 'records' },
  'data.merge': 'Add to what is here',
  'data.replace': 'Replace everything',
  'data.cancel': 'Cancel',
  'data.replaceWarning': (here: string, file: string) =>
    `Replacing removes what is here (${here}) and keeps only what is in the file (${file}). Export a backup first if you may want the current data back.`,
  'data.replaceConfirm': 'Replace',
  'data.merged': (p: MergeParts) =>
    `Done. Days added: ${p.added}; updated: ${p.updated}; kept because they were newer here: ${p.kept}; already the same: ${p.unchanged}.`,
  'data.replaced': (count: string) => `Done: the diary now holds what was in the file (${count}).`,
  'data.importFailed': "Couldn't import the file. Nothing was changed.",
  'data.reload': "The diary can't reach its data. Reload the page, then try again.",
  'data.eraseWarning':
    "This erases every weigh-in, your goal, height, year of birth, sex and settings from this browser, and can't be undone. Export a backup first if you may want them back.",
  'data.eraseConfirm': 'Erase',
  'data.erased': 'Everything was erased.',
  'data.eraseFailed': "Couldn't erase everything. Reload the page and try again.",
  'backup.too-large': 'That file is too large to be a backup.',
  'backup.not-json': "That file isn't a backup: it can't be read.",
  'backup.not-a-backup': "That file isn't a Weigh to Go backup.",
  'backup.newer-format':
    'That backup comes from a newer Weigh to Go. Reload the page to update, then try again.',
  'backup.no-weigh-ins': 'That backup holds no weigh-ins that can be read.',

  'notice.memory':
    "This browser isn't letting the page keep data, so weigh-ins last only until you close it. Export a backup before you leave.",
  'notice.reload':
    "The diary can't reach its data right now, perhaps because a newer version is open in another tab. Reload the page.",
  'notice.setAside':
    "The saved diary couldn't be read in full. A copy is kept in the app as it was, and what could be read is shown. If weigh-ins are missing, import your latest backup.",
  'reminder.title': 'Daily reminder',
  'reminder.switch': 'Remind me to weigh in',
  'reminder.time': 'Time',
  'reminder.note': (days: string) =>
    `One notification a day at this time, none on a day already logged. Reminders stop after ${days} days without opening the app.`,
  'reminder.denied':
    'Notifications for Weigh to Go are off. Turn them on in Settings › Notifications › Weigh to Go and come back: the reminder starts by itself.',
  'reminder.failed': "Couldn't set the reminders. The app tries again when you come back to it.",
  'reminder.notificationTitle': 'Daily weigh-in',
  'reminder.notificationBody': 'Time for today’s weigh-in.',
  'health.title': 'Apple Health',
  'health.note':
    'Reads your weight from Apple Health, so readings from a smart scale or another app join the diary, and saves the weights you log here to it. Readings from Health stay in Health: the app reads them again each time it opens, and they are not in your backup file. A weight you type here always wins over a reading from another app.',
  'health.switch': 'Use Apple Health',
  'health.rule': 'On a day with several readings',
  'health.ruleFirst': 'The first of the day',
  'health.ruleLast': 'The last of the day',
  'health.days': (n: number, days: string) =>
    n === 0 ? 'No days from Apple Health yet.' : `${days} from Apple Health.`,
  'health.readFailed': 'Couldn’t read Apple Health just now. The app tries again when you come back.',
  'health.denied':
    'Apple Health isn’t letting Weigh to Go save weight. In the Health app, tap your picture, then Apps under Privacy, Weigh to Go, and turn on Weight.',
  'health.unavailable': 'Apple Health isn’t available on this device.',
  'health.revoke':
    'Turning this off stops reading and saving. To take back the app’s access, open the Health app, tap your picture, then Apps under Privacy, Weigh to Go.',
  'data.eraseHealth': 'Also delete the weights this app saved in Apple Health',
  'data.eraseHealthNote':
    'Readings from your scale or other apps stay in Apple Health. The app can’t take back its own access to Health: to do it, in the Health app tap your picture, then Apps under Privacy, Weigh to Go.',
  'data.erasedNotHealth':
    'Everything here was erased, but the weights in Apple Health couldn’t be deleted. In the Health app: Weight, Data Sources & Access, Weigh to Go, Delete All Data.',
  'notice.reloadButton': 'Reload',
  'update.ready': 'A new version of Weigh to Go is ready. Your weigh-ins stay where they are.',
  'install.empty':
    'This installed app keeps its own data, apart from the browser’s. If you have logged weigh-ins in the browser, export a backup there and import it here, under Your data.',
  'update.reload': 'Reload',
  'notice.noBackup':
    "Your weigh-ins live only in this browser. Export a backup, so they're safe if it clears its data.",
  'notice.oldBackup': (days: string) =>
    `Your last backup was ${days} ago. Export a new one, so recent weigh-ins are safe too.`,
};

export type Messages = typeof en;
export type MessageKey = keyof Messages;

export const pt: Messages = {
  'page.home.title': 'Weigh to Go · Um diário de peso que fica no seu aparelho',
  'page.home.description':
    'Registre suas pesagens e veja sua tendência, projeções, médias semanais e mais. O Weigh to Go funciona inteiramente no seu navegador: seus dados nunca saem do seu aparelho.',
  'page.home.ogDescription':
    'Registre suas pesagens e veja sua tendência, projeções, médias semanais e mais, inteiramente no seu navegador.',
  'page.notFound.title': 'Página não encontrada · Weigh to Go',

  skip: 'Ir para o conteúdo',
  'footer.madeBy': 'Feito por',
  'footer.privacy': 'Privacidade',
  'frame.open': 'Abrir o Weigh to Go em uma aba própria',

  'nav.label': 'Diário',
  'nav.today': 'Hoje',
  'nav.progress': 'Progresso',
  'nav.analysis': 'Análise',
  'nav.data': 'Seus dados',
  'nav.backupDue': '(backup pendente)',
  'empty.haveBackup': 'Tem um backup? Importe aqui',

  'home.heading': 'Seu diário de peso, no seu aparelho',
  'home.lede':
    'Registre uma pesagem por dia e o Weigh to Go mostra para onde você está indo: a tendência por trás do sobe e desce diário, projeções, médias semanais, os dias em que o peso volta a subir e mais.',
  'home.privacy': 'Tudo funciona no seu navegador: suas pesagens ficam guardadas só neste aparelho.',
  'home.noscript': 'O Weigh to Go precisa de JavaScript, que está desativado.',
  'home.placeholder': 'Carregando seu diário…',

  'notFound.heading': 'Página não encontrada',
  'notFound.text': 'Não tem nada aqui.',
  'notFound.link': 'Ir para o seu diário',

  'privacy.title': 'Política de privacidade · Weigh to Go',
  'privacy.description':
    'O que o Weigh to Go faz com os seus dados, no site e no app para iPhone: suas pesagens ficam no seu aparelho, e nós nunca as recebemos.',
  'privacy.heading': 'Política de privacidade',
  'privacy.updated': 'Última atualização: 22 de outubro de 2026',
  'privacy.toc': 'Nesta página',
  'privacy.short.heading': 'Em resumo',
  'privacy.short.1': 'O Weigh to Go não tem servidor próprio: nem contas, nem análise de uso.',
  'privacy.short.2':
    'Nós nunca recebemos seus pesos nem as datas das suas pesagens. Eles ficam no seu aparelho (e no app Saúde, se você ligá-lo no app) e só vão para onde você os mandar.',
  'privacy.short.3':
    'O site não mostra anúncios, e a própria página não envia nada para lugar nenhum; o GitHub, que hospeda o site, registra as visitas (veja abaixo).',
  'privacy.short.4':
    'O app para iPhone mostra só anúncios não personalizados do Google, cujo software de anúncios coleta alguns dados do aparelho, como explicado abaixo. Comprar “Remover anúncios” acaba com os dois.',
  'privacy.web.heading': 'O site',
  'privacy.web.storage':
    'No weightogo.jonathas.net, seu diário fica guardado no armazenamento do navegador, naquele aparelho, com suas preferências de tela, como o idioma e as unidades. Outro navegador ou aparelho começa vazio: um arquivo de backup é o único jeito de o diário passar de um para outro.',
  'privacy.web.requests':
    'A política de segurança do site proíbe a página de carregar coisas de outros sites ou de enviar dados. O código e as fontes vêm do próprio site, assim como a cópia dos arquivos do site que o navegador guarda para funcionar offline. Os backups e os arquivos CSV são feitos na página e salvos no seu aparelho.',
  'privacy.web.host':
    'O site é servido pelo GitHub Pages. Como os de qualquer hospedagem, os servidores do GitHub registram dados técnicos de cada visita, por exemplo o seu endereço IP e o navegador, conforme a declaração de privacidade do GitHub. Nós não vemos esses registros, e suas pesagens nunca estão neles.',
  'privacy.web.hostLink': 'Declaração de privacidade do GitHub',
  'privacy.app.heading': 'O app para iPhone',
  'privacy.app.storage':
    'Tudo o que você digita fica nos arquivos e no armazenamento do próprio app, no seu iPhone. Como os dados de qualquer app, eles entram no backup do seu iPhone, se você usa o Backup do iCloud ou faz backup no computador; esses backups ficam com a Apple ou no seu computador, não conosco. Com o app Saúde ligado, os pesos que você digita ficam lá também, guardados pela Apple como o resto dos seus dados de saúde.',
  'privacy.app.exports':
    'Um backup ou arquivo CSV que você exporta vai só para onde você o mandar, pela tela de compartilhamento (Arquivos, AirDrop, Mail ou outro app que você escolher); o app não guarda cópia depois que a tela fecha. O backup guarda o que você digitou no app (pesos, meta, altura e, se você os informou, ano de nascimento e sexo); o CSV também traz os dias lidos do app Saúde.',
  'privacy.app.apple':
    'Se você ligar “Compartilhar com Desenvolvedores de Apps” nos ajustes do iPhone, a Apple compartilha conosco relatórios de falhas e estatísticas de uso do app, como faz com todo app. Isso fica desligado, a menos que você ligue.',
  'privacy.profile.heading': 'Altura, ano de nascimento e sexo',
  'privacy.profile.text':
    'Você pode informar altura, ano de nascimento e sexo, todos opcionais, para o IMC e as estimativas de composição corporal, que são calculados no seu aparelho. Eles ficam guardados com o seu diário e no seu arquivo de backup, nunca são enviados para nós nem para ninguém, e nunca são lidos do app Saúde nem gravados nele. Apagar tudo os remove.',
  'privacy.health.heading': 'App Saúde',
  'privacy.health.optional':
    'O app Saúde é opcional e fica desligado até você ligá-lo no app. A partir daí, o app lê e grava só o peso: lê as medições de uma balança inteligente ou de outro app e salva lá os pesos que você digita.',
  'privacy.health.memory':
    'O que o app lê do app Saúde fica no seu iPhone, na memória, enquanto o app está aberto. Não fica guardado nos arquivos do app (só por um instante, num CSV que você exporta) nem no arquivo de backup dele, então nunca chega ao iCloud por nós. O app lê tudo de novo do app Saúde cada vez que abre.',
  'privacy.health.ads':
    'Os dados do app Saúde nunca são usados para anúncios, nem para nada além do seu diário no app, e nunca chegam ao Google.',
  'privacy.health.control':
    'Você controla o acesso do app no app Saúde: toque na sua foto, depois em Apps, em Privacidade, e em Weigh to Go.',
  'privacy.reminder.heading': 'O lembrete diário',
  'privacy.reminder.text':
    'O lembrete diário do app, desligado até você ligá-lo, é um conjunto de notificações locais programadas no seu iPhone. Nada é enviado para lugar nenhum para mostrá-las.',
  'privacy.ads.heading': 'Anúncios no app',
  'privacy.ads.banner':
    'O app para iPhone mostra um banner de anúncio do Google AdMob; o site não mostra anúncios. O app mostra só anúncios não personalizados: nunca pede para rastrear você e não usa o identificador de publicidade do seu aparelho (IDFA).',
  'privacy.ads.collects':
    'Para mostrar os anúncios, medi-los e evitar fraudes, o software de anúncios do Google no app (o Google Mobile Ads SDK) coleta dados do seu aparelho e do uso dos anúncios: por exemplo o seu endereço IP, o modelo e o sistema operacional do aparelho, um identificador que o iPhone guarda para quem fez este app (IDFV, não o identificador de publicidade, IDFA), dados de publicidade, como os anúncios mostrados e suas interações com eles, uma localização aproximada obtida do endereço IP e dados de falhas e de desempenho. O Google usa esses dados como descrevem as políticas dele:',
  'privacy.ads.googlePolicy': 'Política de Privacidade do Google',
  'privacy.ads.googlePartners': 'Como o Google usa as informações de sites ou apps que usam os serviços dele',
  'privacy.ads.retention':
    'O Google guarda esses dados pelo tempo que as políticas dele dizem. O que ele recebe do app nunca traz uma pesagem, a data dela nem nada do app Saúde.',
  'privacy.ads.consent':
    'No Espaço Econômico Europeu, no Reino Unido e na Suíça, a mensagem de consentimento do Google aparece no app, e o app só inicia o software de anúncios do Google depois que você consente. Se você recusar, o app não inicia o software de anúncios do Google e não mostra anúncios.',
  'privacy.ads.consentTool':
    'A mensagem vem da ferramenta de consentimento do Google, que o app inicia antes de qualquer anúncio e que consulta o Google para saber se a mensagem é necessária onde você está.',
  'privacy.ads.choices':
    'Lá, e nos estados dos EUA cujas leis dão escolhas a você, dá para mudar suas escolhas no app, em Seus dados › App para iPhone › “Opções de privacidade”.',
  'privacy.ads.remove':
    'Ao comprar “Remover anúncios”, os anúncios param e o app deixa de iniciar o software de anúncios do Google e a ferramenta de consentimento dele, então não envia nada ao Google.',
  'privacy.purchase.heading': 'A compra e as avaliações',
  'privacy.purchase.text':
    '“Remover anúncios” é uma compra única, processada pela Apple: nós não recebemos nenhum dado de pagamento. O app confere a compra no seu iPhone, com as ferramentas da própria Apple, sem nenhum serviço de compras no meio.',
  'privacy.purchase.rating':
    'Quando o app pede uma avaliação, ele usa o pedido do próprio iPhone: uma avaliação que você der vai para a Apple, não para nós.',
  'privacy.children.heading': 'Crianças',
  'privacy.children.text': 'O Weigh to Go não é feito para crianças.',
  'privacy.delete.heading': 'Apagar tudo',
  'privacy.delete.web':
    'No site: “Seus dados › Apagar tudo”, ou apague os dados do site nas configurações do navegador.',
  'privacy.delete.app':
    'No app: “Seus dados › Apagar tudo”, que também pode apagar os pesos que o app salvou no app Saúde. Apagar o app apaga os arquivos dele, mas deixa esses pesos no app Saúde: use “Apagar tudo” antes, ou apague-os no app Saúde. Os backups anteriores do seu iPhone guardam a cópia deles até serem substituídos ou apagados.',
  'privacy.delete.health':
    'Para tirar o acesso do app ao app Saúde, abra o app Saúde, toque na sua foto, depois em Apps, em Privacidade, e em Weigh to Go.',
  'privacy.rights.heading': 'Bases legais e seus direitos',
  'privacy.rights.diary':
    'Seu diário e seus dados de saúde: nós não tratamos nenhum deles. Eles ficam com você, e a seção acima diz como apagá-los.',
  'privacy.rights.ads':
    'O software de anúncios do Google: onde a lei pede, ele funciona com o seu consentimento, dado na mensagem do Google; nos outros lugares, com base no nosso legítimo interesse em manter um app gratuito com anúncios não personalizados. A ferramenta de consentimento do Google, que pede esse consentimento, funciona com base no nosso legítimo interesse em perguntar, como a lei exige. O Google pode tratar os dados fora do seu país, por exemplo nos Estados Unidos.',
  'privacy.rights.messages':
    'Uma mensagem que você nos mandar: nós a usamos para responder a você, com base no nosso legítimo interesse em responder.',
  'privacy.rights.ours':
    'Nós não guardamos nada sobre você, a não ser uma mensagem que você nos mandar, que você pode nos pedir para mostrar ou apagar, e, se você os ligou, os relatórios anônimos de falhas e as estatísticas de uso da Apple.',
  'privacy.rights.google':
    'O Google responde pelos dados que o software de anúncios dele coleta: faça os pedidos sobre eles ao Google, como explica a política de privacidade dele.',
  'privacy.rights.choices':
    'Onde o app mostra “Opções de privacidade”, você pode retirar seu consentimento ou se opor ali a qualquer momento. Em qualquer lugar, apagar o app ou comprar “Remover anúncios” acaba com a coleta.',
  'privacy.rights.complaint':
    'Você também pode reclamar a uma autoridade de proteção de dados: a ANPD, no Brasil, ou a autoridade do seu país no Espaço Econômico Europeu, no Reino Unido ou na Suíça.',
  'privacy.changes.heading': 'Mudanças',
  'privacy.changes.text':
    'Se o que o app ou o site faz com os dados mudar, esta política muda junto, e a data no topo também.',
  'privacy.contact.heading': 'Quem somos e contato',
  'privacy.contact.who':
    'O Weigh to Go é feito por Jonathas Costa, que é o responsável pelos dados que esta política descreve (o controlador).',
  'privacy.contact.text': 'Dúvidas e pedidos vão pelas issues do projeto no GitHub:',
  'privacy.contact.link': 'Issues do Weigh to Go no GitHub',
  'privacy.contact.public': 'As issues são públicas: não publique lá seus pesos nem outros dados pessoais.',
  'privacy.contact.messages':
    'Uma issue, com o seu nome de usuário do GitHub, é pública e fica no GitHub até ser apagada. Você pode editar o que escreveu ou apagar seus comentários; a edição guarda as versões anteriores no histórico de edições, de onde você ou nós podemos apagá-las. Nós apagamos uma issue que você abriu se você pedir nela. Cópias feitas fora do nosso alcance, como emails de notificação ou arquivos da atividade pública do GitHub, podem continuar existindo.',

  'settings.label': 'Configurações',
  'settings.language': 'Idioma',
  'settings.weightUnit': 'Unidade de peso',
  'settings.heightUnit': 'Unidade de altura',
  'settings.auto': 'Automático',
  'settings.sections': 'Seções',
  'settings.sectionsOn': (on: number, total: number) =>
    on === total
      ? `Todas as ${String(total)} visíveis`
      : on === 0
        ? 'Nenhuma visível'
        : `${String(on)} de ${String(total)} visíveis`,
  'settings.goal': 'Meta',
  'settings.height': 'Altura',
  'settings.notSet': 'Não definida',
  'settings.birthYear': 'Ano de nascimento',
  'settings.birthYearNone': 'Não definido',
  'settings.birthYearValue': (year: string, age: string) => `${year} · ${age} anos este ano`,
  'settings.sex': 'Sexo, para as fórmulas',
  'profile.sex.leaveOut': 'Não informar',
  'profile.sex.leftOut': 'Não informado',
  'profile.sex.female': 'Feminino',
  'profile.sex.male': 'Masculino',
  'profile.sex.help':
    'As fórmulas foram feitas com dados de mulheres e de homens, em separado. Escolha o que corresponde ao seu corpo, ou não informe: as estimativas que dependem disso não aparecem.',
  'profile.note':
    'Altura, ano de nascimento e sexo servem só para o IMC e as estimativas de composição corporal, e ficam neste aparelho. Todos são opcionais.',
  'profile.birthYear.change': 'Alterar ano de nascimento',
  'profile.birthYear.help': 'Só o ano: as fórmulas usam a sua idade, que avança sozinha a cada janeiro.',
  'profile.birthYear.bad': (lo: string, hi: string) =>
    `Digite o ano em que você nasceu, de ${lo} a ${hi}, ou deixe o campo vazio para removê-lo. As fórmulas são para adultos.`,
  'profile.birthYear.saved': (year: string) => `Ano de nascimento salvo: ${year}.`,
  'profile.birthYear.removed': 'Ano de nascimento removido.',
  'profile.saved': 'Informações salvas.',
  'profile.failed': 'Não foi possível salvar a alteração. Tente de novo.',
  'unit.kg': 'kg',
  'unit.lb': 'lb',
  'unit.cm': 'cm',
  'unit.ftin': 'pés e pol.',

  'word.weighIn': { one: 'pesagem', other: 'pesagens' },
  'word.day': { one: 'dia', other: 'dias' },
  'word.point': { one: 'ponto', other: 'pontos' },
  'word.month': { one: 'mês', other: 'meses' },

  'summary.none': 'Nenhuma pesagem ainda',
  'summary.start':
    'Registre sua primeira pesagem para começar. A tendência aparece a partir da segunda, as projeções a partir da terceira.',
  'summary.period': (from: string, to: string, count: string) => `${from} a ${to} · ${count}`,
  'summary.periodOne': (day: string, count: string) => `${day} · ${count}`,
  'summary.first': (weight: string) =>
    `Primeira pesagem registrada: **${weight}**. Continue registrando para ver sua tendência e projeções.`,
  'summary.take': ptSummary,
  'today.take': (p: TodayParts) =>
    p.pace === null
      ? `**${p.change}** desde ${p.from}.`
      : `**${p.change}** desde ${p.from}, ${p.paceWay === 'gaining' ? 'ganhando ' : p.paceWay === 'losing' ? 'perdendo ' : ''}cerca de ${p.pace} por semana.`,
  'today.spark': 'Últimos 30 dias',
  'today.sparkMore': 'Progresso',
  'today.sparkLink': 'Últimos 30 dias, ver Progresso',

  'kpi.label': 'Indicadores',
  'kpi.current': 'Peso atual',
  'kpi.loss': 'Perda total',
  'kpi.pace': 'Ritmo médio',
  'kpi.avg7': 'Média dos últimos 7 dias',
  'kpi.min': 'Mínima',
  'kpi.max': 'Máxima',
  'kpi.perWeek': (unit: string) => `${unit}/sem`,
  'kpi.on': (day: string) => `em ${day}`,
  'kpi.vsPrevious': 'vs. anterior',
  'kpi.lossOf': (share: string, start: string) => `${share} dos ${start} iniciais`,
  'kpi.recentPace': 'Últimas 3 semanas:',
  'kpi.wholePeriod': 'no período todo',
  'kpi.needsThree': 'precisa de 3 pesagens',
  'kpi.vsWeekBefore': 'vs. 7 dias antes',
  'kpi.window': 'em uma janela de 7 dias',
  'kpi.needsWeek': 'precisa de 7 dias de registros',
  'kpi.today': 'hoje',
  'kpi.ago': (days: string) => `há ${days}`,

  'entry.title': 'Registrar pesagem',
  'entry.date': 'Data',
  'entry.weight': 'Peso',
  'entry.save': 'Salvar',
  'entry.example': (example: string) => `Ex.: ${example}`,
  'entry.saved': (weight: string, day: string) => `Salvo: ${weight} em ${day}.`,
  'entry.updated': (weight: string, day: string) => `Atualizado: ${weight} em ${day}.`,
  'entry.exists': (weight: string) => `Já existe ${weight} nesta data. Salvar substitui o valor.`,
  'entry.badDate': 'Escolha a data da pesagem.',
  'entry.futureDate': 'Esse dia ainda não chegou. Escolha hoje ou um dia anterior.',
  'entry.badWeight': (unit: string, example: string) => `Digite o peso em ${unit}, por exemplo ${example}.`,
  'entry.failed': 'Não foi possível salvar a pesagem. Tente de novo.',
  'entry.reload':
    'Não foi possível salvar: o diário não está conseguindo acessar seus dados. Recarregue a página.',
  'entry.full': 'Não foi possível salvar: o aparelho está sem espaço de armazenamento.',
  'entry.today': (day: string) => `Hoje, ${day}`,
  'entry.last': (weight: string, when: string) => `Última: ${weight}, ${when}`,
  'entry.loggedToday': (weight: string) => `Hoje: ${weight}. Salvar substitui o valor.`,
  'entry.savedSub': (change: string | null, avg7: string | null) =>
    [
      change === null ? null : `${change} em relação à anterior`,
      avg7 === null ? null : `média de 7 dias: ${avg7}`,
    ]
      .filter((part) => part !== null)
      .join(' · '),
  'entry.undoHint': (seconds: string) => `Você pode desfazer por ${seconds} segundos.`,
  'entry.undo': 'Desfazer',
  'entry.undone': 'Desfeito.',
  'entry.changedSince': 'Esta pesagem mudou desde então; nada foi desfeito.',
  'entry.change': 'Alterar',
  'entry.another': 'Outro dia',
  'entry.firstHint': 'A data de hoje já está preenchida. Digite seu peso e aperte Salvar.',

  'paste.open': 'Colar vários dias de uma vez',
  'paste.help': (example: string, unit: string) =>
    `Uma pesagem por linha, com a data e o peso, como “${example}”. Os pesos são lidos em ${unit}, a menos que a linha diga kg ou lb. Dias já registrados são substituídos.`,
  'paste.label': 'Pesagens para importar',
  'paste.button': 'Importar linhas',
  'paste.confirm': 'Sim, importar',
  'paste.cancel': 'Cancelar',
  'paste.overwrites': (days: string) =>
    `Dias já registrados que vão ficar com o peso do texto colado: ${days}. Importar mesmo assim?`,
  'paste.changed': (added: string, replaced: string) =>
    `Novos: ${added}. Substituídos por outro peso: ${replaced}.`,
  'paste.empty': 'Cole ao menos uma linha antes.',
  'paste.none': (example: string) => `Nenhuma linha reconhecida. Use “${example}”, uma por linha.`,
  'paste.done': (saved: string) => `Importação concluída: ${saved}.`,
  'paste.repeated': (lines: string) =>
    `Algumas datas apareciam mais de uma vez (${lines}): ficou a última de cada.`,
  'paste.bad': (count: string) => `Linhas não reconhecidas (${count}):`,
  'paste.readAs': (line: string, day: string) => `A linha “${line}” foi lida como ${day}. Está certo?`,
  'paste.swap': 'Ler dia e mês ao contrário',
  'paste.word.line': { one: 'linha', other: 'linhas' },

  'chart.title': 'Evolução do peso',
  'chart.layers': 'Camadas',
  'chart.options': 'Opções do gráfico',
  'chart.view': 'Visualização',
  'chart.done': 'Concluir',
  'preset.essential': 'Essencial',
  'preset.detailed': 'Detalhado',
  'preset.custom': 'Personalizado',
  'preset.note.essential': 'Pesagens, média de 7 dias, projeção e meta.',
  'preset.note.detailed': 'Acrescenta a linha diária, a faixa da projeção, máxima e mínima, e os soluços.',
  'preset.note.custom': 'Sua escolha de camadas, guardada neste aparelho.',
  'chart.estimate': 'estimativa',
  'chart.rangeLabel': (lo: string, hi: string) => `provavelmente entre ${lo} e ${hi}`,
  'chart.everything': 'Ligar tudo',
  'chart.method': 'Projeção',
  'chart.horizon': 'Horizonte',
  'chart.period': 'Período',
  'chart.empty': 'Registre a primeira pesagem para ver o gráfico.',
  'chart.lastWeighIn': 'último registro',
  'chart.max': (weight: string) => `máx. ${weight}`,
  'chart.min': (weight: string) => `mín. ${weight}`,
  'chart.inDays': (change: string, days: string) => `${change} em ${days}`,
  'chart.roleDescription': 'gráfico',
  'chart.keys': 'Use as setas para a esquerda e a direita, Home e End para ler cada dia.',
  'chart.goal': (weight: string) => `Meta ${weight}`,
  'chart.bmi': (bmi: string, weight: string) => `IMC ${bmi} · ${weight}`,
  'chart.aria': (from: string, to: string, first: string, last: string) =>
    `Gráfico do seu peso de ${from} a ${to}, indo de ${first} a ${last}. Todas as pesagens também estão na tabela abaixo.`,
  'chart.foot': (p: ProjectionParts) =>
    `Projeção ${p.method} (${p.pace} por semana): **${p.value}** em ${p.day}${p.band ? `, provavelmente entre ${p.band.lo} e ${p.band.hi}` : ''}. É uma extrapolação do ritmo passado, não uma promessa.`,
  'chart.footNone': 'A projeção aparece a partir da terceira pesagem.',
  'chart.footFallback':
    'As últimas 3 semanas têm menos de 5 pesagens, então esta projeção usa o período todo.',

  'layer.points': 'Pesagens',
  'layer.line': 'Linha diária',
  'layer.avg7': 'Média de 7 dias',
  'layer.trend': 'Tendência suavizada',
  'layer.weekly': 'Médias semanais',
  'layer.weekRange': 'Faixa mín.–máx. da semana',
  'layer.regression': 'Reta de tendência',
  'layer.projection': 'Projeção',
  'layer.band': 'Faixa da projeção',
  'layer.extremes': 'Máxima e mínima',
  'layer.events': 'Maior queda e maior alta',
  'layer.hiccups': 'Soluços',
  'layer.goal': 'Meta',
  'layer.bmi': 'Linhas de IMC',

  'method.linear': 'Todo o período',
  'method.recent': 'Últimas 3 semanas',
  'method.smoothed': 'Tendência suavizada',
  'method.linear.name': 'linear do período todo',
  'method.recent.name': 'linear das últimas 3 semanas',
  'method.smoothed.name': 'pela tendência suavizada',
  'period.all': 'Tudo',

  'tip.weight': 'Peso',
  'tip.vsDay': 'vs. dia anterior',
  'tip.vsPrevious': 'vs. registro anterior',
  'tip.avg7': 'Média de 7 dias',
  'tip.trend': 'Tendência suavizada',
  'tip.regression': 'Reta de tendência',
  'tip.projection': 'Projeção',
  'tip.band': 'Faixa provável',
  'tip.range': (lo: string, hi: string) => `${lo} a ${hi}`,
  'tip.in': 'Daqui a',
  'tip.projectionOn': (day: string) => `Projeção · ${day}`,

  'word.week': { one: 'semana', other: 'semanas' },
  'unit.aWeek': 'por semana',
  'unit.aDay': 'ao dia',
  'section.blocks': 'Blocos',
  'layer.milestones': (a: string, b: string, c: string) => `Marcos ${a}, ${b}, ${c}…`,

  'pct.title': 'Perda percentual',
  'pct.note':
    'Quanto do peso inicial você já perdeu, em %. Ritmos, projeções e marcos também em %, o que permite comparar com referências como 5% ou 10% do peso.',
  'pct.block.kpis': 'Métricas em %',
  'pct.block.chart': 'Gráfico',
  'pct.block.weekly': 'Ritmo semanal em %',
  'pct.block.milestones': 'Tabela de marcos',
  'pct.kpisEmpty': 'As métricas em % aparecem a partir da segunda pesagem.',
  'pct.kpi.loss': 'Perda acumulada',
  'pct.kpi.lossOf': (start: string) => `do peso inicial de ${start}`,
  'pct.kpi.pace': 'Ritmo do período',
  'pct.kpi.aMonth': (pct: string) => `cerca de ${pct} por mês`,
  'pct.kpi.recent': 'Últimas 3 semanas',
  'pct.kpi.vsStart': 'em relação ao peso inicial',
  'pct.kpi.last7': 'Últimos 7 dias',
  'pct.kpi.last7Sub': 'média de 7 dias vs. 7 dias antes',
  'pct.kpi.vsCurrent': 'Ritmo vs. peso atual',
  'pct.kpi.method': (method: string) => `${method}: `,
  'pct.kpi.goal': 'Meta em %',
  'pct.kpi.goalReached': 'meta atingida',
  'pct.kpi.progress': (share: string) => `${share} do caminho percorrido`,
  'pct.kpi.next': 'Próximo marco',
  'pct.kpi.nextOn': (day: string) => `previsto para ${day}`,
  'pct.kpi.nextNever': 'não chega no ritmo escolhido',
  'pct.needsRecent': 'precisa de 5 pesagens nas últimas 3 semanas',
  'pct.needsTwoWeeks': 'precisa de 2 semanas de registros',
  'pct.needsLastWeek': 'precisa de 4 pesagens nos últimos 7 dias',
  'pct.needsWeekAgo': 'precisa de pesagens de cerca de uma semana atrás',
  'pct.band.rising': 'peso subindo neste ritmo',
  'pct.band.flat': 'peso praticamente estável',
  'pct.band.below': (lo: string, hi: string) => `abaixo da faixa de ${lo} a ${hi}`,
  'pct.band.within': (lo: string, hi: string) => `dentro da faixa de ${lo} a ${hi}`,
  'pct.band.above': (hi: string) => `acima de ${hi} por semana`,
  'pct.chartEmpty': 'O gráfico em % aparece a partir da segunda pesagem.',
  'pct.aria': (from: string, to: string, lost: string) =>
    `Gráfico da parte do peso inicial já perdida, de ${from} a ${to}, agora em ${lost}.`,
  'pct.milestoneLine': (pct: string, weight: string) => `${pct} · ${weight}`,
  'pct.tip.loss': 'Perda acumulada',
  'pct.tip.weight': 'Peso projetado',
  'pct.pp': (points: string) => `${points} p.p.`,
  'pct.foot': (p: PctFootParts) =>
    `Projeção ${p.method}: **${p.pct}** de perda em ${p.day} (${p.weight}). Percentuais calculados sobre o peso inicial de ${p.start}.`,
  'pct.weekly.title': 'Ritmo semanal em %',
  'pct.weekly.note': (lo: string, hi: string) =>
    `Queda da média de cada semana em relação à semana anterior, em % do peso. A faixa sombreada marca de ${lo} a ${hi} por semana, ritmo muitas vezes citado como sustentável.`,
  'pct.weekly.empty': 'Aparece a partir da segunda semana de registros.',
  'pct.weekly.band': (lo: string, hi: string) => `${lo} a ${hi} por semana`,
  'pct.weekly.aria': (weeks: string) => `Gráfico de barras da variação semanal da média, ${weeks}.`,
  'pct.weekly.keys': 'Use as setas para a esquerda e a direita, Home e End para ler cada semana.',
  'pct.weekly.week': (from: string, to: string) => `Semana de ${from} a ${to}`,
  'pct.weekly.drop': 'Queda',
  'pct.weekly.rise': 'Alta',
  'pct.weekly.mean': 'Média da semana',
  'pct.weekly.previous': 'Semana anterior',
  'pct.weekly.noteName': 'Obs.',
  'pct.weekly.partialThis': 'esta semana tem dias sem pesagem',
  'pct.weekly.partialBefore': 'a semana anterior tem dias sem pesagem',
  'pct.weekly.partialBoth': 'as duas semanas têm dias sem pesagem',
  'pct.weekly.legendFull': 'as duas semanas com todos os dias registrados',
  'pct.weekly.legendPartial': 'barra mais clara: esta semana ou a anterior tem dias sem pesagem',
  'pct.ms.title': 'Marcos de perda',
  'pct.ms.note': 'Quando cada marco foi ou seria atingido, em cada ritmo de projeção.',
  'pct.ms.milestone': 'Marco',
  'pct.ms.target': 'Peso-alvo',
  'pct.ms.status': 'Situação',
  'pct.ms.goal': (pct: string) => `Meta (${pct})`,
  'pct.ms.reached': (day: string) => `atingido em ${day}`,
  'pct.ms.toGo': (weight: string) => `faltam ${weight}`,
  'pct.ms.never': 'não chega',
  'pct.ms.empty': 'Os marcos aparecem a partir da primeira pesagem.',
  'pct.ms.fallback':
    'As últimas 3 semanas têm menos de 5 pesagens, então essa coluna espera por mais registros.',

  'rate.title': 'Taxa diária composta',
  'rate.note': (unit: string) =>
    `A perda de cada dia em % do peso do dia anterior, como juros compostos ao contrário. Com a mesma taxa, a perda em ${unit} fica um pouco menor a cada dia, porque o peso de referência também diminui.`,
  'rate.block.kpis': 'Métricas da taxa',
  'rate.block.days': 'Taxa de cada dia',
  'rate.block.curve': (unit: string) => `% constante ou ${unit} constantes`,
  'rate.block.simulator': 'Simulador',
  'rate.empty': 'Aparece a partir da terceira pesagem.',
  'rate.perDay': (unit: string) => `${unit}/dia`,
  'rate.kpi.mean': 'Taxa média do período',
  'rate.kpi.meanSub': (week: string) => `≈ ${week} por semana, composto`,
  'rate.kpi.fitted': 'Taxa ajustada',
  'rate.kpi.fittedSub': (r2: string) => `regressão sobre todos os dias · R² ${r2}`,
  'rate.kpi.recent': 'Últimas 3 semanas',
  'rate.kpi.recentSub': (week: string) => `≈ ${week} por semana`,
  'rate.kpi.today': (unit: string) => `A taxa em ${unit} hoje`,
  'rate.kpi.todaySub': (weight: string) => `no início, a mesma taxa dava ${weight} por dia`,
  'rate.kpi.lose10': (pct: string) => `Para perder ${pct} do atual`,
  'rate.kpi.lose10Sub': (weight: string) => `mantendo a taxa ajustada, até ${weight}`,
  'rate.kpi.diff': (days: string) => `Diferença em ${days}`,
  'rate.kpi.diffSub': (pct: string, weight: string, unit: string) =>
    `% constante: ${pct} · ${unit} constantes: ${weight}`,
  'rate.window': 'Janela',
  'rate.layer.bars': 'Taxa diária',
  'rate.layer.rolling': 'Média móvel da taxa',
  'rate.layer.mean': 'Taxa média do período',
  'rate.days.note':
    'Barras: perda do dia em % do peso do dia anterior (acima de zero, perdeu). Linha: taxa média da janela móvel. Tracejado: taxa média do período. Se a linha anda perto do tracejado, a taxa está constante.',
  'rate.days.mean': (rate: string) => `média ${rate} ao dia`,
  'rate.days.aria': (count: string) => `Gráfico de barras da taxa diária entre pesagens seguidas, ${count}.`,
  'rate.days.keys': 'Use as setas para a esquerda e a direita, Home e End para ler cada pesagem.',
  'rate.tip.loss': 'Perda do dia',
  'rate.tip.gain': 'Ganho do dia',
  'rate.tip.perDay': (rate: string) => `${rate} ao dia`,
  'rate.tip.change': 'Variação',
  'rate.tip.previous': 'Pesagem anterior',
  'rate.tip.rolling': (days: string) => `Média móvel de ${days}`,
  'rate.oneYear': '1 ano',
  'rate.curve.title': (unit: string) => `Taxa constante ou ${unit} constantes?`,
  'rate.curve.note': (unit: string) =>
    `A curva supõe a mesma % do peso por dia; a reta supõe os mesmos ${unit} por dia. No começo quase coincidem e se afastam com o tempo.`,
  'rate.curve.constantPct': 'Curva de % constante',
  'rate.curve.constantKg': (unit: string) => `Reta de ${unit} constantes`,
  'rate.curve.simulation': 'Simulação',
  'rate.curve.aria': (from: string, to: string) =>
    `Gráfico das suas pesagens desde ${from}, com a curva de taxa constante e a reta projetadas até ${to}.`,
  'rate.curve.foot': ptCurveFoot,
  'rate.tip.weighIn': 'Pesagem',
  'rate.tip.constantPct': '% constante',
  'rate.tip.constantKg': (unit: string) => `${unit} constantes`,
  'sim.title': 'Simulador de taxa constante',
  'sim.note': (unit: string) =>
    `Escolha uma taxa por dia e veja, dia a dia, quanto ela representa em ${unit}.`,
  'sim.rate': 'Taxa por dia',
  'sim.start': 'Peso de partida',
  'sim.target': 'Peso-alvo',
  'sim.current': 'última pesagem',
  'sim.goal': 'sua meta',
  'sim.optional': 'opcional',
  'sim.mine': 'Usar minha taxa atual',
  'sim.needsRate': (lo: string, hi: string) => `Informe uma taxa entre ${lo} e ${hi} ao dia.`,
  'sim.needsStart': 'Informe um peso de partida, ou registre uma pesagem.',
  'sim.badStart': (unit: string, example: string) =>
    `Digite o peso de partida em ${unit}, por exemplo ${example}, ou deixe em branco para usar a última pesagem.`,
  'sim.badTarget': (unit: string, example: string) =>
    `Digite o peso-alvo em ${unit}, por exemplo ${example}, ou deixe em branco.`,
  'sim.summary': ptSim,
  'sim.col.day': 'Dia',
  'sim.col.date': 'Data',
  'sim.col.weight': 'Peso',
  'sim.col.lossDay': 'Perda no dia',
  'sim.col.lossTotal': 'Perda acumulada',
  'sim.col.pct': '% perdido',
  'sim.row.goal': 'Meta',
  'sim.row.target': 'Alvo',
  'sim.partialDay': 'parte de um dia',

  'hiccups.title': 'Soluços',
  'hiccups.note':
    'Períodos em que o peso subiu por vários dias seguidos e interrompeu a descida. Ajuste abaixo o que conta como soluço.',
  'hiccups.basis': 'Medir em',
  'hiccups.minDays': 'Subindo por pelo menos',
  'hiccups.minGain': 'Ganho mínimo',
  'hiccups.tolerance': 'Quedas toleradas no meio',
  'hiccups.basis.kg': 'Pesagens diárias',
  'hiccups.basis.avg7': 'Média de 7 dias',
  'hiccups.basis.trend': 'Tendência suavizada',
  'hiccups.basisIn.kg': 'nas pesagens diárias',
  'hiccups.basisIn.avg7': 'na média de 7 dias',
  'hiccups.basisIn.trend': 'na tendência suavizada',
  'hiccups.none': 'nenhuma',
  'hiccups.upTo': (weight: string) => `até ${weight}`,
  'hiccups.rules': (p: RulesParts) =>
    `Conta como soluço uma subida **${p.basis}** que dura **${p.days} ou mais** do ponto mais baixo até o pico e soma **${p.gain} ou mais**. ${p.tolerance === null ? 'Qualquer queda interrompe a subida.' : `Quedas de até ${p.tolerance} no meio não interrompem a subida.`}`,
  'hiccups.kpis': 'Métricas dos soluços',
  'hiccups.empty': 'Os soluços aparecem a partir da terceira pesagem.',
  'hiccups.kpi.count': 'Soluços encontrados',
  'hiccups.kpi.countSub': (days: string) => `em ${days} de registros`,
  'hiccups.kpi.countNone': 'nenhum com as regras escolhidas',
  'hiccups.kpi.climbing': 'Dias subindo',
  'hiccups.kpi.climbingSub': (share: string) => `${share} do período`,
  'hiccups.kpi.regained': 'Peso devolvido',
  'hiccups.kpi.regainedSub': (share: string) => `soma das subidas; equivale a ${share} da perda líquida`,
  'hiccups.kpi.regainedNoLoss': 'soma das subidas; não há perda líquida para comparar',
  'hiccups.kpi.biggest': 'Maior soluço',
  'hiccups.kpi.biggestSub': (from: string, to: string, days: string) => `${from} a ${to}, em ${days}`,
  'hiccups.kpi.back': 'Volta ao peso de antes',
  'hiccups.kpi.backSub': (recovered: string, total: string) =>
    `em média, depois do pico (recuperados: ${recovered} de ${total})`,
  'hiccups.kpi.backNone': 'nenhum soluço recuperado ainda',
  'hiccups.kpi.noHiccups': 'sem soluços',
  'hiccups.kpi.now': 'Agora',
  'hiccups.now.ongoing': 'Em soluço',
  'hiccups.now.ongoingSub': (day: string, gain: string) => `desde ${day}, ${gain} até aqui`,
  'hiccups.now.returning': 'Voltando',
  'hiccups.now.returningSub': (weight: string, day: string) => `faltam ${weight} para o peso de ${day}`,
  'hiccups.now.none': 'Sem soluço',
  'hiccups.now.recoveredOn': (day: string) => `o último foi recuperado em ${day}`,
  'hiccups.now.never': 'nenhuma subida longa até aqui',
  'hiccups.aria': (from: string, to: string, count: string) =>
    `Gráfico do seu peso de ${from} a ${to}, com os soluços encontrados marcados (total: ${count}). Eles também estão na tabela abaixo.`,
  'hiccups.legend.band': 'soluço (do ponto mais baixo ao pico)',
  'hiccups.legend.back': 'caminho de volta ao peso de antes do soluço',
  'hiccups.tip.hiccup': 'Soluço',
  'hiccups.tip.gain': 'Ganho no soluço',
  'hiccups.col.start': 'Início',
  'hiccups.col.peak': 'Pico',
  'hiccups.col.days': 'Dias subindo',
  'hiccups.col.daysShort': 'Dias',
  'hiccups.col.weight': 'Peso',
  'hiccups.col.gain': 'Ganho',
  'hiccups.col.gainPct': 'Ganho %',
  'hiccups.col.back': 'Voltou ao peso de antes',
  'hiccups.fromTo': (from: string, to: string) => `${from} → ${to}`,
  'hiccups.backOn': (day: string, days: string) => `em ${day}, ${days} após o pico`,
  'hiccups.ongoing': 'em andamento',
  'hiccups.notYet': 'ainda não',
  'hiccups.tableEmpty':
    'Nenhum soluço com as regras escolhidas. Tente reduzir a duração mínima ou o ganho mínimo.',

  'sections.kpis': 'Indicadores',
  'sections.chart': 'Gráfico principal',
  'sections.percent': 'Perda percentual',
  'sections.rate': 'Taxa diária composta',
  'sections.hiccups': 'Soluços',
  'sections.body': 'Composição corporal',
  'sections.goal': 'Meta',
  'sections.bmi': 'IMC',
  'sections.facts': 'Curiosidades',
  'sections.variation': 'Variação de um dia para o outro',
  'sections.weeks': 'Médias semanais',
  'sections.weekdays': 'Dias da semana',
  'sections.calendar': 'Calendário',
  'sections.log': 'Registros',

  'goal.title': 'Meta',
  'goal.label': 'Peso da meta',
  'goal.save': 'Salvar',
  'goal.none': 'Informe uma meta para ver quanto falta e quando você chegaria nela em cada ritmo.',
  'goal.noWeighIns': (goal: string) => `Sua meta é ${goal}. Registre uma pesagem para ver o plano até ela.`,
  'goal.reached': (unit: string, goal: string) => `${unit} abaixo da meta de ${goal}. Meta atingida.`,
  'goal.toGo': (unit: string, goal: string) => `${unit} para chegar a ${goal}`,
  'goal.covered': (share: string) => `${share} do caminho`,
  'goal.pace.linear': 'No ritmo de todo o período',
  'goal.pace.recent': 'No ritmo das últimas 3 semanas',
  'goal.pace.smoothed': 'No ritmo da tendência suavizada',
  'goal.paceSub': (days: string, pace: string) => `em ${days}, a ${pace} por semana`,
  'goal.never': 'não chega neste ritmo',
  'goal.aboveStart': (goal: string, start: string) =>
    `Sua meta de ${goal} não está abaixo do peso inicial de ${start}: não há o que perder para chegar a ela.`,
  'goal.saved': (goal: string) => `Meta salva: ${goal}.`,
  'goal.removed': 'Meta removida.',
  'goal.bad': (unit: string) => `Digite a meta em ${unit}, ou deixe o campo vazio para removê-la.`,

  'bmi.title': 'IMC',
  'bmi.height': 'Altura',
  'bmi.feet': 'Pés',
  'bmi.inches': 'Polegadas',
  'bmi.ftTag': 'pés',
  'bmi.inTag': 'pol.',
  'bmi.none': 'Informe sua altura para ver o IMC atual e o inicial, e o peso de cada faixa.',
  'bmi.noWeighIns': (height: string) => `Altura salva: ${height}. Registre uma pesagem para ver seu IMC.`,
  'bmi.saved': (height: string) => `Altura salva: ${height}.`,
  'bmi.removed': 'Altura removida.',
  'bmi.badCm': 'Digite sua altura em cm, entre 100 e 250, ou deixe o campo vazio para removê-la.',
  'bmi.badFtIn':
    'Digite sua altura em pés inteiros e polegadas (menos de 12), ou deixe os dois vazios para removê-la.',
  'bmi.band.under': 'Abaixo do peso',
  'bmi.band.normal': 'Peso adequado',
  'bmi.band.over': 'Sobrepeso',
  'bmi.band.obese1': 'Obesidade grau I',
  'bmi.band.obese2': 'Obesidade grau II',
  'bmi.band.obese3': 'Obesidade grau III',
  'bmi.scaleAria': (bmi: string, band: string) => `IMC ${bmi} na escala de faixas: ${band}`,
  'bmi.start': 'IMC no início',
  'bmi.reduced': (points: string) => `redução de ${points} desde o início`,
  'bmi.notReduced': 'ainda não está abaixo do inicial',
  'bmi.target': (bmi: string) => `Peso para IMC abaixo de ${bmi}`,
  'bmi.toGo': (weight: string) => `faltam ${weight}`,
  'bmi.caveat':
    'O IMC é uma medida aproximada, de referência populacional: não considera músculo, idade ou composição corporal.',

  'facts.title': 'Curiosidades',
  'facts.note': 'Recordes, sequências e equivalências do período.',
  'facts.empty': 'Registre a primeira pesagem para ver as curiosidades.',
  'facts.on': (day: string) => `em ${day}`,
  'facts.onOver': (day: string, days: string) => `em ${day}, ao longo de ${days}`,
  'facts.drop': 'Maior queda entre pesagens',
  'facts.rise': 'Maior alta entre pesagens',
  'facts.dropRun': 'Maior sequência de quedas',
  'facts.riseRun': 'Maior sequência de altas',
  'facts.runEnd': (day: string) => `terminando em ${day}`,
  'facts.counts': 'Quedas, altas e dias iguais',
  'facts.countsValue': (drops: string, rises: string, flats: string) => `${drops} · ${rises} · ${flats}`,
  'facts.dropShare': (share: string) => `${share} das comparações foram de queda`,
  'facts.swing': 'Oscilação típica de um dia',
  'facts.plusMinus': (weight: string) => `±${weight}`,
  'facts.swingDetail': 'por isso a média de 7 dias diz mais que uma pesagem isolada',
  'facts.range': 'Amplitude do período',
  'facts.rangeDetail': 'entre a maior e a menor pesagem',
  'facts.mean': 'Peso médio do período',
  'facts.meanDetail': 'média de todas as pesagens',
  'facts.aboveMin': 'Distância da mínima',
  'facts.atMin': 'você está na mínima do período',
  'facts.minAgo': (days: string) => `a mínima foi há ${days}`,
  'facts.energy': 'Energia equivalente à perda',
  'facts.about': (value: string) => `≈ ${value}`,
  'facts.energyDetail': (perKg: string, kg: string, days: string, diet: string) =>
    `usando ${perKg} kcal por ${kg}, cerca de ${days} dias de uma dieta de ${diet} kcal`,
  'facts.bottles': (litres: string) => `Em garrafas de ${litres} litros de água`,
  'facts.bottlesDetail': 'é o peso que você deixou de carregar',
  'facts.bestWeek': 'Melhor semana',
  'facts.bestWeekDetail': (day: string) => `na média, a semana de ${day}`,
  'facts.straight': 'Quão reta foi a descida',
  'facts.straightDetail': 'ajuste da reta de tendência; 1 seria uma linha perfeita',
  'facts.aboveTrend': 'Pesagens acima da tendência',
  'facts.of': (part: string, total: string) => `${part} de ${total}`,
  'facts.aboveTrendDetail': 'dias em que a balança ficou acima da tendência suavizada',
  'facts.missing': 'Dias sem registro',
  'facts.missingDetail': (days: string) => `em um período de ${days}`,
  'facts.steady': 'Constância',
  'facts.steadyDetail': 'todos os dias do período têm pesagem',

  'variation.title': 'Variação de um dia para o outro',
  'variation.note': (unit: string) =>
    `Diferença em ${unit} para a pesagem anterior. Segue o período escolhido no gráfico principal.`,
  'variation.down': 'desceu',
  'variation.up': 'subiu',
  'variation.gap': 'barra mais clara: em mais de um dia',
  'variation.empty': 'A variação aparece a partir da segunda pesagem.',
  'variation.none': 'Sem variações neste período.',
  'variation.aria': (count: string) => `Gráfico de barras da diferença para a pesagem anterior, ${count}.`,

  'weekdays.title': 'Dias da semana',
  'weekdays.note': 'Variação média em relação ao dia anterior, por dia da semana.',
  'weekdays.empty': 'Aparece quando houver pesagens em dias seguidos.',
  'weekdays.aria': 'Gráfico da variação média em relação ao dia anterior, uma linha por dia da semana.',
  'weekdays.keys': 'Use as setas para cima e para baixo, Home e End para ler cada dia da semana.',
  'weekdays.mean': 'Variação média',
  'weekdays.count': 'Comparações',
  'weekdays.noData': 'ainda sem pesagens em dias seguidos',
  'weekdays.fallsMost': (day: string, change: string) => `Dia que mais desce: **${day} (${change})**.`,
  'weekdays.risesLeast': (day: string, change: string) => `Dia que menos sobe: **${day} (${change})**.`,
  'weekdays.risesMost': (day: string, change: string) => `Dia que mais sobe: **${day} (${change})**.`,
  'weekdays.fallsLeast': (day: string, change: string) => `Dia que menos desce: **${day} (${change})**.`,

  'calendar.title': 'Calendário',
  'calendar.note': 'Cada quadrado é um dia. A cor mostra se o peso desceu ou subiu, e a intensidade, quanto.',
  'calendar.span': 'Meses',
  'calendar.months': (n: string) => `Últimos ${n}`,
  'calendar.down': 'desceu',
  'calendar.up': 'subiu',
  'calendar.flat': 'igual, ou sem comparação',
  'calendar.none': 'sem pesagem',
  'calendar.strength': 'Cor mais forte, variação maior.',
  'calendar.empty': 'Registre a primeira pesagem para ver o calendário.',
  'calendar.shown': (shown: string, total: string) => `Mostrando os ${shown} mais recentes (de ${total}).`,
  'calendar.earlier': (months: string) => `Mostrar anteriores: ${months}`,
  'calendar.roleDescription': 'calendário',
  'calendar.aria': (count: string) =>
    `Calendário dos dias, coloridos pela variação em relação à pesagem anterior, ${count}. Todas as pesagens e suas variações também estão na tabela de registros.`,
  'calendar.keys':
    'Use as setas para andar um dia ou uma semana, Home e End para ir ao primeiro ou ao último dia.',

  'weeks.title': 'Médias semanais',
  'weeks.note':
    'Semanas de segunda a domingo. A barra mostra a faixa entre a mínima e a máxima da semana, na mesma escala para todas. A variação é em relação à semana anterior.',
  'weeks.week': 'Semana',
  'weeks.mean': (unit: string) => `Média (${unit})`,
  'weeks.bar': 'Faixa',
  'weeks.min': 'Mín.',
  'weeks.max': 'Máx.',
  'weeks.n': 'Pesagens',
  'weeks.delta': 'Variação',
  'weeks.range': (from: string, to: string) => `${from} – ${to}`,
  'weeks.lowHigh': (low: string, high: string) => `mínima ${low}, máxima ${high}`,
  'weeks.empty': 'Nenhuma semana ainda.',
  'weeks.more': (shown: string, total: string) => `Mostrando as últimas ${shown} semanas de ${total}.`,

  'table.label': (title: string) => `Tabela: ${title}`,
  'table.count': (shown: string, total: string) => `${shown} de ${total}`,
  'analysis.lede': 'Cada cartão diz o essencial. Abra um para ver os detalhes.',
  'analysis.allHidden': 'Todos os cartões de análise estão ocultos.',
  'analysis.showThem': 'Mostre-os em Seus dados › Configurações',
  'empty.progress': 'O gráfico e os indicadores aparecem a partir da segunda pesagem.',
  'empty.analysis': 'Os cartões de análise aparecem a partir da segunda pesagem.',
  'empty.log': 'Registrar pesagem',
  'card.options': 'Opções',
  'card.rangeShort': (lo: string, hi: string) => `provável ${lo}–${hi}`,
  'rate.readout.rolling': (days: string) => `Média de ${days} dias`,
  'rate.readout.loss': 'Perda',
  'rate.readout.gain': 'Ganho',
  'rate.readout.none': 'Sem mudança',
  'card.rules': 'Regras',
  'card.optionsOf': (title: string) => `Opções: ${title}`,
  'card.blocks': 'Mostrar',
  'card.preset.custom': 'Sua escolha de blocos e camadas, guardada neste aparelho.',
  'card.needsFirst': 'Aparece a partir da primeira pesagem.',
  'card.needsSecond': 'Aparece a partir da segunda pesagem.',
  'card.needsThird': 'Aparece a partir da terceira pesagem.',
  'pct.preset.essential': 'Os indicadores e o gráfico em %.',
  'pct.preset.detailed': 'Acrescenta o ritmo semanal em % e a tabela de marcos.',
  'pct.sum': (p: PctSumParts) =>
    p.kind === 'since'
      ? `**${p.pct}** perdidos desde ${p.day}.`
      : p.kind === 'gained'
        ? `**${p.pct}** ganhos desde ${p.day}.`
        : p.kind === 'goal'
          ? `**${p.pct}** perdidos; ${p.progress} do caminho até a meta de ${p.goal}.`
          : `**${p.pct}** perdidos; a meta de ${p.goal} foi atingida.`,
  'rate.preset.essential': 'Os indicadores da taxa e a taxa de cada dia.',
  'rate.preset.detailed': 'Acrescenta a curva de % constante e o simulador.',
  'rate.sum': (p: RateSumParts) => {
    const over = !p.recent
      ? 'em todo o período'
      : p.to === null
        ? 'nas últimas 3 semanas'
        : `nas últimas 3 semanas do diário, até ${p.to}`;
    if (p.way === 'steady') return `Estável ${over}: **${p.rate} ao dia**.`;
    return `${p.way === 'losing' ? 'Perdendo' : 'Ganhando'} **${p.rate} ao dia** ${over}, cerca de ${p.week} por semana.`;
  },
  'word.climb': { one: 'subida', other: 'subidas' },
  'hiccups.rulesTitle': 'Regras dos soluços',
  'hiccups.sum': (p: HiccupSumParts) => {
    if (p.single)
      return p.since === null
        ? `**${p.climbs}** em ${p.days}: terminou em ${String(p.end)} e durou ${String(p.lasted)}.`
        : `**${p.climbs}** em ${p.days}, desde ${p.since}, ainda em curso.`;
    return p.since === null
      ? `**${p.climbs}** em ${p.days}; a última, até ${String(p.end)}, durou ${String(p.lasted)}.`
      : `**${p.climbs}** em ${p.days}; a última, desde ${p.since}, ainda está em curso.`;
  },
  'hiccups.sumNone': 'Nenhuma subida com as regras atuais.',
  'goal.change': 'Alterar meta',
  'bmi.change': 'Alterar altura',
  'bmi.sum': (now: string, diff: string, way: 'lower' | 'higher' | 'same', on: string | null) => {
    const when = on === null ? 'agora' : `em ${on}`;
    return way === 'same'
      ? `**${now}** ${when}, o mesmo do início.`
      : `**${now}** ${when}, ${diff} ${way === 'lower' ? 'abaixo' : 'acima'} do início.`;
  },
  'bmi.sumNone': 'Informe sua altura para vê-lo.',
  'body.title': 'Composição corporal (estimativas)',
  'body.sum': (fat: string, bmr: string, on: string | null) =>
    on === null
      ? `Estimativa de **${fat}** de gordura corporal e **${bmr}** por dia em repouso, por fórmulas.`
      : `Em ${on}, estimativa de **${fat}** de gordura corporal e **${bmr}** por dia em repouso, por fórmulas.`,
  'body.sumLean': (lean: string, water: string | null, on: string | null) => {
    const what =
      water === null
        ? `massa magra de **${lean}**, por fórmula`
        : `massa magra de **${lean}** e água corporal de **${water}**, por fórmulas`;
    return `${on === null ? 'Estimativa' : `Em ${on}, estimativa`} de ${what}.`;
  },
  'body.sumNeeds': 'Aparece quando altura, ano de nascimento e sexo estiverem definidos.',
  'body.adults': 'Estas estimativas são para adultos: as fórmulas foram feitas com dados de adultos.',
  'body.adultsFrom': 'Elas começam nas pesagens do ano em que você faz 18 anos.',
  'body.needs':
    'Estas estimativas usam sua altura, ano de nascimento e sexo. Cada um é opcional e fica neste aparelho.',
  'body.caveat':
    'Estimativas por fórmulas, não medições. Elas acompanham o seu peso e não distinguem uma mudança de gordura de uma mudança de músculo.',
  'body.change': 'Alterar informações',
  'body.fat': 'Gordura corporal',
  'body.lean': 'Massa magra',
  'body.water': 'Água corporal',
  'body.bmr': 'Gasto em repouso (TMB)',
  'body.chips': 'Estimativa no gráfico',
  'body.chip.fat': 'Gordura',
  'body.chip.lean': 'Massa magra',
  'body.chip.water': 'Água',
  'body.chip.bmr': 'TMB',
  'body.kcalDay': (n: string) => `${n}\u00a0kcal por dia`,
  'body.kcal': (n: string) => `${n}\u00a0kcal`,
  'body.litres': (n: string) => `${n}\u00a0L`,
  'body.waterShare': (pct: string) => `${pct} do seu peso`,
  'body.atStart': (value: string) => `${value} no início`,
  'body.sameAsStart': 'o mesmo do início',
  'body.err.fat': 'Fórmula de Deurenberg, cerca de ±4\u2060–\u20605\u00a0pontos',
  'body.err.lean': (weight: string) => `Fórmula de Boer, cerca de ±${weight}`,
  'body.err.water': 'Fórmula de Watson, cerca de ±4\u00a0L',
  'body.err.bmr': 'Fórmula de Mifflin-St Jeor, cerca de ±10%',
  'body.needsYear': 'Precisa do seu ano de nascimento',
  'body.range': (lo: string, hi: string) => `faixa ${lo}–${hi}`,
  'body.legend.line': 'Estimativa em cada pesagem',
  'body.legend.band': 'Erro habitual da fórmula',
  'body.chart.fat': 'Estimativa de gordura corporal ao longo do tempo (fórmula de Deurenberg)',
  'body.chart.lean': 'Estimativa de massa magra ao longo do tempo (fórmula de Boer)',
  'body.chart.water': 'Estimativa de água corporal ao longo do tempo (fórmula de Watson)',
  'body.chart.bmr': 'Estimativa do gasto em repouso ao longo do tempo (fórmula de Mifflin-St Jeor)',
  'body.aria': (first: string, last: string, value: string, range: string) =>
    `De ${first} a ${last}; no último registro, ${value}, ${range}.`,
  'body.about': 'Sobre as fórmulas',
  'body.about.bmr':
    '**TMB**, Mifflin-St Jeor (1990): a energia que o corpo gasta em repouso completo, a partir de peso, altura, idade e sexo. Erra até cerca de 10% para a maioria dos adultos, mais para alguns. Um dia inteiro gasta mais, porque movimento e digestão se somam a ela.',
  'body.about.fat':
    '**Gordura corporal**, Deurenberg (1991): a partir do IMC, da idade e do sexo. Cerca de 4\u2060–\u20605 pontos para mais ou para menos; dá valores altos demais para pessoas muito musculosas e é menos segura com IMC muito alto ou muito baixo.',
  'body.about.lean': (weight: string) =>
    `**Massa magra**, Boer (1984): tudo o que não é gordura (músculos, ossos, órgãos e água), a partir de peso, altura e sexo. Cerca de ${weight} para mais ou para menos. Ela cai um pouco sempre que o peso cai, porque a fórmula supõe que parte de qualquer perda é magra; não tem como saber se a sua é.`,
  'body.about.water':
    '**Água corporal**, Watson (1980): a partir de peso, altura, sexo e, para homens, idade. Cerca de 4 litros para mais ou para menos. Não vê as variações de água de um dia para o outro, que mexem na balança.',
  'body.about.left':
    'Músculos, ossos e gordura visceral não aparecem: nenhuma fórmula os estima com segurança a partir do peso. Um exame os mede; balanças de bioimpedância os estimam de outro jeito.',
  'body.about.adults':
    'As fórmulas foram feitas com dados de adultos, e cada valor usa a sua idade no ano daquela pesagem. São estimativas para referência, não um diagnóstico.',
  'facts.sum': (n: string, days: string, drop: { value: string; over: string | null } | null) =>
    drop === null
      ? `${n} em ${days}.`
      : drop.over === null
        ? `${n} em ${days}; a maior queda num dia foi de ${drop.value}.`
        : `${n} em ${days}; a maior queda foi de ${drop.value}, em ${drop.over}.`,
  'variation.sum': (typical: string, within: string) =>
    `Num dia típico o peso muda **±${typical}**; 8 em cada 10 dias ficam dentro de ±${within}.`,
  'variation.sumNeeds': 'Aparece quando houver pesagens em dias seguidos.',
  'weekdays.sum': (p: WeekdaySumParts) =>
    `${p.lowWay === 'fall' ? 'Maior queda' : p.lowWay === 'rise' ? 'Menor alta' : 'Estável'}: **${p.low}** (${p.lowChange} em média); ` +
    `${p.highWay === 'rise' ? 'maior alta' : p.highWay === 'fall' ? 'menor queda' : 'estável'}: **${p.high}** (${p.highChange}).`,
  'weekdays.sumNeeds': 'Precisa de duas semanas de pesagens.',
  'calendar.sum': ptCalendarSum,
  'word.steady': { one: 'estável', other: 'estáveis' },
  'log.title': 'Registros',
  'log.note':
    'Todas as pesagens salvas, da mais recente para a mais antiga. Escolha um dia para alterá-lo ou apagá-lo.',
  'log.date': 'Data',
  'log.weight': (unit: string) => `Peso (${unit})`,
  'log.change': 'Variação',
  'log.avg7': 'Média de 7 dias',
  'log.delete': 'Apagar',
  'log.deleteDay': (day: string) => `Apagar a pesagem de ${day}`,
  'log.deleted': (day: string) => `Pesagem de ${day} apagada.`,
  'log.failed': 'Não foi possível apagar a pesagem. Tente de novo.',
  'log.empty': 'Nenhuma pesagem ainda.',
  'log.more': (shown: string, total: string) => `Mostrando as ${shown} mais recentes de ${total}.`,
  'log.showMore': 'Mostrar mais',
  'log.showAll': 'Mostrar todas',
  'log.editHint': 'Abre o dia para alterá-lo ou apagá-lo.',
  'log.undoFailed': 'Não foi possível desfazer: a pesagem continua apagada. Você pode registrá-la de novo.',
  'log.undoChangeFailed': 'Não foi possível desfazer: o novo peso continua. Você pode alterá-lo de novo.',

  'data.group.backup': 'Backup',
  'data.group.app': 'App para iPhone',
  'data.group.about': 'Sobre',
  'data.due': 'Pendente',
  'about.web': 'Sem conta, sem servidor nosso, sem rastreamento.',
  'about.app.storage':
    'Suas pesagens ficam neste app, no seu iPhone, e no backup do seu iPhone, se você usa o Backup do iCloud ou faz backup no computador. Nós não guardamos nada: sem conta, sem servidor nosso, sem análise de uso.',
  'about.app.shared': 'Se você ligar o app Saúde, os pesos são compartilhados com o Saúde neste iPhone.',
  'about.app.ads':
    'Os anúncios vêm do Google AdMob: não são personalizados e nunca recebem suas pesagens, mas o Google recebe o que qualquer pedido de anúncio leva, como o modelo do iPhone e o endereço de rede. Ao remover os anúncios, esses pedidos param.',
  'ads.choices': 'Opções de privacidade',
  'ads.choicesFailed':
    'Não foi possível abrir as opções de privacidade do Google. Tente de novo quando estiver on-line.',
  'about.app.adsRemoved':
    'Os anúncios foram removidos: o app não inicia mais o software de anúncios do Google, e nada mais é enviado ao Google.',
  'iap.title': 'Remover anúncios',
  'iap.ready': 'Um pagamento, para sempre; sem assinatura.',
  'iap.note': (family: boolean) =>
    `Pague uma vez e os anúncios somem na hora, em todo iPhone com esta Conta Apple${family ? ', e para o seu grupo de Compartilhamento Familiar' : ''}, mesmo off-line.`,
  'iap.buy': (price: string) => `Comprar · ${price}`,
  'iap.buying': 'Abrindo a App Store…',
  'iap.buyingButton': 'Comprando…',
  'iap.pending': 'Aguardando aprovação. Os anúncios somem assim que a compra for aprovada.',
  'iap.failed': 'A compra não foi concluída. Tente de novo mais tarde.',
  'iap.offline': 'Não foi possível acessar a App Store. Tente de novo quando estiver on-line.',
  'iap.unavailable':
    'A opção Remover anúncios não está disponível na App Store no momento. Tente de novo mais tarde.',
  'iap.notAllowed':
    'As compras estão desativadas neste iPhone, nas Restrições de Conteúdo e Privacidade do Tempo de Uso. Quando forem permitidas, volte aqui.',
  'iap.tryAgain': 'Tentar de novo',
  'iap.held': 'Anúncios removidos. Obrigado.',
  'iap.restore': 'Restaurar compras',
  'iap.restoreNote': 'Comprou em outro iPhone? Recupere a compra aqui.',
  'iap.restoring': 'Consultando a App Store…',
  'iap.restored': 'Compra restaurada.',
  'iap.restoreNone': 'Nenhuma compra para restaurar nesta Conta Apple.',
  'iap.restoreOffline': 'Não foi possível acessar a App Store. Tente de novo.',
  'iap.restoreFailed': 'Nada foi restaurado. Tente de novo.',
  'about.privacy': 'Política de privacidade',
  'about.version': (version: string) => `Weigh to Go ${version}`,
  'data.note':
    'Tudo fica neste navegador. Um arquivo de backup é a única cópia fora dele: exporte um de vez em quando e use-o para passar para outro aparelho.',
  'data.export': 'Exportar backup',
  'data.exportCsv': 'Exportar CSV',
  'data.csvFormat': 'Formato do CSV',
  'data.csvFormat.auto': (example: string) => `Automático (${example})`,
  'data.csvFormat.semicolon': 'Ponto e vírgula, vírgula decimal (Excel em português)',
  'data.csvFormat.comma': 'Vírgulas, ponto decimal (Excel em inglês)',
  'csv.headers': {
    date: 'data',
    weight: 'peso',
    change: 'variacao',
    average7: 'media_7_dias',
    trend: 'tendencia',
    lostPct: 'perda_pct',
    bodyFat: 'gordura_deurenberg_pct',
    leanMass: 'massa_magra_boer',
    bodyWater: 'agua_watson_l',
    bmr: 'tmb_mifflin_kcal',
    savedAt: 'salvo_em',
  },
  'data.exportFailed': 'Não foi possível salvar o arquivo. Tente de novo.',
  'data.import': 'Importar backup',
  'data.erase': 'Apagar tudo',
  'data.lastBackup': (when: string) => `Último backup exportado em ${when}.`,
  'data.neverBackedUp': 'Nenhum backup exportado ainda.',
  'data.exported': (file: string) => `${file} salvo.`,
  'data.read': (count: string, skipped: string | null) =>
    `O arquivo tem ${count}${skipped ? ` (ignorados: ${skipped})` : ''}. Juntar ao que já está aqui, ou substituir tudo?`,
  'word.record': { one: 'registro', other: 'registros' },
  'data.merge': 'Juntar ao que está aqui',
  'data.replace': 'Substituir tudo',
  'data.cancel': 'Cancelar',
  'data.replaceWarning': (here: string, file: string) =>
    `Substituir remove o que está aqui (${here}) e deixa só o que está no arquivo (${file}). Exporte um backup antes, caso queira recuperar os dados atuais.`,
  'data.replaceConfirm': 'Substituir',
  'data.merged': (p: MergeParts) =>
    `Pronto. Dias adicionados: ${p.added}; atualizados: ${p.updated}; mantidos por serem mais novos aqui: ${p.kept}; já iguais: ${p.unchanged}.`,
  'data.replaced': (count: string) => `Pronto: o diário agora tem o que estava no arquivo (${count}).`,
  'data.importFailed': 'Não foi possível importar o arquivo. Nada foi alterado.',
  'data.reload': 'O diário não está conseguindo acessar seus dados. Recarregue a página e tente de novo.',
  'data.eraseWarning':
    'Isto apaga todas as pesagens, sua meta, altura, ano de nascimento, sexo e configurações deste navegador, e não pode ser desfeito. Exporte um backup antes, caso queira recuperar tudo.',
  'data.eraseConfirm': 'Apagar',
  'data.erased': 'Tudo foi apagado.',
  'data.eraseFailed': 'Não foi possível apagar tudo. Recarregue a página e tente de novo.',
  'backup.too-large': 'Esse arquivo é grande demais para ser um backup.',
  'backup.not-json': 'Esse arquivo não é um backup: não dá para lê-lo.',
  'backup.not-a-backup': 'Esse arquivo não é um backup do Weigh to Go.',
  'backup.newer-format':
    'Esse backup vem de um Weigh to Go mais novo. Recarregue a página para atualizar e tente de novo.',
  'backup.no-weigh-ins': 'Esse backup não tem pesagens que dê para ler.',

  'notice.memory':
    'Este navegador não está deixando a página guardar dados, então as pesagens só duram até você fechá-la. Exporte um backup antes de sair.',
  'notice.reload':
    'O diário não está conseguindo acessar seus dados agora, talvez porque uma versão mais nova está aberta em outra aba. Recarregue a página.',
  'notice.setAside':
    'Não foi possível ler todo o diário salvo. Uma cópia fica guardada no app como estava, e o que pôde ser lido está aqui. Se faltarem pesagens, importe seu backup mais recente.',
  'reminder.title': 'Lembrete diário',
  'reminder.switch': 'Lembrar de me pesar',
  'reminder.time': 'Horário',
  'reminder.note': (days: string) =>
    `Uma notificação por dia neste horário, nenhuma num dia já registrado. Os lembretes param depois de ${days} dias sem abrir o app.`,
  'reminder.denied':
    'As notificações do Weigh to Go estão desligadas. Ligue-as em Ajustes › Notificações › Weigh to Go e volte: o lembrete começa sozinho.',
  'reminder.failed': 'Não foi possível programar os lembretes. O app tenta de novo quando você voltar a ele.',
  'reminder.notificationTitle': 'Pesagem do dia',
  'reminder.notificationBody': 'Hora da pesagem de hoje.',
  'health.title': 'App Saúde',
  'health.note':
    'Lê seu peso do app Saúde, para que as medições de uma balança inteligente ou de outro app entrem no diário, e salva lá os pesos que você registra aqui. As medições do app Saúde ficam no app Saúde: o app as lê de novo cada vez que abre, e elas não entram no seu arquivo de backup. Um peso digitado aqui sempre prevalece sobre uma medição de outro app.',
  'health.switch': 'Usar o app Saúde',
  'health.rule': 'Num dia com várias medições',
  'health.ruleFirst': 'A primeira do dia',
  'health.ruleLast': 'A última do dia',
  'health.days': (n: number, days: string) =>
    n === 0 ? 'Nenhum dia veio do app Saúde ainda.' : `${days} ${n === 1 ? 'veio' : 'vieram'} do app Saúde.`,
  'health.readFailed': 'Não foi possível ler o app Saúde agora. O app tenta de novo quando você voltar.',
  'health.denied':
    'O app Saúde não está deixando o Weigh to Go salvar o peso. No app Saúde, toque na sua foto, depois em Apps, em Privacidade, em Weigh to Go, e ligue Peso.',
  'health.unavailable': 'O app Saúde não está disponível neste aparelho.',
  'health.revoke':
    'Ao desligar, o app deixa de ler e de salvar. Para tirar o acesso do app, abra o app Saúde, toque na sua foto, depois em Apps, em Privacidade, e em Weigh to Go.',
  'data.eraseHealth': 'Apagar também os pesos que este app salvou no app Saúde',
  'data.eraseHealthNote':
    'As medições da sua balança ou de outros apps continuam no app Saúde. O app não consegue tirar o próprio acesso ao app Saúde: para isso, no app Saúde toque na sua foto, depois em Apps, em Privacidade, e em Weigh to Go.',
  'data.erasedNotHealth':
    'Tudo aqui foi apagado, mas os pesos no app Saúde não puderam ser apagados. No app Saúde: Peso, Fontes de Dados e Acesso, Weigh to Go, Apagar Todos os Dados.',
  'notice.reloadButton': 'Recarregar',
  'update.ready': 'Uma nova versão do Weigh to Go está pronta. Suas pesagens continuam aqui.',
  'install.empty':
    'Este app instalado guarda os próprios dados, separados dos do navegador. Se você registrou pesagens no navegador, exporte um backup por lá e importe-o aqui, em Seus dados.',
  'update.reload': 'Recarregar',
  'notice.noBackup':
    'Suas pesagens ficam guardadas só neste navegador. Exporte um backup, para que fiquem seguras se ele apagar seus dados.',
  'notice.oldBackup': (days: string) =>
    `Seu último backup foi há ${days}. Exporte um novo, para que as pesagens recentes também fiquem seguras.`,
};

/**
 * The iPhone app's wording where the website's speaks of a browser or a page: laid over the
 * dictionaries in the app's build.
 */
export const enApp = {
  'home.privacy':
    'Everything runs on your iPhone: your weigh-ins are stored in this app, and in Apple Health if you turn it on.',
  'data.note':
    'Everything stays in this app on your iPhone, and in your iPhone’s backup if you use iCloud Backup or back up to a computer; with Apple Health on, the weights you type are in Health too. A backup file is the only copy you hold yourself: export one now and then, and use it to move to another device.',
  'data.eraseWarning':
    "This erases every weigh-in, your goal, height, year of birth, sex and settings from this app, and can't be undone. Export a backup first if you may want them back.",
  'data.eraseFailed': "Couldn't erase everything. Close the app, open it again and try again.",
  'backup.newer-format': 'That backup comes from a newer Weigh to Go. Update the app, then try again.',
  'notice.memory':
    "The app can't open its saved diary right now, so new weigh-ins last only until you close it. Close the app and open it again.",
  'install.empty':
    'If you have logged weigh-ins on weightogo.jonathas.net, export a backup there, save it to Files or send it to this iPhone with AirDrop, and import it here, under Your data.',
  'notice.noBackup':
    'Your weigh-ins live in this app (and in Apple Health, if you turn it on), and in your iPhone’s backup if you use one. Export a backup, so you keep a copy of your own.',
  'notice.reload':
    "The app can't open its saved diary right now. Try again; if it keeps happening, close the app and open it again.",
  'notice.reloadButton': 'Try again',
  'entry.reload': "Couldn't save: the app can't reach its diary. Tap Try again at the top, then save again.",
  'data.reload': "The app can't reach its diary. Tap Try again at the top, then try this again.",
} satisfies Partial<Messages>;

export const ptApp: typeof enApp = {
  'home.privacy':
    'Tudo funciona no seu iPhone: suas pesagens ficam guardadas neste app, e no app Saúde se você ligá-lo.',
  'data.note':
    'Tudo fica neste app, no seu iPhone, e no backup do seu iPhone, se você usa o Backup do iCloud ou faz backup no computador; com o app Saúde ligado, os pesos que você digita ficam lá também. Um arquivo de backup é a única cópia que fica com você: exporte um de vez em quando e use-o para passar para outro aparelho.',
  'data.eraseWarning':
    'Isto apaga todas as pesagens, sua meta, altura, ano de nascimento, sexo e configurações deste app, e não pode ser desfeito. Exporte um backup antes, caso queira recuperar tudo.',
  'data.eraseFailed': 'Não foi possível apagar tudo. Feche o app, abra-o de novo e tente outra vez.',
  'backup.newer-format': 'Esse backup vem de um Weigh to Go mais novo. Atualize o app e tente de novo.',
  'notice.memory':
    'O app não está conseguindo abrir o diário salvo agora, então as novas pesagens só duram até você fechá-lo. Feche o app e abra-o de novo.',
  'install.empty':
    'Se você registrou pesagens em weightogo.jonathas.net, exporte um backup por lá, salve-o no app Arquivos ou mande-o para este iPhone por AirDrop, e importe-o aqui, em Seus dados.',
  'notice.noBackup':
    'Suas pesagens ficam neste app (e no app Saúde, se você ligá-lo), e no backup do seu iPhone, se você usa um. Exporte um backup, para ter uma cópia com você.',
  'notice.reload':
    'O app não está conseguindo abrir o diário salvo agora. Tente de novo; se continuar, feche o app e abra-o outra vez.',
  'notice.reloadButton': 'Tentar de novo',
  'entry.reload':
    'Não foi possível salvar: o app não está conseguindo acessar o diário. Toque em Tentar de novo, no topo, e salve outra vez.',
  'data.reload':
    'O app não está conseguindo acessar o diário. Toque em Tentar de novo, no topo, e repita isto.',
};

/** Each language's name in itself, for the switcher: a reader looks for their own. */
export const LANG_NAMES = { en: 'English', pt: 'Português' } as const;
