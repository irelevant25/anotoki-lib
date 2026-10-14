import { ChangeDetectionStrategy, Component, ElementRef, booleanAttribute, computed, input, model, viewChild } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { FieldBase } from '@anotoki/lib/ui/field';

/** A mark under the slider's track. */
export interface SliderTick {
  /** Where it stands: a value between `min` and `max`. */
  readonly value: number;
  /** Its words under the mark ("Easy", "10"); without any, a mark alone. */
  readonly label?: string | null;
  /** The words' language, where it is not the page's. */
  readonly lang?: string | null;
}

/** Words for a value, and their language where it is not the page's. */
interface Said {
  readonly text: string;
  readonly lang: string | null;
}

/**
 * A number chosen on a track: `<anotoki-slider label="Difficulty" [(value)]="level" [min]="0" [max]="2" [ticks]="levels" />`.
 *
 * The native range input, drawn in the kit's look - the track filled up to the thumb, the thumb the primary colour -
 * so that everything that makes a slider hard is the browser's own and right: dragging, a tap on the track, the arrow
 * keys, Page Up and Down, Home and End, a screen reader saying the value. The whole 44 px high box takes a finger.
 *
 * `ticks` are marks under the track (and their words), placed where the thumb stands at their value, the mark at the
 * value in the primary colour; they are for the eye alone (aria-hidden). The value is shown beside the label
 * (`showValue`, on by default): the page's words for it (`valueText`: "12 × 12"), else the words of the tick at it
 * ("Hard"), else the number written the page's way. A screen reader hears the same words - aria-valuetext - where
 * there are words; a bare number it reads as itself.
 *
 * A field of the kit's: its label (a real `<label for>`), hint, error, invalid, optional, disabled; the value is a
 * number both ways, kept between `min` and `max`.
 */
@Component({
  selector: 'anotoki-slider',
  imports: [IconComponent],
  templateUrl: './slider.component.html',
  styleUrl: './slider.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'anotoki-slider',
    '[class.anotoki-slider--disabled]': 'disabled()',
    '[style.--_slider-fill]': 'fraction()',
  },
})
export class SliderComponent extends FieldBase {
  readonly value = model<number>(0);
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  /** Marks under the track, with their words or none. */
  readonly ticks = input<readonly SliderTick[]>([]);
  /** The page's words for the value ("12 × 12", "3 lives"): shown beside the label and heard as aria-valuetext. */
  readonly valueText = input<string | null>(null);
  /** The value beside the label: off where the ticks' words already say where the thumb is. */
  readonly showValue = input(true, { transform: booleanAttribute });

  protected readonly control = viewChild<ElementRef<HTMLInputElement>>('control');

  /** The value, kept between the ends. */
  protected readonly current = computed(() => {
    const min = this.min();
    const max = Math.max(min, this.max());
    const value = Number(this.value());
    return Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;
  });

  /** How far along the track the thumb is, 0 to 1: the fill's length (--_slider-fill). */
  protected readonly fraction = computed(() => this.along(this.current()));

  /** Words for the value: the page's, or the words of the tick at it; null where the number says it. */
  protected readonly said = computed<Said | null>(() => {
    const own = this.valueText();
    if (own) {
      return { text: own, lang: null };
    }
    const tick = this.ticks().find((each) => !!each.label && each.value === this.current());
    return tick?.label ? { text: tick.label, lang: tick.lang ?? null } : null;
  });

  /** What is shown beside the label: the words, or the number written the page's way ("1 234" in Slovak). */
  protected readonly shown = computed(() => {
    const said = this.said();
    if (said) {
      return said.text;
    }
    try {
      return new Intl.NumberFormat(this.words.language()).format(this.current());
    } catch {
      return String(this.current());
    }
  });

  /** The marks within the ends, where each stands along the track, the one at the value marked. */
  protected readonly marks = computed(() =>
    this.ticks()
      .filter((tick) => tick.value >= this.min() && tick.value <= this.max())
      .map((tick) => ({ ...tick, along: this.along(tick.value), current: tick.value === this.current() })),
  );

  /** Whether any mark has words under it: the track keeps the room for them. */
  protected readonly labelled = computed(() => this.marks().some((mark) => !!mark.label));

  /**
   * Where a value stands across the track: the thumb's centre never reaches the ends (it would hang off them) - it
   * travels from half a thumb in to half a thumb short - and the fill and the marks are placed the same way.
   */
  protected position(along: number): string {
    return `calc(var(--_slider-thumb) / 2 + ${along} * (100% - var(--_slider-thumb)))`;
  }

  protected onInput(event: Event): void {
    this.value.set(Number((event.target as HTMLInputElement).value));
  }

  private along(value: number): number {
    const span = this.max() - this.min();
    return span > 0 ? Math.min(Math.max((value - this.min()) / span, 0), 1) : 0;
  }
}
