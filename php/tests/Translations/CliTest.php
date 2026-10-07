<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Translations;

use Anotoki\Lib\Translations\Cli\EnglishDictionary;
use Anotoki\Lib\Translations\Cli\KeyScanner;
use Anotoki\Lib\Translations\TranslationFile;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/** The command line's tools without a database: the key scan, the compiled English, the file format. */
final class CliTest extends TestCase
{
    private string $root;

    /** Every key of the fixture's database. */
    private const KEYS = [
        'home.title', 'home.subtitle', 'home.single', 'home.rich', 'home.unused', 'home.attribute',
        'home.questions.one', 'home.questions.few', 'home.questions.other',
        'home.answers.one', 'home.answers.few', 'home.answers.other',
        'take.refused.closed', 'take.refused.full', 'take.refused.gone',
        'anotoki.language.label', 'mail.reset.subject',
    ];

    protected function setUp(): void
    {
        $this->root = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'anotoki_lib_scan_' . bin2hex(random_bytes(6));
        $this->write('core/i18n/dynamic-keys.ts', "// The keys put together at run time.\nexport const DYNAMIC_KEYS = {\n  'take.refused.': ['closed', 'full'],\n  'bad.': OTHER_TAILS,\n} as const;\n");
        $this->write('pages/home/home.component.html', implode("\n", [
            '<h1>{{ \'home.title\' | translate }}</h1>',
            '<p>{{ "home.questions" | translatePlural: count }}</p>',
            '<app-x [text]="home.attribute"></app-x>',
            '<!-- {{ \'home.inComment\' | translate }} -->',
            '<div',
            '  [innerHTML]="\'home.rich\'',
            '    | translate"',
            '></div>',
            '<p>{{ \'home.answers\' | translate }}</p>',
            '<p>{{ \'home.missing\' | translate }}</p>',
        ]));
        $this->write('pages/home/home.component.ts', implode("\n", [
            'export class Home {',
            '  title = this.i18n.t(\'home.subtitle\');',
            '  // this.i18n.t(\'home.commented\')',
            '  one = this.i18n.plural(\'home.single\', 2);',
            '  why = this.i18n.t(\'take.refused.\' + kind);',
            '  other = this.i18n.t(`take.other.${kind}`);',
            '  url = \'http://example.test/home.title\';',
            '  library = \'anotoki.language.label\';',
            '  mail = \'mail.reset.subject\';',
            '}',
        ]));
        $this->write('pages/home/home.component.spec.ts', "it('home.specOnly', () => {});\n");
        $this->write('core/testing/fakes.ts', "export const KEY = 'home.fake';\n");
    }

    protected function tearDown(): void
    {
        $remove = static function (string $path) use (&$remove): void {
            if (is_dir($path)) {
                foreach (scandir($path) ?: [] as $entry) {
                    if ($entry !== '.' && $entry !== '..') {
                        $remove("$path/$entry");
                    }
                }
                rmdir($path);
            } elseif (is_file($path)) {
                unlink($path);
            }
        };
        $remove($this->root);
    }

    // ─── The key scan ───────────────────────────────────────────────────────

    public function testTheScanOfASurveyLikeFrontend(): void
    {
        $scan = (new KeyScanner($this->root, ['core/testing/**'], 'core/i18n/dynamic-keys.ts', ['mail']))->scan(self::KEYS);

        // A family asked for the wrong way is still used - and a problem (below).
        self::assertSame([
            'home.answers.few', 'home.answers.one', 'home.answers.other',
            'home.questions.few', 'home.questions.one', 'home.questions.other', 'home.rich', 'home.single', 'home.subtitle', 'home.title',
            'take.refused.closed', 'take.refused.full',
        ], array_keys($scan['used']));
        self::assertSame(['pages/home/home.component.html:1'], $scan['used']['home.title']);
        self::assertSame(['core/i18n/dynamic-keys.ts'], $scan['used']['take.refused.closed']);
        self::assertSame(['home.missing' => ['pages/home/home.component.html:10']], $scan['missing']);
        self::assertSame(
            ['home.attribute', 'home.unused', 'take.refused.gone'],
            $scan['unused'],
            'never anotoki.* or mail.*; an attribute\'s value is an expression; a comment is no use; a tail nobody declared'
        );
        self::assertSame([
            'pages/home/home.component.html:6: innerHTML is given a translated string - a string is text, and is never drawn as HTML',
            "pages/home/home.component.html:9: 'home.answers' is a plural family and is asked for as one string - the page would show the key",
            "pages/home/home.component.ts:4: 'home.single' is asked for as a plural, and there is no home.single.one, .few, .other - the page would show the key",
            "pages/home/home.component.ts:6: a key is put together from 'take.other.', which core/i18n/dynamic-keys.ts does not declare",
            "core/i18n/dynamic-keys.ts: the tails of 'bad.' are not written out as a list of strings, so they cannot be read",
        ], $scan['problems']);
    }

    public function testTheDynamicKeysFilesTailsAreNoKeysOfTheirOwn(): void
    {
        // Piano Academy's case: a tail with dots of its own, which begins like a key of another namespace.
        $this->write('core/i18n/dynamic-keys.ts', "export const DYNAMIC_KEYS = {\n  'path.step.': ['meet.title', 'end'],\n};\n");

        $scan = (new KeyScanner($this->root, ['core/testing/**', 'pages/**'], 'core/i18n/dynamic-keys.ts'))->scan(['path.step.meet.title', 'path.step.end', 'meet.title']);

        self::assertSame(['path.step.end', 'path.step.meet.title'], array_keys($scan['used']));
        self::assertSame(['meet.title'], $scan['unused']);
        self::assertSame([], $scan['problems']);
    }

    public function testTheIamsScanItsPipeAndInnerHtmlAnywhere(): void
    {
        $this->write('pages/home/home.component.html', "<h1>{{ 'home.title' | t }}</h1>\n<p [innerHTML]=\"html\"></p>\n");
        $this->write('pages/home/home.component.ts', "const a = 'home.subtitle';\n// innerHTML in a comment does not count\n");
        $scanner = new KeyScanner($this->root, ['core/testing/**', 'core/i18n/dynamic-keys.ts'], null, ['mail'], ['t' => 'one'], [], ['one', 'few', 'other'], 'anywhere');

        $scan = $scanner->scan(['home.title', 'home.subtitle', 'mail.reset.subject']);

        self::assertSame(['home.subtitle', 'home.title'], array_keys($scan['used']));
        self::assertSame(['pages/home/home.component.html:2: innerHTML - a string is text, and nothing here is drawn as HTML'], $scan['problems']);
        self::assertSame([], $scan['unused']);
    }

    public function testTheFilesItReadsAndTheGlobs(): void
    {
        $this->write('a/b/c/deep.spec.ts', "'home.title'");
        $this->write('a/notes.md', "'home.title'");
        $scanner = new KeyScanner($this->root, ['core/**', 'pages/*/home.component.ts']);

        self::assertSame(['pages/home/home.component.html'], $scanner->sourceFiles());
        self::assertTrue(KeyScanner::shapeOk('aboutYou.age.18-24'));
        self::assertFalse(KeyScanner::shapeOk('Home.title'));
        self::assertFalse(KeyScanner::shapeOk('home'));
        self::assertSame('home', KeyScanner::namespaceOf('home.title.x'));
    }

    public function testCommentsAreTakenOutLineForLineButNotFromStrings(): void
    {
        $source = "const a = 'http://x.test/*not a comment*/'; // gone\n/* gone\n too */ const b = `t`;\r\n";

        self::assertSame("const a = 'http://x.test/*not a comment*/'; \n\n const b = `t`;\n", KeyScanner::sourceText($source, false));
        self::assertSame("<p>\n</p>", KeyScanner::sourceText("<p><!-- a\n b --></p>", true), 'a comment\'s line breaks stay');
    }

    public function testAScannerThatCannotWorkIsRefused(): void
    {
        foreach ([
            fn () => new KeyScanner($this->root, pipes: ['translate' => 'many']),
            fn () => new KeyScanner($this->root, calls: ['not a name' => 'one']),
            fn () => new KeyScanner($this->root, innerHtml: 'sometimes'),
        ] as $make) {
            try {
                $make();
                self::fail('made');
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }

        $this->expectException(RuntimeException::class);
        (new KeyScanner($this->root . '/nowhere'))->scan([]);
    }

    // ─── The compiled English ───────────────────────────────────────────────

    public function testTheIamsEnTsAndPianosKeptEnglish(): void
    {
        $this->write('en.ts', implode("\n", [
            '/** The keys. */',
            'export const en = {',
            '  // The shell.',
            "  'shell.menu': 'Menu',",
            "  'common.quote': 'It\\'s \"here\"',",
            '  "common.double": "Say \\"hi\\"\\n\\u00e9\\u{1F600}",',
            "  'common.long':",
            "    'A value the formatter put on the next line',",
            '} as const;',
            '',
            'export type TranslationKey = keyof typeof en;',
        ]));
        self::assertSame([
            'shell.menu' => 'Menu',
            'common.quote' => 'It\'s "here"',
            'common.double' => "Say \"hi\"\n\u{E9}\u{1F600}",
            'common.long' => 'A value the formatter put on the next line',
        ], EnglishDictionary::read("{$this->root}/en.ts"));

        $this->write('kept-english.ts', "export const KEPT_ENGLISH: Readonly<Record<string, string>> = {\n  'common.loading': 'Loading…',\n};\n");
        self::assertSame(['common.loading' => 'Loading…'], EnglishDictionary::read("{$this->root}/kept-english.ts"));
    }

    public function testJapaneseAcademysMapsByNameAndTheBuildAnalyzersJsonParts(): void
    {
        $this->write('chooser.ts', "const ENGLISH: Record<string, string> = {\n  'language.button': 'Language: {name} ({code})',\n};\n\nconst OTHER = {\n  'x.y': 'z',\n};\n");
        self::assertSame(['language.button' => 'Language: {name} ({code})'], EnglishDictionary::read("{$this->root}/chooser.ts", 'ENGLISH'));
        try {
            EnglishDictionary::read("{$this->root}/chooser.ts");
            self::fail('read two objects as one');
        } catch (RuntimeException $e) {
            self::assertStringContainsString('more than one object', $e->getMessage());
        }

        $this->write('en/core.json', "\u{FEFF}{\"theme.label\": \"Theme\", \"theme.dark\": \"Dark\"}");
        $this->write('en/shell.json', '{"shell.menu": "Menu", "theme.dark": "Dark"}');
        $core = EnglishDictionary::read("{$this->root}/en/core.json");
        self::assertSame(['theme.label' => 'Theme', 'theme.dark' => 'Dark'], $core);
        $this->expectException(RuntimeException::class);
        EnglishDictionary::merge($core, EnglishDictionary::read("{$this->root}/en/shell.json"));
    }

    public function testWhatTheReaderCannotReadWholeIsRefused(): void
    {
        foreach ([
            'unquoted' => ["export const en = {\n  save: 'Save',\n} as const;\n", 'could not read "save: \'Save\',"'],
            'spread' => ["export const en = {\n  'a.b': 'c',\n  ...other,\n};\n", 'could not read "...other,"'],
            'twice' => ["export const en = {\n  'a.b': 'c',\n  'a.b': 'd',\n};\n", 'has the key a.b twice'],
            'empty' => ["export const en = {\n\n};\n", 'has no entries'],
            'none' => ["export const en = 'x';\n", 'declares no object'],
        ] as $case => [$source, $says]) {
            $this->write("$case.ts", $source);
            try {
                EnglishDictionary::read("{$this->root}/$case.ts");
                self::fail("read: $case");
            } catch (RuntimeException $e) {
                self::assertStringContainsString($says, $e->getMessage(), $case);
            }
        }
        $this->write('list.json', '["a"]');
        $this->expectException(RuntimeException::class);
        EnglishDictionary::read("{$this->root}/list.json");
    }

    // ─── The file format ────────────────────────────────────────────────────

    public function testALanguagesStringsAsAFile(): void
    {
        self::assertSame("{\n    \"a.b\": \"Uložiť / save\",\n    \"c.d\": \"x\"\n}\n", TranslationFile::text(['a.b' => 'Uložiť / save', 'c.d' => 'x']));
        self::assertSame("{}\n", TranslationFile::text([]));

        TranslationFile::write("{$this->root}/sk.json", ['a.b' => 'x']);
        self::assertSame(['a.b' => 'x'], TranslationFile::read("{$this->root}/sk.json"));
        $this->write('bom.json', "\u{FEFF}{\"a.b\": \"y\"}");
        self::assertSame(['a.b' => 'y'], TranslationFile::read("{$this->root}/bom.json"), 'a byte-order mark is passed over');

        foreach (['nothing.json' => null, 'broken.json' => '{', 'list.json' => '["a"]'] as $name => $content) {
            if ($content !== null) {
                $this->write($name, $content);
            }
            try {
                TranslationFile::read("{$this->root}/$name");
                self::fail("read $name");
            } catch (RuntimeException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    private function write(string $relative, string $content): void
    {
        $path = "{$this->root}/$relative";
        if (!is_dir(dirname($path))) {
            mkdir(dirname($path), 0777, true);
        }
        file_put_contents($path, $content);
    }
}
