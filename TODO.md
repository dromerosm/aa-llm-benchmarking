- [ ] Add the remaining Artificial Analysis endpoints: audio, image, video, and others.
- [ ] Persist the cache as a JSON object in D1.
- [ ] Add a Time vs Price chart.
- [ ] Add an Intelligence vs Price chart.
- [ ] Add metric-based filters.
- [ ] Evaluate how to reduce public dataset exposure without breaking the current UX.
  Note: the current UI depends on having the full dataset in the client for filtering, sorting, pagination, and the interactive timeline. If we reduce the data sent to the browser on a public site, we will lose functionality or need to redesign the experience so that part of this logic moves to the server.
- [ ] Build a dedicated Hugging Face leaderboard page that aggregates all official benchmark leaderboards exposed by the Hugging Face leaderboard API.
  Add a benchmark reference section that explains in detail what each benchmark measures, how the score is computed, what good performance means, and any important caveats such as gating, modality, or task-specific bias.
  Note: use an `HF_TOKEN` / `API_KEY_HF` based on a Hugging Face User Access Token with read access only; public leaderboards can be fetched without a token, but gated benchmark leaderboards require a token from an account that already has access to the gated dataset.
