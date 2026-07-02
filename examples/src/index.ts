import { demoBasicQueue } from './01-basic-queue.js';
import { demoRetryBackoff } from './02-retry-backoff.js';
import { demoTimeout } from './03-timeout.js';
import { demoEvents } from './04-events.js';
import { demoCancellation } from './05-cancellation.js';
import { demoTaskGroup } from './06-task-group.js';
import { demoPriority } from './07-priority.js';
import { demoPlugins } from './08-plugins.js';

const SEP = '\n' + '='.repeat(60) + '\n';

async function main() {
  console.log(SEP);
  console.log('  Orqis Demo — Async Task Orchestration');
  console.log(SEP);

  await demoBasicQueue();
  console.log(SEP);
  await demoRetryBackoff();
  console.log(SEP);
  await demoTimeout();
  console.log(SEP);
  await demoEvents();
  console.log(SEP);
  await demoCancellation();
  console.log(SEP);
  await demoTaskGroup();
  console.log(SEP);
  await demoPriority();
  console.log(SEP);
  await demoPlugins();

  console.log('\nAll demos completed successfully!');
}

main().catch((err) => {
  console.error('Demo failed:', err);
  process.exit(1);
});
