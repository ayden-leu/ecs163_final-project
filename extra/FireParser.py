import ijson
import json
from decimal import Decimal

def convert_decimals(obj):
    """Recursively convert Decimal types to float."""
    if isinstance(obj, dict):
        return {k: convert_decimals(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [convert_decimals(v) for v in obj]
    elif isinstance(obj, Decimal):
        return float(obj)
    else:
        return obj

def filter_features(file_path):
    filtered = []

    with open(file_path, 'rb') as f:
        features = ijson.items(f, 'features.item')

        for feature in features:
            props = feature.get('properties', {})
            state = str(props.get('STATE', '')).strip().lower()
            year = props.get('YEAR_')
            acres = props.get('GIS_ACRES')

            if (
                state in ['ca', 'california'] and
                isinstance(year, int) and year >= 2000 and
                isinstance(acres, (int, float, Decimal)) and float(acres) > 1000
            ):
                # Convert all decimals in the feature to floats
                feature = convert_decimals(feature)
                filtered.append(feature)

    return {
        "type": "FeatureCollection",
        "features": filtered
    }

# Example usage
filtered_geojson = filter_features('data/BIG_FIRES.geojson')

# Save to new file
with open('data/FILTERED_BIG_FIRES.geojson', 'w') as out:
    json.dump(filtered_geojson, out)

print(f"✅ Saved {len(filtered_geojson['features'])} filtered features.")
