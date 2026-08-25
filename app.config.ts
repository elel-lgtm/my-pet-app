import { type ConfigContext, type ExpoConfig } from 'expo/config';

/**
 * Dynamic app config.
 *
 * `app.json` stays the static base — CLI tools still read and update it — and this file layers
 * environment-dependent values on top. Expo passes the static config in as `config` and prefers
 * this file when both are present.
 *
 * Development, staging, and production builds get distinct names, schemes, and native identifiers
 * so all three can be installed side by side on one device without clobbering each other.
 *
 * @see https://docs.expo.dev/workflow/configuration/
 */

type AppEnvironment = 'development' | 'staging' | 'production';

// This file runs in Node at config-resolution time, so it reads the raw variable directly rather
// than importing `@/lib/env`, which is bundled for the app runtime.
const APP_ENV = (process.env.EXPO_PUBLIC_APP_ENV ?? 'development') as AppEnvironment;

/** Change this to your own reverse-DNS identifier before the first store submission. */
const BASE_IDENTIFIER = 'com.mypetapp';

const VARIANTS: Record<AppEnvironment, { nameSuffix: string; idSuffix: string; scheme: string }> = {
  development: { nameSuffix: ' (Dev)', idSuffix: '.dev', scheme: 'mypetapp-dev' },
  staging: { nameSuffix: ' (Staging)', idSuffix: '.staging', scheme: 'mypetapp-staging' },
  production: { nameSuffix: '', idSuffix: '', scheme: 'mypetapp' },
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = VARIANTS[APP_ENV];

  return {
    ...config,
    name: `${config.name ?? 'my-pet-app'}${variant.nameSuffix}`,
    slug: config.slug ?? 'my-pet-app',
    scheme: variant.scheme,
    ios: {
      ...config.ios,
      bundleIdentifier: `${BASE_IDENTIFIER}${variant.idSuffix}`,
    },
    android: {
      ...config.android,
      package: `${BASE_IDENTIFIER}${variant.idSuffix}`,
    },
    extra: {
      ...config.extra,
      // Readable at runtime via `Constants.expoConfig?.extra`. Keep this to build metadata only;
      // runtime configuration belongs in `@/lib/env`.
      appEnvironment: APP_ENV,
    },
  };
};
