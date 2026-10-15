import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedPlaidAccessToken {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly keyVersion: string;
}

/** AES-256-GCM envelope encryption for server-side Plaid Item access tokens. */
export class PlaidAccessTokenCipher {
  constructor(private readonly key: Uint8Array, private readonly keyVersion = "v1") {
    if (key.byteLength !== 32) throw new Error("Plaid token encryption key must be 32 bytes.");
    if (!keyVersion.trim()) throw new Error("Plaid token encryption key version is required.");
  }

  encrypt(accessToken: string): EncryptedPlaidAccessToken {
    if (typeof accessToken !== "string" || !accessToken.trim()) throw new Error("Plaid access token is required.");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(accessToken, "utf8"), cipher.final()]);
    return Object.freeze({
      ciphertext: ciphertext.toString("base64"),
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion: this.keyVersion
    });
  }

  decrypt(envelope: EncryptedPlaidAccessToken): string {
    if (!isEncryptedPlaidAccessToken(envelope)) throw new Error("Invalid encrypted Plaid token envelope.");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
  }
}

export function isEncryptedPlaidAccessToken(value: unknown): value is EncryptedPlaidAccessToken {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  return [envelope.ciphertext, envelope.iv, envelope.authTag, envelope.keyVersion]
    .every((item) => typeof item === "string" && item.length > 0);
}
