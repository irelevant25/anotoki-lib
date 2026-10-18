/*
 * @anotoki/lib/admin/backups - the administrators' backups, <anotoki-backups-page>
 * (English, for the site's ADMIN alone): an entry point of its own, on a lazy route.
 *
 *   { path: 'backups', loadComponent: () => import('@anotoki/lib/admin/backups').then((m) => m.BackupsPageComponent) }
 *
 * The proof the site asks for (provideAnotokiAdmin's signInAgain on the sites), the download by a single-use
 * ticket, the restore's strong confirmation. The server's half: Anotoki\Lib\Backups\Http\BackupsRoutes::admin()
 * and ::file().
 */

export type { BackupInfo, BackupKind, BackupsAnswer, BackupsStatus, ProofKind, RestorePreview, RestoreResult } from './src/models';
export { BackupsPageComponent } from './src/backups-page/backups-page.component';
