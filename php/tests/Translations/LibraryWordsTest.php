<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Translations;

use Anotoki\Lib\Translations\KeyRules;
use Anotoki\Lib\Translations\LibraryWords;
use Anotoki\Lib\Translations\Placeholders;
use Anotoki\Lib\Translations\Rules\LibraryKeyRules;
use Anotoki\Lib\Translations\TranslationsConfig;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/** The library's own words (php/resources/library-words.json) and the configuration a site gives. */
final class LibraryWordsTest extends TestCase
{
    private string $folder;

    protected function setUp(): void
    {
        $this->folder = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'anotoki_lib_words_' . bin2hex(random_bytes(6));
        mkdir($this->folder);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->folder . '/*') ?: [] as $file) {
            unlink($file);
        }
        rmdir($this->folder);
    }

    public function testTheShippedWordsAreWholeInEnglishAndSlovakWithTheSamePlaceholders(): void
    {
        $words = LibraryWords::all();

        self::assertSame([
            'anotoki.language.label', 'anotoki.language.button', 'anotoki.language.notLoaded', 'anotoki.language.notSaved',
            'anotoki.siteStatus.updatingTitle', 'anotoki.siteStatus.updatingText', 'anotoki.siteStatus.unavailableTitle',
            'anotoki.siteStatus.unavailableText', 'anotoki.siteStatus.notSetUpTitle', 'anotoki.siteStatus.notSetUpText',
            'anotoki.siteStatus.openSetup', 'anotoki.siteStatus.tryAgain', 'anotoki.siteStatus.signIn',
        ], LibraryWords::keys());
        foreach ($words as $key => $entry) {
            self::assertSame(['description', 'en', 'sk'], array_keys($entry), $key);
            self::assertSame(Placeholders::names($entry['en']), Placeholders::names($entry['sk']), "$key: Slovak fills what English does");
            self::assertFalse(Placeholders::strayBrace($entry['en']) || Placeholders::strayBrace($entry['sk']), $key);
            self::assertStringEndsWith(Placeholders::names($entry['en']) === [] ? 'No placeholders.' : 'Placeholders: {' . implode('}, {', Placeholders::names($entry['en'])) . '}.', $entry['description'], "$key: the family's description");
        }
        self::assertSame('Language: {name} ({code})', LibraryWords::english('anotoki.language.button'));
        self::assertSame(['name', 'code'], LibraryWords::placeholders('anotoki.language.button'));
        self::assertNull(LibraryWords::english('common.save'));
        self::assertNull(LibraryWords::placeholders('anotoki.no.such'));
        self::assertTrue(LibraryWords::isLibraryKey('anotoki.x.y'));
        self::assertFalse(LibraryWords::isLibraryKey('anotokix.y'));
    }

    public function testTheSiteStatusWordsAreTheMigrationsModulesBuiltInWordsWordForWord(): void
    {
        // angular/projects/lib/migrations/src/words.ts: BUILT_IN_WORDS, read as text.
        $source = (string) file_get_contents(dirname(__DIR__, 3) . '/angular/projects/lib/migrations/src/words.ts');
        foreach (['en', 'sk'] as $language) {
            self::assertSame(1, preg_match('/^  ' . $language . ': \{\n(.*?)\n  \},/ms', str_replace("\r\n", "\n", $source), $block), $language);
            preg_match_all("/^    (\\w+): '((?:[^'\\\\]|\\\\.)*)',$/m", $block[1], $entries, PREG_SET_ORDER);
            self::assertCount(9, $entries, $language);
            foreach ($entries as [, $name, $text]) {
                self::assertSame(stripslashes($text), LibraryWords::all()["anotoki.siteStatus.$name"][$language] ?? null, "$language $name");
            }
        }
    }

    public function testAFileThatIsNotWholeIsRefusedLoudly(): void
    {
        $cases = [
            'missing' => [null, 'are missing'],
            'not JSON' => ['{', 'is not JSON'],
            'no keys' => ['{"keys": {}}', 'does not hold'],
            'a key outside the namespace' => ['{"keys": {"common.save": {"description": "", "en": "Save"}}}', 'is not a library key'],
            'no English' => ['{"keys": {"anotoki.a.b": {"description": "", "sk": "Uložiť"}}}', 'needs a description and an English string'],
            'something else' => ['{"keys": {"anotoki.a.b": {"description": "", "en": "Save", "comment": "x"}}}', 'which is neither'],
        ];
        foreach ($cases as $case => [$json, $says]) {
            $file = "{$this->folder}/" . md5($case) . '.json';
            if ($json !== null) {
                file_put_contents($file, $json);
            }
            try {
                LibraryWords::read($file);
                self::fail("read: $case");
            } catch (RuntimeException $e) {
                self::assertStringContainsString($says, $e->getMessage(), $case);
            }
        }
    }

    public function testTheConfigurationRefusesWhatCannotWork(): void
    {
        $refused = function (callable $make, string $why): void {
            try {
                $make();
                self::fail("Not refused: $why");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        };

        $refused(fn () => new TranslationsConfig(releasedLanguages: ['sk']), 'released without English');
        $refused(fn () => new TranslationsConfig(releasedLanguages: ['en', 'EN']), 'a released language that is no code');
        $refused(fn () => new TranslationsConfig(serverNamespaces: ['mail.x']), 'a namespace that is none');
        $refused(fn () => new TranslationsConfig(serverNamespaces: ['anotoki']), 'the library\'s namespace');
        $refused(fn () => new TranslationsConfig(serverNamespaces: ['keys']), 'a field of the summary');
        $refused(fn () => new TranslationsConfig(rules: ['not a rule']), 'a rule that is none');
        $refused(fn () => new TranslationsConfig(valueMax: 70000), 'longer than a clip can be');
        $refused(fn () => new TranslationsConfig(languagesMax: 0), 'no language at all');

        $config = new TranslationsConfig(serverNamespaces: ['mail']);
        self::assertTrue($config->isServerKey('mail.reset.subject'));
        self::assertFalse($config->isServerKey('mailbox.title'));
        self::assertInstanceOf(LibraryKeyRules::class, $config->allRules()[0], 'the library\'s rules first');
        self::assertContainsOnlyInstancesOf(KeyRules::class, $config->allRules());
    }
}
