/**
 * Debug UI for agent tooling.
 * On in __DEV__, or set EXPO_PUBLIC_AGENT_DEBUG=true|1 for release builds.
 */
export const AGENT_DEBUG =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_AGENT_DEBUG === 'true' ||
  process.env.EXPO_PUBLIC_AGENT_DEBUG === '1';
