/**
 * Runs before every test file.
 *
 * Keep this lean: global mocks make tests pass for reasons the test file does not state. Anything
 * specific to one area belongs in that area's test file.
 */

// The env module validates at import time, so tests get a deterministic, complete configuration
// rather than whatever happens to be in the developer's shell.
process.env.EXPO_PUBLIC_APP_ENV = 'development';
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';
process.env.EXPO_PUBLIC_LOG_LEVEL = 'silent';

// Reanimated ships a Jest mock; without it, animated components throw on mount.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
