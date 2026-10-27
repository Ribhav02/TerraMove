# TerraMove — Pilot Data Validation Report
**Pilot Area:** Sector 17, Chandigarh, India  
**Status:** Validated and Processed  

---

## 1. Sector Boundary (Shapefile)
- **Source:** `Chandigarh_Sectors-SHP/Chandigarh_Sectors.shp`
- **Total Sectors in Dataset:** 63
- **Matched Pilot Sector:** 17
- **Sector 17 Bounding Box (WGS84 [min_lon, min_lat, max_lon, max_lat]):** `(76.77429662808697, 30.7334212254093, 76.79097056244154, 30.746628781393213)`
- **Buffer Applied for Ingress/Egress Tolerance:** 0.001 degrees (~110 meters)
- **Output:** `data/processed/sector17_boundary.geojson`

---

## 2. Parking Dataset (`D-58 Parking Lots_0.csv`)
- **Total Raw Records:** 323
- **Accepted Citywide Records:** 318
- **Quarantined Records (Malformed/Missing Coordinates):** 2
- **Rejected Records (Outside Chandigarh BBox):** 3
- **Sector 17 Exact Spatial Containment:** 18
- **Sector 17 Buffer Spatial Containment:** 5
- **Total Usable Sector 17 Parking Locations:** 23
- **Live Availability Status:** Marked `unknown` (no live parking sensor stream exists in dataset)
- **Output:** `data/processed/parking_sector17_validated.json`

---

## 3. OpenStreetMap Geographic Features (`export.geojson`)
- **Total Features Inspected:** 1180
- **Sector 17 Walkable Edges (Pedestrian-accessible):** 378
- **Sector 17 Building Polygons (Shade estimation candidates):** 358
- **Excluded Features:** Motorways, private access routes, non-pedestrian infrastructure.
- **Outputs:**
  - `data/processed/sector17_pedestrian_network.geojson`
  - `data/processed/sector17_buildings.geojson`

---

## 4. Unstructured Documentation
- **`Native Trees Chandigarh.pdf`:** Contains botanical guide and canopy characteristics for Chandigarh native trees. Does not contain GPS coordinates. Kept as contextual reference; tree coordinates are not fabricated.
- **`CGWReport.pdf`:** Regional groundwater report. Does not substitute for real-time heat/weather metrics.

---

## 5. Proposed Supabase Import Scope
- `sector_boundaries`: 1 polygon feature (Sector 17)
- `parking_locations`: 23 validated parking spots
- `pedestrian_edges`: 378 walkable path segments
- `buildings`: 358 building footprints
- **Action Required:** Awaiting user approval before applying first live database import.
