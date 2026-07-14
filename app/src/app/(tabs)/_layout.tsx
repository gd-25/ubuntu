import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { CalendarDays, House, Settings, TrendingUp } from 'lucide-react-native';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_FONT } from '@/components/text';
import { useTheme } from '@/hooks/use-theme';

const Icon = NativeTabs.Trigger.Icon;
const Label = NativeTabs.Trigger.Label;

export default function TabsLayout() {
  // iOS : tab bar 100 % native (liquid glass sur iOS 26), compacte et translucide.
  if (Platform.OS === 'ios') {
    return (
      <NativeTabs
        labelStyle={{ fontFamily: APP_FONT, fontSize: 11 }}
        blurEffect="systemChromeMaterial"
        disableTransparentOnScrollEdge>
        <NativeTabs.Trigger name="index">
          <Icon sf="waveform" />
          <Label>Direct</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="history">
          <Icon sf="calendar" />
          <Label>Historique</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="trends">
          <Icon sf="chart.line.uptrend.xyaxis" />
          <Label>Tendances</Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <Icon sf="gearshape.fill" />
          <Label>Réglages</Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return <FallbackTabs />;
}

/** Android / web : tabs JS classiques (pas de tab bar native liquid glass). */
function FallbackTabs() {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontFamily: APP_FONT, fontSize: 11 },
        tabBarStyle: {
          paddingBottom: Math.max(insets.bottom, 6),
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: colors.card,
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
