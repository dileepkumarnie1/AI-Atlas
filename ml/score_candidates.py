import json
import joblib
from pathlib import Path
from sklearn.metrics.pairwise import cosine_similarity

MODEL_PATH = Path('ml/model_v1.joblib')
APPROVED_PATH = Path('public/tools.json')
CANDIDATES_PATH = Path('data/pending-tools.json')
OUTPUT_PATH = Path('data/pending-tools.scored.json')


def to_text(name, description, tags):
    name = name or ''
    description = description or ''
    if isinstance(tags, list):
        tags = ' '.join([str(t) for t in tags])
    else:
        tags = str(tags or '')
    return f"{name} {description} {tags}".strip()


def load_approved():
    approved = json.loads(APPROVED_PATH.read_text(encoding='utf-8'))
    items = []
    for domain in approved:
        slug = domain.get('slug')
        for t in domain.get('tools', []):
            items.append({
                'name': t.get('name'),
                'domainSlug': slug,
                'text': to_text(t.get('name'), t.get('description'), t.get('tags'))
            })
    return items


def main():
    if not MODEL_PATH.exists():
        raise SystemExit(f"Model not found at {MODEL_PATH}. Train first.")
    model = joblib.load(MODEL_PATH)

    if not CANDIDATES_PATH.exists():
        raise SystemExit(f"Candidates not found at {CANDIDATES_PATH}.")
    candidates = json.loads(CANDIDATES_PATH.read_text(encoding='utf-8'))

    approved_items = load_approved()
    approved_texts = [it['text'] for it in approved_items]
    approved_vecs = model['tfidf'].transform(approved_texts)

    out = []
    for c in candidates:
        text = to_text(c.get('name'), c.get('description'), c.get('tags'))
        X = model['tfidf'].transform([text])
        proba = float(model['clf'].predict_proba(X)[0, 1])
        decision = 'approve' if proba >= 0.6 else 'reject'

        sims = cosine_similarity(X, approved_vecs)[0]
        idxs = sims.argsort()[-3:][::-1]
        similar = [{
            'name': approved_items[i]['name'],
            'domainSlug': approved_items[i]['domainSlug'],
            'score': float(sims[i])
        } for i in idxs]

        c = dict(c)
        c['mlScore'] = proba
        c['mlDecision'] = decision
        c['mlVersion'] = 'v1'
        c['mlSimilar'] = similar
        out.append(c)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(out, indent=2), encoding='utf-8')
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == '__main__':
    main()
