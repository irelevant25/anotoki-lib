<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Robots;

use Anotoki\Lib\Admin\Schema;
use Anotoki\Lib\Robots\Http\RobotsRoutes;
use Anotoki\Lib\Robots\Robots;
use Anotoki\Lib\SiteSettings\SiteSettings;
use Anotoki\Lib\Tests\Support\DatabaseTestCase;
use Anotoki\Lib\Tests\Support\TempFolder;
use DateTimeImmutable;
use DOMDocument;
use InvalidArgumentException;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Factory\AppFactory;
use Slim\Psr7\Factory\ServerRequestFactory;

/** robots.txt and sitemap.xml on a real Slim app and database: what robots are told, and what they are never shown. */
final class RobotsTest extends DatabaseTestCase
{
    use TempFolder;

    private SiteSettings $settings;

    /** How many times the site's entries were asked for. */
    private int $asked = 0;

    protected function setUp(): void
    {
        parent::setUp();
        self::assertNull($this->migrator([Schema::migrationSet()])->apply()['error']);
        $this->settings = new SiteSettings(fn() => $this->pdo);
    }

    protected function tearDown(): void
    {
        $this->removeFolder();
        parent::tearDown();
    }

    public function testRobotsAreKeptOutOfTheAdminPanelTheApiAndTheSignInAndToldWhereThePagesAre(): void
    {
        $app = $this->app(new Robots(static fn(): string => 'https://Genshin.Anotoki.eu/', ['/login', '/account']));

        $response = $this->send($app, '/robots.txt');
        self::assertSame(200, $response->getStatusCode());
        self::assertSame('text/plain; charset=utf-8', $response->getHeaderLine('Content-Type'));
        self::assertSame('public, max-age=3600', $response->getHeaderLine('Cache-Control'));
        self::assertSame(
            "# The robots of every search engine: what to leave alone, and where the site's pages are listed.\nUser-agent: *\nDisallow: /admin\nDisallow: /api\nDisallow: /auth\nDisallow: /login\nDisallow: /account\n\nSitemap: https://genshin.anotoki.eu/sitemap.xml\n",
            (string) $response->getBody(),
            'the address the installation names, as an origin',
        );
        self::assertSame(200, $this->send($app, '/robots.txt', 'HEAD')->getStatusCode());
    }

    public function testWithoutAConfiguredAddressNoSitemapIsClaimedAndNoneIsMadeUpFromTheRequest(): void
    {
        foreach (
            [
                null,
                '',
                'genshin.anotoki.eu',
                'ftp://genshin.anotoki.eu',
                'https://genshin.anotoki.eu/sub',
                'https://user:pw@genshin.anotoki.eu',
                'https://genshin.anotoki.eu/?x=1',
                'https://exa mple.com',
            ]
            as $address
        ) {
            $app = $this->app(new Robots(static fn(): ?string => $address));
            $robots = (string) $this->send($app, '/robots.txt', headers: ['Host' => 'evil.example', 'X-Forwarded-Host' => 'evil.example'])->getBody();
            self::assertStringNotContainsString('Sitemap:', $robots, (string) $address);
            $sitemap = $this->send($app, '/sitemap.xml', headers: ['Host' => 'evil.example']);
            self::assertSame(404, $sitemap->getStatusCode(), (string) $address);
            self::assertSame('not_configured', json_decode((string) $sitemap->getBody(), true)['code']);
        }
        self::assertSame('http://localhost:4200', (new Robots(static fn(): string => 'http://localhost:4200'))->address());
    }

    public function testTheSitemapListsThePublicPagesAndTheSitesOwnAsAbsoluteAddressesInValidXml(): void
    {
        $robots = new Robots(
            static fn(): string => 'https://genshin.anotoki.eu',
            pages: ['/', '/daily', '/database', '/terms'],
            entries: fn(): iterable => $this->entries([
                ['path' => '/database/characters/12', 'lastmod' => '2026-10-24'],
                ['path' => '/database/characters/Hu Tao', 'lastmod' => new DateTimeImmutable('2026-10-20T23:30:00+02:00')],
                ['path' => '/database/characters/Hu%20Tao'], // the same page, given encoded: listed once
                ['path' => '/database/weapons/A&B <C>', 'lastmod' => 'last week'],
                '/database/weapons/Ž',
            ]),
            settings: $this->settings,
        );
        $response = $this->send($this->app($robots), '/sitemap.xml');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('application/xml; charset=utf-8', $response->getHeaderLine('Content-Type'));
        self::assertSame('public, max-age=3600', $response->getHeaderLine('Cache-Control'));
        self::assertSame(
            [
                ['https://genshin.anotoki.eu/', null],
                ['https://genshin.anotoki.eu/daily', null],
                ['https://genshin.anotoki.eu/database', null],
                ['https://genshin.anotoki.eu/terms', null],
                ['https://genshin.anotoki.eu/database/characters/12', '2026-10-24'],
                ['https://genshin.anotoki.eu/database/characters/Hu%20Tao', '2026-10-20'],
                ['https://genshin.anotoki.eu/database/weapons/A%26B%20%3CC%3E', null],
                ['https://genshin.anotoki.eu/database/weapons/%C5%BD', null],
            ],
            $this->urls((string) $response->getBody()),
            'each page once, every segment encoded, a lastmod only where it is a date',
        );
    }

    public function testWhatPageAccessHidesWhatRobotsTxtKeepsOutAndWhatIsNoPathStayOut(): void
    {
        $this->settings->addPage('/profile', 'USER', false, [], 7);
        $this->settings->addPage('/database/characters/:id', 'PUBLIC', true, [], 7);
        $this->settings->addPage('/drafts', 'EDITOR', false, [], 7);
        $this->settings->addPage('/daily', 'PUBLIC', false, ['/api/quiz'], 7);
        $robots = new Robots(
            static fn(): string => 'https://genshin.anotoki.eu',
            ['/login'],
            ['/', '/daily', '/profile', '/drafts', '/database/characters'],
            fn(): iterable => $this->entries([
                '/database/characters/12', // switched off by its pattern
                '/database/weapons/3',
                '/admin/characters', // robots.txt keeps these out
                '/api/characters',
                '/auth/callback',
                '/login',
                'https://elsewhere.example/page', // no path of the site's
                '//elsewhere.example/page',
                'relative/page',
                '/a/../admin',
                '/a//b',
                "/line\nbreak",
                '/back\\slash',
                ['lastmod' => '2026-10-24'],
                5,
                '/' . str_repeat('x', 2100),
            ]),
            $this->settings,
        );

        self::assertSame(
            ['https://genshin.anotoki.eu/', 'https://genshin.anotoki.eu/daily', 'https://genshin.anotoki.eu/database/characters', 'https://genshin.anotoki.eu/database/weapons/3'],
            array_column($this->urls((string) $robots->sitemapXml()), 0),
            'a page for people signed in, for editors, or switched off is no page for a search engine',
        );
    }

    public function testTheSitemapIsKeptAnHourAndMadeAgainAtOnceWhenPageAccessChanges(): void
    {
        $cache = $this->folder('storage') . '/cache/anotoki-sitemap.json';
        $make = fn(int $seconds = Robots::CACHE_SECONDS): Robots => new Robots(
            static fn(): string => 'https://genshin.anotoki.eu',
            [],
            ['/'],
            fn(): iterable => $this->entries(['/database/weapons/3']),
            $this->settings,
            $cache,
            $seconds,
        );

        $first = $make()->sitemapXml();
        self::assertSame(1, $this->asked);
        self::assertFileExists($cache);
        self::assertFileExists(dirname($cache) . '/.htaccess', 'the cache folder is guarded');
        self::assertSame($first, $make()->sitemapXml());
        self::assertSame(1, $this->asked, 'kept: the site\'s entries are not asked again');

        // A page hidden meanwhile is out of the very next sitemap.
        $this->settings->addPage('/database/weapons/:id', 'USER', false, [], 7);
        $second = $make()->sitemapXml();
        self::assertSame(2, $this->asked);
        self::assertStringNotContainsString('/database/weapons/3', (string) $second);

        // An hour old, it is made again.
        $kept = json_decode((string) file_get_contents($cache), true);
        $kept['at'] -= Robots::CACHE_SECONDS + 1;
        file_put_contents($cache, json_encode($kept));
        $make()->sitemapXml();
        self::assertSame(3, $this->asked);

        // A kept file that is no sitemap of ours is made again, never served.
        file_put_contents($cache, '{"key": "x", "at": 1, "xml": "<p>"}');
        self::assertStringStartsWith('<?xml', (string) $make()->sitemapXml());
    }

    public function testAtMostFiftyThousandAddresses(): void
    {
        $robots = new Robots(
            static fn(): string => 'https://a.example',
            [],
            [],
            static fn(): iterable => (static function () {
                for ($i = 0; $i < Robots::SITEMAP_MAX + 10; $i++) {
                    yield '/p/' . $i;
                }
            })(),
        );

        self::assertSame(Robots::SITEMAP_MAX, substr_count((string) $robots->sitemapXml(), '<url>'));
    }

    public function testWhatASiteKeepsRobotsOutOfIsAPath(): void
    {
        foreach ([['login'], ['/a b'], ["/a\nUser-agent: evil"], [5]] as $disallow) {
            try {
                new Robots(static fn(): ?string => null, $disallow);
                self::fail('Not refused: ' . json_encode($disallow));
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    private function app(Robots $robots): App
    {
        $app = AppFactory::create();
        RobotsRoutes::robots($app, $robots);
        RobotsRoutes::sitemap($app, $robots);

        return $app;
    }

    /**
     * @param list<mixed> $entries
     * @return list<mixed>
     */
    private function entries(array $entries): array
    {
        $this->asked++;

        return $entries;
    }

    /**
     * Every address of a sitemap, with its lastmod - read by an XML parser: the file is valid XML first.
     *
     * @return list<array{string, ?string}>
     */
    private function urls(string $xml): array
    {
        $document = new DOMDocument();
        self::assertTrue($document->loadXML($xml, LIBXML_NONET), 'valid XML');
        self::assertSame('urlset', $document->documentElement?->localName);
        self::assertSame('http://www.sitemaps.org/schemas/sitemap/0.9', $document->documentElement?->namespaceURI);
        $out = [];
        foreach ($document->getElementsByTagName('url') as $url) {
            $lastmod = $url->getElementsByTagName('lastmod')->item(0);
            $out[] = [(string) $url->getElementsByTagName('loc')->item(0)?->textContent, $lastmod?->textContent];
        }

        return $out;
    }

    /** @param array<string, string> $headers */
    private function send(App $app, string $path, string $method = 'GET', array $headers = []): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, 'https://site.example' . $path);
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $app->handle($request);
    }
}
