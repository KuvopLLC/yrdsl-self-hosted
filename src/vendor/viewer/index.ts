export { SaleViewer } from './SaleViewer.js';
export type { SaleViewerProps } from './SaleViewer.js';
// Re-export the canonical types so consumers don't have to pull in @yrdsl/core directly.
export type { SaleSite, SaleItem, SaleContact, ReservationInfo } from '../core/sale.js';
export { LOCALE_NAMES, SUPPORTED_LOCALES, detectLocale, t, tPlural } from './i18n.js';
export type { MessageKey } from './i18n.js';
