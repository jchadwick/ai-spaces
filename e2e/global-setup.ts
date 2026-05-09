import { mkdir, writeFile } from 'fs/promises';
import { TEST_SPACE_ID, TEST_SPACE_PATH } from './helpers/constants.js';

const DATA_DIR = '/tmp/ai-spaces-test-data';

export default async function globalSetup() {
  await mkdir('/tmp/openclaw-test', { recursive: true });
  await mkdir(DATA_DIR, { recursive: true });

  // Create a pre-seeded test space so e2e tests can navigate to it
  // without needing a POST /api/spaces endpoint.
  const workspacePath = TEST_SPACE_PATH;
  const spaceConfigDir = `${workspacePath}/.space`;
  await mkdir(spaceConfigDir, { recursive: true });

  const spaceConfig = { name: 'E2E Test Space', description: 'Space used by automated e2e tests' };
  await writeFile(`${spaceConfigDir}/spaces.json`, JSON.stringify(spaceConfig, null, 2));
  await writeFile(`${workspacePath}/README.md`, '# E2E Test Space\nUsed by automated tests.\n');

  // Seed the DB via the JSON file that seedFromJsonIfNeeded() reads on startup
  const now = new Date().toISOString();
  const seedData = {
    spaces: {
      [TEST_SPACE_ID]: {
        id: TEST_SPACE_ID,
        agentId: 'openclaw',
        agentType: 'openclaw',
        path: workspacePath,
        configPath: `${spaceConfigDir}/spaces.json`,
        config: spaceConfig,
        createdAt: now,
        updatedAt: now,
      },
    },
  };
  await writeFile(`${DATA_DIR}/spaces.json`, JSON.stringify(seedData, null, 2));
}
