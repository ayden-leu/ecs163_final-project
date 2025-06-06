import ijson
import json
from decimal import Decimal

# Custom JSON encoder to handle Decimal objects
class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)

# Paths
input_path = "data/COUNTY_LINES.json"
output_path = "filtered_county_lines.geojson"

filtered_features = []

# Stream and filter the features
with open(input_path, 'rb') as f:
    features = ijson.items(f, 'features.item')
    for feature in features:
        if feature['properties'].get('STATE') == "06":  # Filter: California
            filtered_features.append(feature)

# Dump filtered data to GeoJSON using Decimal-safe encoder
with open(output_path, 'w', encoding='utf-8') as f_out:
    json.dump({
        "type": "FeatureCollection",
        "features": filtered_features
    }, f_out, cls=DecimalEncoder)
