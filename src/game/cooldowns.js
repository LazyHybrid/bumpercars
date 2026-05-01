import { clamp } from './math';

export function isCooldownActive(cooldownState, now) {
  return Boolean(cooldownState && now < cooldownState.activeUntil);
}

export function getCooldownProgress(cooldownState, cooldownDuration, now) {
  if (!cooldownState || !Number.isFinite(cooldownDuration) || cooldownDuration <= 0) {
    return 1;
  }

  if (now >= cooldownState.cooldownUntil) {
    return 1;
  }

  const cooldownStart = cooldownState.cooldownUntil - cooldownDuration;
  return clamp((now - cooldownStart) / cooldownDuration, 0, 1);
}

export function syncCooldownIndicator(container, iconElement, definition, cooldownState, now) {
  if (!container || !iconElement || !definition) {
    return;
  }

  const cooldownProgress = getCooldownProgress(cooldownState, definition.cooldown, now);
  const active = isCooldownActive(cooldownState, now);

  container.style.setProperty('--cooldown-progress', String(cooldownProgress));
  container.dataset.ready = cooldownProgress >= 1 ? 'true' : 'false';
  container.dataset.active = active ? 'true' : 'false';
  container.setAttribute('aria-label', `${definition.label} ${cooldownProgress >= 1 ? 'ready' : 'cooling down'}`);
  iconElement.textContent = definition.icon;
}