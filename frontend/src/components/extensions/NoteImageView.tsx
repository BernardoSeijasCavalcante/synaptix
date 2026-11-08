import { useEffect, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { AlignLeft, AlignCenter, AlignRight, Trash2, Loader2, ImageOff } from 'lucide-react';
import type { ImageAlign } from './NoteImage';

// Cache em memória na sessão para evitar re-downloads desnecessários ao alternar notas
const blobUrlCache = new Map<string, string>();

export const NoteImageView = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) => {
  const src: string = node.attrs.src || '';
  const alt: string = node.attrs.alt || '';
  const title: string = node.attrs.title || '';
  const width: string = node.attrs.width || '100%';
  const align: ImageAlign = node.attrs.align || 'center';

  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (!src) return null;
    if (blobUrlCache.has(src)) return blobUrlCache.get(src)!;
    const isLocalUpload =
      src.startsWith('/uploads/') ||
      src.startsWith('http://localhost:8000/uploads/') ||
      src.startsWith('http://127.0.0.1:8000/uploads/');
    return isLocalUpload ? null : src;
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  useEffect(() => {
    if (!src) {
      setResolvedSrc(null);
      return;
    }

    if (blobUrlCache.has(src)) {
      setResolvedSrc(blobUrlCache.get(src)!);
      setHasError(false);
      return;
    }

    const isLocalUpload =
      src.startsWith('/uploads/') ||
      src.startsWith('http://localhost:8000/uploads/') ||
      src.startsWith('http://127.0.0.1:8000/uploads/');

    if (!isLocalUpload) {
      setResolvedSrc(src);
      setHasError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);

    async function fetchDecryptedImage() {
      try {
        const cleanPath = src
          .replace(/^http:\/\/localhost:8000/, '')
          .replace(/^http:\/\/127\.0\.0\.1:8000/, '');
        const response = await fetch(cleanPath);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const blob = await response.blob();
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        blobUrlCache.set(src, objectUrl);
        setResolvedSrc(objectUrl);
      } catch (err) {
        console.error('Erro ao carregar imagem criptografada da nota:', err);
        if (!cancelled) {
          setHasError(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchDecryptedImage();

    return () => {
      cancelled = true;
    };
  }, [src]);

  let justifyClass = 'justify-center';
  if (align === 'left') justifyClass = 'justify-start';
  else if (align === 'right') justifyClass = 'justify-end';

  return (
    <NodeViewWrapper
      className={`my-4 flex w-full ${justifyClass} select-none`}
      data-drag-handle
    >
      <div
        style={{ width, maxWidth: '100%' }}
        className={`group/img relative rounded-xl transition-all duration-200 ${
          selected
            ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950 shadow-[0_0_25px_rgba(234,179,8,0.25)]'
            : 'hover:ring-1 hover:ring-white/25'
        }`}
      >
        {/* Barra de controles sobreposta (aparece ao selecionar ou passar o mouse) */}
        <div
          contentEditable={false}
          onClick={(e) => e.stopPropagation()}
          className={`absolute top-2 right-2 z-20 flex items-center gap-1 rounded-xl bg-slate-900/95 backdrop-blur-xl border border-white/15 px-2 py-1 shadow-2xl transition-opacity duration-150 ${
            selected ? 'opacity-100' : 'opacity-0 group-hover/img:opacity-100'
          }`}
        >
          {(['25%', '50%', '75%', '100%'] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => updateAttributes({ width: w })}
              className={`px-1.5 py-0.5 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                width === w
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
              title={`Redimensionar para ${w}`}
            >
              {w}
            </button>
          ))}
          <div className="w-px h-4 bg-white/15 mx-0.5" />
          <button
            type="button"
            onClick={() => updateAttributes({ align: 'left' })}
            className={`p-1 rounded-md transition cursor-pointer ${
              align === 'left'
                ? 'bg-amber-500/25 text-amber-300'
                : 'text-slate-300 hover:bg-white/10'
            }`}
            title="Alinhar à esquerda"
          >
            <AlignLeft size={13} />
          </button>
          <button
            type="button"
            onClick={() => updateAttributes({ align: 'center' })}
            className={`p-1 rounded-md transition cursor-pointer ${
              align === 'center'
                ? 'bg-amber-500/25 text-amber-300'
                : 'text-slate-300 hover:bg-white/10'
            }`}
            title="Centralizar"
          >
            <AlignCenter size={13} />
          </button>
          <button
            type="button"
            onClick={() => updateAttributes({ align: 'right' })}
            className={`p-1 rounded-md transition cursor-pointer ${
              align === 'right'
                ? 'bg-amber-500/25 text-amber-300'
                : 'text-slate-300 hover:bg-white/10'
            }`}
            title="Alinhar à direita"
          >
            <AlignRight size={13} />
          </button>
          <div className="w-px h-4 bg-white/15 mx-0.5" />
          <button
            type="button"
            onClick={() => deleteNode()}
            className="p-1 rounded-md text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
            title="Remover imagem"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Estado de carregamento, erro ou imagem renderizada */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 px-6 rounded-xl bg-slate-900/60 border border-white/10 text-slate-400">
            <Loader2 size={22} className="animate-spin text-amber-400" />
            <span className="text-xs">Descriptografando imagem...</span>
          </div>
        ) : hasError || !resolvedSrc ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 px-6 rounded-xl bg-rose-950/20 border border-rose-500/25 text-rose-300">
            <ImageOff size={22} className="text-rose-400" />
            <span className="text-xs font-medium">Não foi possível carregar a imagem ({alt || 'imagem'})</span>
          </div>
        ) : (
          <img
            src={resolvedSrc}
            alt={alt}
            title={title || undefined}
            data-width={width}
            data-align={align}
            onError={() => setHasError(true)}
            className="w-full h-auto block rounded-xl border border-white/10 shadow-lg"
          />
        )}
      </div>
    </NodeViewWrapper>
  );
};
