import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import {
  getGoogleClientIds,
  getGoogleNativeReturnUri,
  getGoogleOAuthRedirectUri,
  isConfiguredGoogleClientId,
} from '@/config/api';
import { useAuth } from '@/auth/AuthProvider';

WebBrowser.maybeCompleteAuthSession();

export function useGoogleAuth() {
  const { signInWithGoogle, signInWithGoogleAuthorization } = useAuth();
  const ids = getGoogleClientIds();
  const androidAppLink = Platform.OS === 'android';
  const redirectUri = androidAppLink ? getGoogleOAuthRedirectUri() : undefined;

  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    clientId:
      ids.webClientId ||
      (androidAppLink ? 'unconfigured.apps.googleusercontent.com' : undefined),
    iosClientId: ids.iosClientId || undefined,
    webClientId: ids.webClientId || undefined,
    // Android App Links require a Web client + HTTPS redirect. The Android
    // client type only accepts a custom URI scheme, which Google no longer
    // recommends / allows by default.
    ...(androidAppLink
      ? { redirectUri, shouldAutoExchangeCode: false }
      : { androidClientId: ids.androidClientId || undefined }),
  });

  async function signIn() {
    if (androidAppLink) {
      if (!isConfiguredGoogleClientId(ids.webClientId)) {
        throw new Error(
          'Google sign-in on Android requires a Web client ID for App Links. Set extra.googleWebClientId.',
        );
      }
    } else if (
      !isConfiguredGoogleClientId(ids.webClientId) &&
      !isConfiguredGoogleClientId(ids.iosClientId) &&
      !isConfiguredGoogleClientId(ids.androidClientId)
    ) {
      throw new Error('Google sign-in is not configured yet');
    }

    if (androidAppLink) {
      await signInAndroidAppLink();
      return;
    }

    const result = await promptAsync();
    if (result.type !== 'success') {
      throw new Error('Google sign-in was cancelled');
    }

    const idToken =
      result.params.id_token ||
      (result as { authentication?: { idToken?: string } }).authentication?.idToken;
    if (!idToken) throw new Error('No Google ID token returned');
    await signInWithGoogle(idToken);
  }

  async function signInAndroidAppLink() {
    if (!request) throw new Error('Google sign-in is not ready');
    const authUrl = request.url || (await request.makeAuthUrlAsync(Google.discovery));
    // Chrome Custom Tabs will load the HTTPS App Link as a webpage and never
    // fire a Linking event. The website bounces to this custom scheme, which
    // CCT cannot render, so Android returns here.
    const nativeReturn = getGoogleNativeReturnUri();
    const browserResult = await WebBrowser.openAuthSessionAsync(authUrl, nativeReturn);
    if (browserResult.type !== 'success') {
      throw new Error('Google sign-in was cancelled');
    }
    const parsed = request.parseReturnUrl(browserResult.url);
    if (parsed.type !== 'success') {
      throw new Error(parsed.error?.message || 'Google sign-in failed');
    }
    const code = parsed.params.code;
    const codeVerifier = request.codeVerifier;
    if (!code || !codeVerifier || !redirectUri) {
      throw new Error('Google sign-in did not return an authorization code');
    }
    await signInWithGoogleAuthorization({ code, codeVerifier, redirectUri });
  }

  return {
    ready: !!request || Platform.OS === 'web',
    signIn,
  };
}
