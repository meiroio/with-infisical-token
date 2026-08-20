import assert from "node:assert/strict";
import test from "node:test";

import { readConfig, runAction } from "../src/action.js";

test("runAction fetches secrets and exports them for downstream workflow steps", async () => {
  const exportedVariables = {};
  const maskedValues = [];
  const outputs = {};
  const infoLogs = [];
  const inputs = {
    "api-url": "",
    "app-env-slug": "prod-app",
    "app-secret-path": "/app",
    "env-slug": "prod",
    "expand-secret-references": "",
    "include-imports": "false",
    "include-personal-overrides": "true",
    "keep-infisical-env": "true",
    "metadata-filter": 'env=="prod"',
    "project-id": "project-id",
    recursive: "true",
    "secret-path": "/github-workflows",
    "tag-slugs": "deploy,shared",
    token: "token-value"
  };

  const core = {
    exportVariable(name, value) {
      exportedVariables[name] = value;
    },
    getInput(name) {
      return inputs[name] ?? "";
    },
    info(message) {
      infoLogs.push(message);
    },
    setOutput(name, value) {
      outputs[name] = value;
    },
    setSecret(value) {
      maskedValues.push(value);
    }
  };

  const fetchCalls = [];
  await runAction({
    core,
    fetchImpl: async (url, options) => {
      fetchCalls.push({ options, url });
      return {
        async json() {
          return {
            imports: [
              {
                secrets: [{ secretKey: "SHARED", secretValue: "imported" }]
              }
            ],
            secrets: [
              { secretKey: "SHARED", secretValue: "direct" },
              { secretKey: "API_KEY", secretValue: "top-secret" }
            ]
          };
        },
        ok: true
      };
    }
  });

  assert.equal(fetchCalls.length, 1);
  assert.match(fetchCalls[0].url, /^https:\/\/eu\.infisical\.com\/api\/v4\/secrets\?/);
  assert.equal(fetchCalls[0].options.method, "GET");
  assert.equal(fetchCalls[0].options.headers.Authorization, "Bearer token-value");

  assert.deepEqual(exportedVariables, {
    API_KEY: "top-secret",
    INFISICAL_API_URL: "https://eu.infisical.com",
    INFISICAL_APP_ENV_SLUG: "prod-app",
    INFISICAL_APP_SECRET_PATH: "/app",
    INFISICAL_ENV_SLUG: "prod",
    INFISICAL_PROJECT_ID: "project-id",
    INFISICAL_SECRET_PATH: "github-workflows",
    INFISICAL_TOKEN: "token-value",
    SHARED: "direct"
  });
  assert.deepEqual(maskedValues.sort(), ["token-value", "top-secret", "direct"].sort());
  assert.deepEqual(outputs, {
    "secret-count": "2",
    "secret-keys-json": JSON.stringify(["API_KEY", "SHARED"])
  });
  assert.match(infoLogs.join("\n"), /Fetching Infisical secrets from env=prod path=github-workflows/);
});

test("runAction does not blank inherited Infisical config for later workflow steps", async () => {
  const exportedVariables = {};
  const core = {
    exportVariable(name, value) {
      exportedVariables[name] = value;
    },
    getInput() {
      return "";
    },
    info() {},
    setOutput() {},
    setSecret() {}
  };

  await runAction({
    core,
    env: {
      INFISICAL_API_URL: "https://eu.infisical.com",
      INFISICAL_ENV_SLUG: "prod",
      INFISICAL_PROJECT_ID: "project-id",
      INFISICAL_SECRET_PATH: "/github-workflows",
      INFISICAL_TOKEN: "token-value"
    },
    fetchImpl: async () => ({
      async json() {
        return {
          secrets: [{ secretKey: "API_KEY", secretValue: "top-secret" }]
        };
      },
      ok: true
    })
  });

  assert.deepEqual(exportedVariables, {
    API_KEY: "top-secret"
  });
});

test("runAction preserves fetched secrets whose keys overlap with INFISICAL_* names", async () => {
  const exportedVariables = {};
  const maskedValues = [];
  const core = {
    exportVariable(name, value) {
      exportedVariables[name] = value;
    },
    getInput(name) {
      return (
        {
          "env-slug": "prod",
          "project-id": "project-id",
          token: "config-token"
        }[name] ?? ""
      );
    },
    info() {},
    setOutput() {},
    setSecret(value) {
      maskedValues.push(value);
    }
  };

  await runAction({
    core,
    fetchImpl: async () => ({
      async json() {
        return {
          secrets: [
            { secretKey: "API_KEY", secretValue: "top-secret" },
            { secretKey: "INFISICAL_TOKEN", secretValue: "secret-token" }
          ]
        };
      },
      ok: true
    })
  });

  assert.deepEqual(exportedVariables, {
    API_KEY: "top-secret",
    INFISICAL_TOKEN: "secret-token"
  });
  assert.deepEqual(maskedValues.sort(), ["secret-token", "top-secret"].sort());
});

test("readConfig falls back to INFISICAL_* environment variables", () => {
  const core = {
    getInput() {
      return "";
    }
  };

  const config = readConfig(core, {
    INFISICAL_API_URL: "https://app.infisical.com",
    INFISICAL_APP_ENV_SLUG: "app-prod",
    INFISICAL_APP_SECRET_PATH: "/app",
    INFISICAL_ENV_SLUG: "prod",
    INFISICAL_INCLUDE_IMPORTS: "false",
    INFISICAL_PROJECT_ID: "project-id",
    INFISICAL_RECURSIVE: "true",
    INFISICAL_SECRET_PATH: "/github-workflows",
    INFISICAL_TOKEN: "token-value"
  });

  assert.deepEqual(config, {
    apiUrl: "https://app.infisical.com",
    appEnvSlug: "app-prod",
    appSecretPath: "/app",
    envSlug: "prod",
    expandSecretReferences: true,
    includeImports: false,
    includePersonalOverrides: false,
    keepInfisicalEnv: false,
    metadataFilter: "",
    projectId: "project-id",
    recursive: true,
    secretPath: "/github-workflows",
    tagSlugs: "",
    token: "token-value"
  });
});
