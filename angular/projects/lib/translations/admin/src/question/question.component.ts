import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ButtonComponent } from '@anotoki/lib/ui';
import { DialogComponent } from '@anotoki/lib/ui/dialog';
import { Questions } from '../questions';

/**
 * A page's open question, as the kit's dialog: its sentence under the title,
 * the no and the yes - the focus on the no, so a stray Enter gives the safe
 * answer. Escape, the backdrop and the close button answer no.
 */
@Component({
  selector: 'anotoki-translations-question',
  imports: [ButtonComponent, DialogComponent],
  templateUrl: './question.component.html',
  styleUrl: './question.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionComponent {
  readonly questions = input.required<Questions>();
}
