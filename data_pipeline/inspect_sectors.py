import shapefile
import json
from shapely.geometry import shape

sf = shapefile.Reader('data/raw/Chandigarh_Sectors-SHP/Chandigarh_Sectors.shp')
fields = [f[0] for f in sf.fields[1:]]
print("FIELDS:", fields)

records = sf.shapeRecords()
print(f"Total shapes: {len(records)}")

sec17_matches = []
for idx, r in enumerate(records):
    d = dict(zip(fields, r.record))
    # clean bytes to str
    clean_d = {k: (v.decode('utf-8', errors='replace') if isinstance(v, bytes) else v) for k, v in d.items()}
    val_strs = [str(v) for v in clean_d.values()]
    if any("17" in s for s in val_strs):
        geom = shape(r.shape.__geo_interface__)
        sec17_matches.append({
            "index": idx,
            "data": clean_d,
            "bounds": geom.bounds
        })

print("SECTOR 17 MATCHES:")
print(json.dumps(sec17_matches, indent=2))

# Also print first 10 records to see what the schema looks like
print("\nFIRST 10 RECORDS:")
for idx, r in enumerate(records[:10]):
    d = dict(zip(fields, r.record))
    clean_d = {k: (v.decode('utf-8', errors='replace') if isinstance(v, bytes) else v) for k, v in d.items()}
    print(idx, clean_d)

# Also let's inspect export.geojson bounds
with open('data/raw/export.geojson', 'r', encoding='utf-8') as f:
    gj = json.load(f)

print(f"\nGEOJSON FEATURES: {len(gj['features'])}")
all_lons = []
all_lats = []
for feat in gj['features']:
    geom = feat.get('geometry')
    if not geom:
        continue
    coords = geom.get('coordinates', [])
    def extract_pts(c):
        if not c:
            return
        if isinstance(c[0], (int, float)):
            all_lons.append(c[0])
            all_lats.append(c[1])
        else:
            for sub in c:
                extract_pts(sub)
    extract_pts(coords)

if all_lons and all_lats:
    print(f"GEOJSON BOUNDS: lon [{min(all_lons)}, {max(all_lons)}], lat [{min(all_lats)}, {max(all_lats)}]")

