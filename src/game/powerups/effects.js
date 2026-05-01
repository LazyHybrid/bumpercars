// List and implement power-up effects here
// Each power-up should be a named export function

import {
  ABILITY_DEFINITIONS,
  ABILITY_IDS,
  tryActivateAbility,
  getBaseMovementSpeedScale,
} from '../abilities';
import { clamp, lerp } from '../math';

/**
 * Activates the speed boost ability for a player.
 * Called on the rising edge of the Space key.
 */
export function speedBoost(player, now) {
  tryActivateAbility(player, ABILITY_IDS.SPEED_BOOST, now, {
    startScale: getBaseMovementSpeedScale(player),
  });
}

/**
 * Returns the effective speed scale for the current frame.
 * Returns baseSpeedScale unchanged when the ability is not active.
 */
export function getSpeedBoostScale(player, baseSpeedScale, now) {
  const abilityId = ABILITY_IDS.SPEED_BOOST;
  const definition = ABILITY_DEFINITIONS[abilityId];
  const state = player.abilities?.[abilityId];

  if (!definition || !state || now >= state.activeUntil) {
    return baseSpeedScale;
  }

  const rampProgress = definition.rampUpTime > 0
    ? clamp((now - state.activatedAt) / definition.rampUpTime, 0, 1)
    : 1;
  const startScale = Number.isFinite(state.data?.startScale)
    ? state.data.startScale
    : baseSpeedScale;

  return Math.max(baseSpeedScale, lerp(startScale, definition.maxSpeedScale, rampProgress));
}

export function shield(player) {
  // TODO: Implement shield effect
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
