/**
 * Módulo de Identidade Criptográfica Zero-Trust por Dispositivo (WebCrypto ECDSA P-256).
 * - Gera chaves privadas não-exportáveis (extractable: false) armazenadas no IndexedDB.
 * - Assina digitalmente todas as requisições à API (Proof-of-Possession + Anti-Replay).
 */

const DB_NAME = "SynaptixZeroTrustVault";
const DB_VERSION = 1;
const STORE_NAME = "device_identity";
const IDENTITY_KEY = "current_device";

export interface StoredDeviceIdentity {
  deviceId: string | null;
  deviceName: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyJwk: string;
  createdAt: string;
}

let cachedIdentity: StoredDeviceIdentity | null = null;
let fetchInterceptorInstalled = false;

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomHexNonce(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function openVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIdentityFromDB(): Promise<StoredDeviceIdentity | null> {
  try {
    const db = await openVaultDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(IDENTITY_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function writeIdentityToDB(identity: StoredDeviceIdentity): Promise<void> {
  const db = await openVaultDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(identity, IDENTITY_KEY);
    req.onsuccess = () => {
      cachedIdentity = identity;
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getOrCreateDeviceIdentity(preferredName?: string): Promise<StoredDeviceIdentity> {
  if (cachedIdentity) {
    if (preferredName && preferredName !== cachedIdentity.deviceName) {
      cachedIdentity.deviceName = preferredName;
      await writeIdentityToDB(cachedIdentity);
    }
    return cachedIdentity;
  }

  const existing = await readIdentityFromDB();
  if (existing && existing.privateKey && existing.publicKeyJwk) {
    if (preferredName && preferredName !== existing.deviceName) {
      existing.deviceName = preferredName;
      await writeIdentityToDB(existing);
    }
    cachedIdentity = existing;
    return existing;
  }

  // Gera par de chaves ECDSA P-256 com chave privada NÃO-EXPORTÁVEL (extractable: false)
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["sign", "verify"]
  );

  const exportedJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const newIdentity: StoredDeviceIdentity = {
    deviceId: null,
    deviceName: preferredName || getDefaultDeviceName(),
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyJwk: JSON.stringify(exportedJwk),
    createdAt: new Date().toISOString(),
  };

  await writeIdentityToDB(newIdentity);
  return newIdentity;
}

export async function bindDeviceIdToIdentity(deviceId: string, deviceName?: string): Promise<void> {
  const identity = await getOrCreateDeviceIdentity(deviceName);
  identity.deviceId = deviceId;
  if (deviceName) {
    identity.deviceName = deviceName;
  }
  await writeIdentityToDB(identity);
}

export async function resetDeviceIdentity(): Promise<void> {
  cachedIdentity = null;
  const db = await openVaultDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(IDENTITY_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function getDefaultDeviceName(): string {
  const ua = navigator.userAgent;
  let os = "Dispositivo";
  if (ua.includes("Windows")) os = "Windows PC";
  else if (ua.includes("Macintosh")) os = "Mac";
  else if (ua.includes("iPhone")) os = "iPhone";
  else if (ua.includes("iPad")) os = "iPad";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("Linux")) os = "Linux PC";

  let browser = "Navegador";
  if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Safari/")) browser = "Safari";

  return `${os} (${browser})`;
}

export async function buildSignedHeaders(
  method: string,
  path: string,
  overrideDeviceId?: string
): Promise<Record<string, string>> {
  const identity = await getOrCreateDeviceIdentity();
  const activeDeviceId = overrideDeviceId || identity.deviceId;
  if (!activeDeviceId) {
    return {};
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomHexNonce(16);
  const canonicalPayload = `${activeDeviceId}:${timestamp}:${nonce}:${method.toUpperCase()}:${path}`;
  const encoder = new TextEncoder();

  const signatureBuffer = await window.crypto.subtle.sign(
    {
      name: "ECDSA",
      hash: { name: "SHA-256" },
    },
    identity.privateKey,
    encoder.encode(canonicalPayload)
  );

  const headers: Record<string, string> = {
    "X-Synaptix-Device-Id": activeDeviceId,
    "X-Synaptix-Timestamp": timestamp,
    "X-Synaptix-Nonce": nonce,
    "X-Synaptix-Signature": bufferToBase64Url(signatureBuffer),
  };

  if (identity.publicKeyJwk) {
    headers["X-Synaptix-Public-Key-Jwk"] = identity.publicKeyJwk;
    headers["X-Synaptix-Device-Name"] = encodeURIComponent(
      identity.deviceName || "Dispositivo Autorizado"
    );
  }

  return headers;
}

const API_PREFIXES = [
  "/auth",
  "/chat",
  "/notifications",
  "/tasks",
  "/upload",
  "/uploads",
  "/workspaces",
  "/notebooks",
  "/notes",
  "/comments",
  "/comment-connections",
  "/analyze",
  "/events",
  "/calendar",
  "/team-admin",
  "/guided-study",
];

function extractLocalApiPath(input: RequestInfo | URL): string | null {
  let rawUrl = "";
  if (typeof input === "string") {
    rawUrl = input;
  } else if (input instanceof URL) {
    rawUrl = input.toString();
  } else if (input instanceof Request) {
    rawUrl = input.url;
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    if (parsed.origin !== window.location.origin && parsed.host !== "localhost:8000" && parsed.host !== "127.0.0.1:8000") {
      return null;
    }
    const isApi = API_PREFIXES.some(
      (prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`)
    );
    return isApi ? parsed.pathname : null;
  } catch {
    return null;
  }
}

export function installZeroTrustFetchInterceptor(): void {
  if (fetchInterceptorInstalled) return;
  fetchInterceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const apiPath = extractLocalApiPath(input);
    if (!apiPath) {
      return originalFetch(input, init);
    }

    const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    const existingHeaders = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));

    // Se ainda não tiver cabeçalhos de assinatura explícitos, assina automaticamente com a chave do dispositivo
    if (!existingHeaders.has("X-Synaptix-Signature")) {
      try {
        const signedHeaders = await buildSignedHeaders(method, apiPath);
        Object.entries(signedHeaders).forEach(([k, v]) => existingHeaders.set(k, v));
      } catch (err) {
        console.warn("Falha ao assinar requisição Zero-Trust:", err);
      }
    }

    const modifiedInit: RequestInit = {
      ...init,
      headers: existingHeaders,
      credentials: "include",
    };

    const response = await originalFetch(input, modifiedInit);

    // Se um endpoint protegido retornar 401, notifica o DeviceGuard para bloquear a interface
    if (
      response.status === 401 &&
      !apiPath.startsWith("/auth/") &&
      !apiPath.startsWith("/events")
    ) {
      window.dispatchEvent(new CustomEvent("synaptix:unauthorized"));
    }

    return response;
  };
}
