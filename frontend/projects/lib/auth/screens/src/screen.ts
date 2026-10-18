import { DOCUMENT, DestroyRef, EnvironmentInjector, Signal, computed, inject, runInInjectionContext } from '@angular/core';
import { ANOTOKI_AUTH_CONFIG, SignInFailure, SignInSession, SignInWords, signInWords } from '@anotoki/lib/auth/core';

/*
 * What the module's two screens share - the callback page (<anotoki-auth-callback>) and the failure's screen
 * (<anotoki-sign-in-failure>, on the callback route or on a route of the site's own): the words in the visitor's
 * language, the failure to show, and the search engines kept off. Each is called in a component's constructor.
 */

/**
 * The words of signing in in the visitor's language, as the module's configuration says: its `language`, its
 * `words`, an owner's rewording through `translate` - each of them a function that may inject the site's services.
 */
export function signInText(): Signal<{ lang: string; words: SignInWords }> {
  const config = inject(ANOTOKI_AUTH_CONFIG);
  const injector = inject(EnvironmentInjector);
  return computed(() => {
    const language = config.language ? runInInjectionContext(injector, config.language) : 'en';
    return signInWords(language, config.words, config.translate ? (key) => runInInjectionContext(injector, () => config.translate?.(key)) : undefined);
  });
}

/** What went wrong, to show: a failure of the sign-in, or a sign-in that cannot be set up at all; null while there is none. */
export function shownFailure(auth: SignInSession = inject(SignInSession)): Signal<SignInFailure | null> {
  return computed(() => (auth.state() === 'unavailable' ? { code: 'unavailable', returnTo: null } : auth.signInFailure()));
}

/**
 * Asks search engines not to index the page while the component shows - `<meta name="robots" content="noindex">`
 * - and puts back what the page said before when it goes: a site's own tag as it was, or none. Search engines never
 * get the IAM's sign-in hint, so they are never sent to the IAM and back; a site keeps them off /auth/ in its
 * robots.txt as well. Two screens in one another put it back in turn.
 */
export function noIndexWhileShown(): void {
  const document = inject(DOCUMENT);
  const tag = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (tag) {
    const before = tag.content;
    tag.content = 'noindex';
    inject(DestroyRef).onDestroy(() => (tag.content = before));
    return;
  }
  const added = document.createElement('meta');
  added.name = 'robots';
  added.content = 'noindex';
  document.head.appendChild(added);
  inject(DestroyRef).onDestroy(() => added.remove());
}
