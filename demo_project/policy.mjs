export function validateDeploymentPolicy(config) {
  const errors = [];
  if (config.environment === "production" && !config.deployment?.requires_human_approval) {
    errors.push("production deployments must require human approval");
  }
  return errors;
}
