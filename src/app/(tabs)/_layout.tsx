import { Tabs, useSegments } from 'expo-router';
import { AppTabBar } from '@/components/app-tab-bar';

export default function TabsLayout() {
  const segments = useSegments() as string[];
  const packsIdx = segments.indexOf('packs');
  const packsChild = packsIdx >= 0 ? segments[packsIdx + 1] : undefined;
  // Catalog is `packs` or `packs/index`; any deeper route is an opened pack.
  const inOpenedPack = Boolean(packsChild && packsChild !== 'index');
  const hideTabBar =
    segments.includes('subscriptions') ||
    segments.includes('preferences') ||
    inOpenedPack;

  return (
    <Tabs
      tabBar={(props) => (hideTabBar ? null : <AppTabBar {...props} />)}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: '#E8EEF5' },
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="packs" options={{ title: 'Packs' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="account" options={{ title: 'Account' }} />
    </Tabs>
  );
}
