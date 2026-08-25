import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text, TextField } from '@/components/ui';
import { AuthScreen } from '@/features/auth/components/auth-screen';
import { FormSummary } from '@/features/auth/components/form-summary';
import { NO_FORM_ERRORS, toFormErrors, type FormErrors } from '@/features/auth/form-errors';
import { useAuth } from '@/features/auth/auth-provider';
import { Spacing } from '@/constants/theme';

/**
 * Sign in with email and password.
 *
 * On success nothing navigates: the session change flips the router's guard and the authenticated
 * stack replaces this one. Pushing a route here as well would fight that and briefly show two.
 */
export function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>(NO_FORM_ERRORS);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(): Promise<void> {
    setSubmitting(true);
    setErrors(NO_FORM_ERRORS);

    const result = await signIn({ email, password });

    if (!result.ok) {
      setErrors(toFormErrors(result.error));
      // Clear the password on a rejected attempt so a retry starts clean, and a shoulder-surfer
      // does not get a second look at a filled field.
      setPassword('');
    }
    setSubmitting(false);
  }

  return (
    <AuthScreen
      title="Welcome back"
      subtitle="Sign in to keep track of your pets."
      testID="sign-in-screen"
      footer={
        <View style={styles.footerRow}>
          <Text color="textMuted">New here? </Text>
          <Link href="/sign-up" accessibilityRole="link">
            <Text color="tint" weight="semibold">
              Create an account
            </Text>
          </Link>
        </View>
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
        testID="sign-in-email"
      />

      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        error={errors.fields.password}
        editable={!submitting}
        testID="sign-in-password"
      />

      <View style={styles.forgot}>
        <Link href="/forgot-password" accessibilityRole="link">
          <Text variant="caption" color="tint" weight="medium">
            Forgot your password?
          </Text>
        </Link>
      </View>

      <Button
        label="Sign in"
        onPress={onSubmit}
        loading={submitting}
        fullWidth
        testID="sign-in-submit"
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  footerRow: { flexDirection: 'row', alignItems: 'center' },
  forgot: { alignSelf: 'flex-start', paddingVertical: Spacing.xs },
});
