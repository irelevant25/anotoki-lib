import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { kitProviders, press, settle, words } from '../../src/testing';
import { DialogFooterDirective } from './dialog-footer.directive';
import { ANOTOKI_DIALOG_DATA, AnotokiDialogRef } from './dialog-ref';
import { AnotokiDialog } from './dialog.service';

@Component({
  selector: 'anotoki-test-edit-person',
  imports: [DialogFooterDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label>Name <input id="person-name" [value]="person.name" /></label>
    <ng-template anotokiDialogFooter>
      <button type="button" id="person-cancel" (click)="ref.close()">Cancel</button>
      <button type="button" id="person-save" (click)="ref.close('saved ' + person.name)">Save</button>
    </ng-template>
  `,
})
class EditPersonComponent {
  protected readonly ref = inject<AnotokiDialogRef<string>>(AnotokiDialogRef);
  protected readonly person = inject(ANOTOKI_DIALOG_DATA) as { name: string };
}

describe('AnotokiDialog.open(): a component in a dialog, from code', () => {
  afterEach(() => document.querySelectorAll('anotoki-dialog-container').forEach((element) => element.remove()));

  it('draws the component with its data and footer, the focus inside; closing with a result settles `closed`', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const ref = TestBed.inject(AnotokiDialog).open<EditPersonComponent, string>(EditPersonComponent, { heading: 'Edit Mira', data: { name: 'Mira' }, size: 'sm' });
    await settle();
    const dialog = document.querySelector<HTMLDialogElement>('anotoki-dialog-container dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('data-size')).toBe('sm');
    expect(words(dialog.querySelector('h2'))).toBe('Edit Mira');
    expect(dialog.querySelector<HTMLInputElement>('#person-name')!.value).toBe('Mira');
    expect(Array.from(dialog.querySelectorAll('.footer button')).map(words)).toEqual(['Cancel', 'Save']);
    expect(document.activeElement?.id).toBe('person-name');

    ref.heading.set('Edit Mira Nováková');
    await settle();
    expect(words(dialog.querySelector('h2'))).toBe('Edit Mira Nováková');

    dialog.querySelector<HTMLButtonElement>('#person-save')!.click();
    expect(await ref.closed).toBe('saved Mira');
    await settle();
    expect(document.querySelector('anotoki-dialog-container')).toBeNull();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('dismissed (Escape): `closed` settles with nothing; busy holds it open', async () => {
    TestBed.configureTestingModule({ providers: kitProviders() });
    const ref = TestBed.inject(AnotokiDialog).open<EditPersonComponent, string>(EditPersonComponent, { heading: 'Edit', data: { name: 'Jo' } });
    await settle();
    const input = document.querySelector<HTMLElement>('#person-name')!;

    ref.busy.set(true);
    await settle();
    press(input, 'Escape');
    await settle();
    expect(ref.isClosed).toBe(false);

    ref.busy.set(false);
    await settle();
    press(input, 'Escape');
    expect(await ref.closed).toBeUndefined();
    expect(document.querySelector('anotoki-dialog-container')).toBeNull();
  });
});
