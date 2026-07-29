import DateTimePicker from '@react-native-community/datetimepicker';
import { Modal, Pressable, StyleSheet, View, useColorScheme, type ViewStyle } from 'react-native';

import { Text, TextInput } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Boîte de dialogue rétro commune aux modales de l'écran d'accueil :
 * fond assombri, cadre pixel avec ombre portée dure, titre, contenu libre.
 * Alignée en haut (dans l'espace vert au-dessus des arbres) via `topOffset`.
 */
export function PixelDialog({
  visible,
  onRequestClose,
  title,
  topOffset,
  children,
}: {
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  /** Décalage du haut de l'écran (généralement insets.top + 40). */
  topOffset: number;
  children: React.ReactNode;
}) {
  const colors = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={[styles.backdrop, { paddingTop: topOffset }]}>
        {/* Pas d'animation Reanimated `entering` ici : dans une Modal
            native elle peut rester bloquée à l'état initial (boîte
            invisible, vu dans Expo Go) — le fade natif de la Modal suffit. */}
        <View
          style={[
            styles.dialog,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              boxShadow: `5px 5px 0px 0px ${colors.border}`,
            },
          ]}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** Libellé de champ dans un dialogue. */
export function DialogLabel({ children }: { children: React.ReactNode }) {
  const colors = useTheme();
  return <Text style={[styles.label, { color: colors.textSecondary }]}>{children}</Text>;
}

/**
 * Champ date sur toute la ligne (libellé à gauche, sélecteur à droite) :
 * l'événement est daté d'aujourd'hui par défaut, modifiable si on le
 * saisit après coup.
 */
export function DialogDate({
  value,
  onChange,
  label = 'DATE',
}: {
  value: Date;
  onChange: (day: Date) => void;
  label?: string;
}) {
  const scheme = useColorScheme();
  return (
    <View style={styles.dateRow}>
      <DialogLabel>{label}</DialogLabel>
      <DateTimePicker
        value={value}
        mode="date"
        display="compact"
        locale="fr-FR"
        maximumDate={new Date()}
        themeVariant={scheme === 'dark' ? 'dark' : 'light'}
        onChange={(_, date) => {
          if (date) onChange(date);
        }}
      />
    </View>
  );
}

/** Rangée ANNULER / valider en bas de dialogue. */
export function DialogButtons({
  onCancel,
  onConfirm,
  confirmLabel = 'OK !',
  cancelLabel = 'ANNULER',
  confirmDisabled = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
}) {
  const colors = useTheme();
  return (
    <View style={styles.buttons}>
      <Pressable
        onPress={onCancel}
        style={[styles.button, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <Text style={[styles.buttonText, { color: colors.text }]}>{cancelLabel}</Text>
      </Pressable>
      <Pressable
        onPress={onConfirm}
        disabled={confirmDisabled}
        style={[
          styles.button,
          {
            backgroundColor: colors.accent,
            borderColor: colors.border,
            opacity: confirmDisabled ? 0.4 : 1,
          },
        ]}>
        <Text style={[styles.buttonText, { color: colors.accentText }]}>{confirmLabel}</Text>
      </Pressable>
    </View>
  );
}

/**
 * Chip pixel sélectionnable (fraction de ration, caca, lieu de dodo…).
 * `big` : bouton objet « 3D » — plus haut, emoji en grand, ombre portée
 * dure quand il est sélectionné.
 */
export function Chip({
  label,
  emoji,
  selected,
  onPress,
  big = false,
  emojiSize,
  style,
}: {
  /** Absent : bouton objet à emoji seul. */
  label?: string;
  emoji?: string;
  selected: boolean;
  onPress: () => void;
  big?: boolean;
  /** Taille de l'emoji (ex. petit caca 16, gros caca 26). */
  emojiSize?: number;
  style?: ViewStyle;
}) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        big && styles.chipBig,
        {
          backgroundColor: selected ? colors.accent : colors.background,
          borderColor: colors.border,
          boxShadow: selected && big ? `3px 3px 0px 0px ${colors.border}` : undefined,
        },
        style,
      ]}>
      {emoji ? (
        <Text
          style={[big ? styles.chipEmojiBig : styles.chipEmoji, emojiSize ? { fontSize: emojiSize } : null]}>
          {emoji}
        </Text>
      ) : null}
      {label ? (
        <Text
          style={[styles.chipText, { color: selected ? colors.accentText : colors.text }]}
          numberOfLines={2}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Champ texte libre commun aux modales (observations, détails…). La touche
 * retour du clavier (en bas à droite) devient « OK » et FERME le clavier :
 * un champ multiligne garderait sinon le clavier bloqué ouvert (pas de
 * retour à la ligne dans les notes, tant pis).
 */
export function DialogNotes({
  value,
  onChangeText,
  placeholder = 'Notes libres…',
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  const colors = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      multiline
      returnKeyType="done"
      submitBehavior="blurAndSubmit"
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      style={[
        styles.notes,
        { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 3,
    borderRadius: 2,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  title: {
    fontSize: 12,
    marginBottom: 2,
  },
  label: {
    fontSize: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 2,
  },
  button: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 9,
  },
  chip: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  chipBig: {
    paddingVertical: 12,
  },
  chipEmoji: {
    fontSize: 12,
  },
  chipEmojiBig: {
    fontSize: 22,
  },
  chipText: {
    fontSize: 8,
    textAlign: 'center',
    lineHeight: 12,
  },
  notes: {
    borderWidth: 2,
    borderRadius: 2,
    minHeight: 44,
    padding: Spacing.sm,
    fontSize: 8,
    lineHeight: 13,
  },
});
