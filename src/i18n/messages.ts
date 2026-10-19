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
  'frame.open': 'Open Weigh to Go in its own tab',

  'home.heading': 'Your weight diary, on your device',
  'home.lede':
    "Log a weigh-in a day and Weigh to Go shows where you're heading: the trend under the daily noise, projections, weekly averages, the days you climb back up, and more.",
  'home.privacy': 'Everything runs in your browser: your weigh-ins are stored on this device only.',
  'home.noscript': 'Weigh to Go needs JavaScript, which is turned off.',
  'home.placeholder': 'Loading your diary…',

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

  'word.weighIn': { one: 'weigh-in', other: 'weigh-ins' },
  'word.day': { one: 'day', other: 'days' },

  'summary.none': 'No weigh-ins yet',
  'summary.start':
    'Log your first weigh-in to begin. The trend shows from the second, projections from the third.',
  'summary.period': (from: string, to: string, count: string) => `${from} to ${to} · ${count}`,
  'summary.periodOne': (day: string, count: string) => `${day} · ${count}`,
  'summary.first': (weight: string) =>
    `First weigh-in logged: **${weight}**. Keep logging to see your trend and projections.`,
  'summary.take': enSummary,

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

  'paste.open': 'Paste several days at once',
  'paste.help': (example: string, unit: string) =>
    `One weigh-in per line, a date and a weight, like “${example}”. Weights are read in ${unit} unless a line says kg or lb. Days already logged are replaced.`,
  'paste.label': 'Weigh-ins to import',
  'paste.button': 'Import lines',
  'paste.confirm': 'Yes, import',
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
  'chart.note': (unit: string) =>
    `Daily weigh-ins in ${unit}. Turn layers on and off to clear the chart or enrich it.`,
  'chart.layers': 'Layers',
  'chart.essential': 'Just the essentials',
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

  'log.title': 'Weigh-ins',
  'log.note': 'Every weigh-in saved, newest first. To correct one, log the same day again.',
  'log.date': 'Date',
  'log.weight': (unit: string) => `Weight (${unit})`,
  'log.change': 'Change',
  'log.avg7': '7-day average',
  'log.actions': 'Actions',
  'log.delete': 'Delete',
  'log.deleteDay': (day: string) => `Delete the weigh-in of ${day}`,
  'log.confirm': (day: string) => `Delete ${day}?`,
  'log.keep': 'Keep',
  'log.deleted': (day: string) => `Deleted the weigh-in of ${day}.`,
  'log.failed': "Couldn't delete the weigh-in. Try again.",
  'log.empty': 'No weigh-ins yet.',
  'log.more': (shown: string, total: string) => `Showing the latest ${shown} of ${total}.`,
  'log.showMore': 'Show more',

  'data.title': 'Your data',
  'data.note':
    'Everything stays in this browser. A backup file is the only copy outside it: export one now and then, and use it to move to another device.',
  'data.export': 'Export backup',
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
    "This erases every weigh-in, your goal, height and settings from this browser, and can't be undone. Export a backup first if you may want them back.",
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
  'notice.reloadButton': 'Reload',
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
  'frame.open': 'Abrir o Weigh to Go em uma aba própria',

  'home.heading': 'Seu diário de peso, no seu aparelho',
  'home.lede':
    'Registre uma pesagem por dia e o Weigh to Go mostra para onde você está indo: a tendência por trás do sobe e desce diário, projeções, médias semanais, os dias em que o peso volta a subir e mais.',
  'home.privacy': 'Tudo funciona no seu navegador: suas pesagens ficam guardadas só neste aparelho.',
  'home.noscript': 'O Weigh to Go precisa de JavaScript, que está desativado.',
  'home.placeholder': 'Carregando seu diário…',

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

  'word.weighIn': { one: 'pesagem', other: 'pesagens' },
  'word.day': { one: 'dia', other: 'dias' },

  'summary.none': 'Nenhuma pesagem ainda',
  'summary.start':
    'Registre sua primeira pesagem para começar. A tendência aparece a partir da segunda, as projeções a partir da terceira.',
  'summary.period': (from: string, to: string, count: string) => `${from} a ${to} · ${count}`,
  'summary.periodOne': (day: string, count: string) => `${day} · ${count}`,
  'summary.first': (weight: string) =>
    `Primeira pesagem registrada: **${weight}**. Continue registrando para ver sua tendência e projeções.`,
  'summary.take': ptSummary,

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

  'paste.open': 'Colar vários dias de uma vez',
  'paste.help': (example: string, unit: string) =>
    `Uma pesagem por linha, com a data e o peso, como “${example}”. Os pesos são lidos em ${unit}, a menos que a linha diga kg ou lb. Dias já registrados são substituídos.`,
  'paste.label': 'Pesagens para importar',
  'paste.button': 'Importar linhas',
  'paste.confirm': 'Sim, importar',
  'paste.overwrites': (days: string) =>
    `${days} já registrados vão ficar com o peso da colagem. Importar mesmo assim?`,
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
  'chart.note': (unit: string) =>
    `Pesagens diárias em ${unit}. Ligue e desligue as camadas para limpar ou enriquecer o gráfico.`,
  'chart.layers': 'Camadas',
  'chart.essential': 'Só o essencial',
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

  'log.title': 'Registros',
  'log.note':
    'Todas as pesagens salvas, da mais recente para a mais antiga. Para corrigir uma, registre o mesmo dia de novo.',
  'log.date': 'Data',
  'log.weight': (unit: string) => `Peso (${unit})`,
  'log.change': 'Variação',
  'log.avg7': 'Média de 7 dias',
  'log.actions': 'Ações',
  'log.delete': 'Apagar',
  'log.deleteDay': (day: string) => `Apagar a pesagem de ${day}`,
  'log.confirm': (day: string) => `Apagar ${day}?`,
  'log.keep': 'Manter',
  'log.deleted': (day: string) => `Pesagem de ${day} apagada.`,
  'log.failed': 'Não foi possível apagar a pesagem. Tente de novo.',
  'log.empty': 'Nenhuma pesagem ainda.',
  'log.more': (shown: string, total: string) => `Mostrando as ${shown} mais recentes de ${total}.`,
  'log.showMore': 'Mostrar mais',

  'data.title': 'Seus dados',
  'data.note':
    'Tudo fica neste navegador. Um arquivo de backup é a única cópia fora dele: exporte um de vez em quando e use-o para passar para outro aparelho.',
  'data.export': 'Exportar backup',
  'data.import': 'Importar backup',
  'data.erase': 'Apagar tudo',
  'data.lastBackup': (when: string) => `Último backup exportado em ${when}.`,
  'data.neverBackedUp': 'Nenhum backup exportado ainda.',
  'data.exported': (file: string) => `${file} salvo.`,
  'data.read': (count: string, skipped: string | null) =>
    `O arquivo tem ${count}${skipped ? ` (${skipped} ignorados)` : ''}. Juntar ao que já está aqui, ou substituir tudo?`,
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
    'Isto apaga todas as pesagens, sua meta, altura e configurações deste navegador, e não pode ser desfeito. Exporte um backup antes, caso queira recuperar tudo.',
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
  'notice.reloadButton': 'Recarregar',
  'notice.noBackup':
    'Suas pesagens ficam guardadas só neste navegador. Exporte um backup, para que fiquem seguras se ele apagar seus dados.',
  'notice.oldBackup': (days: string) =>
    `Seu último backup foi há ${days}. Exporte um novo, para que as pesagens recentes também fiquem seguras.`,
};

/** Each language's name in itself, for the switcher: a reader looks for their own. */
export const LANG_NAMES = { en: 'English', pt: 'Português' } as const;
