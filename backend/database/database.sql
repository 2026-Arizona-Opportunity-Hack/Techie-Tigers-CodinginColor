CREATE TABLE users (
  id UUID PRIMARY KEY,                -- matches the Supabase Auth user id
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','board_member'))
);

CREATE TABLE programs (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL                  -- AI Academy, Summer Camp...
);

CREATE TABLE donors (
  id SERIAL PRIMARY KEY,
  first_name TEXT, last_name TEXT,
  email TEXT, phone TEXT,
  donor_type TEXT DEFAULT 'individual', -- individual / funder
  owner_id UUID REFERENCES users(id),
  last_thanked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE donor_sources (            -- tracks merged records
  id SERIAL PRIMARY KEY,
  donor_id INT REFERENCES donors(id),
  source TEXT NOT NULL,               -- spreadsheet / zeffy / benevity
  external_name TEXT, external_email TEXT
);

CREATE TABLE gifts (
  id SERIAL PRIMARY KEY,
  donor_id INT REFERENCES donors(id),
  amount NUMERIC(10,2) NOT NULL,
  gift_date DATE NOT NULL,
  source TEXT NOT NULL,
  campaign TEXT,
  program_id INT REFERENCES programs(id)
);

CREATE TABLE communications (
  id SERIAL PRIMARY KEY,
  donor_id INT REFERENCES donors(id),
  user_id UUID REFERENCES users(id),
  channel TEXT CHECK (channel IN ('email','text','call','in_person')),
  kind TEXT,                          -- thank_you / quarterly / follow_up
  subject TEXT, body TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','skipped')),
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE next_steps (
  id SERIAL PRIMARY KEY,
  donor_id INT REFERENCES donors(id),
  description TEXT NOT NULL,
  due_date DATE NOT NULL,
  done BOOLEAN DEFAULT false
);

CREATE TABLE outcomes (                 -- for the funder packet
  id SERIAL PRIMARY KEY,
  program_id INT REFERENCES programs(id),
  period TEXT,                        -- '2026'
  description TEXT                    -- '45 students, 3 schools'
);