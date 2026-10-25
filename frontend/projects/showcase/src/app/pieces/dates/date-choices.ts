import { signal } from '@angular/core';
import { AnotokiDateChoices } from '@anotoki/lib/ui/config';

/** The account's date order and clock, as the showcase imagines them (the dates page chooses them): provideAnotokiUi's dateChoices. */
export const showcaseDateChoices = signal<AnotokiDateChoices | null>(null);
