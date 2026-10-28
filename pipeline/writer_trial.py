"""
Compare writer models on the same premises, without publishing anything.
Runs in GitHub Actions (.github/workflows/writer-trial.yml), which saves the results to the
"writer-trials" branch. Every draft and its review scores land in trial-results/<model>/.
"""
import json
import os
import random
import urllib.request
from pathlib import Path

import generate_story as g

CANDIDATES = ["openai/gpt-4.1", "openai/gpt-4o", "deepseek/DeepSeek-V3-0324", "xai/grok-3",
              "mistral-ai/mistral-medium-2505", "meta/Llama-4-Maverick-17B-128E-Instruct-FP8"]
GENRES = ["aita", "malicious compliance"]
REVIEWER = "github:openai/gpt-4.1"
OUT = Path(__file__).resolve().parent.parent / "trial-results"


def catalog():
    req = urllib.request.Request("https://models.github.ai/catalog/models",
                                 headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
                                          "Accept": "application/vnd.github+json"})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def main():
    OUT.mkdir(exist_ok=True)
    try:
        models = catalog()
        (OUT / "catalog.txt").write_text("\n".join(f"{m['id']}  ({m.get('rate_limit_tier')})" for m in models))
        available = {m["id"].lower() for m in models}
    except Exception as error:
        print(f"Couldn't read the catalog: {error}")
        available = None
    g.MAX_ATTEMPTS = 1
    g.REVIEW_MODEL = REVIEWER
    for name in CANDIDATES:
        if available is not None and name.lower() not in available:
            print(f"{name}: not in the catalog, skipped")
            continue
        folder = OUT / name.replace("/", "_")
        g.APPROVED_DIR = g.REJECTED_DIR = folder
        for i, genre in enumerate(GENRES):
            random.seed(100 + i)  # same premise, tone, and level for every model
            try:
                result = g.generate("unused", genre=genre, model=f"github:{name}")
                print(f"{name} / {genre}: {result['status']}")
            except Exception as error:
                print(f"{name} / {genre}: error {error}")
                folder.mkdir(parents=True, exist_ok=True)
                (folder / f"error-{i}.txt").write_text(str(error))


if __name__ == "__main__":
    main()
