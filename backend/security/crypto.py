import os
import json
import base64
import secrets
import hashlib
import logging
from typing import Optional, List
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.asymmetric import ec, utils
from sqlalchemy.types import TypeDecorator, Text
import nh3

logger = logging.getLogger("synaptix.security.crypto")

ENC_TEXT_PREFIX = "enc:v1:"
ENC_FILE_MAGIC = b"SYNXENC1"

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE_PATH = os.path.join(BASE_DIR, ".env")


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _load_or_init_master_key() -> bytes:
    """
    Carrega a SYNAPTIX_MASTER_KEY do ambiente ou do arquivo .env.
    Caso ainda não exista, gera uma chave criptográfica de 256 bits de alta entropia
    e a persiste no .env local para garantir operação contínua e segura.
    """
    raw_key = os.environ.get("SYNAPTIX_MASTER_KEY")
    if not raw_key and os.path.exists(ENV_FILE_PATH):
        with open(ENV_FILE_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line_s = line.strip()
                if line_s.startswith("SYNAPTIX_MASTER_KEY="):
                    raw_key = line_s.split("=", 1)[1].strip().strip('"').strip("'")
                    break

    if not raw_key:
        generated_bytes = secrets.token_bytes(32)
        raw_key = _b64url_encode(generated_bytes)
        os.environ["SYNAPTIX_MASTER_KEY"] = raw_key
        try:
            with open(ENV_FILE_PATH, "a", encoding="utf-8") as f:
                f.write(f"\n# Chave Mestra de Criptografia em Repouso (AES-256-GCM) - NÃO COMPARTILHE\nSYNAPTIX_MASTER_KEY={raw_key}\n")
            logger.info("Nova SYNAPTIX_MASTER_KEY de 256 bits gerada e persistida com segurança.")
        except Exception as e:
            logger.warning(f"Não foi possível persistir SYNAPTIX_MASTER_KEY no .env: {e}")

    try:
        decoded = _b64url_decode(raw_key)
        if len(decoded) >= 32:
            return decoded[:32]
    except Exception:
        pass

    return hashlib.sha256(raw_key.encode("utf-8")).digest()


_MASTER_KEY = _load_or_init_master_key()


def _derive_subkey(context_info: bytes, length: int = 32) -> bytes:
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=length,
        salt=b"synaptix-zero-trust-salt-v1",
        info=context_info,
    )
    return hkdf.derive(_MASTER_KEY)


_DB_AES_KEY = _derive_subkey(b"synaptix-db-field-aead-v1", 32)
_FILE_AES_KEY = _derive_subkey(b"synaptix-file-vault-aead-v1", 32)
_JWT_SIGNING_KEY = _derive_subkey(b"synaptix-device-session-jwt-v1", 32)
_VEC_ISOMETRY_SEED = _derive_subkey(b"synaptix-vector-isometry-v1", 32)

# Domínio criptográfico EXCLUSIVO da Equipe (contextos HKDF distintos do domínio pessoal)
_TEAM_DB_AES_KEY = _derive_subkey(b"synaptix-team-db-field-aead-v1", 32)
_TEAM_FILE_AES_KEY = _derive_subkey(b"synaptix-team-file-vault-aead-v1", 32)
_TEAM_JWT_SIGNING_KEY = _derive_subkey(b"synaptix-team-member-jwt-v1", 32)

_db_aesgcm = AESGCM(_DB_AES_KEY)
_file_aesgcm = AESGCM(_FILE_AES_KEY)
_team_db_aesgcm = AESGCM(_TEAM_DB_AES_KEY)
_team_file_aesgcm = AESGCM(_TEAM_FILE_AES_KEY)


def get_jwt_signing_key() -> bytes:
    return _JWT_SIGNING_KEY


def get_team_jwt_signing_key() -> bytes:
    return _TEAM_JWT_SIGNING_KEY


# ==============================================================================
# 1. Criptografia Autenticada de Campos de Banco de Dados (AES-256-GCM)
# ==============================================================================
def is_encrypted_string(value: Optional[str]) -> bool:
    return isinstance(value, str) and value.startswith(ENC_TEXT_PREFIX)


def encrypt_string(plaintext: Optional[str]) -> Optional[str]:
    if plaintext is None:
        return None
    if not isinstance(plaintext, str):
        plaintext = str(plaintext)
    if is_encrypted_string(plaintext):
        return plaintext
    nonce = secrets.token_bytes(12)
    ciphertext = _db_aesgcm.encrypt(nonce, plaintext.encode("utf-8"), b"synaptix-db-v1")
    payload = _b64url_encode(nonce + ciphertext)
    return f"{ENC_TEXT_PREFIX}{payload}"


def decrypt_string(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        return value
    if not is_encrypted_string(value):
        # Compatibilidade segura durante leitura de registros pré-migração
        return value
    try:
        raw = _b64url_decode(value[len(ENC_TEXT_PREFIX):])
        nonce, ciphertext = raw[:12], raw[12:]
        plaintext_bytes = _db_aesgcm.decrypt(nonce, ciphertext, b"synaptix-db-v1")
        return plaintext_bytes.decode("utf-8")
    except Exception as e:
        logger.error(f"Falha ao descriptografar campo protegido no banco: {e}")
        return "[Conteúdo Criptografado - Chave Inválida]"


class EncryptedText(TypeDecorator):
    """
    Tipo SQLAlchemy que criptografa automaticamente strings com AES-256-GCM
    antes de gravar no SQLite e descriptografa ao carregar para a memória.
    """
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt_string(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return decrypt_string(value)


# ==============================================================================
# 2. Criptografia Isométrica de Embeddings Vetoriais (sqlite-vec)
# ==============================================================================
def _build_embedding_sign_mask(dim: int = 1536) -> List[float]:
    """
    Gera uma máscara determinística secreta de sinais (+1.0 / -1.0) derivada da
    chave mestra. Multiplicar um vetor por sinais +-1 é uma transformação ortogonal
    (isometria) que preserva 100% a distância Euclidiana (L2) e o produto interno
    no sqlite-vec, mas impede inversão do embedding caso o arquivo .db seja vazado.
    """
    mask: List[float] = []
    counter = 0
    while len(mask) < dim:
        digest = hashlib.sha256(_VEC_ISOMETRY_SEED + counter.to_bytes(4, "big")).digest()
        for byte in digest:
            for bit in range(8):
                if len(mask) >= dim:
                    break
                mask.append(1.0 if ((byte >> bit) & 1) else -1.0)
        counter += 1
    return mask


_EMBEDDING_MASK_1536 = _build_embedding_sign_mask(1536)


def protect_embedding_vector(embedding: List[float]) -> List[float]:
    if len(embedding) == 1536:
        return [val * sign for val, sign in zip(embedding, _EMBEDDING_MASK_1536)]
    mask = _build_embedding_sign_mask(len(embedding))
    return [val * sign for val, sign in zip(embedding, mask)]


# ==============================================================================
# 3. Criptografia Autenticada de Arquivos em Repouso (uploads/)
# ==============================================================================
def is_encrypted_bytes(data: bytes) -> bool:
    return data.startswith(ENC_FILE_MAGIC)


def encrypt_bytes(plaintext_bytes: bytes) -> bytes:
    if is_encrypted_bytes(plaintext_bytes):
        return plaintext_bytes
    nonce = secrets.token_bytes(12)
    ciphertext = _file_aesgcm.encrypt(nonce, plaintext_bytes, ENC_FILE_MAGIC)
    return ENC_FILE_MAGIC + nonce + ciphertext


def decrypt_bytes(encrypted_data: bytes) -> bytes:
    if not is_encrypted_bytes(encrypted_data):
        return encrypted_data
    header_len = len(ENC_FILE_MAGIC)
    nonce = encrypted_data[header_len:header_len + 12]
    ciphertext = encrypted_data[header_len + 12:]
    return _file_aesgcm.decrypt(nonce, ciphertext, ENC_FILE_MAGIC)


def encrypt_file_on_disk(file_path: str) -> bool:
    """Criptografa um arquivo existente em disco caso ainda esteja em texto plano."""
    if not os.path.exists(file_path):
        return False
    with open(file_path, "rb") as f:
        data = f.read()
    if is_encrypted_bytes(data):
        return False
    enc_data = encrypt_bytes(data)
    with open(file_path, "wb") as f:
        f.write(enc_data)
    return True


def read_decrypted_file(file_path: str) -> bytes:
    with open(file_path, "rb") as f:
        data = f.read()
    return decrypt_bytes(data)


# ==============================================================================
# 4. Identidade Criptográfica de Dispositivo (WebCrypto ECDSA P-256)
# ==============================================================================
def compute_public_key_fingerprint(public_key_jwk_json: str) -> str:
    """Calcula o fingerprint SHA-256 canônico da chave pública JWK P-256."""
    try:
        jwk = json.loads(public_key_jwk_json)
        canonical = json.dumps(
            {"crv": jwk.get("crv"), "kty": jwk.get("kty"), "x": jwk.get("x"), "y": jwk.get("y")},
            sort_keys=True,
            separators=(",", ":"),
        )
    except Exception:
        canonical = public_key_jwk_json.strip()
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return digest


def compute_sas_code(enrollment_token: str, public_key_jwk_json: str) -> str:
    """
    Gera um Código de Autenticação Curto (SAS) de 6 dígitos (ex: '482-917')
    derivado do token de pareamento e da chave pública do novo dispositivo.
    """
    fp = compute_public_key_fingerprint(public_key_jwk_json)
    combined = f"synaptix-sas-v1:{enrollment_token.strip()}:{fp}".encode("utf-8")
    digest = hashlib.sha256(combined).digest()
    num = int.from_bytes(digest[:4], "big") % 1000000
    formatted = f"{num:06d}"
    return f"{formatted[:3]}-{formatted[3:]}"


def _jwk_to_ec_public_key(public_key_jwk_json: str) -> ec.EllipticCurvePublicKey:
    jwk = json.loads(public_key_jwk_json)
    if jwk.get("kty") != "EC" or jwk.get("crv") != "P-256":
        raise ValueError("Chave pública inválida: esperado EC P-256 JWK.")
    x_bytes = _b64url_decode(jwk["x"])
    y_bytes = _b64url_decode(jwk["y"])
    x_int = int.from_bytes(x_bytes, "big")
    y_int = int.from_bytes(y_bytes, "big")
    public_numbers = ec.EllipticCurvePublicNumbers(x_int, y_int, ec.SECP256R1())
    return public_numbers.public_key()


def verify_device_signature(
    public_key_jwk_json: str,
    signature_b64url: str,
    payload_str: str,
) -> bool:
    """
    Verifica uma assinatura ECDSA P-256 (SHA-256) gerada pela WebCrypto API do navegador.
    Converte automaticamente o formato IEEE P1363 (r || s de 64 bytes da WebCrypto)
    para ASN.1 DER esperado pelo OpenSSL/cryptography.
    """
    try:
        pub_key = _jwk_to_ec_public_key(public_key_jwk_json)
        raw_sig = _b64url_decode(signature_b64url)
        if len(raw_sig) == 64:
            r = int.from_bytes(raw_sig[:32], "big")
            s = int.from_bytes(raw_sig[32:], "big")
            der_sig = utils.encode_dss_signature(r, s)
        else:
            der_sig = raw_sig

        pub_key.verify(
            der_sig,
            payload_str.encode("utf-8"),
            ec.ECDSA(hashes.SHA256()),
        )
        return True
    except Exception as e:
        logger.warning(f"Falha na verificação criptográfica da assinatura do dispositivo: {e}")
        return False


# ==============================================================================
# 4b. Domínio Criptográfico da Equipe (campos, arquivos e senhas dos liderados)
# ==============================================================================
TEAM_ENC_TEXT_PREFIX = "enc:team:v1:"
TEAM_ENC_FILE_MAGIC = b"SYNXTEAM1"


def is_team_encrypted_string(value: Optional[str]) -> bool:
    return isinstance(value, str) and value.startswith(TEAM_ENC_TEXT_PREFIX)


def encrypt_team_string(plaintext: Optional[str]) -> Optional[str]:
    if plaintext is None:
        return None
    if not isinstance(plaintext, str):
        plaintext = str(plaintext)
    if is_team_encrypted_string(plaintext):
        return plaintext
    nonce = secrets.token_bytes(12)
    ciphertext = _team_db_aesgcm.encrypt(nonce, plaintext.encode("utf-8"), b"synaptix-team-db-v1")
    return f"{TEAM_ENC_TEXT_PREFIX}{_b64url_encode(nonce + ciphertext)}"


def decrypt_team_string(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    if not isinstance(value, str):
        return value
    if not is_team_encrypted_string(value):
        return value
    try:
        raw = _b64url_decode(value[len(TEAM_ENC_TEXT_PREFIX):])
        nonce, ciphertext = raw[:12], raw[12:]
        return _team_db_aesgcm.decrypt(nonce, ciphertext, b"synaptix-team-db-v1").decode("utf-8")
    except Exception as e:
        logger.error(f"Falha ao descriptografar campo protegido da equipe: {e}")
        return "[Conteúdo Criptografado - Chave Inválida]"


class TeamEncryptedText(TypeDecorator):
    """Igual a EncryptedText, porém com chave/AAD/prefixo do domínio da Equipe."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return encrypt_team_string(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return decrypt_team_string(value)


def encrypt_team_bytes(plaintext_bytes: bytes) -> bytes:
    nonce = secrets.token_bytes(12)
    ciphertext = _team_file_aesgcm.encrypt(nonce, plaintext_bytes, TEAM_ENC_FILE_MAGIC)
    return TEAM_ENC_FILE_MAGIC + nonce + ciphertext


def read_decrypted_team_file(file_path: str) -> bytes:
    with open(file_path, "rb") as f:
        data = f.read()
    if not data.startswith(TEAM_ENC_FILE_MAGIC):
        raise ValueError("Arquivo da equipe não está no formato criptografado esperado.")
    header_len = len(TEAM_ENC_FILE_MAGIC)
    nonce = data[header_len:header_len + 12]
    return _team_file_aesgcm.decrypt(nonce, data[header_len + 12:], TEAM_ENC_FILE_MAGIC)


_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2 ** 14, 8, 1


def hash_team_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64url_encode(salt)}${_b64url_encode(dk)}"


def verify_team_password(password: str, stored_hash: Optional[str]) -> bool:
    try:
        scheme, n, r, p, salt_b64, dk_b64 = (stored_hash or "").split("$")
        if scheme != "scrypt":
            return False
        expected = _b64url_decode(dk_b64)
        dk = hashlib.scrypt(
            password.encode("utf-8"), salt=_b64url_decode(salt_b64),
            n=int(n), r=int(r), p=int(p), dklen=len(expected),
        )
        return secrets.compare_digest(dk, expected)
    except Exception:
        return False


def hash_password(password: str) -> str:
    """Gera hash scrypt seguro com salt único para proteção de cadernos e notas."""
    return hash_team_password(password)


def verify_password(password: str, stored_hash: Optional[str]) -> bool:
    """Verifica senha com comparação de tempo constante contra timing attacks."""
    return verify_team_password(password, stored_hash)



# ==============================================================================
# 5. Sanitização HTML Anti-XSS (nh3)
# ==============================================================================
ALLOWED_HTML_TAGS = {
    "p", "br", "strong", "b", "em", "i", "u", "s", "strike", "del",
    "code", "pre", "blockquote", "ul", "ol", "li",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tr", "th", "td",
    "mark", "span", "a", "hr", "div", "label", "input",
    "img", "figure", "figcaption",
}

ALLOWED_HTML_ATTRIBUTES = {
    "*": {"class", "data-type", "data-id", "data-label", "data-checked", "style"},
    "mark": {"data-comment-id", "class"},
    "a": {"href", "target", "title", "class"},
    "img": {"src", "alt", "title", "width", "height", "data-align", "data-width", "style", "class"},
    "input": {"type", "checked", "disabled"},
    "td": {"colspan", "rowspan", "colwidth"},
    "th": {"colspan", "rowspan", "colwidth"},
}


def sanitize_html_content(content: Optional[str]) -> Optional[str]:
    """Remove qualquer script, iframe ou vetor XSS preservando marcações legítimas do TipTap."""
    if not content:
        return content
    return nh3.clean(
        content,
        tags=ALLOWED_HTML_TAGS,
        attributes=ALLOWED_HTML_ATTRIBUTES,
        url_schemes={"http", "https", "mailto", "data"},
    )
