import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MultiselectComponent, MultiselectOption } from '@anotoki/lib/ui/multiselect';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { SelectComponent, SelectOption } from '@anotoki/lib/ui/select';

/** The multiselect (0.11.0): a filter bar's compact button beside the kit's select, and a form's - with numbers for values. */
@Component({
  selector: 'show-multiselect-demo',
  imports: [MultiselectComponent, PageHeaderComponent, SelectComponent],
  templateUrl: './multiselect-demo.component.html',
  styleUrl: './multiselect-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultiselectDemoComponent {
  protected readonly elements: readonly MultiselectOption[] = ['Anemo', 'Geo', 'Electro', 'Dendro', 'Hydro', 'Pyro', 'Cryo'].map((name) => ({ value: name.toLowerCase(), label: name }));
  protected readonly weapons: readonly MultiselectOption[] = [
    { value: 'sword', label: 'Sword' },
    { value: 'claymore', label: 'Claymore' },
    { value: 'polearm', label: 'Polearm' },
    { value: 'bow', label: 'Bow' },
    { value: 'catalyst', label: 'Catalyst', disabled: true },
  ];
  protected readonly rarities: readonly MultiselectOption<number>[] = [
    { value: 4, label: '4 stars' },
    { value: 5, label: '5 stars' },
  ];
  protected readonly regions: readonly SelectOption[] = ['Mondstadt', 'Liyue', 'Inazuma', 'Sumeru', 'Fontaine', 'Natlan'].map((name) => ({ value: name.toLowerCase(), label: name }));

  protected readonly chosenElements = signal<readonly string[]>(['hydro', 'pyro', 'cryo', 'anemo', 'geo']);
  protected readonly chosenWeapons = signal<readonly string[]>([]);
  protected readonly chosenRarities = signal<readonly number[]>([5]);
  protected readonly region = signal('');
}
