<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Translations;

use Anotoki\Lib\Translations\ETag;
use Anotoki\Lib\Translations\LanguageCode;
use Anotoki\Lib\Translations\Placeholders;
use Anotoki\Lib\Translations\Text;
use PHPUnit\Framework\TestCase;

/** The pure helpers: Text, Placeholders, LanguageCode, ETag. */
final class TextTest extends TestCase
{
    public function testCleanKeepsTextWithoutItsControlsAndRefusesWhatIsNoText(): void
    {
        self::assertSame("Line one\nLine\ttwo\r\n", Text::clean("Line\x00 one\nLine\ttwo\x07\r\n\x1B\x7F"));
        self::assertNull(Text::clean("\xC3\x28"), 'not UTF-8');
        foreach ([null, 12, 1.5, true, ['a'], new \stdClass()] as $value) {
            self::assertNull(Text::clean($value));
        }
        self::assertSame('', Text::clean(''));
    }

    public function testTrimTakesAwayExactlyWhatTheBrowsersTrimDoes(): void
    {
        self::assertSame('a b', Text::trim(" \t\n\x0B\f\r\u{A0}\u{1680}\u{2000}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}a b\u{3000} \u{A0}"));
        // \s and \p{Z} would take these too; the browser does not, and both sides must agree.
        self::assertSame("\u{85}a\u{180E}", Text::trim("\u{85}a\u{180E}"));
        self::assertSame("\u{200B}a\u{200B}", Text::trim("\u{200B}a\u{200B}"), 'a zero-width space is no space to trim');
    }

    public function testATextTheExpressionCannotGetThroughComesBackWhole(): void
    {
        $endless = 'a' . str_repeat(' ', 1040000) . 'b';

        self::assertSame($endless, Text::trim($endless));
        self::assertFalse(Text::blank($endless));
        self::assertSame(1040002, Text::length($endless));
    }

    public function testBlankIsWhatHasNothingToSee(): void
    {
        foreach (['', ' ', "\t\n", "\u{200B}", "\u{2060}\u{00AD}", "\u{FEFF}", " \u{200B} "] as $text) {
            self::assertTrue(Text::blank($text), json_encode($text));
        }
        foreach (['a', ' . ', "\u{200B}x", '0'] as $text) {
            self::assertFalse(Text::blank($text), json_encode($text));
        }
    }

    public function testLengthCountsCharactersAndClipCutsThere(): void
    {
        self::assertSame(3, Text::length('žší'));
        self::assertSame(1, Text::length("\u{1D11E}"));
        self::assertSame('žš', Text::clip('žší', 2));
        self::assertSame('žší', Text::clip('žší', 3));
        self::assertSame('', Text::clip('abc', 0));
        self::assertSame(str_repeat('あ', 400), Text::clip(str_repeat('あ', 500), 400));
    }

    public function testPlaceholdersAreNamesInBracesAndAnyOtherBraceIsStray(): void
    {
        self::assertSame(['count', 'name'], Placeholders::names('{count} of {name}, {count} again, { no }, {9x}, {a-b}'));
        self::assertSame([], Placeholders::names('none'));
        foreach (['{ count }', '{počet}', '{count', 'count}', '{{count}}', '{}', 'a } b'] as $text) {
            self::assertTrue(Placeholders::strayBrace($text), $text);
        }
        foreach (['{count}', '{a_1} and {B}', 'no braces'] as $text) {
            self::assertFalse(Placeholders::strayBrace($text), $text);
        }
    }

    public function testALanguageCodeIsTwoSmallLettersOrTwoAndTwo(): void
    {
        foreach (['en', 'sk', 'pt-br'] as $code) {
            self::assertTrue(LanguageCode::ok($code), $code);
        }
        foreach (['EN', 'en-GB', 'en_gb', 'eng', 'e', '', "en\n", 'en-', 'sk-sk-sk', "\xC3\x28", null, 12, ['en']] as $code) {
            self::assertFalse(LanguageCode::ok($code), json_encode($code, JSON_INVALID_UTF8_SUBSTITUTE));
        }
    }

    public function testACodeResolvesToItselfItsLanguageOrTheFallback(): void
    {
        $offered = ['en', 'sk', 'pt-br'];

        self::assertSame('sk', LanguageCode::resolve('sk', $offered, 'en'));
        self::assertSame('sk', LanguageCode::resolve('sk-sk', $offered, 'en'), 'a region not offered: its language');
        self::assertSame('pt-br', LanguageCode::resolve('pt-br', $offered, 'en'));
        self::assertSame('en', LanguageCode::resolve('pt-pt', $offered, 'en'), 'pt alone is not offered');
        self::assertSame('en', LanguageCode::resolve('de', $offered, 'en'));
    }

    public function testTheTagAndTheWeakComparison(): void
    {
        $etag = ETag::of('{"a":1}');
        self::assertSame('"' . md5('{"a":1}') . '"', $etag);

        $inner = substr($etag, 1, -1);
        foreach ([$etag, "W/$etag", '*', "\"other\", $etag", "W/\"$inner-gzip\"", "\"$inner-br\"", "\"$inner-zstd\"", "  $etag  "] as $header) {
            self::assertTrue(ETag::notModified($header, $etag), $header);
        }
        foreach (['', '"other"', "\"$inner-deflate\"", "\"$inner\"x", $inner, "\"x$inner\""] as $header) {
            self::assertFalse(ETag::notModified($header, $etag), $header);
        }
    }
}
