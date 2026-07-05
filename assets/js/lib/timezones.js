/** Shared timezone helpers, adapted from Tibia Warzones Schedule. */

export const TIMEZONE_STORAGE_KEY = 'tz';
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo#Curitiba';

export const SUPPORTED_TIMEZONES = [
  { group: 'Americas', value: 'America/Los_Angeles', label: 'Los Angeles' },
  { group: 'Americas', value: 'America/Tijuana', label: 'Tijuana' },
  { group: 'Americas', value: 'America/Denver', label: 'Denver' },
  { group: 'Americas', value: 'America/Mexico_City', label: 'Mexico City' },
  { group: 'Americas', value: 'America/Bogota', label: 'Bogota' },
  { group: 'Americas', value: 'America/Cancun', label: 'Cancun' },
  { group: 'Americas', value: 'America/Chicago', label: 'Chicago' },
  { group: 'Americas', value: 'America/Lima', label: 'Lima' },
  { group: 'Americas', value: 'America/Rio_Branco', label: 'Rio Branco' },
  { group: 'Americas', value: 'America/Caracas', label: 'Caracas' },
  { group: 'Americas', value: 'America/Cuiaba', label: 'Cuiaba' },
  { group: 'Americas', value: 'America/Manaus', label: 'Manaus' },
  { group: 'Americas', value: 'America/New_York', label: 'New York' },
  { group: 'Americas', value: 'America/Porto_Velho', label: 'Porto Velho' },
  { group: 'Americas', value: 'America/Santiago', label: 'Santiago' },
  { group: 'Americas', value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires' },
  { group: 'Americas', value: DEFAULT_TIMEZONE, timeZone: 'America/Sao_Paulo', label: 'Curitiba' },
  { group: 'Americas', value: 'America/Bahia', label: 'Xique-Xique' },
  { group: 'Americas', value: 'America/Noronha', label: 'Fernando de Noronha' },
  { group: 'Europe', value: 'Europe/Lisbon', label: 'Lisbon' },
  { group: 'Europe', value: 'Europe/London', label: 'London' },
  { group: 'Europe', value: 'Europe/Amsterdam', label: 'Amsterdam' },
  { group: 'Europe', value: 'Europe/Berlin', label: 'Berlin' },
  { group: 'Europe', value: 'Europe/Madrid', label: 'Madrid' },
  { group: 'Europe', value: 'Europe/Paris', label: 'Paris' },
  { group: 'Europe', value: 'Europe/Rome', label: 'Rome' },
  { group: 'Europe', value: 'Europe/Stockholm', label: 'Stockholm' },
  { group: 'Europe', value: 'Europe/Warsaw', label: 'Warsaw' },
  { group: 'Europe', value: 'Europe/Athens', label: 'Athens' },
  { group: 'Europe', value: 'Europe/Bucharest', label: 'Bucharest' },
  { group: 'Europe', value: 'Europe/Helsinki', label: 'Helsinki' },
  { group: 'Europe', value: 'Europe/Istanbul', label: 'Istanbul' },
  { group: 'Europe', value: 'Europe/Moscow', label: 'Moscow' },
  { group: 'Asia / Pacific', value: 'Asia/Dubai', label: 'Dubai' },
  { group: 'Asia / Pacific', value: 'Asia/Kolkata', label: 'Kolkata' },
  { group: 'Asia / Pacific', value: 'Asia/Singapore', label: 'Singapore' },
  { group: 'Asia / Pacific', value: 'Asia/Seoul', label: 'Seoul' },
  { group: 'Asia / Pacific', value: 'Asia/Tokyo', label: 'Tokyo' },
  { group: 'Asia / Pacific', value: 'Australia/Sydney', label: 'Sydney' },
  { group: 'Asia / Pacific', value: 'Pacific/Auckland', label: 'Auckland' },
];

export function findSupportedTimezoneEntry(tz) {
  return SUPPORTED_TIMEZONES.find((item) => item.value === tz) ||
    SUPPORTED_TIMEZONES.find((item) => item.timeZone === tz) ||
    null;
}

export function resolveTimezoneValue(tz) {
  return findSupportedTimezoneEntry(tz)?.timeZone || tz || 'UTC';
}

export function getTimezoneOffsetLabel(tz, referenceDate = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: resolveTimezoneValue(tz),
      timeZoneName: 'longOffset',
    }).formatToParts(referenceDate);
    const value = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
    return value.replace('GMT', 'UTC');
  } catch {
    return 'UTC';
  }
}

export function getTimezoneShortLabel(tz, referenceDate = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: resolveTimezoneValue(tz),
      timeZoneName: 'short',
    }).formatToParts(referenceDate);
    const value = parts.find((part) => part.type === 'timeZoneName')?.value || '';
    return value.replace(/^GMT([+-]\d{1,2})(?::\d{2})?$/, 'UTC$1');
  } catch {
    return '';
  }
}

export function formatCompactGmtOffset(value) {
  return String(value || 'UTC')
    .replace('UTC', 'GMT')
    .replace(/:00$/, '')
    .replace(/([+-])0(\d)$/, '$1$2');
}

export function getTimezoneDisplayLabel(tz, referenceDate = new Date()) {
  const entry = findSupportedTimezoneEntry(tz);
  const shortLabel = getTimezoneShortLabel(tz, referenceDate);
  const offsetCompact = formatCompactGmtOffset(getTimezoneOffsetLabel(tz, referenceDate));
  const normalizedShort = shortLabel
    .replace('UTC', 'GMT')
    .replace(/:00$/, '')
    .replace(/([+-])0(\d)$/, '$1$2');

  if (entry) {
    return shortLabel && normalizedShort !== offsetCompact
      ? `${entry.label} (${shortLabel}, ${offsetCompact})`
      : `${entry.label} (${offsetCompact})`;
  }
  return `${tz || 'UTC'} (${offsetCompact})`;
}

export function datePartsInTimezone(input, tz) {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: resolveTimezoneValue(tz),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'short',
    }).formatToParts(date);
    return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  } catch {
    return null;
  }
}

export function dateKeyInTimezone(input, tz) {
  const parts = datePartsInTimezone(input, tz);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : null;
}

export function formatDateInTimezone(input, tz) {
  return dateKeyInTimezone(input, tz) || '';
}

export function formatDateTimeInTimezone(input, tz) {
  const parts = datePartsInTimezone(input, tz);
  if (!parts) return null;
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${parts.timeZoneName || ''}`.trim();
}
