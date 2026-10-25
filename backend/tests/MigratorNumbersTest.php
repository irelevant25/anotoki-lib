<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests;

use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;

/**
 * A file takes a number no other file of its set has (0.11.0, the owner's rule after genshin's two users/064_*.sql,
 * made the same day by two sessions): a file not applied yet whose number another file of its set has is held, as a
 * draft is, and an Apply stops before it naming both - while two files applied already are history.
 */
final class MigratorNumbersTest extends DatabaseTestCase
{
    public function testAPendingFileWithTheNumberOfAnAppliedOneIsHeldAndTheApplyNamesBoth(): void
    {
        $users = $this->set('users', ['063_people.sql' => 'CREATE TABLE people (id INT);', '064_news.sql' => 'CREATE TABLE news (id INT);']);
        self::assertNull($this->migrator([$users])->apply()['error']);

        // Another copy of the site made its own 064 the same day, and a 065 after it.
        $users = $this->set('users', ['064_visitors.sql' => 'CREATE TABLE visitors (id INT);', '065_after.sql' => 'CREATE TABLE after_it (id INT);']);
        $migrator = $this->migrator([$users]);

        self::assertSame([], $migrator->applicable(), 'nothing before it, nothing after it: the site is not held up by a file it cannot run');
        self::assertSame(
            [
                ['set' => 'users', 'name' => '064_visitors.sql', 'ready' => false, 'blocked' => false, 'duplicates' => ['064_news.sql']],
                ['set' => 'users', 'name' => '065_after.sql', 'ready' => true, 'blocked' => true, 'duplicates' => []],
            ],
            $migrator->status()['pending'],
        );

        $result = $migrator->apply();

        self::assertSame([], $result['applied']);
        self::assertSame(['set' => 'users', 'name' => '064_visitors.sql'], $result['failed']);
        self::assertSame(
            'Not applied: users/064_visitors.sql has the number 064, and so has users/064_news.sql. Every file of a set takes a number no other file of it has: give it the next free one, then apply again.',
            $result['error'],
        );
        self::assertFalse($this->tableExists('visitors'), 'never run');
        self::assertFalse($this->tableExists('after_it'), 'what comes after it waits');
        self::assertSame(['063_people.sql', '064_news.sql'], $this->pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(\PDO::FETCH_COLUMN));

        // Renamed to the next free number, it runs - and the file after it.
        rename($users->directory . '/064_visitors.sql', $users->directory . '/066_visitors.sql');
        $renamed = $this->migrator([$users])->apply();
        self::assertNull($renamed['error']);
        self::assertSame([['set' => 'users', 'name' => '065_after.sql'], ['set' => 'users', 'name' => '066_visitors.sql']], $renamed['applied']);
    }

    public function testTwoPendingFilesOfOneNumberAreBothHeldAndWhatComesBeforeThemRuns(): void
    {
        $site = $this->set('site', [
            '001_first.sql' => 'CREATE TABLE first_one (id INT);',
            '002_mine.sql' => 'CREATE TABLE mine (id INT);',
            '002_yours.sql' => 'CREATE TABLE yours (id INT);',
            '003_last.sql' => 'CREATE TABLE last_one (id INT);',
        ]);
        $migrator = $this->migrator([$site]);

        self::assertSame([['set' => 'site', 'name' => '001_first.sql']], $migrator->applicable());
        $pending = $migrator->status()['pending'];
        self::assertSame([[], ['002_yours.sql'], ['002_mine.sql'], []], array_column($pending, 'duplicates'));
        self::assertSame([true, false, false, true], array_column($pending, 'ready'));
        self::assertSame([false, false, true, true], array_column($pending, 'blocked'));

        $result = $migrator->apply();

        self::assertSame([['set' => 'site', 'name' => '001_first.sql']], $result['applied'], 'the file before them runs');
        self::assertSame(['set' => 'site', 'name' => '002_mine.sql'], $result['failed']);
        self::assertStringContainsString('site/002_mine.sql has the number 002, and so has site/002_yours.sql.', (string) $result['error']);
        self::assertTrue($this->tableExists('first_one'));
        self::assertFalse($this->tableExists('mine') || $this->tableExists('yours') || $this->tableExists('last_one'));

        // Asked again, it stops in the same place, having nothing else to do.
        $again = $this->migrator([$site])->apply();
        self::assertSame([[], ['set' => 'site', 'name' => '002_mine.sql']], [$again['applied'], $again['failed']]);
    }

    public function testTwoAppliedFilesOfOneNumberAreHistoryAndHoldNothingBack(): void
    {
        // A host where two files of one number both ran, before the engine looked (genshin's users/064_*).
        $users = $this->set('users', [
            '064_news.sql' => 'CREATE TABLE news (id INT);',
            '064_visitors.sql' => 'CREATE TABLE visitors (id INT);',
            '065_next.sql' => 'CREATE TABLE next_one (id INT);',
        ]);
        $this->pdo->exec('CREATE TABLE migrations (id SERIAL PRIMARY KEY, filename VARCHAR(255) NOT NULL UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
        $this->pdo->exec("INSERT INTO migrations (filename) VALUES ('064_news.sql'), ('064_visitors.sql')");
        $migrator = $this->migrator([$users]);

        self::assertSame([['set' => 'users', 'name' => '065_next.sql', 'ready' => true, 'blocked' => false, 'duplicates' => []]], $migrator->status()['pending']);
        $result = $migrator->apply();
        self::assertNull($result['error']);
        self::assertSame([['set' => 'users', 'name' => '065_next.sql']], $result['applied']);
        self::assertSame([], $this->migrator([$users])->status()['pending']);
    }

    public function testANumberIsItsValueARecordKeepsItsNumberAndEachSetHasItsOwn(): void
    {
        // A record whose file is gone keeps its number taken; 64 is 064; a name without a number is never one.
        $this->pdo->exec(
            'CREATE TABLE migrations (id SERIAL PRIMARY KEY, folder VARCHAR(64) NOT NULL, filename VARCHAR(255) NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE (folder, filename))',
        );
        $this->pdo->exec("INSERT INTO migrations (folder, filename) VALUES ('users', '010_gone.sql')");
        $users = $this->set('users', ['10_again.sql' => 'SELECT 1;', 'init.sql' => 'SELECT 1;', 'notes_one.sql' => 'SELECT 1;', 'notes_two.sql' => 'SELECT 1;']);
        $genshin = $this->set('genshin_impact', ['010_characters.sql' => 'SELECT 1;']);
        $library = MigrationSet::library('anotoki_words', $this->set('library-words', ['010_words.sql' => 'SELECT 1;'])->directory);
        $migrator = $this->migrator([$library, $users, $genshin]);

        $pending = [];
        foreach ($migrator->status()['pending'] as $file) {
            $pending[$file['set'] . '/' . $file['name']] = $file['duplicates'];
        }
        self::assertSame(
            [
                'anotoki_words/010_words.sql' => [],
                'users/10_again.sql' => ['010_gone.sql'],
                'users/init.sql' => [],
                'users/notes_one.sql' => [],
                'users/notes_two.sql' => [],
                'genshin_impact/010_characters.sql' => [],
            ],
            $pending,
            'the number is the digits before the first _, by its value, within one set',
        );

        $result = $migrator->apply();
        self::assertSame([['set' => 'anotoki_words', 'name' => '010_words.sql']], $result['applied']);
        self::assertSame(['set' => 'users', 'name' => '10_again.sql'], $result['failed']);
        self::assertStringContainsString('users/10_again.sql has the number 10, and so has users/010_gone.sql.', (string) $result['error']);
    }

    public function testAFileOfATakenNumberIsNeverAskedWhetherItIsADraft(): void
    {
        $asked = [];
        $site = $this->set('site', ['001_a.sql' => 'SELECT 1;', '001_b.sql' => 'SELECT 1;']);
        $migrator = $this->migrator(
            [$site],
            [
                'ready' => function (MigrationSet $set, string $name) use (&$asked): bool {
                    $asked[] = $name;

                    return true;
                },
            ],
        );

        self::assertSame([], $migrator->applicable());
        self::assertSame([], $asked, 'held for its number: it is not run, so it is not read');
    }
}
