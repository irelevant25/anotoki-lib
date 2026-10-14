import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { LanguageSwitcherComponent, ThemeToggleComponent, TopBarComponent } from '@anotoki/lib/shell';
import {
  AlertComponent,
  AvatarComponent,
  BadgeComponent,
  ButtonComponent,
  CardComponent,
  EmptyStateComponent,
  ErrorStateComponent,
  IconComponent,
  PageHeaderComponent,
  SegmentedComponent,
  SegmentedOption,
  SpinnerComponent,
} from '@anotoki/lib/ui';
import { ChipComponent, ChipGroupComponent, ChipItem, ChipListComponent, ChipOption } from '@anotoki/lib/ui/chips';
import { CopyButtonComponent } from '@anotoki/lib/ui/copy';
import { ConfirmService, DialogComponent } from '@anotoki/lib/ui/dialog';
import { AccordionComponent, DisclosureComponent, DisclosurePanelDirective } from '@anotoki/lib/ui/disclosure';
import { DrawerComponent } from '@anotoki/lib/ui/drawer';
import { CheckboxComponent, CodeInputComponent, PasswordFieldComponent, RadioGroupComponent, SwitchComponent, TextFieldComponent, TextareaComponent } from '@anotoki/lib/ui/forms';
import { LabelledGroupComponent } from '@anotoki/lib/ui/labelled-group';
import { LinkCardComponent } from '@anotoki/lib/ui/link-card';
import { MenuComponent, MenuItemComponent, MenuSeparatorComponent, MenuTriggerDirective, PopoverComponent, PopoverTriggerDirective } from '@anotoki/lib/ui/menu';
import { PaginationComponent } from '@anotoki/lib/ui/pagination';
import { ProgressBarComponent } from '@anotoki/lib/ui/progress';
import { QrCodeComponent } from '@anotoki/lib/ui/qr';
// The select alone (0.6.0): what a site draws where the first load is (the piano's box in Piano's bar) - not every field.
import { SelectComponent } from '@anotoki/lib/ui/select';
import { SideNavComponent, SideNavGroup, SideNavTriggerDirective } from '@anotoki/lib/ui/side-nav';
import { StatTileComponent, StatTilesComponent } from '@anotoki/lib/ui/stat-tiles';
import { StepDotsComponent, StepItem, StepperComponent } from '@anotoki/lib/ui/stepper';
import { LinkTabItem, LinkTabsComponent, TabItem, TabsComponent } from '@anotoki/lib/ui/tabs';
import { ToastService } from '@anotoki/lib/ui/toast';
import { TooltipDirective } from '@anotoki/lib/ui/tooltip';

/** Every piece of the kit, on one page, in the states a person meets. */
@Component({
  selector: 'show-gallery',
  imports: [
    AccordionComponent,
    AlertComponent,
    AvatarComponent,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    CheckboxComponent,
    ChipComponent,
    ChipGroupComponent,
    ChipListComponent,
    CodeInputComponent,
    CopyButtonComponent,
    DialogComponent,
    DisclosureComponent,
    DisclosurePanelDirective,
    DrawerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    LabelledGroupComponent,
    LanguageSwitcherComponent,
    LinkCardComponent,
    LinkTabsComponent,
    MenuComponent,
    MenuItemComponent,
    MenuSeparatorComponent,
    MenuTriggerDirective,
    PageHeaderComponent,
    PaginationComponent,
    PasswordFieldComponent,
    PopoverComponent,
    PopoverTriggerDirective,
    ProgressBarComponent,
    QrCodeComponent,
    RadioGroupComponent,
    SegmentedComponent,
    SelectComponent,
    SideNavComponent,
    SideNavTriggerDirective,
    SpinnerComponent,
    StatTileComponent,
    StatTilesComponent,
    StepDotsComponent,
    StepperComponent,
    SwitchComponent,
    TabsComponent,
    TextFieldComponent,
    TextareaComponent,
    ThemeToggleComponent,
    TooltipDirective,
    TopBarComponent,
  ],
  templateUrl: './gallery.component.html',
  styleUrl: './gallery.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GalleryComponent {
  protected readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  protected readonly name = signal('Mira');
  protected readonly email = signal('mira@');
  protected readonly bio = signal('');
  protected readonly password = signal('');
  protected readonly language = signal('sk');
  protected readonly keep = signal(true);
  protected readonly news = signal(false);
  protected readonly plan = signal('free');
  protected readonly code = signal('1234');
  protected readonly tab = signal('all');
  protected readonly page = signal(2);
  protected readonly view = signal('list');
  protected readonly dialog = signal(false);
  protected readonly wideDialog = signal(false);
  protected readonly drawer = signal(false);
  protected readonly loading = signal(false);

  protected readonly options = [
    { value: 'en', label: 'English' },
    { value: 'sk', label: 'Slovenčina', lang: 'sk' },
  ];
  protected readonly plans = [
    { value: 'free', label: 'Free', hint: 'For one person' },
    { value: 'team', label: 'Team', hint: 'For a group that shares the surveys' },
  ];
  protected readonly tabs = [
    { id: 'all', label: 'All', count: 12 },
    { id: 'admins', label: 'Administrators', count: 2 },
    { id: 'blocked', label: 'Blocked' },
  ];
  protected readonly views = [
    { value: 'list', label: 'List' },
    { value: 'cards', label: 'Cards' },
    { value: 'table', label: 'Table' },
  ];
  protected readonly adminLinks = [
    { id: 'translations', label: 'Translations', path: '/admin/translations' },
    { id: 'languages', label: 'Languages', path: '/admin/languages' },
    { id: 'migrations', label: 'Migrations', path: '/migrations' },
  ];

  // ── 0.6.0's pieces ──────────────────────────────────────────────────────────

  /** Choice chips, one at a time: a stage's English name says it is English (on a Slovak page). */
  protected readonly stages: ChipOption[] = [
    { value: 'all', label: 'Everything', note: 48 },
    { value: 'apprentice', label: 'Apprentice', lang: 'en', note: 12 },
    { value: 'guru', label: 'Guru', lang: 'en', note: 0, disabled: true },
    { value: 'master', label: 'Master', lang: 'en', note: 36 },
  ];
  protected readonly stage = signal<string | null>('apprentice');
  /** Several at once: the lessons, one with nothing learned yet. */
  protected readonly lessonOptions: ChipOption[] = Array.from({ length: 12 }, (_, index) => ({ value: `L${index + 1}`, label: `L${index + 1}`, disabled: index === 10 }));
  protected readonly lessons = signal<readonly string[]>(['L2', 'L5']);
  protected readonly pyro = signal(true);
  /** Removable chips: the answers a learner added (one long, one the learner may not take away). */
  protected readonly answers = signal<readonly ChipItem[]>([
    { value: 'huge', label: 'huge' },
    { value: 'big', label: 'big', removable: false },
    { value: 'ookii', label: '大きい', lang: 'ja' },
    { value: 'long', label: 'of a size well beyond what one would expect of such a thing' },
  ]);
  /** The build analyzer's grades, each with its colour mark (the showcase's own colours, 3:1 on the control). */
  protected readonly grades: SegmentedOption[] = [
    { value: 'S', label: 'S', mark: 'var(--show-grade-s)' },
    { value: 'A', label: 'A', mark: 'var(--show-grade-a)' },
    { value: 'B', label: 'B', mark: 'var(--show-grade-b)' },
    { value: 'C', label: 'C', mark: 'var(--show-grade-c)', disabled: true },
    { value: 'D', label: 'D', mark: 'var(--show-grade-d)' },
  ];
  protected readonly grade = signal('A');
  /** More than a phone's line holds: they wrap. */
  protected readonly periods: SegmentedOption[] = [
    { value: '1', label: 'Today' },
    { value: '7', label: 'This week' },
    { value: '30', label: 'This month' },
    { value: '365', label: 'This year' },
    { value: 'all', label: 'Everything' },
  ];
  protected readonly period = signal('7');
  /** The import's steps (the build analyzer's wizard): a step done is a way back to it. */
  protected readonly wizard: StepItem[] = [{ label: 'Choose the game' }, { label: 'Choose the way in' }, { label: 'Prepare the export' }, { label: 'Import' }];
  protected readonly wizardStep = signal(2);
  /** A lesson's steps (Piano's): one after the current one passed before. */
  protected readonly lesson: StepItem[] = [
    { label: 'Listen', short: 'Listen' },
    { label: 'Play the scale', short: 'Play' },
    { label: 'Read the notes', short: 'Read', done: true },
    { label: 'Sing it back', short: 'Sing' },
  ];
  protected readonly notesOpen = signal(false);
  protected readonly tempo = signal(96);

  /** The family's icons the build analyzer drew itself until 0.6.0. */
  protected readonly newIcons = ['rocket', 'upload', 'lightbulb', 'pause', 'minus', 'wrench', 'gamepad', 'save'];

  // ── 0.6.0's navigation ──────────────────────────────────────────────────────

  /** The showcase's pages as link tabs (Japanese Academy's Kanji section's way): the gallery is the page's. */
  protected readonly pageLinks: LinkTabItem[] = [
    { id: 'gallery', label: 'Gallery', path: '/', exact: true, icon: 'sparkle' },
    { id: 'translations', label: 'Translations', path: '/translations', lang: 'en' },
    { id: 'languages', label: 'Languages', path: '/languages', lang: 'en' },
    { id: 'people', label: 'People', path: '/people', lang: 'en', badge: 7, badgeLabel: '7 people' },
    { id: 'migrations', label: 'Migrations', path: '/migrations', lang: 'en', badge: 4, badgeLabel: '4 waiting', badgeTone: 'warning' },
    { id: 'feedback', label: 'Feedback form', path: '/feedback', lang: 'en' },
    { id: 'terms', label: 'Terms', path: '/terms' },
    { id: 'privacy', label: 'Privacy', path: '/privacy' },
  ];
  /** A database's parts as tabs with icons and badges (genshin's, the build analyzer's): more than a phone's line holds. */
  protected readonly partTabs: TabItem[] = [
    { id: 'characters', label: 'Characters', icon: 'user', badge: 98 },
    { id: 'weapons', label: 'Weapons', icon: 'wrench', badge: 145 },
    { id: 'artifacts', label: 'Artifacts', icon: 'sparkle', badge: 'New', badgeTone: 'primary' },
    { id: 'enemies', label: 'Enemies', icon: 'alert', badge: 3, badgeLabel: '3 to check', badgeTone: 'warning' },
    { id: 'materials', label: 'Materials', icon: 'gamepad' },
    { id: 'foods', label: 'Foods', icon: 'lightbulb' },
    { id: 'banners', label: 'Banners', icon: 'rocket' },
    { id: 'files', label: 'Files', icon: 'save', badge: 0 },
  ];
  protected readonly part = signal('characters');
  protected readonly narrowPart = signal('banners');
  /** The showcase's admin pages in the side navigation's groups (genshin's admin panel's way). */
  protected readonly adminGroups: SideNavGroup[] = [
    { links: [{ id: 'gallery', label: 'Gallery', path: '/', exact: true, icon: 'sparkle' }] },
    {
      label: 'Admin tools',
      links: [
        { id: 'errors', label: 'Error log', path: '/admin/errors', icon: 'alert' },
        { id: 'audit', label: 'Audit log', path: '/admin/audit', icon: 'shield' },
        { id: 'feedback', label: 'Feedback', path: '/admin/feedback', icon: 'info', badge: 3 },
        { id: 'backups', label: 'Backups', path: '/admin/backups', icon: 'save' },
        { id: 'files', label: 'Files', path: '/admin/files', icon: 'copy' },
      ],
    },
    {
      label: 'Words',
      collapsible: true,
      links: [
        { id: 'translations', label: 'Translations', path: '/translations', icon: 'languages' },
        { id: 'languages', label: 'Languages', path: '/languages', icon: 'languages', badge: 'Beta' },
      ],
    },
    {
      label: 'Site',
      collapsed: true,
      links: [
        { id: 'people', label: 'People', path: '/people', icon: 'users' },
        { id: 'migrations', label: 'Migrations', path: '/migrations', icon: 'refresh', badge: 4, badgeLabel: '4 waiting' },
        { id: 'account', label: 'Accounts & access', href: 'https://iam.example.test/admin', newTab: true, icon: 'user' },
      ],
    },
  ];
  /** ?navButton=own: the side navigation's own button on a phone, in place of the site's in its bar. */
  protected readonly siteNavButton = new URLSearchParams(location.search).get('navButton') !== 'own';

  protected async ask(): Promise<void> {
    const sure = await this.confirm.ask({ title: 'Delete the survey?', message: 'Its 48 answers go with it. This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' });
    if (sure) {
      this.toasts.success('The survey was deleted.');
    }
  }

  protected save(): void {
    this.loading.set(true);
    setTimeout(() => {
      this.loading.set(false);
      this.toasts.success('Saved.');
    }, 1500);
  }

  protected removeAnswer(value: string): void {
    this.answers.update((answers) => answers.filter((answer) => answer.value !== value));
  }
}
