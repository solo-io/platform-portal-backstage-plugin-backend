import { execSync } from 'child_process';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import * as path from 'path';

const PID_FILE = path.join(__dirname, '.e2e-pids.json');

function killProcessTree(pid: number) {
  try {
    // Kill the entire process group (negative PID)
    process.kill(-pid, 'SIGTERM');
  } catch {
    // Process may already be gone
  }
}

export default async function globalTeardown() {
  console.log('\n=== E2E Teardown: Stopping services ===\n');

  // Kill spawned processes
  if (existsSync(PID_FILE)) {
    try {
      const pids = JSON.parse(readFileSync(PID_FILE, 'utf-8'));
      if (pids.mockApi) {
        console.log(`Stopping Mock API (PID ${pids.mockApi})...`);
        killProcessTree(pids.mockApi);
      }
      if (pids.backstage) {
        console.log(`Stopping Backstage (PID ${pids.backstage})...`);
        killProcessTree(pids.backstage);
      }
      unlinkSync(PID_FILE);
    } catch (e) {
      console.warn('Warning cleaning up PIDs:', e);
    }
  }

  // Stop containers
  console.log('Stopping Docker containers...');
  execSync('docker rm -f e2e-postgres e2e-keycloak 2>/dev/null || true');

  console.log('\n=== E2E Teardown: Complete ===\n');
}
