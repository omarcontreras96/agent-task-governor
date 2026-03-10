const FREQUENCY_HOURS = {
  once: Infinity,
  hourly: 1,
  daily: 24,
  weekly: 168,
  monthly: 720,
  on_demand: Infinity,
};

const POLICY_THRESHOLDS = {
  conservative: { staleDays: 60, errorThreshold: 20 },
  balanced:     { staleDays: 30, errorThreshold: 10 },
  aggressive:   { staleDays: 14, errorThreshold: 5 },
};

function detectStaleness(task, policy, now) {
  const thresholds = POLICY_THRESHOLDS[policy];
  const signals = [];
  let confidence = 0;

  const daysSinceUserMention = task.userMentionedLast
    ? (now - new Date(task.userMentionedLast)) / (1000 * 60 * 60 * 24)
    : Infinity;

  const daysSinceLastRun = task.lastRun
    ? (now - new Date(task.lastRun)) / (1000 * 60 * 60 * 24)
    : Infinity;

  const daysSinceLastSuccess = task.lastSuccess
    ? (now - new Date(task.lastSuccess)) / (1000 * 60 * 60 * 24)
    : Infinity;

  // 1. User abandoned: no mention beyond threshold AND low priority
  if (daysSinceUserMention > thresholds.staleDays && task.priority <= 5) {
    signals.push('user_abandoned');
    confidence += 0.3;
  }

  // 2. Persistent failure: error count above threshold AND lastSuccess much older than lastRun
  if (task.errorCount >= thresholds.errorThreshold) {
    if (daysSinceLastSuccess > daysSinceLastRun + 1) {
      signals.push('persistent_failure');
      confidence += 0.35;
    } else {
      signals.push('persistent_failure');
      confidence += 0.25;
    }
  }

  // 3. No-op pattern: running but lastSuccess hasn't changed in 2x expected frequency
  const expectedHours = FREQUENCY_HOURS[task.frequency] || Infinity;
  if (expectedHours !== Infinity && task.lastRun && task.lastSuccess) {
    const expectedDays = (expectedHours * 2) / 24;
    if (daysSinceLastSuccess > expectedDays && daysSinceLastRun < daysSinceLastSuccess) {
      signals.push('no_op_pattern');
      confidence += 0.2;
    }
  }

  // 4. Ghost task: enabled but lastRun is null or > 90 days old
  if (task.enabled && (task.lastRun === null || daysSinceLastRun > 90)) {
    signals.push('ghost_task');
    confidence += 0.25;
  }

  confidence = Math.min(1, confidence);

  // Determine recommendation based on policy
  let recommendation = null;
  if (signals.length > 0) {
    if (policy === 'aggressive' && confidence >= 0.9 && task.priority <= 3) {
      recommendation = 'auto_disable';
    } else if (confidence >= 0.6) {
      recommendation = 'confirm_with_user';
    } else {
      recommendation = 'review';
    }
  }

  return {
    isStale: signals.length > 0,
    signals,
    confidence: Math.round(confidence * 100) / 100,
    daysSinceUserMention: daysSinceUserMention === Infinity ? null : Math.round(daysSinceUserMention),
    daysSinceLastSuccess: daysSinceLastSuccess === Infinity ? null : Math.round(daysSinceLastSuccess),
    recommendation,
  };
}

module.exports = { detectStaleness };
