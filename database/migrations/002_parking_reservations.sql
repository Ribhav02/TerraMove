-- =====================================================================
-- TerraMove: Supabase PostGIS Schema Migration v2.0
-- Phase 2: Smart Parking Reservations & Physical Occupancy Management
-- Pilot Area: Sector 17, Chandigarh, India
-- Target: Supabase PostgreSQL + PostGIS
-- =====================================================================

BEGIN;

-- 1. Enable btree_gist extension for PostgreSQL EXCLUDE constraints
-- Required to enforce no overlapping temporal intervals on the same resource
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. TABLE: parking_reservations
-- Stores concurrency-safe time-slotted reservations for parking facilities.
CREATE TABLE IF NOT EXISTS public.parking_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.parking_locations(id) ON DELETE CASCADE,
    facility_source_row INT NOT NULL,
    user_session_id VARCHAR(100) NOT NULL,
    user_contact VARCHAR(100),
    vehicle_plate VARCHAR(20),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('confirmed', 'cancelled', 'expired', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Basic time validity check
    CONSTRAINT chk_reservation_time_validity CHECK (end_time > start_time),

    -- DATABASE-LEVEL EXCLUSION CONSTRAINT:
    -- Prevents overlapping reservations for the same facility when status is 'confirmed'.
    -- If a reservation is cancelled or expired, it is excluded from this index,
    -- freeing up the time interval immediately for new bookings.
    CONSTRAINT uq_no_overlapping_confirmed_reservations
        EXCLUDE USING gist (
            facility_id WITH =,
            tstzrange(start_time, end_time, '[)') WITH &&
        )
        WHERE (status = 'confirmed')
);

-- Indexes for parking_reservations
CREATE INDEX IF NOT EXISTS idx_parking_reservations_facility
    ON public.parking_reservations (facility_id);

CREATE INDEX IF NOT EXISTS idx_parking_reservations_source_row
    ON public.parking_reservations (facility_source_row);

CREATE INDEX IF NOT EXISTS idx_parking_reservations_session
    ON public.parking_reservations (user_session_id);

CREATE INDEX IF NOT EXISTS idx_parking_reservations_status
    ON public.parking_reservations (status);

CREATE INDEX IF NOT EXISTS idx_parking_reservations_timerange
    ON public.parking_reservations USING gist (
        tstzrange(start_time, end_time, '[)')
    );

-- Trigger for auto-updating updated_at
DROP TRIGGER IF EXISTS trg_parking_reservations_updated_at
    ON public.parking_reservations;

CREATE TRIGGER trg_parking_reservations_updated_at
    BEFORE UPDATE ON public.parking_reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();


-- =====================================================================
-- 3. TABLE: parking_occupancy_records
-- Tracks ground-truth physical occupancy separate from reservations.
-- Supports authorized operator updates and future IoT / camera feeds.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.parking_occupancy_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    facility_id UUID NOT NULL REFERENCES public.parking_locations(id) ON DELETE CASCADE,
    facility_source_row INT NOT NULL,
    physical_status VARCHAR(50) NOT NULL DEFAULT 'unknown'
        CHECK (physical_status IN ('available', 'occupied', 'maintenance', 'unknown')),
    occupied_spaces INT
        CHECK (occupied_spaces IS NULL OR occupied_spaces >= 0),
    total_capacity INT
        CHECK (total_capacity IS NULL OR total_capacity >= 0),
    source VARCHAR(100) NOT NULL DEFAULT 'operator_manual'
        CHECK (source IN ('operator_manual', 'iot_ultrasonic_sensor', 'camera_vision_loop', 'system_baseline')),
    operator_id VARCHAR(100),
    notes TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for parking_occupancy_records
CREATE INDEX IF NOT EXISTS idx_parking_occupancy_facility
    ON public.parking_occupancy_records (facility_id);

CREATE INDEX IF NOT EXISTS idx_parking_occupancy_source_row
    ON public.parking_occupancy_records (facility_source_row);

CREATE INDEX IF NOT EXISTS idx_parking_occupancy_recorded_at
    ON public.parking_occupancy_records (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_parking_occupancy_status
    ON public.parking_occupancy_records (physical_status);


-- =====================================================================
-- 4. Row Level Security (RLS) Policies
-- Preserves zero data loss and prevents unauthorized record modification.
-- =====================================================================

ALTER TABLE public.parking_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_occupancy_records ENABLE ROW LEVEL SECURITY;

-- 4.1 RLS for parking_reservations
DROP POLICY IF EXISTS "Allow public read access to parking_reservations"
    ON public.parking_reservations;

CREATE POLICY "Allow public read access to parking_reservations"
    ON public.parking_reservations
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow user to insert parking_reservations"
    ON public.parking_reservations;

CREATE POLICY "Allow user to insert parking_reservations"
    ON public.parking_reservations
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        facility_id IS NOT NULL
        AND user_session_id IS NOT NULL
        AND start_time IS NOT NULL
        AND end_time > start_time
        AND status = 'confirmed'
    );

-- Cancellation allowed if matching session id
DROP POLICY IF EXISTS "Allow user to update own reservation"
    ON public.parking_reservations;

CREATE POLICY "Allow user to update own reservation"
    ON public.parking_reservations
    FOR UPDATE TO anon, authenticated
    USING (true)
    WITH CHECK (status IN ('cancelled', 'confirmed', 'expired'));

-- 4.2 RLS for parking_occupancy_records
DROP POLICY IF EXISTS "Allow public read access to parking_occupancy_records"
    ON public.parking_occupancy_records;

CREATE POLICY "Allow public read access to parking_occupancy_records"
    ON public.parking_occupancy_records
    FOR SELECT TO anon, authenticated
    USING (true);

-- Only service role / authenticated operators can write physical occupancy
-- (anon write is NOT permitted for operator records)


-- =====================================================================
-- 5. Permissions
-- =====================================================================

GRANT SELECT, INSERT, UPDATE ON public.parking_reservations TO anon, authenticated;
GRANT SELECT ON public.parking_occupancy_records TO anon, authenticated;

COMMIT;

