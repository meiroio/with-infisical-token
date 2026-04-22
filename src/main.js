import * as core from "@actions/core";

import { runAction } from "./action.js";

try {
  await runAction({ core });
} catch (error) {
  core.setFailed(error instanceof Error ? error.message : String(error));
}
