<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests;

use Anotoki\Lib\Migrations\Splitter;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class SplitterTest extends TestCase
{
    public function testSplitsAtSemicolonsTrimmingAndDroppingEmptyStatements(): void
    {
        self::assertSame(
            ['CREATE TABLE a (id int)', 'INSERT INTO a VALUES (1)', 'SELECT 1'],
            Splitter::split("  CREATE TABLE a (id int);\n\n;;  INSERT INTO a VALUES (1) ;\n\tSELECT 1\n")
        );
    }

    public function testEmptyTextAndTextWithoutStatementsGiveNone(): void
    {
        self::assertSame([], Splitter::split(''));
        self::assertSame([], Splitter::split(" \n\t;\r\n ; "));
        self::assertSame([], Splitter::split("-- only a comment; with a semicolon\n/* and; another */\n-- end of 003\n"));
    }

    public function testLineCommentsAreLeftOutWithTheirSemicolons(): void
    {
        $sql = <<<'SQL'
            -- 001: the first table; made here
            CREATE TABLE a (
                -- the key; it counts up
                id int, -- trailing; comment
                name text
            );
            SELECT 1 -- no line break after this; ever
            SQL;

        // A heredoc's line breaks are the checkout's (CRLF on a Windows one); the statements keep a file's own.
        self::assertSame(
            ["CREATE TABLE a (\n    id int,\n    name text\n)", 'SELECT 1'],
            Splitter::split(str_replace("\r\n", "\n", $sql))
        );
    }

    public function testACommentAfterSqlKeepsTheLineBreakBetweenWords(): void
    {
        self::assertSame(["SELECT a\nFROM t"], Splitter::split("SELECT a -- the column\nFROM t"));
    }

    public function testBlockCommentsAreLeftOutAndAreNotNested(): void
    {
        $sql = <<<'SQL'
            /* a header;
               over two lines; */
            SELECT 1;
            SELECT /* in; between */ 2;
            SELECT 3/* glued */+4;
            /* outer /* inner */ SELECT 5;
            SQL;

        self::assertSame(['SELECT 1', 'SELECT 2', 'SELECT 3 +4', 'SELECT 5'], Splitter::split($sql));
    }

    public function testABlockCommentBetweenTwoWordsLeavesThemTwoWords(): void
    {
        self::assertSame(['SELECT a FROM t'], Splitter::split('SELECT a/* the column */FROM t'));
    }

    public function testSingleQuotedStringsKeepTheirSemicolonsCommentsAndDoubledQuotes(): void
    {
        $sql = <<<'SQL'
            INSERT INTO t VALUES ('it''s; -- not a comment /* nor this */');
            SELECT ''';''';
            SELECT 'C:\';
            SELECT 2
            SQL;

        self::assertSame(
            ["INSERT INTO t VALUES ('it''s; -- not a comment /* nor this */')", "SELECT ''';'''", "SELECT 'C:\\'", 'SELECT 2'],
            Splitter::split($sql)
        );
    }

    public function testEscapeStringsTakeABackslashAsAnEscape(): void
    {
        $sql = <<<'SQL'
            SELECT E'it\'s; still the string \\';
            SELECT e'\'';
            SELECT E'a''b;c';
            SELECT 2
            SQL;

        self::assertSame(
            ["SELECT E'it\\'s; still the string \\\\'", "SELECT e'\\''", "SELECT E'a''b;c'", 'SELECT 2'],
            Splitter::split($sql)
        );
    }

    public function testAnEBeforeAQuoteInsideAWordIsNoEscapeString(): void
    {
        // `name'...'` is a typed literal: a plain string, where a backslash is just a backslash.
        self::assertSame(["SELECT name'x\\'", 'SELECT 2'], Splitter::split("SELECT name'x\\'; SELECT 2"));
    }

    public function testQuotedIdentifiersKeepTheirSemicolonsAndDoubledQuotes(): void
    {
        self::assertSame(
            ['CREATE TABLE "odd;name" ("a ""quoted"" -- col" int)', 'SELECT 1'],
            Splitter::split('CREATE TABLE "odd;name" ("a ""quoted"" -- col" int); SELECT 1')
        );
    }

    public function testDollarQuotedBlocksKeepEverythingInside(): void
    {
        $function = <<<'SQL'
            CREATE FUNCTION touch() RETURNS trigger AS $$
            BEGIN
                NEW.updated_at := now(); -- a comment inside; kept
                RETURN NEW; /* also kept; */
            END;
            $$ LANGUAGE plpgsql
            SQL;
        $do = <<<'SQL'
            DO $migration$
            BEGIN
                EXECUTE $q$SELECT 'a;b'$q$;
                RAISE NOTICE 'done; $$ is no end here';
            END
            $migration$
            SQL;

        self::assertSame([$function, $do, 'SELECT 1'], Splitter::split($function . ";\n" . $do . ";\nSELECT 1;"));
    }

    public function testADollarThatOpensNoBlockIsPlainText(): void
    {
        self::assertSame(
            ['SELECT $1, $2 FROM t', 'CREATE TABLE price$eur$x (id int)', 'SELECT 1'],
            Splitter::split('SELECT $1, $2 FROM t; CREATE TABLE price$eur$x (id int); SELECT 1')
        );
    }

    /** @return iterable<string, array{string, list<string>}> */
    public static function unclosed(): iterable
    {
        yield 'string' => ["SELECT 1; SELECT 'never closed; SELECT 2", ['SELECT 1', "SELECT 'never closed; SELECT 2"]];
        yield 'escape string' => ["SELECT 1; SELECT E'never closed\\'; SELECT 2", ['SELECT 1', "SELECT E'never closed\\'; SELECT 2"]];
        yield 'identifier' => ['SELECT 1; SELECT "never closed; SELECT 2', ['SELECT 1', 'SELECT "never closed; SELECT 2']];
        yield 'dollar block' => ['SELECT 1; DO $x$ BEGIN; SELECT 2', ['SELECT 1', 'DO $x$ BEGIN; SELECT 2']];
        yield 'empty-tag block' => ['SELECT 1; DO $$ BEGIN; SELECT 2', ['SELECT 1', 'DO $$ BEGIN; SELECT 2']];
        yield 'block comment' => ['SELECT 1; /* never closed; SELECT 2', ['SELECT 1']];
        yield 'line comment' => ['SELECT 1; -- to the end; SELECT 2', ['SELECT 1']];
    }

    /** @param list<string> $expected */
    #[DataProvider('unclosed')]
    public function testAnUnclosedQuoteOrBlockRunsToTheEnd(string $sql, array $expected): void
    {
        self::assertSame($expected, Splitter::split($sql));
    }

    public function testWindowsLineEndings(): void
    {
        self::assertSame(
            ["CREATE TABLE a (\r\n    id int\r\n)", "SELECT 1\nFROM a"],
            Splitter::split("-- header\r\nCREATE TABLE a (\r\n    -- the key\r\n    id int\r\n);\r\nSELECT 1 -- one\r\nFROM a;\r\n")
        );
    }
}
