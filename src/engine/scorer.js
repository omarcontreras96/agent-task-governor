const FREQUENCY_HOURS = {
  once: Infinity,
  hourly: 1,
  daily: 24,
  weekly: 168,
  monthly: 720,
  on_demand: Infinity,
};

function computeUrgencyScore(task, now) {
  if (!task.lastRun) return 7;

  const lastRun = new Date(task.lastRun);
  const hoursSinceLastRun = (now - lastRun) / (1000 * 60 * 60);
  const expectedHours = FREQUENCY_HOURS[task.frequency] || Infinity;

  if (expectedHours === Infinity) {
    // on_demand or once tasks — low urgency unless never run
    return 3;
  }

  const overdueFactor = hoursSinceLastRun / expectedHours;
  return Math.min(10, overdueFactor * 5);
}

function computeUserRelevanceScore(task, now) {
  if (!task.userMentionedLast) return 0;

  const mentioned = new Date(task.userMentionedLast);
  const daysSinceMention = (now - mentioned) / (1000 * 60 * 60 * 24);

  if (daysSinceMention < 1) return 10;
  if (daysSinceMention < 7) return 8;
  if (daysSinceMention < 14) return 6;
  if (daysSinceMention < 30) return 4;
  if (daysSinceMention < 60) return 2;
  return 0;
}

function computeHealthScore(task) {
  if (task.errorCount >= 5) return 0;
  return Math.max(0, 10 - (task.errorCount * 2));
}

function scoreTask(task, now) {
  const staticPriority = task.priority;
  const urgencyScore = computeUrgencyScore(task, now);
  const userRelevanceScore = computeUserRelevanceScore(task, now);
  const healthScore = computeHealthScore(task);

  const effectivePriority =
    (staticPriority * 0.35) +
    (urgencyScore * 0.30) +
    (userRelevanceScore * 0.20) +
    (healthScore * 0.15);

  return {
    effectivePriority: Math.round(effectivePriority * 100) / 100,
    components: { staticPriority, urgencyScore, userRelevanceScore, healthScore },
  };
}

module.exports = { scoreTask, computeUrgencyScore, computeUserRelevanceScore, computeHealthScore };
