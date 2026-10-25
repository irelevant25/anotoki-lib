/** The parts a site offers (the PHP half's SiteSettings::PARTS): getting in, the announcement, page access. */
export type SitePart = 'getting_in' | 'announcement' | 'page_access';

/** The announcement's kinds. */
export type AnnouncementLevel = 'info' | 'warning' | 'danger';

/** Who sees a page, from the most open. */
export type PageVisibility = 'PUBLIC' | 'USER' | 'EDITOR' | 'ADMIN';

/** When a switch last changed and by whom (null for one nobody has thrown). */
export interface SettingHistory {
  updated_at: string | null;
  updated_by: number | null;
  updated_by_name: string | null;
}

/** A switch's value, with its history. */
export interface SettingRow<T> extends SettingHistory {
  value: T;
}

/** A message per language. */
export type Message = Readonly<Record<string, string>>;

/** The switches of the parts the site offers (the others are not there). */
export interface SiteSwitches {
  maintenance_mode?: SettingRow<boolean>;
  maintenance_message?: SettingRow<Message>;
  announcement_enabled?: SettingRow<boolean>;
  announcement_level?: SettingRow<AnnouncementLevel>;
  announcement_message?: SettingRow<Message>;
}

/** A row of Page access, as the administrators' page draws it. */
export interface AdminPage extends SettingHistory {
  id: number;
  path: string;
  visibility: PageVisibility;
  blocked: boolean;
  api_paths: string[];
  sort_order: number;
  /** Why a rule passes this row over (a reserved page put in by hand): it governs nothing, and can only be removed. */
  refused: string | null;
}

/** GET /api/admin/site-settings: everything the page draws (SiteSettingsRoutes::admin()). */
export interface AdminSiteSettings {
  parts: SitePart[];
  settings: SiteSwitches;
  pages: AdminPage[];
  levels: AnnouncementLevel[];
  visibilities: PageVisibility[];
  reserved: { pages: string[]; api_paths: string[] };
  limits: { message: number; message_languages: number; api_paths: number; pages: number };
}

/** A switch's name. */
export type SwitchName = keyof SiteSwitches;
