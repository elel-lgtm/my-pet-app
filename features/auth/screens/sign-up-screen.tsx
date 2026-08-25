import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Text, TextField } from '@/components/ui';
import { AuthScreen } from '@/features/auth/components/auth-screen';
import { FormSummary } from '@/features/auth/components/form-summary';
import { NO_FORM_ERRORS, toFormErrors, type FormErrors } from '@/features/auth/form-errors';
import { useAuth } from '@/features/auth/auth-provider';
import { Spacing } from '@/constants/theme';
import { PASSWORD_MIN_LENGTH } from '@/lib/domain/auth';
import { useTheme } from '@/hooks/use-theme';

/**
 * Create an account.
 *
 * Note what this form does *not* collect: anything resembling a role. The account level is written
 * by a database trigger that hard-codes `member`, so there is no field here — and no field
 * anywhere else — that could ask for administrator. See the handle_new_user migration.
 */
export function SignUpScreen() {
  const { signUp } = useAuth();
  const { colors } = useTheme();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_FORM_ERRORS);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function onSubmit(): Promise<void> {
    setSubmitting(true);
    setErrors(NO_FORM_ERRORS);

    const result = await signUp({ displayName, email, password, passwordConfirmation });

    if (result.ok) {
      // When the project requires email confirmation no session is issued, so the router will not
      // move. Saying so is the difference between a finished flow and one that appears to hang.
      if (result.value.needsEmailConfirmation) {
        setAwaitingConfirmation(true);
      }
    } else {
      setErrors(toFormErrors(result.error));
      setPassword('');
      setPasswordConfirmation('');
    }
    setSubmitting(false);
  }

  if (awaitingConfirmation) {
    return (
      <AuthScreen
        title="Check your email"
        subtitle={`We sent a confirmation link to ${email}. Open it to finish setting up your account.`}
        testID="sign-up-confirm">
        <View style={styles.confirmIcon}>
          <Icon name="check" size={40} color={colors.success} />
        </View>
        <Link href="/sign-in" asChild>
          <Button label="Back to sign in" onPress={() => {}} variant="secondary" fullWidth />
        </Link>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Create your account"
      subtitle="It takes a moment, and your pets get a home."
      testID="sign-up-screen"
      footer={
        <View style={styles.footerRow}>
          <Text color="textMuted">Already have an account? </Text>
          <Link href="/sign-in" accessibilityRole="link">
            <Text color="tint" weight="semibold">
              Sign in
            </Text>
          </Link>
        </View>
      }>
      {errors.summary ? <FormSummary message={errors.summary} /> : null}

      <TextField
        label="Name"
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="How should we address you?"
        autoCapitalize="words"
        error={errors.fields.displayName}
        editable={!submitting}
        testID="sign-up-name"
      />

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        error={errors.fields.email}
        editable={!submitting}
        testID="sign-up-email"
      />

      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        helperText={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={errors.fields.password}
        editable={!submitting}
        testID="sign-up-password"
      />

      <TextField
        label="Confirm password"
        value={passwordConfirmation}
        onChangeText={setPasswordConfirmation}
        secureTextEntry
        autoCapitalize="none"
        error={errors.fields.passwordConfirmation}
        editable={!submitting}
        testID="sign-up-password-confirmation"
      />

      <Button
        label="Create account"
        onPress={onSubmit}
        loading={submitting}
        fullWidth
        testID="sign-up-submit"
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  footerRow: { flexDirection: 'row', alignItems: 'center' },
  confirmIcon: { alignItems: 'center', paddingVertical: Spacing.lg },
});
