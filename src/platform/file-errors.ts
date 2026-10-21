/** The Filesystem plugin's error code for a file that isn't there. */
export const NO_FILE = 'OS-PLUG-FILE-0008';

/** Whether `error` says the file isn't there: anything else is a failure, never "no data". */
export const isMissingFile = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === NO_FILE;
