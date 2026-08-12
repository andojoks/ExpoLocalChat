import Constants from 'expo-constants';

type Extra = {
  apiBaseUrl?: string;
  aboutUrl?: string;
  privacyUrl?: string;
  termsUrl?: string;
  shareUrl?: string;
  googleWebClientId?: string;
  googleIosClientId?: string;
  googleAndroidClientId?: string;
};

function extra(): Extra {
  return (Constants.expoConfig?.extra || {}) as Extra;
}

/** API host for auth, packs, and on-device model downloads (`extra.apiBaseUrl` in app.json). */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  const fromExtra = extra().apiBaseUrl?.trim();
  let base = (fromEnv || fromExtra || 'http://127.0.0.1:3000').replace(/\/$/, '');
  // Apex 308→www strips Authorization on fetch; always prefer the canonical host.
  if (base === 'https://theexpertlearner.com') {
    base = 'https://www.theexpertlearner.com';
  }
  return base;
}

function absoluteOrJoin(pathOrUrl: string | undefined, fallbackPath: string): string {
  if (pathOrUrl?.startsWith('http')) return pathOrUrl;
  if (pathOrUrl?.startsWith('/')) return `${getApiBaseUrl()}${pathOrUrl}`;
  return `${getApiBaseUrl()}${fallbackPath}`;
}

export function getAboutUrl() {
  return (
    process.env.EXPO_PUBLIC_ABOUT_URL?.trim() ||
    absoluteOrJoin(extra().aboutUrl, '/about')
  );
}

export function getPrivacyUrl() {
  return (
    process.env.EXPO_PUBLIC_PRIVACY_URL?.trim() ||
    absoluteOrJoin(extra().privacyUrl, '/privacy')
  );
}

export function getTermsUrl() {
  return (
    process.env.EXPO_PUBLIC_TERMS_URL?.trim() ||
    absoluteOrJoin(extra().termsUrl, '/terms')
  );
}

export function getShareUrl() {
  return (
    process.env.EXPO_PUBLIC_SHARE_URL?.trim() ||
    absoluteOrJoin(extra().shareUrl, '/')
  );
}

export function getGoogleClientIds() {
  return {
    webClientId:
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim() ||
      extra().googleWebClientId ||
      '',
    iosClientId:
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ||
      extra().googleIosClientId ||
      '',
    androidClientId:
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID?.trim() ||
      extra().googleAndroidClientId ||
      '',
  };
}
