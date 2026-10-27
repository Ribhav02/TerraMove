import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from shapely.geometry import Polygon, LineString
from shapely import affinity
from shapely.ops import unary_union
import math

# Test building at (76.7820, 30.7410)
bldg = Polygon([
    (76.7820, 30.7410),
    (76.7825, 30.7410),
    (76.7825, 30.7415),
    (76.7820, 30.7415),
    (76.7820, 30.7410)
])

# At 14:00 (afternoon): sun is in SW, azimuth ~ 220 deg, shadow points NE (bearing ~ 40 deg)
# shadow_dist_m = 25m -> in degrees ~ 25 / 111000 = 0.000225 deg
dx = 0.000225 * math.sin(math.radians(40))
dy = 0.000225 * math.cos(math.radians(40))

translated_bldg = affinity.translate(bldg, xoff=dx, yoff=dy)
shadow_hull = unary_union([bldg, translated_bldg]).convex_hull

# Test an edge running along the NE of the building
shaded_edge = LineString([(76.7821, 30.7416), (76.7826, 30.7416)])
unshaded_edge = LineString([(76.7821, 30.7405), (76.7826, 30.7405)])

print("Shaded edge intersects shadow:", shaded_edge.intersects(shadow_hull))
print("Unshaded edge intersects shadow:", unshaded_edge.intersects(shadow_hull))
if shaded_edge.intersects(shadow_hull):
    inter = shaded_edge.intersection(shadow_hull)
    print("Shaded fraction:", inter.length / shaded_edge.length)

