<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Auth;

use Anotoki\Lib\Auth\IamClient;
use Anotoki\Lib\Auth\Testing\StandInIam;
use Anotoki\Lib\Support\HttpGet;
use Anotoki\Lib\Tests\Support\TempFolder;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

/**
 * Where the library asks the IAM: an https issuer (http only on this computer), and nothing but http and
 * https asked - never a file, a PHP stream or another protocol, by curl or by PHP's streams.
 */
final class IamAddressesTest extends TestCase
{
    use TempFolder;

    protected function tearDown(): void
    {
        $this->removeFolder();
    }

    public function testTheIssuerIsHttpsOrThisComputer(): void
    {
        foreach (
            ['https://iam.anotoki.eu', 'https://iam.test/', 'HTTPS://IAM.TEST', 'http://localhost:4300', 'http://127.0.0.1:8100', 'http://127.1.2.3', 'http://[::1]:4300', 'HTTP://LOCALHOST:4300']
            as $issuer
        ) {
            self::assertTrue(IamClient::secureAddress($issuer), $issuer);
            self::assertSame(rtrim($issuer, '/'), (new IamClient($issuer, 'app'))->issuer, $issuer);
        }
        self::assertFalse((new IamClient('', 'app'))->configured(), 'no issuer: not set up yet, refused as before - never an error');

        foreach (
            [
                'http://iam.anotoki.eu',
                'http://localhost.evil.test',
                'http://127.0.0.1.evil.test',
                'http://evil.localhost',
                'http://0.0.0.0',
                'ftp://iam.test',
                'file:///etc/passwd',
                'php://filter/resource=/etc/passwd',
                'javascript:alert(1)',
                '//iam.test',
                'iam.test',
                'https://',
            ]
            as $issuer
        ) {
            self::assertFalse(IamClient::secureAddress($issuer), $issuer);
            try {
                IamClient::fromArray(['issuer' => $issuer, 'client_id' => 'app']);
                self::fail("the issuer $issuer was taken");
            } catch (InvalidArgumentException $e) {
                self::assertStringStartsWith('IamClient: the issuer is an https address', $e->getMessage(), $issuer);
            }
        }

        $this->expectExceptionMessage('IamClient: the jwks_url is an https address - http only on this computer (localhost, 127.0.0.1, [::1]) - and "file:///tmp/keys.json" is not.');
        IamClient::fromArray(['issuer' => 'https://iam.test', 'client_id' => 'app', 'jwks_url' => 'file:///tmp/keys.json']);
    }

    public function testNothingButHttpAndHttpsIsAsked(): void
    {
        $file = $this->folder('files') . '/keys.json';
        file_put_contents($file, '{"keys": []}');
        $byStream = new ReflectionMethod(HttpGet::class, 'byStream');

        foreach (
            [
                'file://' . $file,
                'php://filter/resource=' . $file,
                'compress.zlib://' . $file,
                'data:application/json,{"keys":[]}',
                'ftp://127.0.0.1:9/keys.json',
                'gopher://127.0.0.1:9/_x',
                'dict://127.0.0.1:9/x',
                $file,
                'https:///keys.json',
            ]
            as $url
        ) {
            self::assertFalse(HttpGet::allowed($url), $url);
            self::assertSame(['status' => 0, 'body' => null], HttpGet::fetch($url, 1.0), $url);
            self::assertSame(['status' => 0, 'body' => null], $byStream->invoke(null, $url, 1.0, []), "$url, PHP's streams on their own");
        }
        foreach (['http://iam.test/x', 'https://iam.test/x', 'HTTPS://IAM.TEST/x'] as $url) {
            self::assertTrue(HttpGet::allowed($url), $url);
        }
    }

    public function testHttpIsStillAskedBothWays(): void
    {
        $standIn = StandInIam::start($this->folder('stand-in'), 'survey');
        try {
            $url = $standIn->url('/.well-known/jwks.json');
            $byCurl = HttpGet::fetch($url, 5.0);
            self::assertSame(200, $byCurl['status']);
            self::assertArrayHasKey('keys', json_decode((string) $byCurl['body'], true));
            $byStream = (new ReflectionMethod(HttpGet::class, 'byStream'))->invoke(null, $url, 5.0, ['Accept: application/json']);
            self::assertSame($byCurl['body'], $byStream['body']);
            self::assertSame(200, $byStream['status']);
        } finally {
            $standIn->stop();
        }
    }
}
