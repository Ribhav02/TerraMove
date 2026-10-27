import csv
import re
from shapely.geometry import Point, shape
import shapefile

sf = shapefile.Reader('data/raw/Chandigarh_Sectors-SHP/Chandigarh_Sectors.shp')
fields = [f[0] for f in sf.fields[1:]]
sec17_geom = None
for r in sf.shapeRecords():
    d = dict(zip(fields, r.record))
    sec_name = str(d.get('Sector_nam', '')).strip()
    if sec_name == '17':
        sec17_geom = shape(r.shape.__geo_interface__)
        print("Found Sector 17 polygon! Bounds:", sec17_geom.bounds)
        break

sec17_buffer = sec17_geom.buffer(0.001)

# Check parking lots
with open('data/raw/D-58 Parking Lots_0.csv', 'r', encoding='utf-8-sig', errors='replace') as f:
    reader = csv.DictReader(f)
    print("CSV columns:", reader.fieldnames)
    
    inside_exact = []
    inside_buffer = []
    address_mention_17 = []

    for idx, row in enumerate(reader, start=2):
        raw_lat = row.get('latitude', '')
        raw_lon = row.get('longitude ', '')
        clean_lat_s = re.sub(r"[^\d.]", "", str(raw_lat))
        clean_lon_s = re.sub(r"[^\d.]", "", str(raw_lon))
        try:
            lat = float(clean_lat_s)
            lon = float(clean_lon_s)
        except ValueError:
            continue
        
        name = row.get('Name of parking', '')
        addr = row.get('parking address ', '')
        pt = Point(lon, lat)

        if "17" in name or "17" in addr:
            address_mention_17.append((idx, name, addr, lat, lon))

        if sec17_geom.contains(pt):
            inside_exact.append((idx, name, addr, lat, lon, row.get('No. of  4 wheeler parking '), row.get('No. of  2 wheeler parking ')))
        elif sec17_buffer.contains(pt):
            inside_buffer.append((idx, name, addr, lat, lon, row.get('No. of  4 wheeler parking '), row.get('No. of  2 wheeler parking ')))

print(f"\nAddress/Name mentions '17': {len(address_mention_17)}")
print(f"Inside Sector 17 exact polygon: {len(inside_exact)}")
print(f"Inside Sector 17 buffer: {len(inside_buffer)}")
print("\nSamples inside exact Sector 17:")
for p in inside_exact[:5]:
    print(p)

