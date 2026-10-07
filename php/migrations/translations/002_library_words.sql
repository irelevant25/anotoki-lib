-- anotoki_translations 002 - the anotoki library's own words, under its namespace anotoki.
--
-- The words the library's modules show on every site: its language switcher's and its status page's.
-- anotoki-lib's php/resources/library-words.json holds them - the Angular half's built-in words are made
-- from the same file, and a test of the library holds this file to it.
--
-- A key's description is the library's, and is written again whenever a library migration carries it.
-- A key's strings are the site's once it has any: they are written here only for a library key that has
-- no string at all. So a site that took a key over before this file ran - with its own words, maybe with
-- a language left blank on purpose - keeps them, and so does an owner's rewording.
--
-- Released with anotoki-lib 0.3.0, and never edited once released: a change is a new file.

INSERT INTO translation_keys (name, description) VALUES
    ('anotoki.language.label', 'The anotoki library''s language switcher: the small heading above the languages on offer, and the accessible name of that group. The languages themselves are shown in their own names and are not strings. No placeholders.'),
    ('anotoki.language.button', 'The anotoki library''s language switcher: the accessible name of its button, which shows only the current language''s code ("SK"). {name}: that language in its own name ("Slovenčina"), shown as it is. {code}: the code the button shows - keep it in, for somebody who speaks to the computer names the button by what it shows (WCAG 2.5.3, Label in Name). Placeholders: {name}, {code}.'),
    ('anotoki.language.notLoaded', 'The anotoki library''s language switcher: said when the words of the language chosen there could not be fetched; the page stays in the language it was in. No placeholders.'),
    ('anotoki.language.notSaved', 'The anotoki library''s language switcher: said to somebody signed in when the language chosen there could not be saved to their anotoki account (the IAM out of reach, the sign-in ended); the page stays in it until it is loaded again. Not said for a language the account does not offer - that one is the site''s own choice. No placeholders.'),
    ('anotoki.siteStatus.updatingTitle', 'The anotoki library''s status page, while a database update waits (shown to everybody but the site''s ADMIN): its heading. No placeholders.'),
    ('anotoki.siteStatus.updatingText', 'The anotoki library''s status page, while a database update waits: the sentence under its heading. The page asks again by itself and reloads once the site is back. No placeholders.'),
    ('anotoki.siteStatus.unavailableTitle', 'The anotoki library''s status page, while the site cannot reach its database: its heading. No placeholders.'),
    ('anotoki.siteStatus.unavailableText', 'The anotoki library''s status page, while the site cannot reach its database: the sentence under its heading. The page asks again by itself. It speaks to the reader: a site that addresses its readers formally words it its own way. No placeholders.'),
    ('anotoki.siteStatus.notSetUpTitle', 'The anotoki library''s status page, on a site that was never set up: its heading. No placeholders.'),
    ('anotoki.siteStatus.notSetUpText', 'The anotoki library''s status page, on a site that was never set up: the sentence under its heading, above the button to the setup page. No placeholders.'),
    ('anotoki.siteStatus.openSetup', 'The anotoki library''s status page, on a site that was never set up: the button that opens its setup page. No placeholders.'),
    ('anotoki.siteStatus.tryAgain', 'The anotoki library''s status page: the button that asks the site again at once, instead of waiting for the page to ask by itself. No placeholders.'),
    ('anotoki.siteStatus.signIn', 'The anotoki library''s status page, while a database update waits and nobody is signed in: the quiet link to sign in, which is how the site''s ADMIN gets to the update. No placeholders.')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- One statement for every language: the rows it writes do not hide each other from the test of "no
-- string at all", which sees the table as it was before the statement began.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, v.language_code, v.value
  FROM (VALUES
    ('anotoki.language.label', 'en', 'Language'),
    ('anotoki.language.label', 'sk', 'Jazyk'),
    ('anotoki.language.button', 'en', 'Language: {name} ({code})'),
    ('anotoki.language.button', 'sk', 'Jazyk: {name} ({code})'),
    ('anotoki.language.notLoaded', 'en', 'The language could not be loaded. Try again.'),
    ('anotoki.language.notLoaded', 'sk', 'Jazyk sa nepodarilo načítať. Skús to znova.'),
    ('anotoki.language.notSaved', 'en', 'The language could not be saved to your anotoki account - it holds for this visit only.'),
    ('anotoki.language.notSaved', 'sk', 'Jazyk sa nepodarilo uložiť do tvojho účtu anotoki – platí len počas tejto návštevy.'),
    ('anotoki.siteStatus.updatingTitle', 'en', 'The site is being updated'),
    ('anotoki.siteStatus.updatingTitle', 'sk', 'Stránku práve aktualizujeme'),
    ('anotoki.siteStatus.updatingText', 'en', 'It will be back in a few minutes. This page reloads by itself.'),
    ('anotoki.siteStatus.updatingText', 'sk', 'O pár minút bude späť. Táto stránka sa obnoví sama.'),
    ('anotoki.siteStatus.unavailableTitle', 'en', 'The site is not available right now'),
    ('anotoki.siteStatus.unavailableTitle', 'sk', 'Stránka teraz nie je dostupná'),
    ('anotoki.siteStatus.unavailableText', 'en', 'Please try again in a few minutes. This page reloads by itself.'),
    ('anotoki.siteStatus.unavailableText', 'sk', 'Skús to znova o pár minút. Táto stránka sa obnoví sama.'),
    ('anotoki.siteStatus.notSetUpTitle', 'en', 'This site is not set up yet'),
    ('anotoki.siteStatus.notSetUpTitle', 'sk', 'Táto stránka ešte nie je nastavená'),
    ('anotoki.siteStatus.notSetUpText', 'en', 'Its setup page connects it to its database and to the anotoki sign-in.'),
    ('anotoki.siteStatus.notSetUpText', 'sk', 'Stránka nastavenia ju prepojí s databázou a s prihlasovaním anotoki.'),
    ('anotoki.siteStatus.openSetup', 'en', 'Open the setup page'),
    ('anotoki.siteStatus.openSetup', 'sk', 'Otvoriť stránku nastavenia'),
    ('anotoki.siteStatus.tryAgain', 'en', 'Try again'),
    ('anotoki.siteStatus.tryAgain', 'sk', 'Skúsiť znova'),
    ('anotoki.siteStatus.signIn', 'en', 'Sign in'),
    ('anotoki.siteStatus.signIn', 'sk', 'Prihlásiť sa')
  ) AS v(key_name, language_code, value)
  JOIN languages l ON l.code = v.language_code
 WHERE NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = v.key_name)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Every library key, with an English string: Slovak is not asked for - a site that took a key over may
-- have left it blank on purpose.
DO $$
DECLARE
    missing TEXT;
BEGIN
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
        ('anotoki.language.label'),
        ('anotoki.language.button'),
        ('anotoki.language.notLoaded'),
        ('anotoki.language.notSaved'),
        ('anotoki.siteStatus.updatingTitle'),
        ('anotoki.siteStatus.updatingText'),
        ('anotoki.siteStatus.unavailableTitle'),
        ('anotoki.siteStatus.unavailableText'),
        ('anotoki.siteStatus.notSetUpTitle'),
        ('anotoki.siteStatus.notSetUpText'),
        ('anotoki.siteStatus.openSetup'),
        ('anotoki.siteStatus.tryAgain'),
        ('anotoki.siteStatus.signIn')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'anotoki_translations 002: the library''s keys without an English string: %. A site that takes a library key over gives it its English.', missing;
    END IF;
END $$;

-- end of 002
