<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Translations;

use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Translations\LanguageUsage;
use Anotoki\Lib\Translations\LibraryWords;
use Anotoki\Lib\Translations\Schema;
use Anotoki\Lib\Translations\Translations;
use Anotoki\Lib\Translations\TranslationsConfig;
use InvalidArgumentException;
use PDO;
use PDOException;
use RuntimeException;

/** The words on a real database: languages, the bundle, the grid, saves, import and export. */
final class TranslationsTest extends DatabaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $result = $this->migrator([$this->set('site'), Schema::migrationSet()])->apply();
        self::assertNull($result['error'], (string) $result['error']);

        $this->pdo->exec("INSERT INTO translation_keys (name, description) VALUES
            ('common.save', 'A button.'), ('common.close', 'A button.'), ('test.hello', 'Placeholders: {name}.'),
            ('mail.reset.subject', 'A mail''s subject.')");
        $this->pdo->exec("INSERT INTO translations (key_name, language_code, value) VALUES
            ('common.save', 'en', 'Save'), ('common.save', 'sk', 'Uložiť'),
            ('common.close', 'en', 'Close'),
            ('test.hello', 'en', 'Hello, {name}'), ('test.hello', 'sk', 'Ahoj, {name}'),
            ('mail.reset.subject', 'en', 'Reset your password'), ('mail.reset.subject', 'sk', 'Obnov si heslo')");
    }

    // ─── Readiness ──────────────────────────────────────────────────────────

    public function testWithoutTheTablesItIsNotReadyAndSaysSoWithoutFailing(): void
    {
        $this->pdo->exec('DROP TABLE translations, translation_keys, languages CASCADE');
        $words = $this->words();

        self::assertFalse($words->ready());
        self::assertSame([], $words->offeredCodes());
        self::assertSame(0, $words->forgetWriter(5));
        $refusal = $words->bundle('sk');
        self::assertInstanceOf(Refusal::class, $refusal);
        self::assertSame([503, 'translations_unavailable'], [$refusal->status, $refusal->code]);

        $this->pdo->beginTransaction();
        self::assertFalse($words->ready(), 'a question that cannot fail, even inside a transaction');
        $this->pdo->rollBack();
    }

    public function testItNeedsAPostgreSqlConnectionThatThrows(): void
    {
        $silent = $this->connect();
        $silent->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_SILENT);

        $this->expectException(InvalidArgumentException::class);
        new Translations($silent);
    }

    // ─── The bundle ─────────────────────────────────────────────────────────

    public function testTheBundleIsTheLanguagesStringsOverEnglishWithoutTheServersKeys(): void
    {
        self::assertArrayHasKey('mail.reset.subject', (array) $this->words()->bundle('sk')['values'], 'no server namespace configured: a key like any other');

        $bundle = $this->words(new TranslationsConfig(serverNamespaces: ['mail']))->bundle('sk');
        self::assertIsArray($bundle);

        self::assertSame('sk', $bundle['language']);
        self::assertSame([['code' => 'en', 'name' => 'English', 'native_name' => 'English'], ['code' => 'sk', 'name' => 'Slovak', 'native_name' => 'Slovenčina']], $bundle['languages']);
        $values = (array) $bundle['values'];
        self::assertSame('Uložiť', $values['common.save']);
        self::assertSame('Close', $values['common.close'], 'no Slovak string: English');
        self::assertSame('Jazyk', $values['anotoki.language.label'], 'the library\'s words among them');
        self::assertArrayNotHasKey('mail.reset.subject', $values, 'a server namespace\'s');
        self::assertArrayNotHasKey('mail.reset.subject', (array) $bundle['english']);
        self::assertSame('Save', ((array) $bundle['english'])['common.save']);
        $keys = array_keys($values);
        $sorted = $keys;
        sort($sorted, SORT_STRING);
        self::assertSame($sorted, $keys, 'by key, byte for byte');

        // As the IAM's route writes it, byte for byte.
        self::assertStringStartsWith(
            '{"language":"sk","languages":[{"code":"en","name":"English","native_name":"English"},{"code":"sk","name":"Slovak","native_name":"Slovenčina"}],"values":{"anotoki.language.button":"Jazyk: {name} ({code})",',
            json_encode($bundle, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        );
    }

    public function testEnglishHasNoSecondMapAndAnythingNotOfferedReadsInEnglish(): void
    {
        $english = $this->words()->bundle('en');
        self::assertSame(['language', 'languages', 'values'], array_keys($english));

        self::assertSame('sk', $this->words()->bundle('sk-sk')['language'], 'a region not offered: its language');
        self::assertSame(
            json_encode($this->words()->bundle('sk'), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            json_encode($this->words()->bundle('sk-sk'), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            'the very same answer'
        );
        self::assertSame('en', $this->words()->bundle('de')['language']);
        $this->pdo->exec("UPDATE languages SET enabled = FALSE WHERE code = 'sk'");
        self::assertSame('en', $this->words()->bundle('sk')['language'], 'switched off');
        self::assertSame([['code' => 'en', 'name' => 'English', 'native_name' => 'English']], $this->words()->bundle('sk')['languages']);
    }

    public function testWithoutAnEnglishStringThereIsNoBundleAndANonCodeIsNoLanguage(): void
    {
        $this->pdo->exec("DELETE FROM translations WHERE language_code = 'en' AND key_name NOT LIKE 'mail.%'");
        self::assertSame('translations_unavailable', $this->words(new TranslationsConfig(serverNamespaces: ['mail']))->bundle('sk')->code, 'a mail string is no page\'s English');

        foreach (['EN', 'en-GB', 'x', "\xC3\x28"] as $code) {
            $refusal = $this->words()->bundle($code);
            self::assertInstanceOf(Refusal::class, $refusal);
            self::assertSame([404, 'not_found'], [$refusal->status, $refusal->code]);
        }
    }

    public function testAnEmptyMapIsAnObject(): void
    {
        $this->pdo->exec("INSERT INTO languages (code, name, native_name, sort_order) VALUES ('de', 'German', 'Deutsch', 3)");

        self::assertSame('{}', json_encode($this->words()->export('de')['values']));
    }

    // ─── Languages ──────────────────────────────────────────────────────────

    public function testTheLanguagesAsTheAdminPagesReadThemWithTheSitesFields(): void
    {
        $this->pdo->exec('CREATE TABLE people (id INT PRIMARY KEY, language VARCHAR(10) NOT NULL DEFAULT \'en\' REFERENCES languages (code) ON UPDATE CASCADE ON DELETE SET DEFAULT)');
        $this->pdo->exec("INSERT INTO people (id, language) VALUES (1, 'sk'), (2, 'sk'), (3, 'en')");

        self::assertSame([
            ['code' => 'en', 'name' => 'English', 'native_name' => 'English', 'enabled' => true, 'sort_order' => 1, 'seeded' => true, 'strings' => 4 + count(LibraryWords::keys()), 'accounts' => 1],
            ['code' => 'sk', 'name' => 'Slovak', 'native_name' => 'Slovenčina', 'enabled' => true, 'sort_order' => 2, 'seeded' => true, 'strings' => 3 + count(LibraryWords::keys()), 'accounts' => 2],
        ], $this->words($this->accounts())->languages());
        self::assertSame(['en', 'sk'], $this->words()->offeredCodes());
    }

    public function testANewLanguageGoesLastOfferedOrNot(): void
    {
        $words = $this->words();

        $german = $words->createLanguage(['code' => 'de', 'name' => ' German ', 'native_name' => 'Deutsch']);
        self::assertSame(['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch', 'enabled' => true, 'sort_order' => 3, 'seeded' => false, 'strings' => 0], $german['language']);
        $czech = $words->createLanguage(['code' => 'cs', 'name' => 'Czech', 'native_name' => 'Čeština', 'enabled' => false]);
        self::assertSame([false, 4], [$czech['language']['enabled'], $czech['language']['sort_order']]);
        self::assertSame(['en', 'sk', 'de'], $words->offeredCodes());

        foreach ([
            [null, 'invalid_language'], [['a', 'b'], 'invalid_language'], [[], 'invalid_language'],
            [['code' => 'DE', 'name' => 'x', 'native_name' => 'x'], 'invalid_language'],
            [['code' => 'fr', 'name' => '', 'native_name' => 'x'], 'invalid_language'],
            [['code' => 'fr', 'name' => 'French', 'native_name' => "Fran\nçais"], 'invalid_language'],
            [['code' => 'fr', 'name' => 'French', 'native_name' => 'Français', 'enabled' => 'false'], 'invalid_language'],
            [['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch'], 'language_exists'],
        ] as [$body, $code]) {
            $refusal = $words->createLanguage($body);
            self::assertInstanceOf(Refusal::class, $refusal, json_encode($body));
            self::assertSame($code, $refusal->code, json_encode($body));
        }
        self::assertSame(409, $words->createLanguage(['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch'])->status);
    }

    public function testAtMostAsManyLanguagesAsTheSiteKeepsAndTheOrderStopsAtItsEnd(): void
    {
        $words = $this->words(new TranslationsConfig(languagesMax: 4, sortOrderMax: 3));

        self::assertSame(3, $words->createLanguage(['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch'])['language']['sort_order']);
        self::assertSame(3, $words->createLanguage(['code' => 'fr', 'name' => 'French', 'native_name' => 'Français'])['language']['sort_order'], 'never past the end');
        $refusal = $words->createLanguage(['code' => 'it', 'name' => 'Italian', 'native_name' => 'Italiano']);
        self::assertSame([422, 'too_many_languages'], [$refusal->status, $refusal->code]);
        self::assertStringContainsString('at most 4 languages', $refusal->message);
    }

    public function testAddingALanguageWaitsForAnybodyElseAddingOne(): void
    {
        // Another session is adding a language: it holds the table the way an add does.
        $other = $this->connect();
        $other->beginTransaction();
        $other->exec('LOCK TABLE languages IN SHARE ROW EXCLUSIVE MODE');
        $this->pdo->exec("SET lock_timeout = '300ms'");

        try {
            $this->words()->createLanguage(['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch']);
            self::fail('it did not wait');
        } catch (PDOException $e) {
            self::assertStringContainsString('lock timeout', $e->getMessage());
        }
        self::assertFalse($this->pdo->inTransaction(), 'and let go of its own transaction');

        // A save of strings meanwhile only reads the rows: it goes on.
        self::assertIsArray($this->words()->save(['common.close' => ['sk' => 'Zavrieť']], null));
        $other->rollBack();
    }

    public function testChangingALanguageChangesWhatIsSentAndSaysWhatIsNowDifferent(): void
    {
        $words = $this->words();
        $words->createLanguage(['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch']);

        $result = $words->updateLanguage('de', ['name' => 'German', 'native_name' => 'Deutsch (DE)', 'enabled' => false, 'sort_order' => 10]);
        self::assertSame(['native_name' => 'Deutsch (DE)', 'enabled' => false, 'sort_order' => 10], $result['changed']);
        self::assertSame(['Deutsch (DE)', false, 10], [$result['language']['native_name'], $result['language']['enabled'], $result['language']['sort_order']]);
        self::assertSame([], $words->updateLanguage('de', ['enabled' => false])['changed'], 'as it is: nothing changed');
        self::assertSame([], $words->updateLanguage('de', [])['changed']);

        foreach ([
            ['xx', ['name' => 'X'], 'not_found'], ['DE', ['name' => 'X'], 'not_found'],
            ['de', ['a'], 'invalid_language'], ['de', null, 'invalid_language'],
            ['de', ['sort_order' => 1001], 'invalid_language'], ['de', ['sort_order' => '5'], 'invalid_language'], ['de', ['sort_order' => -1], 'invalid_language'],
            ['de', ['enabled' => 1], 'invalid_language'], ['de', ['name' => str_repeat('a', 51)], 'invalid_language'],
            ['en', ['enabled' => false], 'fallback_language'],
        ] as [$code, $body, $says]) {
            $refusal = $words->updateLanguage($code, $body);
            self::assertInstanceOf(Refusal::class, $refusal, "$code " . json_encode($body));
            self::assertSame($says, $refusal->code, "$code " . json_encode($body));
        }
        self::assertSame([], $words->updateLanguage('sk', ['enabled' => true, 'name' => 'Slovak'])['changed'], 'sent as it is');
    }

    public function testDeletingALanguageNeverEnglishNeverAReleasedOneItsStringsGoWithIt(): void
    {
        $words = $this->words();
        $words->createLanguage(['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch']);
        $words->save(['common.save' => ['de' => 'Speichern'], 'common.close' => ['de' => 'Schließen']], 7);

        foreach ([['en', 409, 'fallback_language'], ['sk', 409, 'seeded_language'], ['fr', 404, 'not_found'], ['EN', 404, 'not_found']] as [$code, $status, $says]) {
            $refusal = $words->deleteLanguage($code);
            self::assertSame([$status, $says], [$refusal->status, $refusal->code], $code);
        }

        $result = $words->deleteLanguage('de');
        self::assertSame(2, $result['strings']);
        self::assertSame([], $result['extras']);
        self::assertSame('German', $result['language']['name']);
        self::assertSame(0, (int) $this->value("SELECT count(*) FROM translations WHERE language_code = 'de'"));
        self::assertSame('not_found', $words->deleteLanguage('de')->code);
    }

    public function testTheSitesOwnUsageOfALanguageCountsRefusesAndActsBeforeADelete(): void
    {
        $this->pdo->exec('CREATE TABLE people (id INT PRIMARY KEY, language VARCHAR(10) NOT NULL DEFAULT \'en\' REFERENCES languages (code) ON UPDATE CASCADE ON DELETE SET DEFAULT)');
        $this->pdo->exec('CREATE TABLE surveys (id INT PRIMARY KEY, language VARCHAR(10) REFERENCES languages (code))');
        $usage = $this->accounts();
        $words = $this->words($usage);
        $words->createLanguage(['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch']);
        $words->createLanguage(['code' => 'fr', 'name' => 'French', 'native_name' => 'Français']);
        $words->save(['common.save' => ['de' => 'Speichern']], null);
        $this->pdo->exec("INSERT INTO people (id, language) VALUES (1, 'de'), (2, 'de')");
        $this->pdo->exec("INSERT INTO surveys (id, language) VALUES (1, 'fr')");

        $refusal = $words->deleteLanguage('fr');
        self::assertSame([409, 'language_in_use', ['surveys' => 1]], [$refusal->status, $refusal->code, $refusal->extra]);
        self::assertSame(1, (int) $this->value("SELECT count(*) FROM languages WHERE code = 'fr'"));

        $result = $words->deleteLanguage('de');
        self::assertSame(['copy' => 'before-delete-de.json', 'accounts' => 2], $result['extras']);
        self::assertSame(1, $result['strings']);
        self::assertSame([['de', ['common.save' => 'Speichern'], true]], $usage->copies, 'its strings, inside the delete\'s transaction');
        self::assertSame(['en', 'en'], $this->pdo->query('SELECT language FROM people ORDER BY id')->fetchAll(PDO::FETCH_COLUMN), 'the site\'s foreign key took them back to English');

        // A copy that cannot be written: nothing is deleted.
        $usage->failCopy = true;
        $words->createLanguage(['code' => 'it', 'name' => 'Italian', 'native_name' => 'Italiano']);
        try {
            $words->deleteLanguage('it');
            self::fail('deleted without its copy');
        } catch (RuntimeException $e) {
            self::assertSame('The copy could not be written.', $e->getMessage());
        }
        self::assertSame(1, (int) $this->value("SELECT count(*) FROM languages WHERE code = 'it'"));
        self::assertFalse($this->pdo->inTransaction());
    }

    public function testADeleteWaitsForASaveAndASaveForADelete(): void
    {
        $words = $this->words();
        $words->createLanguage(['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch']);
        $other = $this->connect();
        $this->pdo->exec("SET lock_timeout = '300ms'");

        // A save holds the languages FOR SHARE until it is kept.
        $other->beginTransaction();
        $other->query('SELECT code FROM languages FOR SHARE');
        try {
            $words->deleteLanguage('de');
            self::fail('the delete did not wait for the save');
        } catch (PDOException $e) {
            self::assertStringContainsString('lock timeout', $e->getMessage());
        }
        $other->rollBack();

        // A delete holds the language's row FOR UPDATE until it is done.
        $other->beginTransaction();
        $other->query("SELECT code FROM languages WHERE code = 'de' FOR UPDATE");
        try {
            $words->save(['common.save' => ['de' => 'Speichern']], null);
            self::fail('the save did not wait for the delete');
        } catch (PDOException $e) {
            self::assertStringContainsString('lock timeout', $e->getMessage());
        }
        $other->rollBack();
        self::assertSame(0, $words->deleteLanguage('de')['strings'], 'once nobody holds it, it goes - the refused save wrote nothing');
    }

    // ─── Saves ──────────────────────────────────────────────────────────────

    public function testASaveWritesWhatChangedAndKeepsWhoWroteWhatDidNot(): void
    {
        $words = $this->words();
        $this->pdo->exec("UPDATE translations SET updated_by = 3, updated_at = '2026-01-01 00:00:00+00' WHERE key_name = 'common.save'");

        $summary = $words->save(['common.save' => ['en' => 'Save', 'sk' => 'Ulož'], 'common.close' => ['sk' => 'Zavrieť'], 'test.hello' => ['sk' => '  ']], 9);

        self::assertSame(['languages' => ['sk'], 'count' => 3, 'keys' => ['common.close', 'common.save', 'test.hello']], $summary);
        self::assertSame(['Save', '3', '2026-01-01'], $this->stored('common.save', 'en'), 'sent as it is: whose it was, and from when');
        self::assertSame(['Ulož', '9'], array_slice($this->stored('common.save', 'sk'), 0, 2));
        self::assertNotSame('2026-01-01', $this->stored('common.save', 'sk')[2]);
        self::assertSame(['Zavrieť', '9'], array_slice($this->stored('common.close', 'sk'), 0, 2));
        self::assertNull($this->stored('test.hello', 'sk'), 'a blank string in another language: the row goes');

        self::assertSame(['languages' => [], 'count' => 0, 'keys' => []], $words->save(['common.save' => ['sk' => 'Ulož']], 10), 'the same again: nothing');
        self::assertSame('9', $this->stored('common.save', 'sk')[1]);
    }

    public function testARefusedSaveWritesNothingOfIt(): void
    {
        $before = $this->rows('SELECT key_name, language_code, value FROM translations ORDER BY key_name, language_code');

        $refusal = $this->words()->save(['common.close' => ['sk' => 'Zavrieť'], 'common.save' => ['en' => '']], 9);

        self::assertSame('fallback_required', $refusal->code);
        self::assertSame($before, $this->rows('SELECT key_name, language_code, value FROM translations ORDER BY key_name, language_code'));
        self::assertFalse($this->pdo->inTransaction());
    }

    public function testTheSummaryNamesTheFirstKeysAndKeepsAServerNamespacesTextsWhole(): void
    {
        $keys = [];
        for ($i = 0; $i < 5; $i++) {
            $keys[] = "bulk.key$i";
        }
        $this->pdo->exec("INSERT INTO translation_keys (name) VALUES ('" . implode("'), ('", $keys) . "')");
        $this->pdo->exec("INSERT INTO translations (key_name, language_code, value) SELECT name, 'en', 'x' FROM translation_keys WHERE name LIKE 'bulk.%'");
        $this->pdo->exec("UPDATE translations SET value = '" . str_repeat('o', 450) . "' WHERE key_name = 'mail.reset.subject' AND language_code = 'sk'");
        $words = $this->words(new TranslationsConfig(serverNamespaces: ['mail'], auditKeys: 3, auditTextMax: 400));

        $values = array_fill_keys($keys, ['sk' => 'y']) + ['mail.reset.subject' => ['sk' => 'Nové heslo']];
        $summary = $words->save($values, 1);

        self::assertSame(['bulk.key0', 'bulk.key1', 'bulk.key2'], $summary['keys']);
        self::assertSame(3, $summary['more_keys']);
        self::assertSame(6, $summary['count']);
        self::assertSame([['key' => 'mail.reset.subject', 'language' => 'sk', 'old' => str_repeat('o', 400), 'new' => 'Nové heslo']], $summary['mail']);
    }

    public function testBeforeWriteRunsInsideTheSavesTransactionWithTheWriter(): void
    {
        $seen = [];
        $words = $this->words(new TranslationsConfig(beforeWrite: function (PDO $pdo, ?int $userId) use (&$seen): void {
            $seen[] = [$userId, $pdo->inTransaction()];
            if ($userId === 13) {
                throw new RuntimeException('That person is gone.');
            }
        }));

        $words->save(['common.close' => ['sk' => 'Zavrieť']], 12);
        try {
            $words->save(['common.close' => ['sk' => 'Zatvoriť']], 13);
            self::fail('saved past beforeWrite');
        } catch (RuntimeException) {
        }

        self::assertSame([[12, true], [13, true]], $seen);
        self::assertSame('Zavrieť', $this->stored('common.close', 'sk')[0]);
    }

    // ─── Export, import ─────────────────────────────────────────────────────

    public function testAnExportIsTheLanguagesOwnStringsTheServersAmongThem(): void
    {
        $export = (array) $this->words(new TranslationsConfig(serverNamespaces: ['mail']))->export('sk')['values'];

        self::assertSame('Uložiť', $export['common.save']);
        self::assertSame('Obnov si heslo', $export['mail.reset.subject']);
        self::assertArrayNotHasKey('common.close', $export, 'not merged with English');
        self::assertSame('not_found', $this->words()->export('de')->code);
        self::assertSame('not_found', $this->words()->export('DE')->code);
    }

    public function testAnImportIsCheckedAsASaveAndDeletesNothing(): void
    {
        $words = $this->words();

        $summary = $words->import('sk', ['common.close' => 'Zavrieť', 'common.save' => '', 'test.hello' => "\u{200B}"], null);
        self::assertSame(['languages' => ['sk'], 'count' => 1, 'keys' => ['common.close']], $summary);
        self::assertSame('Uložiť', $this->stored('common.save', 'sk')[0], 'an empty one is passed over');
        self::assertSame('Ahoj, {name}', $this->stored('test.hello', 'sk')[0]);
        self::assertNull($this->stored('common.close', 'sk')[1], 'written by nobody');

        self::assertSame(['languages' => [], 'count' => 0, 'keys' => []], $words->import('en', ['common.save' => ''], null), 'English too');
        self::assertSame('unknown_key', $words->import('sk', ['no.such' => ''], null)->code, 'a key the site does not have, empty or not');
        self::assertSame('invalid_value', $words->import('sk', ['a', 'b'], null)->code);
        self::assertSame('invalid_value', $words->import('sk', null, null)->code);
        self::assertSame('invalid_value', $words->import('sk', ['common.save' => ['x']], null)->code);
        self::assertSame('not_found', $words->import('de', [], null)->code);
    }

    // ─── The grid, the writer, what is stored ───────────────────────────────

    public function testTheGridIsEveryKeyWithEveryLanguagesString(): void
    {
        $grid = $this->words()->grid();

        self::assertSame(['en', 'sk'], array_column($grid['languages'], 'code'));
        $keys = array_column($grid['keys'], null, 'name');
        $save = $keys['common.save'];
        self::assertSame(['name', 'description', 'values'], array_keys($save));
        self::assertSame(['common.save', 'A button.', ['en' => 'Save', 'sk' => 'Uložiť']], [$save['name'], $save['description'], (array) $save['values']]);
        self::assertArrayHasKey('mail.reset.subject', $keys, 'the server\'s keys too');
        self::assertSame(4 + count(LibraryWords::keys()), count($grid['keys']), 'the site\'s four keys and the library\'s');
        $this->pdo->exec("INSERT INTO translation_keys (name) VALUES ('new.key')");
        $new = array_column($this->words()->grid()['keys'], null, 'name')['new.key'];
        self::assertSame('', $new['description']);
        self::assertSame('{}', json_encode($new['values']));
    }

    public function testForgettingAWriterKeepsTheirStringsSavedByNobody(): void
    {
        $words = $this->words();
        $words->save(['common.close' => ['sk' => 'Zavrieť'], 'common.save' => ['sk' => 'Ulož']], 21);
        $words->save(['test.hello' => ['sk' => 'Čau, {name}']], 22);

        self::assertSame(2, $words->forgetWriter(21));
        self::assertNull($this->stored('common.close', 'sk')[1]);
        self::assertSame('Zavrieť', $this->stored('common.close', 'sk')[0]);
        self::assertSame('22', $this->stored('test.hello', 'sk')[1]);
    }

    public function testWhatIsStoredAsASaveWouldNotTakeIt(): void
    {
        // An owner's old rewording of a library string without {code}, and SQL past the checks.
        $this->pdo->exec("UPDATE translations SET value = 'Language: {name}' WHERE key_name = 'anotoki.language.button' AND language_code = 'en'");
        $this->pdo->exec("UPDATE translations SET value = 'Ahoj, {meno}' WHERE key_name = 'test.hello' AND language_code = 'sk'");

        self::assertSame([
            ['key' => 'anotoki.language.button', 'language' => 'en', 'code' => 'placeholder_changed', 'message' => 'The English string of "anotoki.language.button" must keep {code}: the page puts a value there'],
            ['key' => 'test.hello', 'language' => 'sk', 'code' => 'unknown_placeholder', 'message' => 'The Slovak string of "test.hello" uses {meno}, which its English string does not have'],
        ], $this->words()->storedRefusals());
        self::assertSame(['common.close'], $this->words()->keysWithout('sk'), 'the one key Slovak has no string for');
        self::assertContains('common.save', $this->words()->keyNames());
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    private function words(TranslationsConfig|LanguageUsage|null $config = null): Translations
    {
        if ($config instanceof LanguageUsage) {
            $config = new TranslationsConfig(usage: $config);
        }

        return new Translations($this->pdo, $config);
    }

    /** @return ?array{string, ?string, string} value, updated_by, the day of updated_at */
    private function stored(string $key, string $code): ?array
    {
        $statement = $this->pdo->prepare("SELECT value, updated_by::text, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') FROM translations WHERE key_name = ? AND language_code = ?");
        $statement->execute([$key, $code]);
        $row = $statement->fetch(PDO::FETCH_NUM);

        return $row === false ? null : $row;
    }

    /** The IAM's accounts, the survey's language_in_use and Japanese Academy's copy before a delete, in one. */
    private function accounts(): LanguageUsage
    {
        return new class () implements LanguageUsage {
            /** @var list<array{string, array<string, string>, bool}> */
            public array $copies = [];
            public bool $failCopy = false;

            public function extras(PDO $pdo, array $codes): array
            {
                if ($pdo->query("SELECT to_regclass('people') IS NULL")->fetchColumn()) {
                    return [];
                }
                $extras = array_fill_keys($codes, ['accounts' => 0]);
                foreach ($pdo->query('SELECT language, count(*) FROM people GROUP BY language')->fetchAll(PDO::FETCH_NUM) as [$code, $count]) {
                    if (isset($extras[$code])) {
                        $extras[$code]['accounts'] = (int) $count;
                    }
                }

                return $extras;
            }

            public function refuseDelete(PDO $pdo, string $code): ?Refusal
            {
                $statement = $pdo->prepare('SELECT count(*) FROM surveys WHERE language = ?');
                $statement->execute([$code]);
                $surveys = (int) $statement->fetchColumn();

                return $surveys > 0 ? new Refusal(409, 'language_in_use', 'A survey is written in it.', ['surveys' => $surveys]) : null;
            }

            public function beforeDelete(PDO $pdo, string $code, array $strings): array
            {
                if ($this->failCopy) {
                    throw new RuntimeException('The copy could not be written.');
                }
                $this->copies[] = [$code, $strings, $pdo->inTransaction()];

                return ['copy' => "before-delete-$code.json"];
            }
        };
    }
}
