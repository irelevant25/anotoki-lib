import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, input, model, viewChild } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui';
import { FieldBase } from '../field-base';

/** A labelled multi-line field, wired like the text field. */
@Component({
  selector: 'anotoki-textarea',
  imports: [IconComponent],
  templateUrl: './textarea.component.html',
  styleUrl: './textarea.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-textarea' },
})
export class TextareaComponent extends FieldBase {
  readonly value = model<string>('');
  readonly rows = input(3);
  readonly placeholder = input('');
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly maxlength = input<number | null>(null);
  /** On by default: a textarea holds prose. */
  readonly spellcheck = input<'true' | 'false'>('true');

  protected readonly control = viewChild<ElementRef<HTMLTextAreaElement>>('control');

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLTextAreaElement).value);
  }
}
