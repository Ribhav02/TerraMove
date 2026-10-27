-- =====================================================================
-- TerraMove Migration 003: Community & Safety (Phase 3)
-- Citizen Reporting, Moderation Lifecycle, and Verified Hazard Mapping
-- Pilot Area: Sector 17, Chandigarh, India
-- =====================================================================

-- 1. Safely enhance public.citizen_reports with rich reporting and moderation fields
ALTER TABLE public.citizen_reports
    ADD COLUMN IF NOT EXISTS title VARCHAR(150),
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'submitted',
    ADD COLUMN IF NOT EXISTS photo_url TEXT,
    ADD COLUMN IF NOT EXISTS is_gps_location BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS user_session_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS moderator_notes TEXT,
    ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. Status CHECK constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_citizen_reports_status'
    ) THEN
        ALTER TABLE public.citizen_reports
            ADD CONSTRAINT chk_citizen_reports_status
            CHECK (status IN ('submitted', 'under_review', 'verified', 'resolved', 'rejected'));
    END IF;
END $$;

-- 3. Update Category CHECK constraint to support all Phase 3 categories
-- Drop existing constraint (which only supported Phase 1 thermal/environmental categories)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.citizen_reports'::regclass
          AND contype = 'c'
          AND conname LIKE '%category%'
    ) LOOP
        EXECUTE 'ALTER TABLE public.citizen_reports DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

ALTER TABLE public.citizen_reports
    ADD CONSTRAINT chk_citizen_reports_category
    CHECK (
        category IN (
            'pothole',              -- Pothole or damaged walking surface
            'broken_footpath',      -- Broken or obstructed footpath
            'broken_sidewalk',      -- Equivalent alias for footpath
            'construction',         -- Construction blocking pedestrian corridor
            'streetlight',          -- Streetlight not working / dark sector area
            'garbage',              -- Garbage or waste obstruction
            'unsafe_crossing',      -- Unsafe pedestrian crossing / missing crosswalk
            'extreme_heat',         -- Unshaded thermal hot spot
            'missing_shade',        -- Tree canopy gap / shelter needed
            'water_station',        -- Water kiosk status or need
            'flooding',             -- Monsoon waterlogging
            'other'                 -- Other pedestrian mobility issue
        )
    );

-- 4. Automatic updated_at trigger
DROP TRIGGER IF EXISTS trg_citizen_reports_updated_at ON public.citizen_reports;
CREATE TRIGGER trg_citizen_reports_updated_at
    BEFORE UPDATE ON public.citizen_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_citizen_reports_status
    ON public.citizen_reports (status);

CREATE INDEX IF NOT EXISTS idx_citizen_reports_verified_active
    ON public.citizen_reports (status, created_at DESC)
    WHERE (status = 'verified');

CREATE INDEX IF NOT EXISTS idx_citizen_reports_user_session
    ON public.citizen_reports (user_session_id)
    WHERE (user_session_id IS NOT NULL);

-- 6. Row-Level Security (RLS) Configuration
-- Ensure RLS is active
ALTER TABLE public.citizen_reports ENABLE ROW LEVEL SECURITY;

-- Policy A: Public read access for community transparency (preserves existing policy)
DROP POLICY IF EXISTS "Allow public read access to citizen_reports" ON public.citizen_reports;
CREATE POLICY "Allow public read access to citizen_reports"
    ON public.citizen_reports
    FOR SELECT TO anon, authenticated
    USING (true);

-- Policy B: Public can submit new reports, but status MUST be 'submitted'
DROP POLICY IF EXISTS "Allow public insert to citizen_reports" ON public.citizen_reports;
CREATE POLICY "Allow public insert to citizen_reports"
    ON public.citizen_reports
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        category IS NOT NULL
        AND geom IS NOT NULL
        AND (status = 'submitted' OR status IS NULL)
        AND (description IS NULL OR char_length(description) <= 500)
    );

-- Policy C: Only administrative/moderator roles (service_role) can update status or moderate
DROP POLICY IF EXISTS "Allow moderator update to citizen_reports" ON public.citizen_reports;
CREATE POLICY "Allow moderator update to citizen_reports"
    ON public.citizen_reports
    FOR UPDATE TO authenticated, service_role
    USING (true)
    WITH CHECK (true);

-- 7. Grant schema privileges
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT ON public.citizen_reports TO anon, authenticated;
GRANT ALL ON public.citizen_reports TO service_role;

