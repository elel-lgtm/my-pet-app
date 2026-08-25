import { configure } from '@testing-library/react-native';

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

// Obviously fake Supabase values. Tests never reach the network, so these only have to satisfy
// validation; a real project's details must never be required to run the suite.
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_key_not_real';

// Reanimated ships a Jest mock; without it, animated components throw on mount.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

/**
 * React Native Testing Library waits one second by default for `waitFor` and `findBy*`. That is
 * enough on an idle machine and not enough on a busy one: a full run under load was observed
 * failing a single async assertion that passes consistently otherwise. Raising the budget changes
 * nothing about what is asserted — a genuinely broken expectation still fails, it just stops the
 * suite being sensitive to how loaded the machine is.
 */
configure({ asyncUtilTimeout: 5000 });
