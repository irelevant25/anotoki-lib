import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FilePickerComponent } from '@anotoki/lib/ui/file-picker';
import { FileSizePipe } from '@anotoki/lib/ui/file-size';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';

/** A folder chosen in the kit's file picker (0.11.0): every file in it and in its folders, each with its path - beside files. */
@Component({
  selector: 'show-folder-demo',
  imports: [FilePickerComponent, FileSizePipe, PageHeaderComponent],
  templateUrl: './folder-demo.component.html',
  styleUrl: './folder-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderDemoComponent {
  protected readonly folder = signal<readonly File[]>([]);
  protected readonly uploads = signal<readonly File[]>([]);

  /** A file's path in its folder, as the device's folder chooser gives it. */
  protected pathOf(file: File): string {
    return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
  }
}
