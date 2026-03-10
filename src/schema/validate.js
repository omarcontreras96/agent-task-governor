const VALID_FREQUENCIES = ['once', 'hourly', 'daily', 'weekly', 'monthly', 'on_demand'];
const VALID_POLICIES = ['conservative', 'balanced', 'aggressive'];

function isValidISO8601(str) {
  if (typeof str !== 'string') return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

function validateInput(body) {
  const errors = [];

  // Validate tasks array
  if (!body.tasks) {
    return { valid: false, errors: ['tasks is required'] };
  }
  if (!Array.isArray(body.tasks)) {
    return { valid: false, errors: ['tasks must be an array'] };
  }
  if (body.tasks.length === 0) {
    return { valid: false, errors: ['tasks array must contain at least 1 task'] };
  }
  if (body.tasks.length > 50) {
    return { valid: false, errors: ['tasks array must contain at most 50 tasks'] };
  }

  // Validate each task
  const seenIds = new Set();
  for (let i = 0; i < body.tasks.length; i++) {
    const task = body.tasks[i];
    const prefix = `tasks[${i}]`;

    if (!task.id || typeof task.id !== 'string') {
      errors.push(`${prefix}.id is required and must be a string`);
    } else if (seenIds.has(task.id)) {
      errors.push(`${prefix}.id "${task.id}" is duplicated`);
    } else {
      seenIds.add(task.id);
    }

    if (!task.description || typeof task.description !== 'string') {
      errors.push(`${prefix}.description is required and must be a string`);
    }

    if (task.priority !== undefined) {
      if (typeof task.priority !== 'number' || task.priority < 1 || task.priority > 10) {
        errors.push(`${prefix}.priority must be a number between 1 and 10`);
      }
    }

    if (task.frequency !== undefined) {
      if (!VALID_FREQUENCIES.includes(task.frequency)) {
        errors.push(`${prefix}.frequency must be one of: ${VALID_FREQUENCIES.join(', ')}`);
      }
    }

    // Validate date fields
    for (const dateField of ['lastRun', 'lastSuccess', 'userMentionedLast']) {
      if (task[dateField] !== undefined && task[dateField] !== null) {
        if (!isValidISO8601(task[dateField])) {
          errors.push(`${prefix}.${dateField} must be a valid ISO 8601 date string`);
        }
      }
    }

    if (task.errorCount !== undefined) {
      if (typeof task.errorCount !== 'number' || task.errorCount < 0) {
        errors.push(`${prefix}.errorCount must be a non-negative number`);
      }
    }
  }

  // Validate policy
  if (body.policy !== undefined) {
    if (!VALID_POLICIES.includes(body.policy)) {
      errors.push(`policy must be one of: ${VALID_POLICIES.join(', ')}`);
    }
  }

  // Validate currentTime
  if (body.currentTime !== undefined) {
    if (!isValidISO8601(body.currentTime)) {
      errors.push('currentTime must be a valid ISO 8601 date string');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Apply defaults
  const normalized = {
    tasks: body.tasks.map(task => ({
      id: task.id,
      description: task.description,
      priority: task.priority !== undefined ? task.priority : 5,
      frequency: task.frequency || 'on_demand',
      lastRun: task.lastRun || null,
      lastSuccess: task.lastSuccess || null,
      errorCount: task.errorCount || 0,
      userMentionedLast: task.userMentionedLast || null,
      enabled: task.enabled !== undefined ? task.enabled : true,
    })),
    policy: body.policy || 'balanced',
    currentTime: body.currentTime ? new Date(body.currentTime) : new Date(),
  };

  return { valid: true, data: normalized };
}

module.exports = { validateInput };
