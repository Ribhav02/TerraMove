import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ai_logic.shade_estimator import ShadeEstimator
from ai_logic.pedestrian_graph import PedestrianGraph

shade_estimator = ShadeEstimator(Path("data/processed/sector17_buildings.geojson"))
graph = PedestrianGraph(Path("data/processed/sector17_pedestrian_network.geojson"), shade_estimator)

shade_scores = [d["shade_score"] for u, v, d in graph.graph.edges(data=True)]
print("Total edges:", len(shade_scores))
print("Min shade:", min(shade_scores))
print("Max shade:", max(shade_scores))
print("Avg shade:", sum(shade_scores) / len(shade_scores))
from collections import Counter
counts = Counter(shade_scores)
print("Shade score distribution (top 10):", counts.most_common(10))

