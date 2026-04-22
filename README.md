# with-infisical-token

`with-infisical-token` is a GitHub Action that fetches secrets from Infisical with a service token and exports them to the workflow environment for downstream steps.

It preserves the behavior of `scripts/with-infisical-secrets.sh`:

- the same Infisical API endpoint and query parameters
- imported secrets merged before direct secrets, with direct values winning on collisions
- the same invalid key guard for empty names and names containing `=`
- optional preservation of `INFISICAL_*` variables for follow-up steps

Unlike the shell wrapper, this action does not depend on `curl` or `jq` being installed on the runner.

## Usage

### Export deploy secrets for later steps

```yaml
- name: Load deploy secrets
  uses: meiroio/with-infisical-token@v1
  with:
    token: ${{ secrets.INFISICAL_TOKEN }}
    project-id: ${{ vars.INFISICAL_PROJECT_ID }}
    env-slug: dev
    secret-path: ${{ vars.INFISICAL_SECRET_PATH || '/github-workflows' }}

- name: Login to Quay
  shell: bash
  run: |
    username="${QUAY_USERNAME:-${REGISTRY_USERNAME:-}}"
    password="${QUAY_PASSWORD:-${REGISTRY_PASSWORD:-}}"

    if [[ -z "$username" || -z "$password" ]]; then
      echo "Missing Quay credentials." >&2
      exit 1
    fi

    printf "%s" "$password" | docker login quay.io -u "$username" --password-stdin
```

### Keep `INFISICAL_*` variables for a deploy script

```yaml
- name: Load deploy + app secrets
  uses: meiroio/with-infisical-token@v1
  with:
    token: ${{ secrets.INFISICAL_TOKEN }}
    project-id: ${{ vars.INFISICAL_PROJECT_ID }}
    env-slug: prod
    secret-path: ${{ vars.INFISICAL_SECRET_PATH || '/github-workflows' }}
    keep-infisical-env: "true"
    app-secret-path: ${{ vars.INFISICAL_APP_SECRET_PATH || '/app' }}

- name: Deploy
  shell: bash
  env:
    IMAGE: ${{ steps.image.outputs.image }}
  run: scripts/ci/deploy-mgmt-k8s.sh
```

### Reuse existing workflow env

If your workflow already exports `INFISICAL_TOKEN`, `INFISICAL_PROJECT_ID`, `INFISICAL_ENV_SLUG`, and related variables at the job or step level, you can omit the matching `with:` fields. The action falls back to those environment variables automatically.

## Inputs

| Input | Required | Default | Notes |
| --- | --- | --- | --- |
| `token` | Yes | `INFISICAL_TOKEN` | Infisical service token. |
| `project-id` | Yes | `INFISICAL_PROJECT_ID` | Infisical project UUID. |
| `env-slug` | Yes | `INFISICAL_ENV_SLUG` | Infisical environment slug. |
| `secret-path` | No | `/` | Path to fetch. Leading slashes are normalized the same way as the shell script. |
| `api-url` | No | `https://eu.infisical.com` | Infisical base URL. |
| `recursive` | No | `false` | Fetch recursively. |
| `include-imports` | No | `true` | Include imported secrets. |
| `expand-secret-references` | No | `true` | Expand secret references. |
| `include-personal-overrides` | No | `false` | Include personal overrides. |
| `metadata-filter` | No | empty | Passed through to Infisical. |
| `tag-slugs` | No | empty | Passed through to Infisical. |
| `keep-infisical-env` | No | `false` | Also export `INFISICAL_*` vars, including the token. |
| `app-env-slug` | No | `INFISICAL_APP_ENV_SLUG` | Only used when `keep-infisical-env` is true. |
| `app-secret-path` | No | `INFISICAL_APP_SECRET_PATH` | Only used when `keep-infisical-env` is true. |

## Outputs

| Output | Description |
| --- | --- |
| `secret-count` | Number of exported secrets after merge/deduplication. |
| `secret-keys-json` | JSON array of exported secret keys. |

## Behavior Notes

- All exported secret values are masked with GitHub’s secret masking.
- Secret values are exported as environment variables for later steps, not as action outputs.
- If no secrets are returned, the action fails with the same env/path context as the shell wrapper.
- The action expects service-token access to the Infisical `/api/v4/secrets` endpoint.

## Development

```bash
npm install
npm test
npm run build
```
