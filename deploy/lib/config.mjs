// A site's settings: backend/composer.json, extra["anotoki-deploy"] - the only place a site says anything
// about its deploy. What is not said there is the same for every site (DEFAULTS).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const DEFAULTS = {
  // What goes into backend/: paths in the site's backend/ (a folder, a file, or a glob with * and **). A missing one
  // is skipped, so the list may name what only some sites have.
  include: ['api', 'src', 'config', 'migrations', 'vendor', 'setup.php'],
  exclude: [],
  // The addresses the backend answers (path prefixes): frontend/.htaccess sends them to index.php.
  routes: ['api'],
  // What index.php hands every such address to, in backend/.
  entry: 'api/index.php',
  csp: null,
  headers: {},
  // Files of the app asked for again each time (index.html always is), e.g. "theme-boot.js".
  noCache: [],
  // Extra media types: { ".avif": "image/avif" }.
  types: {},
  // Folders at the top of the site's folder, beside frontend/ and backend/, served as they are (a site's
  // uploaded files) - the switch lets them through.
  beside: [],
  before: [],
  frontendBuild: 'npm run build',
  project: null,
  // Paths that must answer 200 after a release, e.g. "/api/health".
  smoke: [],
  // Content kept on the host beside the release and only ever added to: { "audio": { "from": "backend/data/audio",
  // "to": "content/audio" } } - "from" in the repository, "to" in the site's folder.
  content: {},
};

// The folders of the site's folder that a deploy never writes: the state, and the release's own.
export const RESERVED = ['frontend', 'backend', 'config', 'storage'];

/** The site's repository: the nearest folder at or above `start` with backend/composer.json and frontend/angular.json. */
export function findRoot(start) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, 'backend', 'composer.json')) && existsSync(join(dir, 'frontend', 'angular.json'))) {
      return dir;
    }
    const up = dirname(dir);
    if (up === dir) {
      throw new Error('No site here: no folder at or above this one holds backend/composer.json and frontend/angular.json (or give --root).');
    }
    dir = up;
  }
}

export function loadConfig(root) {
  const composer = JSON.parse(readFileSync(join(root, 'backend', 'composer.json'), 'utf8'));
  const raw = composer.extra?.['anotoki-deploy'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('backend/composer.json has no extra["anotoki-deploy"]: the site\'s settings (site, remote, url) go there.');
  }
  return normalizeConfig(raw);
}

export function normalizeConfig(raw) {
  const fail = (message) => {
    throw new Error(`extra["anotoki-deploy"]: ${message}`);
  };
  const unknown = Object.keys(raw).filter((key) => !['site', 'remote', 'url', ...Object.keys(DEFAULTS)].includes(key));
  if (unknown.length) {
    fail(`unknown setting ${unknown.map((key) => `"${key}"`).join(', ')}`);
  }
  const config = { ...DEFAULTS, ...raw };

  if (typeof config.site !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(config.site)) {
    fail('"site" must be a short name such as "survey"');
  }
  if (
    typeof config.remote !== 'string' ||
    !config.remote.startsWith('/') ||
    config.remote.endsWith('/') ||
    /[\\\0]/.test(config.remote) ||
    config.remote
      .split('/')
      .slice(1)
      .some((part) => part === '' || part === '.' || part === '..')
  ) {
    fail('"remote" must be the absolute path of the site\'s folder on the host, such as "/anotoki.eu/sub/survey"');
  }
  let url;
  try {
    url = new URL(config.url);
  } catch {
    fail('"url" must be the site\'s address, such as "https://survey.anotoki.eu"');
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    fail('"url" must be https');
  }
  config.url = url.origin;

  for (const key of ['include', 'exclude', 'routes', 'noCache', 'beside', 'before', 'smoke']) {
    if (!Array.isArray(config[key]) || config[key].some((value) => typeof value !== 'string' || value === '')) {
      fail(`"${key}" must be a list of strings`);
    }
  }
  for (const key of ['entry', 'frontendBuild']) {
    if (typeof config[key] !== 'string' || config[key] === '') {
      fail(`"${key}" must be a string`);
    }
  }
  for (const path of [...config.include, ...config.exclude, ...config.routes, config.entry]) {
    if (!isRelativePath(path)) {
      fail(`"${path}" must be a relative path without "..", "\\" or a leading "/"`);
    }
  }
  if (!config.entry.endsWith('.php')) {
    fail('"entry" must be a PHP file in backend/');
  }
  for (const name of config.beside) {
    if (!/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(name) || RESERVED.includes(name)) {
      fail(`"beside" names folders at the top of the site's folder other than ${RESERVED.join(', ')}: "${name}" is not one`);
    }
  }
  for (const path of config.smoke) {
    if (!path.startsWith('/')) {
      fail(`"smoke" paths start with "/": "${path}"`);
    }
  }
  if (config.csp !== null && (typeof config.csp !== 'string' || /["\n]/.test(config.csp))) {
    fail('"csp" must be one line without double quotes');
  }
  for (const [map, check] of [
    ['headers', (name, value) => /^[A-Za-z0-9-]+$/.test(name) && (value === null || (typeof value === 'string' && !/["\n]/.test(value)))],
    ['types', (extension, type) => /^\.[a-z0-9]+$/.test(extension) && typeof type === 'string' && /^[a-z]+\/[a-z0-9.+-]+$/.test(type)],
  ]) {
    if (!config[map] || typeof config[map] !== 'object' || Array.isArray(config[map]) || Object.entries(config[map]).some(([key, value]) => !check(key, value))) {
      fail(`"${map}" is not a map of the right shape`);
    }
  }
  if (config.project !== null && typeof config.project !== 'string') {
    fail('"project" must be the name of the Angular project in angular.json');
  }
  if (!config.content || typeof config.content !== 'object' || Array.isArray(config.content)) {
    fail('"content" must be a map of names to { from, to }');
  }
  for (const [name, item] of Object.entries(config.content)) {
    if (!/^[a-z0-9-]+$/.test(name) || !item || !isRelativePath(item.from ?? '') || !isRelativePath(item.to ?? '') || RESERVED.includes(item.to.split('/')[0])) {
      fail(`"content.${name}" needs "from" (in the repository) and "to" (in the site's folder, outside ${RESERVED.join(', ')})`);
    }
  }
  return config;
}

/** A path inside a folder: no leading "/", no "\", no ".." or "." part, no empty part. */
export function isRelativePath(path) {
  return typeof path === 'string' && path !== '' && !path.startsWith('/') && !/[\\\0]/.test(path) && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}
