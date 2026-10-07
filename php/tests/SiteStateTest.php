<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests;

use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Tests\Support\TestDatabase;

final class SiteStateTest extends DatabaseTestCase
{
    public function testNotSetUpWhileTheSettingsHaveAProblemWithoutAskingTheDatabase(): void
    {
        $asked = false;
        $state = new SiteState(
            fn (): ?string => 'config/database.local.php is missing.',
            fn (): bool => false,
            function () use (&$asked): Migrator {
                $asked = true;

                return $this->migrator([$this->set('site')]);
            },
        );

        self::assertSame(SiteState::NOT_SET_UP, $state->state());
        self::assertFalse($asked, 'the Migrator is only made once the settings are complete');
    }

    public function testUpdatePendingWhileAFileIsReadyToApply(): void
    {
        $set = $this->set('site', ['001_a.sql' => 'CREATE TABLE a (id int);']);

        self::assertSame(SiteState::UPDATE_PENDING, $this->stateOf($set)->state());
    }

    public function testADraftAloneDoesNotStopTheSite(): void
    {
        $set = $this->set('site', ['001_a.sql' => 'CREATE TABLE a (id int);']);
        $ready = fn (MigrationSet $set, string $name, string $sql): bool => str_contains($sql, '-- end of');

        self::assertSame(SiteState::READY, $this->stateOf($set, ['ready' => $ready])->state());
    }

    public function testReadyWhenNothingIsPending(): void
    {
        self::assertSame(SiteState::READY, $this->stateOf($this->set('site'))->state());
    }

    public function testUnavailableWhenTheDatabaseCannotBeReached(): void
    {
        $state = new SiteState(
            fn (): ?string => null,
            fn (): bool => true,
            fn (): Migrator => new Migrator(TestDatabase::connect($this->database . '_gone'), [$this->set('site')]),
        );

        self::assertSame(SiteState::UNAVAILABLE, $state->state());
    }

    public function testDecidedAfreshOnEveryCall(): void
    {
        $set = $this->set('site', ['001_a.sql' => 'CREATE TABLE a (id int);']);
        $state = $this->stateOf($set);
        self::assertSame(SiteState::UPDATE_PENDING, $state->state());

        $this->migrator([$set])->apply();

        self::assertSame(SiteState::READY, $state->state());
    }

    public function testInstalledAndBlockingAreTheSites(): void
    {
        $installed = false;
        $state = new SiteState(fn (): ?string => null, function () use (&$installed): bool {
            return $installed;
        }, fn (): Migrator => $this->migrator([$this->set('site')]), false);

        self::assertFalse($state->installed());
        $installed = true;
        self::assertTrue($state->installed());
        self::assertFalse($state->blockWhilePending);
        self::assertTrue((new SiteState(fn () => null, fn () => true, fn () => null))->blockWhilePending, 'blocking is the default');
    }

    /** @param array<string, mixed> $options */
    private function stateOf(MigrationSet $set, array $options = []): SiteState
    {
        return new SiteState(fn (): ?string => null, fn (): bool => false, fn (): Migrator => $this->migrator([$set], $options));
    }
}
