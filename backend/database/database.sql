-- 002_security_and_fixes.sql
-- Run AFTER database.sql in the Supabase SQL editor.
-- Adds: auth link, dedupe keys, idempotent imports, round-robin owners,
-- row-level security (board members only see their own donors),
-- API keys, a "human sends" guarantee, and the retention view.

------------------------------------------------------------
-- 1. Link app users to Supabase Auth
------------------------------------------------------------
ALTER TABLE users
  ADD CONSTRAINT users_auth_fk
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

------------------------------------------------------------
-- 2. Donors: funder orgs + normalized dedupe keys
------------------------------------------------------------
ALTER TABLE donors
  ADD COLUMN organization_name TEXT,   -- "Microsoft TechSpark", "APS Foundation"
  ADD COLUMN email_normalized TEXT
    GENERATED ALWAYS AS (lower(trim(email))) STORED,
  ADD COLUMN phone_normalized TEXT
    GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED;

-- One donor per email (blank emails allowed to repeat)
CREATE UNIQUE INDEX donors_email_unique
  ON donors (email_normalized)
  WHERE email_normalized IS NOT NULL AND email_normalized <> '';

CREATE INDEX donors_phone_idx ON donors (phone_normalized);
CREATE INDEX donors_owner_idx ON donors (owner_id);

------------------------------------------------------------
-- 3. Child rows must belong to a donor
------------------------------------------------------------
ALTER TABLE donor_sources  ALTER COLUMN donor_id SET NOT NULL;
ALTER TABLE gifts          ALTER COLUMN donor_id SET NOT NULL;
ALTER TABLE communications ALTER COLUMN donor_id SET NOT NULL;
ALTER TABLE next_steps     ALTER COLUMN donor_id SET NOT NULL;

------------------------------------------------------------
-- 4. Idempotent imports: re-uploading the same Zeffy/Benevity
--    export must not create duplicate donors or gifts
------------------------------------------------------------
ALTER TABLE donor_sources
  ADD COLUMN external_id TEXT,          -- row/transaction id from the export
  ADD COLUMN raw JSONB,                 -- original row, for tracing merges
  ADD COLUMN imported_at TIMESTAMPTZ DEFAULT now();

CREATE UNIQUE INDEX donor_sources_ext_unique
  ON donor_sources (source, external_id)
  WHERE external_id IS NOT NULL;

ALTER TABLE gifts
  ADD COLUMN external_id TEXT,
  ADD CONSTRAINT gifts_amount_positive CHECK (amount > 0);

CREATE UNIQUE INDEX gifts_ext_unique
  ON gifts (source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX gifts_donor_date_idx ON gifts (donor_id, gift_date);

------------------------------------------------------------
-- 5. Next steps: who owns it, when it was done
------------------------------------------------------------
ALTER TABLE next_steps
  ADD COLUMN assigned_to UUID REFERENCES users(id),
  ADD COLUMN created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN completed_at TIMESTAMPTZ;

CREATE INDEX next_steps_due_idx ON next_steps (assigned_to, done, due_date);

------------------------------------------------------------
-- 6. "System drafts, human sends": a message can't be marked
--    sent without a real person and a timestamp
------------------------------------------------------------
ALTER TABLE communications
  ADD CONSTRAINT comms_sent_by_human
  CHECK (status <> 'sent' OR (user_id IS NOT NULL AND sent_at IS NOT NULL));

CREATE INDEX comms_donor_idx ON communications (donor_id, created_at);

------------------------------------------------------------
-- 7. API keys for CIC's dashboard (store only the hash)
------------------------------------------------------------
CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                   -- "CIC org dashboard"
  key_hash TEXT UNIQUE NOT NULL,        -- sha256 of the key; never the key itself
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

------------------------------------------------------------
-- 8. Helper functions for RLS
------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION can_access_donor(did INT) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_admin()
      OR EXISTS (SELECT 1 FROM donors WHERE id = did AND owner_id = auth.uid());
$$;

------------------------------------------------------------
-- 9. Round-robin owner: new donor goes to the board member
--    with the fewest donors. The lock stops two simultaneous
--    imports from both picking the same "fewest" person.
------------------------------------------------------------
CREATE OR REPLACE FUNCTION assign_owner_round_robin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN
    PERFORM pg_advisory_xact_lock(4242);
    SELECT u.id INTO NEW.owner_id
    FROM users u
    LEFT JOIN donors d ON d.owner_id = u.id
    WHERE u.role = 'board_member'
    GROUP BY u.id
    ORDER BY count(d.id), random()
    LIMIT 1;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER donors_round_robin
  BEFORE INSERT ON donors
  FOR EACH ROW EXECUTE FUNCTION assign_owner_round_robin();

-- Board members can edit their donors but can't reassign them
CREATE OR REPLACE FUNCTION protect_donor_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     AND auth.uid() IS NOT NULL      -- service role (imports) is allowed
     AND NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can reassign donors';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER donors_protect_owner
  BEFORE UPDATE ON donors
  FOR EACH ROW EXECUTE FUNCTION protect_donor_owner();

------------------------------------------------------------
-- 10. Row-level security
--     Admin: everything. Board member: only their donors.
--     Imports and AI drafting run server-side with the
--     service role key, which bypasses RLS.
------------------------------------------------------------
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE donors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE donor_sources  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gifts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE next_steps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE outcomes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys       ENABLE ROW LEVEL SECURITY;

-- users
CREATE POLICY users_read ON users FOR SELECT
  USING (id = auth.uid() OR is_admin());
CREATE POLICY users_admin_write ON users FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- programs & outcomes: everyone signed in can read, admins write
CREATE POLICY programs_read ON programs FOR SELECT TO authenticated USING (true);
CREATE POLICY programs_admin ON programs FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY outcomes_read ON outcomes FOR SELECT TO authenticated USING (true);
CREATE POLICY outcomes_admin ON outcomes FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- donors
CREATE POLICY donors_read ON donors FOR SELECT
  USING (owner_id = auth.uid() OR is_admin());
CREATE POLICY donors_update ON donors FOR UPDATE
  USING (owner_id = auth.uid() OR is_admin())
  WITH CHECK (owner_id = auth.uid() OR is_admin());
CREATE POLICY donors_admin_insert ON donors FOR INSERT WITH CHECK (is_admin());
CREATE POLICY donors_admin_delete ON donors FOR DELETE USING (is_admin());

-- donor_sources & gifts: readable by the donor's owner, written by admins/imports
CREATE POLICY sources_read ON donor_sources FOR SELECT USING (can_access_donor(donor_id));
CREATE POLICY sources_admin ON donor_sources FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY gifts_read ON gifts FOR SELECT USING (can_access_donor(donor_id));
CREATE POLICY gifts_admin ON gifts FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

-- communications: owner can draft, edit, and log sends as themselves
CREATE POLICY comms_read ON communications FOR SELECT USING (can_access_donor(donor_id));
CREATE POLICY comms_insert ON communications FOR INSERT
  WITH CHECK (can_access_donor(donor_id) AND (user_id = auth.uid() OR is_admin()));
CREATE POLICY comms_update ON communications FOR UPDATE
  USING (can_access_donor(donor_id))
  WITH CHECK (can_access_donor(donor_id) AND (user_id = auth.uid() OR is_admin()));

-- next_steps: owner manages their donors' next steps
CREATE POLICY steps_all ON next_steps FOR ALL
  USING (can_access_donor(donor_id)) WITH CHECK (can_access_donor(donor_id));

-- api_keys: admins only (the API route validates keys with the service role)
CREATE POLICY api_keys_admin ON api_keys FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

------------------------------------------------------------
-- 11. Retention view: per donor, per year
--     new / retained / increased / decreased / reactivated / lapsed
--     security_invoker = RLS still applies when querying it
------------------------------------------------------------
CREATE OR REPLACE VIEW donor_retention WITH (security_invoker = true) AS
WITH yearly AS (
  SELECT donor_id, extract(year FROM gift_date)::int AS yr, sum(amount) AS total
  FROM gifts
  GROUP BY 1, 2
),
years  AS (SELECT DISTINCT yr FROM yearly),
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