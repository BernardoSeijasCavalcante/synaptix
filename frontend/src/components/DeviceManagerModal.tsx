import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Plus,
  Copy,
  Check,
  X,
  Trash2,
  Smartphone,
  Laptop,
  AlertTriangle,
  History,
  KeyRound,
  CheckCircle2,
  XCircle,
  RefreshCw,
} from "lucide-react";
import type { AuthorizedDeviceInfo } from "./DeviceGuard";
import { formatEventTimestamp } from "../security/eventTracker";

interface DeviceRecord {
  id: string;
  device_name: string;
  fingerprint_sha256: string;
  is_genesis: boolean;
  approved_by_device_id: string | null;
  last_ip: string | null;
  last_seen_at: string;
  is_revoked: boolean;
  created_at: string;
}

interface PendingEnrollment {
  enrollment_id: string;
  status: string;
  sas_code: string | null;
  candidate_device_name: string | null;
  candidate_fingerprint: string | null;
  candidate_ip: string | null;
  expires_at: string;
  device_id: string | null;
}

interface AuditLogEntry {
  id: number;
  event_type: string;
  device_id: string | null;
  ip_address: string | null;
  details: string | null;
  created_at: string;
}

interface DeviceManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDevice: AuthorizedDeviceInfo;
  onPendingCountChange?: (count: number) => void;
}

export const DeviceManagerModal: React.FC<DeviceManagerModalProps> = ({
  isOpen,
  onClose,
  currentDevice,
  onPendingCountChange,
}) => {
  const [activeTab, setActiveTab] = useState<"devices" | "pair" | "audit">("devices");
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [pendingEnrollments, setPendingEnrollments] = useState<PendingEnrollment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Invite creation state
  const [generatedInvite, setGeneratedInvite] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchSecurityData = useCallback(async () => {
    try {
      const [devRes, pendRes] = await Promise.all([
        fetch("/auth/devices"),
        fetch("/auth/enrollments/pending"),
      ]);
      if (devRes.ok) {
        setDevices(await devRes.json());
      }
      if (pendRes.ok) {
        const pendData: PendingEnrollment[] = await pendRes.json();
        setPendingEnrollments(pendData);
        const awaitingApprovalCount = pendData.filter(
          (p) => p.status === "awaiting_approval"
        ).length;
        onPendingCountChange?.(awaitingApprovalCount);
      }
    } catch {
      // Silencioso em background
    }
  }, [onPendingCountChange]);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const res = await fetch("/auth/audit-logs?limit=50");
      if (res.ok) {
        setAuditLogs(await res.json());
      }
    } catch {
      // Silencioso
    }
  }, []);

  useEffect(() => {
    fetchSecurityData();
    const interval = setInterval(fetchSecurityData, 5000);
    return () => clearInterval(interval);
  }, [fetchSecurityData]);

  useEffect(() => {
    if (isOpen) {
      fetchSecurityData();
      if (activeTab === "audit") {
        fetchAuditLogs();
      }
    }
  }, [isOpen, activeTab, fetchSecurityData, fetchAuditLogs]);

  if (!isOpen) return null;

  const handleGenerateInvite = async () => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch("/auth/enrollments/create", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Falha ao gerar código de pareamento.");
      }
      setGeneratedInvite({
        code: data.enrollment_code,
        expiresAt: data.expires_at,
      });
      await fetchSecurityData();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err?.message || "Erro ao criar convite." });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInvite = () => {
    if (!generatedInvite) return;
    navigator.clipboard.writeText(generatedInvite.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleApproveEnrollment = async (enrollment: PendingEnrollment) => {
    if (!enrollment.sas_code) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/auth/enrollments/${enrollment.enrollment_id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sas_code_confirmed: enrollment.sas_code }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Erro ao aprovar dispositivo.");
      }
      setActionMessage({
        type: "success",
        text: data.message || "Novo dispositivo autorizado com sucesso!",
      });
      setGeneratedInvite(null);
      await fetchSecurityData();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err?.message || "Falha na aprovação." });
    } finally {
      setLoading(false);
    }
  };

  const handleRejectEnrollment = async (enrollmentId: string) => {
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/auth/enrollments/${enrollmentId}/reject`, {
        method: "POST",
      });
      if (res.ok) {
        setActionMessage({
          type: "success",
          text: "Pedido de pareamento rejeitado e bloqueado.",
        });
        await fetchSecurityData();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeDevice = async (dev: DeviceRecord) => {
    if (
      !confirm(
        `Tem certeza que deseja REVOGAR imediatamente o acesso do dispositivo "${dev.device_name}"?`
      )
    ) {
      return;
    }
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/auth/devices/${dev.id}/revoke`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Não foi possível revogar o dispositivo.");
      }
      setActionMessage({ type: "success", text: data.message });
      await fetchSecurityData();
    } catch (err: any) {
      setActionMessage({ type: "error", text: err?.message || "Erro ao revogar." });
    } finally {
      setLoading(false);
    }
  };

  const awaitingApprovalList = pendingEnrollments.filter(
    (p) => p.status === "awaiting_approval"
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-3xl bg-[#0b1229]/95 border border-white/15 shadow-[0_25px_80px_rgba(0,0,0,0.85)] overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center">
              <ShieldCheck size={20} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Governança Zero-Trust de Dispositivos</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  Protegido
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Dispositivo atual:{" "}
                <strong className="text-amber-300">{currentDevice.device_name}</strong> (FP:{" "}
                <code className="font-mono text-[11px]">
                  {currentDevice.fingerprint_sha256.slice(0, 12)}...
                </code>
                )
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-6 pt-3 border-b border-white/10 flex items-center gap-2 bg-slate-950/30">
          <button
            onClick={() => setActiveTab("devices")}
            className={`px-4 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === "devices"
                ? "border-amber-400 text-amber-300 bg-amber-500/10"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Laptop size={14} />
            <span>Dispositivos Autorizados ({devices.filter((d) => !d.is_revoked).length})</span>
          </button>

          <button
            onClick={() => setActiveTab("pair")}
            className={`px-4 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === "pair"
                ? "border-amber-400 text-amber-300 bg-amber-500/10"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <KeyRound size={14} />
            <span>Autorizar Novo Dispositivo</span>
            {awaitingApprovalList.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-400 text-slate-950 animate-pulse">
                {awaitingApprovalList.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            className={`px-4 py-2 rounded-t-xl text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === "audit"
                ? "border-amber-400 text-amber-300 bg-amber-500/10"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <History size={14} />
            <span>Auditoria de Segurança</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {actionMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-center justify-between ${
                actionMessage.type === "success"
                  ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-200"
                  : "bg-rose-500/15 border border-rose-500/40 text-rose-200"
              }`}
            >
              <div className="flex items-center gap-2">
                {actionMessage.type === "success" ? (
                  <CheckCircle2 size={15} className="text-emerald-400" />
                ) : (
                  <AlertTriangle size={15} className="text-rose-400" />
                )}
                <span>{actionMessage.text}</span>
              </div>
              <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">
                <X size={14} />
              </button>
            </div>
          )}

          {/* Alert banner if any device is awaiting SAS confirmation */}
          {awaitingApprovalList.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-400/50 space-y-3 shadow-[0_0_25px_rgba(234,179,8,0.15)]">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                <Smartphone size={15} />
                <span>Solicitação de Pareamento Aguardando sua Confirmação SAS</span>
              </div>
              {awaitingApprovalList.map((req) => (
                <div
                  key={req.enrollment_id}
                  className="p-3.5 rounded-xl bg-slate-950/85 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="text-sm font-bold text-white">
                      {req.candidate_device_name || "Dispositivo Candidato"}
                    </div>
                    <div className="text-xs text-slate-400">
                      IP: <code className="text-slate-300">{req.candidate_ip}</code> | Fingerprint:{" "}
                      <code className="text-slate-300">
                        {req.candidate_fingerprint?.slice(0, 16)}...
                      </code>
                    </div>
                    <div className="text-xs text-amber-200 pt-1">
                      Confirme se o código na tela do novo dispositivo é:{" "}
                      <span className="font-mono font-black text-base text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-400/40 ml-1">
                        {req.sas_code}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleApproveEnrollment(req)}
                      disabled={loading}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all"
                    >
                      <CheckCircle2 size={14} />
                      <span>Confirmar SAS e Autorizar</span>
                    </button>
                    <button
                      onClick={() => handleRejectEnrollment(req.enrollment_id)}
                      disabled={loading}
                      className="px-3 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-semibold text-xs flex items-center gap-1 transition-all"
                    >
                      <XCircle size={14} />
                      <span>Rejeitar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "devices" && (
            <div className="space-y-3">
              {devices.map((dev) => {
                const isSelf = dev.id === currentDevice.id;
                return (
                  <div
                    key={dev.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      dev.is_revoked
                        ? "bg-slate-950/40 border-white/5 opacity-55"
                        : isSelf
                        ? "bg-amber-500/10 border-amber-500/40"
                        : "bg-slate-900/70 border-white/10"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-white">{dev.device_name}</span>
                        {isSelf && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/40">
                            Este Dispositivo
                          </span>
                        )}
                        {dev.is_genesis && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            Dispositivo Gênesis
                          </span>
                        )}
                        {dev.is_revoked && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            Revogado
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        SHA-256: {dev.fingerprint_sha256.slice(0, 24)}...
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Último IP: <span className="text-slate-300">{dev.last_ip || "N/A"}</span> •
                        Último acesso:{" "}
                        <span className="text-slate-300">
                          {formatEventTimestamp(dev.last_seen_at).fullStr}
                        </span>
                      </div>
                    </div>

                    {!dev.is_revoked && (
                      <button
                        onClick={() => handleRevokeDevice(dev)}
                        disabled={loading}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5 self-start sm:self-center transition-all"
                      >
                        <Trash2 size={13} />
                        <span>Revogar Acesso</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "pair" && (
            <div className="space-y-5">
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 text-xs text-slate-300 space-y-2 leading-relaxed">
                <p className="font-semibold text-amber-300">
                  Como funciona o Pareamento Supervisionado Zero-Trust:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  <li>
                    Clique no botão abaixo para gerar um{" "}
                    <strong>Código Efêmero de Uso Único</strong> (válido por 3 minutos).
                  </li>
                  <li>
                    Abra o endereço do Synaptix no novo dispositivo e digite o código gerado.
                  </li>
                  <li>
                    O novo dispositivo exibirá um <strong>Código SAS de 6 dígitos</strong>. Confira
                    se os 6 dígitos aparecem iguais aqui e clique em{" "}
                    <strong>Confirmar SAS e Autorizar</strong>.
                  </li>
                </ol>
              </div>

              <button
                onClick={handleGenerateInvite}
                disabled={loading}
                className="px-5 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 hover:brightness-110 transition-all"
              >
                <Plus size={16} />
                <span>Gerar Código Efêmero para Novo Dispositivo (TTL: 3 min)</span>
              </button>

              {generatedInvite && (
                <div className="p-5 rounded-2xl bg-slate-950/90 border border-amber-500/40 space-y-3">
                  <div className="text-xs text-slate-400">
                    Digite este código no novo dispositivo que deseja autorizar:
                  </div>
                  <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900 border border-white/10">
                    <span className="font-mono font-black text-xl sm:text-2xl tracking-wider text-amber-300">
                      {generatedInvite.code}
                    </span>
                    <button
                      onClick={handleCopyInvite}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold flex items-center gap-1.5"
                    >
                      {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                      <span>{copiedCode ? "Copiado!" : "Copiar"}</span>
                    </button>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Expira em:{" "}
                    <span className="text-amber-300">
                      {formatEventTimestamp(generatedInvite.expiresAt).timeStr}
                    </span>{" "}
                    (Válido para uma única tentativa de pareamento).
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "audit" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Eventos recentes (armazenados criptografados com AES-256-GCM):
                </span>
                <button
                  onClick={fetchAuditLogs}
                  className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-slate-300 flex items-center gap-1"
                >
                  <RefreshCw size={12} />
                  <span>Atualizar</span>
                </button>
              </div>

              <div className="space-y-2">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-slate-950/70 border border-white/10 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-amber-300">
                          {log.event_type}
                        </span>
                        {log.ip_address && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            IP: {log.ip_address}
                          </span>
                        )}
                      </div>
                      <div className="text-slate-300">{log.details}</div>
                    </div>
                    <div className="text-[11px] text-amber-300/90 font-mono shrink-0">
                      {formatEventTimestamp(log.created_at).fullStr}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
