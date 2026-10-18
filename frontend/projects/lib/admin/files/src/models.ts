/** A folder the site names (Anotoki\Lib\Files\FileRoot), as GET {files}/roots lists it. */
export interface FileRootInfo {
  name: string;
  label: string;
  /** Files are uploaded, renamed and deleted here; otherwise it is read only. */
  write: boolean;
  /** The extensions an upload may have. */
  extensions: string[];
  max_bytes: number;
  /** Listed from a scan of the disk (a folder of many files), refreshed by Rescan. */
  snapshot: boolean;
}

export interface FolderEntry {
  name: string;
  path: string;
  /** How many files it holds. */
  files: number;
}

/** How a file is shown: the server decides (only pictures, sound, video and short text are shown inline). */
export type PreviewKind = 'image' | 'audio' | 'video' | 'text' | 'download';

export interface FileEntry {
  name: string;
  path: string;
  folder: string;
  extension: string;
  size: number;
  modified: string | null;
  preview: PreviewKind;
  /** Its preview's link, signed for five minutes. */
  url: string;
}

export interface ScanStatus {
  scanned_at: string | null;
  previous_scanned_at: string | null;
  total: number;
  new_count: number;
}

/** GET {files}/{root}?path=&search=&page=&mode=new */
export interface Listing {
  root: string;
  path: string;
  search: string;
  mode: 'folder' | 'search' | 'new';
  folders: FolderEntry[];
  files: FileEntry[];
  total: number;
  page: number;
  pageSize: number;
  status: ScanStatus;
}

export interface UploadedFile {
  name: string;
  stored_as: string | null;
  path: string | null;
  status: 'uploaded' | 'replaced' | 'refused';
  code?: string;
  message?: string;
  size?: number;
}

/** POST {files}/{root}/upload */
export interface UploadResult {
  uploaded: number;
  refused: number;
  files: UploadedFile[];
}

/** GET {files}/{root}/trash */
export interface TrashItem {
  /** Its place in the trash: what restore and delete name. */
  trashed: string;
  folder: string;
  name: string;
  deleted_at: string | null;
  size: number;
}
