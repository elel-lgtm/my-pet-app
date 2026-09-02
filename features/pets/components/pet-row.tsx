import { Pressable, StyleSheet, View } from 'react-native';

import { Badge, Icon, Text } from '@/components/ui';
import { MIN_TOUCH_TARGET, Spacing } from '@/constants/theme';
import { PetAvatar } from '@/features/pets/components/pet-avatar';
import { describePet, statusLabel, statusTone } from '@/features/pets/pet-presentation';
import { useTheme } from '@/hooks/use-theme';
import { type Pet } from '@/lib/domain/pet';

/**
 * One pet in the list.
 *
 * Deliberately three lines at most: name, a short description, and a status badge only when the
 * status is worth interrupting for. A row that shows every field is a row nobody scans.
 *
 * The whole row is one accessibility element with a composed label, so a screen reader announces
 * "Biscuit, Beagle, 4 years old, lost" as a single control rather than reading four fragments and
 * leaving the user to assemble them.
 */
export function PetRow({ pet, onPress }: { pet: Pet; onPress: () => void }) {
  const { colors } = useTheme();
  const description = describePet(pet);
  const badge = pet.status === 'active' ? null : statusLabel(pet.status);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[pet.name, description, badge].filter(Boolean).join(', ')}
      accessibilityHint="Opens this pet's profile"
      testID={`pet-row-${pet.id}`}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface }]}>
      <PetAvatar pet={pet} size={52} />

      <View style={styles.text}>
        <Text weight="semibold" numberOfLines={1}>
          {pet.name}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {description}
        </Text>
        {badge ? (
          <View style={styles.badge}>
            <Badge label={badge} tone={statusTone(pet.status)} />
          </View>
        ) : null}
      </View>

      <Icon name="chevronRight" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: MIN_TOUCH_TARGET + Spacing.md,
  },
  text: { flex: 1, gap: 2 },
  badge: { marginTop: Spacing.xs },
});
