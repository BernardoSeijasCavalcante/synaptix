/**
 * Cliente de Autenticação e Segurança Criptográfica para Membros da Equipe (Zero-Trust Team Portal).
 * - Utiliza cofre IndexedDB isolado ("SynaptixTeamVault") para a chave privada ECDSA P-256 do liderado.
 * - Assina digitalmente todas as requisições para /team-portal/* e /team-auth/*.
 * - Mantém o token JWT e credenciais de membros 100% isolados do cofre do Líder.
 */

const TEAM_DB_NAME = "SynaptixTeamVault";
const TEAM_DB_VERSION = 1;
const TEAM_STORE_NAME = "team_device_identity";
const TEAM_IDENTITY_KEY = "member_device";

const TOKEN_KEY = "synaptix_team_jwt";
const MEMBER_INFO_KEY = "synaptix_team_member_info";
const DEVICE_ID_KEY = "synaptix_team_device_id";

export interface TeamMemberInfo {
  id: number;
  username: string;
  full_name: string;
  role: string;
  must_change_password?: boolean;
}

export interface StoredTeamDeviceIdentity {
  deviceId: string | null;
  deviceName: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  publicKeyJwk: string;
  createdAt: string;
}

let cachedIdentity: StoredTeamDeviceIdentity | null = null;
let cachedIdentityKey: string | null = null;

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

export function getTeamToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setTeamToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getStoredTeamDeviceId(): string | null {
  return localStorage.getItem(DEVICE_ID_KEY);
}

export function setStoredTeamDeviceId(deviceId: string | null): void {
  if (deviceId) {
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  } else {
    localStorage.removeItem(DEVICE_ID_KEY);
  }
}

export function getStoredTeamMember(): TeamMemberInfo | null {
  const raw = localStorage.getItem(MEMBER_INFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredTeamMember(member: TeamMemberInfo | null): void {
  if (member) {
    localStorage.setItem(MEMBER_INFO_KEY, JSON.stringify(member));
  } else {
    localStorage.removeItem(MEMBER_INFO_KEY);
  }
}

export function getJwtClaims(): { sub?: string; username?: string; did?: string; exp?: number } | null {
  const token = getTeamToken();
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length >= 2) {
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(
        atob(b64)
          .split("")
          .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      return JSON.parse(json);
    }
  } catch {
    return null;
  }
  return null;
}

function getStorageKey(username?: string): string {
  const effectiveUsername = username || getStoredTeamMember()?.username || getJwtClaims()?.username;
  if (effectiveUsername && effectiveUsername.trim()) {
    return `${TEAM_IDENTITY_KEY}_${effectiveUsername.trim().toLowerCase()}`;
  }
  return TEAM_IDENTITY_KEY;
}

function openTeamVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(TEAM_DB_NAME, TEAM_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TEAM_STORE_NAME)) {
        db.createObjectStore(TEAM_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIdentityFromDB(storageKey = TEAM_IDENTITY_KEY): Promise<StoredTeamDeviceIdentity | null> {
  try {
    const db = await openTeamVaultDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TEAM_STORE_NAME, "readonly");
      const store = tx.objectStore(TEAM_STORE_NAME);
      const req = store.get(storageKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function writeIdentityToDB(identity: StoredTeamDeviceIdentity, storageKey = TEAM_IDENTITY_KEY): Promise<void> {
  const db = await openTeamVaultDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TEAM_STORE_NAME, "readwrite");
    const store = tx.objectStore(TEAM_STORE_NAME);
    const req = store.put(identity, storageKey);
    req.onsuccess = () => {
      cachedIdentity = identity;
      cachedIdentityKey = storageKey;
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getOrCreateTeamDeviceIdentity(usernameOrPreferredName?: string, preferredName?: string): Promise<StoredTeamDeviceIdentity> {
  let username: string | undefined = undefined;
  let devName: string | undefined = preferredName;
  if (preferredName !== undefined) {
    username = usernameOrPreferredName;
    devName = preferredName;
  } else if (usernameOrPreferredName && (usernameOrPreferredName.includes('.') || usernameOrPreferredName.includes('@') || !usernameOrPreferredName.includes(' '))) {
    username = usernameOrPreferredName;
  } else {
    devName = usernameOrPreferredName;
  }

  if (!username) {
    username = getStoredTeamMember()?.username || getJwtClaims()?.username;
  }

  const storageKey = getStorageKey(username);

  if (cachedIdentity && cachedIdentityKey === storageKey) {
    if (devName && devName !== cachedIdentity.deviceName) {
      cachedIdentity.deviceName = devName;
      await writeIdentityToDB(cachedIdentity, storageKey);
    }
    const knownDeviceId = getStoredTeamDeviceId() || getJwtClaims()?.did;
    if (!cachedIdentity.deviceId && knownDeviceId) {
      cachedIdentity.deviceId = knownDeviceId;
      await writeIdentityToDB(cachedIdentity, storageKey);
    }
    return cachedIdentity;
  }

  let existing = await readIdentityFromDB(storageKey);
  // Se não encontrar para a chave específica do usuário, verifica se há uma identidade no fallback genérico
  if (!existing && storageKey !== TEAM_IDENTITY_KEY) {
    const generic = await readIdentityFromDB(TEAM_IDENTITY_KEY);
    if (generic && generic.privateKey && generic.publicKeyJwk) {
      existing = generic;
      await writeIdentityToDB(existing, storageKey);
    }
  }

  if (existing && existing.privateKey && existing.publicKeyJwk) {
    if (devName && devName !== existing.deviceName) {
      existing.deviceName = devName;
    }
    const knownDeviceId = getStoredTeamDeviceId() || getJwtClaims()?.did;
    if (!existing.deviceId && knownDeviceId) {
      existing.deviceId = knownDeviceId;
    }
    await writeIdentityToDB(existing, storageKey);
    cachedIdentity = existing;
    cachedIdentityKey = storageKey;
    return existing;
  }

  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256",
    },
    false,
    ["sign"]
  );

  const exportedPublicJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const jwkString = JSON.stringify(exportedPublicJwk);

  const fallbackName = `Dispositivo Liderado (${navigator.platform || "Web"})`;
  const knownDeviceId = getStoredTeamDeviceId() || getJwtClaims()?.did;
  const newIdentity: StoredTeamDeviceIdentity = {
    deviceId: knownDeviceId || null,
    deviceName: devName || fallbackName,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyJwk: jwkString,
    createdAt: new Date().toISOString(),
  };

  await writeIdentityToDB(newIdentity, storageKey);
  cachedIdentity = newIdentity;
  cachedIdentityKey = storageKey;
  return newIdentity;
}

export async function setTeamDeviceId(deviceId: string, username?: string): Promise<void> {
  setStoredTeamDeviceId(deviceId);
  const identity = await getOrCreateTeamDeviceIdentity(username);
  identity.deviceId = deviceId;
  const storageKey = getStorageKey(username);
  await writeIdentityToDB(identity, storageKey);
}

export async function buildTeamSignedHeaders(method: string, path: string): Promise<Record<string, string>> {
  const member = getStoredTeamMember();
  const username = member?.username || getJwtClaims()?.username;
  const identity = await getOrCreateTeamDeviceIdentity(username);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomHexNonce(16);

  const tokenDid = getJwtClaims()?.did;
  const storedDid = getStoredTeamDeviceId();
  const activeDeviceId = identity.deviceId || storedDid || tokenDid || "pending-enrollment";

  if (!identity.deviceId && activeDeviceId !== "pending-enrollment") {
    identity.deviceId = activeDeviceId;
    await writeIdentityToDB(identity, getStorageKey(username));
  }

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
    "X-Synaptix-Team-Device-Id": activeDeviceId,
    "X-Synaptix-Team-Timestamp": timestamp,
    "X-Synaptix-Team-Nonce": nonce,
    "X-Synaptix-Team-Signature": bufferToBase64Url(signatureBuffer),
    "X-Synaptix-Team-Public-Key-Jwk": identity.publicKeyJwk,
    "X-Synaptix-Team-Device-Name": encodeURIComponent(identity.deviceName || "Dispositivo Liderado"),
  };

  const token = getTeamToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return headers;
}

export async function teamFetch(input: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const urlObj = new URL(input, window.location.origin);
  const path = urlObj.pathname;

  const signedHeaders = await buildTeamSignedHeaders(method, path);
  const existingHeaders = new Headers(init?.headers);

  Object.entries(signedHeaders).forEach(([k, v]) => {
    existingHeaders.set(k, v);
  });

  const modifiedInit: RequestInit = {
    ...init,
    headers: existingHeaders,
    credentials: init?.credentials || "include",
  };

  const response = await fetch(input, modifiedInit);

  if (response.status === 401 && !path.startsWith("/team-auth/login")) {
    setTeamToken(null);
    setStoredTeamMember(null);
    setStoredTeamDeviceId(null);
    window.dispatchEvent(new CustomEvent("synaptix:team-unauthorized"));
  }

  return response;
}

export async function teamLogin(username: string, password: string, deviceName?: string): Promise<{
  success: boolean;
  pending_approval?: boolean;
  message?: string;
  member?: TeamMemberInfo;
}> {
  const cleanUsername = username.trim().toLowerCase();
  const identity = await getOrCreateTeamDeviceIdentity(cleanUsername, deviceName);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomHexNonce(8);
  const canonical = `team-login:${cleanUsername}:${timestamp}:${nonce}`;
  const encoder = new TextEncoder();

  const sigBuf = await window.crypto.subtle.sign(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    identity.privateKey,
    encoder.encode(canonical)
  );
  const signature = bufferToBase64Url(sigBuf);

  const body = {
    username: cleanUsername,
    password,
    device_name: identity.deviceName,
    public_key_jwk: identity.publicKeyJwk,
    timestamp,
    nonce,
    signature,
  };

  const res = await teamFetch("/team-auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    let msg = "Falha na autenticação.";
    if (data) {
      if (typeof data.detail === "string") {
        msg = data.detail;
      } else if (Array.isArray(data.detail)) {
        msg = data.detail
          .map((e: any) => {
            const f = e.loc ? e.loc[e.loc.length - 1] : "campo";
            return `${f}: ${e.msg}`;
          })
          .join("; ");
      } else if (typeof data.message === "string") {
        msg = data.message;
      }
    }
    return {
      success: false,
      message: msg,
    };
  }

  if (data?.status === "pending_approval") {
    if (data.device_id) {
      setStoredTeamDeviceId(data.device_id);
      await setTeamDeviceId(data.device_id, cleanUsername);
    }
    return {
      success: false,
      pending_approval: true,
      message: typeof data.message === "string" ? data.message : "Dispositivo registrado! Aguarde aprovação do Líder para prosseguir.",
    };
  }

  if (data?.status === "approved" || data?.token) {
    if (data.token) {
      setTeamToken(data.token);
    } else {
      setTeamToken("session-cookie");
    }
    if (data.device_id) {
      setStoredTeamDeviceId(data.device_id);
      await setTeamDeviceId(data.device_id, cleanUsername);
    }
    const member: TeamMemberInfo = {
      id: data.member_id || data.member?.id || 0,
      username: data.username || data.member?.username || cleanUsername,
      full_name: data.full_name || data.member?.display_name || cleanUsername,
      role: data.role || data.member?.role_title || "Membro",
      must_change_password: Boolean(data.must_change_password),
    };
    setStoredTeamMember(member);
    return {
      success: true,
      member,
    };
  }

  return { success: false, message: "Resposta de autenticação desconhecida." };
}

export async function teamLogout(): Promise<void> {
  try {
    await teamFetch("/team-auth/logout", { method: "POST" });
  } catch {
    // Silencia erros de rede no logout
  } finally {
    cachedIdentity = null;
    cachedIdentityKey = null;
    setTeamToken(null);
    setStoredTeamMember(null);
    setStoredTeamDeviceId(null);
  }
}
