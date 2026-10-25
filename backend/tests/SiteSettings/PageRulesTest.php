<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\SiteSettings;

use Anotoki\Lib\Auth\Person;
use Anotoki\Lib\SiteSettings\PageRules;
use PHPUnit\Framework\TestCase;

/** Page access's rules on their own: how a row matches a page, the reserved paths both ways, who a visibility lets in. */
final class PageRulesTest extends TestCase
{
    public function testARowMatchesItsPageSegmentBySegmentAPlaceholderAnyOne(): void
    {
        self::assertTrue(PageRules::matches('/', '/'));
        self::assertTrue(PageRules::matches('/quizzes', '/quizzes'));
        self::assertTrue(PageRules::matches('/quizzes', '/quizzes/'), 'a trailing slash is the same page');
        self::assertTrue(PageRules::matches('/database/characters/:id', '/database/characters/12'));
        self::assertTrue(PageRules::matches('/:section/music', '/daily/music'));
        self::assertFalse(PageRules::matches('/database/characters', '/database/characters/12'), 'two rows, two decisions');
        self::assertFalse(PageRules::matches('/database/characters/:id', '/database/characters'));
        self::assertFalse(PageRules::matches('/quizzes', '/quizzes-old'));
        self::assertFalse(PageRules::matches('/', '/quizzes'));
    }

    public function testAReservedPageIsItselfAndEverythingUnderItAndNoPatternGetsRoundThat(): void
    {
        foreach (
            [
                ['/staff', '/staff'],
                ['/:section', '/staff'],
                ['/:section', '/admin'],
                ['/auth', '/auth'],
                ['/auth/callback', '/auth'],
                ['/auth/:step', '/auth'],
                ['/:a/:b', '/auth'],
                ['/admin/feedback', '/admin'],
                ['/:x/feedback', '/admin'],
            ]
            as [$row, $reserved]
        ) {
            self::assertTrue(PageRules::claimsPage($row, $reserved), "$row claims $reserved");
        }
        self::assertFalse(PageRules::claimsPage('/', '/staff'), 'the home page is not under /staff');
        self::assertFalse(PageRules::claimsPage('/staffing', '/staff'));
        self::assertFalse(PageRules::claimsPage('/quizzes/:id', '/staff'));
        self::assertFalse(PageRules::claimsPage('/account', '/account/settings'), 'fewer segments: no page there');
        self::assertTrue(PageRules::claimsPage('/account/:tab', '/account/settings'));
    }

    public function testAnApiPathTouchesAReservedOneEitherWayRound(): void
    {
        // Covering it: every request the reserved path answers begins with the claim, letter by letter.
        foreach (['/api/', '/api', '/api/m', '/api/me'] as $claim) {
            self::assertTrue(PageRules::touches($claim, '/api/me'), "$claim covers /api/me");
        }
        // Inside it.
        self::assertTrue(PageRules::touches('/api/me/avatar', '/api/me'));
        self::assertTrue(PageRules::touches('/api/site-settings/x', '/api/site-settings'));
        // Neither: a path that merely begins with the same letters is another path.
        self::assertFalse(PageRules::touches('/api/media', '/api/me'));
        self::assertFalse(PageRules::touches('/api/meow', '/api/me'));
        self::assertFalse(PageRules::touches('/api/quiz', '/api/me'));

        self::assertTrue(PageRules::within('/api/me', '/api/me'));
        self::assertTrue(PageRules::within('/api/me/x', '/api/me'));
        self::assertFalse(PageRules::within('/api/media', '/api/me'));
    }

    public function testWhatAPathMustBe(): void
    {
        self::assertNull(PageRules::pageProblem('/'));
        self::assertNull(PageRules::pageProblem('/database/characters/:id'));
        self::assertNull(PageRules::pageProblem('/a.b_c-d'));
        foreach (['quizzes', '/quizzes//music', '/quizzes/', '/quiz zes', '/:', '/-x', '/x?y', '/x#y', '/x/../y', '/' . str_repeat('a', 300)] as $path) {
            self::assertNotNull(PageRules::pageProblem($path), $path);
        }

        self::assertNull(PageRules::apiProblem('/api/quiz'));
        self::assertNull(PageRules::apiProblem('/api/quiz/stats.v2'));
        foreach (['/quiz', '/api', '/api/', '/apix/quiz', '/api//quiz', '/api/../me', '/api/./me', '/api/a b', '/api/a"b', '/api/a,b', '/api/{x}', '/api/a\\b'] as $path) {
            self::assertNotNull(PageRules::apiProblem($path), $path);
        }

        self::assertSame('/', PageRules::normalise(' / '));
        self::assertSame('/quizzes', PageRules::normalise('/quizzes/'));
    }

    public function testWhoAVisibilityLetsInAndTheAdministratorAlways(): void
    {
        $member = $this->person(['MEMBER']);
        $editor = $this->person(['MEMBER', 'EDITOR']);
        $admin = $this->person(['MEMBER', 'ADMIN']);

        $matrix = [
            'PUBLIC' => [true, true, true, true],
            'USER' => [false, true, true, true],
            'EDITOR' => [false, false, true, true],
            'ADMIN' => [false, false, false, true],
            'NONSENSE' => [false, false, false, true],
        ];
        foreach ($matrix as $visibility => $expected) {
            self::assertSame(
                $expected,
                [PageRules::visibleTo($visibility, null), PageRules::visibleTo($visibility, $member), PageRules::visibleTo($visibility, $editor), PageRules::visibleTo($visibility, $admin)],
                $visibility,
            );
        }

        $off = ['visibility' => 'PUBLIC', 'blocked' => true];
        self::assertFalse(PageRules::allows($off, null));
        self::assertFalse(PageRules::allows($off, $editor), 'switched off for everybody but the administrators');
        self::assertTrue(PageRules::allows($off, $admin), 'whoever switched it off can look at it');
        self::assertTrue(PageRules::allows(['visibility' => 'NONSENSE', 'blocked' => true], $admin));
    }

    /** @param list<string> $roles */
    private function person(array $roles): Person
    {
        return new Person(7, 'Mira', null, false, null, null, $roles, null, null, '', []);
    }
}
