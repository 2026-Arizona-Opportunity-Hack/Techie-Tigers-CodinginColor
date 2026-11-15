-- Run once in the Supabase SQL editor on a database created from an older database.sql.
-- (database.sql already includes this for fresh setups.)
--
-- Lets the fundraising team add donors by hand. They still can't pick the
-- owner: the trigger drops any owner they send and round-robin assigns one.

DROP POLICY IF EXISTS donors_admin_insert ON donors;
DROP POLICY IF EXISTS donors_staff_insert ON donors;
CREATE POLICY donors_staff_insert ON donors FOR INSERT WITH CHECK (is_staff());  -- admin + fundraising

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
