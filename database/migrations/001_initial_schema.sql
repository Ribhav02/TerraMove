
-- =====================================================================
-- TerraMove: Supabase PostGIS Schema v1.2
-- Pilot Area: Sector 17, Chandigarh, India
-- Target: Supabase PostgreSQL + PostGIS
-- =====================================================================

BEGIN;

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Automatic updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


-- =====================================================================
-- TABLE 1: sector_boundaries
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sector_boundaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sector_name VARCHAR(100) NOT NULL,
    ward_name VARCHAR(100),
    zone_name VARCHAR(100),
    area_sqkm NUMERIC(10,4)
        CHECK (area_sqkm IS NULL OR area_sqkm >= 0),
    source_id VARCHAR(100),
    pilot_area BOOLEAN NOT NULL DEFAULT FALSE,
    geom geometry(Geometry, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_sector_boundaries_name UNIQUE (sector_name)
);

CREATE INDEX IF NOT EXISTS idx_sector_boundaries_geom
    ON public.sector_boundaries USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_sector_boundaries_pilot
    ON public.sector_boundaries (pilot_area);

DROP TRIGGER IF EXISTS trg_sector_boundaries_updated_at
    ON public.sector_boundaries;

CREATE TRIGGER trg_sector_boundaries_updated_at
    BEFORE UPDATE ON public.sector_boundaries
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sector_boundaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to sector_boundaries"
    ON public.sector_boundaries;

CREATE POLICY "Allow public read access to sector_boundaries"
    ON public.sector_boundaries
    FOR SELECT TO anon, authenticated
    USING (true);


-- =====================================================================
-- TABLE 2: parking_locations
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.parking_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_row INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    capacity_four_wheeler INT NOT NULL DEFAULT 0
        CHECK (capacity_four_wheeler >= 0),
    capacity_two_wheeler INT NOT NULL DEFAULT 0
        CHECK (capacity_two_wheeler >= 0),
    total_capacity INT NOT NULL DEFAULT 0
        CHECK (total_capacity >= 0),
    availability_status VARCHAR(50) NOT NULL DEFAULT 'unknown'
        CHECK (
            availability_status IN (
                'unknown', 'available', 'full', 'closed'
            )
        ),
    is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
    in_sector17_exact BOOLEAN NOT NULL DEFAULT TRUE,
    in_sector17_buffered BOOLEAN NOT NULL DEFAULT FALSE,
    geom geometry(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_parking_locations_source_row UNIQUE (source_row)
);

CREATE INDEX IF NOT EXISTS idx_parking_locations_geom
    ON public.parking_locations USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_parking_locations_status
    ON public.parking_locations (availability_status);

DROP TRIGGER IF EXISTS trg_parking_locations_updated_at
    ON public.parking_locations;

CREATE TRIGGER trg_parking_locations_updated_at
    BEFORE UPDATE ON public.parking_locations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.parking_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to parking_locations"
    ON public.parking_locations;

CREATE POLICY "Allow public read access to parking_locations"
    ON public.parking_locations
    FOR SELECT TO anon, authenticated
    USING (true);


-- =====================================================================
-- TABLE 3: pedestrian_edges
-- Multiple segments may share the same OSM way ID.
-- Therefore, osm_id is indexed but NOT unique.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pedestrian_edges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    osm_id VARCHAR(100) NOT NULL,
    highway_type VARCHAR(100) NOT NULL,
    street_name VARCHAR(255),
    surface VARCHAR(100),
    foot_access VARCHAR(50) DEFAULT 'yes',
    length_meters NUMERIC(10,2) NOT NULL
        CHECK (length_meters >= 0),
    walk_time_seconds NUMERIC(10,2) NOT NULL
        CHECK (walk_time_seconds >= 0),
    shade_score INT NOT NULL DEFAULT 30
        CHECK (shade_score BETWEEN 0 AND 100),
    geom geometry(LineString, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Remove the previous unique constraint if this schema
-- is being applied to a database created with the old version.
ALTER TABLE public.pedestrian_edges
    DROP CONSTRAINT IF EXISTS uq_pedestrian_edges_osm_id;

CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_geom
    ON public.pedestrian_edges USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_highway
    ON public.pedestrian_edges (highway_type);

CREATE INDEX IF NOT EXISTS idx_pedestrian_edges_osm_id
    ON public.pedestrian_edges (osm_id);

ALTER TABLE public.pedestrian_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to pedestrian_edges"
    ON public.pedestrian_edges;

CREATE POLICY "Allow public read access to pedestrian_edges"
    ON public.pedestrian_edges
    FOR SELECT TO anon, authenticated
    USING (true);


-- =====================================================================
-- TABLE 4: buildings
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    osm_id VARCHAR(100) NOT NULL,
    building_type VARCHAR(100) DEFAULT 'yes',
    building_name VARCHAR(255),
    height_meters NUMERIC(6,2) NOT NULL DEFAULT 10.0
        CHECK (height_meters >= 0),
    levels INT NOT NULL DEFAULT 3
        CHECK (levels >= 0),
    height_quality VARCHAR(50) NOT NULL DEFAULT 'default_baseline',
    geom geometry(Geometry, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_buildings_osm_id UNIQUE (osm_id)
);

CREATE INDEX IF NOT EXISTS idx_buildings_geom
    ON public.buildings USING GIST (geom);

ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to buildings"
    ON public.buildings;

CREATE POLICY "Allow public read access to buildings"
    ON public.buildings
    FOR SELECT TO anon, authenticated
    USING (true);


-- =====================================================================
-- TABLE 5: citizen_reports
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.citizen_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    category VARCHAR(100) NOT NULL
        CHECK (
            category IN (
                'extreme_heat',
                'broken_sidewalk',
                'missing_shade',
                'water_station',
                'flooding',
                'other'
            )
        ),

    description TEXT
        CHECK (
            description IS NULL
            OR char_length(description) <= 500
        ),

    severity VARCHAR(50) NOT NULL DEFAULT 'moderate'
        CHECK (
            severity IN ('low', 'moderate', 'high', 'severe')
        ),

    reported_temp_c NUMERIC(4,1)
        CHECK (
            reported_temp_c IS NULL
            OR reported_temp_c BETWEEN -10.0 AND 65.0
        ),

    geom geometry(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_citizen_reports_bounds CHECK (
        ST_X(geom) BETWEEN 76.60 AND 76.95
        AND ST_Y(geom) BETWEEN 30.60 AND 30.85
    )
);

CREATE INDEX IF NOT EXISTS idx_citizen_reports_geom
    ON public.citizen_reports USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_citizen_reports_category
    ON public.citizen_reports (category);

CREATE INDEX IF NOT EXISTS idx_citizen_reports_created
    ON public.citizen_reports (created_at DESC);

ALTER TABLE public.citizen_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access to citizen_reports"
    ON public.citizen_reports;

CREATE POLICY "Allow public read access to citizen_reports"
    ON public.citizen_reports
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow public insert to citizen_reports"
    ON public.citizen_reports;

CREATE POLICY "Allow public insert to citizen_reports"
    ON public.citizen_reports
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        category IS NOT NULL
        AND geom IS NOT NULL
        AND (
            description IS NULL
            OR char_length(description) <= 500
        )
    );


-- =====================================================================
-- 6. Table privileges
-- RLS policies and SQL privileges are both required.
-- No public UPDATE or DELETE privileges are granted.
-- =====================================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON
    public.sector_boundaries,
    public.parking_locations,
    public.pedestrian_edges,
    public.buildings,
    public.citizen_reports
TO anon, authenticated;

GRANT INSERT ON public.citizen_reports TO anon, authenticated;

COMMIT;


-- =====================================================================
-- 7. Verify that all five tables exist
-- Run this query after the schema completes successfully.
-- =====================================================================

SELECT
    table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
      'sector_boundaries',
      'parking_locations',
      'pedestrian_edges',
      'buildings',
      'citizen_reports'
  )
ORDER BY table_name;
