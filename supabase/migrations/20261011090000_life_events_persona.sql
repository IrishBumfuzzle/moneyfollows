-- Life meter events (docs/life-meters-api.md section 5 on main) and the persona key onboarding sends.
--
-- shop_purchase, work_shift and school_attended: one event per successful store purchase, work
-- shift or school day. health and sanity are the clamped changes (may be negative), price and
-- wage whole rupees, kind 'necessity' or 'want'. All values pass push_events' usual filter.
-- The type CHECK and the payload keys change together: a type with keys but missing from the
-- CHECK is rejected by every push (20261010235500_push_events_rejected.sql), and one in the
-- CHECK without keys is skipped as unknown.
--
-- persona_selected and onboarding_complete: the student app's onboarding sends persona_id
-- (snake_case, like the map and news events), so it is kept next to the older personaId, which
-- stays for existing clients. Nothing else in push_events changes.
-- create or replace keeps event_payload_keys' grants.

alter table public.events drop constraint events_type_check;
alter table public.events add constraint events_type_check check (type in (
  'app_open', 'onboarding_complete', 'persona_selected', 'decision_made', 'rewind_used', 'event_triggered',
  'minigame_complete', 'quiz_submitted', 'module_complete', 'badge_earned', 'language_changed', 'sync_complete',
  'map_opened', 'location_selected', 'week_slept', 'glossary_term_opened', 'news_question_answered',
  'news_edition_completed',
  'shop_purchase', 'work_shift', 'school_attended'
));

create or replace function public.event_payload_keys(ev_type text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case ev_type
    when 'app_open' then array[]::text[]
    when 'sync_complete' then array['count']
    -- personaId (older clients) and persona_id (onboarding) are both kept.
    when 'onboarding_complete' then array['level', 'lang', 'personaId', 'persona_id']
    when 'persona_selected' then array['personaId', 'persona_id', 'level']
    -- month and week identify the weekly slot, so a re-made (rewound) decision replaces the old one.
    when 'decision_made' then array['scenarioId', 'choiceId', 'pillar', 'month', 'week']
    -- month and week of the decision that was undone.
    when 'rewind_used' then array['scenarioId', 'month', 'week', 'tokensLeft']
    when 'event_triggered' then array['eventId', 'choiceId', 'month', 'week']
    when 'minigame_complete' then array['game', 'correct', 'total', 'score', 'level']
    when 'quiz_submitted' then array['quiz_type', 'quiz_id', 'answers', 'score']
    when 'module_complete' then array['moduleId', 'pillar']
    when 'badge_earned' then array['badgeId']
    when 'language_changed' then array['lang']
    when 'map_opened' then array[]::text[]
    -- A place id, or a sub-map location id such as convenience.phone_shop.
    when 'location_selected' then array['location_id']
    when 'week_slept' then array['month', 'week']
    when 'glossary_term_opened' then array['term_id', 'article_id']
    when 'news_question_answered' then array['edition', 'article_id', 'correct', 'attempt']
    when 'news_edition_completed' then array['edition', 'correct_count']
    -- Life meters: health and sanity are the clamped changes; price and wage whole rupees.
    when 'shop_purchase' then array['kind', 'price', 'health', 'sanity', 'month', 'week']
    when 'work_shift' then array['wage', 'health', 'sanity', 'month', 'week']
    when 'school_attended' then array['health', 'sanity', 'month', 'week']
  end
$$;
