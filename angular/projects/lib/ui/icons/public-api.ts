/*
 * @anotoki/lib/ui/icons - the family's other icons, beside the ones the kit's own
 * components draw (@anotoki/lib/ui: sun, moon, menu, x, check, ...). Data only:
 * one constant per icon, the `d` of each path on a 24-unit grid, for a site to
 * register the ones its templates name -
 *
 *   provideAnotokiUi(() => ({ icons: { trash: iconTrash, users: iconUsers } }))
 *
 * - and nothing else lands in its bundle. Written out as plain strings (no
 * function runs when the module loads), so an icon nobody imports is left out.
 * Generated from the IAM's and the survey's icon sets.
 */

import type { IconPaths } from '@anotoki/lib/ui';

export const iconActivity: IconPaths = ['M22 12h-4l-3 9L9 3l-3 9H2'];
export const iconAppWindow: IconPaths = ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2z', 'M2 9h20', 'M6 6.5h.01', 'M9 6.5h.01'];
export const iconArrowDown: IconPaths = ['M12 5v14', 'M19 12l-7 7-7-7'];
export const iconArrowRight: IconPaths = ['M5 12h14', 'M12 5l7 7-7 7'];
export const iconArrowUp: IconPaths = ['M12 19V5', 'M5 12l7-7 7 7'];
export const iconBan: IconPaths = ['M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0', 'M4.9 4.9l14.2 14.2'];
export const iconBold: IconPaths = ['M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8'];
export const iconCalendar: IconPaths = ['M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z', 'M16 2v4', 'M8 2v4', 'M3 10h18'];
export const iconChart: IconPaths = ['M3 3v16a2 2 0 0 0 2 2h16', 'M7 16h8', 'M7 11h12', 'M7 6h3'];
export const iconCheckSquare: IconPaths = ['M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3z', 'M8.5 12l2.5 2.5 4.5-5'];
export const iconChevronUp: IconPaths = ['M18 15l-6-6-6 6'];
export const iconClipboardList: IconPaths = [
  'M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1z',
  'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2',
  'M12 11h4',
  'M12 16h4',
  'M8 11h.01',
  'M8 16h.01',
];
export const iconClock: IconPaths = ['M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0', 'M12 6v6l4 2'];
export const iconCollapse: IconPaths = ['M7 20l5-5 5 5', 'M7 4l5 5 5-5'];
export const iconColumns: IconPaths = ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z', 'M12 3v18'];
export const iconCornerDownRight: IconPaths = ['M15 10l5 5-5 5', 'M4 4v7a4 4 0 0 0 4 4h12'];
export const iconDashboard: IconPaths = [
  'M4 3h5a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1z',
  'M15 3h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1z',
  'M15 12h5a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1z',
  'M4 16h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1z',
];
export const iconDatabase: IconPaths = ['M3 5a9 3 0 1 0 18 0a9 3 0 1 0-18 0', 'M3 5v14a9 3 0 0 0 18 0V5', 'M3 12a9 3 0 0 0 18 0'];
export const iconDice: IconPaths = ['M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12a3 3 0 0 1 3 -3z', 'M8 8h.01', 'M16 8h.01', 'M12 12h.01', 'M8 16h.01', 'M16 16h.01'];
export const iconDownload: IconPaths = ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'];
export const iconEraser: IconPaths = ['M4 7V4h16v3', 'M5 20h6', 'M13 4 8 20', 'M15 15l5 5', 'M20 15l-5 5'];
export const iconExpand: IconPaths = ['M7 15l5 5 5-5', 'M7 9l5-5 5 5'];
export const iconFileText: IconPaths = ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M10 9H8', 'M16 13H8', 'M16 17H8'];
export const iconFilter: IconPaths = ['M10 20a1 1 0 0 0 .55.9l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .52-1.34l7.22-7.99A1 1 0 0 0 21 3H3a1 1 0 0 0-.74 1.67l7.22 7.99A2 2 0 0 1 10 14z'];
export const iconFlask: IconPaths = ['M14 2v6a2 2 0 0 0 .25.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.76-2.96l5.51-10.08A2 2 0 0 0 10 8V2', 'M6.45 15h11.1', 'M8.5 2h7'];
export const iconGlobe: IconPaths = ['M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'];
export const iconGrid: IconPaths = [
  'M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z',
  'M15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z',
  'M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z',
  'M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z',
];
export const iconGrip: IconPaths = [
  'M8 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  'M8 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  'M8 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  'M14 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  'M14 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
  'M14 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
];
export const iconHeading: IconPaths = ['M6 12h12', 'M6 20V4', 'M18 20V4'];
export const iconHighlighter: IconPaths = ['M9 11l-6 6v3h9l3-3', 'M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'];
export const iconHistory: IconPaths = ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2'];
export const iconImage: IconPaths = ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2z', 'M7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', 'M21 15l-3.09-3.09a2 2 0 0 0-2.82 0L6 21'];
export const iconImageOff: IconPaths = [
  'M2 2l20 20',
  'M10.41 10.41a2 2 0 1 1-2.83-2.83',
  'M13.5 13.5 6 21',
  'M18 12l3 3',
  'M3.59 3.59A2 2 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.05-.22 1.41-.59',
  'M21 15V5a2 2 0 0 0-2-2H9',
];
export const iconImagePlus: IconPaths = [
  'M16 5h6',
  'M19 2v6',
  'M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5',
  'M21 15l-3.09-3.09a2 2 0 0 0-2.82 0L6 21',
  'M7 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0',
];
export const iconItalic: IconPaths = ['M19 4h-9', 'M14 20H5', 'M15 4 9 20'];
export const iconKey: IconPaths = ['M2 15.5a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0 -11 0', 'M21 2l-9.6 9.6', 'M15.5 7.5l3 3L22 7l-3-3'];
export const iconLanguages: IconPaths = ['M5 8l6 6', 'M4 14l6-6 2-3', 'M2 5h12', 'M7 2h1', 'M22 22l-5-10-5 10', 'M14 18h6'];
export const iconLaptop: IconPaths = ['M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16'];
export const iconLayers: IconPaths = ['M12 2 2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'];
export const iconLink: IconPaths = ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'];
export const iconListBullets: IconPaths = ['M3 6h.01', 'M3 12h.01', 'M3 18h.01', 'M8 6h13', 'M8 12h13', 'M8 18h13'];
export const iconListOrdered: IconPaths = ['M10 6h11', 'M10 12h11', 'M10 18h11', 'M4 6h1v4', 'M4 10h2', 'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'];
export const iconLock: IconPaths = ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-7a2 2 0 0 1 2 -2z', 'M7 11V7a5 5 0 0 1 10 0v4'];
export const iconMail: IconPaths = ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2z', 'M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'];
export const iconMessage: IconPaths = ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'];
export const iconMoreHorizontal: IconPaths = ['M4 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0', 'M18 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'];
export const iconPencil: IconPaths = ['M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z', 'M15 5l4 4'];
export const iconPlay: IconPaths = ['M6 3l14 9-14 9z'];
export const iconRadio: IconPaths = ['M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M8.5 12a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0'];
export const iconRedo: IconPaths = ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'];
export const iconRotateCcw: IconPaths = ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'];
export const iconScale: IconPaths = ['M3 12h18', 'M3 8v8', 'M21 8v8', 'M12 9v6', 'M7.5 10v4', 'M16.5 10v4'];
export const iconSend: IconPaths = ['M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.02.94l7.93 3.18a2 2 0 0 1 1.11 1.11z', 'M21.85 2.15 10.91 13.09'];
export const iconShieldCheck: IconPaths = [
  'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  'M9 12l2 2 4-4',
];
export const iconSliders: IconPaths = ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'];
export const iconSmartphone: IconPaths = ['M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2z', 'M12 18h.01'];
export const iconStopCircle: IconPaths = ['M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0', 'M10 9h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1z'];
export const iconStrike: IconPaths = ['M16 4H9a3 3 0 0 0-2.83 4', 'M14 12a4 4 0 0 1 0 8H6', 'M4 12h16'];
export const iconTerminal: IconPaths = ['M4 17l6-6-6-6', 'M12 19h8'];
export const iconText: IconPaths = ['M21 6H3', 'M17 12H3', 'M15 18H3'];
export const iconTrash: IconPaths = ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'];
export const iconUnderline: IconPaths = ['M6 4v6a6 6 0 0 0 12 0V4', 'M4 20h16'];
export const iconUndo: IconPaths = ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'];
export const iconUnlink: IconPaths = [
  'M18.84 12.25l1.72-1.71a5 5 0 0 0-.12-7.07 5 5 0 0 0-6.95 0l-1.72 1.71',
  'M5.17 11.75l-1.71 1.71a5 5 0 0 0 .12 7.07 5 5 0 0 0 6.95 0l1.71-1.71',
  'M8 2v3',
  'M2 8h3',
  'M16 19v3',
  'M19 16h3',
];
export const iconUserPlus: IconPaths = ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0', 'M19 8v6', 'M22 11h-6'];
export const iconUsers: IconPaths = ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'];
export const iconZoomIn: IconPaths = ['M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0', 'M21 21l-4.35-4.35', 'M11 8v6', 'M8 11h6'];
