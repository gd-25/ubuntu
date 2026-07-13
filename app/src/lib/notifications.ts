import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests permission, fetches the Expo push token and stores it in `push_tokens`.
 * Returns the token, or throws with a French message describing the problem.
 */
export async function registerForPushNotifications(userId: string): Promise<string> {
  if (!Device.isDevice) {
    throw new Error('Les notifications push nécessitent un appareil physique.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Alertes UBUNTU',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    throw new Error('Permission de notification refusée.');
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error(
      "Identifiant de projet EAS introuvable. Ajoutez extra.eas.projectId dans app.json (via `eas init`)."
    );
  }

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

  const { data: existing } = await supabase
    .from('push_tokens')
    .select('id')
    .eq('user_id', userId)
    .eq('expo_token', token)
    .limit(1);

  if (!existing || existing.length === 0) {
    const { error } = await supabase.from('push_tokens').insert({
      user_id: userId,
      expo_token: token,
      platform: Platform.OS,
    });
    if (error) throw error;
  }

  return token;
}
