import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSecretsResponse,
  assertValidSecretKeys,
  buildSecretsRequest,
  collectSecrets,
  getInfisicalEnvEntries,
  normalizeSecretPath
} from "../src/infisical.js";

test("normalizeSecretPath preserves root and strips other leading slashes", () => {
  assert.equal(normalizeSecretPath("/"), "/");
  assert.equal(normalizeSecretPath("/app"), "app");
  assert.equal(normalizeSecretPath("///nested/path"), "nested/path");
  assert.equal(normalizeSecretPath(""), "/");
});

test("collectSecrets merges imports before direct secrets and stringifies values", () => {
  const secrets = collectSecrets({
    imports: [
      {
        secrets: [
          { secretKey: "SHARED", secretValue: "imported" },
          { secretKey: "IMPORTED_ONLY", secretValue: 7 }
        ]
      }
    ],
    secrets: [
      { secretKey: "SHARED", secretValue: "direct" },
      { secretKey: "DIRECT_ONLY", secretValue: false },
      { secretKey: "IGNORED_NO_VALUE" }
    ]
  });

  assert.deepEqual(secrets, {
    DIRECT_ONLY: "false",
    IMPORTED_ONLY: "7",
    SHARED: "direct"
  });
});

test("assertValidSecretKeys rejects empty keys and equals signs", () => {
  assert.doesNotThrow(() => assertValidSecretKeys(["VALID_KEY"]));
  assert.throws(() => assertValidSecretKeys([""]), /cannot be used as environment names/);
  assert.throws(() => assertValidSecretKeys(["HAS=EQUALS"]), /cannot be used as environment names/);
});

test("getInfisicalEnvEntries returns the runtime config when keep mode is enabled", () => {
  assert.deepEqual(
    getInfisicalEnvEntries({
      apiUrl: "https://eu.infisical.com",
      appEnvSlug: "prod-app",
      appSecretPath: "/app",
      envSlug: "prod",
      projectId: "project-id",
      secretPath: "github-workflows",
      token: "token-value"
    }),
    {
      INFISICAL_API_URL: "https://eu.infisical.com",
      INFISICAL_APP_ENV_SLUG: "prod-app",
      INFISICAL_APP_SECRET_PATH: "/app",
      INFISICAL_ENV_SLUG: "prod",
      INFISICAL_PROJECT_ID: "project-id",
      INFISICAL_SECRET_PATH: "github-workflows",
      INFISICAL_TOKEN: "token-value"
    }
  );
});

test("buildSecretsRequest encodes Infisical query params the same way as the shell wrapper", () => {
  const request = buildSecretsRequest({
    apiUrl: "https://eu.infisical.com/",
    envSlug: "prod",
    expandSecretReferences: true,
    includeImports: false,
    includePersonalOverrides: true,
    metadataFilter: 'env=="prod"',
    projectId: "project-id",
    recursive: true,
    secretPath: "/github-workflows",
    tagSlugs: "deploy,shared",
    token: "token-value"
  });

  assert.equal(request.method, "GET");
  assert.equal(request.headers.Authorization, "Bearer token-value");
  assert.equal(request.url, "https://eu.infisical.com/api/v4/secrets");

  const params = new URLSearchParams(request.query);
  assert.equal(params.get("projectId"), "project-id");
  assert.equal(params.get("environment"), "prod");
  assert.equal(params.get("secretPath"), "github-workflows");
  assert.equal(params.get("viewSecretValue"), "true");
  assert.equal(params.get("expandSecretReferences"), "true");
  assert.equal(params.get("recursive"), "true");
  assert.equal(params.get("includeImports"), "false");
  assert.equal(params.get("includePersonalOverrides"), "true");
  assert.equal(params.get("metadataFilter"), 'env=="prod"');
  assert.equal(params.get("tagSlugs"), "deploy,shared");
});

test("assertSecretsResponse rejects unexpected Infisical API payloads", () => {
  assert.doesNotThrow(() => assertSecretsResponse({ secrets: [] }));
  assert.throws(() => assertSecretsResponse(null), /did not contain a secrets object/);
  assert.throws(() => assertSecretsResponse({}), /did not contain a secrets object/);
});
