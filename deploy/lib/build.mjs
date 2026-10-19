// build: the site's own build, then one release - dist/frontend/ (the built app, index.php, .htaccess) and
// dist/backend/ (the code backend/composer.json names, a deny-all .htaccess, release.json). Never a settings
// file of the host (*.local.php), never a dot-file of the sources.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { denyHtaccess, frontendHtaccess, frontIndexPhp } from './templates.mjs';

export const MARKER = '.anotoki-deploy';

/** `frontend`: an app built already (a folder with its index.html) - the site's frontend build does not run. */
export function build(root, config, { out, skipFrontend = false, frontend = null, log = console.log } = {}) {
  const dist = resolve(out ?? join(root, 'dist'));
  checkOut(root, dist);

  for (const command of config.before) {
    run(command, root, log);
  }
  if (!skipFrontend && !frontend) {
    run(config.frontendBuild, join(root, 'frontend'), log);
  }
  const browser = frontend ? resolve(frontend) : browserOutput(root, config);
  if (!existsSync(join(browser, 'index.html'))) {
    throw new Error(`No built app at ${browser} (no index.html).`);
  }

  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  // First: a crashed build is still known as one, and the next one may empty the folder.
  writeFileSync(join(dist, MARKER), JSON.stringify({ site: config.site }) + '\n');

  const frontendFiles = listFiles(browser).filter((path) => !hidden(path) && !/\.(php|phtml|phar)$/i.test(path));
  copyAll(browser, join(dist, 'frontend'), frontendFiles);
  // The notices of the libraries the bundles hold: Angular writes them beside the app's folder.
  const licenses = join(dirname(browser), '3rdpartylicenses.txt');
  if (existsSync(licenses) && !frontendFiles.includes('3rdpartylicenses.txt')) {
    copyFileSync(licenses, join(dist, 'frontend', '3rdpartylicenses.txt'));
    frontendFiles.push('3rdpartylicenses.txt');
  }
  writeFileSync(join(dist, 'frontend', 'index.php'), frontIndexPhp(config));
  writeFileSync(join(dist, 'frontend', '.htaccess'), frontendHtaccess(config));

  const backend = join(root, 'backend');
  const backendFiles = selectBackend(backend, config);
  copyAll(backend, join(dist, 'backend'), backendFiles);
  writeFileSync(join(dist, 'backend', '.htaccess'), denyHtaccess());

  check(dist, config);
  const release = {
    site: config.site,
    version: frontendVersion(root),
    ...gitState(root),
    builtAt: new Date().toISOString(),
    files: { frontend: frontendFiles.length + 2, backend: backendFiles.length + 2 },
  };
  // Last: its presence beside backend/'s code is what tells the site's PHP it runs from a release.
  writeFileSync(join(dist, 'backend', 'release.json'), JSON.stringify(release, null, 2) + '\n');
  log(
    `${config.site} ${release.version} (${release.commit}${release.dirty ? ', with uncommitted changes' : ''}): ${release.files.frontend} files in frontend/, ${release.files.backend} in backend/ -> ${dist}`,
  );
  return { dist, release };
}

/** The output folder: never the repository, its sources or .git; a folder with something in it only if it is an earlier build. */
function checkOut(root, dist) {
  const inside = (folder) => dist === folder || dist.startsWith(folder + sep);
  if (dist === root || inside(join(root, 'frontend')) || inside(join(root, 'backend')) || inside(join(root, '.git')) || root.startsWith(dist + sep)) {
    throw new Error(`${dist} is the repository, inside its frontend/, backend/ or .git, or above it: build somewhere else (--out).`);
  }
  if (existsSync(dist) && readdirSync(dist).length > 0 && !existsSync(join(dist, MARKER))) {
    throw new Error(`${dist} is not empty and holds no earlier build of anotoki-deploy: delete it, or build somewhere else (--out).`);
  }
}

function run(command, cwd, log) {
  log(`> ${command}   (in ${cwd})`);
  const result = spawnSync(command, { cwd, shell: true, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`"${command}" failed (exit code ${result.status ?? result.signal}).`);
  }
}

/** The Angular build's browser folder, from angular.json: the application project's outputPath. */
export function browserOutput(root, config) {
  const frontend = join(root, 'frontend');
  const workspace = parseJsonWithComments(readFileSync(join(frontend, 'angular.json'), 'utf8'));
  const projects = Object.entries(workspace.projects ?? {}).filter(([name, project]) => (config.project ? name === config.project : project.projectType === 'application'));
  if (projects.length !== 1) {
    throw new Error(config.project ? `angular.json has no project "${config.project}".` : 'angular.json has more than one application (or none): name it in "project".');
  }
  const [name, project] = projects[0];
  const outputPath = project.architect?.build?.options?.outputPath;
  let browser;
  if (typeof outputPath === 'string') {
    browser = join(frontend, outputPath, 'browser');
  } else if (outputPath && typeof outputPath === 'object') {
    browser = join(frontend, outputPath.base, outputPath.browser ?? 'browser');
  } else {
    browser = join(frontend, 'dist', name, 'browser');
  }
  if (!existsSync(join(browser, 'index.html'))) {
    throw new Error(`No built app at ${browser} (no index.html): the frontend build did not run, or angular.json says another folder.`);
  }
  return browser;
}

/** JSON as the Angular CLI reads angular.json: // and /* *\/ comments and trailing commas outside strings allowed. */
export function parseJsonWithComments(text) {
  const strip = (source, drop) => {
    let out = '';
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '"') {
        let end = i + 1;
        while (end < source.length && source[end] !== '"') {
          end += source[end] === '\\' ? 2 : 1;
        }
        out += source.slice(i, end + 1);
        i = end;
      } else {
        const skipped = drop(source, i);
        if (skipped === null) {
          out += source[i];
        } else {
          i = skipped;
        }
      }
    }
    return out;
  };
  const comments = (source, i) => {
    if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i);
      return end < 0 ? source.length : end - 1;
    }
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) {
        throw new Error('angular.json has a comment that is never closed.');
      }
      return end + 1;
    }
    return null;
  };
  const trailingCommas = (source, i) => (source[i] === ',' && /^\s*[}\]]/.test(source.slice(i + 1)) ? i : null);
  return JSON.parse(strip(strip(text, comments), trailingCommas));
}

/** What goes into backend/: the include entries (folders, files, globs), less the excluded, the host's settings and dot-files. */
export function selectBackend(backend, config) {
  const excluded = config.exclude.map(globToRegex);
  const picked = new Set();
  for (const entry of config.include) {
    const parts = entry.split('/');
    const firstGlob = parts.findIndex((part) => /[*?]/.test(part));
    const glob = firstGlob >= 0;
    const base = glob ? parts.slice(0, firstGlob).join('/') : entry;
    const start = join(backend, base);
    if (!existsSync(start)) {
      continue;
    }
    const pattern = glob ? globToRegex(entry) : null;
    const files = statSync(start).isDirectory() ? listFiles(start).map((path) => (base ? `${base}/${path}` : path)) : [base];
    for (const path of files) {
      if ((!pattern || pattern.test(path)) && !hidden(path) && !/(^|\/)[^/]+\.local\.php$/.test(path) && !excluded.some((rule) => rule.test(path))) {
        picked.add(path);
      }
    }
  }
  return [...picked].sort();
}

/** "*" is any name or part of one, "**" any number of folders; a pattern names a file, or a folder and all in it. */
export function globToRegex(glob) {
  let source = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*') {
      source += '.*';
      i += glob[i + 2] === '/' ? 2 : 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}(/.*)?$`);
}

/** Every file under a folder, as forward-slash paths relative to it. */
export function listFiles(folder, prefix = '') {
  const out = [];
  for (const entry of readdirSync(join(folder, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listFiles(folder, path));
    } else if (entry.isFile()) {
      out.push(path);
    }
  }
  return out;
}

const hidden = (path) => path.split('/').some((part) => part.startsWith('.'));

function copyAll(from, to, files) {
  for (const path of files) {
    const target = join(to, ...path.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(from, ...path.split('/')), target);
  }
}

/** What a release must hold, and what it must never hold. */
function check(dist, config) {
  const problems = [];
  for (const required of ['frontend/index.html', 'frontend/index.php', 'frontend/.htaccess', `backend/${config.entry}`, 'backend/.htaccess']) {
    if (!existsSync(join(dist, ...required.split('/')))) {
      problems.push(`${required} is missing`);
    }
  }
  const top = readdirSync(dist).filter((name) => ![MARKER, 'frontend', 'backend'].includes(name));
  if (top.length) {
    problems.push(`unexpected at the top: ${top.join(', ')}`);
  }
  for (const path of listFiles(dist)) {
    if (/(^|\/)[^/]+\.local\.php$/.test(path) || /(^|\/)(installed\.lock|setup-token[^/]*)$/.test(path)) {
      problems.push(`${path} belongs to the host, never to a release`);
    }
  }
  if (problems.length) {
    throw new Error(`The release in ${dist} is not right:\n  ${problems.join('\n  ')}`);
  }
}

function frontendVersion(root) {
  try {
    return JSON.parse(readFileSync(join(root, 'frontend', 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function gitState(root) {
  const git = (...args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  const head = git('rev-parse', '--short', 'HEAD');
  if (head.status !== 0) {
    return { commit: 'unknown', dirty: true };
  }
  return { commit: head.stdout.trim(), dirty: git('status', '--porcelain').stdout.trim() !== '' };
}
