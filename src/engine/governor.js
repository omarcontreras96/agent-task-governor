const { scoreTask } = require('./scorer');
const { detectStaleness } = require('./staleness');

function generateReason(task, score, staleness) {
  const parts = [];

  if (score.components.staticPriority >= 7) parts.push('High priority');
  else if (score.components.staticPriority >= 4) parts.push('Medium priority');
  else parts.push('Low priority');

  if (score.components.urgencyScore >= 7) parts.push('overdue');
  else if (score.components.urgencyScore >= 4) parts.push('on schedule');

  if (score.components.userRelevanceScore >= 8) parts.push('recently referenced by user');
  else if (score.components.userRelevanceScore === 0 && staleness.daysSinceUserMention !== null) {
    parts.push(`user hasn't mentioned in ${staleness.daysSinceUserMention} days`);
  }

  if (task.errorCount > 0) parts.push(`${task.errorCount} consecutive errors`);

  if (staleness.daysSinceLastSuccess !== null && staleness.daysSinceLastSuccess > 7) {
    parts.push(`last success ${staleness.daysSinceLastSuccess} days ago`);
  }

  if (staleness.signals.includes('ghost_task')) parts.push('task was set up but never/rarely run');
  if (staleness.signals.includes('no_op_pattern')) parts.push('running but producing no results');
  if (staleness.signals.includes('user_abandoned')) parts.push('likely obsolete');

  return parts.join(', ');
}

function assignAction(task, score, staleness, policy) {
  const ep = score.effectivePriority;

  // Disable: aggressive policy, high-confidence stale, low priority
  if (policy === 'aggressive' && staleness.isStale && staleness.confidence >= 0.9 && task.priority <= 3) {
    return 'disable';
  }

  // Confirm with user: stale with confidence >= 0.6, or low EP with stale signals
  if (staleness.isStale && staleness.confidence >= 0.6) {
    return 'confirm_with_user';
  }
  if (ep < 3 && staleness.isStale) {
    return 'confirm_with_user';
  }

  // Balanced policy auto-pause: stale low-priority tasks
  if (policy === 'balanced' && staleness.isStale && task.priority <= 3) {
    return 'confirm_with_user';
  }

  // Not enabled
  if (!task.enabled) {
    return 'defer';
  }

  // Execute: high effective priority and not stale
  if (ep >= 5 && !staleness.isStale) {
    return 'execute';
  }

  // Defer: medium effective priority
  if (ep >= 3) {
    return 'defer';
  }

  // Low EP, not stale enough to confirm — defer
  return 'defer';
}

function truncateResponse(response) {
  let json = JSON.stringify(response);
  if (json.length <= 1800) return response;

  // Step 1: Truncate reason strings to 80 chars
  for (const item of response.governed) {
    if (item.reason.length > 80) {
      item.reason = item.reason.substring(0, 77) + '...';
    }
  }
  json = JSON.stringify(response);
  if (json.length <= 1800) return response;

  // Step 2: Keep top 10 by effectivePriority + any confirm_with_user/disable
  const important = response.governed.filter(
    t => t.action === 'confirm_with_user' || t.action === 'disable'
  );
  const rest = response.governed
    .filter(t => t.action !== 'confirm_with_user' && t.action !== 'disable')
    .slice(0, 10);

  const kept = [...important, ...rest]
    .sort((a, b) => b.effectivePriority - a.effectivePriority);

  // Deduplicate
  const seen = new Set();
  response.governed = kept.filter(t => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  return response;
}

function run(tasks, policy, currentTime) {
  const now = currentTime instanceof Date ? currentTime : new Date(currentTime);

  const governed = tasks.map(task => {
    const score = scoreTask(task, now);
    const staleness = detectStaleness(task, policy, now);
    const action = assignAction(task, score, staleness, policy);
    const reason = generateReason(task, score, staleness);

    return {
      id: task.id,
      effectivePriority: score.effectivePriority,
      action,
      reason,
    };
  });

  // Sort by effectivePriority descending
  governed.sort((a, b) => b.effectivePriority - a.effectivePriority);

  // Compute summary
  const summary = {
    total: governed.length,
    execute: governed.filter(t => t.action === 'execute').length,
    defer: governed.filter(t => t.action === 'defer').length,
    confirm_with_user: governed.filter(t => t.action === 'confirm_with_user').length,
    disable: governed.filter(t => t.action === 'disable').length,
    stale_detected: tasks.filter(t => detectStaleness(t, policy, now).isStale).length,
  };

  // Next review: 1 hour from current time
  const nextReview = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const response = { governed, summary, nextReview };

  return truncateResponse(response);
}

module.exports = { run };
