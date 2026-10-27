import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import networkx as nx
from ai_logic.pedestrian_graph import PedestrianGraph

graph = PedestrianGraph(Path("data/processed/sector17_pedestrian_network.geojson"))
print("Graph nodes:", len(graph.graph.nodes()))
print("Graph edges:", len(graph.graph.edges()))

comps = list(nx.connected_components(graph.graph))
print("Connected components count:", len(comps))
comp_sizes = [len(c) for c in comps]
comp_sizes.sort(reverse=True)
print("Top 10 component sizes:", comp_sizes[:10])

# Test route between default start and destination
start_lat, start_lon = 30.7395, 76.7810
dest_lat, dest_lon = 30.7415, 76.7870

print("\nTesting default route:")
for pref in ["fastest", "shadiest", "balanced"]:
    try:
        r = graph.find_route(start_lat, start_lon, dest_lat, dest_lon, preference=pref)
        print(f"{pref}: found={r['route_found']}, dist={r['distance_m']}m, dur={r['duration_minutes']}m, coords={len(r['coordinates'])}")
        print(f"  First 3 coords: {r['coordinates'][:3]}")
        print(f"  Last 3 coords: {r['coordinates'][-3:]}")
    except Exception as e:
        print(f"{pref}: ERROR -> {e}")
