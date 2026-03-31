export { GcpProvider } from "./provider.js";
export type { GcpConfig } from "./provider.js";

export { computeResource } from "./resources/compute.js";
export { storageResource } from "./resources/storage.js";
export { cloudRunResource } from "./resources/cloud-run.js";
export { cloudFunctionsResource } from "./resources/cloud-functions.js";
export { cloudSqlResource } from "./resources/cloud-sql.js";
export { pubsubResource } from "./resources/pubsub.js";
export { iamResource } from "./resources/iam.js";
export { networkResource } from "./resources/network.js";

export {
  deployStaticSite,
  deployCloudRunService,
  createApiBackend,
} from "./composite.js";

export { createGcpClients } from "./client.js";
export type { GcpClients } from "./client.js";
