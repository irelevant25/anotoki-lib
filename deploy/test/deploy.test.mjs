import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { build, globToRegex, listFiles, MARKER } from '../lib/build.mjs';
import { normalizeConfig } from '../lib/config.mjs';
import { remotePath } from '../lib/remote.mjs';
import { frontendHtaccess, frontIndexPhp, switchHtaccess } from '../lib/templates.mjs';

const site = { site: 'demo', remote: '/example.org/sub/demo', url: 'https://demo.example.org/' };
const temp = mkdtempSync(join(tmpdir(), 'anotoki-deploy-'));
after(() => rmSync(temp, { recursive: true, force: true }));

const write = (path, text = 'x') => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
};

test('settings: what a site leaves out is the default; the address is its origin', () => {
  const config = normalizeConfig(site);
  assert.equal(config.url, 'https://demo.example.org');
  assert.deepEqual(config.routes, ['api']);
  assert.equal(config.entry, 'api/index.php');
});

test('settings: a wrong one is refused, by name', () => {
  for (const [raw, said] of [
    [{ ...site, site: 'Demo!' }, /"site"/],
    [{ ...site, remote: 'relative/path' }, /"remote"/],
    [{ ...site, remote: '/a/../b' }, /"remote"/],
    [{ ...site, url: 'http://demo.example.org' }, /https/],
    [{ ...site, include: ['../outside'] }, /relative path/],
    [{ ...site, beside: ['config'] }, /"beside"/],
    [{ ...site, csp: 'a"b' }, /"csp"/],
    [{ ...site, nonsense: 1 }, /unknown setting "nonsense"/],
  ]) {
    assert.throws(() => normalizeConfig(raw), said);
  }
});

test('remote paths stay in the site folder', () => {
  const config = normalizeConfig(site);
  assert.equal(remotePath(config, 'frontend.new'), '/example.org/sub/demo/frontend.new');
  for (const bad of ['../other', '/etc', 'a/../b', 'a\\b', '']) {
    if (bad === '') {
      assert.equal(remotePath(config, bad), '/example.org/sub/demo');
    } else {
      assert.throws(() => remotePath(config, bad), /Refusing/);
    }
  }
});

test('globs: * stays in one folder, ** crosses them, a folder takes what is in it', () => {
  assert.ok(globToRegex('data/*.json').test('data/a.json'));
  assert.ok(!globToRegex('data/*.json').test('data/source/a.json'));
  assert.ok(globToRegex('data/**/*.json').test('data/source/a.json'));
  assert.ok(globToRegex('api').test('api/routes/x.php'));
  assert.ok(!globToRegex('api').test('apis/x.php'));
});

test('the generated files say what the settings say', () => {
  const config = normalizeConfig({
    ...site,
    routes: ['api', '.well-known/jwks.json'],
    csp: "default-src 'self'",
    noCache: ['theme-boot.js'],
    beside: ['uploads'],
    types: { '.avif': 'image/avif' },
    entry: 'api/front.php',
  });
  const htaccess = frontendHtaccess(config);
  assert.match(htaccess, /RewriteRule \^\(api\|\\\.well-known\/jwks\\\.json\)\(\/\|\$\) index\.php \[L\]/);
  assert.match(htaccess, /Content-Security-Policy "default-src 'self'"/);
  assert.match(htaccess, /\^\(index\\\.html\|theme-boot\\\.js\)\$/);
  assert.doesNotMatch(htaccess, /^\s*(Options|DirectoryIndex|RewriteBase)/m);
  const theSwitch = switchHtaccess(config);
  assert.match(theSwitch, /RewriteRule \^uploads\(\/\|\$\) - \[L\]\nRewriteCond/);
  assert.match(theSwitch, /RewriteRule \^\(\.\*\)\$ frontend\/\$1 \[L\]\n$/);
  assert.match(theSwitch, /AddType image\/avif \.avif/);
  assert.match(frontIndexPhp(config), /backend\/api\/front\.php/);
});

test('build: one release - the app, the code the settings name, nothing of the host', () => {
  const root = join(temp, 'site');
  write(join(root, 'frontend', 'angular.json'), JSON.stringify({ projects: { demo: { projectType: 'application', architect: { build: { options: { outputPath: 'dist/demo' } } } } } }));
  write(join(root, 'frontend', 'package.json'), JSON.stringify({ version: '1.2.3' }));
  const browser = join(root, 'frontend', 'dist', 'demo', 'browser');
  write(join(browser, 'index.html'), '<script src="main-ABCDEFGH.js" type="module"></script>');
  write(join(browser, 'main-ABCDEFGH.js'));
  write(join(browser, 'media', 'font-ABCDEFGH.woff2'));
  write(join(browser, '.hidden'));
  write(join(browser, 'stray.php'));
  write(join(dirname(browser), '3rdpartylicenses.txt'));
  write(join(root, 'backend', 'composer.json'), '{}');
  write(join(root, 'backend', 'api', 'index.php'), '<?php');
  write(join(root, 'backend', 'api', '.htaccess'), 'RewriteEngine On');
  write(join(root, 'backend', 'config', 'config.php'), '<?php');
  write(join(root, 'backend', 'config', 'database.local.php'), '<?php secret');
  write(join(root, 'backend', 'vendor', 'autoload.php'), '<?php');
  write(join(root, 'backend', 'tests', 'a.test.php'), '<?php');
  write(join(root, 'backend', 'storage', 'installed.lock'));
  write(join(root, 'backend', 'data', 'words.json'), '{}');
  write(join(root, 'backend', 'data', 'source', 'words.tsv'));

  const config = normalizeConfig({ ...site, include: ['api', 'config', 'vendor', 'data/*.json', 'setup.php'], exclude: ['vendor/autoload.php'] });
  const { dist, release } = build(root, config, { skipFrontend: true, log: () => {} });
  assert.equal(release.version, '1.2.3');
  assert.deepEqual(listFiles(join(dist, 'frontend')).sort(), ['.htaccess', '3rdpartylicenses.txt', 'index.html', 'index.php', 'main-ABCDEFGH.js', 'media/font-ABCDEFGH.woff2']);
  assert.deepEqual(listFiles(join(dist, 'backend')).sort(), ['.htaccess', 'api/index.php', 'config/config.php', 'data/words.json', 'release.json']);
  assert.ok(existsSync(join(dist, MARKER)));
  assert.equal(JSON.parse(readFileSync(join(dist, 'backend', 'release.json'), 'utf8')).site, 'demo');

  // An app built already, instead of the site's build.
  const ready = join(temp, 'ready-app');
  write(join(ready, 'index.html'), '<p>');
  write(join(ready, 'main-READYAPP.js'));
  const other = build(root, config, { out: join(temp, 'with-ready-app'), frontend: ready, log: () => {} });
  assert.deepEqual(listFiles(join(other.dist, 'frontend')).sort(), ['.htaccess', 'index.html', 'index.php', 'main-READYAPP.js']);

  // An earlier build is replaced; a folder that is not one is refused.
  build(root, config, { skipFrontend: true, log: () => {} });
  write(join(temp, 'other', 'keep.txt'));
  assert.throws(() => build(root, config, { out: join(temp, 'other'), skipFrontend: true, log: () => {} }), /not empty/);
  assert.throws(() => build(root, config, { out: join(root, 'backend', 'dist'), skipFrontend: true, log: () => {} }), /inside its frontend\/, backend\//);
});
