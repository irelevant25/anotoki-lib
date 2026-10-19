// The host: one SFTP connection. The login and the server's pinned key come from outside every repository:
// ANOTOKI_DEPLOY_SECRETS names a secrets.json ({ "sftp": { "host", "port", "username", "password" } }), and
// hostkey.txt beside it holds the key (SHA256:...). Every remote path is built by remotePath().
import Client from 'ssh2-sftp-client';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isRelativePath } from './config.mjs';

export async function connect() {
  const file = process.env.ANOTOKI_DEPLOY_SECRETS;
  if (!file || !existsSync(file)) {
    throw new Error('ANOTOKI_DEPLOY_SECRETS must name the secrets.json with the SFTP login - a file outside every repository.');
  }
  const { sftp } = JSON.parse(readFileSync(file, 'utf8'));
  const pinFile = join(dirname(file), 'hostkey.txt');
  if (!existsSync(pinFile)) {
    throw new Error(`No pinned host key: ${pinFile} must hold the server's key (SHA256:...).`);
  }
  const pinned = readFileSync(pinFile, 'utf8').trim();
  let seen = null;
  const client = new Client();
  try {
    await client.connect({
      host: sftp.host,
      port: sftp.port ?? 22,
      username: sftp.username,
      password: sftp.password,
      readyTimeout: 30000,
      hostVerifier: (key) => {
        seen = 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
        return seen === pinned;
      },
    });
  } catch (error) {
    throw new Error(seen && seen !== pinned ? `The server's host key ${seen} is not the pinned one: refusing to connect.` : `SFTP: ${error.message}`);
  }
  return client;
}

/** A path in the site's folder on the host - the only way the tool names one. */
export function remotePath(config, relative = '') {
  if (relative === '') {
    return config.remote;
  }
  if (!isRelativePath(relative)) {
    throw new Error(`Refusing the remote path "${relative}".`);
  }
  return `${config.remote}/${relative}`;
}

/** Every file under a remote folder, as { path: size }. */
export async function listRemote(client, folder, prefix = '') {
  const out = {};
  for (const entry of await client.list(prefix ? `${folder}/${prefix}` : folder)) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === 'd') {
      Object.assign(out, await listRemote(client, folder, path));
    } else {
      out[path] = entry.size;
    }
  }
  return out;
}

export async function readRemoteText(client, path) {
  return (await client.exists(path)) === '-' ? (await client.get(path)).toString('utf8') : null;
}
