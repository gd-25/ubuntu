import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { HouseMap } from '@/components/house-map';
import { BasketSprite } from '@/components/map-object';
import { useTheme } from '@/hooks/use-theme';
import { BASKET_H, BASKET_W, MAP_H, MAP_W, type Spot } from '@/lib/house';

/**
 * Reconstitution d'un focus sur le plan : la carte entière rendue en
 * zoom dans une fenêtre rognée, centrée sur `center`, avec le panier
 * dessiné à sa position. Utilisée par la modale Dodo (« Position du
 * panier »).
 */
export function MapFocus({
  center,
  night,
  height = 88,
  zoom = 1.3,
}: {
  center: Spot;
  night: boolean;
  height?: number;
  zoom?: number;
}) {
  const colors = useTheme();
  const [width, setWidth] = useState(0);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.window, { height, borderColor: colors.border }]}>
      {width > 0 ? (
        <View
          style={{
            position: 'absolute',
            width: MAP_W * zoom,
            height: MAP_H * zoom,
            left: width / 2 - center.x * zoom,
            top: height / 2 - center.y * zoom,
          }}>
          <HouseMap night={night} />
          <View
            style={{
              position: 'absolute',
              left: (center.x - BASKET_W / 2) * zoom,
              top: (center.y - BASKET_H / 2) * zoom,
              width: BASKET_W * zoom,
              height: BASKET_H * zoom,
            }}>
            <BasketSprite night={night} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  window: {
    borderWidth: 2,
    borderRadius: 2,
    overflow: 'hidden',
  },
});
