import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { AdminTools } from '@anotoki/lib/admin/parts';
import { AlertComponent, AlertTone } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { SelectComponent, SelectOption, SwitchComponent, TextareaComponent } from '@anotoki/lib/ui/forms';
import { AdminSiteSettings, AnnouncementLevel, Message, SettingHistory, SwitchName } from '../models';

/** The kinds, as the page says them. */
const LEVELS: readonly SelectOption[] = [
  { value: 'info', label: 'Information' },
  { value: 'warning', label: 'Warning' },
  { value: 'danger', label: 'Something is wrong' },
];

/** A message as the server keeps it: each language's words trimmed, their line breaks \n, the empty ones left out. */
function clean(message: Message): Record<string, string> {
  const out: Record<string, string> = {};
  for (const language of Object.keys(message).sort()) {
    const text = message[language].replace(/\r\n?/g, '\n').trim();
    if (text !== '') {
      out[language] = text;
    }
  }
  return out;
}

const same = (a: Message, b: Message): boolean => JSON.stringify(clean(a)) === JSON.stringify(clean(b));

/**
 * One card's switches - Getting in's or the Announcement's - in the kit's dialog: a switch, the announcement's kind,
 * and a field a language for the words (the site's languages, and any other the words are written in already, so
 * nothing written is lost). It saves its own card's switches that changed, together - "maintenance on, its message
 * refused" is the one combination that must not reach the table - and nothing it was not given.
 */
@Component({
  selector: 'anotoki-site-settings-switches',
  imports: [AlertComponent, ButtonComponent, DialogComponent, SelectComponent, SwitchComponent, TextareaComponent],
  templateUrl: './switches-dialog.component.html',
  styleUrl: './switches-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SwitchesDialogComponent {
  protected readonly tools = inject(AdminTools);

  readonly part = input.required<'getting_in' | 'announcement'>();
  readonly heading = input.required<string>();
  readonly data = input.required<AdminSiteSettings>();
  readonly languages = input.required<readonly { code: string; name: string }[]>();
  readonly staffRoute = input('/staff');

  /** The whole as the server has it after a save, and what the page says of it. */
  readonly saved = output<{ data: AdminSiteSettings; said: string; close: boolean }>();
  readonly closed = output<void>();

  protected readonly levels = LEVELS;

  /** The card's three switches by name: its on/off, its kind (the announcement's), its words. */
  protected readonly names = computed(() =>
    this.part() === 'getting_in'
      ? { enabled: 'maintenance_mode' as const, level: null, message: 'maintenance_message' as const }
      : { enabled: 'announcement_enabled' as const, level: 'announcement_level' as const, message: 'announcement_message' as const },
  );

  // The form, as the switches stand when the dialog opens.
  protected readonly enabled = signal(false);
  protected readonly level = signal<AnnouncementLevel>('info');
  protected readonly message = signal<Record<string, string>>({});

  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** A field a language: the site's, then any other the words are written in already. */
  protected readonly fields = computed(() => {
    const listed = this.languages();
    const known = new Set(listed.map((language) => language.code));
    const others = Object.keys(this.current().message).filter((code) => !known.has(code));
    return [...listed, ...others.sort().map((code) => ({ code, name: code }))];
  });

  /** The switches' values as they are saved now. */
  private readonly current = computed(() => {
    const settings = this.data().settings;
    const names = this.names();
    return {
      enabled: settings[names.enabled]?.value === true,
      level: (names.level ? settings[names.level]?.value : null) ?? 'info',
      message: (settings[names.message]?.value ?? {}) as Message,
    };
  });

  /** The switches whose draft is not what is saved, with the value to send. */
  protected readonly changes = computed(() => {
    const now = this.current();
    const names = this.names();
    const changes: Partial<Record<SwitchName, unknown>> = {};
    if (this.enabled() !== now.enabled) {
      changes[names.enabled] = this.enabled();
    }
    if (names.level && this.level() !== now.level) {
      changes[names.level] = this.level();
    }
    if (!same(this.message(), now.message)) {
      changes[names.message] = clean(this.message());
    }
    return changes;
  });

  protected readonly changed = computed(() => Object.keys(this.changes()).length);

  /** The preview of the bar: the words of the first language written, in the kind's tone. */
  protected readonly preview = computed(() => {
    const message = clean(this.message());
    const first = this.fields().find((field) => message[field.code]);
    return first ? { text: message[first.code], tone: this.level() as AlertTone, lang: first.code } : null;
  });

  constructor() {
    queueMicrotask(() => this.start());
  }

  /** The form, as the switches stand. */
  protected start(): void {
    const now = this.current();
    this.enabled.set(now.enabled);
    this.level.set(now.level as AnnouncementLevel);
    this.message.set({ ...now.message });
  }

  protected text(code: string): string {
    return this.message()[code] ?? '';
  }

  protected setText(code: string, value: string): void {
    this.message.update((message) => ({ ...message, [code]: value }));
  }

  protected setLevel(value: string): void {
    this.level.set(value === 'warning' || value === 'danger' ? value : 'info');
  }

  /** When a switch last changed, and by whom: "Last changed 25 Oct 2026, 10:01 by Mira"; '' for never. */
  protected history(name: SwitchName): string {
    const row: SettingHistory | undefined = this.data().settings[name];
    if (!row?.updated_at) {
      return '';
    }
    return `Last changed ${this.tools.date(row.updated_at)}${row.updated_by_name ? ` by ${row.updated_by_name}` : ''}`;
  }

  protected async save(): Promise<void> {
    const changes = this.changes();
    if (this.changed() === 0 || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      const data = await this.tools.put<AdminSiteSettings>(this.tools.base('site-settings'), { settings: changes });
      this.saved.emit({ data, said: `${this.heading()}: saved.`, close: true });
    } catch (error) {
      this.refusal.set(this.tools.say(this.tools.failure(error)));
    } finally {
      this.saving.set(false);
    }
  }
}
