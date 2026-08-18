-- ============================================================================
-- Job description storage on opportunities
-- ============================================================================
-- ADDITIVE ONLY. Idempotent. One column; touches no existing object.
--
-- WHY THIS COLUMN DID NOT ALREADY EXIST, AND WHY IT DOES NOW
--
-- The pipeline modelled everything *about* a pursuit — title, stage, salary,
-- dates, which resume was sent — but never the posting itself. That was
-- workable while opportunities were typed in by hand from a tab that was still
-- open. It stops being workable for two things landing this week:
--
--   * Capture. The browser extension's whole purpose is to lift a posting off
--     a page once, so it never has to be re-read. Without somewhere to put the
--     description, capture would discard the most valuable thing it collected.
--   * Interview preparation. Preparing against a role means preparing against
--     what the role actually asked for. Postings are routinely taken down
--     between application and interview, which is exactly when the text is
--     needed and exactly when the URL stops resolving.
--
-- `text`, not `jsonb`: this is the posting as published, kept verbatim. Any
-- structure derived from it (skills, seniority, salary) already has typed
-- columns of its own, and storing the prose as anything other than prose would
-- mean deciding on a schema for something whose shape is different on every
-- job board.
--
-- NOT ADDED TO search_vector, deliberately. `opportunities.search_vector` is a
-- generated column, so extending it means dropping and recreating the column
-- and its GIN index on a table holding live data — a rewrite, not an addition,
-- and the opposite of the additive discipline in ADR-008. Searching across
-- stored descriptions is worth having, but it is worth having as its own
-- considered migration rather than as a side effect of adding storage.
-- ============================================================================

alter table opportunities
  add column if not exists job_description text;

comment on column opportunities.job_description is
  'The job posting text as published, stored verbatim. Survives the posting being taken down; the source of truth for interview preparation and for AI extraction. Deliberately absent from search_vector — see the migration header.';
