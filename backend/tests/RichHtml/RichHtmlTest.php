<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\RichHtml;

use Anotoki\Lib\RichHtml\Parser;
use Anotoki\Lib\RichHtml\RichElement;
use Anotoki\Lib\RichHtml\RichHtml;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The allow-list of a text's HTML, the server's end: the same cases as the
 * Angular half's (cases.json, read by frontend/projects/lib/ui/rich-html's spec
 * too) - so both ends keep and show the same text - and the attacks it stops.
 */
final class RichHtmlTest extends TestCase
{
    /** @return array<string, array{0: string, 1: list<string>, 2: string, 3: string}> */
    public static function cases(): array
    {
        $cases = json_decode((string) file_get_contents(__DIR__ . '/cases.json'), true, 512, JSON_THROW_ON_ERROR);
        $named = [];
        foreach ($cases as $case) {
            $named[$case['name']] = [$case['html'], $case['classes'] ?? [], $case['clean'], $case['text']];
        }

        return $named;
    }

    /** @param list<string> $classes */
    #[DataProvider('cases')]
    public function testTheSameTextAsTheAngularHalf(string $html, array $classes, string $clean, string $text): void
    {
        self::assertSame($clean, RichHtml::clean($html, ['classes' => $classes]));
        self::assertSame($text, RichHtml::text($html));
        // What is clean stays as it is: cleaning it again changes nothing.
        self::assertSame($clean, RichHtml::clean($clean, ['classes' => $classes]));
    }

    public function testNoScriptNoHandlerNoDangerousAddressNoStyleThatLeavesTheBox(): void
    {
        $attacks = [
            '<script>alert(1)</script>',
            '<img src=x onerror=alert(1)>',
            '<svg onload=alert(1)>',
            '<body onload=alert(1)>',
            '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
            '<a href="javascript:alert(1)">x</a>',
            '<a href="JAVASCRIPT:alert(1)">x</a>',
            '<a href="  javascript:alert(1)">x</a>',
            '<a href="java&#x09;script:alert(1)">x</a>',
            '<a href="&#x6A;avascript:alert(1)">x</a>',
            '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
            '<a href="vbscript:msgbox(1)">x</a>',
            '<p style="position: fixed; inset: 0; z-index: 99999">x</p>',
            '<p style="background-color: url(javascript:alert(1))">x</p>',
            '<p style="color: expression(alert(1))">x</p>',
            '<p style="margin-left: -9999px">x</p>',
            '<p style="font-size: 9999px">x</p>',
            '<p style="-moz-binding: url(x)">x</p>',
            '<p style="color: red; } body { display: none">x</p>',
            '<form><input name="password"></form>',
            '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
            '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
            '<meta http-equiv="refresh" content="0;url=https://evil.example">',
            '<object data="x.swf"></object><embed src="x.swf">',
        ];
        foreach ($attacks as $attack) {
            $clean = RichHtml::clean($attack);
            self::assertDoesNotMatchRegularExpression('/<(?!\/?(p|div|h[234]|ul|ol|li|br|b|strong|i|em|u|s|strike|mark|span|font|a)[\s>])/i', $clean, $attack);
            self::assertDoesNotMatchRegularExpression('/\son[a-z]+\s*=/i', $clean, $attack);
            self::assertDoesNotMatchRegularExpression('/javascript:|vbscript:|data:|expression\(|url\(|position|z-index|-moz-binding|-9999|9999px/i', $clean, $attack);
        }
    }

    public function testALinkGoesToTheWebOrToAMailAddressAndOpensApart(): void
    {
        self::assertSame('https://anotoki.eu/a?b=1', RichHtml::linkAddress(' https://anotoki.eu/a?b=1 '));
        self::assertSame('mailto:hello@anotoki.eu', RichHtml::linkAddress('mailto:hello@anotoki.eu'));
        foreach (['javascript:alert(1)', '/admin', '//evil.example', 'evil.example', 'https://', 'mailto:nobody', 'https://a b', 'https://a"b', 'https://a\\b', str_repeat('a', 2001)] as $address) {
            self::assertNull(RichHtml::linkAddress($address), $address);
        }
        self::assertSame('<a target="_blank" rel="noopener noreferrer" href="https://anotoki.eu">x</a>', RichHtml::clean('<a href="https://anotoki.eu" target="_self">x</a>'));
    }

    public function testNoWordsIsBlankAndBytesThatAreNoUtf8AreReadAsAQuestionMark(): void
    {
        self::assertTrue(RichHtml::isBlank(''));
        self::assertTrue(RichHtml::isBlank('<p></p>'));
        self::assertTrue(RichHtml::isBlank("<p> \u{00A0} </p><p><br></p>"));
        self::assertTrue(RichHtml::isBlank('<script>words</script><img alt="words">'));
        self::assertFalse(RichHtml::isBlank('<p>x</p>'));
        self::assertSame('<p>a?b</p>', RichHtml::clean("<p>a\xFFb</p>"));
    }

    public function testTheTreeIsReadAsTheBrowserReadsItsTags(): void
    {
        $nodes = Parser::parse('<P CLASS=a class=b>x<BR>y</p>');
        self::assertCount(1, $nodes);
        $p = $nodes[0];
        self::assertInstanceOf(RichElement::class, $p);
        self::assertSame('p', $p->tag);
        self::assertSame([['class', 'a']], $p->attrs);
        self::assertSame('x', $p->children[0]);
        self::assertInstanceOf(RichElement::class, $p->children[1]);
        self::assertSame('br', $p->children[1]->tag);
        self::assertSame('y', $p->children[2]);
        self::assertSame("\u{00A9} \u{2013} &alpha;", Parser::decodeReferences('&copy; &#150; &alpha;'));
    }
}
