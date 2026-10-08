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
  SpinnerComponent,
} from '@anotoki/lib/ui';
import { CopyButtonComponent } from '@anotoki/lib/ui/copy';
import { ConfirmService, DialogComponent } from '@anotoki/lib/ui/dialog';
import { DrawerComponent } from '@anotoki/lib/ui/drawer';
import { CheckboxComponent, CodeInputComponent, PasswordFieldComponent, RadioGroupComponent, SelectComponent, SwitchComponent, TextFieldComponent, TextareaComponent } from '@anotoki/lib/ui/forms';
import { MenuComponent, MenuItemComponent, MenuSeparatorComponent, MenuTriggerDirective, PopoverComponent, PopoverTriggerDirective } from '@anotoki/lib/ui/menu';
import { PaginationComponent } from '@anotoki/lib/ui/pagination';
import { QrCodeComponent } from '@anotoki/lib/ui/qr';
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
    CodeInputComponent,
    CopyButtonComponent,
    DialogComponent,
    DrawerComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    IconComponent,
    LanguageSwitcherComponent,
    MenuComponent,
    MenuItemComponent,
    MenuSeparatorComponent,
    MenuTriggerDirective,
    PageHeaderComponent,
    PaginationComponent,
    PasswordFieldComponent,
    PopoverComponent,
    PopoverTriggerDirective,
    QrCodeComponent,
    RadioGroupComponent,
    SegmentedComponent,
    SelectComponent,
    SpinnerComponent,
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
}
