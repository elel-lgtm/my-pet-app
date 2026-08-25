import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Icon, Text, TextField } from '@/components/ui';
import { AuthScreen } from '@/features/auth/components/auth-screen';
import { FormSummary } from '@/features/auth/components/form-summary';
import { NO_FORM_ERRORS, toFormErrors, type FormErrors } from '@/features/auth/form-errors';
import { useAuth } from '@/features/auth/auth-provider';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Request a password-reset email.
 *
 * The confirmation is deliberately unconditional: it says an email has been sent if the address is
 * registered, and shows the same thing whether or not it is. Confirming that an address has an
 * account turns this form into a membership oracle, which is exactly what someone probing a leaked
 * address list wants.
 */
export function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  const { colors } = useTheme();

  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_FORM_ERRORS);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(): Promise<void> {
    setSubmitting(true);
    setErrors(NO_FORM_ERRORS);

    const result = await requestPasswordReset({ email });

    if (result.ok) {
      setSent(true);
    } else {
      // A malformed address is worth reporting; anything else the server said about *this address*
      // is not, so only validation failures reach the field.
      setErrors(toFormErrors(result.error));
    }
    setSubmitting(false);
  }

  if (sent) {
    return (
      <AuthScreen
        title="Check your email"
        subtitle={`If an account exists for ${email}, a reset link is on its way.`}
        testID="forgot-password-sent">
        <View style={styles.icon}>
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
      title="Reset your password"
      subtitle="Enter your email and we will send you a link."
      testID="forgot-password-screen"
      footer={
        <Link href="/sign-in" accessibilityRole="link">
          <Text color="tint" weight="semibold">
            Back to sign in
          </Text>
        </Link>
      }>
      {errors.summary ? <FormSummary message={errors.summary} /> : null}

      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        error={errors.fields.email}
        editable={!submitting}
        testID="forgot-password-email"
      />

      <Button
        label="Send reset link"
        onPress={onSubmit}
        loading={submitting}
        fullWidth
        testID="forgot-password-submit"
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', paddingVertical: Spacing.lg },
});
