import { createServer, type Server } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { URL } from "node:url";
import type { OAuthTokens } from "./types.js";
import { Logger } from "./logger.js";

const CREDENTIALS_DIR = join(homedir(), ".terror");
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials.json");

interface StoredTokenEntry {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scopes?: string[];
}

type StoredCredentials = Record<string, StoredTokenEntry>;

export class OAuthBroker {
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger ?? new Logger("info");
  }

  async startFlow(
    providerName: string,
    authUrl: string,
    callbackPath: string
  ): Promise<OAuthTokens> {
    return new Promise<OAuthTokens>((resolve, reject) => {
      const server: Server = createServer((req, res) => {
        const url = new URL(req.url ?? "/", `http://localhost`);

        if (url.pathname !== callbackPath) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(400);
          res.end(`OAuth error: ${error}`);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400);
          res.end("Missing authorization code");
          server.close();
          reject(new Error("Missing authorization code"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Authorization successful</h1><p>You can close this window.</p></body></html>"
        );

        const tokens: OAuthTokens = { accessToken: code };
        this.storeTokens(providerName, tokens)
          .then(() => {
            server.close();
            resolve(tokens);
          })
          .catch((err) => {
            server.close();
            reject(err);
          });
      });

      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("Failed to get server address"));
          return;
        }

        const redirectUrl = `http://127.0.0.1:${address.port}${callbackPath}`;
        const fullAuthUrl = `${authUrl}${authUrl.includes("?") ? "&" : "?"}redirect_uri=${encodeURIComponent(redirectUrl)}`;

        this.logger.info("OAuth flow started", {
          provider: providerName,
          port: address.port,
        });
        this.logger.info(`Open this URL to authorize: ${fullAuthUrl}`);

        this.openBrowser(fullAuthUrl).catch(() => {
          this.logger.warn(
            "Could not open browser automatically. Please open the URL manually."
          );
        });
      });

      server.on("error", (err) => {
        reject(err);
      });
    });
  }

  async getTokens(providerName: string): Promise<OAuthTokens | null> {
    try {
      const credentials = await this.readCredentials();
      const stored = credentials[providerName];
      if (!stored) return null;

      return {
        ...stored,
        expiresAt: stored.expiresAt ? new Date(stored.expiresAt) : undefined,
      };
    } catch {
      return null;
    }
  }

  async refreshTokens(
    providerName: string,
    refreshUrl: string
  ): Promise<OAuthTokens> {
    const existing = await this.getTokens(providerName);
    if (!existing?.refreshToken) {
      throw new Error(
        `No refresh token available for provider "${providerName}"`
      );
    }

    const response = await fetch(refreshUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: existing.refreshToken }),
    });

    if (!response.ok) {
      throw new Error(
        `Token refresh failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as Record<string, unknown>;
    const tokens: OAuthTokens = {
      accessToken: data.access_token as string,
      refreshToken:
        (data.refresh_token as string | undefined) ?? existing.refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + (data.expires_in as number) * 1000)
        : undefined,
      scopes: data.scope
        ? (data.scope as string).split(" ")
        : existing.scopes,
    };

    await this.storeTokens(providerName, tokens);
    this.logger.info("Tokens refreshed", { provider: providerName });
    return tokens;
  }

  private async storeTokens(
    providerName: string,
    tokens: OAuthTokens
  ): Promise<void> {
    await mkdir(CREDENTIALS_DIR, { recursive: true });
    const credentials = await this.readCredentials();
    credentials[providerName] = {
      ...tokens,
      expiresAt: tokens.expiresAt?.toISOString(),
    };
    await writeFile(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), {
      mode: 0o600,
    });
    this.logger.debug("Tokens stored", { provider: providerName });
  }

  private async readCredentials(): Promise<StoredCredentials> {
    try {
      const content = await readFile(CREDENTIALS_FILE, "utf-8");
      return JSON.parse(content) as StoredCredentials;
    } catch {
      return {};
    }
  }

  private async openBrowser(url: string): Promise<void> {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    const platform = process.platform;
    const cmd =
      platform === "darwin"
        ? "open"
        : platform === "win32"
          ? "start"
          : "xdg-open";

    await execAsync(`${cmd} "${url}"`);
  }
}
