import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type Pet } from '@/lib/domain/pet';

/**
 * A pet's picture, or a stand-in for one.
 *
 * **Photo upload is not implemented.** No storage bucket exists, and inventing one is a backend
 * decision rather than a UI one — see the deferred note in ARCHITECTURE.md. `photoUrl` is
 * nevertheless honoured whenever it is set, so the day storage arrives this component needs no
 * change: rows that gain a URL simply start rendering it.
 *
 * Until then the fallback is the pet's initial on a surface tile. Initials rather than a generic
 * silhouette because a list of five identical placeholders is harder to scan than five distinct
 * letters.
 */
export type PetAvatarProps = {
  readonly pet: Pick<Pet, 'name' | 'photoUrl'>;
  readonly size?: number | undefined;
  readonly testID?: string | undefined;
};

function initialOf(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

export function PetAvatar({ pet, size = 48, testID }: PetAvatarProps) {
  const { colors } = useTheme();

  const shape = {
    width: size,
    height: size,
    // Squircle rather than a circle: it reads as a photo frame, which is what it will become.
    borderRadius: size >= 96 ? Radius.lg : Radius.md,
  };

  if (pet.photoUrl !== null && pet.photoUrl !== '') {
    return (
      <Image
        source={{ uri: pet.photoUrl }}
        // Decorative: the pet's name is already adjacent in every place this is used, so
        // announcing it again would make a screen reader read each row twice.
        accessibilityElementsHidden
        importantForAccessibility="no"
        contentFit="cover"
        transition={120}
        style={[shape, { backgroundColor: colors.surface }]}
        testID={testID}
      />
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        shape,
        styles.fallback,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      testID={testID}>
      <Text
        variant={size >= 96 ? 'title' : 'subtitle'}
        weight="bold"
        style={{ color: colors.tint }}>
        {initialOf(pet.name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
