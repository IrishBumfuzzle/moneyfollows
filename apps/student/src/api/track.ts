// Stand-in for the shared event queue (CLAUDE.md 5.5: SyncEvent, push_events). Logs to the console.
// To connect: replace the body with the api-client queue, which adds event_id, anon_id, class_id,
// client_ts and content_version. Events fired before join_class (language_changed on the first
// onboarding step) have no anon_id yet, so the queue should hold them until the profile exists.

export type TrackType =
  | 'app_open' | 'onboarding_complete' | 'persona_selected' | 'decision_made'
  | 'rewind_used' | 'event_triggered' | 'minigame_complete' | 'quiz_submitted'
  | 'module_complete' | 'badge_earned' | 'language_changed' | 'sync_complete'
  | 'map_opened' | 'location_selected'
  | 'week_slept' | 'glossary_term_opened' | 'news_question_answered' | 'news_edition_completed';

export function track(type: TrackType, payload: Record<string, unknown> = {}): void {
  console.info('[track]', type, payload);
}
