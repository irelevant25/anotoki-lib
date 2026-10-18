/*
 * @anotoki/lib/ui/tabs - a row of tabs (the WAI-ARIA tabs pattern; the page draws the panels) and, 0.6.0, link tabs
 * (a named nav of the section's pages drawn as tabs, the page's aria-current="page"). Both take an icon and the kit's
 * badge (heard in words), and scroll sideways where they do not fit - the edge with more beyond it fading, an arrow
 * there for a mouse, the current one brought into view. Their words (`anotoki.tabs.*`: the arrows' "More tabs") are
 * @anotoki/lib/words/tabs, read by the tabs themselves.
 */

export type { LinkTabItem, TabItem } from './src/tab-item';
export { LinkTabsComponent } from './src/link-tabs/link-tabs.component';
export { TabsComponent } from './src/tabs/tabs.component';
