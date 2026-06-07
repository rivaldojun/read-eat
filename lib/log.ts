/** Tiny structured-ish console logger. Keeps cron output greppable. */
type Meta = Record<string, unknown>;

function fmt(scope: string, msg: string, meta?: Meta) {
  const base = `[${new Date().toISOString()}] [${scope}] ${msg}`;
  return meta && Object.keys(meta).length ? `${base} ${JSON.stringify(meta)}` : base;
}

export const log = {
  info: (scope: string, msg: string, meta?: Meta) => console.log(fmt(scope, msg, meta)),
  warn: (scope: string, msg: string, meta?: Meta) => console.warn(fmt(scope, msg, meta)),
  error: (scope: string, msg: string, meta?: Meta) => console.error(fmt(scope, msg, meta)),
};
