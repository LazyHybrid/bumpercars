// List and implement power-up effects here
// Each power-up should be a named export function

import {
  BASE_SPEED_SCALE,
  BOOSTED_SPEED_SCALE,
  SHIELD_CHARGES_ON_PICKUP,
  SHIELD_DURATION_SECONDS,
  SPEED_BOOST_COOLDOWN_SECONDS,
  SPEED_BOOST_DURATION_SECONDS,
  SPEED_BOOST_MAX_SPEED_SCALE,
  SPEED_BOOST_RAMP_UP_SECONDS,
} from '../config';
import { clamp, lerp } from '../math';

const SPEED_BOOST_ABILITY_ID = 'speedBoost';
const SHIELD_KNOCKBACK_MULTIPLIER = 2.5;

function ensureShieldState(player) {
  if (!player.shield) {
    player.shield = { charges: 0, activeUntil: 0 };
  }

  return player.shield;
}

function getBaseMovementSpeedScale(player) {
  return lerp(BASE_SPEED_SCALE, BOOSTED_SPEED_SCALE, clamp(player.speedRamp ?? 0, 0, 1));
}

/**
 * Activates the speed boost ability for a player.
 * Called on the rising edge of the Space key.
 */
export function speedBoost(player, now) {
  const abilityState = player.abilities?.[SPEED_BOOST_ABILITY_ID];
  if (!abilityState || now < abilityState.cooldownUntil) {
    return false;
  }

  abilityState.activatedAt = now;
  abilityState.activeUntil = now + SPEED_BOOST_DURATION_SECONDS;
  abilityState.cooldownUntil = now + SPEED_BOOST_COOLDOWN_SECONDS;
  abilityState.data = {
    startScale: getBaseMovementSpeedScale(player),
  };

  return true;
}

/**
 * Returns the effective speed scale for the current frame.
 * Returns baseSpeedScale unchanged when the ability is not active.
 */
export function getSpeedBoostScale(player, baseSpeedScale, now) {
  const state = player.abilities?.[SPEED_BOOST_ABILITY_ID];

  if (!state || now >= state.activeUntil) {
    return baseSpeedScale;
  }

  const rampProgress = SPEED_BOOST_RAMP_UP_SECONDS > 0
    ? clamp((now - state.activatedAt) / SPEED_BOOST_RAMP_UP_SECONDS, 0, 1)
    : 1;
  const startScale = Number.isFinite(state.data?.startScale)
    ? state.data.startScale
    : baseSpeedScale;

  return Math.max(baseSpeedScale, lerp(startScale, SPEED_BOOST_MAX_SPEED_SCALE, rampProgress));
}

export function shield(player) {
  const shieldState = ensureShieldState(player);
  shieldState.charges += SHIELD_CHARGES_ON_PICKUP;
}

export function activateShield(player, now) {
  const shieldState = ensureShieldState(player);
  if (shieldState.charges <= 0) {
    return false;
  }

  shieldState.charges -= 1;
  shieldState.activeUntil = now + SHIELD_DURATION_SECONDS;
  return true;
}

export function isShieldActive(player, now) {
  return now < (player.shield?.activeUntil ?? 0);
}

export function getShieldKnockbackScale(targetShielded, sourceShielded) {
  if (targetShielded) {
    return 0;
  }

  return sourceShielded ? SHIELD_KNOCKBACK_MULTIPLIER : 1;
}

export function rocket(player) {
  // TODO: Implement rocket effect
}

export function ghost(player) {
  // TODO: Implement ghost effect
}

export function bomb(player) {
  // TODO: Implement bomb effect
}
