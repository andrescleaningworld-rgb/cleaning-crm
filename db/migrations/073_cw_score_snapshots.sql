-- 073: Cleaning World Score history (Overview card, lib/pg/cw-score.ts).
--
--   cw_score_snapshots   One row per office day: the Cleaning World Score
--                        (weighted average of the sub scores, weighted by each
--                        sub's monthly sub pay), written when the Overview
--                        card is read and by the daily cron. The card shows
--                        "▲ 0.3 since last month" once a row from about 30
--                        days ago exists. The score of 30 days ago cannot be
--                        worked out afterwards: which sub had which account
--                        and at what pay is not kept, and closed complaints
--                        mostly have no real close date.
--
-- Safe to run twice.

CREATE TABLE IF NOT EXISTS cw_score_snapshots (
  day          DATE PRIMARY KEY,
  score        NUMERIC(4,1) NOT NULL,
  total_pay    NUMERIC(12,2) NOT NULL DEFAULT 0,
  subs_counted INTEGER NOT NULL DEFAULT 0,
  subs_below_7 INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
