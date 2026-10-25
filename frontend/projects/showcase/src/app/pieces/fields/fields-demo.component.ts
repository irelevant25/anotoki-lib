import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { FieldsetComponent } from '@anotoki/lib/ui/fieldset';
import { CheckboxComponent, TextFieldComponent } from '@anotoki/lib/ui/forms';
import { NumberFieldComponent } from '@anotoki/lib/ui/number-field';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { SelectComponent, SelectOption } from '@anotoki/lib/ui/select';

/**
 * The number field and what else genshin's form wrappers gave a page (0.11.0): a number as a number, null while it is
 * none; fields under one name in columns; a checkbox's error; a select of numbers.
 */
@Component({
  selector: 'show-fields-demo',
  imports: [ButtonComponent, CheckboxComponent, FieldsetComponent, NumberFieldComponent, PageHeaderComponent, SelectComponent, TextFieldComponent],
  templateUrl: './fields-demo.component.html',
  styleUrl: './fields-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FieldsDemoComponent {
  protected readonly level = signal<number | null>(90);
  protected readonly attack = signal<number | null>(null);
  protected readonly critRate = signal<number | null>(5);
  protected readonly cooldown = signal<number | null>(12.5);
  protected readonly rarity = signal<number | null>(5);
  protected readonly agreed = signal(false);
  protected readonly tried = signal(false);
  protected readonly rarities: readonly SelectOption<number | null>[] = [
    { value: 4, label: '4 stars' },
    { value: 5, label: '5 stars' },
  ];
  protected readonly termsError = computed(() => (this.tried() && !this.agreed() ? 'Agree to the terms to save.' : null));
  protected readonly values = computed(() => JSON.stringify({ level: this.level(), attack: this.attack(), critRate: this.critRate(), cooldown: this.cooldown(), rarity: this.rarity() }));
}
