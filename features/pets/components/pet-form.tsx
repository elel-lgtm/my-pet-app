import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Button, Surface, Text, TextField } from '@/components/ui';
import { MIN_TOUCH_TARGET, Radius, Spacing } from '@/constants/theme';
import { PetAvatar } from '@/features/pets/components/pet-avatar';
import { speciesLabel } from '@/features/pets/pet-presentation';
import { NO_FORM_ERRORS, toFormErrors, type FormErrors } from '@/features/auth';
import { useTheme } from '@/hooks/use-theme';
import { PET_SPECIES, type CreatePetInput, type PetSpecies } from '@/lib/domain/pet';
import { type AppError } from '@/lib/errors';
import { type Result } from '@/lib/result';

/**
 * The create and edit form.
 *
 * One component for both, because the fields and their rules are identical — the only differences
 * are the initial values and the submit label. Two near-copies would drift the moment a field is
 * added to one of them.
 *
 * Validation is *not* duplicated here. The form collects strings, hands them to the caller, and
 * renders whatever `AppError` comes back through `toFormErrors`. The rules live in
 * `parseCreatePetInput`, so the same input is judged the same way whether it arrives from this
 * screen, a deep link, or a future import.
 */

export type PetFormValues = {
  readonly name: string;
  readonly species: PetSpecies;
  readonly breed: string;
  readonly dateOfBirth: string;
  readonly notes: string;
};

export const EMPTY_PET_FORM: PetFormValues = {
  name: '',
  species: 'dog',
  breed: '',
  dateOfBirth: '',
  notes: '',
};

/** Form strings → the shape the domain validator expects. Blank optional fields become null. */
export function toCreateInput(values: PetFormValues): Record<string, unknown> {
  return {
    name: values.name,
    species: values.species,
    breed: values.breed.trim() === '' ? null : values.breed,
    dateOfBirth: values.dateOfBirth.trim() === '' ? null : values.dateOfBirth.trim(),
    photoUrl: null,
    notes: values.notes.trim() === '' ? null : values.notes,
  };
}

/**
 * The subset of fields that actually changed.
 *
 * Sending the whole object on every edit would overwrite fields the user never opened, and would
 * make a concurrent change from another device disappear silently.
 */
export function changedFields(
  original: CreatePetInput,
  next: CreatePetInput
): Partial<CreatePetInput> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof CreatePetInput)[]) {
    if (original[key] !== next[key]) {
      patch[key] = next[key];
    }
  }
  return patch as Partial<CreatePetInput>;
}

export type PetFormProps = {
  readonly initialValues?: PetFormValues | undefined;
  readonly submitLabel: string;
  /** Returns a failure to display, or a success the caller has already acted on. */
  onSubmit(values: PetFormValues): Promise<Result<unknown, AppError>>;
  readonly testID?: string | undefined;
};

export function PetForm({
  initialValues = EMPTY_PET_FORM,
  submitLabel,
  onSubmit,
  testID,
}: PetFormProps) {
  const { colors } = useTheme();
  const [values, setValues] = useState<PetFormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>(NO_FORM_ERRORS);
  const [submitting, setSubmitting] = useState(false);

  function set<K extends keyof PetFormValues>(key: K, value: PetFormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit(): Promise<void> {
    // Guards against a double tap landing two creates. The button also shows a spinner, but the
    // flag is what actually prevents the second call.
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setErrors(NO_FORM_ERRORS);

    const result = await onSubmit(values);
    if (!result.ok) {
      setErrors(toFormErrors(result.error));
    }
    // On success the caller navigates away; leaving `submitting` true keeps the button disabled
    // through the transition rather than flashing enabled for a frame.
    setSubmitting(result.ok);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID={testID}>
        <View style={styles.preview}>
          <PetAvatar pet={{ name: values.name, photoUrl: null }} size={96} />
          <Text variant="caption" color="textMuted" align="center">
            Photos arrive with a later update.
          </Text>
        </View>

        {errors.summary ? (
          <Surface style={{ borderColor: colors.danger }}>
            <Text color="danger" accessibilityRole="alert" accessible>
              {errors.summary}
            </Text>
          </Surface>
        ) : null}

        <TextField
          label="Name"
          value={values.name}
          onChangeText={(text) => set('name', text)}
          placeholder="Biscuit"
          autoCapitalize="words"
          error={errors.fields.name}
          editable={!submitting}
          testID="pet-name"
        />

        <View style={styles.field}>
          <Text
            variant="caption"
            weight="medium"
            color={errors.fields.species ? 'danger' : 'textMuted'}>
            Species
          </Text>
          <View
            style={styles.speciesRow}
            accessibilityRole="radiogroup"
            accessibilityLabel="Species">
            {PET_SPECIES.map((species) => {
              const selected = values.species === species;
              return (
                <Pressable
                  key={species}
                  onPress={() => set('species', species)}
                  disabled={submitting}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, disabled: submitting }}
                  accessibilityLabel={speciesLabel(species)}
                  testID={`pet-species-${species}`}
                  style={[
                    styles.speciesOption,
                    {
                      backgroundColor: selected ? colors.tint : colors.surface,
                      borderColor: selected ? colors.tint : colors.border,
                    },
                  ]}>
                  <Text
                    variant="caption"
                    weight="medium"
                    style={{ color: selected ? colors.onTint : colors.text }}>
                    {speciesLabel(species)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {errors.fields.species ? (
            <Text variant="caption" color="danger">
              {errors.fields.species}
            </Text>
          ) : null}
        </View>

        <TextField
          label="Breed"
          value={values.breed}
          onChangeText={(text) => set('breed', text)}
          placeholder="Optional"
          autoCapitalize="words"
          error={errors.fields.breed}
          editable={!submitting}
          testID="pet-breed"
        />

        <TextField
          label="Date of birth"
          value={values.dateOfBirth}
          onChangeText={(text) => set('dateOfBirth', text)}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          helperText="Optional. Used to show their age."
          error={errors.fields.dateOfBirth}
          editable={!submitting}
          testID="pet-date-of-birth"
        />

        <TextField
          label="Notes"
          value={values.notes}
          onChangeText={(text) => set('notes', text)}
          placeholder="Anything a carer should know"
          multiline
          error={errors.fields.notes}
          editable={!submitting}
          testID="pet-notes"
        />

        <Button
          label={submitLabel}
          onPress={submit}
          loading={submitting}
          fullWidth
          style={styles.submit}
          testID="pet-submit"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    gap: Spacing.md,
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  preview: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  field: { gap: Spacing.xs },
  speciesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  speciesOption: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  submit: { marginTop: Spacing.sm },
});
