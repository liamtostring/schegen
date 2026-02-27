/**
 * Logger service for tracking operations and token usage
 */

const fs = require('fs');
const path = require('path');

// In-memory log storage
let logs = [];
let tokenUsage = {
  openai: { total: 0, sessions: [] },
  gemini: { total: 0, sessions: [] }
};

const MAX_LOGS = 500;
const LOG_FILE = path.join(__dirname, '../../logs/activity.json');

// Ensure logs directory exists
const logsDir = path.dirname(LOG_FILE);
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create logs directory:', e.message);
}

// Load existing logs on startup
try {
  if (fs.existsSync(LOG_FILE)) {
    const data = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    logs = data.logs || [];
    tokenUsage = data.tokenUsage || tokenUsage;
  }
} catch (e) {
  console.log('No existing logs found, starting fresh');
}

/**
 * Add a log entry
 */
function log(action, details = {}) {
  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    action,
    ...details
  };

  logs.unshift(entry);

  // Keep only last MAX_LOGS entries
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(0, MAX_LOGS);
  }

  // Save to file (async)
  saveLogs();

  return entry;
}

/**
 * Log token usage from AI operations
 */
function logTokens(provider, tokens, operation = 'verification') {
  const usage = {
    timestamp: new Date().toISOString(),
    tokens,
    operation
  };

  if (provider === 'openai') {
    tokenUsage.openai.total += tokens;
    tokenUsage.openai.sessions.push(usage);
  } else if (provider === 'gemini') {
    tokenUsage.gemini.total += tokens;
    tokenUsage.gemini.sessions.push(usage);
  }

  // Keep only last 100 sessions per provider
  if (tokenUsage.openai.sessions.length > 100) {
    tokenUsage.openai.sessions = tokenUsage.openai.sessions.slice(-100);
  }
  if (tokenUsage.gemini.sessions.length > 100) {
    tokenUsage.gemini.sessions = tokenUsage.gemini.sessions.slice(-100);
  }

  log('token_usage', { provider, tokens, operation });

  saveLogs();
}

/**
 * Save logs to file
 */
function saveLogs() {
  try {
    fs.writeFileSync(LOG_FILE, JSON.stringify({ logs, tokenUsage }, null, 2));
  } catch (e) {
    console.error('Failed to save logs:', e.message);
  }
}

/**
 * Get all logs
 */
function getLogs(limit = 100, filter = null) {
  let result = logs;

  if (filter) {
    result = logs.filter(l => l.action === filter || l.action.includes(filter));
  }

  return result.slice(0, limit);
}

/**
 * Get token usage summary
 */
function getTokenUsage() {
  return {
    openai: {
      total: tokenUsage.openai.total,
      recentSessions: tokenUsage.openai.sessions.slice(-10)
    },
    gemini: {
      total: tokenUsage.gemini.total,
      recentSessions: tokenUsage.gemini.sessions.slice(-10)
    },
    combined: tokenUsage.openai.total + tokenUsage.gemini.total
  };
}

/**
 * Clear all logs
 */
function clearLogs() {
  logs = [];
  tokenUsage = {
    openai: { total: 0, sessions: [] },
    gemini: { total: 0, sessions: [] }
  };
  saveLogs();
}

/**
 * Get summary statistics
 */
function getStats() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const todayLogs = logs.filter(l => new Date(l.timestamp) >= today);
  const weekLogs = logs.filter(l => new Date(l.timestamp) >= thisWeek);

  const countByAction = (arr) => {
    const counts = {};
    arr.forEach(l => {
      counts[l.action] = (counts[l.action] || 0) + 1;
    });
    return counts;
  };

  return {
    total: logs.length,
    today: {
      count: todayLogs.length,
      byAction: countByAction(todayLogs)
    },
    thisWeek: {
      count: weekLogs.length,
      byAction: countByAction(weekLogs)
    },
    tokens: getTokenUsage()
  };
}

module.exports = {
  log,
  logTokens,
  getLogs,
  getTokenUsage,
  getStats,
  clearLogs
};
