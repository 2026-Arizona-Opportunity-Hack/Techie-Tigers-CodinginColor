-- schema.sql
-- Coding in Color — Donor & Funder Relationship Platform
-- Combines database.sql + 002_security_and_fixes.sql + 003_roles_events_dedupe.sql.
-- Run ONCE on a fresh Supabase project (SQL editor). Don't run the old files too.
--
-- Roles:
--   admin         CEO. Everything.
--   fundraising   Sees all donors, runs campaigns/events/imports. Can't reassign
--                 donors, change donor type, or send as someone else.
--   board_member  Sees and works only their own donors.
-- Imports, AI drafting and the API-key route run server-side as the service
-- role (bypasses RLS). User-facing requests should run as `authenticated`
-- with the user's JWT claims so these policies apply.

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
  -- communications.user_id keeps send history and blocks deleting senders.
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
  user_id UUID REFERENCES users(id),    -- who sent/logged it
  channel TEXT CHECK (channel IN ('email','text','call','in_person')),
  kind TEXT CHECK (kind IN ('thank_you','quarterly','follow_up','update','event_invite','other')),
  subject TEXT,
  body TEXT,
  ai_generated BOOLEAN NOT NULL DEFAULT false,  -- P1: label GPT drafts
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
CREATE INDEX donors_phone_idx ON donors (phone_normalized);
CREATE INDEX donors_owner_idx ON donors (owner_id);

-- Re-importing the same export is a no-op
CREATE UNIQUE INDEX donor_sources_ext_unique
  ON donor_sources (source, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX gifts_ext_unique
  ON gifts (source, external_id) WHERE external_id IS NOT NULL;

CREATE INDEX gifts_donor_date_idx ON gifts (donor_id, gift_date);
CREATE INDEX comms_donor_idx ON communications (donor_id, created_at);
CREATE INDEX next_steps_due_idx ON next_steps (assigned_to, done, due_date);

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
-- Round-robin: a new donor with no owner goes to the active board member
-- with the fewest donors. The lock stops two imports picking the same person.
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

CREATE TRIGGER donors_round_robin
  BEFORE INSERT ON donors
  FOR EACH ROW EXECUTE FUNCTION assign_owner_round_robin();

-- Only admins change a donor's owner or type
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

CREATE TRIGGER donors_protect_owner
  BEFORE UPDATE ON donors
  FOR EACH ROW EXECUTE FUNCTION protect_donor_owner();

------------------------------------------------------------
-- 5. Row-level security
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

-- users: see yourself; staff see everyone; admins edit
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

-- donors
CREATE POLICY donors_read ON donors FOR SELECT
  USING (owner_id = auth.uid() OR is_staff());
CREATE POLICY donors_update ON donors FOR UPDATE
  USING (owner_id = auth.uid() OR is_admin())
  WITH CHECK (owner_id = auth.uid() OR is_admin());
CREATE POLICY donors_admin_insert ON donors FOR INSERT WITH CHECK (is_admin());
CREATE POLICY donors_member_insert ON donors FOR INSERT   -- board member adds a contact
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY donors_admin_delete ON donors FOR DELETE USING (is_admin());

-- donor_sources & gifts: readable with the donor; written by admins/imports
CREATE POLICY sources_read ON donor_sources FOR SELECT USING (can_access_donor(donor_id));
CREATE POLICY sources_admin ON donor_sources FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY gifts_read ON gifts FOR SELECT USING (can_access_donor(donor_id));
CREATE POLICY gifts_admin ON gifts FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- communications: you can only log/send as yourself
CREATE POLICY comms_read ON communications FOR SELECT USING (can_access_donor(donor_id));
CREATE POLICY comms_insert ON communications FOR INSERT
  WITH CHECK (can_access_donor(donor_id) AND (user_id = auth.uid() OR is_admin()));
CREATE POLICY comms_update ON communications FOR UPDATE
  USING (can_access_donor(donor_id))
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
-- 6. Retention view: per donor, per year
--    new / retained / increased / decreased / reactivated / lapsed
--    security_invoker = RLS still applies when querying it.
--    Note: for the current (unfinished) year, "lapsed" means "not yet this year".
------------------------------------------------------------
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