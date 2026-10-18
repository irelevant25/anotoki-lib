<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\People;

use Anotoki\Lib\Auth\Person;
use Anotoki\Lib\People\PeopleRecorder;
use Anotoki\Lib\People\PeopleTable;
use Anotoki\Lib\People\Schema;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Tests\Support\SiteShapes;
use InvalidArgumentException;

/** Recording people from their tokens: on every site's shape, the throttle, the name's rules, the guards. */
final class PeopleRecorderTest extends DatabaseTestCase
{
    public function testEverySitesShapeIsRecorded(): void
    {
        foreach (SiteShapes::SITES as $site) {
            $this->pdo->exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
            SiteShapes::create($this->pdo, $site);
            $this->applyPeopleSet();
            SiteShapes::visitor($this->pdo, $site, -3);
            $before = $this->rows('SELECT * FROM users WHERE id < 0');
            $recorder = new PeopleRecorder(SiteShapes::table($site));
            $name = SiteShapes::table($site)->name;

            self::assertTrue($recorder->seen($this->pdo, $this->person(7, 'alice')), "$site: made");
            self::assertSame('alice', $this->value("SELECT $name FROM users WHERE id = 7"), $site);
            self::assertFalse($recorder->seen($this->pdo, $this->person(7, 'alice')), "$site: nothing changed, nothing written");
            self::assertTrue($recorder->seen($this->pdo, $this->person(7, 'alicia')), "$site: renamed");
            self::assertSame('alicia', $this->value("SELECT $name FROM users WHERE id = 7"), $site);
            self::assertFalse($recorder->seen($this->pdo, $this->person(7, null)), "$site: no name in the token keeps the stored one");
            self::assertSame('alicia', $this->value("SELECT $name FROM users WHERE id = 7"), $site);
            self::assertSame($before, $this->rows('SELECT * FROM users WHERE id < 0'), "$site: a visitor is never touched");
        }
    }

    public function testLastSeenAtMostEveryFiveMinutes(): void
    {
        SiteShapes::create($this->pdo, 'piano');
        $this->applyPeopleSet();
        $recorder = new PeopleRecorder(SiteShapes::table('piano'));

        $recorder->seen($this->pdo, $this->person(7, 'alice'));
        $this->pdo->exec("UPDATE users SET last_seen_at = now() - interval '4 minutes', created_at = now() - interval '1 day' WHERE id = 7");
        self::assertFalse($recorder->seen($this->pdo, $this->person(7, 'alice')), 'four minutes: nothing');
        $this->pdo->exec("UPDATE users SET last_seen_at = now() - interval '6 minutes' WHERE id = 7");
        self::assertTrue($recorder->seen($this->pdo, $this->person(7, 'alice')), 'six minutes: the last-seen');
        self::assertTrue((bool) $this->value("SELECT last_seen_at > now() - interval '1 minute' FROM users WHERE id = 7"));
        self::assertTrue((bool) $this->value("SELECT created_at < now() - interval '23 hours' FROM users WHERE id = 7"), 'first-seen stays');
        self::assertSame(1, (int) $this->value('SELECT progress_generation FROM users WHERE id = 7'), 'the lock\'s column as the site made it');
    }

    public function testANameIsClippedAndANotNullNameHasAFallback(): void
    {
        SiteShapes::create($this->pdo, 'build');
        $this->applyPeopleSet();
        $recorder = new PeopleRecorder(SiteShapes::table('build'));

        $recorder->seen($this->pdo, $this->person(7, str_repeat('ž', 150)));
        self::assertSame(str_repeat('ž', 100), $this->value('SELECT name FROM users WHERE id = 7'), 'clipped to VARCHAR(100), in characters');
        $recorder->seen($this->pdo, $this->person(8, '   '));
        self::assertSame('user 8', $this->value('SELECT name FROM users WHERE id = 8'), 'the site\'s fallback');
        self::assertNotNull($this->value('SELECT created_at FROM users WHERE id = 8'), 'a first-seen without a default is written');

        $plain = new PeopleRecorder(new PeopleTable(name: 'name', firstSeen: 'created_at', lastSeen: null));
        $plain->seen($this->pdo, $this->person(9, null));
        self::assertSame('user 9', $this->value('SELECT name FROM users WHERE id = 9'), 'a NOT NULL name without a fallback of the site\'s');

        $this->pdo->exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
        SiteShapes::create($this->pdo, 'piano');
        (new PeopleRecorder(SiteShapes::table('piano')))->seen($this->pdo, $this->person(9, null));
        self::assertNull($this->value('SELECT preferred_username FROM users WHERE id = 9'), 'a name that may be NULL stays NULL');
    }

    public function testUpdatedAtMovesWithTheRowsContentOnly(): void
    {
        SiteShapes::create($this->pdo, 'build');
        $this->applyPeopleSet();
        $recorder = new PeopleRecorder(new PeopleTable(name: 'name', firstSeen: 'created_at', lastSeen: 'last_seen_at', updatedAt: 'updated_at'));

        $recorder->seen($this->pdo, $this->person(7, 'alice'));
        self::assertNotNull($this->value('SELECT updated_at FROM users WHERE id = 7'));
        $this->pdo->exec("UPDATE users SET updated_at = '2020-01-01Z', last_seen_at = now() - interval '1 hour' WHERE id = 7");
        self::assertTrue($recorder->seen($this->pdo, $this->person(7, 'alice')), 'the last-seen moves on');
        self::assertSame('2020', $this->value("SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY') FROM users WHERE id = 7"), 'the content did not change');
        $recorder->seen($this->pdo, $this->person(7, 'alicia'));
        self::assertSame(date('Y'), $this->value("SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY') FROM users WHERE id = 7"), 'a new name');
    }

    public function testATimestampWithoutZoneIsWrittenInUtc(): void
    {
        SiteShapes::create($this->pdo, 'genshin');
        $this->applyPeopleSet();
        $this->pdo->exec("SET TIME ZONE 'Asia/Tokyo'");

        (new PeopleRecorder(SiteShapes::table('genshin')))->seen($this->pdo, $this->person(7, 'alice'));

        self::assertSame(0, (int) $this->value("SELECT round(abs(extract(epoch FROM (created_at - (now() AT TIME ZONE 'UTC')))) / 3600) FROM users WHERE id = 7"), 'UTC, not Tokyo\'s clock');
        self::assertSame('alice', $this->value('SELECT username FROM users WHERE id = 7'));
    }

    public function testTheSitesOwnColumns(): void
    {
        SiteShapes::create($this->pdo, 'japanese');
        $this->applyPeopleSet();
        $recorder = new PeopleRecorder(SiteShapes::table('japanese'));

        $recorder->seen($this->pdo, $this->person(1, 'owner'), ['time_zone' => 'Europe/Bratislava']);
        self::assertSame(['owner', 'Europe/Bratislava'], array_values($this->rows('SELECT preferred_username, time_zone FROM users WHERE id = 1')[0]), 'the row the site seeded');
        self::assertFalse($recorder->seen($this->pdo, $this->person(1, 'owner'), ['time_zone' => null]), 'a NULL keeps what is stored');
        self::assertTrue($recorder->seen($this->pdo, $this->person(1, 'owner'), ['time_zone' => 'Asia/Tokyo']), 'a zone of its own changes the row');
        self::assertSame('Asia/Tokyo', $this->value('SELECT time_zone FROM users WHERE id = 1'));

        foreach ([['preferred_username' => 'x'], ['nope' => 'x'], ['time_zone; DROP TABLE users' => 'x']] as $extra) {
            try {
                $recorder->seen($this->pdo, $this->person(1, 'owner'), $extra);
                self::fail('taken: ' . json_encode($extra));
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function testNeverAnAnonymizedRowNorAListedId(): void
    {
        SiteShapes::create($this->pdo, 'survey');
        $this->applyPeopleSet();
        $recorder = new PeopleRecorder(SiteShapes::table('survey'));
        $this->pdo->exec("INSERT INTO users (id, preferred_username, anonymized_at) VALUES (12, 'deleted-12', now())");
        $this->pdo->exec('INSERT INTO anotoki_people_anonymized (sub, anonymized_at, had_row) VALUES (12, now(), true), (13, now(), false)');

        self::assertFalse($recorder->seen($this->pdo, $this->person(12, 'bob')));
        self::assertSame('deleted-12', $this->value('SELECT preferred_username FROM users WHERE id = 12'));
        self::assertFalse($recorder->seen($this->pdo, $this->person(13, 'carol')), 'an id the IAM listed is never made again');
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM users WHERE id = 13'));
        $this->pdo->exec('DELETE FROM anotoki_people_anonymized WHERE sub = 12');
        $this->pdo->exec("UPDATE users SET last_seen_at = now() - interval '1 day' WHERE id = 12");
        self::assertFalse($recorder->seen($this->pdo, $this->person(12, 'bob')), 'an anonymized row, whatever the list says');
    }

    public function testBeforeTheAdoptionItRecordsAsTheSitesDid(): void
    {
        SiteShapes::create($this->pdo, 'survey', adopted: false);
        $recorder = new PeopleRecorder(SiteShapes::table('survey'));

        self::assertTrue($recorder->seen($this->pdo, $this->person(7, 'alice')));
        self::assertTrue($recorder->seen($this->pdo, $this->person(7, 'alicia')));
        self::assertSame('alicia', $this->value('SELECT preferred_username FROM users WHERE id = 7'));
    }

    private function applyPeopleSet(): void
    {
        $result = $this->migrator([$this->set('site'), Schema::migrationSet()])->apply();
        self::assertNull($result['error'], (string) $result['error']);
    }

    private function person(int $sub, ?string $name): Person
    {
        return new Person($sub, $name, null, false, null, null, ['MEMBER'], null, null, '', []);
    }
}
