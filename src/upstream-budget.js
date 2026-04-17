import { DurableObject } from "cloudflare:workers";

const STATE_KEY = "upstream-budget-state";
const INFLIGHT_TIMEOUT_MS = 30 * 1000;

function dayKeyFromTimestamp(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function nextUtcDayIso(timestamp) {
  const date = new Date(timestamp);
  date.setUTCHours(24, 0, 0, 0);
  return date.toISOString();
}

function createEmptyState(timestamp) {
  return {
    dayKey: dayKeyFromTimestamp(timestamp),
    usedToday: 0,
    refreshInProgress: false,
    inflightToken: null,
    inflightExpiresAt: 0,
    lastRefreshStartedAt: 0,
    lastRefreshCompletedAt: 0,
  };
}

export class UpstreamBudgetCoordinator extends DurableObject {
  async loadState(timestamp) {
    const stored = await this.ctx.storage.get(STATE_KEY);
    const state = stored || createEmptyState(timestamp);
    const dayKey = dayKeyFromTimestamp(timestamp);

    if (state.dayKey !== dayKey) {
      return createEmptyState(timestamp);
    }

    if (state.refreshInProgress && state.inflightExpiresAt <= timestamp) {
      state.refreshInProgress = false;
      state.inflightToken = null;
      state.inflightExpiresAt = 0;
    }

    return state;
  }

  async acquireRefreshSlot({ now = Date.now(), dailyLimit }) {
    const state = await this.loadState(now);

    if (state.refreshInProgress) {
      return {
        allowed: false,
        reason: "inflight",
        dayKey: state.dayKey,
        usedToday: state.usedToday,
        remainingToday: Math.max(0, dailyLimit - state.usedToday),
        resetAt: nextUtcDayIso(now),
      };
    }

    if (state.usedToday >= dailyLimit) {
      return {
        allowed: false,
        reason: "daily-limit",
        dayKey: state.dayKey,
        usedToday: state.usedToday,
        remainingToday: 0,
        resetAt: nextUtcDayIso(now),
      };
    }

    state.usedToday += 1;
    state.refreshInProgress = true;
    state.lastRefreshStartedAt = now;
    state.inflightToken = `${state.dayKey}:${state.usedToday}:${now}`;
    state.inflightExpiresAt = now + INFLIGHT_TIMEOUT_MS;

    await this.ctx.storage.put(STATE_KEY, state);

    return {
      allowed: true,
      token: state.inflightToken,
      dayKey: state.dayKey,
      usedToday: state.usedToday,
      remainingToday: Math.max(0, dailyLimit - state.usedToday),
      resetAt: nextUtcDayIso(now),
    };
  }

  async finishRefresh({ token, now = Date.now(), dailyLimit }) {
    const state = await this.loadState(now);

    if (state.inflightToken === token) {
      state.refreshInProgress = false;
      state.inflightToken = null;
      state.inflightExpiresAt = 0;
      state.lastRefreshCompletedAt = now;
      await this.ctx.storage.put(STATE_KEY, state);
    }

    return {
      dayKey: state.dayKey,
      usedToday: state.usedToday,
      remainingToday: Math.max(0, dailyLimit - state.usedToday),
      resetAt: nextUtcDayIso(now),
    };
  }
}
