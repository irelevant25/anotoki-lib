import { ChangeDetectionStrategy, Component, ElementRef, inject, output, signal } from '@angular/core';

/**
 * The picture of an [anotokiPicturePreview], larger, in a box over the page (in the top layer, above a dialog too).
 * Internal: the directive makes it, places it and takes it away. The pointer can move onto it without it going (WCAG
 * 1.4.13); a picture that cannot be loaded says so to the directive, which takes the box away. Unseen until its picture
 * has come - an empty frame never shows -, then placed again at the size it has.
 */
@Component({
  selector: 'anotoki-picture-bubble',
  templateUrl: './picture-bubble.component.html',
  styleUrl: './picture-bubble.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'anotoki-picture-preview',
    role: 'tooltip',
    popover: 'manual',
    '[id]': 'id()',
    '[attr.data-side]': 'side()',
    '[class.anotoki-picture-preview--loading]': '!ready()',
    '[style.--_picture-preview-width]': 'maxWidth()',
    '[style.--_picture-preview-height]': 'maxHeight()',
  },
})
export class PictureBubbleComponent {
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly id = signal('');
  readonly src = signal('');
  readonly alt = signal('');
  readonly side = signal<'right' | 'left' | 'below' | 'above'>('right');
  /** The room the picture has on its side, as CSS lengths: never more than the window holds there. */
  readonly maxWidth = signal('18rem');
  readonly maxHeight = signal('18rem');
  /** The picture has come. */
  readonly ready = signal(false);
  /** The picture came: its size is known, and the box is placed again. */
  readonly loaded = output<void>();
  /** The picture could not be loaded. */
  readonly failed = output<void>();

  protected onLoad(): void {
    this.ready.set(true);
    this.loaded.emit();
  }
}
