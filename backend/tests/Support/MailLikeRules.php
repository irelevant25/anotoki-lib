<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Support;

use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Translations\KeyRules;
use Anotoki\Lib\Translations\Placeholders;
use Anotoki\Lib\Translations\Text;

/**
 * The IAM's mail rules (anotoki-iam api/translations.php, translationsCheck()) written as a KeyRules - what
 * the IAM will keep in its own code. Here it shows that the interface holds them in the IAM's order: one
 * line, the length, the bytes (checkFirst); the family's brace check; exactly the code's placeholders, no
 * address (check).
 */
final class MailLikeRules implements KeyRules
{
    /** @param array<string, list<string>> $placeholders  MAIL_KEYS: each mail key's placeholders */
    public function __construct(private readonly array $placeholders)
    {
    }

    public function placeholders(string $key): ?array
    {
        return str_starts_with($key, 'mail.') ? ($this->placeholders[$key] ?? []) : null;
    }

    public function checkFirst(string $key, string $code, string $text, string $languageName, array $placeholders): ?Refusal
    {
        if (!str_starts_with($key, 'mail.')) {
            return null;
        }
        $about = ['key' => $key, 'language' => $code];

        if (preg_match('/[\r\n\t\x{0085}\x{2028}\x{2029}]/u', $text) === 1) {
            return Refusal::invalid('invalid_value', "The $languageName string of \"$key\" must be one line: a mail's words have no line breaks or tabs", $about);
        }
        $max = str_ends_with($key, '.subject') ? 150 : 400;
        if (Text::length($text) > $max) {
            return Refusal::invalid('invalid_value', "The $languageName string of \"$key\" is longer than $max characters", $about);
        }
        $named = in_array('username', $placeholders, true) ? substr_count($text, '{username}') : 0;
        $dated = in_array('date', $placeholders, true) ? substr_count($text, '{date}') : 0;
        $room = 900 - $named * 400 - $dated * 10;
        if (strlen($text) > $room) {
            return Refusal::invalid(
                'invalid_value',
                $named > 1
                    ? "The $languageName string of \"$key\" is too long for one line of a mail: it has {username} $named times, and room for the longest name there can be is kept for each - "
                        . ($room > 0 ? "which leaves $room bytes, and it has " . strlen($text) : 'which leaves none')
                    : "The $languageName string of \"$key\" is too long for one line of a mail: at most $room bytes, and its letters take more than one each - it has " . strlen($text),
                $about
            );
        }

        return null;
    }

    public function check(string $key, string $code, string $text, string $languageName, array $placeholders): ?Refusal
    {
        if (!str_starts_with($key, 'mail.')) {
            return null;
        }
        $about = ['key' => $key, 'language' => $code];
        $used = Placeholders::names($text);

        $missing = array_values(array_diff($placeholders, $used));
        if ($missing !== []) {
            return Refusal::invalid('placeholder_missing', "The $languageName string of \"$key\" must keep {{$missing[0]}}: the IAM puts a value there", $about + ['placeholder' => $missing[0]]);
        }
        $unknown = array_values(array_diff($used, $placeholders));
        if ($unknown !== []) {
            return Refusal::invalid('unknown_placeholder', "The $languageName string of \"$key\" cannot use {{$unknown[0]}}: the IAM has no value for it there", $about + ['placeholder' => $unknown[0]]);
        }
        if (preg_match('~(://|\bwww\.|@)~i', $text) === 1) {
            return Refusal::invalid('address_in_mail', "The $languageName string of \"$key\" reads as if it had an address in it. A mail's only link is the one the IAM puts in.", $about);
        }

        return null;
    }
}
