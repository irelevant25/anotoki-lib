/** A link of the side navigation: a page of the site, or a page elsewhere. */
export interface SideNavLink {
  /** Its name among the others: what the side navigation's `current` names. */
  id?: string | null;
  label: string;
  /** A page of the site: the router's commands, as `routerLink` takes them, relative to the page that draws the navigation. */
  path?: string | readonly unknown[] | null;
  /** Or a page elsewhere (the anotoki account): a plain link, never marked as the page's. */
  href?: string | null;
  /** The page elsewhere opens in a new tab, with an icon that says so. */
  newTab?: boolean;
  /** The page's on this exact address alone - the area's own home, which every address under it starts with. */
  exact?: boolean;
  /** One of the kit's icons (or one the site registered) before the label - drawn, never heard. */
  icon?: string | null;
  /**
   * A number beside the label (the new feedback), or a short word ("Beta"): seen as it is, heard after the label -
   * `badgeLabel`, or for a number the kit's "{count} new" ("Feedback, 3 new", the top bar's words), or the word itself.
   * A 0 shows nothing: nothing new.
   */
  badge?: string | number | null;
  /** What the badge counts, in the site's words and the page's language, for the ear alone: "12 reviews due". */
  badgeLabel?: string | null;
  /** The label's language, where it is not the page's (an admin panel's English in a Slovak site). */
  lang?: string | null;
}

/** A group of the side navigation's links, under its heading. */
export interface SideNavGroup {
  /** Its name among the others (kept while the groups change); its heading by default. */
  id?: string | null;
  /** Its heading, which names its list ("Database"); none: links alone (a dashboard above the groups). */
  label?: string | null;
  links: readonly SideNavLink[];
  /** Its heading a button that shows and hides its links (aria-expanded, aria-controls). Open unless `collapsed`. */
  collapsible?: boolean;
  /** Starts closed - a collapsible group, opened by itself while it holds the page's link. */
  collapsed?: boolean;
  /** The heading's language, where it is not the page's. */
  lang?: string | null;
}

/** A number - "3", "12", "99+" - is a count of new things; anything else is a word, heard as it is. */
export const COUNT = /^\d+\+?$/;
