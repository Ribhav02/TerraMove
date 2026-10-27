import asyncio
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.app.services.routing_service import RoutingService

async def run_compare():
    service = RoutingService()
    res = await service.compare_routes(
        start_lat=30.7395,
        start_lon=76.7810,
        dest_lat=30.7415,
        dest_lon=76.7870,
        departure_hour=14.0
    )
    print("Routes returned:", len(res["routes"]))
    for r in res["routes"]:
        print(f"Preference: {r['preference']}, dist: {r['distance_m']}m, dur: {r['duration_minutes']}m, shade: {r['shade_score']}, heat: {r['heat_score']}")
        print(f"  Coordinates count: {len(r['coordinates'])}")
        print(f"  First 3 coords: {r['coordinates'][:3]}")
    print("Note:", res.get("note"))

asyncio.run(run_compare())
