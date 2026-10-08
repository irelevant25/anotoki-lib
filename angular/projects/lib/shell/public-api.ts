/*
 * @anotoki/lib/shell - what every page of a site draws: the theme (its service
 * and its switch), the language switcher, the brand, the family's top bar and
 * the frame (skip link, bar, side navigation, <main>). The only part of the
 * kit that talks to a site's session and languages - through
 * provideAnotokiShell(), never a site's own services.
 *
 * It imports only @anotoki/lib/ui and @anotoki/lib/ui/menu. The asset
 * `assets/theme-boot.js` applies the stored theme before the first paint.
 */

export type { AnotokiLanguage, AnotokiShellConfig, AnotokiThemeMode } from './src/config';
export { ANOTOKI_SHELL_CONFIG, provideAnotokiShell } from './src/config';
export type { ChoiceSaver } from './src/latest-choice-saver';
export { latestChoiceSaver } from './src/latest-choice-saver';
export type { ResolvedTheme } from './src/theme.service';
export { ThemeService } from './src/theme.service';
export { ThemeToggleComponent } from './src/theme-toggle/theme-toggle.component';
export { LanguageSwitcherComponent } from './src/language-switcher/language-switcher.component';
export { BrandComponent } from './src/brand/brand.component';
export type { TopBarAction, TopBarBrand, TopBarLink, TopBarMenuItem, TopBarMenuNote, TopBarPerson, TopBarPhoneMark } from './src/top-bar/top-bar.component';
export { TopBarComponent } from './src/top-bar/top-bar.component';
export type { ShellNavItem } from './src/shell/shell.component';
export { ShellComponent } from './src/shell/shell.component';
