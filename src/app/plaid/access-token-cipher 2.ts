import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedPlaidAccessToken {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
  readonly keyVersion: string;
}

/** AES-256-GCM envelope encryption for server-side Plaid Item access tokens. */
export class PlaidAccessTokenCipher {
  private readonly keys: ReadonlyMap<string, Uint8Array>;

  constructor(private readonly key: Uint8Array, private readonly keyVersion = "v1", previousKeys: ReadonlyMap<string, Uint8Array> = new Map()) {
    if (key.byteLength !== 32) throw new Error("Plaid token encryption key must be 32 bytes.");
    if (!keyVersion.trim()) throw new Error("Plaid token encryption key version is required.");
    const keys = new Map(previousKeys);
    if (keys.has(keyVersion)) throw new Error("Active Plaid token key version must be unique.");
    keys.set(keyVersion, key);
    for (const [version, value] of keys) {
      if (!version.trim() || value.byteLength !== 32) throw new Error("Every Plaid token key must have a version and be 32 bytes.");
    }
    this.keys = keys;
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
    const key = this.keys.get(envelope.keyVersion);
    if (!key) throw new Error("Plaid access token encryption key version is unavailable.");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final()
    ]).toString("utf8");
  }

  /** Re-encrypts with the active key; callers persist and verify before retiring old versions. */
  rotate(envelope: EncryptedPlaidAccessToken): EncryptedPlaidAccessToken {
    return this.encrypt(this.decrypt(envelope));
  }
}

export function isEncryptedPlaidAccessToken(value: unknown): value is EncryptedPlaidAccessToken {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Record<string, unknown>;
  return [envelope.ciphertext, envelope.iv, envelope.authTag, envelope.keyVersion]
    .every((item) => typeof item === "string" && item.length > 0);
}
