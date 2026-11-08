import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

export interface ExportNotePdfOptions {
  title: string;
  htmlContent: string;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Falha ao converter imagem para DataURL'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function resolveImagesInContainer(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map(async (img) => {
      const rawSrc = img.getAttribute('src') || '';
      if (!rawSrc) return;

      try {
        if (!rawSrc.startsWith('data:')) {
          const fetchUrl = rawSrc.replace(/^http:\/\/localhost:8000/, '');
          const response = await fetch(fetchUrl);
          if (response.ok) {
            const blob = await response.blob();
            const dataUrl = await blobToDataUrl(blob);
            img.src = dataUrl;
          }
        }
      } catch (err) {
        console.warn('Não foi possível converter imagem via fetch para PDF, tentando carregamento direto:', err);
        img.crossOrigin = 'anonymous';
      }

      // Garante que a imagem terminou de decodificar antes da captura do canvas
      await new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve();
          return;
        }
        const onDone = () => {
          img.removeEventListener('load', onDone);
          img.removeEventListener('error', onDone);
          resolve();
        };
        img.addEventListener('load', onDone);
        img.addEventListener('error', onDone);
      });
    })
  );
}

function sanitizeFilename(name: string): string {
  const cleaned = (name || 'Nota_Synaptix')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_');
  return cleaned.slice(0, 80) || 'Nota_Synaptix';
}

export async function exportNoteToPdf({ title, htmlContent }: ExportNotePdfOptions): Promise<void> {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-10000px';
  wrapper.style.top = '0';
  wrapper.style.width = '794px'; // Largura A4 equivalente a 96 DPI
  wrapper.style.backgroundColor = '#ffffff';
  wrapper.style.color = '#0f172a';
  wrapper.style.zIndex = '-9999';
  wrapper.style.pointerEvents = 'none';

  const nowStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Limpa tags <mark data-comment-id="..."> preservando o conteúdo interno
  const tempParser = document.createElement('div');
  tempParser.innerHTML = htmlContent;
  tempParser.querySelectorAll('mark[data-comment-id]').forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    }
  });

  // Ajusta estilos inline de imagens para o layout editorial
  tempParser.querySelectorAll('img').forEach((img) => {
    const widthAttr = img.getAttribute('data-width') || img.getAttribute('width') || '100%';
    const alignAttr = img.getAttribute('data-align') || 'center';
    img.style.width = widthAttr;
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
    img.style.borderRadius = '8px';
    img.style.marginTop = '14px';
    img.style.marginBottom = '14px';
    if (alignAttr === 'left') {
      img.style.marginLeft = '0';
      img.style.marginRight = 'auto';
    } else if (alignAttr === 'right') {
      img.style.marginLeft = 'auto';
      img.style.marginRight = '0';
    } else {
      img.style.marginLeft = 'auto';
      img.style.marginRight = 'auto';
    }
  });

  wrapper.innerHTML = `
    <style>
      .synaptix-pdf-root {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #0f172a !important;
        background-color: #ffffff !important;
        padding: 16px 24px 28px 24px;
        line-height: 1.65;
        font-size: 14px;
        box-sizing: border-box;
      }
      .synaptix-pdf-header {
        border-bottom: 2px solid #e2e8f0;
        padding-bottom: 16px;
        margin-bottom: 24px;
      }
      .synaptix-pdf-title {
        font-size: 26px;
        font-weight: 800;
        color: #0f172a !important;
        margin: 0 0 6px 0;
        line-height: 1.25;
        letter-spacing: -0.02em;
      }
      .synaptix-pdf-meta {
        font-size: 11px;
        color: #64748b !important;
        margin: 0;
      }
      .synaptix-pdf-body h1 {
        font-size: 22px;
        font-weight: 700;
        color: #0f172a !important;
        margin: 22px 0 10px 0;
        line-height: 1.3;
      }
      .synaptix-pdf-body h2 {
        font-size: 18px;
        font-weight: 700;
        color: #1e293b !important;
        margin: 18px 0 8px 0;
        line-height: 1.35;
      }
      .synaptix-pdf-body h3 {
        font-size: 16px;
        font-weight: 600;
        color: #1e293b !important;
        margin: 16px 0 6px 0;
      }
      .synaptix-pdf-body p {
        margin: 0 0 12px 0;
        color: #1e293b !important;
      }
      .synaptix-pdf-body a {
        color: #2563eb !important;
        text-decoration: underline !important;
        font-weight: 500;
        word-break: break-word;
      }
      .synaptix-pdf-body ul, .synaptix-pdf-body ol {
        margin: 0 0 14px 0;
        padding-left: 24px;
        color: #1e293b !important;
      }
      .synaptix-pdf-body ul {
        list-style-type: disc;
      }
      .synaptix-pdf-body ol {
        list-style-type: decimal;
      }
      .synaptix-pdf-body li {
        margin-bottom: 4px;
      }
      .synaptix-pdf-body ul[data-type="taskList"] {
        list-style: none;
        padding-left: 4px;
      }
      .synaptix-pdf-body ul[data-type="taskList"] li {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 6px;
      }
      .synaptix-pdf-body ul[data-type="taskList"] li > label {
        margin-top: 2px;
      }
      .synaptix-pdf-body blockquote {
        border-left: 4px solid #f59e0b;
        background-color: #fffbeb;
        margin: 14px 0;
        padding: 10px 16px;
        color: #334155 !important;
        border-radius: 0 8px 8px 0;
      }
      .synaptix-pdf-body code {
        font-family: 'JetBrains Mono', Consolas, Monaco, monospace;
        font-size: 12.5px;
        background-color: #f1f5f9;
        color: #be123c !important;
        padding: 2px 5px;
        border-radius: 4px;
      }
      .synaptix-pdf-body pre {
        background-color: #f8fafc !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 8px;
        padding: 12px 16px;
        margin: 14px 0;
        overflow-x: auto;
        color: #0f172a !important;
      }
      .synaptix-pdf-body pre code {
        background-color: transparent !important;
        color: #0f172a !important;
        padding: 0;
      }
      .synaptix-pdf-body table {
        width: 100%;
        border-collapse: collapse;
        margin: 16px 0;
        font-size: 13px;
      }
      .synaptix-pdf-body th, .synaptix-pdf-body td {
        border: 1px solid #cbd5e1 !important;
        padding: 8px 12px;
        text-align: left;
        vertical-align: top;
        color: #1e293b !important;
      }
      .synaptix-pdf-body th {
        background-color: #f1f5f9 !important;
        font-weight: 700;
        color: #0f172a !important;
      }
      .synaptix-pdf-body hr {
        border: none;
        border-top: 1px solid #cbd5e1;
        margin: 20px 0;
      }
      .synaptix-pdf-body .mention {
        background-color: #fef3c7 !important;
        color: #92400e !important;
        border: 1px solid #fcd34d !important;
        border-radius: 4px;
        padding: 1px 6px;
        font-weight: 600;
      }
    </style>
    <div class="synaptix-pdf-root" id="synaptix-pdf-capture">
      <div class="synaptix-pdf-header">
        <h1 class="synaptix-pdf-title"></h1>
        <p class="synaptix-pdf-meta">Exportado em ${nowStr}</p>
      </div>
      <div class="synaptix-pdf-body"></div>
    </div>
  `;

  const titleEl = wrapper.querySelector('.synaptix-pdf-title');
  if (titleEl) {
    titleEl.textContent = title || 'Nota Sem Título';
  }
  const bodyEl = wrapper.querySelector('.synaptix-pdf-body');
  if (bodyEl) {
    bodyEl.innerHTML = tempParser.innerHTML;
  }

  document.body.appendChild(wrapper);

  try {
    const captureTarget = wrapper.querySelector('#synaptix-pdf-capture') as HTMLElement;
    await resolveImagesInContainer(captureTarget);

    // Coleta as posições de todos os links <a> para torná-los clicáveis no PDF
    const targetRect = captureTarget.getBoundingClientRect();
    const linkAnnotations: {
      href: string;
      xPx: number;
      yPx: number;
      wPx: number;
      hPx: number;
    }[] = [];

    captureTarget.querySelectorAll('a[href]').forEach((anchor) => {
      const href = anchor.getAttribute('href');
      if (!href) return;
      const rects = anchor.getClientRects();
      Array.from(rects).forEach((r) => {
        if (r.width > 0 && r.height > 0) {
          linkAnnotations.push({
            href,
            xPx: r.left - targetRect.left,
            yPx: r.top - targetRect.top,
            wPx: r.width,
            hPx: r.height,
          });
        }
      });
    });

    const canvas = await html2canvas(captureTarget, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidthMm = 210;
    const pageHeightMm = 297;
    const marginMm = 12;
    const contentWidthMm = pageWidthMm - marginMm * 2;
    const contentHeightMm = pageHeightMm - marginMm * 2 - 6; // Reserva espaço para rodapé

    const pxToMmRatio = contentWidthMm / targetRect.width;
    const pageHeightPx = contentHeightMm / pxToMmRatio;
    const totalHeightPx = targetRect.height;
    const totalPages = Math.max(1, Math.ceil(totalHeightPx / pageHeightPx));

    const canvasScale = canvas.width / targetRect.width;

    for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
      if (pageIdx > 0) {
        pdf.addPage();
      }

      const sliceStartPx = pageIdx * pageHeightPx;
      const sliceHeightPx = Math.min(pageHeightPx, totalHeightPx - sliceStartPx);

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.max(1, Math.round(sliceHeightPx * canvasScale));

      const ctx = sliceCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          Math.round(sliceStartPx * canvasScale),
          canvas.width,
          Math.round(sliceHeightPx * canvasScale),
          0,
          0,
          sliceCanvas.width,
          Math.round(sliceHeightPx * canvasScale)
        );
      }

      const sliceDataUrl = sliceCanvas.toDataURL('image/jpeg', 0.95);
      const renderedHeightMm = sliceHeightPx * pxToMmRatio;

      pdf.addImage(
        sliceDataUrl,
        'JPEG',
        marginMm,
        marginMm,
        contentWidthMm,
        renderedHeightMm
      );

      // Adiciona links clicáveis que pertencem a esta página
      linkAnnotations.forEach((lnk) => {
        const linkCenterY = lnk.yPx + lnk.hPx / 2;
        if (linkCenterY >= sliceStartPx && linkCenterY < sliceStartPx + pageHeightPx) {
          const xMm = marginMm + lnk.xPx * pxToMmRatio;
          const yMm = marginMm + (lnk.yPx - sliceStartPx) * pxToMmRatio;
          const wMm = lnk.wPx * pxToMmRatio;
          const hMm = lnk.hPx * pxToMmRatio;
          pdf.link(xMm, yMm, wMm, hMm, { url: lnk.href });
        }
      });

      // Rodapé discreto de paginação
      pdf.setFontSize(8.5);
      pdf.setTextColor(148, 163, 184);
      pdf.text(
        `Página ${pageIdx + 1} de ${totalPages}`,
        pageWidthMm / 2,
        pageHeightMm - 7,
        { align: 'center' }
      );
    }

    pdf.save(`${sanitizeFilename(title)}.pdf`);
  } finally {
    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  }
}
