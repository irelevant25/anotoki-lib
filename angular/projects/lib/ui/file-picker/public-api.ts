/*
 * @anotoki/lib/ui/file-picker - <anotoki-file-picker>: files chosen to send - a real button that opens the device's
 * file chooser, and an area round it that takes files dropped on it (never the only way); the kinds taken (`accept`)
 * and the largest size (`maxSize`) checked in the browser, a file refused with its reason; one file or many, listed with
 * a remove button each. It never uploads: `files` is the browser's File objects, for the site to send - and its server
 * checks every file again. Its words (`anotoki.filePicker.*`) are @anotoki/lib/words/file-picker, read by the picker.
 *
 * For lazy pages: not re-exported by @anotoki/lib/ui, and nothing a site draws on every page should import it.
 */

export { accepts, writtenSize } from './src/files';
export { FilePickerComponent } from './src/file-picker/file-picker.component';
