-- 003_roles_events_dedupe.sql
-- Run AFTER 002_security_and_fixes.sql in the Supabase SQL editor.
-- Adds: fundraising role, board members adding donors, soft-deactivated users,
-- events for "invite to an event" next steps, a dedupe review queue,
-- an export log, and a few CHECKs the doc's features depend on.

------------------------------------------------------------
-- 1. Fundraising role + deactivate instead of delete
------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin','board_member','fundraising'));

-- "Remove board member" = set active = false and reassign their donors.
-- Don't hard-delete: communications.user_id keeps send history and will
-- (correctly) block deleting a user who has sent messages.
ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;

------------------------------------------------------------
-- 2. Role helpers (replace the 002 versions)
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

-- Used by donor_sources, gifts, communications, next_steps policies
CREATE OR REPLACE FUNCTION can_access_donor(did INT) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_staff()
      OR EXISTS (SELECT 1 FROM donors WHERE id = did AND owner_id = auth.uid());
$$;

------------------------------------------------------------
-- 3. Policy updates
------------------------------------------------------------
-- Fundraising sees all donors (read-only; donors_update stays owner/admin)
DROP POLICY IF EXISTS donors_read ON donors;
CREATE POLICY donors_read ON donors FOR SELECT
  USING (owner_id = auth.uid() OR is_staff());

-- Board members can add a donor they met; it's assigned to them
CREATE POLICY donors_member_insert ON donors FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Fundraising needs board member names to see "who owns whom"
DROP POLICY IF EXISTS users_read ON users;
CREATE POLICY users_read ON users FOR SELECT
  USING (id = auth.uid() OR is_staff());

-- Notes:
-- * communications insert already requires user_id = auth.uid(), so
--   fundraising can log their own outreach but can't send as a board member.
-- * next_steps uses can_access_donor, so fundraising can create
--   "invite to Giving Tuesday" steps on any donor (set assigned_to = owner).

------------------------------------------------------------
-- 4. Only admins change owner or donor type
------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_donor_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL            -- service role (imports) is allowed
     AND NOT is_admin()
     AND (NEW.owner_id   IS DISTINCT FROM OLD.owner_id
       OR NEW.donor_type IS DISTINCT FROM OLD.donor_type) THEN
    RAISE EXCEPTION 'Only admins can reassign donors or change donor type';
  END IF;
  RETURN NEW;
END $$;

------------------------------------------------------------
-- 5. Round-robin skips deactivated board members
------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_owner_round_robin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(4242);
    SELECT u.id INTO NEW.owner_id
    FROM users u
    LEFT JOIN donors d ON d.owner_id = u.id
    WHERE u.role = 'board_member' AND u.active
    GROUP BY u.id
    ORDER BY count(d.id), random()
    LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

------------------------------------------------------------
-- 6. CHECKs the features rely on
------------------------------------------------------------
-- Funder packet button only shows for funders
ALTER TABLE donors ADD CONSTRAINT donors_type_check
  CHECK (donor_type IN ('individual','funder'));

-- "Not contacted this quarter" query filters on kind
ALTER TABLE communications ADD CONSTRAINT comms_kind_check
  CHECK (kind IN ('thank_you','quarterly','follow_up','update','event_invite','other'));

-- Outcomes are entered "per year" and joined to gift years
ALTER TABLE outcomes ADD COLUMN year INT;
UPDATE outcomes SET year = period::int WHERE period ~ '^\d{4}$';

------------------------------------------------------------
-- 7. Events (Day of Compute, camps) for "invite to an event"
------------------------------------------------------------
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                   -- 'Day of Compute'
  event_date DATE NOT NULL,
  location TEXT,
  google_event_id TEXT,                 -- if synced with Google Calendar later
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE next_steps ADD COLUMN event_id INT REFERENCES events(id);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_read ON events FOR SELECT TO authenticated USING (true);
CREATE POLICY events_staff ON events FOR ALL
  USING (is_staff()) WITH CHECK (is_staff());

------------------------------------------------------------
-- 8. Dedupe review queue ("review dupes from CSV import")
--    Exact email matches merge automatically (unique index in 002).
--    Fuzzy name/phone matches from Rapidfuzz land here for a human.
------------------------------------------------------------
CREATE TABLE duplicate_candidates (
  id SERIAL PRIMARY KEY,
  donor_id INT NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  candidate_id INT NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
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

ALTER TABLE duplicate_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY dupes_admin ON duplicate_candidates FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

------------------------------------------------------------
-- 9. Export log: campaign lists, funder packets and donor PDFs
--    all leave the system with PII, so record who exported what.
--    Rows are written by the backend (service role).
------------------------------------------------------------
CREATE TABLE export_log (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  kind TEXT NOT NULL
    CHECK (kind IN ('campaign_list','funder_packet','donor_history')),
  filter JSONB,                         -- {"program":"Summer Camp","min_gift":500}
  row_count INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE export_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY export_log_admin_read ON export_log FOR SELECT USING (is_admin());