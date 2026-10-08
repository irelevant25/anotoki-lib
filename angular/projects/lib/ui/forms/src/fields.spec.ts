import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { kitProviders, settle, words } from '../../src/testing';
import { CheckboxComponent } from './checkbox/checkbox.component';
import { CodeInputComponent } from './code-input/code-input.component';
import { PasswordFieldComponent } from './password-field/password-field.component';
import { RadioGroupComponent } from './radio-group/radio-group.component';
import { SelectComponent } from './select/select.component';
import { SwitchComponent } from './switch/switch.component';
import { TextFieldComponent } from './text-field/text-field.component';
import { TextareaComponent } from './textarea/textarea.component';

@Component({
  selector: 'anotoki-test-form',
  imports: [TextFieldComponent, TextareaComponent, PasswordFieldComponent, SelectComponent, CheckboxComponent, SwitchComponent, RadioGroupComponent, CodeInputComponent],
  template: `
    <anotoki-text-field id="name" label="Name" [(value)]="name" name="name" autocomplete="name" [hint]="hint()" [error]="error()" required [optional]="optional()">
      <span fieldSuffix id="suffix">kg</span>
    </anotoki-text-field>
    <anotoki-textarea id="bio" label="About you" [(value)]="bio" [disabled]="disabled()" [readonly]="true" required />
    <anotoki-password-field id="password" label="Password" autocomplete="current-password" [(value)]="password">
      <a labelAside href="/forgot" id="forgot">Forgot your password?</a>
    </anotoki-password-field>
    <anotoki-select id="pick" label="Language" [options]="options" placeholder="Choose…" [(value)]="picked" hideLabel />
    <anotoki-checkbox id="keep" [(checked)]="keep" hint="On this browser only">Keep me signed in</anotoki-checkbox>
    <anotoki-switch id="mail" [(checked)]="mail" [busy]="busy()">News by mail</anotoki-switch>
    <anotoki-radio-group id="plan" label="Plan" [options]="plans" [(value)]="plan" />
    <anotoki-code-input id="code" label="Code" [(value)]="code" (complete)="completed.push($event)" autofocus />
  `,
})
class FormComponent {
  readonly name = signal('');
  readonly bio = signal('Hello');
  readonly password = signal('');
  readonly picked = signal('');
  readonly keep = signal(false);
  readonly mail = signal(true);
  readonly plan = signal('free');
  readonly code = signal('');
  readonly hint = signal<string | null>('As people see it');
  readonly error = signal<string | null>(null);
  readonly optional = signal(false);
  readonly disabled = signal(false);
  readonly busy = signal(false);
  readonly completed: string[] = [];
  readonly options = [
    { value: 'en', label: 'English' },
    { value: 'sk', label: 'Slovenčina', lang: 'sk' },
  ];
  readonly plans = [
    { value: 'free', label: 'Free', hint: 'For one person' },
    { value: 'team', label: 'Team' },
  ];
}

describe('@anotoki/lib/ui/forms: the fields', () => {
  let fixture: ComponentFixture<FormComponent>;
  let host: HTMLElement;
  let form: FormComponent;
  let language: ReturnType<typeof signal<string>>;

  beforeEach(async () => {
    language = signal('en');
    TestBed.configureTestingModule({ providers: kitProviders(() => ({ language })) });
    fixture = TestBed.createComponent(FormComponent);
    host = fixture.nativeElement;
    form = fixture.componentInstance;
    document.body.appendChild(host);
    await settle(fixture);
  });

  afterEach(() => host.remove());

  const field = (id: string) => host.querySelector<HTMLElement>('#' + id)!;
  const input = (id: string) => field(id).querySelector<HTMLInputElement>('input, textarea, select')!;
  const type = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    element.value = value;
    element.dispatchEvent(new Event('input'));
  };

  describe('text field', () => {
    it('a real label for a real input; two-way value; required; the hint tied to it', async () => {
      const name = input('name');
      expect(field('name').querySelector(`label[for="${name.id}"]`)).not.toBeNull();
      expect(words(field('name').querySelector('label'))).toBe('Name');
      expect(name.required).toBe(true);
      expect(name.getAttribute('autocomplete')).toBe('name');
      expect(name.getAttribute('spellcheck')).toBe('false');
      expect(words(document.getElementById(name.getAttribute('aria-describedby')!))).toBe('As people see it');
      type(name, 'Mira');
      expect(form.name()).toBe('Mira');
      form.name.set('Jo');
      await settle(fixture);
      expect(name.value).toBe('Jo');
      expect(field('name').querySelector('.control #suffix')).not.toBeNull();
    });

    it('an error: said at once (role="alert"), tied to the input in place of the hint, aria-invalid', async () => {
      form.error.set('Write a name.');
      await settle(fixture);
      const name = input('name');
      const error = field('name').querySelector('.error')!;
      expect(error.getAttribute('role')).toBe('alert');
      expect(words(error)).toBe('Write a name.');
      expect(name.getAttribute('aria-invalid')).toBe('true');
      expect(name.getAttribute('aria-describedby')).toBe(error.id);
      expect(field('name').querySelector('.hint')).toBeNull();
    });

    it('"optional" after the label, in the page language', async () => {
      form.optional.set(true);
      await settle(fixture);
      expect(words(field('name').querySelector('.optional'))).toBe('optional');
      language.set('sk');
      await settle(fixture);
      expect(words(field('name').querySelector('.optional'))).toBe('nepovinné');
    });
  });

  it('textarea: value both ways, required, read-only, disabled', async () => {
    const bio = input('bio') as unknown as HTMLTextAreaElement;
    expect(bio.value).toBe('Hello');
    expect(bio.required).toBe(true);
    expect(bio.readOnly).toBe(true);
    form.disabled.set(true);
    await settle(fixture);
    expect(bio.disabled).toBe(true);
  });

  it('password field: hidden at first; the show button says what it does (aria-pressed), in the page language; the aside beside the label, not in it', async () => {
    const password = input('password');
    const reveal = field('password').querySelector<HTMLButtonElement>('.reveal')!;
    expect(password.type).toBe('password');
    expect(password.getAttribute('autocomplete')).toBe('current-password');
    expect(reveal.getAttribute('aria-pressed')).toBe('false');
    expect(reveal.getAttribute('aria-label')).toBe('Show password');
    reveal.click();
    await settle(fixture);
    expect(password.type).toBe('text');
    expect(reveal.getAttribute('aria-pressed')).toBe('true');
    expect(reveal.getAttribute('aria-label')).toBe('Hide password');
    language.set('sk');
    await settle(fixture);
    expect(reveal.getAttribute('aria-label')).toBe('Skryť heslo');
    expect(field('password').querySelector('label #forgot')).toBeNull();
    expect(field('password').querySelector('#forgot')).not.toBeNull();
  });

  it('select: native, its label for screen readers only, a placeholder, options with their own lang', async () => {
    const select = input('pick') as unknown as HTMLSelectElement;
    expect(field('pick').querySelector('label')?.classList).toContain('visually-hidden');
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['Choose…', 'English', 'Slovenčina']);
    expect(select.options[2].getAttribute('lang')).toBe('sk');
    select.value = 'sk';
    select.dispatchEvent(new Event('change'));
    expect(form.picked()).toBe('sk');
  });

  it('checkbox: a native checkbox inside its label, the hint tied to it', async () => {
    const box = input('keep');
    expect(box.type).toBe('checkbox');
    expect(box.closest('label')).not.toBeNull();
    expect(words(document.getElementById(box.getAttribute('aria-describedby')!))).toBe('On this browser only');
    box.click();
    expect(form.keep()).toBe(true);
  });

  it('switch: role="switch"; busy shows the save and blocks a second flip', async () => {
    const toggle = input('mail');
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.checked).toBe(true);
    toggle.click();
    expect(form.mail()).toBe(false);
    form.busy.set(true);
    await settle(fixture);
    expect(toggle.disabled).toBe(true);
    expect(toggle.getAttribute('aria-busy')).toBe('true');
    expect(field('mail').querySelector('anotoki-spinner')).not.toBeNull();
  });

  it('radio group: a fieldset of native radios, named by its legend', async () => {
    const group = field('plan');
    expect(words(group.querySelector('legend'))).toBe('Plan');
    const radios = Array.from(group.querySelectorAll<HTMLInputElement>('input[type=radio]'));
    expect(radios.map((radio) => radio.checked)).toEqual([true, false]);
    expect(new Set(radios.map((radio) => radio.name)).size).toBe(1);
    radios[1].click();
    expect(form.plan()).toBe('team');
  });

  it('code input: one real input (one-time-code), digits only, `complete` at the last one; autofocus', async () => {
    const code = input('code');
    expect(document.activeElement).toBe(code);
    expect(code.getAttribute('autocomplete')).toBe('one-time-code');
    expect(code.getAttribute('inputmode')).toBe('numeric');
    expect(field('code').querySelector('.cells')?.getAttribute('aria-hidden')).toBe('true');
    type(code, '12 3-45');
    expect(form.code()).toBe('12345');
    expect(form.completed).toEqual([]);
    type(code, '123 456 7');
    expect(form.code()).toBe('123456');
    expect(form.completed).toEqual(['123456']);
    await settle(fixture);
    expect(Array.from(field('code').querySelectorAll('.cell')).map(words)).toEqual(['1', '2', '3', '4', '5', '6']);
  });
});
