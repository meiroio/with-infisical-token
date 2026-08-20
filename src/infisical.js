function readSecretEntries(response) {
  const imported = (response.imports ?? []).flatMap((entry) => entry?.secrets ?? []);
  const direct = response.secrets ?? [];
  return [...imported, ...direct];
}

export function normalizeSecretPath(secretPath = "/") {
  if (secretPath === "/") {
    return secretPath;
  }

  let normalized = secretPath;
  while (normalized.startsWith("/") && normalized !== "/") {
    normalized = normalized.slice(1);
  }

  return normalized || "/";
}

export function collectSecrets(response) {
  return readSecretEntries(response).reduce((accumulator, secret) => {
    if (!Object.hasOwn(secret, "secretKey") || !Object.hasOwn(secret, "secretValue")) {
      return accumulator;
    }

    accumulator[secret.secretKey] = String(secret.secretValue);
    return accumulator;
  }, {});
}

export function buildSecretsRequest(config) {
  const query = new URLSearchParams({
    environment: config.envSlug,
    expandSecretReferences: String(config.expandSecretReferences),
    includeImports: String(config.includeImports),
    includePersonalOverrides: String(config.includePersonalOverrides),
    projectId: config.projectId,
    recursive: String(config.recursive),
    secretPath: normalizeSecretPath(config.secretPath),
    viewSecretValue: "true"
  });

  if (config.metadataFilter) {
    query.set("metadataFilter", config.metadataFilter);
  }

  if (config.tagSlugs) {
    query.set("tagSlugs", config.tagSlugs);
  }

  return {
    headers: {
      Authorization: `Bearer ${config.token}`
    },
    method: "GET",
    query: query.toString(),
    url: `${config.apiUrl.replace(/\/$/, "")}/api/v4/secrets`
  };
}

export function assertSecretsResponse(response) {
  if (response === null || typeof response !== "object" || !Object.hasOwn(response, "secrets")) {
    throw new Error("Infisical API response did not contain a secrets object");
  }
}

export function assertValidSecretKeys(keys) {
  const invalidKeys = [...new Set(keys.filter((key) => key === "" || key.includes("=")))];
  if (invalidKeys.length > 0) {
    throw new Error(
      `Infisical secrets contain keys that cannot be used as environment names: ${invalidKeys.join(", ")}`
    );
  }
}

export function getInfisicalEnvEntries(config) {
  const entries = {
    INFISICAL_API_URL: config.apiUrl,
    INFISICAL_ENV_SLUG: config.envSlug,
    INFISICAL_PROJECT_ID: config.projectId,
    INFISICAL_SECRET_PATH: config.secretPath,
    INFISICAL_TOKEN: config.token
  };

  if (config.appEnvSlug) {
    entries.INFISICAL_APP_ENV_SLUG = config.appEnvSlug;
  }

  if (config.appSecretPath) {
    entries.INFISICAL_APP_SECRET_PATH = config.appSecretPath;
  }

  return entries;
}
