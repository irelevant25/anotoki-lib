import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TextFieldComponent } from '@anotoki/lib/ui/forms';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { filterBySearch, foldText } from '@anotoki/lib/ui/search';

/** Names people search for, with their accents: characters, places, foods, a Slovak town or two. */
const NAMES: readonly { name: string; kind: string }[] = [
  { name: 'Fúrina', kind: 'Hydro · Sword' },
  { name: 'Neuvillette', kind: 'Hydro · Catalyst' },
  { name: 'Café Lu Pane', kind: 'Fontaine · Food' },
  { name: 'Crème brûlée', kind: 'Food' },
  { name: 'Mondstadt', kind: 'Region' },
  { name: 'Žilina', kind: 'A Slovak town' },
  { name: 'Ľubica', kind: 'A Slovak name' },
  { name: 'Łódź', kind: 'A Polish town' },
  { name: 'Straße', kind: 'A German street' },
  { name: 'Hu Tao', kind: 'Pyro · Polearm' },
];

/** Accent-free search (0.11.0): typed with or without accents, in any case - "cafe" finds "Café", "zilina" "Žilina". */
@Component({
  selector: 'show-search-demo',
  imports: [PageHeaderComponent, TextFieldComponent],
  templateUrl: './search-demo.component.html',
  styleUrl: './search-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchDemoComponent {
  protected readonly query = signal('cafe');
  protected readonly found = computed(() => filterBySearch(NAMES, this.query(), (entry) => [entry.name, entry.kind]));
  protected readonly folded = computed(() => foldText(this.query()));
}
