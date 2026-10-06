/**
 * Capteur biométrique virtuel pour les tests de bout en bout.
 *
 * Simule un authenticator FIDO2/WebAuthn : paire de clés P-256, encodage CBOR
 * de l'attestation et signature des assertions. Utilisé par `test:biometric`
 * (empreintes des salariés) et par `test:twofa` (clés de sécurité des comptes
 * utilisateurs) — le même code, donc les mêmes garanties vérifiées.
 *
 * Le domaine (RP ID) et l'origine sont lus dans l'environnement, avec les mêmes
 * valeurs par défaut que les scripts de test.
 */
import crypto from "node:crypto";

export const RP_ID =
  process.env.E2E_RP_ID || new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:3000").hostname;
export const ORIGIN = process.env.E2E_ORIGIN || process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

/* ------------------------------ CBOR minimal ------------------------------ */

function cborHead(major, value) {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value < 256) return Buffer.from([(major << 5) | 24, value]);
  if (value < 65536) {
    const buffer = Buffer.alloc(3);
    buffer[0] = (major << 5) | 25;
    buffer.writeUInt16BE(value, 1);
    return buffer;
  }
  const buffer = Buffer.alloc(5);
  buffer[0] = (major << 5) | 26;
  buffer.writeUInt32BE(value, 1);
  return buffer;
}

export function cborEncode(value) {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error("CBOR: seuls les entiers sont supportés");
    return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
  }
  if (typeof value === "string") {
    const data = Buffer.from(value, "utf8");
    return Buffer.concat([cborHead(3, data.length), data]);
  }
  if (value instanceof Uint8Array) {
    const data = Buffer.from(value);
    return Buffer.concat([cborHead(2, data.length), data]);
  }
  if (Array.isArray(value)) {
    return Buffer.concat([cborHead(4, value.length), ...value.map(cborEncode)]);
  }
  if (value instanceof Map) {
    const parts = [cborHead(5, value.size)];
    for (const [key, item] of value) parts.push(cborEncode(key), cborEncode(item));
    return Buffer.concat(parts);
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    return cborEncode(new Map(entries));
  }
  throw new Error("CBOR: type non supporté");
}

export const b64url = (input) => Buffer.from(input).toString("base64url");
export const sha256 = (input) => crypto.createHash("sha256").update(input).digest();

/* --------------------------- Capteur biométrique -------------------------- */

export class VirtualAuthenticator {
  constructor(label = "capteur-virtuel", { rpID = RP_ID, origin = ORIGIN } = {}) {
    this.label = label;
    this.rpID = rpID;
    this.origin = origin;
    this.credentialId = crypto.randomBytes(32);
    this.aaguid = crypto.randomBytes(16);
    this.counter = 0;
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    this.publicKey = publicKey;
    this.privateKey = privateKey;

    const jwk = publicKey.export({ format: "jwk" });
    this.coseKey = Buffer.concat([
      cborEncode(
        new Map([
          [1, 2], // kty: EC2
          [3, -7], // alg: ES256
          [-1, 1], // crv: P-256
          [-2, Buffer.from(jwk.x, "base64url")],
          [-3, Buffer.from(jwk.y, "base64url")],
        ])
      ),
    ]);
  }

  /** signCount « qui avance » comme un vrai capteur */
  nextCounter() {
    this.counter += 1;
    return this.counter;
  }

  #authData({ rpID, flags, counter, includeCredentialData }) {
    const rpIdHash = sha256(rpID);
    const header = Buffer.concat([
      rpIdHash,
      Buffer.from([flags]),
      (() => {
        const buffer = Buffer.alloc(4);
        buffer.writeUInt32BE(counter, 0);
        return buffer;
      })(),
    ]);

    if (!includeCredentialData) return header;

    const credentialLength = Buffer.alloc(2);
    credentialLength.writeUInt16BE(this.credentialId.length, 0);

    return Buffer.concat([
      header,
      this.aaguid,
      credentialLength,
      this.credentialId,
      this.coseKey,
    ]);
  }

  createAttestation({ challenge, rpID = this.rpID, origin = this.origin, flags = 0x45 }) {
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: "webauthn.create", challenge, origin, crossOrigin: false }),
      "utf8"
    );
    const authData = this.#authData({
      rpID,
      flags, // UP (0x01) + UV (0x04) + AT (0x40)
      counter: 0,
      includeCredentialData: true,
    });
    const attestationObject = cborEncode({
      fmt: "none",
      attStmt: {},
      authData,
    });

    return {
      id: b64url(this.credentialId),
      rawId: b64url(this.credentialId),
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64url(clientDataJSON),
        attestationObject: b64url(attestationObject),
        transports: ["internal"],
      },
    };
  }

  /** @param signingKey clé privée à utiliser (par défaut celle du capteur) */
  createAssertion({
    challenge,
    rpID = this.rpID,
    origin = this.origin,
    flags = 0x05,
    signingKey = this.privateKey,
    counter = this.nextCounter(),
    credentialId = this.credentialId,
  }) {
    const clientDataJSON = Buffer.from(
      JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false }),
      "utf8"
    );
    const authData = this.#authData({
      rpID,
      flags, // UP (0x01) + UV (0x04)
      counter,
      includeCredentialData: false,
    });

    const signature = crypto.sign(
      "sha256",
      Buffer.concat([authData, sha256(clientDataJSON)]),
      signingKey
    );

    return {
      id: b64url(credentialId),
      rawId: b64url(credentialId),
      type: "public-key",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authData),
        signature: b64url(signature),
        userHandle: null,
      },
    };
  }
}
