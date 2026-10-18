<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Support;

use Anotoki\Lib\People\PeopleTable;
use PDO;

/**
 * Each site's `users` table as its own migrations leave it today (2026-10-07), with the column its
 * adoption migration adds (anonymized_at), and the mapping it gives the people module - so the library's
 * tests meet every shape that exists: survey (an email column, a CHECK keeping visitors nameless), Piano
 * Academy (the row as the per-person lock), Japanese Academy (a time zone of its own), the build analyzer
 * (a NOT NULL name, no default on created_at, updated_at), genshin (an INTEGER id, a NOT NULL username,
 * TIMESTAMP stamps holding the session's time, a trigger).
 */
final class SiteShapes
{
    public const SITES = ['survey', 'piano', 'japanese', 'build', 'genshin'];

    /** Makes the site's users table (and what it needs) on $pdo; $adopted: with anonymized_at. */
    public static function create(PDO $pdo, string $site, bool $adopted = true): void
    {
        foreach (self::ddl($site) as $statement) {
            $pdo->exec($statement);
        }
        if ($adopted) {
            $pdo->exec('ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ');
        }
    }

    public static function table(string $site): PeopleTable
    {
        return match ($site) {
            'survey' => new PeopleTable(name: 'preferred_username', firstSeen: 'first_seen_at', lastSeen: 'last_seen_at'),
            'piano', 'japanese' => new PeopleTable(name: 'preferred_username', firstSeen: 'created_at', lastSeen: 'last_seen_at'),
            'build' => new PeopleTable(name: 'name', firstSeen: 'created_at', lastSeen: null, updatedAt: 'updated_at', nameFallback: static fn(int $sub): string => "user $sub"),
            'genshin' => new PeopleTable(name: 'username', firstSeen: 'created_at', lastSeen: null, nameFallback: static fn(int $sub): string => "user$sub"),
        };
    }

    /** A visitor's row in the site's shape: a negative id, a key's hash. */
    public static function visitor(PDO $pdo, string $site, int $id): void
    {
        $hash = hash('sha256', 'visitor' . $id);
        match ($site) {
            'survey' => $pdo->prepare('INSERT INTO users (id, visitor_key_hash) VALUES (?, ?)')->execute([$id, $hash]),
            'piano' => $pdo->prepare('INSERT INTO users (id, visitor_key_hash) VALUES (?, ?)')->execute([$id, $hash]),
            'japanese' => $pdo->prepare('INSERT INTO users (id, visitor_key_hash) VALUES (?, ?)')->execute([$id, $hash]),
            'build' => $pdo->prepare("INSERT INTO users (id, name, visitor_key_hash, last_seen_at) VALUES (?, 'visitor', ?, now())")->execute([$id, $hash]),
            'genshin' => $pdo->prepare("INSERT INTO users (id, username, visitor_key_hash, last_seen_at) VALUES (?, 'visitor', ?, now())")->execute([$id, $hash]),
        };
    }

    /** @return list<string> */
    private static function ddl(string $site): array
    {
        return match ($site) {
            // survey/001 + 006
            'survey' => [
                'CREATE TABLE users (
                    id                  BIGINT        PRIMARY KEY,
                    preferred_username  VARCHAR(200),
                    email               VARCHAR(320),
                    first_seen_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
                    last_seen_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
                )',
                'ALTER TABLE users ADD COLUMN visitor_key_hash CHAR(64)',
                'ALTER TABLE users ADD CONSTRAINT users_visitor_key_hash_unique UNIQUE (visitor_key_hash)',
                "ALTER TABLE users ADD CONSTRAINT users_visitor_check CHECK (
                    id <> 0
                    AND (visitor_key_hash IS NULL OR (id < 0 AND visitor_key_hash ~ '^[0-9a-f]{64}$'))
                    AND (id > 0 OR (preferred_username IS NULL AND email IS NULL)))",
                'CREATE TABLE responses (id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE, answers JSONB NOT NULL DEFAULT \'{}\')',
            ],
            // piano_academy/001 + 004 + 005
            'piano' => [
                'CREATE TABLE users (
                    id                 bigint      PRIMARY KEY,
                    preferred_username text,
                    created_at         timestamptz NOT NULL DEFAULT now(),
                    last_seen_at       timestamptz NOT NULL DEFAULT now()
                )',
                'CREATE SEQUENCE IF NOT EXISTS progress_generation',
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS progress_generation BIGINT NOT NULL DEFAULT nextval('progress_generation')",
                'ALTER TABLE users ADD COLUMN IF NOT EXISTS visitor_key_hash CHAR(64)',
                "ALTER TABLE users ADD CONSTRAINT users_kind_check CHECK (
                    id <> 0
                    AND (id < 0) = (visitor_key_hash IS NOT NULL)
                    AND (visitor_key_hash IS NULL OR visitor_key_hash ~ '^[0-9a-f]{64}$'))",
                'CREATE TABLE progress (user_id bigint PRIMARY KEY REFERENCES users (id) ON UPDATE CASCADE, notes jsonb NOT NULL)',
            ],
            // 002 + 005 + 007
            'japanese' => [
                'CREATE TABLE users (
                    id                 bigint      PRIMARY KEY,
                    preferred_username text,
                    created_at         timestamptz NOT NULL DEFAULT now(),
                    last_seen_at       timestamptz NOT NULL DEFAULT now()
                )',
                'INSERT INTO users (id) VALUES (1)',
                "ALTER TABLE users ADD COLUMN time_zone varchar(64) CHECK (time_zone <> '')",
                'ALTER TABLE users ADD COLUMN visitor_key_hash char(64) UNIQUE',
                'ALTER TABLE users ADD COLUMN visitor_from char(64)',
                'ALTER TABLE users ADD CONSTRAINT users_person_or_visitor CHECK (
                    (id > 0 AND visitor_key_hash IS NULL AND visitor_from IS NULL)
                    OR (id < 0 AND visitor_key_hash IS NOT NULL))',
                'CREATE TABLE exam_attempts (id bigserial PRIMARY KEY, user_id bigint NOT NULL REFERENCES users (id) ON UPDATE CASCADE, candidate text NOT NULL DEFAULT \'\', meta jsonb NOT NULL DEFAULT \'{}\')',
            ],
            // 002_schema + 004
            'build' => [
                'CREATE TABLE users (
                    id          BIGINT          NOT NULL,
                    name        VARCHAR(100)    NOT NULL,
                    created_at  TIMESTAMPTZ,
                    updated_at  TIMESTAMPTZ,
                    CONSTRAINT users_pkey PRIMARY KEY (id)
                )',
                'ALTER TABLE users ADD COLUMN IF NOT EXISTS visitor_key_hash CHAR(64)',
                'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ',
                'ALTER TABLE users ADD CONSTRAINT users_visitor_key_hash_unique UNIQUE (visitor_key_hash)',
                "ALTER TABLE users ADD CONSTRAINT users_visitor_key_hash_check CHECK (visitor_key_hash ~ '^[0-9a-f]{64}$')",
                'ALTER TABLE users ADD CONSTRAINT users_visitor_check CHECK ((id < 0) = (visitor_key_hash IS NOT NULL) AND (id > 0 OR last_seen_at IS NOT NULL))',
                'CREATE TABLE sync_runs (id BIGSERIAL PRIMARY KEY, started_by BIGINT REFERENCES users (id) ON DELETE SET NULL, log TEXT NOT NULL DEFAULT \'\')',
            ],
            // users/001 + 040 + 045 + 048
            'genshin' => [
                'CREATE TABLE users (
                    id                  INTEGER         PRIMARY KEY,
                    username            VARCHAR(100)    NOT NULL,
                    email               VARCHAR(255)    NULL,
                    background          VARCHAR(100)    NULL,
                    version             VARCHAR(10),
                    created_at          TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
                    updated_at          TIMESTAMP
                )',
                'CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END $$ LANGUAGE plpgsql',
                'CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
                'ALTER TABLE users ADD COLUMN IF NOT EXISTS visitor_key_hash CHAR(64)',
                'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ',
                "ALTER TABLE users ADD CONSTRAINT users_kind_check CHECK (
                    id <> 0
                    AND (id < 0) = (visitor_key_hash IS NOT NULL)
                    AND (id > 0 OR last_seen_at IS NOT NULL)
                    AND (visitor_key_hash IS NULL OR visitor_key_hash ~ '^[0-9a-f]{64}$'))",
                'CREATE TABLE feedback (id SERIAL PRIMARY KEY, user_id INTEGER, username VARCHAR(100), email VARCHAR(255), ip VARCHAR(64), user_agent TEXT, message TEXT NOT NULL)',
            ],
        };
    }
}
