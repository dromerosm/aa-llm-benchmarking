import { DurableObject } from "cloudflare:workers";

// v2 counts only upstream requests actually sent; v1 kept reservations that were never returned.
const STATE_KEY = "upstream-budget-state-v2";
const INFLIGHT_TIMEOUT_MS = 30 * 1000;
const PAYLOAD_KEY_PREFIX = "payload:";

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
    inflightCost: 0,
    lastRefreshStartedAt: 0,
    lastRefreshCompletedAt: 0,
    lastUpstreamRequestAt: 0,
  };
}

export class UpstreamBudgetCoordinator extends DurableObject {
  async loadState(timestamp) {
    const stored = await this.ctx.storage.get(STATE_KEY);
    const state = {
      ...createEmptyState(timestamp),
      ...(stored || {}),
    };
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

  async scheduleUpstreamRequest({ now = Date.now(), minIntervalMs = 0 }) {
    const state = await this.loadState(now);
    const scheduledAt = Math.max(now, state.lastUpstreamRequestAt + minIntervalMs);

    state.lastUpstreamRequestAt = scheduledAt;
    await this.ctx.storage.put(STATE_KEY, state);

    return {
      scheduledAt,
      waitMs: Math.max(0, scheduledAt - now),
    };
  }

  // The edge cache is per data center, so the last refreshed payload lives here
  // and every data center reads it instead of calling upstream.
  async getSharedPayload({ cacheKey }) {
    return (await this.ctx.storage.get(`${PAYLOAD_KEY_PREFIX}${cacheKey}`)) || null;
  }

  async acquireRefreshSlot({ now = Date.now(), dailyLimit, cost = 1 }) {
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

    if (state.usedToday + cost > dailyLimit) {
      return {
        allowed: false,
        reason: "daily-limit",
        dayKey: state.dayKey,
        usedToday: state.usedToday,
        remainingToday: 0,
        resetAt: nextUtcDayIso(now),
      };
    }

    state.usedToday += cost;
    state.refreshInProgress = true;
    state.lastRefreshStartedAt = now;
    state.inflightToken = `${state.dayKey}:${state.usedToday}:${now}`;
    state.inflightExpiresAt = now + INFLIGHT_TIMEOUT_MS;
    state.inflightCost = cost;

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

  async finishRefresh({ token, now = Date.now(), dailyLimit, usedCost, cacheKey, payload, refreshedAt, expiresAt }) {
    const state = await this.loadState(now);

    if (cacheKey && payload && expiresAt) {
      try {
        await this.ctx.storage.put(`${PAYLOAD_KEY_PREFIX}${cacheKey}`, { payload, refreshedAt, expiresAt });
      } catch (error) {
        console.error("Failed to store shared payload", {
          cacheKey,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (state.inflightToken === token) {
      // Slots reserve a worst-case cost; give back what the refresh did not spend.
      if (typeof usedCost === "number" && usedCost < state.inflightCost) {
        state.usedToday = Math.max(0, state.usedToday - (state.inflightCost - usedCost));
      }

      state.refreshInProgress = false;
      state.inflightToken = null;
      state.inflightExpiresAt = 0;
      state.inflightCost = 0;
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
