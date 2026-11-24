# Local MCP config

`settings.json` in this folder is git-ignored: it holds absolute paths (node
binary, `tsx` entrypoint, service-account key) that only make sense on one
machine. This example is the portable version of the same server.

```bash
cp .gemini/settings.example.json .gemini/settings.json
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
gemini trust          # project settings are ignored in an untrusted folder
gemini mcp list       # expect: cisa-work-tracker-local ... Connected
```

Two things to know:

- Run `gemini` from the repo root. The paths above are repo-relative and Gemini
  does **not** expand `$HOME` or `${...}` in `command`/`args`/`cwd` — only in
  `env` values.
- The credential must be a service-account key (`private_key` + `client_email`).
  Application Default Credentials from `gcloud auth login` are not enough.

The service account needs `roles/datastore.user` on `sac-campus-hub`.
