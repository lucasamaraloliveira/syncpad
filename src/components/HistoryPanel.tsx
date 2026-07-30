/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { History, X, Save, Clock, ArrowLeftRight, Trash2 } from 'lucide-react';
import { PadVersion } from '../types.js';

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  versions: PadVersion[];
  onRestoreVersion: (versionId: string) => void;
  onSaveCheckpoint: (label: string) => void;
  onClearHistory: () => void;
  isDarkMode: boolean;
}

export function HistoryPanel({
  isOpen,
  onClose,
  versions,
  onRestoreVersion,
  onSaveCheckpoint,
  onClearHistory,
  isDarkMode,
}: HistoryPanelProps) {
  const [label, setLabel] = useState('');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (label.trim()) {
      onSaveCheckpoint(label.trim());
      setLabel('');
    }
  };

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  return (
    <div className="fixed inset-y-0 right-0 z-[100] w-full sm:w-80 flex flex-col shadow-2xl transition-transform duration-300">
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
            <History className={`w-4 h-4 ${isDarkMode ? 'text-blue-400' : 'text-indigo-500'}`} />
            <h3 className={`font-bold text-xs uppercase tracking-wider ${isDarkMode ? 'text-white/90' : 'text-slate-900'}`}>
              Histórico de Versões
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

        {/* Manual Backup form */}
        <div className={`p-4 border-b ${isDarkMode ? 'border-white/5 bg-[#0a0a0c]/40' : 'border-slate-50 bg-slate-50/40'}`}>
          <form onSubmit={handleSave} className="space-y-2">
            <label className={`block text-[10px] uppercase tracking-[0.2em] font-bold ${isDarkMode ? 'text-white/30' : 'text-slate-400'}`}>
              Salvar Versão Atual
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ex: Rascunho Final..."
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className={`flex-1 px-3 py-1.5 rounded-lg border text-xs font-medium focus:outline-none transition-all ${
                  isDarkMode
                    ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-blue-500/50'
                    : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
                }`}
                maxLength={40}
                required
              />
              <button
                type="submit"
                className={`p-1.5 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                  isDarkMode
                    ? 'bg-white/5 border border-white/10 text-blue-400 hover:bg-blue-600/10 hover:border-blue-500/50'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                }`}
                title="Salvar backup"
              >
                <Save className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>

        {/* Versions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className={`text-[10px] uppercase tracking-[0.2em] font-bold ${isDarkMode ? 'text-white/30' : 'text-slate-400'}`}>
              Revisões Disponíveis
            </h3>
            {versions.length > 0 && (
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(true)}
                className={`text-[10px] font-bold uppercase transition-colors px-2 py-1 rounded cursor-pointer ${
                  isDarkMode 
                    ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10' 
                    : 'text-red-600 hover:text-red-700 hover:bg-red-50'
                }`}
              >
                Limpar Tudo
              </button>
            )}
          </div>
          
          {versions.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-10">
              <Clock className="w-10 h-10 stroke-1 mb-3 text-slate-300 dark:text-slate-700" />
              <p className="text-xs font-medium">Nenhum backup disponível.</p>
              <p className="text-[10px] max-w-[180px] mt-1 text-slate-500">
                Os backups automáticos começam assim que você edita as notas.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...versions].reverse().map((version) => {
                const isManual = version.id.startsWith('m-');
                return (
                  <div
                    key={version.id}
                    className={`p-3 rounded-lg border flex flex-col gap-1 cursor-pointer transition-all ${
                      isDarkMode
                        ? 'bg-white/5 border-white/10 hover:bg-white/10'
                        : 'border-slate-200 bg-slate-50/50 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                        isManual
                          ? (isDarkMode ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-purple-100 text-purple-700')
                          : (isDarkMode ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-blue-100 text-blue-700')
                      }`}>
                        {isManual ? 'Manual' : 'Automático'}
                      </span>
                      <div className="text-right font-mono text-[9px] text-white/30">
                        {formatTime(version.timestamp)}
                      </div>
                    </div>

                    <p className={`font-semibold text-xs leading-tight line-clamp-1 ${isDarkMode ? 'text-white/90' : 'text-slate-900'}`}>
                      {version.label || `Revisão v${version.version}`}
                    </p>

                    <div className={`flex justify-between items-center mt-2.5 pt-2 border-t border-dashed ${isDarkMode ? 'border-white/5' : 'border-slate-200'}`}>
                      <span className={`text-[9px] font-mono uppercase ${isDarkMode ? 'text-white/30' : 'text-slate-400'}`}>
                        {version.text.length} chars
                      </span>
                      <button
                        onClick={() => onRestoreVersion(version.id)}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all flex items-center gap-1 cursor-pointer ${
                          isDarkMode
                            ? 'bg-white/5 border border-white/10 text-blue-400 hover:bg-blue-600/10 hover:border-blue-500/50'
                            : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600'
                        }`}
                      >
                        <ArrowLeftRight className="w-2.5 h-2.5" />
                        Restaurar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isConfirmModalOpen && (
        <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-md ${
          isDarkMode ? 'bg-[#0a0a0c]/85' : 'bg-slate-900/40'
        }`}>
          <div className={`w-full max-w-sm p-6 rounded-2xl border shadow-2xl transition-all ${
            isDarkMode ? 'bg-[#0f0f12] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex flex-col items-center text-center mb-5">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${
                isDarkMode 
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                  : 'bg-red-100 text-red-600'
              }`}>
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-extrabold tracking-tight">Limpar todo o histórico?</h3>
              <p className={`text-xs mt-2 leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
                Deseja realmente limpar todos os backups automáticos salvos? Esta ação removerá todo o histórico de versões anteriores deste bloco de notas.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className={`flex-1 py-2 px-4 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
                  isDarkMode
                    ? 'border-white/10 hover:bg-white/5 text-white/70'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                }`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmModalOpen(false);
                  onClearHistory();
                }}
                className={`flex-1 py-2 px-4 text-xs font-semibold rounded-xl transition-all cursor-pointer text-white bg-red-600 hover:bg-red-700 shadow-md ${
                  isDarkMode ? 'shadow-red-950/30' : 'shadow-red-600/10'
                }`}
              >
                Limpar Tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
