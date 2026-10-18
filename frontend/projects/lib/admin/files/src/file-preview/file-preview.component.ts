import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { AdminTools, formatBytes } from '@anotoki/lib/admin/parts';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { FileEntry } from '../models';

/**
 * A file, shown safely: from its signed preview link (the server answers it
 * with `Content-Security-Policy: sandbox`, `nosniff`, same-origin only), a
 * picture in an <img>, sound in an <audio>, video in a <video> - none of which
 * runs anything - and a short text file fetched as text and shown as text,
 * never read as markup. What the server does not show inline (an SVG, a PDF,
 * a long text) is offered as a download. Only a link that is a path of the
 * site's own is ever opened.
 */
@Component({
  selector: 'anotoki-file-preview',
  imports: [ButtonComponent, DialogComponent, IconComponent, SpinnerComponent],
  templateUrl: './file-preview.component.html',
  styleUrl: './file-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-file-preview' },
})
export class FilePreviewComponent {
  protected readonly tools = inject(AdminTools);

  readonly file = input.required<FileEntry>();
  readonly dismissed = output<void>();

  protected readonly formatBytes = formatBytes;
  protected readonly url = computed(() => this.tools.url(this.file().url));
  /** A picture fits the dialog; or is shown at its own size, to look closer. */
  protected readonly fit = signal(true);
  protected readonly failed = signal(false);
  protected readonly dimensions = signal<string | null>(null);
  protected readonly text = signal<string | null>(null);
  protected readonly textError = signal<string | null>(null);

  constructor() {
    let asked = false;
    effect(() => {
      const file = this.file();
      const url = this.url();
      if (!asked && file.preview === 'text' && url !== null) {
        asked = true;
        untracked(() => void this.loadText(url));
      }
    });
  }

  protected onImageLoad(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (image.naturalWidth > 0) {
      this.dimensions.set(`${image.naturalWidth} × ${image.naturalHeight} px`);
    }
  }

  private async loadText(url: string): Promise<void> {
    try {
      this.text.set(await this.tools.text(url));
    } catch (error) {
      this.textError.set(this.tools.say(this.tools.failure(error)));
    }
  }
}
