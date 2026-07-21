# Ancestry Tree Webapp

Static browser interface for viewing a private family-tree JSON file.

This repo intentionally contains only sample data. Real family information belongs in the private `ancestry-family-data` repo.

## Use

1. Open the published webapp.
2. Download `data/family.json` from the private data repo.
3. Click `Load` and choose that JSON file.

The app reads the file locally in your browser. It does not upload private data anywhere.

## Local Preview

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173>.
