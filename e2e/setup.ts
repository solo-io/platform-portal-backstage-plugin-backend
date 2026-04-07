import { execSync, spawn, ChildProcess } from 'child_process';
import { writeFileSync } from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const POSTGRES_CONTAINER = 'e2e-postgres';
const KEYCLOAK_CONTAINER = 'e2e-keycloak';
const PID_FILE = path.join(__dirname, '.e2e-pids.json');

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
          return reject(
            new Error(`Timed out waiting for port ${port}`),
          );
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

  // 2. Start Keycloak with realm import
  console.log('Starting Keycloak...');
  execSync(`docker rm -f ${KEYCLOAK_CONTAINER} 2>/dev/null || true`);
  execSync(
    `docker run -d --name ${KEYCLOAK_CONTAINER} ` +
      `-p 8088:8080 ` +
      `-e KEYCLOAK_ADMIN=admin ` +
      `-e KEYCLOAK_ADMIN_PASSWORD=admin ` +
      `-e KC_HTTP_ENABLED=true ` +
      `-e KC_HOSTNAME_STRICT=false ` +
      `-v ${ROOT}/keycloak-realm.json:/opt/keycloak/data/import/realm.json ` +
      `quay.io/keycloak/keycloak:21.1.1 start-dev --import-realm`,
  );

  // 3. Wait for PostgreSQL to accept connections
  console.log('Waiting for PostgreSQL...');
  await waitForPort(5432, 60_000);
  console.log('PostgreSQL ready.');

  // 4. Start Mock Portal API
  console.log('Starting Mock Portal API...');
  const mockApi = spawnProcess(
    'node',
    ['index.js'],
    path.join(ROOT, 'mock-portal-api'),
  );

  // 5. Wait for mock API to be ready
  await waitForUrl('http://localhost:31080/health', 15_000);
  console.log('Mock Portal API ready.');

  // 6. Start Backstage (frontend + backend)
  console.log('Starting Backstage...');
  const backstage = spawnProcess(
    'yarn',
    ['start'],
    path.join(ROOT, 'backstage'),
  );

  // 7. Wait for Backstage backend (accept any HTTP response — it may return 401/404)
  console.log('Waiting for Backstage backend (port 7007)...');
  await waitForUrl('http://localhost:7007/api/catalog/entities', 120_000, true);
  console.log('Backstage backend ready.');

  // 8. Wait for Backstage frontend
  console.log('Waiting for Backstage frontend (port 3000)...');
  await waitForUrl('http://localhost:3000', 120_000);
  console.log('Backstage frontend ready.');

  // Save PIDs for teardown
  writeFileSync(
    PID_FILE,
    JSON.stringify({
      mockApi: mockApi.pid,
      backstage: backstage.pid,
    }),
  );

  console.log('\n=== E2E Setup: All services running ===\n');
}
