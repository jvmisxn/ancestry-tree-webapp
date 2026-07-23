# JMO Ancestry

Static browser interface for viewing a private family-tree JSON file.

This repo intentionally contains only sample data. Real family information belongs in the private `ancestry-family-data` repo.

## Use

1. Open the published webapp.
2. Download `data/family.json` from the private data repo.
3. Click `Load` and choose that JSON file.

The app reads the file locally in your browser. It does not upload private data anywhere.

## Rich Profiles

Person records can stay compact while still reading more like a life article:

```json
{
  "profile": {
    "summary": "Short newspaper-style life story assembled from confirmed findings.",
    "photos": [
      {
        "url": "https://example.com/photo.jpg",
        "caption": "Portrait from Ancestry",
        "credit": "Ancestry user upload"
      }
    ],
    "obituaries": [
      {
        "title": "Official obituary",
        "publication": "Funeral home or newspaper",
        "date": "2011",
        "url": "https://example.com/obituary"
      }
    ]
  }
}
```

If `profile.summary` is missing, the app generates a short readable story from facts and relationships. Sources, photos, and obituaries should link out instead of embedding large documents or images in the JSON.

## Local Preview

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173>.
