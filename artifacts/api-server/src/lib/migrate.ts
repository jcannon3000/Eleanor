import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        sid VARCHAR NOT NULL COLLATE "default",
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL,
        CONSTRAINT user_sessions_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
      );
      CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON user_sessions (expire);

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        avatar_url TEXT,
        google_id TEXT UNIQUE,
        google_access_token TEXT,
        google_refresh_token TEXT,
        google_token_expiry TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS rituals (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        frequency TEXT NOT NULL,
        day_preference TEXT,
        participants JSONB NOT NULL DEFAULT '[]',
        intention TEXT,
        owner_id INTEGER NOT NULL REFERENCES users(id),
        location TEXT,
        proposed_times JSONB NOT NULL DEFAULT '[]',
        confirmed_time TEXT,
        schedule_token TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS meetups (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER NOT NULL REFERENCES rituals(id),
        scheduled_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned',
        notes TEXT,
        google_calendar_event_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ritual_messages (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER NOT NULL REFERENCES rituals(id),
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS schedule_responses (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER NOT NULL REFERENCES rituals(id),
        guest_name TEXT NOT NULL,
        guest_email TEXT,
        chosen_time TEXT,
        unavailable INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS scheduling_responses (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER NOT NULL REFERENCES rituals(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        choice TEXT NOT NULL,
        chosen_time TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS invite_tokens (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER NOT NULL REFERENCES rituals(id),
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        responded_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS shared_moments (
        id SERIAL PRIMARY KEY,
        ritual_id INTEGER REFERENCES rituals(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        intention TEXT NOT NULL DEFAULT '',
        logging_type TEXT NOT NULL DEFAULT 'photo',
        reflection_prompt TEXT,
        template_type TEXT,
        intercession_topic TEXT,
        intercession_source TEXT,
        intercession_full_text TEXT,
        timer_duration_minutes INTEGER NOT NULL DEFAULT 10,
        frequency TEXT NOT NULL DEFAULT 'weekly',
        scheduled_time TEXT NOT NULL DEFAULT '08:00',
        window_minutes INTEGER NOT NULL DEFAULT 60,
        goal_days INTEGER NOT NULL DEFAULT 30,
        day_of_week TEXT,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        time_of_day TEXT,
        moment_token TEXT NOT NULL UNIQUE,
        current_streak INTEGER NOT NULL DEFAULT 0,
        longest_streak INTEGER NOT NULL DEFAULT 0,
        total_blooms INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'active',
        frequency_type TEXT,
        frequency_days_per_week INTEGER,
        practice_days TEXT,
        contemplative_duration_minutes INTEGER,
        fasting_from TEXT,
        fasting_intention TEXT,
        fasting_frequency TEXT,
        fasting_date TEXT,
        fasting_day TEXT,
        fasting_day_of_month INTEGER,
        commitment_duration INTEGER,
        commitment_end_date TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Add missing columns to shared_moments if they exist in schema but not table
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS template_type TEXT;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS intercession_topic TEXT;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS intercession_source TEXT;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS intercession_full_text TEXT;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS timer_duration_minutes INTEGER NOT NULL DEFAULT 10;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS day_of_week TEXT;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS time_of_day TEXT;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS frequency_type TEXT;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS frequency_days_per_week INTEGER;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS practice_days TEXT;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS contemplative_duration_minutes INTEGER;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS fasting_from TEXT;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS fasting_intention TEXT;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS fasting_frequency TEXT;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS fasting_date TEXT;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS fasting_day TEXT;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS fasting_day_of_month INTEGER;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS commitment_duration INTEGER;
      ALTER TABLE shared_moments ADD COLUMN IF NOT EXISTS commitment_end_date TEXT;

      CREATE TABLE IF NOT EXISTS moment_renewals (
        id SERIAL PRIMARY KEY,
        moment_id INTEGER NOT NULL REFERENCES shared_moments(id) ON DELETE CASCADE,
        previous_intention TEXT,
        new_intention TEXT,
        previous_intercession_topic TEXT,
        new_intercession_topic TEXT,
        renewal_count INTEGER NOT NULL DEFAULT 1,
        renewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS moment_streak_days (
        id SERIAL PRIMARY KEY,
        shared_moment_id INTEGER NOT NULL REFERENCES shared_moments(id) ON DELETE CASCADE,
        practice_date DATE NOT NULL,
        members_logged INTEGER NOT NULL DEFAULT 0,
        bloomed BOOLEAN NOT NULL DEFAULT false,
        evaluated_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS moment_user_tokens (
        id SERIAL PRIMARY KEY,
        moment_id INTEGER NOT NULL REFERENCES shared_moments(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        name TEXT,
        user_token TEXT NOT NULL UNIQUE,
        google_calendar_event_id TEXT,
        personal_time TEXT,
        personal_timezone TEXT,
        calendar_connected BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- Add missing columns to moment_user_tokens if table already existed
      ALTER TABLE moment_user_tokens ADD COLUMN IF NOT EXISTS personal_time TEXT;
      ALTER TABLE moment_user_tokens ADD COLUMN IF NOT EXISTS personal_timezone TEXT;
      ALTER TABLE moment_user_tokens ADD COLUMN IF NOT EXISTS calendar_connected BOOLEAN NOT NULL DEFAULT false;

      CREATE TABLE IF NOT EXISTS moment_calendar_events (
        id SERIAL PRIMARY KEY,
        shared_moment_id INTEGER NOT NULL REFERENCES shared_moments(id) ON DELETE CASCADE,
        moment_member_id INTEGER NOT NULL,
        google_calendar_event_id TEXT,
        ics_sent BOOLEAN NOT NULL DEFAULT false,
        scheduled_for TIMESTAMPTZ NOT NULL,
        is_first_event BOOLEAN NOT NULL DEFAULT false,
        logged BOOLEAN NOT NULL DEFAULT false,
        logged_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS moment_posts (
        id SERIAL PRIMARY KEY,
        moment_id INTEGER NOT NULL REFERENCES shared_moments(id),
        window_date TEXT NOT NULL,
        user_token TEXT NOT NULL,
        guest_name TEXT,
        photo_url TEXT,
        reflection_text TEXT,
        is_checkin INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS moment_windows (
        id SERIAL PRIMARY KEY,
        moment_id INTEGER NOT NULL REFERENCES shared_moments(id),
        window_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'wither',
        post_count INTEGER NOT NULL DEFAULT 0,
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    logger.info("Database migration completed successfully");
  } catch (err) {
    logger.error({ err }, "Database migration failed");
    throw err;
  } finally {
    client.release();
  }
}
