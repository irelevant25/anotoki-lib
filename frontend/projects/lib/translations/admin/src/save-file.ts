/**
 * Hands the browser a file to save, made here: the text came through the API
 * under the person's sign-in, and the address the browser saves from is a
 * blob's - nothing of the API's stands in an address a person could pass on.
 */
export function saveFile(document: Document, name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
