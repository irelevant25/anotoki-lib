import { LegalFacts } from '@anotoki/lib/legal';

/**
 * The legal pages' facts for the showcase: a sample site (a learning site with visitors and feedback), worded in
 * English and Slovak here - a site words its facts in its own database. ?iam=1 shows the anotoki account's own
 * pages (its account, encrypted backups, Google, the mail service); ?fan=1 the fan clause; ?feedback=0 a site
 * that takes no feedback (the Contact page gives the address alone). A sketch for the showcase: each site's real
 * facts come with its own pages.
 */
const params = new URLSearchParams(location.search);
const FAN = params.get('fan') === '1';
const NO_FEEDBACK = params.get('feedback') === '0';

const IAM_ADDRESS = 'https://iam.example.test';

export function showcaseLegalFacts(language: string, iam: boolean): LegalFacts {
  const sk = language === 'sk';
  return iam ? iamFacts(sk) : siteFacts(sk);
}

function siteFacts(sk: boolean): LegalFacts {
  return {
    site: sk ? 'Ukážková akadémia' : 'Sample Academy',
    about: sk
      ? 'Ukážková akadémia učí niečo nové každý deň po troške: lekcie, opakovanie a prehľad o pokroku.'
      : 'Sample Academy teaches something new a little every day: lessons, reviews and a view of your progress.',
    updated: '2026-10-13',
    account: { deleteUrl: `${IAM_ADDRESS}/account/security`, privacyUrl: `${IAM_ADDRESS}/privacy` },
    data: [
      {
        name: sk ? 'Záznam o účte' : 'Your record here',
        what: sk ? 'Identifikátor účtu anotoki, meno a kedy sa používateľ prihlásil prvý a naposledy.' : "Your anotoki account's id, your name, and when you were first and last here.",
        why: sk ? 'Aby bolo jasné, čí je ktorý pokrok.' : 'To know whose progress is whose.',
        kept: sk ? 'Kým sa účet anotoki nezmaže; potom sa odstráni meno.' : 'Until your anotoki account is deleted; then your name goes.',
      },
      {
        name: sk ? 'Pokrok' : 'Your progress',
        what: sk ? 'Absolvované lekcie, výsledky opakovania a kedy.' : 'The lessons you did, your reviews and when.',
        why: sk ? 'Aby sa dal ukázať pokrok a naplánovať, čo príde ďalej.' : 'To show your progress and plan what comes next.',
        kept: sk ? 'Kým ho používateľ nezmaže alebo kým sa nezmaže účet.' : 'Until you delete it, or your account is deleted.',
      },
    ],
    visitors: {
      what: sk
        ? 'Pokrok bez účtu, pod náhodným kľúčom uloženým v tomto prehliadači; pri prihlásení sa presunie do účtu.'
        : 'Your progress without an account, under a random key kept in this browser; signing in moves it into your account.',
      kept: sk ? '30 dní od poslednej návštevy.' : '30 days after your last visit.',
    },
    feedback: !NO_FEEDBACK,
    storage: [
      { preset: 'signInHint', name: 'anotoki_signed_in' },
      { preset: 'signIn', name: 'anotoki-auth:…' },
      { preset: 'theme', name: 'anotoki-showcase:theme' },
      { preset: 'language', name: 'anotoki-showcase:language' },
      { preset: 'visitorKey', name: 'anotoki-showcase:visitor', kept: sk ? 'Do prihlásenia alebo 30 dní od poslednej návštevy.' : 'Until you sign in, or 30 days after your last visit.' },
    ],
    processors: [{ preset: 'hosting' }, { preset: 'cloudflare' }],
    fanDisclaimer: FAN ? 'hoyoverse' : null,
  };
}

function iamFacts(sk: boolean): LegalFacts {
  return {
    site: sk ? 'účet anotoki' : 'the anotoki account',
    about: sk
      ? 'Účet anotoki je jeden účet pre všetky stránky anotoki: prihlásenie, zabezpečenie účtu a jeho nastavenia.'
      : 'The anotoki account is one account for every anotoki site: signing in, keeping the account safe, and its settings.',
    updated: '2026-10-13',
    account: { isIam: true, deleteUrl: '/account/security' },
    data: [
      {
        name: sk ? 'Účet' : 'Your account',
        what: sk
          ? 'E-mailová adresa, meno, heslo ako odtlačok (nikdy samotné heslo), jazyk, vzhľad a formát dátumu.'
          : 'Your e-mail address, your name, your password as a hash (never the password itself), your language, look and date format.',
        why: sk ? 'Aby sa dalo prihlásiť na všetkých stránkach anotoki.' : 'To sign you in on every anotoki site.',
        kept: sk ? 'Kým sa účet nezmaže: zmaže sa 30 dní po žiadosti.' : 'Until you delete the account: it is deleted 30 days after you ask.',
      },
      {
        name: sk ? 'Spôsob prihlasovania' : 'How you sign in',
        what: sk
          ? 'Tajomstvo overovacej aplikácie (šifrované), záložné kódy (ako odtlačky) a zapamätané prehliadače.'
          : "Your authenticator's secret (encrypted), your recovery codes (as hashes) and the browsers you asked to remember.",
        why: sk ? 'Aby bolo prihlásenie bezpečné.' : 'To keep signing in safe.',
        kept: sk ? 'Kým ich používateľ nezmení alebo kým sa nezmaže účet.' : 'Until you change them, or the account is deleted.',
      },
      {
        name: sk ? 'Prihlásenia' : 'Your sign-ins',
        what: sk
          ? 'Pri každom prihlásení čas, prehliadač a IP adresa; pri pokusoch o prihlásenie IP adresa.'
          : 'For each sign-in its time, the browser and the IP address; for attempts to sign in, the IP address.',
        why: sk
          ? 'Aby sa dalo zostať prihlásený, vidieť, kde je účet prihlásený, a zastaviť hádanie hesiel.'
          : 'To keep you signed in, to show where your account is signed in, and to stop password guessing.',
        kept: sk ? 'Kým sa prihlásenie neskončí; pokusy krátko.' : 'Until the sign-in ends; attempts briefly.',
      },
    ],
    auditLog: {
      what: sk
        ? 'Čo menia správcovia a bezpečnostné zmeny samotného používateľa (heslo, overovanie, zmazanie), s IP adresou.'
        : 'What the administrators change, and your own security changes (password, authenticator, deletion), with the IP address.',
    },
    backups: { encrypted: true },
    storage: [
      {
        name: '__Host-anotoki_iam',
        kind: 'cookie',
        purpose: sk ? 'Prihlásenie do účtu anotoki.' : 'Your sign-in to the anotoki account.',
        kept: sk ? 'Do odhlásenia alebo skončenia prihlásenia.' : 'Until you sign out, or the sign-in ends.',
      },
      { preset: 'signInHint', name: 'anotoki_signed_in' },
      { preset: 'theme', name: 'anotoki-iam:theme' },
      { preset: 'language', name: 'anotoki-iam:lang' },
    ],
    processors: [{ preset: 'hosting' }, { preset: 'cloudflare' }, { preset: 'google' }, { preset: 'mail' }],
  };
}
