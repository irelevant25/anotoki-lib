import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';

/**
 * The words of an [anotokiTooltip], in a small box over the page (in the top
 * layer, above a dialog too). Internal: the directive makes it, places it and
 * takes it away. The pointer can move onto it without it going (WCAG 1.4.13).
 */
@Component({
  selector: 'anotoki-tooltip-bubble',
  templateUrl: './tooltip-bubble.component.html',
  styleUrl: './tooltip-bubble.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'anotoki-tooltip',
    role: 'tooltip',
    popover: 'manual',
    '[id]': 'id()',
    '[attr.data-side]': 'side()',
  },
})
export class TooltipBubbleComponent {
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly id = signal('');
  readonly text = signal('');
  readonly side = signal<'above' | 'below'>('above');
}
