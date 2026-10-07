<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Translations;

use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Tests\Support\MailLikeRules;
use Anotoki\Lib\Translations\LibraryWords;
use Anotoki\Lib\Translations\Rules\LibraryKeyRules;
use Anotoki\Lib\Translations\Rules\RequiredPlaceholders;
use Anotoki\Lib\Translations\StringCheck;
use Anotoki\Lib\Translations\Text;
use Anotoki\Lib\Translations\TranslationsConfig;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

/** The checks of a save, without a database: every refusal, its order, and the rules a site adds. */
final class StringCheckTest extends TestCase
{
    private const LANGUAGES = ['en' => 'English', 'sk' => 'Slovak'];

    private const ENGLISH = [
        'test.hello' => 'Hello, {name}',
        'test.step' => 'Step {n} of {m}',
        'test.bye' => 'Bye',
        'login.continueTo' => 'Sign in to continue to {app}',
        'common.save' => 'Save',
    ];

    /** The IAM's MAIL_KEYS, the part these cases use. */
    private const MAIL_KEYS = [
        'mail.reset.subject' => [],
        'mail.reset.greeting' => ['username'],
        'mail.reset.intro' => [],
        'mail.reset.validity' => ['minutes'],
        'mail.reset.ignore' => [],
        'mail.confirm.greeting' => ['username'],
        'mail.confirm.validity' => ['hours'],
        'mail.loginCode.subject' => ['code'],
        'mail.loginCode.greeting' => ['username'],
        'mail.deletion.intro' => ['date'],
    ];

    private const MAIL_ENGLISH = [
        'mail.reset.subject' => 'Reset your anotoki password',
        'mail.reset.greeting' => 'Hello {username},',
        'mail.reset.intro' => 'Open the link below to choose a new password:',
        'mail.reset.validity' => 'The link is good for {minutes} minutes.',
        'mail.reset.ignore' => 'If you did not ask for this, ignore this mail.',
        'mail.confirm.greeting' => 'Hello {username},',
        'mail.confirm.validity' => 'The link is good for {hours} hours.',
        'mail.loginCode.subject' => 'Your anotoki sign-in code: {code}',
        'mail.loginCode.greeting' => 'Hello {username},',
        'mail.deletion.intro' => 'Your account will be deleted on {date}.',
    ];

    // ─── The shape ──────────────────────────────────────────────────────────

    public function testNotKeyByLanguageIsRefused(): void
    {
        foreach ([null, 'text', 12, ['a', 'b'], true] as $values) {
            self::assertSame(['invalid_value', []], $this->refused($values), json_encode($values));
        }
        self::assertSame([], $this->checked([]), 'nothing to save');
        self::assertSame(['invalid_value', ['key' => 'common.save']], $this->refused(['common.save' => 'Save']));
        self::assertSame(['invalid_value', ['key' => 'common.save']], $this->refused(['common.save' => false]), 'what a route puts for a list');
    }

    public function testUnknownKeysAreNamedEveryOne(): void
    {
        self::assertSame(
            ['unknown_key', ['key' => 'no.such', 'keys' => ['no.such', 'nor.this']]],
            $this->refused(['common.save' => ['sk' => 'Ulož'], 'no.such' => ['en' => 'x'], 'nor.this' => ['sk' => 'y']])
        );
        $many = [];
        for ($i = 0; $i < 25; $i++) {
            $many["no.key$i"] = ['en' => 'x'];
        }
        $refusal = StringCheck::changes($many, array_keys(self::ENGLISH), self::LANGUAGES, self::ENGLISH, new TranslationsConfig());
        self::assertInstanceOf(Refusal::class, $refusal);
        self::assertCount(25, $refusal->extra['keys']);
        self::assertStringContainsString('and 5 more', $refusal->message);
        self::assertSame(['unknown_key', ['key' => '12', 'keys' => ['12']]], $this->refused([12 => ['en' => 'x']]), 'a key PHP made a number of');
    }

    public function testAnUnknownLanguageAndWhatIsNotText(): void
    {
        self::assertSame(['unknown_language', ['key' => 'common.save', 'language' => 'hu']], $this->refused(['common.save' => ['sk' => 'Ulož', 'hu' => 'Mentés']]));
        self::assertSame(['unknown_language', ['key' => 'common.save', 'language' => str_repeat('x', 20)]], $this->refused(['common.save' => [str_repeat('x', 30) => 'a']]));
        foreach ([12, null, ['x'], "\xC3\x28"] as $value) {
            self::assertSame(['invalid_value', ['key' => 'common.save', 'language' => 'sk']], $this->refused(['common.save' => ['sk' => $value]]));
        }
    }

    // ─── Blank, English, length ─────────────────────────────────────────────

    public function testABlankStringDeletesItsLanguagesAndEnglishCannotBeBlank(): void
    {
        self::assertSame([['key' => 'common.save', 'language' => 'sk', 'value' => null]], $this->checked(['common.save' => ['sk' => '  ']]));
        self::assertSame([['key' => 'common.save', 'language' => 'sk', 'value' => null]], $this->checked(['common.save' => ['sk' => "\u{200B}"]]), 'a zero-width space is an empty field');
        self::assertSame(['fallback_required', ['key' => 'common.save', 'language' => 'en']], $this->refused(['common.save' => ['en' => ' ']]));
        self::assertSame(['fallback_required', ['key' => 'common.save', 'language' => 'en']], $this->refused(['common.save' => ['en' => "\u{2060}"]]));
    }

    public function testTrimmedAndCleanedAndSortedByKeyThenLanguage(): void
    {
        self::assertSame([
            ['key' => 'common.save', 'language' => 'en', 'value' => 'Keep'],
            ['key' => 'common.save', 'language' => 'sk', 'value' => 'Ulož'],
            ['key' => 'test.bye', 'language' => 'sk', 'value' => 'Ahoj'],
        ], $this->checked(['test.bye' => ['sk' => "\u{3000}Ahoj\x07 "], 'common.save' => ['sk' => 'Ulož', 'en' => ' Keep ']]));
    }

    public function testTooLongIsRefusedAndAMillionSpacesInsideAreTooLongNotEmpty(): void
    {
        self::assertSame(2000, Text::length($this->checked(['common.save' => ['sk' => str_repeat('ž', 2000)]])[0]['value']));
        self::assertSame(['invalid_value', ['key' => 'common.save', 'language' => 'sk']], $this->refused(['common.save' => ['sk' => str_repeat('ž', 2001)]]));

        // A body of 1 MiB has room for it: taken for an empty one it would be "saved", and the string gone.
        $endless = 'a' . str_repeat(' ', 1040000) . 'b';
        self::assertSame(['invalid_value', ['key' => 'common.save', 'language' => 'sk']], $this->refused(['common.save' => ['sk' => $endless]]));
        self::assertSame(['invalid_value', ['key' => 'common.save', 'language' => 'en']], $this->refused(['common.save' => ['en' => $endless]]), 'too long, not "English is required"');

        self::assertSame(['invalid_value', ['key' => 'common.save', 'language' => 'sk']], $this->refused(['common.save' => ['sk' => 'abcdef']], [], new TranslationsConfig(valueMax: 5)));
    }

    // ─── Placeholders ───────────────────────────────────────────────────────

    public function testAStrayBraceIsSaidFirstWithTheKeysOwnPlaceholder(): void
    {
        self::assertSame(['invalid_placeholder', ['key' => 'test.hello', 'language' => 'sk']], $this->refused(['test.hello' => ['sk' => 'Ahoj, {name} {meno} {']]), 'not "unknown": the brace is said first');
        self::assertSame(['invalid_placeholder', ['key' => 'test.hello', 'language' => 'en']], $this->refused(['test.hello' => ['en' => 'Hi {']]), 'not "changed"');
        self::assertSame(
            'The Slovak string of "test.step" has a { or } that is not part of a placeholder. A placeholder is written exactly as the English string has it, like {n}: no spaces, and its name is not translated.',
            $this->message(['test.step' => ['sk' => 'Krok { n } z {m}']])
        );
        self::assertStringContainsString('like {count}:', $this->message(['test.bye' => ['sk' => 'Dovidenia {']]), 'a key with none is shown the usual example');
    }

    public function testEnglishKeepsExactlyItsPlaceholdersAndATranslationAddsNone(): void
    {
        self::assertSame(['placeholder_changed', ['key' => 'test.hello', 'language' => 'en', 'placeholder' => 'name']], $this->refused(['test.hello' => ['en' => 'Hello']]));
        self::assertSame(['placeholder_changed', ['key' => 'test.hello', 'language' => 'en', 'placeholder' => 'who']], $this->refused(['test.hello' => ['en' => 'Hello, {name} and {who}']]));
        self::assertSame(['unknown_placeholder', ['key' => 'test.hello', 'language' => 'sk', 'placeholder' => 'meno']], $this->refused(['test.hello' => ['sk' => 'Ahoj, {meno}']]));
        self::assertCount(1, $this->checked(['test.hello' => ['sk' => 'Ahoj']]), 'a translation may leave one out');
        self::assertCount(1, $this->checked(['test.step' => ['sk' => 'Krok {m}, {n}']]), 'in any order');
        // A key without English yet: the English sent with it says.
        self::assertCount(2, $this->checked(['test.new' => ['en' => 'New {thing}', 'sk' => 'Nové {thing}']], ['test.new']));
        self::assertSame(['unknown_placeholder', ['key' => 'test.new', 'language' => 'sk', 'placeholder' => 'vec']], $this->refused(['test.new' => ['en' => 'New {thing}', 'sk' => 'Nové {vec}']], ['test.new']));
    }

    public function testARequiredPlaceholderIsKeptInEveryLanguageAfterTheBraceIsJudged(): void
    {
        $config = new TranslationsConfig(rules: [new RequiredPlaceholders(['login.continueTo' => ['app']])]);

        self::assertSame(['placeholder_missing', ['key' => 'login.continueTo', 'language' => 'sk', 'placeholder' => 'app']], $this->refused(['login.continueTo' => ['sk' => 'Prihlás sa a pokračuj']], [], $config));
        self::assertSame(['invalid_placeholder', ['key' => 'login.continueTo', 'language' => 'sk']], $this->refused(['login.continueTo' => ['sk' => 'Pokračuj do { app }']], [], $config), 'not "missing {app}": it is there, written wrongly');
        self::assertStringContainsString('like {app}:', $this->message(['login.continueTo' => ['sk' => 'Pokračuj do {aplikácie}']], $config));
        self::assertSame(['placeholder_missing', ['key' => 'login.continueTo', 'language' => 'en', 'placeholder' => 'app']], $this->refused(['login.continueTo' => ['en' => 'Sign in']], [], $config), 'before "changed"');
        self::assertCount(1, $this->checked(['login.continueTo' => ['sk' => 'Pokračuj do {app}']], [], $config));

        $this->expectException(InvalidArgumentException::class);
        new RequiredPlaceholders(['login.continueTo' => ['not a name']]);
    }

    // ─── The library's keys ─────────────────────────────────────────────────

    public function testALibraryKeyHasTheLibrarysPlaceholdersWhateverTheStoredEnglishSays(): void
    {
        $keys = ['anotoki.language.button', 'anotoki.language.label'];
        // An owner's old rewording lost {code}: the library's code still fills it.
        $english = ['anotoki.language.button' => 'Language: {name}'];

        self::assertSame(['name', 'code'], (new LibraryKeyRules())->placeholders('anotoki.language.button'));
        self::assertSame([], (new LibraryKeyRules())->placeholders('anotoki.language.label'));
        self::assertNull((new LibraryKeyRules())->placeholders('common.save'));

        self::assertCount(1, $this->checked(['anotoki.language.button' => ['sk' => 'Jazyk: {name} ({code})']], $keys, null, $english), 'Slovak may use {code}');
        self::assertSame(['placeholder_changed', ['key' => 'anotoki.language.button', 'language' => 'en', 'placeholder' => 'code']], $this->refused(['anotoki.language.button' => ['en' => 'Language: {name}']], $keys, null, $english));
        self::assertCount(1, $this->checked(['anotoki.language.button' => ['en' => 'Language: {name} ({code})']], $keys, null, $english));
        self::assertSame(['unknown_placeholder', ['key' => 'anotoki.language.label', 'language' => 'sk', 'placeholder' => 'x']], $this->refused(['anotoki.language.label' => ['sk' => 'Jazyk {x}']], $keys, null, ['anotoki.language.label' => 'Language {x}']));
        self::assertSame(LibraryWords::english('anotoki.language.button'), 'Language: {name} ({code})');
    }

    public function testTheLibrarysRulesComeBeforeASitesRuleForItsKeys(): void
    {
        $site = new class () extends \stdClass implements \Anotoki\Lib\Translations\KeyRules {
            public function placeholders(string $key): ?array
            {
                return ['own'];
            }

            public function checkFirst(string $key, string $code, string $text, string $languageName, array $placeholders): ?Refusal
            {
                return null;
            }

            public function check(string $key, string $code, string $text, string $languageName, array $placeholders): ?Refusal
            {
                return null;
            }
        };
        $config = new TranslationsConfig(rules: [$site]);

        self::assertSame(['unknown_placeholder', ['key' => 'anotoki.language.label', 'language' => 'sk', 'placeholder' => 'own']], $this->refused(['anotoki.language.label' => ['sk' => 'Jazyk {own}']], ['anotoki.language.label'], $config));
        self::assertCount(1, $this->checked(['test.bye' => ['sk' => 'Ahoj {own}']], [], $config), 'the site\'s rule for its own keys');
    }

    // ─── A site's rules: the IAM's mails, through KeyRules ─────────────────

    public function testAMailsWordsInTheIamsOrder(): void
    {
        foreach (['en', 'sk'] as $code) {
            self::assertSame(['invalid_placeholder', ['key' => 'mail.reset.greeting', 'language' => $code]], $this->mail(['mail.reset.greeting' => [$code => 'Hello { username },']]), 'not "missing {username}"');
            self::assertSame(['invalid_placeholder', ['key' => 'mail.loginCode.subject', 'language' => $code]], $this->mail(['mail.loginCode.subject' => [$code => 'Your code: {{code}}']]));
        }
        self::assertSame('invalid_value', $this->mail(['mail.reset.intro' => ['sk' => str_repeat('ž', 400) . '{']])[0], 'too long is said before the brace');
        self::assertSame('invalid_value', $this->mail(['mail.reset.intro' => ['sk' => str_repeat('あ', 300) . '{']])[0], 'in bytes too');
        self::assertSame('invalid_value', $this->mail(['mail.reset.intro' => ['sk' => "Otvor {\nodkaz"]])[0], 'and a line break first');
        self::assertSame(['unknown_placeholder', ['key' => 'mail.reset.intro', 'language' => 'sk', 'placeholder' => 'link']], $this->mail(['mail.reset.intro' => ['sk' => 'Otvor {link}:']]));
        self::assertStringContainsString('The English string of "mail.confirm.greeting"', $this->mailMessage(['mail.confirm.greeting' => ['en' => 'Hello {user name},']]));
        self::assertStringContainsString('like {username}:', $this->mailMessage(['mail.confirm.greeting' => ['en' => 'Hello {user name},']]), 'the one the code fills for that key');
    }

    public function testAMailsWordsOneShortLineExactlyTheCodesPlaceholdersAndNoAddress(): void
    {
        self::assertSame('Čau {username},', $this->mailChecked(['mail.reset.greeting' => ['sk' => 'Čau {username},']])[0]['value']);
        foreach (["Reset\r\nBcc: x@evil.test", "Reset\nBcc: x", "Reset\tnow", "Reset\u{2028}now", "Reset\u{0085}now"] as $subject) {
            self::assertSame('invalid_value', $this->mail(['mail.reset.subject' => ['sk' => $subject]])[0], json_encode($subject));
        }
        self::assertSame(150, Text::length($this->mailChecked(['mail.reset.subject' => ['sk' => str_repeat('ž', 150)]])[0]['value']));
        self::assertSame('invalid_value', $this->mail(['mail.reset.subject' => ['sk' => str_repeat('ž', 151)]])[0]);
        self::assertSame(400, Text::length($this->mailChecked(['mail.reset.intro' => ['sk' => str_repeat('ž', 400)]])[0]['value']));
        self::assertSame('invalid_value', $this->mail(['mail.reset.intro' => ['sk' => str_repeat('ž', 401)]])[0]);

        // The bytes: 900, less 400 for every {username}, less 10 for every {date}.
        self::assertSame(900, strlen($this->mailChecked(['mail.reset.ignore' => ['sk' => str_repeat('あ', 300)]])[0]['value']));
        self::assertSame('invalid_value', $this->mail(['mail.reset.ignore' => ['sk' => str_repeat('あ', 301)]])[0]);
        self::assertCount(1, $this->mailChecked(['mail.reset.greeting' => ['sk' => str_repeat('あ', 163) . ' {username}']]), '500 bytes with one username');
        self::assertSame('invalid_value', $this->mail(['mail.reset.greeting' => ['sk' => str_repeat('あ', 164) . ' {username}']])[0]);
        $thrice = 'Hello {username}, {username}, {username},';
        self::assertSame('invalid_value', $this->mail(['mail.reset.greeting' => ['sk' => $thrice]])[0]);
        self::assertStringContainsString('it has {username} 3 times', $this->mailMessage(['mail.reset.greeting' => ['sk' => $thrice]]));
        self::assertStringContainsString('which leaves none', $this->mailMessage(['mail.reset.greeting' => ['sk' => $thrice]]));
        self::assertStringContainsString('which leaves 100 bytes, and it has 103', $this->mailMessage(['mail.reset.greeting' => ['sk' => str_repeat('あ', 27) . ' {username} {username}']]));
        self::assertCount(1, $this->mailChecked(['mail.deletion.intro' => ['sk' => str_repeat('あ', 294) . '{date}']]), '888 bytes and a {date}: 890 is the room');
        self::assertSame('invalid_value', $this->mail(['mail.deletion.intro' => ['sk' => str_repeat('あ', 295) . '{date}']])[0], '891');
        self::assertSame(['unknown_placeholder', ['key' => 'mail.reset.intro', 'language' => 'sk', 'placeholder' => 'username']], $this->mail(['mail.reset.intro' => ['sk' => str_repeat('あ', 200) . ' {username} {username}']]), 'no room kept for a placeholder the key cannot use');

        foreach (['en', 'sk'] as $code) {
            self::assertSame(['placeholder_missing', ['key' => 'mail.reset.greeting', 'language' => $code, 'placeholder' => 'username']], $this->mail(['mail.reset.greeting' => [$code => 'Hello,']]));
            self::assertSame(['placeholder_missing', ['key' => 'mail.confirm.validity', 'language' => $code, 'placeholder' => 'hours']], $this->mail(['mail.confirm.validity' => [$code => 'Good for two days.']]));
            self::assertSame(['unknown_placeholder', ['key' => 'mail.reset.subject', 'language' => $code, 'placeholder' => 'code']], $this->mail(['mail.reset.subject' => [$code => 'Reset {code}']]));
        }
        self::assertSame('unknown_placeholder', $this->mail(['mail.reset.intro' => ['en' => 'Open {link}:']], ['mail.reset.intro' => 'Stored with {link} by hand'])[0], 'the code is the authority, not the stored English');

        foreach (['Open https://evil.test/reset', 'See HTTPS://EVIL.TEST', 'Go to www.evil.test', 'Go to WWW.evil.test', 'Write to help@evil.test', 'ftp://files.evil.test', 'javascript://x'] as $text) {
            self::assertSame(['address_in_mail', ['key' => 'mail.reset.intro', 'language' => 'sk']], $this->mail(['mail.reset.intro' => ['sk' => $text]]), $text);
        }
        self::assertCount(1, $this->mailChecked(['mail.reset.intro' => ['sk' => 'Otvor odkaz nižšie (www sa nepíše).']]));
    }

    // ─── The site's last check ──────────────────────────────────────────────

    public function testTheExtraCheckIsLastAndSeesWhatItJudges(): void
    {
        $seen = [];
        $config = new TranslationsConfig(extraCheck: function (string $field, string $text, array $about) use (&$seen): ?Refusal {
            $seen[] = [$field, $text, $about];

            return str_contains($text, 'Fandom')
                ? Refusal::invalid('names_another_site', 'It names another site ("fandom").', ($about['key'] ?? null) === null ? ['field' => $field] : ['key' => $about['key'], 'language' => $about['language'], 'found' => ['fandom']])
                : null;
        });

        self::assertSame(['names_another_site', ['key' => 'common.save', 'language' => 'sk', 'found' => ['fandom']]], $this->refused(['common.save' => ['sk' => 'Ulož na Fandom']], [], $config));
        self::assertSame([['value', 'Ulož na Fandom', ['key' => 'common.save', 'language' => 'sk', 'language_name' => 'Slovak']]], $seen);
        self::assertSame('invalid_placeholder', $this->refused(['common.save' => ['sk' => 'Fandom {']], [], $config)[0], 'after every other check');
        self::assertCount(1, $seen, 'not asked about a string already refused');

        $name = StringCheck::languageName('Fandom', 'The name in English', 'name', $config, 'fr');
        self::assertInstanceOf(Refusal::class, $name);
        self::assertSame(['field' => 'name'], $name->extra);
        self::assertSame(['name', 'Fandom', ['code' => 'fr']], $seen[1]);
    }

    public function testALanguagesNameIsOneLineOfOneToFiftyCharacters(): void
    {
        $config = new TranslationsConfig();
        self::assertSame('Français', StringCheck::languageName("  Français\u{A0}", 'The name', 'name', $config));
        foreach (['', '  ', "\u{200B}", str_repeat('a', 51), "Two\nlines", "Tab\there", 12, null] as $value) {
            $refusal = StringCheck::languageName($value, 'The name', 'name', $config);
            self::assertInstanceOf(Refusal::class, $refusal, json_encode($value));
            self::assertSame('invalid_language', $refusal->code);
        }
        self::assertSame(str_repeat('ž', 50), StringCheck::languageName(str_repeat('ž', 50), 'The name', 'name', $config));
    }

    // ─── Helpers ────────────────────────────────────────────────────────────

    /**
     * @param list<string> $extraKeys
     * @param array<string, string> $english
     * @return list<array{key: string, language: string, value: ?string}>
     */
    private function checked(mixed $values, array $extraKeys = [], ?TranslationsConfig $config = null, ?array $english = null): array
    {
        $result = StringCheck::changes($values, [...array_keys(self::ENGLISH), ...$extraKeys], self::LANGUAGES, $english ?? self::ENGLISH, $config ?? new TranslationsConfig());
        self::assertIsArray($result, $result instanceof Refusal ? $result->code . ': ' . $result->message : '');

        return $result;
    }

    /**
     * @param list<string> $extraKeys
     * @param array<string, string> $english
     * @return array{string, array<string, mixed>}
     */
    private function refused(mixed $values, array $extraKeys = [], ?TranslationsConfig $config = null, ?array $english = null): array
    {
        $result = StringCheck::changes($values, [...array_keys(self::ENGLISH), ...$extraKeys], self::LANGUAGES, $english ?? self::ENGLISH, $config ?? new TranslationsConfig());
        self::assertInstanceOf(Refusal::class, $result, 'accepted: ' . json_encode($result));
        self::assertSame(422, $result->status);
        self::assertNotSame('', $result->message);

        return [$result->code, $result->extra];
    }

    private function message(mixed $values, ?TranslationsConfig $config = null): string
    {
        $result = StringCheck::changes($values, array_keys(self::ENGLISH), self::LANGUAGES, self::ENGLISH, $config ?? new TranslationsConfig());
        self::assertInstanceOf(Refusal::class, $result);

        return $result->message;
    }

    private function mailConfig(): TranslationsConfig
    {
        return new TranslationsConfig(serverNamespaces: ['mail'], rules: [new MailLikeRules(self::MAIL_KEYS)]);
    }

    /**
     * @param array<string, string> $english
     * @return array{string, array<string, mixed>}
     */
    private function mail(array $values, array $english = []): array
    {
        return $this->refused($values, array_keys(self::MAIL_KEYS), $this->mailConfig(), $english + self::MAIL_ENGLISH + self::ENGLISH);
    }

    /** @return list<array{key: string, language: string, value: ?string}> */
    private function mailChecked(array $values): array
    {
        return $this->checked($values, array_keys(self::MAIL_KEYS), $this->mailConfig(), self::MAIL_ENGLISH + self::ENGLISH);
    }

    private function mailMessage(array $values): string
    {
        $result = StringCheck::changes($values, array_keys(self::MAIL_KEYS), self::LANGUAGES, self::MAIL_ENGLISH, $this->mailConfig());
        self::assertInstanceOf(Refusal::class, $result);

        return $result->message;
    }
}
