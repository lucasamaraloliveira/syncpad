/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Edit3, Zap, Lock, History, Download, Eye, ChevronRight, Sparkles, Terminal, FileCode, FileUp } from 'lucide-react';

interface LandingPageProps {
  onJoinPad: (padName: string) => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

export function LandingPage({ onJoinPad, isDarkMode, toggleDarkMode }: LandingPageProps) {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      // Normalize input pad name: remove leading/trailing slashes and trim
      let padName = inputValue.trim();
      if (padName.startsWith('/')) {
        padName = padName.substring(1);
      }
      if (padName.endsWith('/')) {
        padName = padName.substring(0, padName.length - 1);
      }
      if (padName) {
        onJoinPad(padName);
      }
    }
  };

  const generateRandomPad = () => {
    const randomName = 'bloco-' + Math.random().toString(36).substring(2, 9);
    onJoinPad(randomName);
  };

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isDarkMode ? 'bg-[#0a0a0c] text-[#e0e0e0]' : 'bg-slate-50 text-slate-900'}`}>
      {/* Header */}
      <header className={`border-b transition-colors ${isDarkMode ? 'bg-[#0f0f12] border-white/5' : 'bg-white border-slate-100'}`}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${isDarkMode ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-indigo-600 text-white'}`}>
              <Edit3 className="w-4 h-4" />
            </div>
            <span className={`font-bold text-sm tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              syncpad.io
            </span>
          </div>

          <button
            onClick={toggleDarkMode}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
              isDarkMode
                ? 'border-white/10 bg-white/5 text-yellow-400 hover:bg-white/10'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {isDarkMode ? '☀️ Modo Claro' : '🌙 Modo Escuro'}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto px-6 pt-16 pb-24 text-center">
        <div className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest ${
          isDarkMode 
            ? 'bg-blue-500/5 text-blue-400 border border-blue-400/10' 
            : 'bg-indigo-50 text-indigo-700'
        } mb-6`}>
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          Editor de código e bloco de notas colaborativo em tempo real
        </div>

        <h1 className={`text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-6 leading-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
          Desenvolva, crie e <br />
          <span className={`bg-clip-text text-transparent ${
            isDarkMode 
              ? 'bg-gradient-to-r from-blue-400 via-sky-400 to-indigo-400' 
              : 'bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500'
          }`}>
            colabore em tempo real.
          </span>
        </h1>

        <p className={`text-sm sm:text-base max-w-2xl mx-auto mb-10 leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-slate-600'}`}>
          Uma IDE colaborativa instantânea e bloco de notas seguro. Crie múltiplos arquivos (HTML, CSS, JS, Markdown), 
          consulte nosso Assistente de IA para programar, compartilhe arquivos e visualize resultados na hora.
        </p>

        {/* Access Form */}
        <div className="max-w-md mx-auto mb-16">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <span className={`absolute left-4 top-1/2 -translate-y-1/2 font-mono text-xs font-semibold ${isDarkMode ? 'text-white/20' : 'text-slate-400'}`}>
                /
              </span>
              <input
                type="text"
                placeholder="nome-do-bloco"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.replace(/[^a-zA-Z0-9_\-\/]/g, ''))}
                className={`w-full pl-8 pr-4 py-2.5 rounded-xl border text-xs font-bold tracking-wider focus:outline-none transition-all ${
                  isDarkMode
                    ? 'bg-white/5 border-white/10 text-white placeholder-white/20 focus:border-blue-500/50'
                    : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-1 focus:ring-indigo-500'
                }`}
                required
              />
            </div>
            <button
              type="submit"
              className={`px-5 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                isDarkMode 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/10' 
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
              }`}
            >
              Criar / Abrir Bloco
              <ChevronRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs">
            <span className={isDarkMode ? 'text-white/30' : 'text-slate-400'}>Ou crie um</span>
            <button
              onClick={generateRandomPad}
              className={`font-semibold underline underline-offset-4 cursor-pointer transition-colors ${
                isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-indigo-500 hover:text-indigo-600'
              }`}
            >
              bloco aleatório seguro
            </button>
          </div>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left mt-12">
          {/* Card 1 */}
          <div className={`p-6 rounded-2xl border transition-all ${
            isDarkMode ? 'border-white/5 bg-[#0d0d10] hover:bg-white/5' : 'border-slate-200/80 bg-white hover:shadow-lg'
          }`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-5 ${
              isDarkMode ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-indigo-100 text-indigo-600'
            }`}>
              <Zap className="w-5 h-5" />
            </div>
            <h3 className={`font-bold text-sm mb-2 ${isDarkMode ? 'text-white/90' : 'text-slate-900'}`}>Sincronização em Tempo Real</h3>
            <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-slate-600'}`}>
              Digite simultaneamente com seus colegas. As alterações nos códigos e textos são transmitidas instantaneamente para todos os conectados.
            </p>
          </div>

          {/* Card 2 */}
          <div className={`p-6 rounded-2xl border transition-all ${
            isDarkMode ? 'border-white/5 bg-[#0d0d10] hover:bg-white/5' : 'border-slate-200/80 bg-white hover:shadow-lg'
          }`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-5 ${
              isDarkMode ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-purple-100 text-purple-600'
            }`}>
              <FileCode className="w-5 h-5" />
            </div>
            <h3 className={`font-bold text-sm mb-2 ${isDarkMode ? 'text-white/90' : 'text-slate-900'}`}>Editor Multi-arquivos Profissional</h3>
            <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-slate-600'}`}>
              Gerencie arquivos HTML, CSS, JS, Markdown ou JSON no editor Monaco. Inclui auto-completar inteligente, realce de sintaxe e auto-formatação.
            </p>
          </div>

          {/* Card 3 */}
          <div className={`p-6 rounded-2xl border transition-all ${
            isDarkMode ? 'border-white/5 bg-[#0d0d10] hover:bg-white/5' : 'border-slate-200/80 bg-white hover:shadow-lg'
          }`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-5 ${
              isDarkMode ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'bg-sky-100 text-sky-600'
            }`}>
              <Eye className="w-5 h-5" />
            </div>
            <h3 className={`font-bold text-sm mb-2 ${isDarkMode ? 'text-white/90' : 'text-slate-900'}`}>Preview Vivo & Sandbox</h3>
            <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-slate-600'}`}>
              Veja as atualizações de suas interfaces web renderizadas em tempo real ao lado do seu editor em um frame de sandbox de execução seguro.
            </p>
          </div>

          {/* Card 4 */}
          <div className={`p-6 rounded-2xl border transition-all ${
            isDarkMode ? 'border-white/5 bg-[#0d0d10] hover:bg-white/5' : 'border-slate-200/80 bg-white hover:shadow-lg'
          }`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-5 ${
              isDarkMode ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-amber-100 text-amber-600'
            }`}>
              <Terminal className="w-5 h-5" />
            </div>
            <h3 className={`font-bold text-sm mb-2 ${isDarkMode ? 'text-white/90' : 'text-slate-900'}`}>Console de Execução Integrado</h3>
            <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-slate-600'}`}>
              Inspecione logs, alertas, avisos ou erros gerados pela execução do seu JavaScript diretamente no painel do console do sandbox.
            </p>
          </div>

          {/* Card 5 */}
          <div className={`p-6 rounded-2xl border transition-all ${
            isDarkMode ? 'border-white/5 bg-[#0d0d10] hover:bg-white/5' : 'border-slate-200/80 bg-white hover:shadow-lg'
          }`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-5 ${
              isDarkMode ? 'bg-pink-500/10 text-pink-400 border border-pink-500/20' : 'bg-pink-100 text-pink-600'
            }`}>
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <h3 className={`font-bold text-sm mb-2 ${isDarkMode ? 'text-white/90' : 'text-slate-900'}`}>Assistente de Programação IA</h3>
            <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-slate-600'}`}>
              Solicite explicações, otimize a performance ou encontre bugs no seu código usando nossa IA inteligente (limite diário de 2 consultas).
            </p>
          </div>

          {/* Card 6 */}
          <div className={`p-6 rounded-2xl border transition-all ${
            isDarkMode ? 'border-white/5 bg-[#0d0d10] hover:bg-white/5' : 'border-slate-200/80 bg-white hover:shadow-lg'
          }`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-5 ${
              isDarkMode ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-100 text-emerald-600'
            }`}>
              <Lock className="w-5 h-5" />
            </div>
            <h3 className={`font-bold text-sm mb-2 ${isDarkMode ? 'text-white/90' : 'text-slate-900'}`}>Segurança & Compartilhamento</h3>
            <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-white/40' : 'text-slate-600'}`}>
              Proteja seus arquivos de código com senha robusta, gerencie versões de backup e envie arquivos de mídia entre usuários de forma privada.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className={`py-8 text-center text-[10px] uppercase font-semibold font-mono tracking-wider border-t transition-colors ${
        isDarkMode ? 'border-white/5 text-white/20 bg-[#0a0a0c]' : 'border-slate-100 text-slate-400 bg-white'
      }`}>
        <p>© 2026 SyncPad Colaborativo — Editor de texto colaborativo rápido e seguro em tempo real.</p>
      </footer>
    </div>
  );
}
