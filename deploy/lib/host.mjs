// What changes the host. A release is frontend/ and backend/ in the site's folder, each replaced whole: the new
// ones go up beside the live ones (.new), the live ones are copied home and kept as .old, and two renames each
// swap them. config/, storage/ and the folders `beside` are never written, renamed or deleted.
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { listFiles } from './build.mjs';
import { RESERVED } from './config.mjs';
import { connect, listRemote, readRemoteText, remotePath } from './remote.mjs';
import { smoke } from './smoke.mjs';
import { switchHtaccess } from './templates.mjs';

const FOLDERS = ['frontend', 'backend'];

export async function deploy(config, { dist, backups = null, go = false, log = console.log }) {
  for (const folder of FOLDERS) {
    if (!existsSync(join(dist, folder))) {
      throw new Error(`${dist} holds no ${folder}/: build first.`);
    }
  }
  const release = JSON.parse(readFileSync(join(dist, 'backend', 'release.json'), 'utf8'));
  if (release.site !== config.site) {
    throw new Error(`${dist} is a release of "${release.site}", not of "${config.site}".`);
  }
  const local = Object.fromEntries(FOLDERS.map((folder) => [folder, sizes(join(dist, folder))]));
  log(`${config.site} ${release.version} (${release.commit}) -> ${config.remote}: ${Object.keys(local.frontend).length} files in frontend/, ${Object.keys(local.backend).length} in backend/`);
  if (!go) {
    log('Dry run, nothing sent. With --go: the live frontend/ and backend/ are copied into --backups, the release goes up as .new, is checked, and is swapped in (the live ones kept as .old).');
    return true;
  }
  if (!backups) {
    throw new Error('--backups DIR is needed with --go: the live frontend/ and backend/ are copied there first.');
  }

  const client = await connect();
  let switched;
  try {
    const live = {};
    for (const folder of FOLDERS) {
      live[folder] = (await client.exists(remotePath(config, folder))) === 'd';
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    for (const folder of FOLDERS.filter((folder) => live[folder])) {
      const target = join(backups, config.site, stamp, folder);
      mkdirSync(target, { recursive: true });
      log(`copying the live ${folder}/ -> ${target}`);
      await client.downloadDir(remotePath(config, folder), target);
    }

    for (const folder of FOLDERS) {
      const next = remotePath(config, `${folder}.new`);
      if (await client.exists(next)) {
        await client.rmdir(next, true);
      }
      log(`uploading ${folder}/ as ${folder}.new/`);
      await client.uploadDir(join(dist, folder), next);
      const sent = await listRemote(client, next);
      const wrong = Object.entries(local[folder]).filter(([path, size]) => sent[path] !== size);
      if (wrong.length) {
        throw new Error(`${folder}.new/ on the host differs from the release in ${wrong.length} files (first ${wrong[0][0]}): nothing was swapped.`);
      }
    }

    for (const folder of FOLDERS) {
      const old = remotePath(config, `${folder}.old`);
      if (await client.exists(old)) {
        await client.rmdir(old, true);
      }
    }
    for (const folder of FOLDERS) {
      if (live[folder]) {
        await client.rename(remotePath(config, folder), remotePath(config, `${folder}.old`));
      }
      await client.rename(remotePath(config, `${folder}.new`), remotePath(config, folder));
    }
    log(`Swapped in. ${FOLDERS.some((folder) => live[folder]) ? 'The release before is kept as .old (rollback).' : 'Nothing was live before.'}`);
    switched = (await readRemoteText(client, remotePath(config, '.htaccess'))) === switchHtaccess(config);
  } finally {
    await client.end().catch(() => {});
  }
  if (!switched) {
    log("The site's .htaccess is not the switch yet: the site still runs the old way (anotoki-deploy switch).");
    return true;
  }
  return smoke(config, { dist, log });
}

export async function rollback(config, { go = false, log = console.log }) {
  const client = await connect();
  try {
    for (const folder of FOLDERS) {
      if ((await client.exists(remotePath(config, `${folder}.old`))) !== 'd') {
        throw new Error(`No ${folder}.old/ on the host: there is no release before to go back to.`);
      }
    }
    if (!go) {
      log('Dry run. With --go: frontend/ and backend/ become .new, and the .old ones are swapped back in.');
      return true;
    }
    for (const folder of FOLDERS) {
      const next = remotePath(config, `${folder}.new`);
      if (await client.exists(next)) {
        await client.rmdir(next, true);
      }
    }
    for (const folder of FOLDERS) {
      await client.rename(remotePath(config, folder), remotePath(config, `${folder}.new`));
      await client.rename(remotePath(config, `${folder}.old`), remotePath(config, folder));
    }
    log('Back on the release before; the one rolled back is kept as .new.');
  } finally {
    await client.end().catch(() => {});
  }
  return smoke(config, { log });
}

/**
 * The switch: the site's .htaccess becomes the one that sends every request into frontend/ (the one before kept as
 * .htaccess.flat). A top-level folder of the old layout whose own .htaccess rewrites (api/.htaccess) would keep its
 * addresses on the old files - that .htaccess is set aside too (.htaccess.flat). --undo puts both back.
 */
export async function switchSite(config, { go = false, undo = false, log = console.log }) {
  const text = switchHtaccess(config);
  if (!go) {
    log(undo ? 'Dry run. With --go: the .htaccess.flat files are put back.' : text);
    if (!undo) {
      log("Dry run. With --go: this becomes the site's .htaccess (the one before kept as .htaccess.flat), and a top-level folder's .htaccess that rewrites is set aside.");
    }
    return true;
  }
  const top = remotePath(config, '.htaccess');
  const flat = remotePath(config, '.htaccess.flat');
  const keep = new Set([...RESERVED, ...config.beside, ...FOLDERS.flatMap((folder) => [`${folder}.new`, `${folder}.old`]), ...Object.values(config.content).map((item) => item.to.split('/')[0])]);
  const client = await connect();
  try {
    const folders = (await client.list(config.remote)).filter((entry) => entry.type === 'd' && !keep.has(entry.name)).map((entry) => entry.name);
    if (undo) {
      if ((await client.exists(flat)) !== '-') {
        throw new Error('No .htaccess.flat on the host: nothing to undo.');
      }
      for (const name of folders) {
        if ((await client.exists(remotePath(config, `${name}/.htaccess.flat`))) === '-') {
          await client.rename(remotePath(config, `${name}/.htaccess.flat`), remotePath(config, `${name}/.htaccess`));
          log(`put back ${name}/.htaccess`);
        }
      }
      if ((await client.exists(top)) === '-') {
        await client.delete(top);
      }
      await client.rename(flat, top);
      log("The site's .htaccess before the switch is back.");
      return true;
    }

    for (const folder of FOLDERS) {
      if ((await client.exists(remotePath(config, folder))) !== 'd') {
        throw new Error(`No ${folder}/ on the host: deploy first.`);
      }
    }
    const current = await readRemoteText(client, top);
    if (current !== text) {
      if (current !== null) {
        if ((await client.exists(flat)) === '-') {
          throw new Error('The site has an .htaccess that is not the switch and an .htaccess.flat already: look at both by hand.');
        }
        await client.rename(top, flat);
      }
      const fresh = remotePath(config, '.htaccess.new');
      await client.put(Buffer.from(text, 'utf8'), fresh);
      await client.rename(fresh, top);
      log(current === null ? 'The switch is in.' : 'The switch is in; the .htaccess before is kept as .htaccess.flat.');
    } else {
      log('The switch was already in.');
    }
    for (const name of folders) {
      const own = await readRemoteText(client, remotePath(config, `${name}/.htaccess`));
      if (own !== null && /^\s*Rewrite/m.test(own)) {
        await client.rename(remotePath(config, `${name}/.htaccess`), remotePath(config, `${name}/.htaccess.flat`));
        log(`set aside ${name}/.htaccess (it rewrites, and would keep /${name}/... on the old files)`);
      }
    }
  } finally {
    await client.end().catch(() => {});
  }
  return undo ? true : smoke(config, { log });
}

export async function status(config, { log = console.log }) {
  const client = await connect();
  try {
    const entries = await client.list(config.remote);
    const names = new Set(entries.map((entry) => entry.name));
    for (const folder of FOLDERS.flatMap((folder) => [folder, `${folder}.new`, `${folder}.old`])) {
      if (!names.has(folder)) {
        continue;
      }
      const release = folder.startsWith('backend') ? await readRemoteText(client, remotePath(config, `${folder}/release.json`)) : null;
      const about = release ? JSON.parse(release) : null;
      log(`  ${folder}/${about ? `  ${about.version} (${about.commit}, built ${about.builtAt})` : ''}`);
    }
    const switched = (await readRemoteText(client, remotePath(config, '.htaccess'))) === switchHtaccess(config);
    log(`  .htaccess: ${switched ? 'the switch' : 'not the switch - the site runs the old way'}`);
    const known = new Set([
      '.htaccess',
      '.htaccess.flat',
      ...RESERVED,
      ...config.beside,
      ...FOLDERS.flatMap((folder) => [`${folder}.new`, `${folder}.old`]),
      ...Object.values(config.content).map((item) => item.to.split('/')[0]),
    ]);
    const other = entries.filter((entry) => !known.has(entry.name));
    log(`  ${other.length ? `${other.length} more files and folders (from before the switch: delete them once the site runs well)` : 'nothing else'}`);
  } finally {
    await client.end().catch(() => {});
  }
  return true;
}

/** Content kept on the host beside the release: only ever added to - what is missing or differs goes up. */
export async function content(root, config, name, { go = false, log = console.log }) {
  const item = config.content[name];
  if (!item) {
    throw new Error(`No content "${name}" in the site's settings.`);
  }
  const from = join(root, ...item.from.split('/'));
  if (!existsSync(from)) {
    throw new Error(`${from} is not there.`);
  }
  const local = sizes(from);
  const client = await connect();
  try {
    const target = remotePath(config, item.to);
    const there = (await client.exists(target)) === 'd' ? await listRemote(client, target) : {};
    const send = Object.keys(local).filter((path) => there[path] !== local[path]);
    log(`${name}: ${Object.keys(local).length} files here, ${Object.keys(there).length} in ${item.to}/ on the host, ${send.length} to send (nothing there is ever deleted).`);
    if (!go || !send.length) {
      return true;
    }
    for (const folder of new Set(send.map((path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')))) {
      await client.mkdir(folder ? `${target}/${folder}` : target, true);
    }
    for (let i = 0; i < send.length; i += 10) {
      await Promise.all(send.slice(i, i + 10).map((path) => client.fastPut(join(from, ...path.split('/')), `${target}/${path}`)));
    }
    log(`sent ${send.length} files.`);
  } finally {
    await client.end().catch(() => {});
  }
  return true;
}

function sizes(folder) {
  return Object.fromEntries(listFiles(folder).map((path) => [path, statSync(join(folder, ...path.split('/'))).size]));
}
