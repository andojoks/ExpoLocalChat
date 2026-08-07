import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { getGoogleClientIds } from '@/config/api';
import { useAuth } from '@/auth/AuthProvider';

WebBrowser.maybeCompleteAuthSession();

export function useGoogleAuth() {
  const { signInWithGoogle } = useAuth();
  const ids = getGoogleClientIds();
  const [request, , promptAsync] = Google.useIdTokenAuthRequest({
    clientId: ids.webClientId || undefined,
    iosClientId: ids.iosClientId || undefined,
    androidClientId: ids.androidClientId || undefined,
    webClientId: ids.webClientId || undefined,
  });

  async function signIn() {
    if (!ids.webClientId && !ids.iosClientId && !ids.androidClientId) {
      throw new Error('Google sign-in is not configured yet');
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

  return {
    ready: !!request || Platform.OS === 'web',
    signIn,
  };
}
