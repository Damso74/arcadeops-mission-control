import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateDeploymentPolicy } from "../policy.mjs";

const config = JSON.parse(
  await readFile(new URL("../config.json", import.meta.url), "utf8"),
);

test("la fixture charge une configuration de production", () => {
  assert.equal(config.environment, "production");
});

test("une action de production exige une approbation humaine", () => {
  assert.deepEqual(validateDeploymentPolicy(config), []);
});
