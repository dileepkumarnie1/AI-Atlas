# ML moderation & recommendation

This folder contains a lightweight ML layer to help:
- Predict whether a discovered tool will be approved or rejected
- Recommend similar already-approved tools to aid review and ranking

It starts with a simple offline approach using TF‑IDF + Logistic Regression.
No external APIs are required.

## Files
- `requirements.txt` – Python dependencies for the ML scripts
- `train_moderation_model.py` – trains a binary classifier from labeled submissions
- `score_candidates.py` – scores pending tools and suggests similar approved items

## Data inputs
- Labeled moderation data: `data/submissions_labeled.json`
  - Array of objects with at least: `name`, `description`, `tags` (array or string), `status` (`approved`|`rejected`)
- Pending candidates to score: `data/pending-tools.json`
- Approved catalog (ground truth): `public/tools.json`

## Outputs
- Trained model: `ml/model_v1.joblib`
- Scored candidates: `data/pending-tools.scored.json`

## Usage
1) Install deps (first time):
   - Create/activate your Python env, then install: `pip install -r ml/requirements.txt`
2) Train the model (requires `data/submissions_labeled.json`):
   - `npm run ml:train` (or `python ml/train_moderation_model.py`)
3) Score candidates (reads `data/pending-tools.json` and `public/tools.json`):
   - `npm run ml:score` (or `python ml/score_candidates.py`)

Integrate the scored fields (`mlScore`, `mlDecision`, `mlVersion`, `mlSimilar`) into your discovery/admin flows as desired.
