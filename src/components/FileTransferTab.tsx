import React, { useState, useRef, useEffect } from 'react';
import { 
  Wifi, 
  WifiOff, 
  FileUp, 
  FileDown, 
  Clock, 
  Download, 
  AlertCircle, 
  CheckCircle, 
  Loader2, 
  ArrowLeftRight, 
  Send, 
  Users,
  Info
} from 'lucide-react';
import { FileTransfer } from '../hooks/useFileTransfer';

interface FileTransferTabProps {
  isDarkMode: boolean;
  padName: string;
  mySenderId: string;
  connectedPeers: string[];
  transfers: FileTransfer[];
  sendFileToPeer: (file: File, targetSenderId: string) => void;
  peerError: string | null;
}

// Helper to format file sizes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Expiration Countdown Component for real-time 72-hour visual feedback
const ExpirationCountdown: React.FC<{ timestamp: number; status: string }> = ({ timestamp, status }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (status !== 'completed') return;

    const updateTimer = () => {
      const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
      const expiryTime = timestamp + SEVENTY_TWO_HOURS_MS;
      const now = Date.now();
      const diff = expiryTime - now;

      if (diff <= 0) {
        setTimeLeft('Expirado');
        return;
      }

      const hours = Math.floor(diff / (60 * 60 * 1000));
      const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((diff % (60 * 1000)) / 1000);

      setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [timestamp, status]);

  if (status !== 'completed') return null;

  return (
    <div className="flex items-center gap-1.5 text-[11px] font-mono mt-1 text-amber-500 font-semibold uppercase tracking-wider">
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>Disponível por: {timeLeft || '...'}</span>
    </div>
  );
};

export const FileTransferTab: React.FC<FileTransferTabProps> = ({
  isDarkMode,
  padName,
  mySenderId,
  connectedPeers,
  transfers,
  sendFileToPeer,
  peerError
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedPeer, setSelectedPeer] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Automatically select peer if only one is available
  useEffect(() => {
    if (connectedPeers.length === 1 && !selectedPeer) {
      setSelectedPeer(connectedPeers[0]);
    }
  }, [connectedPeers, selectedPeer]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSend = () => {
    if (selectedFile && selectedPeer) {
      sendFileToPeer(selectedFile, selectedPeer);
      setSelectedFile(null);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className={`flex-1 p-4 md:p-6 flex justify-center overflow-y-auto h-full ${
      isDarkMode ? 'bg-[#0a0a0c]' : 'bg-slate-100'
    }`}>
      <div className="w-full max-w-[1200px] flex flex-col gap-6">
        
        {/* Connection State Info Card */}
        <div className={`p-4 md:p-6 rounded-2xl border transition-all ${
          isDarkMode 
            ? 'bg-[#0f0f12] border-white/5 shadow-black/40 text-white' 
            : 'bg-white border-slate-200 shadow-slate-200/50 text-slate-800'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                peerError 
                  ? 'bg-red-500/10 text-red-500' 
                  : connectedPeers.length > 0 
                  ? 'bg-emerald-500/10 text-emerald-500 animate-pulse' 
                  : 'bg-blue-500/10 text-blue-500'
              }`}>
                {peerError ? <WifiOff className="w-6 h-6" /> : <Wifi className="w-6 h-6" />}
              </div>
              <div>
                <h2 className="text-base font-extrabold tracking-tight uppercase">Conexão Peer-to-Peer (WebRTC)</h2>
                <p className={`text-xs ${isDarkMode ? 'text-white/40' : 'text-slate-500'} mt-0.5 font-semibold`}>
                  ID de Transferência: <code className="font-mono bg-slate-100 dark:bg-white/5 px-1.5 py-0.5 rounded font-bold">{mySenderId}</code>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <span className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold tracking-wider uppercase border flex items-center gap-1.5 ${
                connectedPeers.length > 0
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-500'
              }`}>
                <Users className="w-3.5 h-3.5" />
                <span>{connectedPeers.length} Peer(s) Ativo(s)</span>
              </span>

              {peerError && (
                <span className="px-3 py-1.5 rounded-lg text-[10px] font-extrabold tracking-wider uppercase border bg-red-500/10 border-red-500/20 text-red-400 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Falha: {peerError}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Info Box: Explanation of WebRTC local nature and 72h limit */}
        <div className={`p-4 rounded-xl border flex items-start gap-3 text-xs leading-relaxed ${
          isDarkMode 
            ? 'bg-blue-500/5 border-blue-500/10 text-blue-300' 
            : 'bg-indigo-50 border-indigo-100 text-indigo-950'
        }`}>
          <Info className={`w-5 h-5 shrink-0 mt-0.5 ${isDarkMode ? 'text-blue-400' : 'text-indigo-600'}`} />
          <div className="space-y-1">
            <span className="font-bold uppercase tracking-wider text-[10px] block">Transferência P2P Segura</span>
            <p>
              Os arquivos são enviados <strong>diretamente de navegador para navegador</strong> utilizando conexões WebRTC. Nenhum arquivo é carregado em nossos servidores, garantindo privacidade e velocidade ilimitada. 
            </p>
            <p className="font-semibold text-amber-600 dark:text-amber-400">
              ⚠️ Nota de segurança: O arquivo ficará disponível para download por no máximo 72 horas após a conclusão da transferência ou enquanto a guia do remetente permanecer aberta.
            </p>
          </div>
        </div>

        {/* Split Grid for Sender and History */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Send Area */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            <div className={`p-5 md:p-6 rounded-2xl border transition-all ${
              isDarkMode 
                ? 'bg-[#0f0f12] border-white/5 shadow-black/40 text-white' 
                : 'bg-white border-slate-200 shadow-slate-200/50 text-slate-800'
            }`}>
              <h3 className="text-sm font-extrabold tracking-wider uppercase mb-4 text-blue-500 dark:text-blue-400">Enviar Novo Arquivo</h3>
              
              <div className="flex flex-col gap-5">
                {/* Target Peer Selection */}
                <div>
                  <label className={`block text-[10px] font-extrabold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
                    1. Selecione o Destinatário
                  </label>
                  {connectedPeers.length === 0 ? (
                    <div className={`p-4 rounded-xl text-center text-xs border border-dashed ${
                      isDarkMode ? 'bg-[#14141a] border-white/5 text-white/40' : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}>
                      Aguardando outros usuários entrarem na mesma URL de sessão para iniciar conexões...
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {connectedPeers.map(peer => (
                        <button
                          key={peer}
                          type="button"
                          onClick={() => setSelectedPeer(peer)}
                          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all border cursor-pointer ${
                            selectedPeer === peer
                              ? isDarkMode
                                ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-500/20'
                                : 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-500/10'
                              : isDarkMode
                              ? 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                          }`}
                        >
                          Usuário: {peer}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Drag & Drop File Upload Zone */}
                <div className="relative">
                  <label className={`block text-[10px] font-extrabold uppercase tracking-wider mb-2 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
                    2. Escolha o Arquivo
                  </label>

                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 ${
                      dragActive 
                        ? isDarkMode ? 'border-blue-500 bg-blue-500/5' : 'border-indigo-600 bg-indigo-50/50'
                        : isDarkMode ? 'border-white/10 hover:border-blue-500/50 bg-white/[0.01]' : 'border-slate-300 hover:border-indigo-500 bg-slate-50/50'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      isDarkMode ? 'bg-white/5 text-white/70' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <FileUp className="w-6 h-6" />
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide">
                        {selectedFile ? selectedFile.name : 'Arraste seu arquivo aqui ou clique para buscar'}
                      </p>
                      <p className={`text-[10px] ${isDarkMode ? 'text-white/30' : 'text-slate-400'} mt-1 font-semibold`}>
                        {selectedFile ? formatBytes(selectedFile.size) : 'Suporta arquivos de qualquer tamanho'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Send Trigger */}
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!selectedFile || !selectedPeer}
                    className={`px-6 py-3 rounded-xl font-bold text-xs tracking-widest uppercase flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01] ${
                      isDarkMode 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/10' 
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-500/10'
                    }`}
                  >
                    <Send className="w-4 h-4" />
                    <span>Iniciar Envio P2P</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Transfer History Area */}
          <div className="lg:col-span-6 flex flex-col gap-6">
            <div className={`p-5 md:p-6 rounded-2xl border transition-all flex flex-col max-h-[600px] ${
              isDarkMode 
                ? 'bg-[#0f0f12] border-white/5 shadow-black/40 text-white' 
                : 'bg-white border-slate-200 shadow-slate-200/50 text-slate-800'
            }`}>
              <h3 className="text-sm font-extrabold tracking-wider uppercase mb-5 text-blue-500 dark:text-blue-400 flex items-center gap-2 shrink-0">
                <ArrowLeftRight className="w-4 h-4" />
                <span>Histórico de Transferências</span>
              </h3>

              <div className="flex-1 overflow-y-auto pr-1 space-y-4 scrollbar-thin">
                {transfers.length === 0 ? (
                  <div className={`p-8 text-center text-xs border border-dashed rounded-2xl ${
                    isDarkMode ? 'bg-[#14141a] border-white/5 text-white/30' : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}>
                    Nenhuma transferência efetuada nesta sessão.
                  </div>
                ) : (
                  <div className="space-y-4 pr-1">
                    {transfers.map(transfer => {
                const isSend = transfer.type === 'send';
                const isCompleted = transfer.status === 'completed';
                const isFailed = transfer.status === 'failed';
                const isExpired = transfer.status === 'expired';
                
                return (
                  <div
                    key={transfer.id}
                    className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                      isDarkMode ? 'bg-white/[0.01] border-white/5' : 'bg-slate-50 border-slate-150'
                    }`}
                  >
                    {/* Left Details */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                        isSend 
                          ? 'bg-blue-500/10 text-blue-500' 
                          : 'bg-indigo-500/10 text-indigo-500'
                      }`}>
                        {isSend ? <FileUp className="w-5 h-5" /> : <FileDown className="w-5 h-5" />}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold uppercase truncate max-w-[200px] sm:max-w-[320px]">
                            {transfer.fileName}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black tracking-wider uppercase ${
                            isSend
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}>
                            {isSend ? 'Enviado' : 'Recebido'}
                          </span>
                        </div>
                        
                        <p className={`text-[10px] ${isDarkMode ? 'text-white/30' : 'text-slate-400'} mt-0.5 font-mono`}>
                          Tamanho: {formatBytes(transfer.fileSize)} • Destinatário: {transfer.peerId}
                        </p>

                        {/* Expiration Countdown or Warning */}
                        <ExpirationCountdown timestamp={transfer.timestamp} status={transfer.status} />
                      </div>
                    </div>

                    {/* Progress / Status / Download controls */}
                    <div className="flex items-center gap-4 shrink-0 min-w-[150px] justify-between md:justify-end">
                      {/* Active Progress bar or label */}
                      {!isCompleted && !isFailed && !isExpired && (
                        <div className="w-24 sm:w-28 flex flex-col gap-1">
                          <div className="flex items-center justify-between text-[9px] font-bold">
                            <span className="animate-pulse flex items-center gap-1">
                              <Loader2 className="w-2.5 h-2.5 animate-spin text-blue-500" />
                              {transfer.status === 'connecting' ? 'CONECTANDO' : 'ENVIANDO'}
                            </span>
                            <span>{transfer.progress}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 transition-all duration-300"
                              style={{ width: `${transfer.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Status Badges */}
                      {isCompleted && (
                        <span className="px-2 py-1 rounded text-[9px] font-black tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Concluído</span>
                        </span>
                      )}

                      {isFailed && (
                        <span className="px-2 py-1 rounded text-[9px] font-black tracking-wider uppercase bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Falhou</span>
                        </span>
                      )}

                      {isExpired && (
                        <span className="px-2 py-1 rounded text-[9px] font-black tracking-wider uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Expirado</span>
                        </span>
                      )}

                      {/* Download Link */}
                      {!isSend && isCompleted && transfer.blobUrl && !isExpired && (
                        <a
                          href={transfer.blobUrl}
                          download={transfer.fileName}
                          referrerPolicy="no-referrer"
                          className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer text-white shadow hover:scale-[1.02] active:scale-[0.98] ${
                            isDarkMode
                              ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10'
                              : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/10'
                          }`}
                          title="Baixar Arquivo"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>

      </div>
    </div>
  );
};
