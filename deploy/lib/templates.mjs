// The files a release brings that no site writes itself: frontend/index.php, frontend/.htaccess and
// backend/.htaccess - and the switch, the .htaccess at the top of the site's folder, written once.
// Only Rewrite*, Require, Header, AddType, SetEnvIf and CGIPassAuth: no Options, DirectoryIndex or
// RewriteBase, which this family's host has refused with a 500.

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The switch: every request is served from frontend/ - except the folders `beside` and the host's certificate check. */
export function switchHtaccess(config) {
  const beside = config.beside.map((name) => `RewriteRule ^${escapeRegex(name)}(/|$) - [L]`);
  return [
    `# ${config.site}: every request is served from frontend/ (the built app, and index.php for the backend's`,
    '# addresses), whose own .htaccess routes it. backend/, config/ and storage/ are never served. Written',
    '# once by anotoki-deploy (switch); a release never brings it.',
    ...types(config),
    'RewriteEngine On',
    ...beside,
    'RewriteCond %{REQUEST_URI} !^/frontend/',
    'RewriteCond %{REQUEST_URI} !^/\\.well-known/acme-challenge/',
    'RewriteRule ^(.*)$ frontend/$1 [L]',
    '',
  ].join('\n');
}

/** The release's web root: the built app as it is, the backend's addresses to index.php, and the headers. */
export function frontendHtaccess(config) {
  const routes = config.routes.map(escapeRegex).join('|');
  const noCache = ['index.html', ...config.noCache].map(escapeRegex).join('|');
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    ...(config.csp ? { 'Content-Security-Policy': config.csp } : {}),
    ...config.headers,
  };
  return [
    `# ${config.site}: the site's web root (the switch at the top of the site's folder sends every request here).`,
    "# The built app as it is, and index.php - the one PHP file a visitor reaches - for the backend's addresses.",
    '# Written by anotoki-deploy from backend/composer.json (extra["anotoki-deploy"]): change that, not this.',
    '',
    'AddType text/javascript .js .mjs',
    ...types(config),
    '',
    '# The sign-in token must reach PHP: Apache running PHP as (Fast)CGI drops the Authorization header unless',
    '# told otherwise (2.4.13 or newer) - and where it cannot be told, it is copied into the environment.',
    '<IfModule mod_version.c>',
    '    <IfVersion >= 2.4.13>',
    '        CGIPassAuth On',
    '    </IfVersion>',
    '</IfModule>',
    '<IfModule mod_setenvif.c>',
    '    SetEnvIf Authorization "(.+)" HTTP_AUTHORIZATION=$1',
    '</IfModule>',
    '',
    '<IfModule mod_rewrite.c>',
    '    RewriteEngine On',
    "    # The backend's addresses are no files here: index.php answers them, from the address the browser",
    '    # asked for, which no rewrite changes.',
    `    RewriteRule ^(${routes})(/|$) index.php [L]`,
    '    RewriteRule ^setup\\.php$ index.php [L]',
    '    # A file of the app as it is (index.php and index.html too, which ends every rewrite here).',
    '    RewriteCond %{REQUEST_FILENAME} -f',
    '    RewriteRule ^ - [L]',
    '    # A page of the app gets index.html; an address with an extension that is no file (an old bundle',
    '    # after a release) stays a 404, never the app.',
    '    RewriteCond %{REQUEST_URI} !\\.[^/]*$',
    '    RewriteRule ^ index.html [L]',
    '</IfModule>',
    '',
    '# Access is checked before anything is rewritten: the setup page and the host check (no files here,',
    "# or uploaded by hand) are let through by name. No other PHP, and never Apache's own .ht* files.",
    '# (Not every dot-name: for an address that is no file Apache takes its first missing part as the',
    '# name - /.well-known/... is ".well-known" - and a backend\'s address there must reach index.php.',
    '# A release holds no other dot-file: the build leaves them out.)',
    '<FilesMatch "\\.(php|phtml|phar)$">',
    '    Require all denied',
    '</FilesMatch>',
    '<FilesMatch "^(index|setup|host-check)\\.php$">',
    '    Require all granted',
    '</FilesMatch>',
    '<FilesMatch "^\\.ht">',
    '    Require all denied',
    '</FilesMatch>',
    '',
    '<IfModule mod_headers.c>',
    ...Object.entries(headers)
      .filter(([, value]) => value !== null)
      .map(([name, value]) => `    Header always set ${name} "${value}"`),
    "    # The app's shell (and what the site names) change with every release under the same name: asked",
    '    # again each time. The bundles carry a hash of their content in their names and never change.',
    `    <FilesMatch "^(${noCache})$">`,
    '        Header set Cache-Control "no-cache"',
    '    </FilesMatch>',
    '    <FilesMatch "-[A-Z0-9]{8}\\.(js|css|woff2?)$">',
    '        Header set Cache-Control "public, max-age=31536000, immutable"',
    '    </FilesMatch>',
    '</IfModule>',
    '',
  ].join('\n');
}

/** backend/: only PHP reads what is there. */
export function denyHtaccess() {
  return [
    '# Written by anotoki-deploy: only PHP reads what is here - never a visitor.',
    '<IfModule mod_authz_core.c>',
    '    Require all denied',
    '</IfModule>',
    '<IfModule !mod_authz_core.c>',
    '    Order allow,deny',
    '    Deny from all',
    '</IfModule>',
    '',
  ].join('\n');
}

/** frontend/index.php: the setup page while backend/ has it, and the backend's front door for the rest. */
export function frontIndexPhp(config) {
  return [
    '<?php',
    '',
    "// Written by anotoki-deploy: the one PHP file a visitor reaches (frontend/.htaccess sends the backend's",
    "// addresses here). The site's code is in ../backend/; it reads the address the browser asked for",
    '// (REQUEST_URI), which no rewrite changes.',
    '',
    "$path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);",
    "if ($path === '/setup.php' && is_file(__DIR__ . '/../backend/setup.php')) {",
    "    require __DIR__ . '/../backend/setup.php';",
    '} else {',
    `    require __DIR__ . '/../backend/${config.entry}';`,
    '}',
    '',
  ].join('\n');
}

function types(config) {
  return Object.entries(config.types).map(([extension, type]) => `AddType ${type} ${extension}`);
}
