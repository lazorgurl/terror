import { InstancesClient, FirewallsClient, NetworksClient, SubnetworksClient } from "@google-cloud/compute";
import { Storage } from "@google-cloud/storage";
import { ServicesClient } from "@google-cloud/run";
import { FunctionServiceClient } from "@google-cloud/functions";
import { PubSub } from "@google-cloud/pubsub";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import type { OAuthTokens } from "@terror/core/types.js";

export interface GcpClients {
  computeInstances: InstancesClient;
  firewalls: FirewallsClient;
  networks: NetworksClient;
  subnetworks: SubnetworksClient;
  storage: Storage;
  cloudRun: ServicesClient;
  cloudFunctions: FunctionServiceClient;
  pubsub: PubSub;
  sqladmin: ReturnType<typeof google.sqladmin>;
  iam: ReturnType<typeof google.iam>;
}

export function createGcpClients(
  projectId: string,
  tokens: OAuthTokens,
): GcpClients {
  const oauth2Client = new OAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiresAt?.getTime(),
  });

  const authOptions = { authClient: oauth2Client };

  return {
    computeInstances: new InstancesClient(authOptions),
    firewalls: new FirewallsClient(authOptions),
    networks: new NetworksClient(authOptions),
    subnetworks: new SubnetworksClient(authOptions),
    storage: new Storage({ projectId, authClient: oauth2Client }),
    cloudRun: new ServicesClient(authOptions),
    cloudFunctions: new FunctionServiceClient(authOptions),
    pubsub: new PubSub({ projectId, auth: oauth2Client as unknown as undefined }),
    sqladmin: google.sqladmin({ version: "v1", auth: oauth2Client }),
    iam: google.iam({ version: "v1", auth: oauth2Client }),
  };
}
