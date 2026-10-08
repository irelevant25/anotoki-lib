import { HttpErrorResponse, HttpEvent, HttpHeaders, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { AdminLanguage, TranslationGroup } from '@anotoki/lib/translations';
import { LIBRARY_WORDS } from '@anotoki/lib/ui';
import { Observable, delay, of, throwError } from 'rxjs';
import libraryWords from '../../../../../php/resources/library-words.json';

/*
 * The showcase's imagined server for the translations module: a site's words
 * in memory, behind the routes the PHP half answers (GET /api/translations/{code},
 * the admin strings and languages) - in the wire format, with the server's
 * refusals for what a save or a language must not do. Never published.
 */

interface Key {
  description: string;
  values: Record<string, string>;
}

const languages: AdminLanguage[] = [
  { code: 'en', name: 'English', native_name: 'English', enabled: true, sort_order: 1, seeded: true, strings: 0 },
  { code: 'sk', name: 'Slovak', native_name: 'Slovenčina', enabled: true, sort_order: 2, seeded: true, strings: 0 },
  { code: 'cs', name: 'Czech', native_name: 'Čeština', enabled: false, sort_order: 3, seeded: false, strings: 0 },
];

/** The showcase's own keys: a few of a site's, a plural family, and a mail (the IAM's server-only words). */
const keys = new Map<string, Key>([
  ['home.greeting', { description: 'The home page: its first line. Placeholders: {name}.', values: { en: 'Welcome back, {name}!', sk: 'Vitaj späť, {name}!', cs: 'Vítej zpět, {name}!' } }],
  ['home.lead', { description: 'The home page: the line under the greeting. No placeholders.', values: { en: 'Pick up where you left off.', sk: 'Pokračuj tam, kde si skončil.' } }],
  ['mail.reset.subject', { description: 'The password reset mail: its subject. No placeholders.', values: { en: 'Reset your password', sk: 'Obnov si heslo' } }],
  ['mail.reset.greeting', { description: 'The password reset mail: the first line. Placeholders: {username}.', values: { en: 'Hello {username},', sk: 'Ahoj {username},' } }],
  ['mail.reset.intro', { description: 'The password reset mail: the line before the link. No placeholders.', values: { en: 'Somebody asked to reset the password of this account.' } }],
  ['nav.reviews', { description: 'The top bar: the link to the reviews. No placeholders.', values: { en: 'Reviews', sk: 'Opakovania' } }],
  ['reviews.due.one', { description: 'The home page: how many reviews wait, for 1. Placeholders: {count}.', values: { en: '{count} review is due', sk: '{count} opakovanie čaká' } }],
  ['reviews.due.few', { description: 'The home page: how many reviews wait, for 2-4. Placeholders: {count}.', values: { en: '{count} reviews are due', sk: '{count} opakovania čakajú' } }],
  ['reviews.due.other', { description: 'The home page: how many reviews wait. Placeholders: {count}.', values: { en: '{count} reviews are due', sk: '{count} opakovaní čaká' } }],
  ['settings.title', { description: 'The settings page: its heading. No placeholders.', values: { en: 'Settings', sk: 'Nastavenia' } }],
]);

// The library's own words, as every site's database has them (anotoki_translations/002).
const described = libraryWords.keys as Record<string, { description: string }>;
for (const [key, english] of Object.entries(LIBRARY_WORDS.en)) {
  keys.set(key, { description: described[key]?.description ?? '', values: { en: english, sk: (LIBRARY_WORDS.sk as Record<string, string>)[key] } });
}

/** The mails, as the IAM shows them: a block each, in the message's order. */
export const SHOWCASE_GROUPS: TranslationGroup[] = [
  {
    prefix: 'mail.',
    heading: 'Mails',
    lead: 'A mail’s words hold exactly the placeholders its key lists, on one line, and no address: the link is the server’s to put in.',
    order: ['reset'],
    parts: ['subject', 'greeting', 'intro'],
    about: { 'mail.reset': { title: 'The password reset mail', text: 'Sent from "Forgotten password".' } },
    icon: 'mail',
  },
];

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1]);
}

function counted(): AdminLanguage[] {
  return [...languages]
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((language) => ({ ...language, strings: [...keys.values()].filter((key) => Object.hasOwn(key.values, language.code)).length }));
}

function grid(): unknown {
  return {
    languages: counted(),
    keys: [...keys.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, key]) => ({ name, description: key.description, values: { ...key.values } })),
  };
}

function bundle(code: string): unknown {
  const offered = counted().filter((language) => language.enabled);
  const language = offered.find((one) => one.code === code)?.code ?? offered.find((one) => one.code === code.split('-')[0])?.code ?? 'en';
  const values: Record<string, string> = {};
  const english: Record<string, string> = {};
  for (const [name, key] of [...keys.entries()].filter(([name]) => !name.startsWith('mail.'))) {
    english[name] = key.values['en'];
    values[name] = key.values[language] ?? key.values['en'];
  }
  return { language, languages: offered.map(({ code, name, native_name }) => ({ code, name, native_name })), values, ...(language === 'en' ? {} : { english }) };
}

/** A refusal in the default error body, as the PHP half answers it. */
function refuse(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Observable<never> {
  return throwError(() => new HttpErrorResponse({ status, statusText: 'Refused', error: { code, message, ...extra } }));
}

/** Saves `{key: {language: text}}` as the server does: all of it or none, the checks first. */
function save(values: Record<string, Record<string, string>>): Observable<never> | null {
  for (const [name, cells] of Object.entries(values)) {
    const key = keys.get(name);
    if (!key) {
      return refuse(422, 'unknown_key', `There is no key "${name}".`, { key: name, keys: [name] });
    }
    for (const [code, text] of Object.entries(cells)) {
      if (!languages.some((language) => language.code === code)) {
        return refuse(422, 'unknown_language', `There is no language "${code}".`, { key: name, language: code });
      }
      if (code === 'en' && text.trim() === '') {
        return refuse(422, 'fallback_required', `"${name}" needs its English: every other language falls back to it.`, { key: name, language: code });
      }
      const allowed = placeholders(key.values['en']);
      const unknown = placeholders(text).find((placeholder) => !allowed.includes(placeholder));
      if (unknown && code !== 'en') {
        return refuse(422, 'unknown_placeholder', `"${name}" has no {${unknown}}: the English string has ${allowed.length ? allowed.map((one) => `{${one}}`).join(', ') : 'none'}.`, {
          key: name,
          language: code,
          placeholder: unknown,
        });
      }
    }
  }
  for (const [name, cells] of Object.entries(values)) {
    const key = keys.get(name)!;
    for (const [code, text] of Object.entries(cells)) {
      if (text.trim() === '') {
        delete key.values[code];
      } else {
        key.values[code] = text.trim();
      }
    }
  }
  return null;
}

/** The answer, after a moment: a server is never instant. */
function answer(body: unknown, wait = 250, headers?: HttpHeaders): Observable<HttpResponse<unknown>> {
  return of(new HttpResponse({ status: 200, body, headers })).pipe(delay(wait));
}

function route(request: HttpRequest<unknown>): Observable<HttpEvent<unknown>> | null {
  const path = request.url.split('?')[0];
  const bundleMatch = /^\/api\/translations\/([^/]+)$/.exec(path);
  if (bundleMatch && request.method === 'GET') {
    return answer(bundle(decodeURIComponent(bundleMatch[1])), 120);
  }
  if (path === '/api/admin/languages' && request.method === 'GET') {
    return answer({ languages: counted() });
  }
  if (path === '/api/admin/languages' && request.method === 'POST') {
    const body = request.body as { code: string; name: string; native_name: string; enabled: boolean };
    if (languages.some((language) => language.code === body.code)) {
      return refuse(409, 'language_exists', `There is a language "${body.code}" already.`);
    }
    const added: AdminLanguage = { ...body, sort_order: Math.max(...languages.map((language) => language.sort_order)) + 1, seeded: false, strings: 0 };
    languages.push(added);
    return of(new HttpResponse({ status: 201, body: { language: added } })).pipe(delay(250));
  }
  const languageMatch = /^\/api\/admin\/languages\/([^/]+)$/.exec(path);
  if (languageMatch) {
    const language = languages.find((one) => one.code === languageMatch[1]);
    if (!language) {
      return refuse(404, 'not_found', 'There is no such language.');
    }
    if (request.method === 'PUT') {
      const changes = request.body as Partial<AdminLanguage>;
      if (language.code === 'en' && changes.enabled === false) {
        return refuse(409, 'fallback_language', 'English is what every other language falls back to: it is always offered.');
      }
      Object.assign(language, changes);
      return answer({ language: counted().find((one) => one.code === language.code) });
    }
    if (request.method === 'DELETE') {
      if (language.seeded) {
        return refuse(409, 'seeded_language', `${language.name} is released with the site: it can be hidden, never deleted.`);
      }
      const strings = counted().find((one) => one.code === language.code)!.strings;
      languages.splice(languages.indexOf(language), 1);
      keys.forEach((key) => delete key.values[language.code]);
      return answer({ strings });
    }
  }
  if (path === '/api/admin/translations' && request.method === 'GET') {
    return answer(grid(), 400);
  }
  if (path === '/api/admin/translations' && request.method === 'PUT') {
    return save((request.body as { values: Record<string, Record<string, string>> }).values) ?? answer(grid(), 500);
  }
  const fileMatch = /^\/api\/admin\/translations\/([^/]+)\/(export|import)$/.exec(path);
  if (fileMatch) {
    const code = fileMatch[1];
    if (fileMatch[2] === 'export') {
      const own = Object.fromEntries([...keys.entries()].filter(([, key]) => Object.hasOwn(key.values, code)).map(([name, key]) => [name, key.values[code]]));
      return answer(JSON.stringify(own, null, 4) + '\n', 300, new HttpHeaders({ 'Content-Disposition': `attachment; filename="translations-${code}.json"` }));
    }
    const values = request.body as Record<string, string>;
    return (
      save(
        Object.fromEntries(
          Object.entries(values)
            .filter(([, text]) => text.trim() !== '')
            .map(([name, text]) => [name, { [code]: text }]),
        ),
      ) ?? answer(grid(), 500)
    );
  }
  return null;
}

/** The interceptor that answers the translations module's routes - before any other of the showcase's. */
export const wordsServer: HttpInterceptorFn = (request, next) => route(request) ?? next(request);
