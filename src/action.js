import {
  assertSecretsResponse,
  assertValidSecretKeys,
  buildSecretsRequest,
  collectSecrets,
  getInfisicalEnvEntries
} from "./infisical.js";

function getInputOrEnv(core, env, inputName, envName, fallback = "") {
  return core.getInput(inputName)?.trim() || env[envName]?.trim() || fallback;
}

function parseBooleanInput(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function requireValue(name, value) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
}

export function readConfig(core, env = process.env) {
  const config = {
    apiUrl: getInputOrEnv(core, env, "api-url", "INFISICAL_API_URL", "https://eu.infisical.com"),
    appEnvSlug: getInputOrEnv(core, env, "app-env-slug", "INFISICAL_APP_ENV_SLUG"),
    appSecretPath: getInputOrEnv(core, env, "app-secret-path", "INFISICAL_APP_SECRET_PATH"),
    envSlug: getInputOrEnv(core, env, "env-slug", "INFISICAL_ENV_SLUG"),
    expandSecretReferences: parseBooleanInput(
      getInputOrEnv(core, env, "expand-secret-references", "INFISICAL_EXPAND_SECRET_REFERENCES"),
      true
    ),
    includeImports: parseBooleanInput(
      getInputOrEnv(core, env, "include-imports", "INFISICAL_INCLUDE_IMPORTS"),
      true
    ),
    includePersonalOverrides: parseBooleanInput(
      getInputOrEnv(core, env, "include-personal-overrides", "INFISICAL_INCLUDE_PERSONAL_OVERRIDES"),
      false
    ),
    keepInfisicalEnv: parseBooleanInput(core.getInput("keep-infisical-env"), false),
    metadataFilter: getInputOrEnv(core, env, "metadata-filter", "INFISICAL_METADATA_FILTER"),
    projectId: getInputOrEnv(core, env, "project-id", "INFISICAL_PROJECT_ID"),
    recursive: parseBooleanInput(getInputOrEnv(core, env, "recursive", "INFISICAL_RECURSIVE"), false),
    secretPath: getInputOrEnv(core, env, "secret-path", "INFISICAL_SECRET_PATH", "/"),
    tagSlugs: getInputOrEnv(core, env, "tag-slugs", "INFISICAL_TAG_SLUGS"),
    token: getInputOrEnv(core, env, "token", "INFISICAL_TOKEN")
  };

  requireValue("token", config.token);
  requireValue("project-id", config.projectId);
  requireValue("env-slug", config.envSlug);

  return config;
}

async function getResponseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function throwResponseError(response) {
  const body = typeof response.text === "function" ? await response.text() : "";
  const bodySuffix = body ? `: ${body}` : "";
  throw new Error(`Infisical API request failed with status ${response.status}${bodySuffix}`);
}

export async function runAction({ core, env = process.env, fetchImpl = fetch }) {
  const config = readConfig(core, env);
  const request = buildSecretsRequest(config);

  core.info(
    `Fetching Infisical secrets from env=${config.envSlug} path=${new URLSearchParams(request.query).get("secretPath")}`
  );

  const response = await fetchImpl(`${request.url}?${request.query}`, {
    headers: request.headers,
    method: request.method
  });

  if (!response.ok) {
    await throwResponseError(response);
  }

  const responseJson = await getResponseJson(response);
  assertSecretsResponse(responseJson);

  const secrets = collectSecrets(responseJson);
  const secretKeys = Object.keys(secrets).sort();
  assertValidSecretKeys(secretKeys);

  if (secretKeys.length === 0) {
    throw new Error(
      `No Infisical secrets found at env=${config.envSlug} path=${new URLSearchParams(request.query).get("secretPath")}`
    );
  }

  for (const value of Object.values(secrets)) {
    core.setSecret(value);
  }

  for (const key of secretKeys) {
    core.exportVariable(key, secrets[key]);
  }

  if (config.keepInfisicalEnv) {
    core.setSecret(config.token);
    const infisicalEnvEntries = getInfisicalEnvEntries({
      apiUrl: config.apiUrl,
      appEnvSlug: config.appEnvSlug,
      appSecretPath: config.appSecretPath,
      envSlug: config.envSlug,
      projectId: config.projectId,
      secretPath: new URLSearchParams(request.query).get("secretPath"),
      token: config.token
    });

    for (const [key, value] of Object.entries(infisicalEnvEntries)) {
      core.exportVariable(key, value);
    }
  }

  core.setOutput("secret-count", String(secretKeys.length));
  core.setOutput("secret-keys-json", JSON.stringify(secretKeys));

  return {
    secretCount: secretKeys.length,
    secretKeys
  };
}
