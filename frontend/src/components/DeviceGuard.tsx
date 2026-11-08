import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Smartphone,
  Lock,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Fingerprint,
} from "lucide-react";
import {
  getOrCreateDeviceIdentity,
  bindDeviceIdToIdentity,
  buildSignedHeaders,
  getDefaultDeviceName,
} from "../security/deviceCrypto";

export interface AuthorizedDeviceInfo {
  id: string;
  device_name: string;
  fingerprint_sha256: string;
  is_genesis: boolean;
}

interface DeviceGuardProps {
  children: (deviceInfo: AuthorizedDeviceInfo, onRefreshSecurity: () => void) => React.ReactNode;
}

export const DeviceGuard: React.FC<DeviceGuardProps> = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<AuthorizedDeviceInfo | null>(null);

  // Form states
  const [deviceName, setDeviceName] = useState(getDefaultDeviceName());
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Pending enrollment state (for new device waiting SAS approval)
  const [pendingEnrollment, setPendingEnrollment] = useState<{
    enrollmentId: string;
    sasCode: string;
    candidateDeviceId: string;
    status: string;
  } | null>(null);

  const checkSecurityStatus = useCallback(async () => {
    setChecking(true);
    setErrorMessage(null);
    try {
      const identity = await getOrCreateDeviceIdentity();
      let signedHeaders: Record<string, string> = {};
      try {
        if (identity.deviceId) {
          signedHeaders = await buildSignedHeaders("GET", "/auth/status", identity.deviceId);
        }
      } catch {
        // Sem assinatura se ainda não possuir deviceId vinculado
      }

      const res = await fetch("/auth/status", {
        headers: {
          ...signedHeaders,
          "X-Synaptix-Public-Key-Jwk": identity.publicKeyJwk,
          "X-Synaptix-Device-Name": encodeURIComponent(identity.deviceName || getDefaultDeviceName()),
        },
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error("Não foi possível verificar o status de segurança do servidor.");
      }
      const data = await res.json();
      setAuthorized(Boolean(data.authorized));
      setBootstrapRequired(Boolean(data.bootstrap_required));
      setDeviceInfo(data.device || null);
      if (data.authorized && data.device && data.device.id) {
        await bindDeviceIdToIdentity(data.device.id, data.device.device_name);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Erro de comunicação com o servidor Zero-Trust.");
      setAuthorized(false);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkSecurityStatus();

    const handleUnauthorized = () => {
      setAuthorized(false);
      setDeviceInfo(null);
      checkSecurityStatus();
    };
    window.addEventListener("synaptix:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("synaptix:unauthorized", handleUnauthorized);
  }, [checkSecurityStatus]);

  // Poll enrollment status when awaiting approval from an authorized device
  useEffect(() => {
    if (!pendingEnrollment || pendingEnrollment.status !== "awaiting_approval") return;

    const interval = setInterval(async () => {
      try {
        const pollPath = `/auth/enrollments/${pendingEnrollment.enrollmentId}/poll`;
        const signedHeaders = await buildSignedHeaders(
          "GET",
          pollPath,
          pendingEnrollment.candidateDeviceId
        );
        const res = await fetch(pollPath, {
          method: "GET",
          headers: signedHeaders,
        });
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "approved" && data.device_id) {
          await bindDeviceIdToIdentity(data.device_id, deviceName.trim());
          setPendingEnrollment(null);
          await checkSecurityStatus();
        } else if (data.status === "rejected" || data.status === "expired") {
          setPendingEnrollment((prev) => (prev ? { ...prev, status: data.status } : null));
        }
      } catch {
        // Silencioso durante polling
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [pendingEnrollment, deviceName, checkSecurityStatus]);

  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bootstrapToken.trim() || !deviceName.trim()) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const identity = await getOrCreateDeviceIdentity(deviceName.trim());
      const res = await fetch("/auth/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          bootstrap_token: bootstrapToken.trim(),
          device_name: deviceName.trim(),
          public_key_jwk: identity.publicKeyJwk,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Falha ao ativar o Dispositivo Gênesis.");
      }

      await bindDeviceIdToIdentity(data.device_id, data.device_name);
      setAuthorized(true);
      setDeviceInfo({
        id: data.device_id,
        device_name: data.device_name || deviceName.trim(),
        fingerprint_sha256: data.fingerprint_sha256 || "",
        is_genesis: true,
      });
      await checkSecurityStatus();
    } catch (err: any) {
      setErrorMessage(err?.message || "Erro ao registrar Dispositivo Gênesis.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaimEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollmentCode.trim() || !deviceName.trim()) return;

    setSubmitting(true);
    setErrorMessage(null);
    try {
      const identity = await getOrCreateDeviceIdentity(deviceName.trim());
      const res = await fetch("/auth/enrollments/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          enrollment_code: enrollmentCode.trim().toUpperCase(),
          device_name: deviceName.trim(),
          public_key_jwk: identity.publicKeyJwk,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Código de pareamento inválido ou expirado.");
      }

      await bindDeviceIdToIdentity(data.device_id, deviceName.trim());
      if (data.status === "approved") {
        setAuthorized(true);
        setDeviceInfo({
          id: data.device_id,
          device_name: deviceName.trim(),
          fingerprint_sha256: data.candidate_fingerprint || "",
          is_genesis: false,
        });
        await checkSecurityStatus();
        return;
      }
      setPendingEnrollment({
        enrollmentId: data.enrollment_id,
        sasCode: data.sas_code || "---",
        candidateDeviceId: data.device_id,
        status: data.status,
      });
    } catch (err: any) {
      setErrorMessage(err?.message || "Erro ao solicitar pareamento de dispositivo.");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-[#070c1b] text-slate-100 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(234,179,8,0.2)]">
            <Loader2 size={28} className="text-amber-400 animate-spin" />
          </div>
          <p className="text-sm text-slate-300 font-medium tracking-wide">
            Verificando assinatura criptográfica do dispositivo...
          </p>
        </div>
      </div>
    );
  }

  if (authorized && deviceInfo) {
    return <>{children(deviceInfo, checkSecurityStatus)}</>;
  }

  return (
    <div className="min-h-screen bg-[#070c1b] text-slate-100 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Ambient Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-[15%] -left-[10%] w-[55vw] h-[55vw] max-w-[650px] max-h-[650px] rounded-full bg-blue-600/15 blur-[130px]" />
        <div className="absolute top-[5%] right-[10%] w-[45vw] h-[45vw] max-w-[550px] max-h-[550px] rounded-full bg-amber-500/10 blur-[150px]" />
        <div className="absolute -bottom-[10%] right-[-5%] w-[50vw] h-[50vw] max-w-[600px] max-h-[600px] rounded-full bg-purple-600/15 blur-[140px]" />
      </div>

      <div className="w-full max-w-lg rounded-3xl bg-slate-900/75 border border-white/10 backdrop-blur-2xl p-6 sm:p-8 shadow-[0_25px_70px_rgba(0,0,0,0.65)]">
        {/* Header */}
        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400/20 via-amber-500/10 to-transparent border border-amber-500/40 flex items-center justify-center shadow-[0_0_20px_rgba(234,179,8,0.25)]">
            {bootstrapRequired ? (
              <KeyRound size={24} className="text-amber-400" />
            ) : (
              <ShieldAlert size={24} className="text-amber-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold bg-gradient-to-r from-yellow-200 via-amber-300 to-amber-500 bg-clip-text text-transparent">
                Synaptix Zero-Trust
              </h1>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                ECDSA P-256
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {bootstrapRequired
                ? "Ativação Criptográfica do 1º Dispositivo (Gênesis)"
                : "Acesso exclusivo para dispositivos criptograficamente autorizados"}
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-5 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start gap-2.5">
            <XCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {bootstrapRequired ? (
          /* MODO BOOTSTRAP (1º DISPOSITIVO GÊNESIS) */
          <form onSubmit={handleBootstrapSubmit} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs text-amber-200/90 leading-relaxed">
              <strong className="text-amber-300 block mb-1">
                Configuração Inicial de Segurança:
              </strong>
              Nenhum dispositivo foi autorizado ainda. Insira o{" "}
              <code className="px-1.5 py-0.5 rounded bg-slate-950/70 text-amber-300 font-mono">
                TOKEN DE BOOTSTRAP
              </code>{" "}
              gerado no console do servidor (ou no arquivo{" "}
              <code className="text-amber-300 font-mono">backend/BOOTSTRAP_DEVICE_TOKEN.txt</code>)
              para registrar este computador como o <strong>Dispositivo Gênesis</strong>. Após este
              passo, somente este dispositivo poderá autorizar novos acessos.
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-100 mb-1.5 flex items-center justify-between">
                <span>Nome deste Dispositivo</span>
                <span className="text-[11px] font-normal text-slate-400">Identificação visual</span>
              </label>
              <input
                type="text"
                required
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Ex: PC Principal - Escritório"
                className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition-all shadow-inner font-medium bg-[#070d22] text-white placeholder:text-slate-400"
                style={{
                  backgroundColor: '#070d22',
                  color: '#ffffff',
                  borderColor: 'rgba(234, 179, 8, 0.5)',
                  caretColor: '#facc15',
                  colorScheme: 'dark',
                  fontSize: '14px',
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-100 mb-1.5 flex items-center justify-between">
                <span>Token de Bootstrap de Uso Único</span>
                <span className="text-[11px] font-normal text-amber-300">backend/BOOTSTRAP_DEVICE_TOKEN.txt</span>
              </label>
              <input
                type="text"
                required
                value={bootstrapToken}
                onChange={(e) => setBootstrapToken(e.target.value)}
                placeholder="SYNX-XXXX-XXXX-XXXX-XXXX"
                className="w-full px-4 py-3 rounded-xl border text-sm font-mono tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition-all shadow-inner font-bold bg-[#070d22] text-amber-200 placeholder:text-slate-500"
                style={{
                  backgroundColor: '#070d22',
                  color: '#fef08a',
                  borderColor: 'rgba(234, 179, 8, 0.6)',
                  caretColor: '#facc15',
                  colorScheme: 'dark',
                  fontSize: '14px',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-xl font-black text-sm shadow-xl shadow-amber-500/25 hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              style={{
                backgroundColor: '#eab308',
                color: '#020617',
              }}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin text-slate-950" />
                  <span className="text-slate-950 font-black">Gerando Chave Não-Exportável...</span>
                </>
              ) : (
                <>
                  <ShieldCheck size={18} className="text-slate-950" />
                  <span className="text-slate-950 font-black">Registrar Dispositivo Gênesis e Bloquear Bootstrap</span>
                </>
              )}
            </button>
          </form>
        ) : pendingEnrollment ? (
          /* TELA DE AGUARDO DE CONFIRMAÇÃO SAS DE 6 DÍGITOS */
          <div className="space-y-5 text-center py-2">
            {pendingEnrollment.status === "awaiting_approval" ? (
              <>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold">
                  <Loader2 size={13} className="animate-spin" />
                  <span>Aguardando Aprovação no Dispositivo Autorizado</span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed">
                  No seu dispositivo já autorizado, confira se o{" "}
                  <strong>Código de Segurança Visual (SAS)</strong> abaixo é idêntico e clique em{" "}
                  <strong>Aprovar Dispositivo</strong>:
                </p>

                <div className="py-5 px-6 rounded-2xl bg-slate-950/90 border border-amber-500/40 shadow-[0_0_30px_rgba(234,179,8,0.15)]">
                  <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-1 flex items-center justify-center gap-1.5">
                    <Fingerprint size={13} className="text-amber-400" />
                    <span>Código SAS Anti-Interceptação</span>
                  </div>
                  <div className="text-3xl sm:text-4xl font-mono font-black tracking-[0.25em] text-amber-300">
                    {pendingEnrollment.sasCode}
                  </div>
                </div>

                <p className="text-[11px] text-slate-400">
                  Esta tela será liberada automaticamente assim que a aprovação for assinada.
                </p>

                <button
                  type="button"
                  onClick={() => setPendingEnrollment(null)}
                  className="text-xs text-slate-400 hover:text-slate-200 underline"
                >
                  Cancelar e tentar outro código
                </button>
              </>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs">
                  {pendingEnrollment.status === "rejected"
                    ? "O pedido de pareamento foi rejeitado pelo dispositivo autorizado."
                    : "O tempo limite de 3 minutos do pedido de pareamento expirou."}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPendingEnrollment(null);
                    setEnrollmentCode("");
                  }}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold"
                >
                  Tentar Novamente
                </button>
              </div>
            )}
          </div>
        ) : (
          /* MODO PAREAMENTO DE NOVO DISPOSITIVO */
          <form onSubmit={handleClaimEnrollment} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/10 text-xs text-slate-300 leading-relaxed flex items-start gap-3">
              <Lock size={18} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                Este dispositivo não possui autorização ativa. Para autorizá-lo, abra o{" "}
                <strong>Synaptix em um dispositivo já autorizado</strong>, clique em{" "}
                <span className="text-amber-300 font-semibold">Dispositivos</span> na barra superior
                e gere um <strong>Código de Pareamento Efêmero</strong>.
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-100 mb-1.5 flex items-center justify-between">
                <span>Identificação deste Novo Dispositivo</span>
                <span className="text-[11px] font-normal text-slate-400">Ex: Smartphone ou Notebook</span>
              </label>
              <input
                type="text"
                required
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Ex: Smartphone Pessoal / Notebook Casa"
                className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition-all shadow-inner font-medium bg-[#070d22] text-white placeholder:text-slate-400"
                style={{
                  backgroundColor: '#070d22',
                  color: '#ffffff',
                  borderColor: 'rgba(234, 179, 8, 0.5)',
                  caretColor: '#facc15',
                  colorScheme: 'dark',
                  fontSize: '14px',
                }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-100 mb-1.5 flex items-center justify-between">
                <span>Código de Pareamento Efêmero</span>
                <span className="text-[11px] font-normal text-amber-300">Gerado no Dispositivo Autorizado</span>
              </label>
              <input
                type="text"
                required
                value={enrollmentCode}
                onChange={(e) => setEnrollmentCode(e.target.value)}
                placeholder="PAIR-XXXX-XXXX-XXXX"
                className="w-full px-4 py-3 rounded-xl border text-sm font-mono tracking-wider uppercase focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition-all shadow-inner font-bold bg-[#070d22] text-amber-200 placeholder:text-slate-500"
                style={{
                  backgroundColor: '#070d22',
                  color: '#fef08a',
                  borderColor: 'rgba(234, 179, 8, 0.6)',
                  caretColor: '#facc15',
                  colorScheme: 'dark',
                  fontSize: '14px',
                }}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3.5 rounded-xl font-black text-sm shadow-xl shadow-amber-500/25 hover:brightness-110 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                style={{
                  backgroundColor: '#eab308',
                  color: '#020617',
                }}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-slate-950" />
                    <span className="text-slate-950 font-black">Iniciando Handshake...</span>
                  </>
                ) : (
                  <>
                    <Smartphone size={17} className="text-slate-950" />
                    <span className="text-slate-950 font-black">Solicitar Autorização</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={checkSecurityStatus}
                title="Verificar novamente"
                className="px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-200 transition-colors flex items-center justify-center"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={12} className="text-emerald-400" />
            Dados em repouso: AES-256-GCM
          </span>
          <span>Assinatura por requisição: ECDSA P-256</span>
        </div>
      </div>
    </div>
  );
};
