import { Tabs } from 'expo-router';

import { HapticTab } from '@/components/haptic-tab';
import { Icon } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';

/** The five tabs a pet owner sees. Other roles get their own group, not extra tabs here. */
export default function OwnerTabLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.tabIconDefault,
        tabBarButton: HapticTab,
        headerShown: true,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Icon name="home" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pets"
        options={{
          title: 'Pets',
          tabBarIcon: ({ color }) => <Icon name="pets" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color }) => <Icon name="map" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color }) => <Icon name="alerts" size={26} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Icon name="settings" size={26} color={color} />,
        }}
      />
    </Tabs>
  );
}
