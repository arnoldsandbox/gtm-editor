/**
 * Reserved names and IDs that GTM resolves without an entry in the export.
 */

/** Built-in triggers referenced by ID from firingTriggerId/blockingTriggerId. */
export const BUILT_IN_TRIGGERS: Readonly<Record<string, string>> = {
  '2147479553': 'All Pages',
  '2147479572': 'Initialization - All Pages',
  '2147479573': 'Consent Initialization - All Pages',
};

/** Variable names GTM resolves internally; they never appear in builtInVariable. */
export const RESERVED_VARIABLE_NAMES: ReadonlySet<string> = new Set(['_event']);

/**
 * Built-in variables for web containers: display name (as used in `{{...}}`)
 * to the `type` written in builtInVariable. Used to detect references to
 * built-ins that are not enabled and to enable them automatically.
 */
export const WEB_BUILT_IN_VARIABLES: Readonly<Record<string, string>> = {
  'Page URL': 'PAGE_URL',
  'Page Hostname': 'PAGE_HOSTNAME',
  'Page Path': 'PAGE_PATH',
  Referrer: 'REFERRER',
  Event: 'EVENT',
  'Click Element': 'CLICK_ELEMENT',
  'Click Classes': 'CLICK_CLASSES',
  'Click ID': 'CLICK_ID',
  'Click Target': 'CLICK_TARGET',
  'Click URL': 'CLICK_URL',
  'Click Text': 'CLICK_TEXT',
  'Form Element': 'FORM_ELEMENT',
  'Form Classes': 'FORM_CLASSES',
  'Form ID': 'FORM_ID',
  'Form Target': 'FORM_TARGET',
  'Form URL': 'FORM_URL',
  'Form Text': 'FORM_TEXT',
  'Error Message': 'ERROR_MESSAGE',
  'Error URL': 'ERROR_URL',
  'Error Line': 'ERROR_LINE',
  'Debug Mode': 'DEBUG_MODE',
  'Container ID': 'CONTAINER_ID',
  'Container Version': 'CONTAINER_VERSION',
  'Environment Name': 'ENVIRONMENT_NAME',
  'Random Number': 'RANDOM_NUMBER',
  'HTML ID': 'HTML_ID',
  'New History Fragment': 'NEW_HISTORY_FRAGMENT',
  'Old History Fragment': 'OLD_HISTORY_FRAGMENT',
  'New History State': 'NEW_HISTORY_STATE',
  'Old History State': 'OLD_HISTORY_STATE',
  'New History URL': 'NEW_HISTORY_URL',
  'Old History URL': 'OLD_HISTORY_URL',
  'History Source': 'HISTORY_SOURCE',
  'Video Provider': 'VIDEO_PROVIDER',
  'Video URL': 'VIDEO_URL',
  'Video Title': 'VIDEO_TITLE',
  'Video Duration': 'VIDEO_DURATION',
  'Video Percent': 'VIDEO_PERCENT',
  'Video Visible': 'VIDEO_VISIBLE',
  'Video Status': 'VIDEO_STATUS',
  'Video Current Time': 'VIDEO_CURRENT_TIME',
  'Scroll Depth Threshold': 'SCROLL_DEPTH_THRESHOLD',
  'Scroll Depth Units': 'SCROLL_DEPTH_UNITS',
  'Scroll Direction': 'SCROLL_DEPTH_DIRECTION',
  'Percent Visible': 'ELEMENT_VISIBILITY_RATIO',
  'On-Screen Duration': 'ELEMENT_VISIBILITY_TIME',
};

/** GTM's native exportTime format: "YYYY-MM-DD HH:MM:SS" in UTC. */
export function formatExportTime(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())} ` +
    `${p(date.getUTCHours())}:${p(date.getUTCMinutes())}:${p(date.getUTCSeconds())}`
  );
}
