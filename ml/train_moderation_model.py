import json
import joblib
import pandas as pd
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

DATA_PATH = Path('data/submissions_labeled.json')
MODEL_PATH = Path('ml/model_v1.joblib')


def to_text(name, description, tags):
    name = name or ''
    description = description or ''
    if isinstance(tags, list):
        tags = ' '.join([str(t) for t in tags])
    else:
        tags = str(tags or '')
    return f"{name} {description} {tags}".strip()


def main():
    if not DATA_PATH.exists():
        raise SystemExit(f"Missing labeled data at {DATA_PATH}. Provide JSON with fields: name, description, tags, status")

    df = pd.read_json(DATA_PATH)
    df = df[df['status'].isin(['approved', 'rejected'])].copy()
    if df.empty:
        raise SystemExit('No labeled rows with status approved/rejected found.')

    df['text'] = [to_text(r.get('name'), r.get('description'), r.get('tags')) for r in df.to_dict(orient='records')]
    df['label'] = (df['status'] == 'approved').astype(int)

    pipe = Pipeline([
        ('tfidf', TfidfVectorizer(max_features=50000, ngram_range=(1, 2)) ),
        ('clf', LogisticRegression(max_iter=200, class_weight='balanced')),
    ])

    pipe.fit(df['text'], df['label'])

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipe, MODEL_PATH)
    print(f"Saved {MODEL_PATH}")


if __name__ == '__main__':
    main()
