#!/usr/bin/env node

/**
 * DESTRUCTIVE developer-only utility. Run it on purpose or not at all.
 *
 * It strips the project back to a blank Expo Router app: the directories listed in
 * `RESETTABLE_DIRECTORIES` are archived (or deleted), and a fresh `app/` containing only
 * `index.tsx` and `_layout.tsx` is created in their place.
 *
 * This exists because the Expo template ships it. It is kept — rather than deleted — so the
 * option remains available, but it is deliberately awkward to trigger:
 *
 *   - it is wired to `npm run danger:reset-project`, not a name anyone types by reflex;
 *   - it archives by default and only deletes when asked to;
 *   - it requires a typed confirmation phrase, not a y/n keypress;
 *   - it refuses to run without an interactive terminal, so CI, git hooks, task runners, and
 *     agents cannot trigger it by accident;
 *   - it refuses to run over an uncommitted working tree, so there is always a way back.
 *
 * Once the project has real code you want to keep, the safest move is to delete this file and its
 * package.json script outright.
 *
 * Usage:
 *   npm run danger:reset-project                 # archive to app-example/
 *   npm run danger:reset-project -- --delete     # permanently delete instead of archiving
 *   npm run danger:reset-project -- --force      # bypass the TTY and clean-worktree checks
 *   npm run danger:reset-project -- --help
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execFileSync } = require('child_process');

const root = process.cwd();

/**
 * Directories a reset consumes. `scripts/` is deliberately absent: a script that archives itself
 * mid-run leaves no way to inspect or re-run what just happened. Delete it by hand when done.
 */
const RESETTABLE_DIRECTORIES = ['app', 'components', 'constants', 'features', 'hooks', 'lib'];

const ARCHIVE_DIRECTORY = 'app-example';

const INDEX_CONTENT = `import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
      }}>
      <Text>Edit app/index.tsx to edit this screen.</Text>
    </View>
  );
}
`;

const LAYOUT_CONTENT = `import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack />;
}
`;

const USAGE = `
Resets this project to a blank Expo Router app. This is destructive.

  npm run danger:reset-project              Archive to ${ARCHIVE_DIRECTORY}/ (default)
  npm run danger:reset-project -- --delete  Permanently delete instead of archiving
  npm run danger:reset-project -- --force   Skip the interactive-terminal and clean-worktree checks
  npm run danger:reset-project -- --help    Show this message

Directories consumed: ${RESETTABLE_DIRECTORIES.join(', ')}
`;

function parseArguments(argv) {
  const known = new Set(['--delete', '--force', '--help', '-h']);
  const unknown = argv.filter((argument) => !known.has(argument));

  if (unknown.length > 0) {
    throw new Error(`Unrecognised argument(s): ${unknown.join(', ')}`);
  }

  return {
    remove: argv.includes('--delete'),
    force: argv.includes('--force'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

/** Counts files beneath a directory, so the confirmation prompt states real stakes. */
function countFiles(directoryPath) {
  let total = 0;
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    total += entry.isDirectory() ? countFiles(path.join(directoryPath, entry.name)) : 1;
  }
  return total;
}

/**
 * Reports whether git has a recoverable snapshot of the current state. A missing git binary or a
 * non-repository is reported rather than thrown: the caller decides how loudly to complain.
 */
function inspectWorktree() {
  try {
    const output = execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return { tracked: true, dirty: output.trim().length > 0 };
  } catch {
    return { tracked: false, dirty: false };
  }
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function projectName() {
  try {
    return require(path.join(root, 'package.json')).name || 'this-project';
  } catch {
    return 'this-project';
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));

  if (options.help) {
    console.log(USAGE);
    return 0;
  }

  const targets = RESETTABLE_DIRECTORIES.map((name) => ({
    name,
    absolutePath: path.join(root, name),
  })).filter((target) => fs.existsSync(target.absolutePath));

  if (targets.length === 0) {
    console.log('Nothing to reset: none of the resettable directories exist.');
    return 0;
  }

  const archivePath = path.join(root, ARCHIVE_DIRECTORY);
  const verb = options.remove ? 'PERMANENTLY DELETE' : 'archive';

  console.log('');
  console.log('  !!  DESTRUCTIVE OPERATION  !!');
  console.log('');
  console.log(`  This will ${verb} the following directories:`);
  for (const target of targets) {
    console.log(`    - ${target.name}/  (${countFiles(target.absolutePath)} files)`);
  }
  console.log('');
  console.log(
    options.remove
      ? '  They will NOT be recoverable from disk.'
      : `  They will be moved to ${ARCHIVE_DIRECTORY}/.`
  );
  console.log('  A fresh app/ containing only index.tsx and _layout.tsx will replace them.');
  console.log('');

  // Refuse to overwrite a previous archive. The original script attempted the rename anyway and
  // failed partway through, leaving the project in a half-reset state.
  if (!options.remove && fs.existsSync(archivePath)) {
    console.error(`Aborted: ${ARCHIVE_DIRECTORY}/ already exists. Move or delete it first.`);
    return 1;
  }

  const worktree = inspectWorktree();

  if (!worktree.tracked) {
    console.warn('  WARNING: not a git repository, so there is no way to undo this.');
    console.log('');
  } else if (worktree.dirty && !options.force) {
    console.error('Aborted: the git working tree has uncommitted changes.');
    console.error('Commit or stash them first so this is reversible, or pass --force.');
    return 1;
  }

  // The decisive guard. Without a terminal there is no human to confirm, so a stray invocation
  // from CI, a git hook, a task runner, or an agent must never proceed.
  if (!process.stdin.isTTY && !options.force) {
    console.error('Aborted: this command requires an interactive terminal.');
    console.error('If you really mean it in a non-interactive context, pass --force.');
    return 1;
  }

  if (process.stdin.isTTY) {
    const phrase = options.remove
      ? `permanently delete ${projectName()}`
      : `archive ${projectName()}`;
    const answer = await ask(`  To proceed, type exactly: ${phrase}\n  > `);

    if (answer !== phrase) {
      console.log('\nAborted: confirmation phrase did not match. Nothing was changed.');
      return 1;
    }
  }

  console.log('');

  if (!options.remove) {
    await fs.promises.mkdir(archivePath, { recursive: true });
    console.log(`Created ${ARCHIVE_DIRECTORY}/`);
  }

  for (const target of targets) {
    if (options.remove) {
      await fs.promises.rm(target.absolutePath, { recursive: true, force: true });
      console.log(`Deleted ${target.name}/`);
    } else {
      await fs.promises.rename(target.absolutePath, path.join(archivePath, target.name));
      console.log(`Moved ${target.name}/ -> ${ARCHIVE_DIRECTORY}/${target.name}/`);
    }
  }

  const newAppPath = path.join(root, 'app');
  await fs.promises.mkdir(newAppPath, { recursive: true });
  await fs.promises.writeFile(path.join(newAppPath, 'index.tsx'), INDEX_CONTENT);
  await fs.promises.writeFile(path.join(newAppPath, '_layout.tsx'), LAYOUT_CONTENT);
  console.log('Created app/index.tsx and app/_layout.tsx');

  console.log('\nReset complete. Next steps:');
  console.log('  1. Run `npx expo start`.');
  console.log('  2. Edit app/index.tsx.');
  if (!options.remove) {
    console.log(`  3. Delete ${ARCHIVE_DIRECTORY}/ once you are done referencing it.`);
  }
  console.log('  4. Delete scripts/reset-project.js and its package.json script.');

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    // Exit non-zero on failure. The original swallowed errors and still reported success.
    console.error(`\nReset failed: ${error.message}`);
    process.exit(1);
  });
