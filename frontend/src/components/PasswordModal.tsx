import React, { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, Key, Eye, EyeOff, AlertCircle, X, ShieldCheck, Loader2 } from 'lucide-react';

export type PasswordModalMode = 'unlock' | 'set' | 'change' | 'remove';

interface PasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: PasswordModalMode;
  itemType: 'Caderno' | 'Sub-caderno' | 'Nota';
  itemName: string;
  onSubmit: (data: { password: string; currentPassword?: string }) => Promise<void>;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({
  isOpen,
  onClose,
  mode,
  itemType,
  itemName,
  onSubmit,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword('');
      setPassword('');
      setConfirmPassword('');
      setError(null);
      setLoading(false);
      setShowPassword(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 80);
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'unlock') {
      if (!password) {
        setError('Por favor, informe a senha.');
        return;
      }
      setLoading(true);
      try {
        await onSubmit({ password });
        onClose();
      } catch (err: any) {
        setError(err.message || 'Senha incorreta.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'remove') {
      if (!password) {
        setError('Por favor, informe a senha atual para remover a proteção.');
        return;
      }
      setLoading(true);
      try {
        await onSubmit({ password });
        onClose();
      } catch (err: any) {
        setError(err.message || 'Senha incorreta.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'set' || mode === 'change') {
      if (mode === 'change' && !currentPassword) {
        setError('Informe a senha atual.');
        return;
      }
      if (!password || password.length < 4) {
        setError('A nova senha deve ter no mínimo 4 caracteres.');
        return;
      }
      if (password !== confirmPassword) {
        setError('A confirmação da nova senha não confere.');
        return;
      }
      setLoading(true);
      try {
        await onSubmit({ password, currentPassword: mode === 'change' ? currentPassword : undefined });
        onClose();
      } catch (err: any) {
        setError(err.message || 'Erro ao processar senha.');
      } finally {
        setLoading(false);
      }
    }
  };

  const getModalTitle = () => {
    switch (mode) {
      case 'unlock':
        return `Desbloquear ${itemType}`;
      case 'set':
        return `Proteger ${itemType} com Senha`;
      case 'change':
        return `Alterar Senha de ${itemType}`;
      case 'remove':
        return `Remover Senha de ${itemType}`;
    }
  };

  const getActionBtnLabel = () => {
    if (loading) return 'Processando...';
    switch (mode) {
      case 'unlock':
        return 'Desbloquear';
      case 'set':
        return 'Definir Senha';
      case 'change':
        return 'Salvar Nova Senha';
      case 'remove':
        return 'Remover Senha';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div 
        className="relative w-full max-w-md bg-slate-900/90 border border-amber-500/30 rounded-2xl p-6 shadow-[0_0_35px_rgba(234,179,8,0.15)] text-slate-100 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              {mode === 'unlock' ? <Unlock size={20} /> : <Lock size={20} />}
            </div>
            <div>
              <h3 className="font-semibold text-base text-slate-100">{getModalTitle()}</h3>
              <p className="text-xs text-slate-400 truncate max-w-[240px]" title={itemName}>
                {itemName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-white/10 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'change' && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Senha Atual</label>
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Digite sua senha atual..."
                  className="w-full glass-input text-xs text-slate-100 px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-amber-400/60 pr-10"
                  disabled={loading}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {mode === 'unlock'
                ? 'Senha de Acesso'
                : mode === 'remove'
                ? 'Senha Atual'
                : mode === 'change'
                ? 'Nova Senha'
                : 'Senha de Proteção'}
            </label>
            <div className="relative">
              <input
                ref={mode !== 'change' ? inputRef : undefined}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === 'unlock'
                    ? 'Digite a senha para desbloquear...'
                    : mode === 'remove'
                    ? 'Confirme sua senha para remover...'
                    : 'Mínimo 4 caracteres...'
                }
                className="w-full glass-input text-xs text-slate-100 px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-amber-400/60 pr-10"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {(mode === 'set' || mode === 'change') && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Confirmar Nova Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha..."
                  className="w-full glass-input text-xs text-slate-100 px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-amber-400/60 pr-10"
                  disabled={loading}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-400 flex items-center gap-1">
                <ShieldCheck size={12} className="text-amber-400" />
                Criptografada e protegida com scrypt e salt único.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl shadow-lg transition ${
                mode === 'remove'
                  ? 'bg-rose-500/80 hover:bg-rose-500 text-white shadow-rose-500/20'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
              }`}
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : mode === 'unlock' ? <Key size={14} /> : <Lock size={14} />}
              <span>{getActionBtnLabel()}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
