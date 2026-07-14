import { Tabs } from 'expo-router';
import { CalendarDays, House, Settings, TrendingUp } from 'lucide-react-native';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_FONT } from '@/components/text';
import { useTheme } from '@/hooks/use-theme';

export default function TabsLayout() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        headerTitleStyle: { fontFamily: APP_FONT, fontSize: 17 },
        tabBarLabelStyle: { fontFamily: APP_FONT, fontSize: 11 },
        // Floating pill tab bar.
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: Math.max(insets.bottom, 16),
          height: 64,
          paddingTop: 6,
          paddingBottom: 10,
          borderRadius: 32,
          borderTopWidth: 0,
          backgroundColor: colors.card,
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
          ...Platform.select({ android: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border } }),
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Direct',
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historique',
          tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="trends"
        options={{
          title: 'Tendances',
          tabBarIcon: ({ color, size }) => <TrendingUp color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Réglages',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
