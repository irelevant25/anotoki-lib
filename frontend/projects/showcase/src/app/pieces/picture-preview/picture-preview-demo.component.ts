import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { PicturePreviewDirective } from '@anotoki/lib/ui/picture-preview';

/** A picture for the showcase: a character's initials on a disc of their element's colour, drawn large, as an address. */
function picture(name: string, colour: string, wide = false): string {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2);
  const [width, height] = wide ? [480, 270] : [320, 320];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#1b2234"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 2 - 16}" fill="${colour}"/><text x="${width / 2}" y="${height / 2 + 30}" font-family="sans-serif" font-size="88" font-weight="700" text-anchor="middle" fill="#fff">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** A picture larger on hover and focus (0.11.0): genshin's admin's picture slots - and a button whose picture is named apart. */
@Component({
  selector: 'show-picture-preview-demo',
  imports: [PageHeaderComponent, PicturePreviewDirective],
  templateUrl: './picture-preview-demo.component.html',
  styleUrl: './picture-preview-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PicturePreviewDemoComponent {
  protected readonly slots = [
    { label: 'Icon', file: 'HU_TAO.avif', alt: "Hu Tao's icon", src: picture('Hu Tao', '#c95a1f') },
    { label: 'Namecard', file: 'HU_TAO_NAMECARD.avif', alt: "Hu Tao's namecard", src: picture('Hu Tao', '#8a62a8', true) },
    { label: 'Splash art', file: 'FURINA_SPLASH.avif', alt: "Furina's splash art", src: picture('Furina', '#2f8fc2') },
  ];
  protected readonly broken = 'missing-picture.avif';
}
