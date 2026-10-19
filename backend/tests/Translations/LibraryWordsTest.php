<?php

declare(strict_types=1);

namespace Anotoki\Lib\Tests\Translations;

use Anotoki\Lib\Translations\KeyRules;
use Anotoki\Lib\Translations\LibraryWords;
use Anotoki\Lib\Translations\Placeholders;
use Anotoki\Lib\Translations\Rules\LibraryKeyRules;
use Anotoki\Lib\Translations\TranslationsConfig;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/** The library's own words (backend/resources/library-words.json) and the configuration a site gives. */
final class LibraryWordsTest extends TestCase
{
    private string $folder;

    protected function setUp(): void
    {
        $this->folder = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'anotoki_lib_words_' . bin2hex(random_bytes(6));
        mkdir($this->folder);
    }

    protected function tearDown(): void
    {
        foreach (glob($this->folder . '/*') ?: [] as $file) {
            unlink($file);
        }
        rmdir($this->folder);
    }

    public function testTheShippedWordsAreWholeInEnglishAndSlovakWithTheSamePlaceholders(): void
    {
        $words = LibraryWords::all();

        self::assertSame(
            [
                'anotoki.language.label',
                'anotoki.language.button',
                'anotoki.language.notLoaded',
                'anotoki.language.notSaved',
                'anotoki.siteStatus.updatingTitle',
                'anotoki.siteStatus.updatingText',
                'anotoki.siteStatus.unavailableTitle',
                'anotoki.siteStatus.unavailableText',
                'anotoki.siteStatus.notSetUpTitle',
                'anotoki.siteStatus.notSetUpText',
                'anotoki.siteStatus.openSetup',
                'anotoki.siteStatus.tryAgain',
                'anotoki.siteStatus.signIn',
                // The kit's own (frontend/projects/lib/ui): its dialogs, notifications, fields, page numbers, ...
                'anotoki.ui.close',
                'anotoki.ui.dismiss',
                'anotoki.ui.notifications',
                'anotoki.ui.cancel',
                'anotoki.ui.confirm',
                'anotoki.ui.retry',
                'anotoki.ui.optional',
                'anotoki.ui.loading',
                'anotoki.ui.showPassword',
                'anotoki.ui.hidePassword',
                'anotoki.ui.copy',
                'anotoki.ui.copied',
                'anotoki.ui.copyToClipboard',
                'anotoki.ui.copiedToClipboard',
                'anotoki.ui.copyFailed',
                'anotoki.ui.qrCode',
                'anotoki.ui.or',
                'anotoki.ui.pages',
                'anotoki.ui.previous',
                'anotoki.ui.next',
                'anotoki.ui.range',
                'anotoki.ui.pageOf',
                'anotoki.ui.nothingToShow',
                // ... its top bar ...
                'anotoki.topbar.skipToContent',
                'anotoki.topbar.sections',
                'anotoki.topbar.phoneMenu',
                'anotoki.topbar.menuButton',
                'anotoki.topbar.menu',
                'anotoki.topbar.roleAdmin',
                'anotoki.topbar.roleEditor',
                'anotoki.topbar.account',
                'anotoki.topbar.admin',
                'anotoki.topbar.signIn',
                'anotoki.topbar.signOut',
                'anotoki.topbar.saving',
                // (what a link's number counts, from 006) ...
                'anotoki.topbar.linkCount',
                // ... and its theme switch.
                'anotoki.theme.label',
                'anotoki.theme.light',
                'anotoki.theme.dark',
                'anotoki.theme.auto',
                'anotoki.theme.autoHint',
                'anotoki.theme.notSaved',
                // The auth module's sign-in page (frontend/projects/lib/auth: <anotoki-auth-callback>, <anotoki-sign-in-failure>), from 003.
                'anotoki.signIn.signingIn',
                'anotoki.signIn.failedTitle',
                'anotoki.signIn.notCompleted',
                'anotoki.signIn.expired',
                'anotoki.signIn.storageUnavailable',
                'anotoki.signIn.unavailable',
                'anotoki.signIn.failed',
                'anotoki.signIn.retry',
                'anotoki.signIn.back',
                // The visitors' feedback form (frontend/projects/lib/feedback: <anotoki-feedback-form>), from 004.
                'anotoki.feedback.title',
                'anotoki.feedback.lead',
                'anotoki.feedback.kind',
                'anotoki.feedback.kindBug',
                'anotoki.feedback.kindIdea',
                'anotoki.feedback.kindOther',
                'anotoki.feedback.section',
                'anotoki.feedback.sectionNone',
                'anotoki.feedback.subject',
                'anotoki.feedback.message',
                'anotoki.feedback.messageHint',
                'anotoki.feedback.email',
                'anotoki.feedback.emailHint',
                'anotoki.feedback.anonymous',
                'anotoki.feedback.anonymousHint',
                'anotoki.feedback.send',
                'anotoki.feedback.sending',
                'anotoki.feedback.thanks',
                'anotoki.feedback.thanksText',
                'anotoki.feedback.another',
                'anotoki.feedback.messageRequired',
                'anotoki.feedback.subjectRequired',
                'anotoki.feedback.tooLong',
                'anotoki.feedback.emailInvalid',
                'anotoki.feedback.tooManyHour',
                'anotoki.feedback.tooManyDay',
                'anotoki.feedback.unavailable',
                'anotoki.feedback.signInRequired',
                'anotoki.feedback.failed',
                'anotoki.feedback.network',
                'anotoki.feedback.honeypot',
                // (its Clear and the name a screen reader says for it, from 013)
                'anotoki.feedback.clear',
                'anotoki.feedback.clearName',
                // The legal pages' footer links (frontend/projects/lib/legal: <anotoki-legal-links>), from 005 ...
                'anotoki.legalLinks.label',
                'anotoki.legalLinks.terms',
                'anotoki.legalLinks.privacy',
                'anotoki.legalLinks.contact',
                // (About and Support before them, from 013)
                'anotoki.legalLinks.about',
                'anotoki.legalLinks.support',
                // ... and the legal pages themselves (frontend/projects/lib/legal/pages: Terms, Privacy, Contact), from 005.
                'anotoki.legal.updated',
                'anotoki.legal.onThisPage',
                'anotoki.legal.whatFor',
                'anotoki.legal.howLong',
                'anotoki.legal.toBeNamed',
                'anotoki.legal.copyAddress',
                'anotoki.legal.accountPage',
                'anotoki.legal.accountTitle',
                'anotoki.legal.sectionContact',
                'anotoki.legal.otherWays',
                'anotoki.legal.fanHoyoverse',
                'anotoki.legal.termsTitle',
                'anotoki.legal.termsLead',
                'anotoki.legal.termsWhatTitle',
                'anotoki.legal.termsWhatText',
                'anotoki.legal.termsAccountText',
                'anotoki.legal.termsAccountTextIam',
                'anotoki.legal.termsAccountCare',
                'anotoki.legal.termsAgeTitle',
                'anotoki.legal.termsAgeText',
                'anotoki.legal.termsUseTitle',
                'anotoki.legal.termsUseText',
                'anotoki.legal.termsSendTitle',
                'anotoki.legal.termsSendText',
                'anotoki.legal.termsAvailabilityTitle',
                'anotoki.legal.termsAvailabilityText',
                'anotoki.legal.termsChangesText',
                'anotoki.legal.termsWarrantyTitle',
                'anotoki.legal.termsWarrantyText',
                'anotoki.legal.termsFanTitle',
                'anotoki.legal.termsLawTitle',
                'anotoki.legal.termsLawText',
                'anotoki.legal.termsContactText',
                'anotoki.legal.privacyTitle',
                'anotoki.legal.privacyLead',
                'anotoki.legal.privacyWhoTitle',
                'anotoki.legal.privacyWhoText',
                'anotoki.legal.privacyWhoContact',
                'anotoki.legal.privacyKeepsTitle',
                'anotoki.legal.privacyKeepsText',
                'anotoki.legal.visitorsName',
                'anotoki.legal.visitorsWhy',
                'anotoki.legal.feedbackName',
                'anotoki.legal.feedbackWhat',
                'anotoki.legal.feedbackWhy',
                'anotoki.legal.feedbackKept',
                'anotoki.legal.errorLogName',
                'anotoki.legal.errorLogWhat',
                'anotoki.legal.errorLogWhy',
                'anotoki.legal.errorLogKept',
                'anotoki.legal.auditLogName',
                'anotoki.legal.auditLogWhat',
                'anotoki.legal.auditLogWhy',
                'anotoki.legal.auditLogKept',
                'anotoki.legal.backupsName',
                'anotoki.legal.backupsWhat',
                'anotoki.legal.backupsWherePlain',
                'anotoki.legal.backupsWhereEncrypted',
                'anotoki.legal.backupsWhy',
                'anotoki.legal.backupsKept',
                'anotoki.legal.privacyAccountText',
                'anotoki.legal.privacyAccountLink',
                'anotoki.legal.privacyAccountRecord',
                'anotoki.legal.privacyAccountTextIam',
                'anotoki.legal.privacyStorageTitle',
                'anotoki.legal.privacyStorageText',
                'anotoki.legal.storageCookie',
                'anotoki.legal.storageLocal',
                'anotoki.legal.storageSession',
                'anotoki.legal.storageHintPurpose',
                'anotoki.legal.storageHintKept',
                'anotoki.legal.storageSignInPurpose',
                'anotoki.legal.storageSignInKept',
                'anotoki.legal.storageThemePurpose',
                'anotoki.legal.storageLanguagePurpose',
                'anotoki.legal.storageUntilCleared',
                'anotoki.legal.storageVisitorPurpose',
                'anotoki.legal.storageVisitorKept',
                'anotoki.legal.privacyAnalyticsTitle',
                'anotoki.legal.privacyAnalyticsText',
                'anotoki.legal.privacyAnalyticsNone',
                'anotoki.legal.privacyOthersTitle',
                'anotoki.legal.privacyOthersText',
                'anotoki.legal.hostingName',
                'anotoki.legal.hostingRole',
                'anotoki.legal.cloudflareRole',
                'anotoki.legal.googleRole',
                'anotoki.legal.mailName',
                'anotoki.legal.mailRole',
                'anotoki.legal.privacyHowLongTitle',
                'anotoki.legal.privacyHowLongText',
                'anotoki.legal.privacyRightsTitle',
                'anotoki.legal.privacyRightsText',
                'anotoki.legal.privacyRightsDelete',
                'anotoki.legal.privacyRightsComplaint',
                'anotoki.legal.authority',
                'anotoki.legal.privacyChangesTitle',
                'anotoki.legal.privacyChangesText',
                'anotoki.legal.privacyContactText',
                'anotoki.legal.contactTitle',
                'anotoki.legal.contactLead',
                'anotoki.legal.contactFeedbackTitle',
                'anotoki.legal.contactFeedbackText',
                'anotoki.legal.contactFeedbackButton',
                'anotoki.legal.contactFeedbackFailed',
                'anotoki.legal.contactEmailTitle',
                'anotoki.legal.contactEmailTitleAlone',
                'anotoki.legal.contactEmailText',
                'anotoki.legal.contactEmailTextAlone',
                'anotoki.legal.contactEmailAccount',
                'anotoki.legal.contactDeleteTitle',
                'anotoki.legal.contactDeleteText',
                'anotoki.legal.contactDeleteEverywhere',
                'anotoki.legal.contactDeleteEverywhereIam',
                'anotoki.legal.contactResponseTitle',
                'anotoki.legal.contactResponseText',
                'anotoki.legal.contactAboutTitle',
                'anotoki.legal.contactAboutText',
                // The kit's pieces of 0.6.0, each read by the piece itself (frontend/projects/lib/ui/chips, /progress, /stepper), from 007.
                'anotoki.chips.remove',
                'anotoki.progress.count',
                'anotoki.stepper.stepOf',
                'anotoki.stepper.done',
                // The tabs' arrows (frontend/projects/lib/ui/tabs, read by the tabs themselves), from 008.
                'anotoki.tabs.scrollBack',
                'anotoki.tabs.scrollForward',
                // The kit's input pieces (frontend/projects/lib/ui/date-field, /color-field, /file-picker, /combobox, /rich-text, each
                // read by the piece itself), from 009.
                'anotoki.dateField.choose',
                'anotoki.dateField.previousMonth',
                'anotoki.dateField.nextMonth',
                'anotoki.dateField.invalid',
                'anotoki.dateField.tooEarly',
                'anotoki.dateField.tooLate',
                'anotoki.colorField.picker',
                'anotoki.colorField.swatches',
                'anotoki.colorField.invalid',
                'anotoki.filePicker.chooseFile',
                'anotoki.filePicker.chooseFiles',
                'anotoki.filePicker.dropFile',
                'anotoki.filePicker.dropFiles',
                'anotoki.filePicker.tooLarge',
                'anotoki.filePicker.wrongType',
                'anotoki.filePicker.oneOnly',
                'anotoki.filePicker.remove',
                'anotoki.filePicker.chosen',
                'anotoki.combobox.noMatches',
                'anotoki.combobox.more',
                'anotoki.combobox.chosen',
                'anotoki.richText.toolbar',
                'anotoki.richText.bold',
                'anotoki.richText.italic',
                'anotoki.richText.underline',
                'anotoki.richText.strike',
                'anotoki.richText.bulletList',
                'anotoki.richText.orderedList',
                'anotoki.richText.indent',
                'anotoki.richText.outdent',
                'anotoki.richText.link',
                'anotoki.richText.clear',
                'anotoki.richText.undo',
                'anotoki.richText.redo',
                // The family's footer (frontend/projects/lib/footer: <anotoki-site-footer>, read by the footer itself), from 012.
                'anotoki.footer.version',
                'anotoki.footer.whatsNew',
                'anotoki.footer.feedback',
                'anotoki.footer.fanHoyoverse',
                // The About and Support pages (frontend/projects/lib/legal/about, /support, each read by the page itself), from 013.
                'anotoki.about.title',
                'anotoki.about.nameTitle',
                'anotoki.about.nameText',
                'anotoki.about.authorTitle',
                'anotoki.about.authorText',
                'anotoki.about.projectsTitle',
                'anotoki.about.japaneseName',
                'anotoki.about.japaneseText',
                'anotoki.about.pianoName',
                'anotoki.about.pianoText',
                'anotoki.about.genshinName',
                'anotoki.about.genshinText',
                'anotoki.about.builderName',
                'anotoki.about.builderText',
                'anotoki.about.surveyName',
                'anotoki.about.surveyText',
                'anotoki.about.fanLine',
                'anotoki.about.closing',
                'anotoki.about.closingLink',
                'anotoki.support.title',
                'anotoki.support.text',
                'anotoki.support.button',
                'anotoki.support.thanks',
            ],
            LibraryWords::keys(),
        );
        foreach ($words as $key => $entry) {
            self::assertSame(['description', 'en', 'sk'], array_keys($entry), $key);
            self::assertSame(Placeholders::names($entry['en']), Placeholders::names($entry['sk']), "$key: Slovak fills what English does");
            self::assertFalse(Placeholders::strayBrace($entry['en']) || Placeholders::strayBrace($entry['sk']), $key);
            self::assertStringEndsWith(
                Placeholders::names($entry['en']) === [] ? 'No placeholders.' : 'Placeholders: {' . implode('}, {', Placeholders::names($entry['en'])) . '}.',
                $entry['description'],
                "$key: the family's description",
            );
        }
        self::assertSame('Language: {name} ({code})', LibraryWords::english('anotoki.language.button'));
        self::assertSame(['name', 'code'], LibraryWords::placeholders('anotoki.language.button'));
        self::assertSame(['code'], LibraryWords::placeholders('anotoki.signIn.failed'));
        self::assertSame(['count'], LibraryWords::placeholders('anotoki.topbar.linkCount'));
        self::assertSame(['max'], LibraryWords::placeholders('anotoki.feedback.tooLong'));
        self::assertSame(['site', 'operator'], LibraryWords::placeholders('anotoki.legal.termsWarrantyText'));
        self::assertSame(['daily', 'beforeUpdate', 'beforeRestore'], LibraryWords::placeholders('anotoki.legal.backupsKept'));
        self::assertSame(['name'], LibraryWords::placeholders('anotoki.chips.remove'));
        self::assertSame(['value', 'max'], LibraryWords::placeholders('anotoki.progress.count'));
        self::assertSame(['current', 'total'], LibraryWords::placeholders('anotoki.stepper.stepOf'));
        self::assertSame([], LibraryWords::placeholders('anotoki.tabs.scrollForward'));
        self::assertSame('More tabs', LibraryWords::english('anotoki.tabs.scrollForward'));
        self::assertSame(['field'], LibraryWords::placeholders('anotoki.dateField.choose'));
        self::assertSame(['example'], LibraryWords::placeholders('anotoki.dateField.invalid'));
        self::assertSame(['date'], LibraryWords::placeholders('anotoki.dateField.tooEarly'));
        self::assertSame([], LibraryWords::placeholders('anotoki.colorField.invalid'));
        self::assertSame(['name', 'size', 'max'], LibraryWords::placeholders('anotoki.filePicker.tooLarge'));
        self::assertSame(['name', 'types'], LibraryWords::placeholders('anotoki.filePicker.wrongType'));
        self::assertSame(['names'], LibraryWords::placeholders('anotoki.filePicker.chosen'));
        self::assertSame(['count'], LibraryWords::placeholders('anotoki.combobox.more'));
        self::assertSame(['field'], LibraryWords::placeholders('anotoki.combobox.chosen'));
        self::assertSame('Bulleted list', LibraryWords::english('anotoki.richText.bulletList'));
        self::assertSame(['version'], LibraryWords::placeholders('anotoki.footer.version'));
        self::assertSame([], LibraryWords::placeholders('anotoki.footer.fanHoyoverse'));
        self::assertSame('Feedback', LibraryWords::english('anotoki.footer.feedback'));
        self::assertSame(['word', 'reading'], LibraryWords::placeholders('anotoki.about.nameText'));
        self::assertSame(['support'], LibraryWords::placeholders('anotoki.about.closing'));
        self::assertSame([], LibraryWords::placeholders('anotoki.support.text'));
        self::assertSame('Podporiť', LibraryWords::all()['anotoki.legalLinks.support']['sk'], 'a verb, never the noun');
        self::assertSame('Clear', LibraryWords::english('anotoki.feedback.clear'));
        self::assertStringStartsWith('Clear', (string) LibraryWords::english('anotoki.feedback.clearName'), 'its name starts with its words');
        self::assertNull(LibraryWords::english('common.save'));
        self::assertNull(LibraryWords::placeholders('anotoki.no.such'));
        self::assertTrue(LibraryWords::isLibraryKey('anotoki.x.y'));
        self::assertFalse(LibraryWords::isLibraryKey('anotokix.y'));
    }

    public function testTheAngularHalfsBuiltInWordsAreTheseWordForWord(): void
    {
        // Generated from the JSON a namespace at a time by frontend/scripts/library-words.mjs (`bun run words`) and read
        // here as text: the kit's in frontend/projects/lib/ui/config/src/library-words.ts, every other module's in
        // frontend/projects/lib/words/<namespace>/public-api.ts (@anotoki/lib/words/<namespace>), each key in one file.
        $angular = dirname(__DIR__, 3) . '/frontend/projects/lib';
        $files = [$angular . '/ui/config/src/library-words.ts', ...glob($angular . '/words/*/public-api.ts') ?: []];
        self::assertGreaterThan(1, count($files), 'the kit\'s words, and the other modules\' beside them');
        foreach (['en' => 'EN', 'sk' => 'SK'] as $language => $constant) {
            $generated = [];
            foreach ($files as $file) {
                $source = str_replace("\r\n", "\n", (string) file_get_contents($file));
                self::assertSame(1, preg_match('/^const ' . $constant . '\b[^=]*= \{\n(.*?)\n\}/ms', $source, $block), "$language: $file");
                preg_match_all("/^  '([^']+)': '((?:[^'\\\\]|\\\\.)*)',$/m", $block[1], $entries, PREG_SET_ORDER);
                $namespaces = [];
                foreach ($entries as [, $key, $text]) {
                    self::assertArrayNotHasKey($key, $generated, "$key: in one file alone");
                    $generated[$key] = stripslashes($text);
                    $namespaces[explode('.', $key)[1]] = true;
                }
                if (!str_ends_with($file, '/library-words.ts')) {
                    self::assertCount(1, $namespaces, "$file: a module's words entry point holds its one namespace");
                }
            }
            $expected = array_map(static fn(array $entry): string => $entry[$language], LibraryWords::all());
            ksort($expected, SORT_STRING);
            ksort($generated, SORT_STRING);
            self::assertSame($expected, $generated, "$language: run `bun run words` in frontend/");
        }
    }

    public function testAFileThatIsNotWholeIsRefusedLoudly(): void
    {
        $cases = [
            'missing' => [null, 'are missing'],
            'not JSON' => ['{', 'is not JSON'],
            'no keys' => ['{"keys": {}}', 'does not hold'],
            'a key outside the namespace' => ['{"keys": {"common.save": {"description": "", "en": "Save"}}}', 'is not a library key'],
            'no English' => ['{"keys": {"anotoki.a.b": {"description": "", "sk": "Uložiť"}}}', 'needs a description and an English string'],
            'something else' => ['{"keys": {"anotoki.a.b": {"description": "", "en": "Save", "comment": "x"}}}', 'which is neither'],
        ];
        foreach ($cases as $case => [$json, $says]) {
            $file = "{$this->folder}/" . md5($case) . '.json';
            if ($json !== null) {
                file_put_contents($file, $json);
            }
            try {
                LibraryWords::read($file);
                self::fail("read: $case");
            } catch (RuntimeException $e) {
                self::assertStringContainsString($says, $e->getMessage(), $case);
            }
        }
    }

    public function testTheConfigurationRefusesWhatCannotWork(): void
    {
        $refused = function (callable $make, string $why): void {
            try {
                $make();
                self::fail("Not refused: $why");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        };

        $refused(fn() => new TranslationsConfig(releasedLanguages: ['sk']), 'released without English');
        $refused(fn() => new TranslationsConfig(releasedLanguages: ['en', 'EN']), 'a released language that is no code');
        $refused(fn() => new TranslationsConfig(serverNamespaces: ['mail.x']), 'a namespace that is none');
        $refused(fn() => new TranslationsConfig(serverNamespaces: ['anotoki']), 'the library\'s namespace');
        $refused(fn() => new TranslationsConfig(serverNamespaces: ['keys']), 'a field of the summary');
        $refused(fn() => new TranslationsConfig(rules: ['not a rule']), 'a rule that is none');
        $refused(fn() => new TranslationsConfig(valueMax: 70000), 'longer than a clip can be');
        $refused(fn() => new TranslationsConfig(languagesMax: 0), 'no language at all');

        $config = new TranslationsConfig(serverNamespaces: ['mail']);
        self::assertTrue($config->isServerKey('mail.reset.subject'));
        self::assertFalse($config->isServerKey('mailbox.title'));
        self::assertInstanceOf(LibraryKeyRules::class, $config->allRules()[0], 'the library\'s rules first');
        self::assertContainsOnlyInstancesOf(KeyRules::class, $config->allRules());
    }
}
