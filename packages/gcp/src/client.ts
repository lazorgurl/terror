import { InstancesClient, FirewallsClient, NetworksClient, SubnetworksClient } from "@google-cloud/compute";
import { Storage } from "@google-cloud/storage";
import { ServicesClient } from "@google-cloud/run";
import { v2 as functionsV2 } from "@google-cloud/functions";
import { PubSub } from "@google-cloud/pubsub";
import { google } from "googleapis";
import type { iam_v1 } from "googleapis";
import type { sqladmin_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import type { OAuthTokens } from "@terror/core";

export interface GcpClients {
  computeInstances: InstancesClient;
  firewalls: FirewallsClient;
  networks: NetworksClient;
  subnetworks: SubnetworksClient;
  storage: Storage;
  cloudRun: ServicesClient;
  cloudFunctions: functionsV2.FunctionServiceClient;
  pubsub: PubSub;
  sqladmin: sqladmin_v1.Sqladmin;
  iam: iam_v1.Iam;
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

  // @google-cloud SDKs expect their own AuthClient type which differs from
  // google-auth-library's OAuth2Client at the type level, but is compatible at runtime.
  const authOptions = { authClient: oauth2Client as unknown as undefined };

  return {
    computeInstances: new InstancesClient(authOptions),
    firewalls: new FirewallsClient(authOptions),
    networks: new NetworksClient(authOptions),
    subnetworks: new SubnetworksClient(authOptions),
    storage: new Storage({ projectId, authClient: oauth2Client as unknown as undefined }),
    cloudRun: new ServicesClient(authOptions),
    cloudFunctions: new functionsV2.FunctionServiceClient(authOptions),
    pubsub: new PubSub({ projectId, auth: oauth2Client as unknown as undefined }),
    sqladmin: google.sqladmin({ version: "v1", auth: oauth2Client }),
    iam: google.iam({ version: "v1", auth: oauth2Client }),
  };
}
