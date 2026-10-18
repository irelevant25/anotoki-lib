/**
 * Copies text to the clipboard: true when it worked.
 *
 * The Clipboard API needs a secure context (https, or localhost); where it is
 * missing or refuses (no permission, a document without the focus), the old
 * execCommand way is tried. False when neither worked - the person is then
 * told to copy by hand, never left believing it worked.
 */
export async function copyText(text: string, document: Document = globalThis.document): Promise<boolean> {
  const view = document.defaultView;
  try {
    if (view?.navigator.clipboard && view.isSecureContext !== false) {
      await view.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused: the old way, below.
  }

  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const done = typeof document.execCommand === 'function' && document.execCommand('copy');
    area.remove();
    return !!done;
  } catch {
    return false;
  }
}
