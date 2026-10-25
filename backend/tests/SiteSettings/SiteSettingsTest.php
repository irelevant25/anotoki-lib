<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\SiteSettings;

use Anotoki\Lib\Admin\Schema;
use Anotoki\Lib\Auth\Person;
use Anotoki\Lib\SiteSettings\SiteSettings;
use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use InvalidArgumentException;

/** The site settings' store on a real database: the switches, Page access's rows and the rules that guard them. */
final class SiteSettingsTest extends DatabaseTestCase
{
    public function testBeforeItsUpdateEverySwitchIsAtItsDefaultAndNoPageIsGoverned(): void
    {
        $settings = $this->settings();

        self::assertFalse($settings->ready());
        self::assertNull($settings->maintenance(), 'no table: the site is open');
        self::assertNull($settings->announcement());
        self::assertSame([], $settings->pages());
        self::assertFalse($settings->refusesApi('/api/quiz', null));
        self::assertSame(['maintenance' => false, 'announcement' => null, 'pages' => []], $settings->publicBody());
        self::assertSame(503, $this->refusal($settings->save(['maintenance_mode' => true], 7))->status);
        self::assertSame('feature_unavailable', $this->refusal($settings->addPage('/quizzes', 'USER', false, [], 7))->code);
    }

    public function testASwitchNobodyThrewIsItsDefaultAndASaveWritesOnlyWhatChanged(): void
    {
        $settings = $this->ready();

        self::assertSame(
            [
                'maintenance_mode' => ['value' => false, 'updated_at' => null, 'updated_by' => null],
                'maintenance_message' => ['value' => [], 'updated_at' => null, 'updated_by' => null],
                'announcement_enabled' => ['value' => false, 'updated_at' => null, 'updated_by' => null],
                'announcement_level' => ['value' => 'info', 'updated_at' => null, 'updated_by' => null],
                'announcement_message' => ['value' => [], 'updated_at' => null, 'updated_by' => null],
            ],
            $settings->switches(),
        );
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM anotoki_site_settings'), 'nothing seeded');

        $changed = $settings->save(
            [
                'maintenance_mode' => true,
                'maintenance_message' => ['sk' => "  Hneď sme späť.\r\nVydrž.  ", 'en' => 'Back shortly.', 'de' => '   '],
                'announcement_level' => 'info',
            ],
            7,
        );

        self::assertSame(
            [
                'maintenance_mode' => ['old' => false, 'new' => true],
                'maintenance_message' => ['old' => [], 'new' => ['en' => 'Back shortly.', 'sk' => "Hneď sme späť.\nVydrž."]],
            ],
            $changed,
            'English first, each trimmed, its line breaks \n, an empty language dropped; the level sent unchanged is no change',
        );
        self::assertSame(['maintenance_message', 'maintenance_mode'], $this->pdo->query('SELECT name FROM anotoki_site_settings ORDER BY name')->fetchAll(\PDO::FETCH_COLUMN));
        self::assertSame('7', (string) $this->value("SELECT updated_by FROM anotoki_site_settings WHERE name = 'maintenance_mode'"));
        self::assertSame(['en' => 'Back shortly.', 'sk' => "Hneď sme späť.\nVydrž."], $settings->maintenance());
        self::assertTrue($settings->publicBody()['maintenance'], 'the pages are told the site is closed: an administrator\'s notice says so');
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/', (string) $settings->switches()['maintenance_mode']['updated_at']);

        $stamp = $this->value("SELECT updated_at FROM anotoki_site_settings WHERE name = 'maintenance_mode'");
        self::assertSame([], $settings->save(['maintenance_mode' => true], 9), 'the same again changes nothing');
        self::assertSame($stamp, $this->value("SELECT updated_at FROM anotoki_site_settings WHERE name = 'maintenance_mode'"), 'when it last changed stays true');

        // The site open again: the message stays for the next time.
        $settings->save(['maintenance_mode' => false], 7);
        self::assertNull($settings->maintenance());
        self::assertSame(['en' => 'Back shortly.', 'sk' => "Hneď sme späť.\nVydrž."], $settings->switches()['maintenance_message']['value']);

        // Closed without a word written: the page then says the library's own sentence.
        $settings->save(['maintenance_mode' => true, 'maintenance_message' => []], 7);
        self::assertSame([], $settings->maintenance());
        self::assertSame('{}', $this->value("SELECT value::text FROM anotoki_site_settings WHERE name = 'maintenance_message'"), 'an empty message is an object');
    }

    public function testEveryWrongValueIsRefusedAndNothingIsWritten(): void
    {
        $settings = $this->ready();
        $cases = [
            'unknown_setting' => ['login_enabled' => false],
            'invalid_setting' => ['maintenance_mode' => 'true'],
            'a level that is none' => ['announcement_level' => 'shout'],
            'a list for a message' => ['announcement_message' => ['Hello']],
            'a language that is no code' => ['announcement_message' => ['English' => 'Hello']],
            'a text that is no text' => ['announcement_message' => ['en' => 5]],
            'a control character' => ['announcement_message' => ['en' => "Bell\x07"]],
            'too long' => ['announcement_message' => ['en' => str_repeat('ž', SiteSettings::MESSAGE_MAX + 1)]],
            'too many languages' => [
                'announcement_message' => array_combine(array_map(static fn(int $n): string => chr(97 + intdiv($n, 26)) . chr(97 + ($n % 26)), range(0, 30)), array_fill(0, 31, 'x')),
            ],
        ];
        foreach ($cases as $case => $values) {
            $refusal = $settings->save($values + ['maintenance_mode' => true], 7);
            self::assertInstanceOf(Refusal::class, $refusal, $case);
            self::assertSame(422, $refusal->status, $case);
        }
        self::assertSame('unknown_setting', $this->refusal($settings->save(['login_enabled' => false], 7))->code);
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM anotoki_site_settings'), 'half a saved form is a combination nobody chose: nothing written');
        self::assertIsArray($settings->save(['announcement_message' => ['en' => str_repeat('ž', SiteSettings::MESSAGE_MAX)]], 7), 'two thousand characters, not bytes');
    }

    public function testAValueNothingUnderstandsIsReadAsItsDefaultNeverASiteThatWillNotStart(): void
    {
        $settings = $this->ready();
        $this->pdo->exec(
            "INSERT INTO anotoki_site_settings (name, value) VALUES
                ('maintenance_mode', '\"yes\"'), ('announcement_enabled', 'true'), ('announcement_level', '\"purple\"'),
                ('announcement_message', '{\"en\": \"Read me\", \"Klingon\": \"x\", \"sk\": 5, \"de\": \"\\u0007bell\"}'),
                ('login_enabled', 'false')",
        );

        self::assertNull($settings->maintenance(), '"yes" is not true: the site stays open');
        self::assertSame(['level' => 'info', 'message' => ['en' => 'Read me']], $settings->announcement(), 'a level nobody knows is information; what is no language passed over');
        self::assertArrayNotHasKey('login_enabled', $settings->switches(), 'a switch the library does not know is nobody\'s');
    }

    public function testTheAnnouncementNeedsBothItsSwitchAndSomethingToSay(): void
    {
        $settings = $this->ready();
        $settings->save(['announcement_enabled' => true], 7);
        self::assertNull($settings->announcement(), 'nothing written: nothing drawn');

        $settings->save(['announcement_message' => ['sk' => 'Dnes večer bude stránka chvíľu nedostupná.'], 'announcement_level' => 'warning'], 7);
        self::assertSame(['level' => 'warning', 'message' => ['sk' => 'Dnes večer bude stránka chvíľu nedostupná.']], $settings->announcement());
        self::assertSame(
            '{"maintenance":false,"announcement":{"level":"warning","message":{"sk":"Dnes večer bude stránka chvíľu nedostupná."}},"pages":[]}',
            json_encode($settings->publicBody(), JSON_UNESCAPED_UNICODE),
        );

        $settings->save(['announcement_enabled' => false], 7);
        self::assertNull($settings->announcement());
    }

    public function testASiteOffersThePartsItChoosesAndNoOther(): void
    {
        $this->ready();
        $iam = $this->settings([SiteSettings::ANNOUNCEMENT]);

        self::assertSame(['announcement'], $iam->parts());
        self::assertSame(['announcement_enabled', 'announcement_level', 'announcement_message'], array_keys($iam->switches()));
        self::assertSame(['announcement' => null], $iam->publicBody(), 'no pages part where the site offers none');
        self::assertSame('part_not_offered', $this->refusal($iam->save(['maintenance_mode' => true], 7))->code, 'the IAM cannot be closed: it signs everybody in to every site');
        self::assertNull($iam->maintenance());
        self::assertSame('part_not_offered', $this->refusal($iam->addPage('/x', 'USER', false, [], 7))->code);

        // Even a row put in by hand closes nothing on a site that does not offer the part.
        $this->pdo->exec("INSERT INTO anotoki_site_settings (name, value) VALUES ('maintenance_mode', 'true')");
        self::assertNull($iam->maintenance());

        self::assertSame(['getting_in', 'announcement', 'page_access'], $this->settings(['page_access', 'getting_in', 'announcement'])->parts(), 'in the library\'s order');
        $this->expectException(InvalidArgumentException::class);
        $this->settings(['getting_in', 'routes']);
    }

    public function testPagesAreAddedChangedAndRemovedAndEachDecisionIsWholeOrNotAtAll(): void
    {
        $settings = $this->ready();

        $quizzes = $settings->addPage(' /quizzes/ ', 'PUBLIC', false, ['/api/quiz/', ' /api/quiz-stats', '/api/quiz', ''], 7);
        self::assertIsArray($quizzes);
        self::assertSame(
            ['/quizzes', 'PUBLIC', false, ['/api/quiz', '/api/quiz-stats'], 10, 7],
            [$quizzes['path'], $quizzes['visibility'], $quizzes['blocked'], $quizzes['api_paths'], $quizzes['sort_order'], $quizzes['updated_by']],
        );
        $daily = $settings->addPage('/daily', 'ADMIN', true, ['/api/quiz'], 7);
        self::assertIsArray($daily);
        self::assertSame(20, $daily['sort_order'], 'at the end');
        self::assertSame(409, $this->refusal($settings->addPage('/quizzes', 'USER', false, [], 7))->status, 'governed already');

        $changed = $settings->savePages([['id' => $quizzes['id'], 'visibility' => 'USER', 'api_paths' => ['/api/quiz']], ['id' => $daily['id'], 'blocked' => true, 'visibility' => 'ADMIN']], 9);
        self::assertSame(
            [$quizzes['id'] => ['path' => '/quizzes', 'visibility' => ['old' => 'PUBLIC', 'new' => 'USER'], 'api_paths' => ['old' => ['/api/quiz', '/api/quiz-stats'], 'new' => ['/api/quiz']]]],
            $changed,
            'a row sent unchanged is not written',
        );

        // One refused change, and none is written.
        $refused = $settings->savePages([['id' => $quizzes['id'], 'blocked' => true], ['id' => $daily['id'], 'api_paths' => ['/api/site-status']]], 9);
        self::assertSame(['invalid_api_path', '/daily'], [$this->refusal($refused)->code, $this->refusal($refused)->extra['path']]);
        self::assertFalse($settings->pages()[0]['blocked'], 'the first page stays as it was');
        self::assertSame('unknown_page', $this->refusal($settings->savePages([['id' => 999999]], 9))->code);
        self::assertSame('invalid_visibility', $this->refusal($settings->savePages([['id' => $daily['id'], 'visibility' => 'MEMBER']], 9))->code);
        self::assertSame('invalid_blocked', $this->refusal($settings->savePages([['id' => $daily['id'], 'blocked' => 'yes']], 9))->code);

        self::assertSame('/daily', $settings->deletePage($daily['id'])['path'] ?? null);
        self::assertNull($settings->deletePage($daily['id']), 'gone already');
        self::assertSame(['/quizzes'], array_column($settings->pages(), 'path'));
        self::assertSame(
            ['maintenance' => false, 'announcement' => null, 'pages' => [['path' => '/quizzes', 'visibility' => 'USER', 'blocked' => false]]],
            $settings->publicBody(),
            'the pages are told who sees each page - never the API paths, which are the gate\'s business',
        );
    }

    public function testNoRowMayClaimAReservedPageOrApiPathEitherWayRound(): void
    {
        $settings = $this->ready(reservedApiPaths: ['/api/me', '/api/auth/config'], reservedPages: ['/welcome']);

        foreach (
            ['/staff', '/auth', '/auth/callback', '/auth/:step', '/admin', '/admin/settings', '/terms', '/privacy', '/contact', '/about', '/support', '/welcome', '/:anything', '/:a/:b']
            as $page
        ) {
            $refusal = $settings->addPage($page, 'USER', false, [], 7);
            self::assertSame('invalid_page', $this->refusal($refusal)->code, $page);
        }
        foreach (['quizzes', '/quizzes//x', '/quiz zes'] as $page) {
            self::assertSame('invalid_page', $this->refusal($settings->addPage($page, 'USER', false, [], 7))->code, $page);
        }

        foreach (
            [
                '/api', // covers every reserved path
                '/api/',
                '/api/m', // letter by letter: covers /api/me
                '/api/me',
                '/api/me/avatar', // inside it
                '/api/auth',
                '/api/auth/config/x',
                '/api/site-status',
                '/api/site-settings',
                '/api/site-settings/x',
                '/api/admin/site-settings',
                '/api/admin',
                '/api/translations',
                '/api/translations/sk',
                '/api/t',
            ]
            as $prefix
        ) {
            self::assertSame('invalid_api_path', $this->refusal($settings->addPage('/x', 'USER', false, [$prefix], 7))->code, $prefix);
        }
        self::assertSame(0, (int) $this->value('SELECT count(*) FROM anotoki_page_access'));

        // Neither way round: /api/media is no path of /api/me's.
        $media = $settings->addPage('/gallery', 'USER', false, ['/api/media'], 7);
        self::assertSame(['/api/media'], $media['api_paths'] ?? null);
        self::assertNull($settings->pageRefusal('/'), 'the home page may be governed');
        self::assertNull($settings->pageRefusal('/staffing'));
    }

    public function testARowPutInByHandForAReservedPathGovernsNothing(): void
    {
        $settings = $this->ready(reservedApiPaths: ['/api/me']);
        $this->pdo->exec(
            "INSERT INTO anotoki_page_access (path, visibility, blocked, api_paths) VALUES
                ('/:section', 'ADMIN', TRUE, '{/api/quiz}'),
                ('/quizzes', 'ADMIN', TRUE, '{/api/,/api/me,/api/translations,/api/quiz}')",
        );

        self::assertSame(['/quizzes'], array_column($settings->governing(), 'path'), 'a row a rule refuses is passed over');
        self::assertNull($settings->pageFor('/staff'), 'not even through a pattern');
        self::assertSame(['maintenance' => false, 'announcement' => null, 'pages' => [['path' => '/quizzes', 'visibility' => 'ADMIN', 'blocked' => true]]], $settings->publicBody());
        self::assertTrue($settings->refusesApi('/api/quiz', null), 'the claim a rule allows still refuses');
        self::assertFalse($settings->refusesApi('/api/me', null), 'a reserved path never is');
        self::assertFalse($settings->refusesApi('/api/translations/sk', null));
        self::assertFalse($settings->refusesApi('/api/anything', null), 'nor anything a row\'s "/api/" would have covered');
    }

    public function testAnApiPathIsRefusedOnlyWhenEveryPageThatClaimsItRefusesTheReader(): void
    {
        $settings = $this->ready();
        $member = $this->person(['MEMBER']);
        $editor = $this->person(['MEMBER', 'EDITOR']);
        $admin = $this->person(['MEMBER', 'ADMIN']);

        $daily = $settings->addPage('/daily', 'USER', false, ['/api/quiz'], 7);
        self::assertTrue($settings->refusesApi('/api/quiz', null), 'members only');
        self::assertTrue($settings->refusesApi('/api/quizzes', null), 'matched from its start, letter by letter');
        self::assertTrue($settings->refusesApi('/api/quiz/stats', null));
        self::assertFalse($settings->refusesApi('/api/qui', null));
        self::assertFalse($settings->refusesApi('/api/quiz', $member));

        // A second page on the same path, anybody's: the more open one wins.
        $quizzes = $settings->addPage('/quizzes', 'PUBLIC', false, ['/api/quiz'], 7);
        self::assertFalse($settings->refusesApi('/api/quiz', null));
        // ... until it is switched off too.
        $settings->savePages([['id' => $quizzes['id'], 'blocked' => true]], 7);
        self::assertTrue($settings->refusesApi('/api/quiz', null));
        self::assertFalse($settings->refusesApi('/api/quiz', $member), '/daily still lets members in');

        $settings->savePages([['id' => $daily['id'], 'visibility' => 'EDITOR']], 7);
        self::assertTrue($settings->refusesApi('/api/quiz', $member));
        self::assertFalse($settings->refusesApi('/api/quiz', $editor));
        $settings->savePages([['id' => $daily['id'], 'blocked' => true]], 7);
        self::assertTrue($settings->refusesApi('/api/quiz', $editor), 'switched off: everybody but the administrators');
        self::assertFalse($settings->refusesApi('/api/quiz', $admin), 'never the site\'s ADMIN');
        self::assertFalse($settings->refusesApi('/api/characters', null), 'a path no row claims is anybody\'s');
    }

    public function testThePageAPathIsGovernedByMatchesSegmentBySegment(): void
    {
        $settings = $this->ready();
        $settings->addPage('/database/characters/:id', 'USER', false, [], 7);
        $settings->addPage('/database/characters', 'PUBLIC', true, [], 7);

        self::assertSame('/database/characters/:id', $settings->pageFor('/database/characters/12')['path'] ?? null);
        self::assertSame('/database/characters', $settings->pageFor('/database/characters')['path'] ?? null);
        self::assertNull($settings->pageFor('/database'));
    }

    public function testWhatASiteReservesMustBeAPath(): void
    {
        foreach ([['reservedApiPaths' => ['api/me']], ['reservedApiPaths' => ['/']], ['reservedApiPaths' => ['//evil']], ['reservedPages' => ['/']], ['reservedPages' => ['/a b']]] as $case) {
            try {
                new SiteSettings(fn() => $this->pdo, SiteSettings::PARTS, $case['reservedApiPaths'] ?? [], $case['reservedPages'] ?? []);
                self::fail('Not refused: ' . json_encode($case));
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
        $settings = $this->settings(reservedApiPaths: ['/api/me/'], reservedPages: ['/welcome/']);
        self::assertSame(['/api/site-status', '/api/translations', '/api/site-settings', '/api/admin/site-settings', '/api/me'], $settings->reservedApiPaths());
        self::assertContains('/welcome', $settings->reservedPages());
        self::assertTrue($settings->isReservedApiPath('/api/me'));
        self::assertTrue($settings->isReservedApiPath('/api/translations/sk'));
        self::assertFalse($settings->isReservedApiPath('/api/media'));
    }

    /** @param ?list<string> $parts */
    private function settings(?array $parts = null, array $reservedApiPaths = [], array $reservedPages = []): SiteSettings
    {
        return new SiteSettings(fn() => $this->pdo, $parts ?? SiteSettings::PARTS, $reservedApiPaths, $reservedPages);
    }

    private function ready(array $reservedApiPaths = [], array $reservedPages = []): SiteSettings
    {
        self::assertNull($this->migrator([Schema::migrationSet()])->apply()['error']);
        $settings = $this->settings(null, $reservedApiPaths, $reservedPages);
        self::assertTrue($settings->ready());

        return $settings;
    }

    private function refusal(mixed $answer): Refusal
    {
        self::assertInstanceOf(Refusal::class, $answer, (string) json_encode($answer));

        return $answer;
    }

    /** @param list<string> $roles */
    private function person(array $roles): Person
    {
        return new Person(7, 'Mira', null, false, null, null, $roles, null, null, '', []);
    }
}
