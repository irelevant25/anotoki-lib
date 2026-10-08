import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AnotokiWords } from '@anotoki/lib/ui';
import { encodeQr } from '../qr-encoder';

/**
 * The quiet zone, in modules. Four is what the standard asks for, and it is
 * not decoration: a scanner finds the symbol by its border.
 */
const QUIET_ZONE = 4;

interface Run {
  x: number;
  y: number;
  width: number;
}

/**
 * One QR code, as inline SVG: it scales with the layout and prints, and there
 * is no image request for something computed here. The dark modules are
 * merged into horizontal runs, a few hundred rectangles instead of thousands,
 * bound in the template (nothing marked as trusted for the sanitizer).
 *
 * Always dark on white, whatever the theme: a scanner expects that, and an
 * inverted code is one many will not read. A value too long to encode draws
 * nothing; the page shows the same secret as text beside it anyway.
 */
@Component({
  selector: 'anotoki-qr-code',
  templateUrl: './qr-code.component.html',
  styleUrl: './qr-code.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'anotoki-qr-code' },
})
export class QrCodeComponent {
  private readonly words = inject(AnotokiWords);

  readonly value = input.required<string>();
  /** What a screen reader hears; the kit's "QR code" by default. */
  readonly label = input<string | null>(null);

  protected readonly name = computed(() => this.label() || this.words.t('ui.qrCode'));
  protected readonly symbol = computed<{ size: number; runs: Run[] } | null>(() => {
    let modules: boolean[][];
    try {
      modules = encodeQr(this.value());
    } catch {
      return null;
    }
    const runs: Run[] = [];
    modules.forEach((row, y) => {
      let start: number | null = null;
      // One rectangle per run of dark modules, closed at the row's end.
      for (let x = 0; x <= row.length; x++) {
        const dark = x < row.length && row[x];
        if (dark && start === null) {
          start = x;
        } else if (!dark && start !== null) {
          runs.push({ x: start + QUIET_ZONE, y: y + QUIET_ZONE, width: x - start });
          start = null;
        }
      }
    });
    return { size: modules.length + QUIET_ZONE * 2, runs };
  });
}
