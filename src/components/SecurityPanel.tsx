/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldCheck, X, Eye, EyeOff, Lock, Unlock, AlertTriangle } from 'lucide-react';

interface SecurityPanelProps {
  isOpen: boolean;
  onClose: () => void;
  hasPassword: boolean;
  onSetPassword: (password: string) => void;
  onRemovePassword: () => void;
  isDarkMode: boolean;
}

export function SecurityPanel({
  isOpen,
  onClose,
  hasPassword,
  onSetPassword,
  onRemovePassword,
  isDarkMode,
}: SecurityPanelProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      onSetPassword(password.trim());
      setPassword('');
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-80 flex flex-col shadow-2xl transition-transform duration-300">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-xs -z-10" onClick={onClose} />

      {/* Content Panel */}
      <div className={`h-full w-full flex flex-col border-l transition-colors duration-200 ${
        isDarkMode ? 'bg-[#0d0d10] border-white/5 text-[#e0e0e0]' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Header */}
        <div className={`p-4 border-b flex items-center justify-between ${
          isDarkMode ? 'border-white/5 bg-[#0f0f12]' : 'border-slate-100 bg-white'
        }`}>
          <div className="flex items-center gap-2">
            <ShieldCheck className={`w-4 h-4 ${isDarkMode ? 'text-blue-400' : 'text-indigo-500'}`} />
            <h3 className={`font-bold text-xs uppercase tracking-wider ${isDarkMode ? 'text-white/90' : 'text-slate-900'}`}>
              Segurança do Bloco
            </h3>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isDarkMode ? 'text-white/40 hover:text-white/80 hover:bg-white/5' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Security Status */}
        <div className="p-6 text-center flex-shrink-0">
          <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
            hasPassword
              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            {hasPassword ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
          </div>

          <h4 className={`font-bold text-sm mb-1 ${isDarkMode ? 'text-white/90' : 'text-slate-900'}`}>
            {hasPassword ? 'Este bloco está protegido' : 'Este bloco é público'}
          </h4>
          <p className={`text-[11px] leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
            {hasPassword
              ? 'Qualquer novo usuário que tentar acessar este link precisará da senha para ler ou editar os dados.'
              : 'Qualquer usuário com este link poderá ler e editar as notas instantaneamente.'}
          </p>
        </div>

        {/* Security Action Forms */}
        <div className="flex-1 p-6 space-y-4 overflow-y-auto">
          {/* Form to Set Password */}
          <div className={`p-4 rounded-xl border ${isDarkMode ? 'border-white/5 bg-white/5' : 'border-slate-200 bg-slate-50/50'}`}>
            <h5 className="font-bold text-xs mb-3 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-blue-400" />
              {hasPassword ? 'Alterar Senha de Segurança' : 'Proteger com Senha'}
            </h5>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Nova senha..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-3 pr-10 py-2 rounded-lg border text-xs font-medium focus:outline-none transition-all ${
                    isDarkMode
                      ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-blue-500/50'
                      : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                  }`}
                  minLength={4}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer ${isDarkMode ? 'text-white/40 hover:text-white/70' : 'text-slate-400 hover:text-slate-500'}`}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                type="submit"
                className={`w-full py-2 px-4 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isDarkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                }`}
              >
                {hasPassword ? 'Atualizar Senha' : 'Ativar Proteção'}
              </button>
            </form>
          </div>

          {/* Form to Remove Password */}
          {hasPassword && (
            <div className={`p-4 rounded-xl border ${isDarkMode ? 'border-red-950/40 bg-red-950/10' : 'border-red-200 bg-red-50/20'}`}>
              <h5 className="font-bold text-xs text-red-400 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Desativar Proteção por Senha
              </h5>
              <p className="text-[10px] text-white/40 mb-3 leading-relaxed">
                A remoção da senha tornará este bloco de notas público novamente. Qualquer pessoa com o link poderá ler e editar.
              </p>

              <button
                onClick={onRemovePassword}
                className={`w-full py-2 px-4 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isDarkMode
                    ? 'bg-white/5 border border-white/10 text-red-400 hover:bg-red-600/10 hover:border-red-500/50'
                    : 'bg-red-50 hover:bg-red-100 text-red-600'
                }`}
              >
                <Unlock className="w-3.5 h-3.5" />
                Remover Senha do Bloco
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
