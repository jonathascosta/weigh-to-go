/**
 * Every string the page shows, in English and Portuguese (Brazilian wording, for every Portuguese
 * reader). The Portuguese dictionary has the English one's type, so a missing key fails the type
 * check.
 */

export const en = {
  'page.home.title': 'Weigh to Go · A weight diary that stays on your device',
  'page.home.description':
    'Log your weigh-ins and see your trend, projections, weekly averages and more. Weigh to Go runs entirely in your browser: your data never leaves your device.',
  'page.home.ogDescription':
    'Log your weigh-ins and see your trend, projections, weekly averages and more, entirely in your browser.',
  'page.notFound.title': 'Page not found · Weigh to Go',

  skip: 'Skip to content',
  'footer.madeBy': 'Made by',
  'frame.open': 'Open Weigh to Go in its own tab',

  'home.heading': 'Your weight diary, on your device',
  'home.lede':
    "Log a weigh-in a day and Weigh to Go shows where you're heading: the trend under the daily noise, projections, weekly averages, the days you climb back up, and more.",
  'home.privacy': 'Everything runs in your browser: your weigh-ins are stored on this device only.',
  'home.noscript': 'Weigh to Go needs JavaScript, which is turned off.',
  'home.placeholder': 'The diary is on its way.',

  'notFound.heading': 'Page not found',
  'notFound.text': "There's nothing here.",
  'notFound.link': 'Go to your diary',

  'settings.label': 'Settings',
  'settings.language': 'Language',
  'settings.weightUnit': 'Weight unit',
  'settings.heightUnit': 'Height unit',
  'settings.auto': 'Automatic',
  'unit.kg': 'kg',
  'unit.lb': 'lb',
  'unit.cm': 'cm',
  'unit.ftin': 'ft and in',
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
  'frame.open': 'Abrir o Weigh to Go em uma aba própria',

  'home.heading': 'Seu diário de peso, no seu aparelho',
  'home.lede':
    'Registre uma pesagem por dia e o Weigh to Go mostra para onde você está indo: a tendência por trás do sobe e desce diário, projeções, médias semanais, os dias em que o peso volta a subir e mais.',
  'home.privacy': 'Tudo funciona no seu navegador: suas pesagens ficam guardadas só neste aparelho.',
  'home.noscript': 'O Weigh to Go precisa de JavaScript, que está desativado.',
  'home.placeholder': 'O diário está a caminho.',

  'notFound.heading': 'Página não encontrada',
  'notFound.text': 'Não tem nada aqui.',
  'notFound.link': 'Ir para o seu diário',

  'settings.label': 'Configurações',
  'settings.language': 'Idioma',
  'settings.weightUnit': 'Unidade de peso',
  'settings.heightUnit': 'Unidade de altura',
  'settings.auto': 'Automático',
  'unit.kg': 'kg',
  'unit.lb': 'lb',
  'unit.cm': 'cm',
  'unit.ftin': 'pés e pol.',
};

/** Each language's name in itself, for the switcher: a reader looks for their own. */
export const LANG_NAMES = { en: 'English', pt: 'Português' } as const;
