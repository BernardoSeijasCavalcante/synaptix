/**
 * Rastreador Global de Eventos Zero-Trust (Synaptix Telemetry)
 * Registra qualquer navegação ou interação realizada na interface com data e hora exatas.
 */

export interface TrackEventPayload {
  event_type: string;
  category?:
    | "SECURITY"
    | "NAVIGATION"
    | "CHAT"
    | "TASKS"
    | "NOTES"
    | "WORKSPACES"
    | "NETWORK"
    | "FILES"
    | "AI_AGENT"
    | "CALENDAR"
    | "SYSTEM";
  severity?: "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
  endpoint?: string;
  details: string;
}

let lastTrackedSignature = "";
let lastTrackedTimestamp = 0;

export async function trackSiteEvent(payload: TrackEventPayload): Promise<void> {
  try {
    const now = Date.now();
    const signature = `${payload.event_type}:${payload.endpoint || ""}:${payload.details}`;
    if (signature === lastTrackedSignature && now - lastTrackedTimestamp < 1500) {
      return;
    }
    lastTrackedSignature = signature;
    lastTrackedTimestamp = now;

    await fetch("/auth/events/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: payload.event_type,
        category: payload.category || "NAVIGATION",
        severity: payload.severity || "INFO",
        endpoint: payload.endpoint || window.location.pathname,
        details: payload.details,
      }),
    });
  } catch {
    // Falha silenciosa em background para não interromper a UX
  }
}

/**
 * Converte um timestamp ISO (armazenado em UTC no banco) para o horário local exato do navegador,
 * exibindo Data (DD/MM/AAAA) e Hora com segundos (HH:MM:SS).
 */
export function parseUtcDate(isoString: string): Date {
  if (!isoString) return new Date();
  const trimmed = isoString.trim();
  const hasTz =
    trimmed.endsWith("Z") ||
    /[+-]\d{2}:\d{2}$/.test(trimmed) ||
    /[+-]\d{4}$/.test(trimmed);
  return new Date(hasTz ? trimmed : `${trimmed}Z`);
}

export function formatEventTimestamp(isoString: string): {
  dateStr: string;
  timeStr: string;
  fullStr: string;
  relativeStr: string;
} {
  const dateObj = parseUtcDate(isoString);
  if (isNaN(dateObj.getTime())) {
    return {
      dateStr: "--/--/----",
      timeStr: "--:--:--",
      fullStr: isoString || "Data desconhecida",
      relativeStr: "",
    };
  }

  const dateStr = dateObj.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const timeStr = dateObj.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const diffSec = Math.max(0, Math.floor((Date.now() - dateObj.getTime()) / 1000));
  let relativeStr = "agora mesmo";
  if (diffSec >= 5 && diffSec < 60) {
    relativeStr = `há ${diffSec}s`;
  } else if (diffSec >= 60 && diffSec < 3600) {
    relativeStr = `há ${Math.floor(diffSec / 60)} min`;
  } else if (diffSec >= 3600 && diffSec < 86400) {
    relativeStr = `há ${Math.floor(diffSec / 3600)}h`;
  } else if (diffSec >= 86400) {
    relativeStr = `há ${Math.floor(diffSec / 86400)}d`;
  }

  return {
    dateStr,
    timeStr,
    fullStr: `${dateStr} às ${timeStr}`,
    relativeStr,
  };
}
