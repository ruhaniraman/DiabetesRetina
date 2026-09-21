// Refuses to run in production with unsafe or placeholder configuration.
// Pure function (takes the environment as an argument) so it can be unit-tested.

const PLACEHOLDER = /^replace-with|^changeme|^xxxx|^your[-_.]/i;

const weak = (value, min = 32) => !value || value.length < min || PLACEHOLDER.test(value);

/** Returns a list of human-readable problems; empty means the configuration is acceptable for production. */
export function productionProblems(env) {
  const problems = [];

  if (weak(env.JWT_SECRET)) problems.push('JWT_SECRET must be a random string of at least 32 characters.');
  if (weak(env.DATA_KEY)) problems.push('DATA_KEY must be a random string of at least 32 characters (it encrypts health data; back it up).');
  if (weak(env.SERVICE_KEY)) problems.push('SERVICE_KEY must be a random string of at least 32 characters (shared with the ML backend).');
  if (env.JWT_SECRET && env.JWT_SECRET === env.DATA_KEY) problems.push('JWT_SECRET and DATA_KEY must be different values.');
  if (env.SERVICE_KEY && (env.SERVICE_KEY === env.JWT_SECRET || env.SERVICE_KEY === env.DATA_KEY)) {
    problems.push('SERVICE_KEY must differ from JWT_SECRET and DATA_KEY.');
  }

  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    problems.push('GMAIL_USER and GMAIL_APP_PASSWORD must be set (codes are never printed in production).');
  }

  let origin;
  try {
    origin = new URL(env.CLIENT_ORIGIN || '');
  } catch {
    origin = null;
  }
  if (!origin || origin.protocol !== 'https:') problems.push('CLIENT_ORIGIN must be the public https:// address of the web app.');
  else if (/^(localhost|127\.|\[::1\])/.test(origin.hostname)) problems.push('CLIENT_ORIGIN must not point at localhost in production.');

  return problems;
}

/** How many reverse proxies sit in front of the server (Express "trust proxy"). Wrong values let clients spoof their IP. */
export function trustProxySetting(env) {
  const raw = env.TRUST_PROXY;
  if (raw === undefined || raw === '') return env.NODE_ENV === 'production' ? 1 : false;
  if (raw === 'false' || raw === '0') return false;
  const hops = Number(raw);
  return Number.isInteger(hops) && hops > 0 ? hops : raw; // a number of hops, or an Express keyword such as "loopback"
}
