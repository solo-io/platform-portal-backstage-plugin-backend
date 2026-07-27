import { execSync, spawn, ChildProcess } from 'child_process';
import { writeFileSync, existsSync, mkdtempSync, chmodSync } from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const BACKSTAGE_DIR = path.join(ROOT, 'backstage');
const POSTGRES_CONTAINER = 'e2e-postgres';
const BACKSTAGE_CONTAINER = 'e2e-backstage';
const BACKSTAGE_IMAGE = 'platform-portal-backstage-backend:e2e';
const PID_FILE = path.join(__dirname, '.e2e-pids.json');

// The image serves both the frontend bundle (via @backstage/plugin-app-backend)
// and the API from this single port, unlike `yarn start`, which splits them
// across 3000/7007.
const BACKSTAGE_PORT = 7007;

// The backend runs in a container, but Postgres and the mock portal API both
// run on the host. On Linux we share the host network namespace so "localhost"
// means the same thing on both sides. Docker Desktop does not support that
// reliably, so there we publish the port and reach back out through the host
// gateway alias instead.
const USE_HOST_NETWORK = process.platform === 'linux';
const HOST_FROM_CONTAINER = USE_HOST_NETWORK
  ? 'localhost'
  : 'host.docker.internal';

function waitForUrl(
  url: string,
  timeoutMs: number,
  acceptAnyResponse = false,
): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      fetch(url)
        .then(res => {
          if (res.ok || acceptAnyResponse) return resolve();
          throw new Error(`${res.status}`);
        })
        .catch(() => {
          if (Date.now() - start > timeoutMs) {
            return reject(new Error(`Timed out waiting for ${url}`));
          }
          setTimeout(check, 2000);
        });
    };
    check();
  });
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const { createConnection } = require('net');
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const socket = createConnection({ port, host: 'localhost' }, () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          return reject(new Error(`Timed out waiting for port ${port}`));
        }
        setTimeout(check, 1000);
      });
    };
    check();
  });
}

function spawnProcess(
  command: string,
  args: string[],
  cwd: string,
): ChildProcess {
  const proc = spawn(command, args, {
    cwd,
    stdio: 'pipe',
    detached: true,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  proc.unref();

  proc.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(`[${path.basename(cwd)}] ${data}`);
  });
  proc.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[${path.basename(cwd)}] ${data}`);
  });

  return proc;
}

/**
 * Produce the bundle the Dockerfile expects, then build the image.
 *
 * `packages/backend/dist/{skeleton,bundle}.tar.gz` come from the backend
 * package build. They are gitignored build output, so they must exist before
 * `docker build` can COPY them.
 */
function buildBackstageImage() {
  const distDir = path.join(BACKSTAGE_DIR, 'packages', 'backend', 'dist');
  const skeleton = path.join(distDir, 'skeleton.tar.gz');
  const bundle = path.join(distDir, 'bundle.tar.gz');

  if (process.env.E2E_SKIP_IMAGE_BUILD === '1') {
    console.log('E2E_SKIP_IMAGE_BUILD=1 — reusing the existing image.');
    return;
  }

  console.log('Building backend bundle (this also builds the frontend app)...');
  execSync('yarn workspace backend build', {
    cwd: BACKSTAGE_DIR,
    stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
  });

  // Fail loudly here rather than letting `docker build` fail on a COPY of a
  // missing file, which is a much harder error to read.
  if (!existsSync(skeleton) || !existsSync(bundle)) {
    throw new Error(
      `Backend bundle was not produced.\n` +
        `  expected: ${skeleton}\n` +
        `            ${bundle}\n` +
        `'yarn workspace backend build' exited successfully but wrote neither ` +
        `file, so the image cannot be built. Check the build output above.`,
    );
  }

  console.log('Building Docker image...');
  execSync(
    `DOCKER_BUILDKIT=1 docker build -f ./packages/backend/Dockerfile --tag ${BACKSTAGE_IMAGE} .`,
    { cwd: BACKSTAGE_DIR, stdio: 'inherit' },
  );
}

/**
 * The image's default command loads app-config.yaml + app-config.production.yaml.
 * Neither knows about the e2e Postgres or the mock portal API, so we mount one
 * more config layer and append it to the --config chain. Generating it at
 * runtime lets us substitute the right hostname for the network mode in use.
 */
function writeContainerConfig(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'backstage-e2e-config-'));
  const file = path.join(dir, 'app-config.e2e.yaml');
  // The image drops to USER node (uid 1000). A bind mount preserves host
  // ownership, and mkdtemp creates 0700, so without widening these the
  // container cannot traverse the directory or read the file.
  chmodSync(dir, 0o755);
  writeFileSync(
    file,
    `# Generated by e2e/setup.ts — mounted into the container under test.
backend:
  database:
    client: pg
    connection:
      host: ${HOST_FROM_CONTAINER}
      port: 5432
      user: postgres
      password: password

glooPlatformPortal:
  backend:
    debugLogging: true
    portalServerUrl: http://${HOST_FROM_CONTAINER}:31080/v1
    clientId: backstage
    clientSecret: mock-secret
    tokenEndpoint: http://${HOST_FROM_CONTAINER}:31080/auth/realms/master/protocol/openid-connect/token
    syncFrequency:
      seconds: 5
`,
    { mode: 0o644 },
  );
  return file;
}

function startBackstageContainer(configPath: string) {
  execSync(`docker rm -f ${BACKSTAGE_CONTAINER} 2>/dev/null || true`);

  const network = USE_HOST_NETWORK
    ? '--network host'
    : `-p ${BACKSTAGE_PORT}:${BACKSTAGE_PORT} --add-host host.docker.internal:host-gateway`;

  execSync(
    `docker run -d --name ${BACKSTAGE_CONTAINER} ${network} ` +
      `-v ${configPath}:/app/app-config.e2e.yaml:ro ` +
      `${BACKSTAGE_IMAGE} ` +
      `node packages/backend ` +
      `--config app-config.yaml ` +
      `--config app-config.production.yaml ` +
      `--config app-config.e2e.yaml`,
    { stdio: 'inherit' },
  );
}

function dumpBackstageLogs() {
  console.error('\n--- docker logs (last 100 lines) ---');
  try {
    console.error(
      execSync(`docker logs --tail 100 ${BACKSTAGE_CONTAINER} 2>&1`).toString(),
    );
  } catch {
    console.error('(could not read container logs)');
  }
  console.error('--- end docker logs ---\n');
}

export default async function globalSetup() {
  console.log('\n=== E2E Setup: Starting infrastructure ===\n');

  // 1. Start PostgreSQL
  console.log('Starting PostgreSQL...');
  execSync(`docker rm -f ${POSTGRES_CONTAINER} 2>/dev/null || true`);
  execSync(
    `docker run -d --name ${POSTGRES_CONTAINER} ` +
      `-e POSTGRES_PASSWORD=password ` +
      `-p 5432:5432 postgres`,
  );

  // NOTE: Keycloak used to be started here on :8088, but nothing in the e2e
  // stack talks to it — the mock portal API implements the OIDC token endpoint
  // itself, and the config below points tokenEndpoint at :31080. It only cost
  // startup time and made :8088 conflict with any Keycloak already running
  // locally, so it is no longer started. The README still documents Keycloak
  // for manual runs against a real authorization server.

  // 2. Wait for PostgreSQL to accept connections
  console.log('Waiting for PostgreSQL...');
  await waitForPort(5432, 60_000);
  console.log('PostgreSQL ready.');

  // 3. Start Mock Portal API
  console.log('Starting Mock Portal API...');
  const mockApi = spawnProcess(
    'node',
    ['index.js'],
    path.join(ROOT, 'mock-portal-api'),
  );

  // 4. Wait for mock API to be ready
  await waitForUrl('http://localhost:31080/health', 15_000);
  console.log('Mock Portal API ready.');

  // 5. Build and start the released image. This deliberately uses the same
  // Dockerfile the release workflow ships, so the UI under test is the
  // production bundle served by the image, not the dev server.
  buildBackstageImage();

  console.log('Starting Backstage container...');
  startBackstageContainer(writeContainerConfig());

  // 6. Wait for the backend to report ready. Readiness only flips once every
  // backend plugin has started, which includes connecting to Postgres.
  console.log(`Waiting for Backstage backend (port ${BACKSTAGE_PORT})...`);
  try {
    await waitForUrl(
      `http://localhost:${BACKSTAGE_PORT}/.backstage/health/v1/readiness`,
      180_000,
    );
  } catch (e) {
    dumpBackstageLogs();
    throw e;
  }
  console.log('Backstage backend ready.');

  // 7. Wait for the frontend bundle, served from the same port.
  console.log(`Waiting for Backstage frontend (port ${BACKSTAGE_PORT})...`);
  try {
    await waitForUrl(`http://localhost:${BACKSTAGE_PORT}`, 60_000);
  } catch (e) {
    dumpBackstageLogs();
    throw e;
  }
  console.log('Backstage frontend ready.');

  // Save PIDs for teardown
  writeFileSync(
    PID_FILE,
    JSON.stringify({
      mockApi: mockApi.pid,
    }),
  );

  console.log('\n=== E2E Setup: All services running ===\n');
}
