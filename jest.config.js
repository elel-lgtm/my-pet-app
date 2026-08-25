/**
 * Jest configuration.
 *
 * `jest-expo` supplies the React Native transform, module mocks, and platform resolution; without
 * it, imports like `expo-router` and `react-native-reanimated` fail to parse.
 * @see https://docs.expo.dev/develop/unit-testing/
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // Most packages under node_modules ship untranspiled ESM/Flow and must go through Babel.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)',
  ],
  // Only files named *.test.* are suites. Without this, jest's default treats every file under a
  // __tests__ directory as a suite, so shared fixtures fail with "your test suite must contain
  // at least one test".
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)', '**/?(*.)+(test).[jt]s?(x)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'lib/data/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/__tests__/**',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/dist/'],
  clearMocks: true,
  restoreMocks: true,
};
