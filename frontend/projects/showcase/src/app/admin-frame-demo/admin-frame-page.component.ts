import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BadgeComponent } from '@anotoki/lib/ui/badge';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';

/** A row of the sample table: enough of them that the page's column scrolls on its own. */
interface Row {
  name: string;
  element: string;
  rarity: number;
  region: string;
}

const REGIONS = ['Mondstadt', 'Liyue', 'Inazuma', 'Sumeru', 'Fontaine', 'Natlan'];
const NAMES = [
  ['Venti', 'Anemo'],
  ['Diluc', 'Pyro'],
  ['Zhongli', 'Geo'],
  ['Xiao', 'Anemo'],
  ['Raiden Shogun', 'Electro'],
  ['Kamisato Ayaka', 'Cryo'],
  ['Nahida', 'Dendro'],
  ['Alhaitham', 'Dendro'],
  ['Furina', 'Hydro'],
  ['Neuvillette', 'Hydro'],
  ['Mavuika', 'Pyro'],
  ['Citlali', 'Cryo'],
  ['Bennett', 'Pyro'],
  ['Xiangling', 'Pyro'],
  ['Fischl', 'Electro'],
  ['Sucrose', 'Anemo'],
  ['Kuki Shinobu', 'Electro'],
  ['Collei', 'Dendro'],
  ['Lynette', 'Anemo'],
  ['Chevreuse', 'Pyro'],
  ['Kachina', 'Geo'],
  ['Ororon', 'Electro'],
  ['Yelan', 'Hydro'],
  ['Navia', 'Geo'],
];

/**
 * A page of the showcase's admin panel, inside the admin frame: its title from the route, a lead, and a long table -
 * so that the page's column scrolls on its own beside the column of pages.
 */
@Component({
  selector: 'show-admin-frame-page',
  imports: [BadgeComponent, ButtonComponent, CardComponent, PageHeaderComponent],
  templateUrl: './admin-frame-page.component.html',
  styleUrl: './admin-frame-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminFramePageComponent {
  protected readonly title: string = inject(ActivatedRoute).snapshot.data['title'] ?? 'Dashboard';
  protected readonly rows: Row[] = NAMES.map(([name, element], index) => ({ name, element, rarity: index % 3 === 0 ? 4 : 5, region: REGIONS[index % REGIONS.length] }));
}
