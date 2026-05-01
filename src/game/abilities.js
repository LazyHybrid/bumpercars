import {
  BASE_SPEED_SCALE,
  BOOSTED_SPEED_SCALE,
  SPEED_BOOST_COOLDOWN_SECONDS,
  SPEED_BOOST_DURATION_SECONDS,
  SPEED_BOOST_MAX_SPEED_SCALE,
  SPEED_BOOST_RAMP_UP_SECONDS,
} from './config';
import { getCooldownProgress, isCooldownActive } from './cooldowns';
import { clamp, lerp } from './math';

export const ABILITY_IDS = {
  SPEED_BOOST: 'speedBoost',
};

export const ABILITY_DEFINITIONS = {
  [ABILITY_IDS.SPEED_BOOST]: {
    cooldown: SPEED_BOOST_COOLDOWN_SECONDS,
    duration: SPEED_BOOST_DURATION_SECONDS,
    rampUpTime: SPEED_BOOST_RAMP_UP_SECONDS,
    maxSpeedScale: SPEED_BOOST_MAX_SPEED_SCALE,
    icon: '⚡',
    label: 'Speed boost',
  },
};

export function createAbilityState() {
  return Object.fromEntries(
    Object.keys(ABILITY_DEFINITIONS).map((abilityId) => [
      abilityId,
      {
        activatedAt: 0,
        activeUntil: 0,
        cooldownUntil: 0,
        data: {},
      },
    ])
  );
}

export function getBaseMovementSpeedScale(player) {
  return lerp(BASE_SPEED_SCALE, BOOSTED_SPEED_SCALE, clamp(player.speedRamp ?? 0, 0, 1));
}

export function tryActivateAbility(player, abilityId, now, data = {}) {
  const definition = ABILITY_DEFINITIONS[abilityId];
  const state = player.abilities?.[abilityId];

  if (!definition || !state || now < state.cooldownUntil) {
    return false;
  }

  state.activatedAt = now;
  state.activeUntil = now + definition.duration;
  state.cooldownUntil = now + definition.cooldown;
  state.data = { ...data };
  return true;
}

export function isAbilityActive(player, abilityId, now) {
  const state = player.abilities?.[abilityId];
  return isCooldownActive(state, now);
}

export function getAbilityCooldownProgress(player, abilityId, now) {
  const definition = ABILITY_DEFINITIONS[abilityId];
  const state = player.abilities?.[abilityId];
  return getCooldownProgress(state, definition?.cooldown, now);
}

export function serializePlayerAbilities(player) {
  return Object.fromEntries(
    Object.keys(ABILITY_DEFINITIONS).map((abilityId) => {
      const state = player.abilities?.[abilityId] ?? {};
      return [
        abilityId,
        {
          activatedAt: Number(state.activatedAt) || 0,
          activeUntil: Number(state.activeUntil) || 0,
          cooldownUntil: Number(state.cooldownUntil) || 0,
          data: { ...(state.data ?? {}) },
        },
      ];
    })
  );
}

export function applyPlayerAbilitiesSnapshot(player, snapshot) {
  if (!player.abilities) {
    player.abilities = createAbilityState();
  }

  for (const abilityId of Object.keys(ABILITY_DEFINITIONS)) {
    const nextState = snapshot?.[abilityId];
    const target = player.abilities[abilityId];

    if (!nextState || typeof nextState !== 'object') {
      target.activatedAt = 0;
      target.activeUntil = 0;
      target.cooldownUntil = 0;
      target.data = {};
      continue;
    }

    target.activatedAt = Number(nextState.activatedAt) || 0;
    target.activeUntil = Number(nextState.activeUntil) || 0;
    target.cooldownUntil = Number(nextState.cooldownUntil) || 0;
    target.data = { ...(nextState.data ?? {}) };
  }
}

export function resetPlayerAbilities(player) {
  player.abilities = createAbilityState();
}

export function updatePlayerAbilityInput(player, input, now) {
  if (!player.abilityInputState) {
    player.abilityInputState = { speedBoostHeld: false };
  }

  const speedBoostHeld = Boolean(input?.speedBoost);
  if (speedBoostHeld && !player.abilityInputState.speedBoostHeld) {
    tryActivateAbility(player, ABILITY_IDS.SPEED_BOOST, now, {
      startScale: getBaseMovementSpeedScale(player),
    });
  }

  player.abilityInputState.speedBoostHeld = speedBoostHeld;
}