const { validateInput } = require('../src/schema/validate');
const { scoreTask } = require('../src/engine/scorer');
const { detectStaleness } = require('../src/engine/staleness');
const governor = require('../src/engine/governor');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.log(`  ✗ ${testName}`);
    failed++;
  }
}

const NOW = new Date('2026-03-10T12:00:00Z');

// ── Test 1: Healthy task queue ──
console.log('\nTest 1: Healthy task queue');
{
  const result = governor.run([
    { id: 't1', description: 'Task 1', priority: 8, frequency: 'daily', lastRun: '2026-03-10T08:00:00Z', lastSuccess: '2026-03-10T08:00:00Z', errorCount: 0, userMentionedLast: '2026-03-09T12:00:00Z', enabled: true },
    { id: 't2', description: 'Task 2', priority: 7, frequency: 'daily', lastRun: '2026-03-10T06:00:00Z', lastSuccess: '2026-03-10T06:00:00Z', errorCount: 0, userMentionedLast: '2026-03-10T10:00:00Z', enabled: true },
    { id: 't3', description: 'Task 3', priority: 9, frequency: 'weekly', lastRun: '2026-03-08T12:00:00Z', lastSuccess: '2026-03-08T12:00:00Z', errorCount: 0, userMentionedLast: '2026-03-09T08:00:00Z', enabled: true },
  ], 'balanced', NOW);

  assert(result.governed.every(t => t.action === 'execute'), 'All tasks get execute action');
  assert(result.summary.execute === 3, 'Summary shows 3 execute');
}

// ── Test 2: One stale task ──
console.log('\nTest 2: One stale task');
{
  const result = governor.run([
    { id: 'healthy', description: 'Healthy', priority: 7, frequency: 'daily', lastRun: '2026-03-10T08:00:00Z', lastSuccess: '2026-03-10T08:00:00Z', errorCount: 0, userMentionedLast: '2026-03-09T12:00:00Z', enabled: true },
    { id: 'stale', description: 'Stale task', priority: 3, frequency: 'weekly', lastRun: '2026-02-01T10:00:00Z', lastSuccess: '2025-12-01T10:00:00Z', errorCount: 15, userMentionedLast: '2026-01-20T09:00:00Z', enabled: true },
  ], 'balanced', NOW);

  const staleTask = result.governed.find(t => t.id === 'stale');
  assert(staleTask.action === 'confirm_with_user', 'Stale task gets confirm_with_user');
  assert(result.summary.stale_detected >= 1, 'At least 1 stale detected');
}

// ── Test 3: Ghost task ──
console.log('\nTest 3: Ghost task');
{
  const result = governor.run([
    { id: 'ghost', description: 'Ghost task', priority: 4, frequency: 'daily', lastRun: null, lastSuccess: null, errorCount: 0, userMentionedLast: null, enabled: true },
  ], 'balanced', NOW);

  const ghost = result.governed[0];
  const staleness = detectStaleness(
    { id: 'ghost', description: 'Ghost task', priority: 4, frequency: 'daily', lastRun: null, lastSuccess: null, errorCount: 0, userMentionedLast: null, enabled: true },
    'balanced', NOW
  );
  assert(staleness.signals.includes('ghost_task'), 'Ghost task signal detected');
  assert(staleness.isStale === true, 'Ghost task is stale');
}

// ── Test 4: Mixed queue ──
console.log('\nTest 4: Mixed queue');
{
  const result = governor.run([
    { id: 'high', description: 'High priority healthy', priority: 9, frequency: 'daily', lastRun: '2026-03-10T06:00:00Z', lastSuccess: '2026-03-10T06:00:00Z', errorCount: 0, userMentionedLast: '2026-03-10T10:00:00Z', enabled: true },
    { id: 'medium', description: 'Medium priority', priority: 5, frequency: 'weekly', lastRun: '2026-03-08T12:00:00Z', lastSuccess: '2026-03-08T12:00:00Z', errorCount: 0, userMentionedLast: '2026-03-05T12:00:00Z', enabled: true },
    { id: 'low-stale', description: 'Low stale', priority: 2, frequency: 'weekly', lastRun: '2026-01-01T10:00:00Z', lastSuccess: '2025-12-01T10:00:00Z', errorCount: 12, userMentionedLast: '2025-12-15T09:00:00Z', enabled: true },
    { id: 'disabled', description: 'Disabled task', priority: 6, frequency: 'daily', lastRun: '2026-03-01T10:00:00Z', lastSuccess: '2026-03-01T10:00:00Z', errorCount: 0, userMentionedLast: '2026-03-01T12:00:00Z', enabled: false },
    { id: 'ghost', description: 'Ghost', priority: 3, frequency: 'daily', lastRun: null, lastSuccess: null, errorCount: 0, userMentionedLast: null, enabled: true },
  ], 'balanced', NOW);

  assert(result.governed.length === 5, '5 tasks returned');
  assert(result.governed[0].effectivePriority >= result.governed[4].effectivePriority, 'Sorted by effectivePriority descending');
  assert(result.summary.total === 5, 'Summary total is 5');
}

// ── Test 5: Aggressive policy auto-disables ──
console.log('\nTest 5: Aggressive policy');
{
  const result = governor.run([
    { id: 'stale-low', description: 'Stale low priority', priority: 2, frequency: 'weekly', lastRun: '2025-11-01T10:00:00Z', lastSuccess: '2025-10-01T10:00:00Z', errorCount: 8, userMentionedLast: '2025-10-01T09:00:00Z', enabled: true },
  ], 'aggressive', NOW);

  const task = result.governed[0];
  assert(task.action === 'disable', 'Aggressive policy disables stale low-priority task');
}

// ── Test 6: Conservative policy only suggests ──
console.log('\nTest 6: Conservative policy');
{
  const result = governor.run([
    { id: 'stale-low', description: 'Stale low priority', priority: 2, frequency: 'weekly', lastRun: '2025-11-01T10:00:00Z', lastSuccess: '2025-10-01T10:00:00Z', errorCount: 20, userMentionedLast: '2025-10-01T09:00:00Z', enabled: true },
  ], 'conservative', NOW);

  const task = result.governed[0];
  assert(task.action === 'confirm_with_user', 'Conservative policy only suggests confirm_with_user');
  assert(task.action !== 'disable', 'Conservative policy never auto-disables');
}

// ── Test 7: Empty tasks array ──
console.log('\nTest 7: Empty tasks array');
{
  const validation = validateInput({ tasks: [] });
  assert(validation.valid === false, 'Empty tasks array is invalid');
  assert(validation.errors[0].includes('at least 1'), 'Error message mentions minimum');
}

// ── Test 8: Response truncation ──
console.log('\nTest 8: Response truncation (50 tasks)');
{
  const tasks = [];
  for (let i = 0; i < 50; i++) {
    tasks.push({
      id: `task-${i}`,
      description: `Task number ${i} with a somewhat long description to test truncation behavior`,
      priority: Math.floor(Math.random() * 10) + 1,
      frequency: 'daily',
      lastRun: '2026-03-10T08:00:00Z',
      lastSuccess: '2026-03-10T08:00:00Z',
      errorCount: 0,
      userMentionedLast: '2026-03-09T12:00:00Z',
      enabled: true,
    });
  }
  const result = governor.run(tasks, 'balanced', NOW);
  const json = JSON.stringify(result);
  assert(json.length <= 2000, `Response is under 2000 chars (got ${json.length})`);
}

// ── Test 9: Overdue task gets urgency boost ──
console.log('\nTest 9: Overdue task gets urgency boost');
{
  const overdueScore = scoreTask(
    { id: 'overdue', description: 'Overdue', priority: 5, frequency: 'daily', lastRun: '2026-03-07T08:00:00Z', lastSuccess: '2026-03-07T08:00:00Z', errorCount: 0, userMentionedLast: '2026-03-09T12:00:00Z', enabled: true },
    NOW
  );
  const freshScore = scoreTask(
    { id: 'fresh', description: 'Fresh', priority: 5, frequency: 'daily', lastRun: '2026-03-10T08:00:00Z', lastSuccess: '2026-03-10T08:00:00Z', errorCount: 0, userMentionedLast: '2026-03-09T12:00:00Z', enabled: true },
    NOW
  );
  assert(overdueScore.effectivePriority > freshScore.effectivePriority, 'Overdue daily task has higher effectivePriority than fresh one');
}

// ── Test 10: All dates missing ──
console.log('\nTest 10: All dates missing — graceful handling');
{
  const result = governor.run([
    { id: 'no-dates', description: 'Task with no dates', priority: 5, frequency: 'daily', lastRun: null, lastSuccess: null, errorCount: 0, userMentionedLast: null, enabled: true },
  ], 'balanced', NOW);

  assert(result.governed.length === 1, 'Returns 1 task');
  assert(typeof result.governed[0].effectivePriority === 'number', 'effectivePriority is a number');
  assert(typeof result.governed[0].action === 'string', 'action is assigned');
}

// ── Summary ──
console.log(`\n${'='.repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed > 0) process.exit(1);
