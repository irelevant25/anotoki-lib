/*
 * The unit tests' setup (angular.json: test.options.setupFiles); not part of the package.
 *
 * jsdom has <dialog> and its `open`, but neither showModal() nor close(): enough
 * of both for the components' tests - the open attribute, the close event, and
 * the focus going back where it was.
 */

const dialogs = HTMLDialogElement.prototype;

if (typeof dialogs.showModal !== 'function') {
  const focusBefore = new WeakMap<HTMLDialogElement, Element | null>();

  dialogs.showModal = function (this: HTMLDialogElement): void {
    if (this.hasAttribute('open')) {
      throw new DOMException('The dialog is already open.', 'InvalidStateError');
    }
    focusBefore.set(this, this.ownerDocument.activeElement);
    this.setAttribute('open', '');
  };

  dialogs.show = dialogs.showModal;

  dialogs.close = function (this: HTMLDialogElement, returnValue?: string): void {
    if (!this.hasAttribute('open')) {
      return;
    }
    this.removeAttribute('open');
    if (returnValue !== undefined) {
      this.returnValue = returnValue;
    }
    const before = focusBefore.get(this);
    if (before instanceof HTMLElement) {
      before.focus();
    }
    this.dispatchEvent(new Event('close'));
  };
}
