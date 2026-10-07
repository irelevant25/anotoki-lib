<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Translations;

use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Translations\Cli\KeyScanner;
use Anotoki\Lib\Translations\Cli\TranslationsCommand;
use Anotoki\Lib\Translations\Schema;
use Anotoki\Lib\Translations\Translations;
use Anotoki\Lib\Translations\TranslationsConfig;
use PDOException;

/** translations.php on a real database: --status, --export, --import, and what it refuses. */
final class TranslationsCommandTest extends DatabaseTestCase
{
    /** @var resource */
    private $out;

    /** @var resource */
    private $err;

    /** @var list<array{string, ?string, ?string, array<string, mixed>}> */
    private array $audited = [];

    /** @var list<string> */
    private array $pending = [];

    protected function setUp(): void
    {
        parent::setUp();
        self::assertNull($this->migrator([$this->set('site'), Schema::migrationSet()])->apply()['error']);
        $this->pdo->exec("INSERT INTO translation_keys (name) VALUES ('home.title'), ('home.unused'), ('mail.reset.subject')");
        $this->pdo->exec("INSERT INTO translations (key_name, language_code, value) VALUES
            ('home.title', 'en', 'Home'), ('home.title', 'sk', 'Domov'), ('home.unused', 'en', 'Unused'), ('mail.reset.subject', 'en', 'Reset')");
        $this->pdo->exec("INSERT INTO languages (code, name, native_name, enabled, sort_order) VALUES ('de', 'German', 'Deutsch', FALSE, 3)");

        mkdir($this->path('app'));
        file_put_contents($this->path('app/home.component.html'), "<h1>{{ 'home.title' | translate }}</h1>\n");
        $this->out = fopen('php://memory', 'w+');
        $this->err = fopen('php://memory', 'w+');
    }

    public function testStatusSaysWhatTheFrontendUsesAndHowMuchOfEachLanguageThereIs(): void
    {
        self::assertSame(0, $this->command()->run(['translations.php']), $this->errors());

        $out = $this->written();
        self::assertStringContainsString("== survey: the site's own strings", $out);
        self::assertStringContainsString('the database has     16 keys', $out);
        self::assertStringContainsString('the frontend uses    1 of them', $out);
        self::assertStringContainsString("In the database, used nowhere - a migration deletes a key the code has stopped using:\n    home.unused\n", $out);
        self::assertStringNotContainsString('mail.reset.subject', $out, 'the server\'s keys are not the frontend\'s');
        self::assertStringNotContainsString('anotoki.language', $out, 'nor the library\'s');
        self::assertStringContainsString('  en     English                16 / 16', $out);
        self::assertStringContainsString('  sk     Slovak                 14 / 16', $out);
        self::assertStringContainsString('  de     German                  0 / 16   (not offered)', $out);
        self::assertStringEndsWith("  Clean.\n", $out);
        self::assertStringNotContainsString("\033[", $out, 'no colours on what is not a terminal');
    }

    public function testStatusIsNotCleanForAMissingKeyNoEnglishOrAProblemAndWarnsOfStoredStrings(): void
    {
        file_put_contents($this->path('app/home.component.html'), "<h1>{{ 'home.title' | translate }}</h1>\n<p>{{ 'home.missing' | translate }}</p>\n");
        $this->pdo->exec("INSERT INTO translation_keys (name) VALUES ('home.bare')");
        $this->pdo->exec("UPDATE translations SET value = 'Language: {name}' WHERE key_name = 'anotoki.language.button' AND language_code = 'en'");

        self::assertSame(1, $this->command()->run(['translations.php', '--status']));

        $out = $this->written();
        self::assertStringContainsString("Used by the frontend, not in the database - the page shows the key itself:\n    home.missing\n        home.component.html:2\n", $out);
        self::assertStringContainsString("No English string, so nothing to fall back to:\n    home.bare\n", $out);
        self::assertStringContainsString("Stored as a save would not take them - reword them in the admin pages:\n    anotoki.language.button (en): placeholder_changed - The English string of \"anotoki.language.button\" must keep {code}: the page puts a value there\n", $out);
        self::assertStringEndsWith("  Not clean.\n", $out);
    }

    public function testExportToTheScreenOrAFileAndImportAuditedAsTheCommandLines(): void
    {
        self::assertSame(0, $this->command()->run(['translations.php', '--export', 'sk']));
        $export = $this->written();
        self::assertStringStartsWith("{\n    \"anotoki.language.button\": \"Jazyk: {name} ({code})\",", $export);
        self::assertStringEndsWith("    \"home.title\": \"Domov\"\n}\n", $export);

        $file = $this->path('sk.json');
        self::assertSame(0, $this->command()->run(['translations.php', '--export=sk', $file]));
        self::assertStringContainsString("14 strings of \"sk\" written to $file", $this->written());
        self::assertSame('Domov', json_decode((string) file_get_contents($file), true)['home.title']);

        file_put_contents($file, "\u{FEFF}" . json_encode(['home.title' => 'Domovská stránka', 'home.unused' => '', 'mail.reset.subject' => 'Obnov heslo'], JSON_UNESCAPED_UNICODE));
        self::assertSame(0, $this->command()->run(['translations.php', '--import', 'sk', $file]), $this->errors());
        self::assertStringContainsString("3 strings in $file: 2 changed in \"sk\", the rest as they were (or empty, and passed over).", $this->written());
        self::assertSame([['translations.imported', 'language', 'sk', [
            'languages' => ['sk'],
            'count' => 2,
            'keys' => ['home.title', 'mail.reset.subject'],
            'mail' => [['key' => 'mail.reset.subject', 'language' => 'sk', 'old' => null, 'new' => 'Obnov heslo']],
            'via' => 'command line',
        ]]], $this->audited);
        self::assertNull($this->value("SELECT updated_by FROM translations WHERE key_name = 'home.title' AND language_code = 'sk'"), 'written by nobody');

        self::assertSame(0, $this->command()->run(['translations.php', '--import=sk', $file]));
        self::assertCount(1, $this->audited, 'nothing changed the second time: nothing audited');
    }

    public function testASitesOwnKindOfFileThroughItsReader(): void
    {
        // Japanese Academy's whole-site backup: {translations: {languages, values: {code: {key: text}}}}.
        $backup = $this->path('backup.json');
        file_put_contents($backup, json_encode(['tables' => [], 'translations' => ['values' => ['sk' => ['home.title' => 'Domov!'], 'en' => ['home.title' => 'Home!']]]]));
        $read = static function (string $path, string $code): array {
            $document = json_decode((string) file_get_contents($path), true);

            return is_array($document['translations'] ?? null) ? ($document['translations']['values'][$code] ?? []) : \Anotoki\Lib\Translations\TranslationFile::read($path);
        };
        $command = new TranslationsCommand(fn (): Translations => new Translations($this->pdo), new KeyScanner($this->path('app')), out: $this->out, err: $this->err, read: $read);

        self::assertSame(0, $command->run(['translations.php', '--import', 'sk', $backup]), $this->errors());
        self::assertSame('Domov!', $this->value("SELECT value FROM translations WHERE key_name = 'home.title' AND language_code = 'sk'"));
        self::assertSame('Home', $this->value("SELECT value FROM translations WHERE key_name = 'home.title' AND language_code = 'en'"), 'only the language asked for');
    }

    public function testARefusedImportSaysWhatTheAdminPagesWouldAndWritesNothing(): void
    {
        $file = $this->path('bad.json');
        file_put_contents($file, json_encode(['home.title' => 'Domov', 'no.such' => 'x', 'nor.this' => '']));

        self::assertSame(1, $this->command()->run(['translations.php', '--import', 'sk', $file]));

        self::assertSame("  Refused (unknown_key): The site has no such keys: \"no.such\", \"nor.this\". Keys are made by the code, never here.\n    no.such\n    nor.this\n", $this->errors());
        self::assertSame([], $this->audited);
        self::assertSame(1, $this->command()->run(['translations.php', '--import', 'xx', $file]));
        self::assertStringContainsString('Refused (not_found)', $this->errors());
        self::assertSame(1, $this->command()->run(['translations.php', '--import', 'sk', $this->path('none.json')]));
        self::assertStringContainsString('There is no file', $this->errors());
    }

    public function testWhatItRefusesBeforeAnything(): void
    {
        foreach ([
            [['translations.php', '--export'], 'usage: php translations.php --export CODE [FILE]'],
            [['translations.php', '--import', 'sk'], 'usage: php translations.php --import CODE FILE'],
            [['translations.php', '--status', 'extra'], 'usage:'],
            [['translations.php', '--frobnicate'], 'Unknown command --frobnicate.'],
        ] as [$argv, $says]) {
            self::assertSame(1, $this->command()->run($argv), implode(' ', $argv));
            self::assertStringContainsString($says, $this->errors());
        }

        self::assertSame(0, $this->command()->run(['translations.php', '--help']));
        self::assertStringStartsWith('php translations.php --status | --export CODE [FILE] | --import CODE FILE', $this->written());

        $this->pending = ['002_next.sql'];
        self::assertSame(1, $this->command()->run(['translations.php']));
        self::assertStringContainsString('The database needs an update first (002_next.sql): php migration.php', $this->errors());
        $this->pending = [];

        $dead = new TranslationsCommand(static function (): Translations {
            throw new PDOException('could not connect');
        }, new KeyScanner($this->path('app')), out: $this->out, err: $this->err);
        self::assertSame(1, $dead->run(['translations.php']));
        self::assertStringContainsString('Cannot reach the database: could not connect', $this->errors());

        $this->pdo->exec('DROP TABLE translations, translation_keys, languages CASCADE');
        self::assertSame(1, $this->command()->run(['translations.php', '--export', 'sk']));
        self::assertStringContainsString('This database has no strings yet: apply the migrations first', $this->errors());
    }

    private function command(): TranslationsCommand
    {
        return new TranslationsCommand(
            fn (): Translations => new Translations($this->pdo, new TranslationsConfig(serverNamespaces: ['mail'])),
            new KeyScanner($this->path('app'), ignoreNamespaces: ['mail']),
            function (string $action, ?string $type, ?string $id, array $details): void {
                $this->audited[] = [$action, $type, $id, $details];
            },
            fn (): array => $this->pending,
            'survey: the site\'s own strings',
            $this->out,
            $this->err,
        );
    }

    /** What it wrote since the last look. */
    private function written(): string
    {
        return $this->drain($this->out);
    }

    private function errors(): string
    {
        return $this->drain($this->err);
    }

    /** @param resource $stream */
    private function drain($stream): string
    {
        rewind($stream);
        $text = (string) stream_get_contents($stream);
        ftruncate($stream, 0);
        rewind($stream);

        return $text;
    }
}
