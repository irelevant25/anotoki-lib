import { BadgeTone } from '@anotoki/lib/ui/badge';

/** A tab of a row of tabs (`<anotoki-tabs>`). */
export interface TabItem {
  id: string;
  label: string;
  /** A quiet number after the label, heard as part of the tab's name ("All 12") - how many members, say. */
  count?: number | null;
  /** 0.6.0: one of the kit's icons (or one the site registered) before the label - drawn, never heard. */
  icon?: string | null;
  /**
   * 0.6.0: the kit's badge after the label - a count ("3") or a short word ("New"). Seen as it is; heard after the
   * label as `badgeLabel` says, or as itself after a comma: "Issues, 3".
   */
  badge?: string | number | null;
  /** What the badge says, in the site's words and the page's language, for the ear alone: "3 open" ("Issues, 3 open"). */
  badgeLabel?: string | null;
  /** The badge's colour, repeating what its words say: `neutral` unless given. */
  badgeTone?: BadgeTone | null;
  /** The label's language, where it is not the page's ("Slovenčina" on an English admin page). */
  lang?: string | null;
}

/** A link of a row of link tabs (`<anotoki-link-tabs>`): a page of the site, drawn as a tab. */
export interface LinkTabItem {
  /** Its name among the others: what `current` names. */
  id: string;
  label: string;
  /** Where it leads: the router's commands, as `routerLink` takes them ('/kanji/lessons', ['/character', id]). */
  path: string | readonly unknown[];
  /** The page's on this exact address alone - the section's home ('/kanji'), which every address under it starts with. */
  exact?: boolean;
  /** One of the kit's icons (or one the site registered) before the label - drawn, never heard. */
  icon?: string | null;
  /** The kit's badge after the label - a count or a short word - heard after it: `badgeLabel`, or itself ("Reviews, 12"). */
  badge?: string | number | null;
  /** What the badge says, for the ear: "12 due" ("Reviews, 12 due"). */
  badgeLabel?: string | null;
  badgeTone?: BadgeTone | null;
  lang?: string | null;
}

/** Whether a tab draws a badge: anything but nothing - a 0 is a count too ("Errors, 0"). */
export function hasBadge(item: { badge?: string | number | null }): boolean {
  return item.badge !== undefined && item.badge !== null && item.badge !== '';
}

/** What a screen reader hears of a tab's badge, after its label and a comma: the site's words, or the badge itself. */
export function badgeHeard(item: { badge?: string | number | null; badgeLabel?: string | null }): string {
  return item.badgeLabel || String(item.badge);
}
