-- anotoki_translations 009 - the words of the kit's input pieces of 0.6.0, under the anotoki library's namespaces
-- anotoki.dateField. and anotoki.colorField.
--
-- What the kit's input pieces say, each an entry point of @anotoki/lib of its own that reads its words itself (the
-- site's string first): the date field's (@anotoki/lib/ui/date-field) - the name of its calendar's button and of the
-- calendar, the month buttons, and what it says under itself when what was typed is no date or one outside the dates
-- it takes - and the colour field's (@anotoki/lib/ui/color-field) - what a screen reader hears for its colour box and
-- its suggested colours, and what it says of a code that is no colour. Month and day names are never words here: the
-- browser writes them (Intl). anotoki-lib's php/resources/library-words.json holds them - the Angular half's built-in
-- words are made from the same file, and a test of the library holds this file to it.
--
-- As in 002: a key's description is the library's, and is written again whenever a library migration carries it;
-- a key's strings are the site's once it has any - written here only for a library key that has no string at all.
-- So a site that took a key over before this file ran keeps its words.
--
-- Released with anotoki-lib 0.6.0, and never edited once released: a change is a new file.

INSERT INTO translation_keys (name, description) VALUES
    ('anotoki.dateField.choose', 'The anotoki library''s date field (a date typed, or chosen in a calendar that opens beside it): the name of the small button inside the field that opens the calendar - and its tooltip - and the name of the calendar it opens. {field}: the field''s own label ("Birthday", "Opens"), as the page shows it, so that two date fields on a page have two buttons a screen reader tells apart. Placeholders: {field}.'),
    ('anotoki.dateField.previousMonth', 'The anotoki library''s date field: the name and the tooltip of the calendar''s button that shows the month before. No placeholders.'),
    ('anotoki.dateField.nextMonth', 'The anotoki library''s date field: the name and the tooltip of the calendar''s button that shows the month after. No placeholders.'),
    ('anotoki.dateField.invalid', 'The anotoki library''s date field: said under the field when what was typed is no date it can read ("32.13.", "tomorrow"). {example}: a date written the way the field takes them - 31 December, in the order and with the separators of the reader''s date format ("31.12.2026", "12/31/2026"; "31.12." for a day and a month without a year). Placeholders: {example}.'),
    ('anotoki.dateField.tooEarly', 'The anotoki library''s date field: said under the field when the date typed is before the earliest one the field takes. {date}: that earliest date, written the way the field writes dates. Placeholders: {date}.'),
    ('anotoki.dateField.tooLate', 'The anotoki library''s date field: said under the field when the date typed is after the latest one the field takes. {date}: that latest date, written the way the field writes dates. Placeholders: {date}.'),
    ('anotoki.colorField.picker', 'The anotoki library''s colour field (a colour box that opens the device''s own colour picker, and a field for the colour''s code beside it): what a screen reader hears after the field''s label for the colour box - "Text colour, pick from the palette". Heard, never seen. No placeholders.'),
    ('anotoki.colorField.swatches', 'The anotoki library''s colour field: what a screen reader hears after the field''s label for the row of suggested colours under it, each a colour with its name - "Text colour, suggested colours". Heard, never seen. No placeholders.'),
    ('anotoki.colorField.invalid', 'The anotoki library''s colour field: said under the field when the colour''s code typed is not one it can read. A code is # and six digits 0-9 or letters a-f: keep "#1f5fbf" as it is. No placeholders.')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- One statement for every language: the rows it writes do not hide each other from the test of "no
-- string at all", which sees the table as it was before the statement began.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, v.language_code, v.value
  FROM (VALUES
    ('anotoki.dateField.choose', 'en', 'Choose a date: {field}'),
    ('anotoki.dateField.choose', 'sk', 'Vybrať dátum: {field}'),
    ('anotoki.dateField.previousMonth', 'en', 'Previous month'),
    ('anotoki.dateField.previousMonth', 'sk', 'Predchádzajúci mesiac'),
    ('anotoki.dateField.nextMonth', 'en', 'Next month'),
    ('anotoki.dateField.nextMonth', 'sk', 'Nasledujúci mesiac'),
    ('anotoki.dateField.invalid', 'en', 'Write the date like {example}.'),
    ('anotoki.dateField.invalid', 'sk', 'Dátum treba zadať v tvare {example}.'),
    ('anotoki.dateField.tooEarly', 'en', 'The earliest date is {date}.'),
    ('anotoki.dateField.tooEarly', 'sk', 'Najskorší možný dátum je {date}.'),
    ('anotoki.dateField.tooLate', 'en', 'The latest date is {date}.'),
    ('anotoki.dateField.tooLate', 'sk', 'Najneskorší možný dátum je {date}.'),
    ('anotoki.colorField.picker', 'en', 'Pick from the palette'),
    ('anotoki.colorField.picker', 'sk', 'Vybrať z palety'),
    ('anotoki.colorField.swatches', 'en', 'Suggested colours'),
    ('anotoki.colorField.swatches', 'sk', 'Navrhované farby'),
    ('anotoki.colorField.invalid', 'en', 'Write the colour as # and six digits or letters a–f, like #1f5fbf.'),
    ('anotoki.colorField.invalid', 'sk', 'Farbu treba zadať ako # a šesť číslic alebo písmen a – f, napríklad #1f5fbf.')
  ) AS v(key_name, language_code, value)
  JOIN languages l ON l.code = v.language_code
 WHERE NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = v.key_name)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- The keys of this file, each with an English string: Slovak is not asked for - a site that took a key over may
-- have left it blank on purpose.
DO $$
DECLARE
    missing TEXT;
BEGIN
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
        ('anotoki.dateField.choose'),
        ('anotoki.dateField.previousMonth'),
        ('anotoki.dateField.nextMonth'),
        ('anotoki.dateField.invalid'),
        ('anotoki.dateField.tooEarly'),
        ('anotoki.dateField.tooLate'),
        ('anotoki.colorField.picker'),
        ('anotoki.colorField.swatches'),
        ('anotoki.colorField.invalid')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'anotoki_translations 009: the library''s keys without an English string: %. A site that takes a library key over gives it its English.', missing;
    END IF;
END $$;

-- end of 009
