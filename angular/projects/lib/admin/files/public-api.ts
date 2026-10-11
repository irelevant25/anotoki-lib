/*
 * @anotoki/lib/admin/files - the administrators' file explorer, <anotoki-files-page>
 * (English, for the site's ADMIN alone): an entry point of its own, on a lazy route.
 *
 *   { path: 'files', loadComponent: () => import('@anotoki/lib/admin/files').then((m) => m.FilesPageComponent) }
 *
 * The folders are the ones the site names (FileRoot); uploads keep to their rules (UploadPolicy), and a
 * preview is shown from its signed link alone. The server's half: Anotoki\Lib\Files\Http\FilesRoutes::admin()
 * and ::raw().
 */

export type { FileEntry, FileRootInfo, FolderEntry, Listing, PreviewKind, ScanStatus, TrashItem, UploadResult, UploadedFile } from './src/models';
export { FilesPageComponent } from './src/files-page/files-page.component';
