# TODO

## Trends & Historical Data
- [ ] Backfill historical keyword snapshots on first deployment using Federal Register API date-range queries (26 weeks x 6 categories)
- [ ] Handle categories without FR signals (igs, military, infoAvailability) — show "insufficient data" or use FR term search as proxy
- [ ] Add time-series chart component (recharts) to visualize keyword frequency over time in Deep Analysis
- [ ] Wire up render.yaml cron job stub to record weekly trend snapshots

## Demo Mode
- [ ] Add Playwright e2e tests using demo scenarios (mixed, stable, crisis, degrading)
- [ ] Add synthetic time-series data to demo fixtures for trend charts (once charts exist)
