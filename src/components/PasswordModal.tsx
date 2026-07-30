/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lock, ArrowLeft, ArrowRight, ShieldAlert } from 'lucide-react';

interface PasswordModalProps {
  onUnlock: (password: string) => void;
  onBackToHome: () => void;
  errorMsg: string;
  isDarkMode: boolean;
}

export function PasswordModal({ onUnlock, onBackToHome, errorMsg, isDarkMode }: PasswordModalProps) {
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      onUnlock(password);
    }
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md ${
      isDarkMode ? 'bg-[#0a0a0c]/80' : 'bg-slate-900/40'
    }`}>
      <div className={`w-full max-w-sm p-8 rounded-2xl border shadow-2xl transition-colors duration-200 ${
        isDarkMode ? 'bg-[#0d0d10] border-white/5 text-white' : 'bg-white border-slate-100 text-slate-900'
      }`}>
        <div className="flex flex-col items-center text-center mb-6">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${
            isDarkMode 
              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.15)]' 
              : 'bg-red-100 text-red-600'
          }`}>
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">Bloco de Notas Protegido</h2>
          <p className={`text-xs mt-2 leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
            Este bloco de notas possui segurança de acesso ativa. Digite a senha para visualizar ou editar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-[10px] font-semibold uppercase tracking-[0.15em] mb-2 ${
              isDarkMode ? 'text-white/30' : 'text-slate-500'
            }`}>
              Senha de Acesso
            </label>
            <input
              type="password"
              placeholder="Digite a senha..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full px-4 py-2.5 rounded-xl border focus:outline-none transition-all text-center font-bold tracking-widest text-sm ${
                isDarkMode
                  ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-blue-500/50'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500'
              }`}
              required
              autoFocus
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-xl flex items-center gap-2 text-xs text-red-400 animate-pulse">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onBackToHome}
              className={`flex-1 py-2 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border ${
                isDarkMode
                  ? 'border-white/10 hover:bg-white/5 text-white/70'
                  : 'border-slate-200 hover:bg-slate-100 text-slate-600'
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Início
            </button>
            <button
              type="submit"
              className={`flex-1 py-2 px-4 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                isDarkMode 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/10' 
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10'
              }`}
            >
              Desbloquear
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
