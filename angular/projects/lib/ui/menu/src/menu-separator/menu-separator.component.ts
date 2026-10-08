import { ChangeDetectionStrategy, Component } from '@angular/core';

/** A line between the groups of a menu's items (role="separator"). */
@Component({
  selector: 'anotoki-menu-separator',
  templateUrl: './menu-separator.component.html',
  styleUrl: './menu-separator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-menu-separator', role: 'separator' },
})
export class MenuSeparatorComponent {}
