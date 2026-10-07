<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests;

use Anotoki\Lib\Support\JsonBody;
use Anotoki\Lib\Support\JsonResponse;
use Anotoki\Lib\Support\Refusal;
use PHPUnit\Framework\TestCase;
use Slim\Psr7\Factory\ResponseFactory;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;
use stdClass;

/** The helpers the library's modules share: the JSON answer, the JSON body, the refusal. */
final class SupportTest extends TestCase
{
    public function testTheJsonAnswerIsUtf8NeverCachedAndSurvivesBadBytes(): void
    {
        $response = JsonResponse::write((new ResponseFactory())->createResponse(), 201, ['a' => 'ž/š', 'bad' => "x\xC3\x28"]);

        self::assertSame(201, $response->getStatusCode());
        self::assertSame('application/json; charset=utf-8', $response->getHeaderLine('Content-Type'));
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));
        self::assertSame("{\"a\":\"ž/š\",\"bad\":\"x\u{FFFD}(\"}", (string) $response->getBody());
    }

    public function testARefusalsBody(): void
    {
        $refusal = Refusal::invalid('unknown_key', 'No such key.', ['key' => 'a.b', 'code' => 'ignored']);

        self::assertSame(422, $refusal->status);
        self::assertSame(['code' => 'unknown_key', 'message' => 'No such key.', 'key' => 'a.b'], $refusal->body());
    }

    public function testTheBodyKeepsObjectsApartFromLists(): void
    {
        $object = JsonBody::read($this->request('{"values": {"a.b": {"en": "x"}}, "list": [], "empty": {}}'), 1000);
        self::assertInstanceOf(stdClass::class, $object);
        self::assertSame([], $object->list);
        self::assertInstanceOf(stdClass::class, $object->empty);

        self::assertSame(['values' => $object->values, 'list' => [], 'empty' => $object->empty], JsonBody::map($object));
        self::assertSame([], JsonBody::map(new stdClass()));
        foreach ([[], ['a'], 'text', 12, true, null] as $value) {
            self::assertNull(JsonBody::map($value), json_encode($value));
        }
        self::assertSame(['0' => 'x', '12' => 'y'], JsonBody::map(json_decode('{"0": "x", "12": "y"}')), 'keys PHP makes numbers of');
        self::assertSame(['a', 'b'], JsonBody::read($this->request('["a", "b"]'), 1000));
    }

    public function testWhatIsRefusedAndInWhichOrder(): void
    {
        $code = static fn (mixed $result): ?string => $result instanceof Refusal ? $result->status . ' ' . $result->code : null;

        self::assertSame('413 too_large', $code(JsonBody::read($this->request('{}', ['Content-Length' => '1001']), 1000)), 'by what it says of itself, before reading');
        self::assertSame('413 too_large', $code(JsonBody::read($this->request('{}', ['Content-Length' => 'lots']), 1000)));
        self::assertSame('413 too_large', $code(JsonBody::read($this->request('"' . str_repeat('a', 1000) . '"', ['Content-Length' => '']), 1000)), 'by what arrived');
        self::assertNull($code(JsonBody::read($this->request('"' . str_repeat('a', 998) . '"'), 1000)), 'exactly the limit');
        self::assertSame('415 unsupported_media_type', $code(JsonBody::read($this->request('a=1', ['Content-Type' => 'application/x-www-form-urlencoded']), 1000)));
        self::assertSame('415 unsupported_media_type', $code(JsonBody::read($this->request('{}', ['Content-Type' => '']), 1000)), 'no type at all');
        self::assertNull($code(JsonBody::read($this->request('{}', ['Content-Type' => 'Application/JSON; charset=UTF-8']), 1000)));
        self::assertSame('422 empty_body', $code(JsonBody::read($this->request(''), 1000)));
        self::assertSame('422 empty_body', $code(JsonBody::read($this->request(" \n "), 1000)));
        self::assertSame('400 invalid_json', $code(JsonBody::read($this->request('{"a":'), 1000)));
        self::assertSame('400 invalid_json', $code(JsonBody::read($this->request(str_repeat('[', 40) . str_repeat(']', 40)), 1000)), 'nested deeper than any body here');
        self::assertSame('400 invalid_json', $code(JsonBody::read($this->request("\xEF\xBB\xBF{}"), 1000)));
    }

    public function testTheStreamIsReadFromItsBeginningEvenWhenTheSiteReadItFirst(): void
    {
        $request = $this->request('{"a": 1}');
        (string) $request->getBody();

        self::assertEquals((object) ['a' => 1], JsonBody::read($request, 1000));
    }

    /** @param array<string, string> $headers */
    private function request(string $body, array $headers = []): \Psr\Http\Message\ServerRequestInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest('PUT', 'https://site.example/api/x')
            ->withBody((new StreamFactory())->createStream($body));
        foreach ($headers + ['Content-Type' => 'application/json'] as $name => $value) {
            $request = $value === '' ? $request->withoutHeader($name) : $request->withHeader($name, $value);
        }

        return $request;
    }
}
