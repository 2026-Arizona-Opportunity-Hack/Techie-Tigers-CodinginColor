-- schema.sql
-- Coding in Color — Donor & Funder Relationship Platform
-- Single source of truth. Run ONCE on a fresh Supabase project (SQL editor).
-- Replaces database.sql, 002, 003 and 004 — don't run those too.
--
-- Roles:
--   admin         CEO. Everything except deleting donors.
--   fundraising   Sees all donors, runs campaigns/events/imports. Can't reassign
--                 donors, change donor type, or send as someone else.
--   board_member  Sees and works only their own donors.
--
-- Donors are never deleted. They are active or inactive.
--   active    in outreach queues, owned by a board member
--   inactive  history kept and counted in reports; out of every queue;
--             no new drafts or sends. Owner can deactivate; only admin reactivates.
--
-- Imports, AI drafting and the API-key route run server-side as the service
-- role (bypasses RLS). User-facing requests run as `authenticated` with the
-- user's JWT so these policies apply.

------------------------------------------------------------
-- 1. Tables
------------------------------------------------------------

-- Everyone who logs in. id = their Supabase Auth user id.
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','board_member','fundraising')),
  -- "Remove board member" = active false + reassign donors. Don't hard-delete:
  -- communications.user_id keeps send history.
  active BOOLEAN NOT NULL DEFAULT true
);

-- CIC programs: AI Academy, Summer Camp...
CREATE TABLE programs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

-- Individuals, funders, and prospects who haven't given yet.
CREATE TABLE donors (
  id SERIAL PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  organization_name TEXT,               -- funders: "APS Foundation"
  email TEXT,
  phone TEXT,
  donor_type TEXT NOT NULL DEFAULT 'individual'
    CHECK (donor_type IN ('individual','funder')),
  owner_id UUID REFERENCES users(id),   -- board member; set by round-robin
  last_thanked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- active / inactive (never deleted)
  active BOOLEAN NOT NULL DEFAULT true,
  inactive_reason TEXT,                 -- 'asked to stop', 'moved away', 'duplicate'
  status_changed_at TIMESTAMPTZ,
  status_changed_by UUID REFERENCES users(id),
  merged_into INT REFERENCES donors(id),  -- set when this row was a merged duplicate
  -- normalized copies for dedupe
  email_normalized TEXT GENERATED ALWAYS AS (lower(trim(email))) STORED,
  phone_normalized TEXT GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED
);

-- One row per original record a donor was merged from.
CREATE TABLE donor_sources (
  id SERIAL PRIMARY KEY,
  donor_id INT NOT NULL REFERENCES donors(id),
  source TEXT NOT NULL,                 -- spreadsheet / zeffy / benevity
  external_name TEXT,
  external_email TEXT,
  external_id TEXT,                     -- row/transaction id from the export
  raw JSONB,                            -- original CSV row, for tracing merges
  imported_at TIMESTAMPTZ DEFAULT now()
);

-- Each donation.
CREATE TABLE gifts (
  id SERIAL PRIMARY KEY,
  donor_id INT NOT NULL REFERENCES donors(id),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  gift_date DATE NOT NULL,
  source TEXT NOT NULL,                 -- zeffy / benevity / spreadsheet / ...
  campaign TEXT,                        -- 'Giving Tuesday 2026'
  program_id INT REFERENCES programs(id),  -- links gifts to outcomes
  external_id TEXT                      -- stops duplicate gifts on re-import
);

-- Every message drafted, sent, skipped, or logged.
CREATE TABLE communications (
  id SERIAL PRIMARY KEY,
  donor_id INT NOT NULL REFERENCES donors(id),
  user_id UUID REFERENCES users(id),    -- who sent/logged it; NULL = system draft
  channel TEXT CHECK (channel IN ('email','text','call','in_person')),
  kind TEXT CHECK (kind IN ('thank_you','quarterly','follow_up','update','event_invite','other')),
  subject TEXT,
  body TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT false,  -- label AI drafts
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','skipped')),
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  -- "System drafts, human sends": sent requires a real person + timestamp
  CONSTRAINT comms_sent_by_human
    CHECK (status <> 'sent' OR (user_id IS NOT NULL AND sent_at IS NOT NULL))
);

-- CIC calendar: Day of Compute, camps...
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  event_date DATE NOT NULL,
  location TEXT,
  google_event_id TEXT,                 -- if synced with Google Calendar later
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Per-donor to-dos.
CREATE TABLE next_steps (
  id SERIAL PRIMARY KEY,
  donor_id INT NOT NULL REFERENCES donors(id),
  description TEXT NOT NULL,
  due_date DATE NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  assigned_to UUID REFERENCES users(id),
  event_id INT REFERENCES events(id),   -- "invite to Day of Compute"
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Program results per year, for the funder packet and donor updates.
CREATE TABLE outcomes (
  id SERIAL PRIMARY KEY,
  program_id INT NOT NULL REFERENCES programs(id),
  year INT NOT NULL,                    -- 2026
  description TEXT NOT NULL             -- '45 students, 3 schools'
);

-- Keys for CIC's dashboard. Store only the hash.
CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                   -- 'CIC org dashboard'
  key_hash TEXT UNIQUE NOT NULL,        -- sha256 of the key, never the key
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

-- Fuzzy-match duplicates waiting for an admin to confirm.
-- Exact email matches merge automatically (unique index below).
-- The review UI should hide pairs where either donor is already inactive.
CREATE TABLE duplicate_candidates (
  id SERIAL PRIMARY KEY,
  donor_id INT NOT NULL REFERENCES donors(id),
  candidate_id INT NOT NULL REFERENCES donors(id),
  score NUMERIC(5,2),                   -- rapidfuzz similarity 0-100
  reason TEXT,                          -- 'name 91 + same phone'
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','merged','not_duplicate')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  CHECK (donor_id < candidate_id),      -- store each pair once
  UNIQUE (donor_id, candidate_id)
);

-- Who exported PII, when, and what. Written by the backend.
CREATE TABLE export_log (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  kind TEXT NOT NULL
    CHECK (kind IN ('campaign_list','funder_packet','donor_history')),
  filter JSONB,                         -- {"program":"Summer Camp","min_gift":500}
  row_count INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

------------------------------------------------------------
-- 2. Indexes
------------------------------------------------------------
-- One donor per email (blank emails may repeat)
CREATE UNIQUE INDEX donors_email_unique
  ON donors (email_normalized)
  WHERE email_normalized IS NOT NULL AND email_normalized <> '';
CREATE INDEX donors_phone_idx  ON donors (phone_normalized);
CREATE INDEX donors_owner_idx  ON donors (owner_id);
CREATE INDEX donors_active_idx ON donors (active);

-- Re-importing the same export is a no-op
CREATE UNIQUE INDEX donor_sources_ext_unique
  ON donor_sources (source, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX gifts_ext_unique
  ON gifts (source, external_id) WHERE external_id IS NOT NULL;

CREATE INDEX gifts_donor_date_idx ON gifts (donor_id, gift_date);
CREATE INDEX comms_donor_idx      ON communications (donor_id, created_at);
CREATE INDEX next_steps_due_idx   ON next_steps (assigned_to, done, due_date);

------------------------------------------------------------
-- 3. Role helpers
------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users
                 WHERE id = auth.uid() AND role = 'admin' AND active);
$$;

-- Admin or fundraising: can see every donor
CREATE OR REPLACE FUNCTION is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users
                 WHERE id = auth.uid() AND role IN ('admin','fundraising') AND active);
$$;

CREATE OR REPLACE FUNCTION can_access_donor(did INT) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_staff()
      OR EXISTS (SELECT 1 FROM donors WHERE id = did AND owner_id = auth.uid());
$$;

------------------------------------------------------------
-- 4. Triggers
------------------------------------------------------------

-- Round-robin: a new active donor with no owner goes to the active board
-- member with the fewest ACTIVE donors. The lock stops two imports
-- picking the same person.
-- Fundraising can add donors but not choose the owner (only the CEO assigns),
-- so any owner they send is dropped and round-robin picks one.
CREATE OR REPLACE FUNCTION assign_owner_round_robin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF is_staff() AND NOT is_admin() THEN
    NEW.owner_id := NULL;
  END IF;
  IF NEW.owner_id IS NULL AND NEW.active THEN
    PERFORM pg_advisory_xact_lock(4242);
    SELECT u.id INTO NEW.owner_id
    FROM users u
    LEFT JOIN donors d ON d.owner_id = u.id AND d.active
    WHERE u.role = 'board_member' AND u.active
    GROUP BY u.id
    ORDER BY count(d.id), random()
    LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER donors_round_robin
  BEFORE INSERT ON donors
  FOR EACH ROW EXECUTE FUNCTION assign_owner_round_robin();

-- Guards donor updates:
--   stamps who/when on active changes
--   only admins reassign, change type, or reactivate
CREATE OR REPLACE FUNCTION protect_donor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.active IS DISTINCT FROM OLD.active THEN
    NEW.status_changed_at := now();
    NEW.status_changed_by := auth.uid();
    IF NEW.active THEN
      NEW.inactive_reason := NULL;
    END IF;
  END IF;

  -- Service role (imports) and admins can do anything else
  IF auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.donor_type IS DISTINCT FROM OLD.donor_type THEN
    RAISE EXCEPTION 'Only admins can change donor type';
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Only admins can reassign donors';
  END IF;

  IF NEW.active AND NOT OLD.active THEN
    RAISE EXCEPTION 'Only admins can reactivate a donor';
  END IF;

  IF NEW.merged_into IS DISTINCT FROM OLD.merged_into THEN
    RAISE EXCEPTION 'Only admins can merge donors';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER donors_protect
  BEFORE UPDATE ON donors
  FOR EACH ROW EXECUTE FUNCTION protect_donor();

-- Going inactive closes open work on that donor
CREATE OR REPLACE FUNCTION close_work_on_deactivate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.active AND NOT NEW.active THEN
    UPDATE next_steps
       SET done = true, completed_at = now()
     WHERE donor_id = NEW.id AND NOT done;
    UPDATE communications
       SET status = 'skipped'
     WHERE donor_id = NEW.id AND status = 'draft';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER donors_close_work
  AFTER UPDATE OF active ON donors
  FOR EACH ROW EXECUTE FUNCTION close_work_on_deactivate();

-- Reassigning a donor moves their open to-dos to the new owner,
-- so nothing is stranded with someone who can no longer see the donor
CREATE OR REPLACE FUNCTION move_open_steps_with_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    UPDATE next_steps SET assigned_to = NEW.owner_id
     WHERE donor_id = NEW.id AND NOT done;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER donors_move_steps
  AFTER UPDATE OF owner_id ON donors
  FOR EACH ROW EXECUTE FUNCTION move_open_steps_with_owner();

-- Backstop: no new drafts or sends to inactive donors,
-- even if a bug or a batch job forgets to filter
CREATE OR REPLACE FUNCTION block_inactive_outreach() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('draft','sent')
     AND EXISTS (SELECT 1 FROM donors WHERE id = NEW.donor_id AND NOT active) THEN
    RAISE EXCEPTION 'This donor is inactive';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER comms_block_inactive
  BEFORE INSERT OR UPDATE ON communications
  FOR EACH ROW EXECUTE FUNCTION block_inactive_outreach();

------------------------------------------------------------
-- 5. Merging duplicates (admin only)
--    App calls: supabase.rpc('merge_donors', { keep_id, dup_id })
--    Moves everything from dup to keep, fills keep's blank contact
--    fields from dup, then marks dup inactive with merged_into = keep.
--    One function = one transaction: it all happens or none of it does.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION merge_donors(keep_id INT, dup_id INT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  keep_row donors%ROWTYPE;
  dup_row  donors%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can merge donors';
  END IF;
  IF keep_id = dup_id THEN
    RAISE EXCEPTION 'Cannot merge a donor into itself';
  END IF;

  -- Lock both rows so nothing changes mid-merge
  SELECT * INTO keep_row FROM donors WHERE id = keep_id FOR UPDATE;
  SELECT * INTO dup_row  FROM donors WHERE id = dup_id  FOR UPDATE;

  IF keep_row.id IS NULL OR dup_row.id IS NULL THEN
    RAISE EXCEPTION 'Donor not found';
  END IF;
  IF keep_row.merged_into IS NOT NULL OR dup_row.merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'One of these donors was already merged';
  END IF;
  IF NOT keep_row.active THEN
    RAISE EXCEPTION 'Reactivate the donor you are keeping before merging into it';
  END IF;

  -- Move history
  UPDATE gifts          SET donor_id = keep_id WHERE donor_id = dup_id;
  UPDATE communications SET donor_id = keep_id WHERE donor_id = dup_id;
  UPDATE next_steps     SET donor_id = keep_id WHERE donor_id = dup_id;
  UPDATE donor_sources  SET donor_id = keep_id WHERE donor_id = dup_id;

  -- Open to-dos follow the kept donor's owner
  UPDATE next_steps SET assigned_to = keep_row.owner_id
   WHERE donor_id = keep_id AND NOT done;

  -- Free dup's email first (emails are unique), then fill keep's blanks.
  -- dup's original email is still in donor_sources.raw.
  UPDATE donors SET email = NULL WHERE id = dup_id;
  UPDATE donors SET
    first_name        = coalesce(first_name, dup_row.first_name),
    last_name         = coalesce(last_name, dup_row.last_name),
    organization_name = coalesce(organization_name, dup_row.organization_name),
    email             = coalesce(nullif(email, ''), dup_row.email),
    phone             = coalesce(nullif(phone, ''), dup_row.phone),
    last_thanked_at   = greatest(last_thanked_at, dup_row.last_thanked_at)
  WHERE id = keep_id;

  -- Retire the duplicate
  UPDATE donors SET
    active          = false,
    inactive_reason = 'duplicate',
    merged_into     = keep_id
  WHERE id = dup_id;

  -- Close the review item for this pair
  UPDATE duplicate_candidates SET
    status      = 'merged',
    reviewed_by = auth.uid(),
    reviewed_at = now()
  WHERE donor_id = least(keep_id, dup_id)
    AND candidate_id = greatest(keep_id, dup_id);
END $$;

REVOKE EXECUTE ON FUNCTION merge_donors(INT, INT) FROM public, anon;
GRANT  EXECUTE ON FUNCTION merge_donors(INT, INT) TO authenticated;

------------------------------------------------------------
-- 6. Row-level security
------------------------------------------------------------
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE donors               ENABLE ROW LEVEL SECURITY;
ALTER TABLE donor_sources        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_steps           ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcomes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys             ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplicate_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_log           ENABLE ROW LEVEL SECURITY;

-- users: see yourself; staff see everyone; admins edit.
-- (Everyone can see teammates' names through user_directory below.)
CREATE POLICY users_read ON users FOR SELECT
  USING (id = auth.uid() OR is_staff());
CREATE POLICY users_admin_write ON users FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- programs & outcomes: everyone signed in reads; admins write
CREATE POLICY programs_read ON programs FOR SELECT TO authenticated USING (true);
CREATE POLICY programs_admin ON programs FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY outcomes_read ON outcomes FOR SELECT TO authenticated USING (true);
CREATE POLICY outcomes_admin ON outcomes FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- donors: no DELETE policy, and DELETE revoked below — nobody deletes from the app
CREATE POLICY donors_read ON donors FOR SELECT
  USING (owner_id = auth.uid() OR is_staff());
CREATE POLICY donors_update ON donors FOR UPDATE
  USING (owner_id = auth.uid() OR is_admin())
  WITH CHECK (owner_id = auth.uid() OR is_admin());
CREATE POLICY donors_staff_insert ON donors FOR INSERT WITH CHECK (is_staff());  -- admin + fundraising
CREATE POLICY donors_member_insert ON donors FOR INSERT   -- board member adds a contact
  WITH CHECK (owner_id = auth.uid());

-- donor_sources & gifts: readable with the donor; written by admins/imports
CREATE POLICY sources_read ON donor_sources FOR SELECT USING (can_access_donor(donor_id));
CREATE POLICY sources_admin ON donor_sources FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY gifts_read ON gifts FOR SELECT USING (can_access_donor(donor_id));
CREATE POLICY gifts_admin ON gifts FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- communications: read with the donor; log/send only as yourself.
-- Only drafts can be edited (system drafts or your own); sent/skipped
-- messages are history and only an admin can correct them.
CREATE POLICY comms_read ON communications FOR SELECT USING (can_access_donor(donor_id));
CREATE POLICY comms_insert ON communications FOR INSERT
  WITH CHECK (can_access_donor(donor_id) AND (user_id = auth.uid() OR is_admin()));
CREATE POLICY comms_update ON communications FOR UPDATE
  USING (can_access_donor(donor_id)
         AND (is_admin()
              OR (status = 'draft' AND (user_id IS NULL OR user_id = auth.uid()))))
  WITH CHECK (can_access_donor(donor_id) AND (user_id = auth.uid() OR is_admin()));

-- next_steps: anyone who can see the donor (fundraising can bulk-create invites)
CREATE POLICY steps_all ON next_steps FOR ALL
  USING (can_access_donor(donor_id)) WITH CHECK (can_access_donor(donor_id));

-- events: everyone reads; admin + fundraising manage
CREATE POLICY events_read ON events FOR SELECT TO authenticated USING (true);
CREATE POLICY events_staff ON events FOR ALL
  USING (is_staff()) WITH CHECK (is_staff());

-- admin-only tables
CREATE POLICY api_keys_admin ON api_keys FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY dupes_admin ON duplicate_candidates FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY export_log_admin_read ON export_log FOR SELECT USING (is_admin());

------------------------------------------------------------
-- 7. Grants
------------------------------------------------------------
-- Donors are never deleted from the app. Without the grant, a delete call
-- errors instead of silently doing nothing. The service role can still
-- delete if you ever need to wipe test data.
REVOKE DELETE ON donors FROM authenticated, anon;

------------------------------------------------------------
-- 8. Views
------------------------------------------------------------

-- Teammate names for "Sent by Maria" on the timeline.
-- Runs as the view owner (not security_invoker) on purpose, so board members
-- can see names and roles without seeing emails or other user rows.
CREATE OR REPLACE VIEW user_directory AS
  SELECT id, name, role, active FROM users;
REVOKE ALL ON user_directory FROM anon, public;
GRANT SELECT ON user_directory TO authenticated;

-- Retention: per donor, per year
--   new / retained / increased / decreased / reactivated / lapsed
-- security_invoker = RLS still applies when querying it.
-- Includes inactive donors (it's history). Merged duplicates drop out
-- because their gifts moved to the kept donor.
-- For the current (unfinished) year, "lapsed" means "not yet this year".
CREATE OR REPLACE VIEW donor_retention WITH (security_invoker = true) AS
WITH yearly AS (
  SELECT donor_id, extract(year FROM gift_date)::int AS yr, sum(amount) AS total
  FROM gifts
  GROUP BY 1, 2
),
years AS (SELECT DISTINCT yr FROM yearly),
donors_with_gifts AS (SELECT DISTINCT donor_id FROM yearly),
grid AS (
  SELECT d.donor_id, y.yr FROM donors_with_gifts d CROSS JOIN years y
),
labeled AS (
  SELECT g.donor_id,
         g.yr                    AS year,
         coalesce(cur.total, 0)  AS total,
         coalesce(prev.total, 0) AS prev_total,
         CASE
           WHEN cur.total IS NULL AND prev.total IS NULL THEN NULL
           WHEN cur.total IS NULL THEN 'lapsed'
           WHEN prev.total IS NULL AND EXISTS (
             SELECT 1 FROM yearly e WHERE e.donor_id = g.donor_id AND e.yr < g.yr - 1
           ) THEN 'reactivated'
           WHEN prev.total IS NULL THEN 'new'
           WHEN cur.total > prev.total THEN 'increased'
           WHEN cur.total < prev.total THEN 'decreased'
           ELSE 'retained'
         END AS status
  FROM grid g
  LEFT JOIN yearly cur  ON cur.donor_id  = g.donor_id AND cur.yr  = g.yr
  LEFT JOIN yearly prev ON prev.donor_id = g.donor_id AND prev.yr = g.yr - 1
)
SELECT * FROM labeled WHERE status IS NOT NULL;