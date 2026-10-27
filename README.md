# FlypBook: Scroll Like Shakespeare

See [PLAN.md](PLAN.md) for the full plan and requirements.

## Folders
- `pipeline/generate_story.py`: writes ONE story (plot plan → story → safety + logic check).
- `pipeline/run_batch.py`: the scheduled job. Handles queued requests first, then adds regular stories, and posts them to Supabase.
- `supabase/schema.sql`: database tables, security rules (Row Level Security), request queue, triggers.
- `.github/workflows/generate-stories.yml`: runs `run_batch.py` every 6 hours on GitHub Actions.

## Secrets
Locally they go in `pipeline/.env` (see `.env.example`). Online they go in GitHub Secrets. Never commit them.

| Name | Where to get it |
|---|---|
| `GROQ_API_KEY` | console.groq.com > API Keys |
| `SUPABASE_URL` | Supabase > Project Settings > Data API |
| `SUPABASE_SECRET_KEY` | Supabase > Project Settings > API Keys > Secret keys |

## Commands
```
cd pipeline
python generate_story.py                       # one story, saved locally only
python generate_story.py --request "..." --user sam
python run_batch.py                            # full job: requests + regular stories -> Supabase
```

## Reviewing reported stories
Any report hides a story. In Supabase > Table Editor > `stories`, filter `status = hidden`, then set it to `published` (restore) or `removed`.

## Changing limits
- Requests per user per day: Table Editor > `app_settings` > `daily_request_limit`.
- Stories per run and requests per run: top of `pipeline/run_batch.py`.
- How often it runs: `cron` line in `.github/workflows/generate-stories.yml`.
