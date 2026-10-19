#!/usr/bin/env node
// anotoki-deploy: build a site's release and put it on the FTP-only host - the same for every anotoki site, the
// site's own settings in its backend/composer.json (extra["anotoki-deploy"]). See README.md.
import { join, resolve } from 'node:path';
import { build } from './lib/build.mjs';
import { findRoot, loadConfig } from './lib/config.mjs';
import { content, deploy, rollback, status, switchSite } from './lib/host.mjs';
import { smoke } from './lib/smoke.mjs';

const USAGE = `anotoki-deploy <command> [options]          (in a site's repository)

  build [--out DIR] [--skip-frontend]      the site's own build, then the release in DIR (default dist/):
                                           frontend/ and backend/
  deploy [--dist DIR] --backups DIR [--go] the release up as .new, the live one copied into DIR and kept as
                                           .old, swapped in, checked
  rollback [--go]                          the .old release back in
  switch [--go] [--undo]                   the site's .htaccess becomes the switch into frontend/ (once per site)
  status                                   what is on the host
  content <name> [--go]                    content kept beside the release, only ever added to
  smoke [--dist DIR]                       the live site, checked

Every command that changes the host only says what it would do without --go. The SFTP login: the file named by
ANOTOKI_DEPLOY_SECRETS, and hostkey.txt beside it.`;

const [command, ...rest] = process.argv.slice(2);
const options = { _: [] };
for (let i = 0; i < rest.length; i++) {
  const match = rest[i].match(/^--([a-z-]+)(?:=(.*))?$/);
  if (!match) {
    options._.push(rest[i]);
  } else if (['go', 'undo', 'skip-frontend'].includes(match[1])) {
    options[match[1]] = true;
  } else if (['out', 'dist', 'backups', 'root'].includes(match[1])) {
    options[match[1]] = match[2] ?? rest[++i];
  } else {
    fail(`Unknown option --${match[1]}.\n\n${USAGE}`);
  }
}

try {
  if (!command || command === 'help' || command === '--help') {
    console.log(USAGE);
    process.exit(0);
  }
  const root = findRoot(options.root ?? process.cwd());
  const config = loadConfig(root);
  const dist = resolve(options.dist ?? join(root, 'dist'));
  let ok = true;
  switch (command) {
    case 'build':
      build(root, config, { out: options.out, skipFrontend: options['skip-frontend'] });
      break;
    case 'deploy':
      ok = await deploy(config, { dist, backups: options.backups ? resolve(options.backups) : null, go: options.go });
      break;
    case 'rollback':
      ok = await rollback(config, { go: options.go });
      break;
    case 'switch':
      ok = await switchSite(config, { go: options.go, undo: options.undo });
      break;
    case 'status':
      ok = await status(config, {});
      break;
    case 'content':
      ok = await content(root, config, options._[0], { go: options.go });
      break;
    case 'smoke':
      ok = await smoke(config, { dist: options.dist ? dist : null });
      break;
    default:
      fail(`Unknown command "${command}".\n\n${USAGE}`);
  }
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  fail(error.message);
}

function fail(message) {
  console.error(`anotoki-deploy: ${message}`);
  process.exit(1);
}
