import {
  getCountries as getCountriesCore,
  getCountryCallingCode as getCountryCallingCodeCore,
  parsePhoneNumberFromString as parsePhoneCore,
  type MetadataJson,
} from 'libphonenumber-js/core';
import type { CountryCode } from 'libphonenumber-js';
import rawPhoneMetadata from 'libphonenumber-js/metadata.max.json';
import { COUNTRY_NAMES_EN } from '@/auth/country-names-en';

function phoneMetadata(): MetadataJson {
  const m = rawPhoneMetadata as MetadataJson & { default?: MetadataJson };
  if (m?.countries) return m;
  if (m?.default?.countries) return m.default;
  return m;
}

const PHONE_METADATA = phoneMetadata();

export const DEFAULT_PHONE_COUNTRY: CountryCode = 'CM';

/** Default country for MTN / Orange MoMo wallets (Cameroon). */
export const DEFAULT_MOMO_PHONE_COUNTRY: CountryCode = 'CM';

export type CountryDialOption = {
  code: CountryCode;
  callingCode: string;
  /** English country / region name for display + search. */
  name: string;
  label: string;
  /** Unicode regional-indicator flag emoji (e.g. 🇨🇲). */
  flag: string;
};

let cachedCountries: CountryDialOption[] | null = null;

/** ISO 3166-1 alpha-2 → flag emoji via regional indicator symbols. */
export function countryFlagEmoji(code: string): string {
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '🏳️';
  return String.fromCodePoint(
    ...[...cc].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0)),
  );
}

function countryDisplayName(code: CountryCode): string {
  const fromTable = COUNTRY_NAMES_EN[code];
  if (fromTable) return fromTable;
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    const name = dn.of(code);
    if (name && name !== code) return name;
  } catch {
    /* Hermes / older runtimes may lack DisplayNames */
  }
  return code;
}

/** ISO country list with dial codes and names for the country picker. */
export function listCountryDialOptions(): CountryDialOption[] {
  if (cachedCountries) return cachedCountries;
  cachedCountries = getCountriesCore(PHONE_METADATA)
    .map((code) => {
      const name = countryDisplayName(code);
      return {
        code,
        callingCode: `+${getCountryCallingCodeCore(code, PHONE_METADATA)}`,
        name,
        label: name,
        flag: countryFlagEmoji(code),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return cachedCountries;
}

/** Parse national digits + country into E.164, or null if empty/invalid. */
export function toE164(
  nationalNumber: string,
  country: CountryCode = DEFAULT_PHONE_COUNTRY,
): string | null {
  const trimmed = nationalNumber.replace(/[^\d]/g, '').trim();
  if (!trimmed) return null;
  const parsed = parsePhoneCore(trimmed, country, PHONE_METADATA);
  if (!parsed?.isValid()) return null;
  return parsed.format('E.164');
}

/** Validate optional phone; empty is ok. Returns error message or null. */
export function validateOptionalPhone(
  nationalNumber: string,
  country: CountryCode = DEFAULT_PHONE_COUNTRY,
): string | null {
  const trimmed = nationalNumber.replace(/[^\d]/g, '').trim();
  if (!trimmed) return null;
  if (!toE164(nationalNumber, country)) {
    return 'Enter a valid phone number for the selected country';
  }
  return null;
}

/** Validate required phone; empty is an error. */
export function validateRequiredPhone(
  nationalNumber: string,
  country: CountryCode = DEFAULT_PHONE_COUNTRY,
): string | null {
  const trimmed = nationalNumber.replace(/[^\d]/g, '').trim();
  if (!trimmed) return 'Enter the MoMo phone number for this payment';
  if (!toE164(nationalNumber, country)) {
    return 'Enter a valid phone number for the selected country';
  }
  return null;
}

/** Parse a stored E.164 into country + national digits for editing. */
export function splitE164(e164: string | null | undefined): {
  country: CountryCode;
  national: string;
} {
  if (!e164?.trim()) {
    return { country: DEFAULT_PHONE_COUNTRY, national: '' };
  }
  const parsed = parsePhoneCore(e164.trim(), PHONE_METADATA);
  if (!parsed?.isValid()) {
    return { country: DEFAULT_PHONE_COUNTRY, national: e164.replace(/[^\d]/g, '') };
  }
  return {
    country: parsed.country || DEFAULT_PHONE_COUNTRY,
    national: parsed.nationalNumber,
  };
}
