import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, booleanAttribute, computed, inject, input, viewChild } from '@angular/core';
import { AnotokiWords, SegmentedComponent, SegmentedOption, keepOnScreen } from '@anotoki/lib/ui';
import { AnotokiThemeMode } from '../config';
import { ThemeService } from '../theme.service';

/**
 * Light, dark or as the device is set: the family's segmented switch - a radio
 * group of three (the arrow keys move the choice) - with the icons alone in
 * the bar (`iconsOnly`, each named and with a tooltip) or with their words.
 *
 * When the account refuses a choice, the account's theme is back and a note
 * under the switch says so (role="alert", moved onto the screen near its
 * edge), until the next choice, a click elsewhere, Escape, or the account going.
 */
@Component({
  selector: 'anotoki-theme-toggle',
  imports: [SegmentedComponent],
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'anotoki-theme-toggle',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'theme.dismissRefusal()',
    '(keydown.escape)': 'theme.dismissRefusal()',
  },
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly words = inject(AnotokiWords);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** The icons alone (the top bar); false shows the words too (an account page). */
  readonly iconsOnly = input(true, { transform: booleanAttribute });

  protected readonly options = computed<SegmentedOption[]>(() => [
    { value: 'light', label: this.words.t('theme.light'), icon: 'sun' },
    { value: 'dark', label: this.words.t('theme.dark'), icon: 'moon' },
    { value: 'auto', label: this.words.t('theme.auto'), icon: 'monitor', hint: this.words.t('theme.autoHint') },
  ]);

  private readonly note = viewChild<ElementRef<HTMLElement>>('note');

  constructor() {
    // Near the screen's right edge on a phone: the note is measured once it is drawn, and moved onto the screen.
    afterRenderEffect(() => keepOnScreen(this.note()?.nativeElement));
  }

  protected choose(mode: string): void {
    this.theme.set(mode as AnotokiThemeMode);
  }

  /** A click anywhere but on the switch and its note: the note has been seen. */
  protected onDocumentClick(event: MouseEvent): void {
    if (this.theme.refused() && !this.host.contains(event.target as Node)) {
      this.theme.dismissRefusal();
    }
  }
}
