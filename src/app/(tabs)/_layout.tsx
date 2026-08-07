import { Tabs, useSegments } from 'expo-router';
import { AppTabBar } from '@/components/app-tab-bar';

export default function TabsLayout() {
  const segments = useSegments();
  const hideTabBar = (segments as string[]).includes('subscriptions');

  return (
    <Tabs
      tabBar={(props) => (hideTabBar ? null : <AppTabBar {...props} />)}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Chat' }} />
      <Tabs.Screen name="packs" options={{ title: 'Packs' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
