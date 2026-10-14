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
import { DrawerComponent } from '@anotoki/lib/ui/drawer';
import { CheckboxComponent, CodeInputComponent, PasswordFieldComponent, RadioGroupComponent, SelectComponent, SwitchComponent, TextFieldComponent, TextareaComponent } from '@anotoki/lib/ui/forms';
import { LinkCardComponent } from '@anotoki/lib/ui/link-card';
import { MenuComponent, MenuItemComponent, MenuSeparatorComponent, MenuTriggerDirective, PopoverComponent, PopoverTriggerDirective } from '@anotoki/lib/ui/menu';
import { PaginationComponent } from '@anotoki/lib/ui/pagination';
import { ProgressBarComponent } from '@anotoki/lib/ui/progress';
import { QrCodeComponent } from '@anotoki/lib/ui/qr';
import { StatTileComponent, StatTilesComponent } from '@anotoki/lib/ui/stat-tiles';
import { TabsComponent } from '@anotoki/lib/ui/tabs';
import { ToastService } from '@anotoki/lib/ui/toast';
import { TooltipDirective } from '@anotoki/lib/ui/tooltip';

/** Every piece of the kit, on one page, in the states a person meets. */
@Component({
  selector: 'show-gallery',
  imports: [
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
    DrawerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    LanguageSwitcherComponent,
    LinkCardComponent,
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
    SpinnerComponent,
    StatTileComponent,
    StatTilesComponent,
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
  /** The family's icons the build analyzer drew itself until 0.6.0. */
  protected readonly newIcons = ['rocket', 'upload', 'lightbulb', 'pause', 'minus', 'wrench', 'gamepad', 'save'];

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
