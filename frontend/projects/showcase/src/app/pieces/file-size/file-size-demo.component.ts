import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnotokiWords } from '@anotoki/lib/ui/config';
import { FileSizePipe, writtenSize } from '@anotoki/lib/ui/file-size';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';

/** A file's size (0.11.0): written the page's way, in the binary units a disk is measured in - the pipe, and the function in both languages. */
@Component({
  selector: 'show-file-size-demo',
  imports: [FileSizePipe, PageHeaderComponent],
  templateUrl: './file-size-demo.component.html',
  styleUrl: './file-size-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileSizeDemoComponent {
  protected readonly words = inject(AnotokiWords);
  protected readonly sizes = [0, 1, 300, 1536, 250_000, 20 * 1024 * 1024, 3.4 * 1024 ** 3];
  protected readonly written = writtenSize;
}
