// The live site, asked over HTTPS after a release: the app (the release just sent, when its folder is given),
// the paths the site names, an old bundle answering 404, and nothing of backend/, config/ or storage/ served.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export async function smoke(config, { dist = null, log = console.log, attempts = 12, wait = 5000 } = {}) {
  const get = async (path) => {
    const response = await fetch(config.url + path, { redirect: 'manual', headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'anotoki-deploy' } });
    return { status: response.status, type: response.headers.get('content-type') ?? '', body: await response.text() };
  };
  const results = [];
  const check = (path, ok, said) => results.push({ path, ok, said });

  const index = dist ? join(dist, 'frontend', 'index.html') : null;
  const main = index && existsSync(index) ? readFileSync(index, 'utf8').match(/src="(main-[A-Za-z0-9]+\.js)"/)?.[1] : null;
  let home = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    home = await get('/');
    if (home.status === 200 && (!main || home.body.includes(main))) {
      break;
    }
    await new Promise((done) => setTimeout(done, wait));
  }
  check(
    '/',
    home.status === 200 && /text\/html/.test(home.type) && (!main || home.body.includes(main)),
    main && home.status === 200 && !home.body.includes(main) ? `200, but not the release's ${main}` : `${home.status} ${home.type}`,
  );

  for (const path of config.smoke) {
    const answer = await get(path);
    check(path, answer.status === 200, `${answer.status}`);
  }

  const bundle = `/chunk-${Math.random().toString(36).slice(2, 10).toUpperCase()}.js`;
  const old = await get(bundle);
  check(`${bundle} (no such bundle)`, old.status === 404, `${old.status} ${old.type}`);

  for (const path of ['/backend/release.json', '/config/database.local.php', '/storage/installed.lock']) {
    const answer = await get(path);
    check(path, answer.status === 403 || answer.status === 404, `${answer.status}`);
  }

  for (const result of results) {
    log(`  ${result.ok ? 'ok  ' : 'FAIL'} ${result.path}: ${result.said}`);
  }
  return results.every((result) => result.ok);
}
