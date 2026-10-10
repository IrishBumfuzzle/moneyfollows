import { track } from '../../api/track';

// app_open marks a session start, not a mount: MainScreen mounts again every time the player
// comes back from the map or the paper, so only the first call per page load counts.
let opened = false;

export function trackAppOpen(): void {
  if (opened) return;
  opened = true;
  track('app_open');
}
