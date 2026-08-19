import * as Haptics from 'expo-haptics';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { useTheme } from '@/hooks/use-theme';

const TAB_ICONS: Record<string, string> = {
  index: '🏠',
  history: '📖',
  trends: '📊',
  assistant: '🧠',
  settings: '⚙️',
};

const TAB_TITLES: Record<string, string> = {
  index: 'MAISON',
  history: 'JOURNAL',
  trends: 'STATS',
  assistant: 'EXPERT',
  settings: 'OPTIONS',
};

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <PixelTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="trends" />
      <Tabs.Screen name="assistant" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

/**
 * Sous-ensemble des props de tab bar réellement utilisées (typage structurel :
 * importer BottomTabBarProps créerait une 2e copie de @react-navigation/bottom-tabs
 * en conflit avec celle d'expo-router).
 */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
}

/** Tab bar façon menu Pokémon : cadre pixel, onglet actif en accent. */
function PixelTabBar({ state, navigation }: TabBarProps) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom - 6, 6),
        },
      ]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;

        const onPress = () => {
          Haptics.selectionAsync();
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable key={route.key} onPress={onPress} style={styles.tab}>
            <Text style={styles.icon}>{TAB_ICONS[route.name] ?? '❓'}</Text>
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                { color: isFocused ? colors.accent : colors.textSecondary },
              ]}>
              {TAB_TITLES[route.name] ?? route.name.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 3,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  icon: {
    fontSize: 16,
  },
  label: {
    fontSize: 7,
  },
});
