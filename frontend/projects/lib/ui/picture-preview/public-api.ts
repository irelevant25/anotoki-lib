/*
 * @anotoki/lib/ui/picture-preview (0.11.0) - [anotokiPicturePreview]: a picture shown larger beside an element, on hover
 * and on focus - genshin's admin's picture slots - as the kit's tooltip shows words (WCAG 1.4.13): it stays while the
 * pointer is over the element or the picture, Escape puts it away, it never covers the element, and its picture is named
 * by its alt. No words of its own: the alt is the site's.
 *
 * For lazy pages: not re-exported by @anotoki/lib/ui, and nothing a site draws on every page should import it.
 */

export { PicturePreviewDirective } from './src/picture-preview.directive';
