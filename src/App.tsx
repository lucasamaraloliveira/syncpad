/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeToPad, savePadToCloud, trackPresence } from './firebase';
import { 
  Edit3, 
  Users, 
  Copy, 
  Scissors,
  Clipboard,
  Check, 
  History, 
  Lock, 
  Unlock, 
  Download, 
  Eye, 
  Layout, 
  Sun, 
  Moon, 
  ShieldAlert, 
  Sparkles,
  RefreshCw,
  Undo,
  Redo,
  Bold,
  Italic,
  Underline,
  Quote,
  Code,
  List,
  ListTodo,
  Link as LinkIcon,
  Mic,
  AudioLines,
  Eraser,
  ChevronDown,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Paintbrush,
  Play,
  Pause,
  Trash2,
  X,
  MoreHorizontal,
  Pin,
  PinOff,
  FileCode,
  Code2,
  FolderOpen,
  Plus,
  FileText,
  ArrowLeftRight
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { jsPDF } from 'jspdf';
import { marked } from 'marked';
import { ClientMessage, ServerMessage, PadVersion, CodeFile } from './types.js';
import { LandingPage } from './components/LandingPage.js';
import { PasswordModal } from './components/PasswordModal.js';
import { HistoryPanel } from './components/HistoryPanel.js';
import { SecurityPanel } from './components/SecurityPanel.js';
import { useFileTransfer } from './hooks/useFileTransfer.js';
import { FileTransferTab } from './components/FileTransferTab.js';

// Random string generator for identifying the sender
const generateSenderId = () => Math.random().toString(36).substring(2, 15);

const DEFAULT_CODE_FILES: CodeFile[] = [
  {
    name: 'index.html',
    content: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Minha Página Web</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="card">
        <h1>Olá do SyncPad!</h1>
        <p>Este é um ambiente interativo para testar seus códigos HTML, CSS e JavaScript.</p>
        <button id="action-btn">Clique aqui</button>
    </div>
    
    <script src="script.js"></script>
</body>
</html>`,
    language: 'html'
  },
  {
    name: 'style.css',
    content: `body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: linear-gradient(135deg, #0f172a, #1e1b4b);
    color: #f8fafc;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    margin: 0;
}

.card {
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 2.5rem;
    border-radius: 1rem;
    text-align: center;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    max-width: 400px;
}

h1 {
    color: #38bdf8;
    margin-top: 0;
}

button {
    background: #38bdf8;
    color: #0f172a;
    border: none;
    padding: 0.75rem 1.5rem;
    font-weight: bold;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.2s;
}

button:hover {
    background: #0ea5e9;
    transform: translateY(-2px);
}`,
    language: 'css'
  },
  {
    name: 'script.js',
    content: `// Escreva seu código JavaScript interativo aqui!
const button = document.getElementById('action-btn');

if (button) {
    button.addEventListener('click', () => {
        alert('Botão clicado! JavaScript funcionando perfeitamente.');
    });
}`,
    language: 'javascript'
  }
];

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');
}

export default function App() {
  // 1. Router State (Path-based SyncPad style)
  const [padName, setPadName] = useState<string>(() => {
    let path = window.location.pathname;
    if (path.startsWith('/')) path = path.substring(1);
    if (path.endsWith('/')) path = path.substring(0, path.length - 1);
    return path ? decodeURIComponent(path) : '';
  });

  // 2. Core Pad State
  const [text, setText] = useState('');
  const [version, setVersion] = useState(0);
  const [activeUsers, setActiveUsers] = useState(1);
  const [activeUserIds, setActiveUserIds] = useState<string[]>([]);
  const [peerIdsMap, setPeerIdsMap] = useState<{ [senderId: string]: string }>({});
  const [hasPassword, setHasPassword] = useState(false);
  const [passwordCached, setPasswordCached] = useState<string>('');
  const [versions, setVersions] = useState<PadVersion[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());

  // References
  const socketRef = useRef<WebSocket | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const monacoEditorRef = useRef<any>(null);
  const versionRef = useRef(0);
  const textRef = useRef('');
  const mySenderId = useRef(generateSenderId());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isAdjustingRef = useRef(false);

  // 3. UI Toggles & Modes
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  // 4. Connection State
  // 'connecting' | 'connected' | 'disconnected' | 'auth_required'
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'auth_required'>('connecting');
  const [authError, setAuthError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // 5. Toast alerts
  const [toast, setToast] = useState<{ 
    message: string; 
    type: 'success' | 'error' | 'info'; 
    undoAction?: { label: string; onClick: () => void };
  } | null>(null);

  const [deletedVersions, setDeletedVersions] = useState<PadVersion[]>([]);

  // 6. Toolbar & AI integration states
  const [isAiCompleting, setIsAiCompleting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<any>(null);

  // Audio Recording States
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'review'>('idle');
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<string>('TRANSCRIÇÃO SIMPLES');
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<any>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Editor styling states (Font, Size, Color, Alignment)
  const [editorFont, setEditorFont] = useState<'mono' | 'sans' | 'serif'>('mono');
  const [editorFontSize, setEditorFontSize] = useState<number>(16);
  const [editorTextColor, setEditorTextColor] = useState<string>('DEFAULT');
  const [editorTextAlign, setEditorTextAlign] = useState<'ESQUERDA' | 'CENTRO' | 'DIREITA' | 'JUSTIFICADO'>('ESQUERDA');

  // Word-like Paginated Sheet State
  const A4_PAGE_HEIGHT = 1150;
  const [editorHeight, setEditorHeight] = useState<number>(1150);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageCount = Math.max(1, Math.ceil(editorHeight / A4_PAGE_HEIGHT));

  // Headers and Footers State
  const [headerText, setHeaderText] = useState<string>(() => {
    return localStorage.getItem(`syncpad_header_${padName}`) || '';
  });
  const [footerText, setFooterText] = useState<string>(() => {
    return localStorage.getItem(`syncpad_footer_${padName}`) || 'Página {page}';
  });
  const [activeEditArea, setActiveEditArea] = useState<'body' | 'header' | 'footer'>('body');

  const [headerAlign, setHeaderAlign] = useState<'ESQUERDA' | 'CENTRO' | 'DIREITA' | 'JUSTIFICADO'>(() => {
    return (localStorage.getItem(`syncpad_header_align_${padName}`) as any) || 'CENTRO';
  });
  const [headerFont, setHeaderFont] = useState<'mono' | 'sans' | 'serif'>(() => {
    return (localStorage.getItem(`syncpad_header_font_${padName}`) as any) || 'sans';
  });
  const [headerFontSize, setHeaderFontSize] = useState<number>(() => {
    return Number(localStorage.getItem(`syncpad_header_size_${padName}`)) || 12;
  });
  const [headerColor, setHeaderColor] = useState<string>(() => {
    return localStorage.getItem(`syncpad_header_color_${padName}`) || 'DEFAULT';
  });
  const [headerBold, setHeaderBold] = useState<boolean>(() => {
    return localStorage.getItem(`syncpad_header_bold_${padName}`) === 'true';
  });
  const [headerItalic, setHeaderItalic] = useState<boolean>(() => {
    return localStorage.getItem(`syncpad_header_italic_${padName}`) === 'true';
  });
  const [headerUnderline, setHeaderUnderline] = useState<boolean>(() => {
    return localStorage.getItem(`syncpad_header_underline_${padName}`) === 'true';
  });

  const [footerAlign, setFooterAlign] = useState<'ESQUERDA' | 'CENTRO' | 'DIREITA' | 'JUSTIFICADO'>(() => {
    return (localStorage.getItem(`syncpad_footer_align_${padName}`) as any) || 'CENTRO';
  });
  const [footerFont, setFooterFont] = useState<'mono' | 'sans' | 'serif'>(() => {
    return (localStorage.getItem(`syncpad_footer_font_${padName}`) as any) || 'sans';
  });
  const [footerFontSize, setFooterFontSize] = useState<number>(() => {
    return Number(localStorage.getItem(`syncpad_footer_size_${padName}`)) || 10;
  });
  const [footerColor, setFooterColor] = useState<string>(() => {
    return localStorage.getItem(`syncpad_footer_color_${padName}`) || 'DEFAULT';
  });
  const [footerBold, setFooterBold] = useState<boolean>(() => {
    return localStorage.getItem(`syncpad_footer_bold_${padName}`) === 'true';
  });
  const [footerItalic, setFooterItalic] = useState<boolean>(() => {
    return localStorage.getItem(`syncpad_footer_italic_${padName}`) === 'true';
  });
  const [footerUnderline, setFooterUnderline] = useState<boolean>(() => {
    return localStorage.getItem(`syncpad_footer_underline_${padName}`) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(`syncpad_header_${padName}`, headerText);
  }, [headerText, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_footer_${padName}`, footerText);
  }, [footerText, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_header_align_${padName}`, headerAlign);
  }, [headerAlign, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_header_font_${padName}`, headerFont);
  }, [headerFont, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_header_size_${padName}`, String(headerFontSize));
  }, [headerFontSize, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_header_color_${padName}`, headerColor);
  }, [headerColor, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_header_bold_${padName}`, String(headerBold));
  }, [headerBold, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_header_italic_${padName}`, String(headerItalic));
  }, [headerItalic, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_header_underline_${padName}`, String(headerUnderline));
  }, [headerUnderline, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_footer_align_${padName}`, footerAlign);
  }, [footerAlign, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_footer_font_${padName}`, footerFont);
  }, [footerFont, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_footer_size_${padName}`, String(footerFontSize));
  }, [footerFontSize, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_footer_color_${padName}`, footerColor);
  }, [footerColor, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_footer_bold_${padName}`, String(footerBold));
  }, [footerBold, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_footer_italic_${padName}`, String(footerItalic));
  }, [footerItalic, padName]);

  useEffect(() => {
    localStorage.setItem(`syncpad_footer_underline_${padName}`, String(footerUnderline));
  }, [footerUnderline, padName]);

  useEffect(() => {
    setHeaderText(localStorage.getItem(`syncpad_header_${padName}`) || '');
    setFooterText(localStorage.getItem(`syncpad_footer_${padName}`) || 'Página {page}');
    
    setHeaderAlign((localStorage.getItem(`syncpad_header_align_${padName}`) as any) || 'CENTRO');
    setHeaderFont((localStorage.getItem(`syncpad_header_font_${padName}`) as any) || 'sans');
    setHeaderFontSize(Number(localStorage.getItem(`syncpad_header_size_${padName}`)) || 12);
    setHeaderColor(localStorage.getItem(`syncpad_header_color_${padName}`) || 'DEFAULT');
    setHeaderBold(localStorage.getItem(`syncpad_header_bold_${padName}`) === 'true');
    setHeaderItalic(localStorage.getItem(`syncpad_header_italic_${padName}`) === 'true');
    setHeaderUnderline(localStorage.getItem(`syncpad_header_underline_${padName}`) === 'true');

    setFooterAlign((localStorage.getItem(`syncpad_footer_align_${padName}`) as any) || 'CENTRO');
    setFooterFont((localStorage.getItem(`syncpad_footer_font_${padName}`) as any) || 'sans');
    setFooterFontSize(Number(localStorage.getItem(`syncpad_footer_size_${padName}`)) || 10);
    setFooterColor(localStorage.getItem(`syncpad_footer_color_${padName}`) || 'DEFAULT');
    setFooterBold(localStorage.getItem(`syncpad_footer_bold_${padName}`) === 'true');
    setFooterItalic(localStorage.getItem(`syncpad_footer_italic_${padName}`) === 'true');
    setFooterUnderline(localStorage.getItem(`syncpad_footer_underline_${padName}`) === 'true');

    setActiveEditArea('body');
  }, [padName]);

  // Sync real-time data with Firebase Firestore
  useEffect(() => {
    const currentPad = padName || 'default';
    setConnectionStatus('connecting');
    const unsubscribe = subscribeToPad(
      currentPad, 
      (data) => {
        setConnectionStatus('connected');
        if (data && typeof data.text === 'string') {
          // Update local text state if different
          if (data.text !== textRef.current) {
            textRef.current = data.text;
            setText(data.text);
          }
        }
        if (data && Array.isArray(data.codeFiles) && data.codeFiles.length > 0) {
          setCodeFiles(data.codeFiles);
        }
      },
      () => {
        setConnectionStatus('disconnected');
      }
    );

    return () => unsubscribe();
  }, [padName]);





  const formatFooterText = (text: string, pageNum: number, totalPages: number) => {
    return text
      .replace(/{page}/g, String(pageNum))
      .replace(/{pages}/g, String(totalPages));
  };

  const getAreaStyle = (area: 'header' | 'footer') => {
    const isHeader = area === 'header';
    const align = isHeader ? headerAlign : footerAlign;
    const font = isHeader ? headerFont : footerFont;
    const size = isHeader ? headerFontSize : footerFontSize;
    const color = isHeader ? headerColor : footerColor;
    const bold = isHeader ? headerBold : footerBold;
    const italic = isHeader ? headerItalic : footerItalic;
    const underline = isHeader ? headerUnderline : footerUnderline;

    let textAlignClass = 'text-center';
    const normAlign = String(align).toUpperCase();
    if (normAlign === 'ESQUERDA' || normAlign === 'LEFT') textAlignClass = 'text-left';
    else if (normAlign === 'DIREITA' || normAlign === 'RIGHT') textAlignClass = 'text-right';
    else if (normAlign === 'JUSTIFICADO' || normAlign === 'JUSTIFY') textAlignClass = 'text-justify';

    let fontFamilyClass = 'font-sans';
    if (font === 'mono') fontFamilyClass = 'font-mono';
    else if (font === 'serif') fontFamilyClass = 'font-serif';

    const colorStyle = color && color !== 'DEFAULT' ? { color } : {};

    return {
      className: `${textAlignClass} ${fontFamilyClass} ${bold ? 'font-extrabold' : 'font-normal'} ${italic ? 'italic' : ''} ${underline ? 'underline' : ''}`,
      style: {
        fontSize: `${size}px`,
        ...colorStyle
      }
    };
  };

  useEffect(() => {
    if (activeEditArea === 'header') {
      setEditorFont(headerFont);
      setEditorFontSize(headerFontSize);
      setEditorTextColor(headerColor);
      setEditorTextAlign(headerAlign);
    } else if (activeEditArea === 'footer') {
      setEditorFont(footerFont);
      setEditorFontSize(footerFontSize);
      setEditorTextColor(footerColor);
      setEditorTextAlign(footerAlign);
    }
  }, [activeEditArea]);

  // 7. SyncPad Tab & Code Editor states
  const [activeTab, setActiveTab] = useState<'text' | 'code' | 'file'>('text');
  const [codeFiles, setCodeFiles] = useState<CodeFile[]>(DEFAULT_CODE_FILES);

  // Collaborative Cursors & Selection States
  const [isCollabMenuOpen, setIsCollabMenuOpen] = useState(false);
  const [myNickname, setMyNickname] = useState<string>(() => {
    const saved = localStorage.getItem('syncpad_nickname');
    if (saved) return saved;
    const anonymousNicknames = [
      'Capivara Anônima',
      'Cacatua Anônima',
      'Ornitorrinco Anônimo',
      'Preguiça Focada',
      'Lhama Tagarela',
      'Raposa Ágil',
      'Golfinho Inspirador',
      'Coala Sonolento',
      'Coruja Sábia',
      'Axolote Curioso',
      'Tartaruga Veloz',
      'Panda Criativo',
      'Gato Digitador',
      'Pinguim Elegante',
      'Leopardo Rápido',
      'Lobo Colaborativo',
      'Polvo Multitarefa',
      'Esquilo Dedicado',
      'Suricato Alerta',
      'Elefante Atento'
    ];
    const randomIndex = Math.floor(Math.random() * anonymousNicknames.length);
    const nickname = anonymousNicknames[randomIndex];
    localStorage.setItem('syncpad_nickname', nickname);
    return nickname;
  });
  const [myColor, setMyColor] = useState<string>(() => {
    const saved = localStorage.getItem('syncpad_user_color');
    if (saved) return saved;
    const colors = [
      '#ef4444', '#f97316', '#eab308', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  });
  const [remoteCursors, setRemoteCursors] = useState<{
    [senderId: string]: {
      nickname: string;
      color: string;
      fileName: string;
      position: { lineNumber: number; column: number } | null;
      selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number } | null;
      lastUpdate: number;
    };
  }>({});

  const remoteCursorsRef = useRef(remoteCursors);
  const remoteDecorationsRef = useRef<{ [senderId: string]: string[] }>({});
  const handleCursorOrSelectionChangeRef = useRef<any>(null);

  const [editorContextMenu, setEditorContextMenu] = useState<{
    x: number;
    y: number;
    visible: boolean;
    selectedText: string;
  } | null>(null);

  useEffect(() => {
    localStorage.setItem('syncpad_nickname', myNickname);
  }, [myNickname]);

  useEffect(() => {
    localStorage.setItem('syncpad_user_color', myColor);
  }, [myColor]);

  // Prevent inspecting element, right-click, and hotkeys to view source
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const editor = editorRef.current;
      if (activeTab === 'text' && editor && (editor === target || editor.contains(target))) {
        e.preventDefault();
        const selection = window.getSelection();
        const selectedText = selection ? selection.toString() : '';
        setEditorContextMenu({
          x: e.clientX,
          y: e.clientY,
          visible: true,
          selectedText
        });
      } else {
        e.preventDefault();
        setEditorContextMenu(null);
      }
    };

    const handleDocumentClick = () => {
      setEditorContextMenu(null);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent F12
      if (e.key === 'F12') {
        e.preventDefault();
        return;
      }

      // Check for Ctrl/Cmd keys
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isShift = e.shiftKey;
      const isAlt = e.altKey;

      // Ctrl+Shift+I / Cmd+Opt+I (Inspect)
      if (isCtrlOrCmd && (isShift || isAlt) && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        return;
      }

      // Ctrl+Shift+J / Cmd+Opt+J (Console)
      if (isCtrlOrCmd && (isShift || isAlt) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault();
        return;
      }

      // Ctrl+Shift+C / Cmd+Opt+C (Select element to inspect)
      if (isCtrlOrCmd && (isShift || isAlt) && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        return;
      }

      // Ctrl+U / Cmd+U / Cmd+Opt+U (View Source)
      if (isCtrlOrCmd && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        return;
      }

      // Ctrl+S / Cmd+S (Save page, typically used to download source files)
      if (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        return;
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTab]);

  // File Transfer P2P Hook Setup
  const handlePeerIdGenerated = useCallback((generatedPeerId: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'peer_id_sync',
        padName,
        senderId: mySenderId.current,
        peerId: generatedPeerId
      }));
    }
  }, [padName]);

  const {
    peerId,
    peerError,
    transfers,
    connectedPeers,
    sendFileToPeer
  } = useFileTransfer(
    padName,
    mySenderId.current,
    activeUserIds,
    peerIdsMap,
    handlePeerIdGenerated
  );

  // Sync Peer ID to WebSocket server when connection status is connected
  useEffect(() => {
    if (peerId && connectionStatus === 'connected' && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      console.log('Sending peer_id_sync to WebSocket server on connection/peerId change:', peerId);
      socketRef.current.send(JSON.stringify({
        type: 'peer_id_sync',
        padName,
        senderId: mySenderId.current,
        peerId
      }));
    }
  }, [peerId, connectionStatus, padName]);
  const [activeFileName, setActiveFileName] = useState<string>('index.html');

  // Track online presence via Firestore
  useEffect(() => {
    const currentPad = padName || 'default';
    const unsubPresence = trackPresence(
      currentPad,
      {
        senderId: mySenderId.current,
        nickname: myNickname,
        color: myColor,
        activeFileName: activeTab === 'code' ? activeFileName : 'Texto/Notas'
      },
      (presenceMap) => {
        const userCount = Math.max(1, Object.keys(presenceMap).length);
        setActiveUsers(userCount);
        setActiveUserIds(Object.keys(presenceMap));
        
        // Filter out myself for remote cursors / users list
        const remotes: any = {};
        Object.entries(presenceMap).forEach(([id, p]) => {
          if (id !== mySenderId.current) {
            remotes[id] = p;
          }
        });
        setRemoteCursors(remotes);
      }
    );

    return () => unsubPresence();
  }, [padName, myNickname, myColor, activeTab, activeFileName]);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(true);
   const [isNewFileModalOpen, setIsNewFileModalOpen] = useState<boolean>(false);
  const [newFileName, setNewFileName] = useState<string>('');
  const [isRenameModalOpen, setIsRenameModalOpen] = useState<boolean>(false);
  const [renamingFileName, setRenamingFileName] = useState<string>('');
  const [renameNewName, setRenameNewName] = useState<string>('');
  const [isDeleteConfirmModalOpen, setIsDeleteConfirmModalOpen] = useState<boolean>(false);
  const [deletingFileName, setDeletingFileName] = useState<string>('');
  const [isCodeSidebarOpen, setIsCodeSidebarOpen] = useState<boolean>(window.innerWidth > 768);
  const [mobileCodeViewMode, setMobileCodeViewMode] = useState<'editor' | 'preview' | 'split'>('editor');

  // ==========================================
  // IDEAS C & D - Sandbox Console & AI Coding Assistant
  // ==========================================
  interface ConsoleLogEntry {
    id: string;
    level: 'log' | 'info' | 'warn' | 'error';
    message: string;
    timestamp: number;
  }

  interface AiChatMessage {
    role: 'user' | 'assistant';
    content: string;
  }

  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);
  const [aiChatHistory, setAiChatHistory] = useState<AiChatMessage[]>([
    {
      role: 'assistant',
      content: 'Olá! Sou seu **Assistente de Programação IA** do SyncPad. ⚡\n\nSelecione um trecho de código no editor para me enviar como contexto ou digite uma dúvida abaixo. Você também pode clicar nos atalhos para **Explicar**, **Otimizar** ou **Encontrar Bugs**!'
    }
  ]);

  // Daily AI limit tracker (max 2 uses per day)
  const checkAndGetAiUsageCount = (): number => {
    const today = new Date().toDateString();
    const storedDate = localStorage.getItem('syncpad_ai_usage_date');
    const storedCount = localStorage.getItem('syncpad_ai_usage_count');
    
    if (storedDate === today) {
      return storedCount ? parseInt(storedCount, 10) : 0;
    } else {
      localStorage.setItem('syncpad_ai_usage_date', today);
      localStorage.setItem('syncpad_ai_usage_count', '0');
      return 0;
    }
  };

  const [aiUsageCount, setAiUsageCount] = useState<number>(() => checkAndGetAiUsageCount());

  const incrementAiUsageCount = (currentCount: number) => {
    const newCount = currentCount + 1;
    const today = new Date().toDateString();
    localStorage.setItem('syncpad_ai_usage_date', today);
    localStorage.setItem('syncpad_ai_usage_count', String(newCount));
    setAiUsageCount(newCount);
  };

  const clearConsoleLogs = () => setConsoleLogs([]);

  // PostMessage listener for Iframe Sandbox Console
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'iframe_console') {
        const { level, message } = event.data;
        setConsoleLogs((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(2, 9),
            level,
            message: message || '',
            timestamp: Date.now()
          }
        ].slice(-100)); // Keep only last 100 entries
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleCallAiAssistant = async (action: 'explain' | 'optimize' | 'bugs' | 'custom', promptOverride?: string) => {
    const currentCount = checkAndGetAiUsageCount();

    if (currentCount >= 2) {
      const warningMsg: AiChatMessage = {
        role: 'assistant',
        content: `⚠️ **Limite de Uso Diário Atingido!**\n\nDesculpe, mas você já atingiu o limite de **2 consultas hoje** para o Assistente de IA do editor de código.\n\nPara garantir um uso sustentável e colaborativo para todos os usuários do SyncPad, o limite diário é fixado em 2 usos por dia.\n\nPor favor, retorne amanhã ou continue programando manualmente! 🚀`
      };
      setAiChatHistory((prev) => [...prev, warningMsg]);
      showToast('Limite diário do Assistente de IA atingido (2/2)!', 'error');
      return;
    }

    setIsAiLoading(true);
    
    // Check if user selected code in Monaco
    let codeContext = '';
    if (monacoEditorRef.current) {
      const selection = monacoEditorRef.current.getSelection();
      if (selection && !selection.isEmpty()) {
        codeContext = monacoEditorRef.current.getModel()?.getValueInRange(selection) || '';
      }
    }
    
    // Fallback to complete active file content
    if (!codeContext) {
      const file = codeFiles.find(f => f.name === activeFileName);
      codeContext = file ? file.content : '';
    }

    const finalPrompt = action === 'custom' ? (promptOverride || aiPrompt) : '';
    
    let actionLabel = 'Análise do arquivo';
    if (action === 'explain') actionLabel = 'Explicar Código';
    else if (action === 'optimize') actionLabel = 'Otimizar Código';
    else if (action === 'bugs') actionLabel = 'Encontrar Bugs';
    else if (action === 'custom') actionLabel = finalPrompt;

    const userMessage: AiChatMessage = {
      role: 'user',
      content: action === 'custom' 
        ? finalPrompt 
        : `⚙️ **[${actionLabel}]** no arquivo \`${activeFileName}\`.`
    };

    const updatedHistory = [...aiChatHistory, userMessage];
    setAiChatHistory(updatedHistory);
    if (action === 'custom') {
      setAiPrompt('');
    }

    try {
      const response = await fetch('/api/ai/coding-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: codeContext,
          fileName: activeFileName,
          action,
          customPrompt: finalPrompt,
          chatHistory: updatedHistory.slice(0, -1) // Excluding the absolute latest user message
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Falha ao processar requisição');
      }

      const data = await response.json();
      const assistantResponse: AiChatMessage = {
        role: 'assistant',
        content: data.result || 'Não foi possível gerar uma resposta.'
      };
      setAiChatHistory((prev) => [...prev, assistantResponse]);
      incrementAiUsageCount(currentCount);
    } catch (error: any) {
      console.error('Erro no assistente de IA:', error);
      const errorMsg: AiChatMessage = {
        role: 'assistant',
        content: `❌ **Ocorreu um erro:**\n${error.message || 'Erro inesperado ao consultar a IA.'}`
      };
      setAiChatHistory((prev) => [...prev, errorMsg]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Sync Code Files when padName changes
  useEffect(() => {
    if (!padName) return;
    const saved = localStorage.getItem(`syncpad_code_files_${padName}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCodeFiles(parsed);
          const hasIndexHtml = parsed.some(f => f.name === 'index.html');
          setActiveFileName(hasIndexHtml ? 'index.html' : parsed[0].name);
          return;
        }
      } catch (e) {
        console.error('Failed to parse saved code files', e);
      }
    }
    setCodeFiles(DEFAULT_CODE_FILES);
    setActiveFileName('index.html');
  }, [padName]);

  // Helper to update codeFiles and broadcast/save them
  const updateCodeFiles = (newFiles: CodeFile[], broadcast = true) => {
    setCodeFiles(newFiles);
    if (padName) {
      localStorage.setItem(`syncpad_code_files_${padName}`, JSON.stringify(newFiles));
      savePadToCloud(padName, { codeFiles: newFiles });
      if (broadcast && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({
          type: 'code_edit',
          padName,
          codeFiles: newFiles,
          senderId: mySenderId.current
        }));
      }
    }
  };

  const handleCodeChange = (fileName: string, content: string) => {
    const updated = codeFiles.map(f => f.name === fileName ? { ...f, content } : f);
    updateCodeFiles(updated, true);
  };

  const lastCursorSentRef = useRef<{ position: any; selection: any; fileName: string } | null>(null);

  const handleCursorOrSelectionChange = useCallback((editor: any) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    
    const position = editor.getPosition();
    const selection = editor.getSelection();
    
    const posPayload = position ? { lineNumber: position.lineNumber, column: position.column } : null;
    const selPayload = selection ? {
      startLineNumber: selection.startLineNumber,
      startColumn: selection.startColumn,
      endLineNumber: selection.endLineNumber,
      endColumn: selection.endColumn
    } : null;

    const key = `${activeFileName}_${posPayload?.lineNumber}_${posPayload?.column}_${selPayload?.startLineNumber}_${selPayload?.startColumn}`;
    const lastKey = lastCursorSentRef.current ? `${lastCursorSentRef.current.fileName}_${lastCursorSentRef.current.position?.lineNumber}_${lastCursorSentRef.current.position?.column}_${lastCursorSentRef.current.selection?.startLineNumber}_${lastCursorSentRef.current.selection?.startColumn}` : '';
    
    if (key === lastKey) return;

    lastCursorSentRef.current = {
      position: posPayload,
      selection: selPayload,
      fileName: activeFileName
    };

    socketRef.current.send(JSON.stringify({
      type: 'cursor_move',
      padName,
      senderId: mySenderId.current,
      nickname: myNickname,
      color: myColor,
      fileName: activeFileName,
      position: posPayload,
      selection: selPayload
    }));
  }, [padName, myNickname, myColor, activeFileName]);

  const lastTextCursorSentRef = useRef<any>(null);

  const getInputCaretCoords = (input: HTMLInputElement) => {
    const selectionStart = input.selectionStart ?? 0;
    const selectionEnd = input.selectionEnd ?? 0;
    const text = input.value || '';
    const textBeforeCaret = text.substring(0, selectionStart);
    const textSelected = text.substring(selectionStart, selectionEnd);

    const div = document.createElement('div');
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre';
    
    const style = window.getComputedStyle(input);
    const properties = [
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
      'textTransform', 'paddingLeft', 'paddingRight', 'borderLeftWidth', 'boxSizing'
    ];
    properties.forEach(prop => {
      (div.style as any)[prop] = (style as any)[prop];
    });

    const textAlign = style.textAlign || 'left';
    div.style.textAlign = textAlign;
    
    const inputRect = input.getBoundingClientRect();
    div.style.width = `${inputRect.width}px`;

    const spanBefore = document.createElement('span');
    spanBefore.textContent = textBeforeCaret;
    div.appendChild(spanBefore);

    const caretSpan = document.createElement('span');
    if (selectionStart === selectionEnd) {
      caretSpan.textContent = '\u200b';
    } else {
      caretSpan.textContent = textSelected;
    }
    div.appendChild(caretSpan);

    document.body.appendChild(div);

    const divRect = div.getBoundingClientRect();
    const caretRect = caretSpan.getBoundingClientRect();

    document.body.removeChild(div);

    const width = selectionStart === selectionEnd ? 2 : caretRect.width;

    return {
      top: inputRect.top + (inputRect.height - (caretRect.height || 18)) / 2,
      left: caretRect.left,
      height: caretRect.height || 18,
      width
    };
  };

  const handleTextCursorChange = useCallback(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    if (activeTab !== 'text') return;

    const editor = editorRef.current;
    if (!editor) return;

    if (activeEditArea === 'header' || activeEditArea === 'footer') {
      const activeEl = document.activeElement as HTMLInputElement;
      if (activeEl && activeEl.tagName === 'INPUT' && activeEl.type === 'text') {
        const collapsed = activeEl.selectionStart === activeEl.selectionEnd;
        const rect = getInputCaretCoords(activeEl);
        if (rect) {
          const editorRect = editor.getBoundingClientRect();
          const textCursor = {
            top: rect.top - editorRect.top,
            left: rect.left - editorRect.left,
            height: rect.height,
            collapsed,
            width: rect.width,
            editArea: activeEditArea
          };

          const last = lastTextCursorSentRef.current;
          if (last &&
              Math.abs(last.top - textCursor.top) < 1 &&
              Math.abs(last.left - textCursor.left) < 1 &&
              last.height === textCursor.height &&
              last.collapsed === textCursor.collapsed &&
              Math.abs(last.width - textCursor.width) < 1) {
            return;
          }

          lastTextCursorSentRef.current = textCursor;

          socketRef.current.send(JSON.stringify({
            type: 'cursor_move',
            padName,
            senderId: mySenderId.current,
            nickname: myNickname,
            color: myColor,
            fileName: 'Texto/Notas',
            position: null,
            selection: null,
            textCursor
          }));
          return;
        }
      }
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;

    let rect: DOMRect | null = null;
    const collapsed = range.collapsed;

    try {
      if (collapsed) {
        const dummy = document.createElement('span');
        dummy.appendChild(document.createTextNode('\u200b'));
        const clone = range.cloneRange();
        clone.insertNode(dummy);
        rect = dummy.getBoundingClientRect();
        const parent = dummy.parentNode;
        if (parent) {
          parent.removeChild(dummy);
          parent.normalize();
        }
      } else {
        rect = range.getBoundingClientRect();
      }
    } catch (err) {
      rect = range.getBoundingClientRect();
    }

    if (!rect || (rect.width === 0 && rect.height === 0)) return;

    const editorRect = editor.getBoundingClientRect();
    const textCursor = {
      top: rect.top - editorRect.top + editor.scrollTop,
      left: rect.left - editorRect.left + editor.scrollLeft,
      height: rect.height || 18,
      collapsed,
      width: collapsed ? 2 : rect.width
    };

    const last = lastTextCursorSentRef.current;
    if (last &&
        Math.abs(last.top - textCursor.top) < 1 &&
        Math.abs(last.left - textCursor.left) < 1 &&
        last.height === textCursor.height &&
        last.collapsed === textCursor.collapsed &&
        Math.abs(last.width - textCursor.width) < 1) {
      return;
    }

    lastTextCursorSentRef.current = textCursor;

    socketRef.current.send(JSON.stringify({
      type: 'cursor_move',
      padName,
      senderId: mySenderId.current,
      nickname: myNickname,
      color: myColor,
      fileName: 'Texto/Notas',
      position: null,
      selection: null,
      textCursor
    }));
  }, [padName, myNickname, myColor, activeTab, activeEditArea]);

  useEffect(() => {
    if (activeTab === 'text') {
      handleTextCursorChange();
    }
  }, [activeEditArea, activeTab, handleTextCursorChange]);

  useEffect(() => {
    if (activeTab !== 'text') return;

    const onSelectionChange = () => {
      handleTextCursorChange();
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [activeTab, handleTextCursorChange]);

  useEffect(() => {
    handleCursorOrSelectionChangeRef.current = handleCursorOrSelectionChange;
  }, [handleCursorOrSelectionChange]);

  const updateMonacoDecorations = useCallback(() => {
    const editor = monacoEditorRef.current;
    if (!editor) return;

    const monaco = (window as any).monaco;
    if (!monaco) return;

    Object.entries(remoteCursorsRef.current).forEach(([senderId, info]: [string, any]) => {
      const oldDecorations = remoteDecorationsRef.current[senderId] || [];
      let newDecorations: any[] = [];

      if (info.fileName === activeFileName && info.position) {
        const { lineNumber, column } = info.position;
        const model = editor.getModel();
        if (model) {
          const maxLines = model.getLineCount();
          const targetLine = Math.min(lineNumber, maxLines);
          const maxCol = model.getLineMaxColumn(targetLine);
          const targetCol = Math.min(column, maxCol);

          newDecorations.push({
            range: new monaco.Range(targetLine, targetCol, targetLine, targetCol),
            options: {
              className: `remote-cursor-${senderId}`,
              cursorClassName: `remote-cursor-${senderId}`,
              hoverMessage: { value: `**${info.nickname || 'Colaborador'}** está aqui.` }
            }
          });

          if (info.selection) {
            const { startLineNumber, startColumn, endLineNumber, endColumn } = info.selection;
            if (startLineNumber !== endLineNumber || startColumn !== endColumn) {
              const cleanStartLine = Math.min(startLineNumber, maxLines);
              const cleanStartCol = Math.min(startColumn, model.getLineMaxColumn(cleanStartLine));
              const cleanEndLine = Math.min(endLineNumber, maxLines);
              const cleanEndCol = Math.min(endColumn, model.getLineMaxColumn(cleanEndLine));

              newDecorations.push({
                range: new monaco.Range(cleanStartLine, cleanStartCol, cleanEndLine, cleanEndCol),
                options: {
                  className: `remote-selection-${senderId}`,
                  hoverMessage: { value: `Seleção de **${info.nickname || 'Colaborador'}**` }
                }
              });
            }
          }
        }
      }

      try {
        const newIds = editor.deltaDecorations(oldDecorations, newDecorations);
        remoteDecorationsRef.current[senderId] = newIds;
      } catch (err) {
        console.error('Error updating remote decorations:', err);
      }
    });
  }, [activeFileName]);

  useEffect(() => {
    remoteCursorsRef.current = remoteCursors;
    updateMonacoDecorations();
  }, [remoteCursors, updateMonacoDecorations]);

  useEffect(() => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    
    if (activeTab === 'code' && monacoEditorRef.current) {
      handleCursorOrSelectionChange(monacoEditorRef.current);
    } else {
      const fileName = activeTab === 'text' ? 'Texto/Notas' : 'P2P Transfer';
      socketRef.current.send(JSON.stringify({
        type: 'cursor_move',
        padName,
        senderId: mySenderId.current,
        nickname: myNickname,
        color: myColor,
        fileName,
        position: null,
        selection: null
      }));
    }
  }, [activeTab, activeFileName, myNickname, myColor, handleCursorOrSelectionChange]);

  const formatCurrentDocument = (editor: any, monaco: any) => {
    if (!editor) return;

    try {
      const formatAction = editor.getAction('editor.action.formatDocument');
      if (formatAction) {
        formatAction.run().then(() => {
          showToast('Código formatado com sucesso!', 'success');
        }).catch((err: any) => {
          console.warn("Monaco built-in formatting failed:", err);
          fallbackFormat(editor);
        });
      } else {
        fallbackFormat(editor);
      }
    } catch (e) {
      fallbackFormat(editor);
    }
  };

  const fallbackFormat = (editor: any) => {
    try {
      const value = editor.getValue();
      if (activeFileName.endsWith('.json')) {
        const parsed = JSON.parse(value);
        const formatted = JSON.stringify(parsed, null, 2);
        editor.setValue(formatted);
        showToast('JSON formatado com sucesso!', 'success');
      } else {
        showToast('Não foi possível formatar automaticamente este arquivo.', 'info');
      }
    } catch (e) {
      showToast('Erro de sintaxe no arquivo. Não foi possível formatar.', 'error');
    }
  };

  // Dropdown UI states
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false);
  const [isColorDropdownOpen, setIsColorDropdownOpen] = useState(false);
  const [isAlignDropdownOpen, setIsAlignDropdownOpen] = useState(false);
  const isAnyFormatDropdownOpen = isFontDropdownOpen || isSizeDropdownOpen || isColorDropdownOpen || isAlignDropdownOpen;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isToolbarPinned, setIsToolbarPinned] = useState(true);

  // Cleanup effects on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
    };
  }, []);

  // Ensures all root-level content inside contenteditable is properly wrapped in block elements (e.g., <p>)
  // and that empty editor is initialized with a <p> tag to avoid bare text nodes.
  const enforcePageStructure = () => {
    const editor = editorRef.current;
    if (!editor) return;

    let changed = false;

    // Save selection / caret position safely
    const selection = window.getSelection();
    let savedRange: { startContainer: Node; startOffset: number; endContainer: Node; endOffset: number } | null = null;
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      savedRange = {
        startContainer: range.startContainer,
        startOffset: range.startOffset,
        endContainer: range.endContainer,
        endOffset: range.endOffset,
      };
    }

    const cleanHTML = editor.innerHTML.trim();
    if (cleanHTML === '' || cleanHTML === '<br>' || cleanHTML === '<br/>' || cleanHTML === '<p></p>') {
      editor.innerHTML = '<p><br></p>';
      changed = true;
    } else {
      // Wrap bare text nodes or inline elements at the root level in <p> tags
      const childNodes = Array.from(editor.childNodes) as Node[];
      childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const textVal = node.nodeValue || '';
          if (textVal.trim() !== '') {
            const p = document.createElement('p');
            editor.insertBefore(p, node);
            p.appendChild(node);
            changed = true;
          } else if (textVal === '\n' || textVal === '') {
            node.parentNode?.removeChild(node);
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const tagName = el.tagName.toUpperCase();
          const isBlock = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'BLOCKQUOTE', 'PRE', 'HR', 'TABLE', 'SECTION'].includes(tagName);
          
          if (!isBlock) {
            const p = document.createElement('p');
            editor.insertBefore(p, el);
            p.appendChild(el);
            changed = true;
          }
        }
      });
    }

    if (changed) {
      const html = editor.innerHTML;
      setText(html);
      
      // Re-measure content height based on the wrapped children
      const children = Array.from(editor.children);
      const PAGE_HEIGHT = 1150;
      let contentHeight = PAGE_HEIGHT;
      if (children.length > 0) {
        const lastChild = children[children.length - 1] as HTMLElement;
        contentHeight = lastChild.offsetTop + lastChild.offsetHeight + 80;
      }
      setEditorHeight(Math.max(PAGE_HEIGHT, contentHeight));

      // Restore caret selection safely if the container is still present in DOM
      if (savedRange && selection) {
        try {
          const range = document.createRange();
          if (document.body.contains(savedRange.startContainer)) {
            range.setStart(savedRange.startContainer, savedRange.startOffset);
            range.setEnd(savedRange.endContainer, savedRange.endOffset);
            selection.removeAllRanges();
            selection.addRange(range);
          } else {
            // Fallback: place cursor at the end of the first paragraph
            const firstP = editor.querySelector('p');
            if (firstP) {
              range.selectNodeContents(firstP);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
            }
          }
        } catch (e) {
          console.warn('Failed to restore selection after auto-wrapping:', e);
        }
      }
    }
  };

  // Adjusts direct children of contenteditable to skip page header/footer boundaries
  const adjustPageMargins = () => {
    const editor = editorRef.current;
    if (!editor || isAdjustingRef.current) return;

    isAdjustingRef.current = true;
    try {
      const children = Array.from(editor.children);
      const PAGE_HEIGHT = 1150;
      const HEADER_MARGIN = 80;
      const FOOTER_MARGIN = 80;

      // 1. Reset all margins to '' so we can measure clean, natural offsets
      children.forEach(child => {
        if (child instanceof HTMLElement) {
          child.style.marginTop = '';
        }
      });

      // Force a single layout reflow to ensure offsets are measured from clean natural states
      void editor.offsetHeight;

      const newMargins: string[] = new Array(children.length).fill('');

      // 2. Iterate and calculate margins sequentially
      children.forEach((child, idx) => {
        if (!(child instanceof HTMLElement)) return;

        // Apply previous elements' calculated margins temporarily so this child's offsetTop is calculated relative to them
        for (let i = 0; i < idx; i++) {
          if (newMargins[i]) {
            (children[i] as HTMLElement).style.marginTop = newMargins[i];
          }
        }

        const top = child.offsetTop;
        const height = child.offsetHeight;
        const bottom = top + height;

        const pageIndex = Math.floor(top / PAGE_HEIGHT);
        const pageStart = pageIndex * PAGE_HEIGHT;
        const pageEnd = (pageIndex + 1) * PAGE_HEIGHT;

        const usableStart = pageStart + HEADER_MARGIN;
        const usableEnd = pageEnd - FOOTER_MARGIN;

        if (top >= pageStart && top < usableStart) {
          const neededPush = usableStart - top;
          if (neededPush > 0) {
            newMargins[idx] = `${neededPush}px`;
          }
        } else if (bottom > usableEnd || top >= usableEnd) {
          const nextPageUsableStart = (pageIndex + 1) * PAGE_HEIGHT + HEADER_MARGIN;
          const neededPush = nextPageUsableStart - top;
          if (neededPush > 0) {
            newMargins[idx] = `${neededPush}px`;
          }
        }
      });

      // 3. Set the final computed margins on all children cleanly
      children.forEach((child, idx) => {
        if (child instanceof HTMLElement) {
          child.style.marginTop = newMargins[idx];
        }
      });

      // 4. Update the editor height based on the final pushed position of the last child
      let contentHeight = PAGE_HEIGHT;
      if (children.length > 0) {
        const lastChild = children[children.length - 1] as HTMLElement;
        contentHeight = lastChild.offsetTop + lastChild.offsetHeight + 80;
      }
      setEditorHeight(Math.max(PAGE_HEIGHT, contentHeight));
    } finally {
      isAdjustingRef.current = false;
    }
  };

  // Keep page margins updated when text state updates from server or history
  useEffect(() => {
    enforcePageStructure();
    adjustPageMargins();
  }, [text]);

  // Keep editor content height synced for paginated A4 rendering
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Set initial scrollHeight and margins
    enforcePageStructure();
    adjustPageMargins();

    let lastWidth = editor.clientWidth;

    const observer = new ResizeObserver((entries) => {
      if (editor) {
        const rect = entries[0]?.contentRect;
        const currentWidth = rect ? rect.width : editor.clientWidth;
        
        // Only run margin adjustment if width changed (prevents infinite layout loops from height adjustments)
        if (currentWidth !== lastWidth) {
          lastWidth = currentWidth;
          enforcePageStructure();
          adjustPageMargins();
        }
      }
    });

    observer.observe(editor);
    return () => {
      observer.disconnect();
    };
  }, [activeTab]);

  // Restore editor content when switching back to the text editor tab
  useEffect(() => {
    if (activeTab === 'text' && editorRef.current) {
      if (editorRef.current.innerHTML !== textRef.current) {
        editorRef.current.innerHTML = textRef.current || '<p><br></p>';
      }
      enforcePageStructure();
      adjustPageMargins();
    }
  }, [activeTab]);

  // Synchronizes header and footer edits and style adjustments in real-time
  const syncHeaderFooterState = (overrides?: {
    headerText?: string;
    footerText?: string;
    headerAlign?: 'ESQUERDA' | 'CENTRO' | 'DIREITA' | 'JUSTIFICADO';
    headerFont?: 'mono' | 'sans' | 'serif';
    headerFontSize?: number;
    headerColor?: string;
    headerBold?: boolean;
    headerItalic?: boolean;
    headerUnderline?: boolean;
    footerAlign?: 'ESQUERDA' | 'CENTRO' | 'DIREITA' | 'JUSTIFICADO';
    footerFont?: 'mono' | 'sans' | 'serif';
    footerFontSize?: number;
    footerColor?: string;
    footerBold?: boolean;
    footerItalic?: boolean;
    footerUnderline?: boolean;
  }) => {
    const nextVersion = versionRef.current + 1;
    setVersion(nextVersion);

    savePadToCloud(padName || 'default', {
      text: editorRef.current ? editorRef.current.innerHTML : text,
      headerText: overrides?.headerText !== undefined ? overrides.headerText : headerText,
      footerText: overrides?.footerText !== undefined ? overrides.footerText : footerText,
    });
  };

  // Handles contenteditable input and synchronization
  const handleEditorInput = () => {
    if (!editorRef.current) return;
    
    // Auto-adjust page boundaries inside children
    enforcePageStructure();
    adjustPageMargins();
    
    const html = editorRef.current.innerHTML;
    setText(html);

    savePadToCloud(padName || 'default', { text: html });

    const nextVersion = versionRef.current + 1;
    setVersion(nextVersion);
  };

  // Listen to clicks on the editor to handle checkbox state updates
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    enforcePageStructure();
    adjustPageMargins();

    const target = e.target as HTMLElement;
    if (target && target.nodeName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
      const checkbox = target as HTMLInputElement;
      
      // Toggle checked state
      const isChecked = !checkbox.hasAttribute('checked');
      if (isChecked) {
        checkbox.setAttribute('checked', 'checked');
        checkbox.checked = true;
      } else {
        checkbox.removeAttribute('checked');
        checkbox.checked = false;
      }
      
      e.stopPropagation();
      
      // Trigger editor input to sync state
      handleEditorInput();
    }
  };

  // Format helper to insert text nicely in a contenteditable div
  const insertText = (beforeText: string, afterText: string = '') => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      
      const textToInsert = beforeText + afterText;
      const textNode = document.createTextNode(textToInsert);
      range.insertNode(textNode);
      
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      editor.innerHTML += beforeText + afterText;
    }

    handleEditorInput();
  };

  // Helper to insert formatted HTML directly into the contenteditable div
  const insertHtml = (htmlContent: string) => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      
      const div = document.createElement('div');
      div.innerHTML = htmlContent;
      
      const fragment = document.createDocumentFragment();
      let lastNode: ChildNode | null = null;
      while (div.firstChild) {
        lastNode = div.firstChild;
        fragment.appendChild(lastNode);
      }
      
      range.insertNode(fragment);
      
      if (lastNode) {
        const newRange = document.createRange();
        newRange.setStartAfter(lastNode);
        newRange.setEndAfter(lastNode);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }
    } else {
      editor.innerHTML += htmlContent;
    }

    handleEditorInput();
  };

  // Helper to apply inline styles specifically to selected text in the contenteditable area
  const applyInlineStyleToSelection = (styleName: string, styleValue: string) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      const span = document.createElement('span');
      span.style.setProperty(styleName, styleValue);
      span.innerHTML = '&#8203;'; // zero-width space
      range.insertNode(span);
      
      const newRange = document.createRange();
      newRange.setStart(span.firstChild!, 1);
      newRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(newRange);
      return;
    }

    try {
      const contents = range.extractContents();
      const span = document.createElement('span');
      span.style.setProperty(styleName, styleValue);
      span.appendChild(contents);
      range.insertNode(span);
      
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(newRange);
    } catch (e) {
      console.error("Error applying style to selection:", e);
    }
    
    handleEditorInput();
  };

  // Main toolbar actions formatter
  const handleFormat = (type: string, value?: string) => {
    if (activeEditArea === 'header') {
      let nextBold = headerBold;
      let nextItalic = headerItalic;
      let nextUnderline = headerUnderline;
      let nextAlign = headerAlign;
      let nextFont = headerFont;
      let nextFontSize = headerFontSize;
      let nextColor = headerColor;

      switch (type) {
        case 'bold':
          nextBold = !headerBold;
          setHeaderBold(nextBold);
          break;
        case 'italic':
          nextItalic = !headerItalic;
          setHeaderItalic(nextItalic);
          break;
        case 'underline':
          nextUnderline = !headerUnderline;
          setHeaderUnderline(nextUnderline);
          break;
        case 'align': {
          const val = (value?.toUpperCase() as any) || 'CENTRO';
          nextAlign = val;
          setHeaderAlign(val);
          setEditorTextAlign(val);
          break;
        }
        case 'font': {
          const val = (value as any) || 'sans';
          nextFont = val;
          setHeaderFont(val);
          setEditorFont(val);
          break;
        }
        case 'fontSize': {
          const val = Number(value) || 12;
          nextFontSize = val;
          setHeaderFontSize(val);
          setEditorFontSize(val);
          break;
        }
        case 'color': {
          const val = value || 'DEFAULT';
          nextColor = val;
          setHeaderColor(val);
          setEditorTextColor(val);
          break;
        }
        case 'eraser':
          nextBold = false;
          nextItalic = false;
          nextUnderline = false;
          nextAlign = 'CENTRO';
          nextFont = 'sans';
          nextFontSize = 12;
          nextColor = 'DEFAULT';
          setHeaderBold(false);
          setHeaderItalic(false);
          setHeaderUnderline(false);
          setHeaderAlign('CENTRO');
          setHeaderFont('sans');
          setHeaderFontSize(12);
          setHeaderColor('DEFAULT');
          setEditorTextAlign('CENTRO');
          setEditorFont('sans');
          setEditorFontSize(12);
          setEditorTextColor('DEFAULT');
          break;
        default:
          break;
      }
      syncHeaderFooterState({
        headerBold: nextBold,
        headerItalic: nextItalic,
        headerUnderline: nextUnderline,
        headerAlign: nextAlign,
        headerFont: nextFont,
        headerFontSize: nextFontSize,
        headerColor: nextColor,
      });
      return;
    }

    if (activeEditArea === 'footer') {
      let nextBold = footerBold;
      let nextItalic = footerItalic;
      let nextUnderline = footerUnderline;
      let nextAlign = footerAlign;
      let nextFont = footerFont;
      let nextFontSize = footerFontSize;
      let nextColor = footerColor;

      switch (type) {
        case 'bold':
          nextBold = !footerBold;
          setFooterBold(nextBold);
          break;
        case 'italic':
          nextItalic = !footerItalic;
          setFooterItalic(nextItalic);
          break;
        case 'underline':
          nextUnderline = !footerUnderline;
          setFooterUnderline(nextUnderline);
          break;
        case 'align': {
          const val = (value?.toUpperCase() as any) || 'CENTRO';
          nextAlign = val;
          setFooterAlign(val);
          setEditorTextAlign(val);
          break;
        }
        case 'font': {
          const val = (value as any) || 'sans';
          nextFont = val;
          setFooterFont(val);
          setEditorFont(val);
          break;
        }
        case 'fontSize': {
          const val = Number(value) || 10;
          nextFontSize = val;
          setFooterFontSize(val);
          setEditorFontSize(val);
          break;
        }
        case 'color': {
          const val = value || 'DEFAULT';
          nextColor = val;
          setFooterColor(val);
          setEditorTextColor(val);
          break;
        }
        case 'eraser':
          nextBold = false;
          nextItalic = false;
          nextUnderline = false;
          nextAlign = 'CENTRO';
          nextFont = 'sans';
          nextFontSize = 10;
          nextColor = 'DEFAULT';
          setFooterBold(false);
          setFooterItalic(false);
          setFooterUnderline(false);
          setFooterAlign('CENTRO');
          setFooterFont('sans');
          setFooterFontSize(10);
          setFooterColor('DEFAULT');
          setEditorTextAlign('CENTRO');
          setEditorFont('sans');
          setEditorFontSize(10);
          setEditorTextColor('DEFAULT');
          break;
        default:
          break;
      }
      syncHeaderFooterState({
        footerBold: nextBold,
        footerItalic: nextItalic,
        footerUnderline: nextUnderline,
        footerAlign: nextAlign,
        footerFont: nextFont,
        footerFontSize: nextFontSize,
        footerColor: nextColor,
      });
      return;
    }

    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();

    switch (type) {
      case 'bold':
        document.execCommand('bold', false);
        break;
      case 'italic':
        document.execCommand('italic', false);
        break;
      case 'underline':
        document.execCommand('underline', false);
        break;
      case 'blockquote':
        document.execCommand('formatBlock', false, 'blockquote');
        break;
      case 'code':
        document.execCommand('formatBlock', false, 'pre');
        break;
      case 'list':
        document.execCommand('insertUnorderedList', false);
        break;
      case 'checklist':
        document.execCommand('insertHTML', false, `
          <ul class="task-list" style="list-style-type: none; padding-left: 0.5rem; margin-bottom: 1rem;">
            <li class="task-list-item" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem;">
              <input type="checkbox" class="task-list-item-checkbox" style="width: 1rem; height: 1rem; accent-color: #3b82f6; cursor: pointer; flex-shrink: 0;" />
              <span>&nbsp;</span>
            </li>
          </ul>
        `);
        break;
      case 'link':
        const url = prompt('Digite o link:', 'https://');
        if (url) {
          document.execCommand('createLink', false, url);
        }
        break;
      case 'highlight':
        // Highlight in blue matching the blue accent color of the application
        document.execCommand('backColor', false, '#3b82f6');
        break;
      case 'color':
        if (value && value !== 'DEFAULT') {
          applyInlineStyleToSelection('color', value);
        } else {
          applyInlineStyleToSelection('color', 'inherit');
        }
        break;
      case 'align':
        const alignVal = value ? value.toUpperCase() : 'LEFT';
        if (alignVal === 'CENTRO') {
          document.execCommand('justifyCenter', false);
        } else if (alignVal === 'DIREITA') {
          document.execCommand('justifyRight', false);
        } else if (alignVal === 'JUSTIFICADO') {
          document.execCommand('justifyFull', false);
        } else {
          document.execCommand('justifyLeft', false);
        }
        break;
      case 'font':
        if (value) {
          let fontFamilyValue = 'ui-sans-serif, system-ui, sans-serif';
          if (value === 'mono') {
            fontFamilyValue = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
          } else if (value === 'serif') {
            fontFamilyValue = 'ui-serif, Georgia, Cambria, "Times New Roman", serif';
          }
          applyInlineStyleToSelection('font-family', fontFamilyValue);
        }
        break;
      case 'fontSize':
        if (value) {
          applyInlineStyleToSelection('font-size', `${value}px`);
        }
        break;
      case 'eraser':
        document.execCommand('removeFormat', false);
        break;
      case 'undo':
        document.execCommand('undo', false);
        break;
      case 'redo':
        document.execCommand('redo', false);
        break;
      default:
        break;
    }

    // Trigger update after formatting
    handleEditorInput();
  };

  const handleCopy = async () => {
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString() : '';
    if (selectedText) {
      try {
        await navigator.clipboard.writeText(selectedText);
        showToast('Texto copiado com sucesso!', 'success');
      } catch (err) {
        document.execCommand('copy');
        showToast('Texto copiado!', 'success');
      }
    }
    setEditorContextMenu(null);
  };

  const handleCut = async () => {
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString() : '';
    if (selectedText) {
      try {
        await navigator.clipboard.writeText(selectedText);
      } catch (err) {
        document.execCommand('copy');
      }
      document.execCommand('delete');
      handleEditorInput();
      showToast('Texto recortado!', 'success');
    }
    setEditorContextMenu(null);
  };

  const handlePaste = async () => {
    try {
      const textFromClipboard = await navigator.clipboard.readText();
      if (textFromClipboard) {
        document.execCommand('insertText', false, textFromClipboard);
        handleEditorInput();
        showToast('Texto colado!', 'success');
      } else {
        showToast('Área de transferência vazia ou sem permissão.', 'info');
      }
    } catch (err) {
      showToast('Dica: Use Ctrl+V (ou Cmd+V) para colar.', 'info');
    }
    setEditorContextMenu(null);
  };

  const handleSelectAll = () => {
    const editor = editorRef.current;
    if (editor) {
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    setEditorContextMenu(null);
  };

  // Map state styling to tailwind classes for the textarea
  const getEditorStyles = () => {
    // We keep a clean, uniform default layout for the editor container.
    // Dynamic styles (font-family, font-size, color, alignment) will be applied
    // directly on selected paragraphs or text selections, preventing entire-document overrides.
    const fontClass = 'font-sans';
    const sizeClass = 'text-base';
    const alignClass = 'text-left';
    const colorClass = isDarkMode ? 'text-[#e0e0e0]' : 'text-slate-800';

    return `${fontClass} ${sizeClass} ${alignClass} ${colorClass}`;
  };

  // AI Autocomplete Handler
  const handleAiAutocomplete = async () => {
    const editor = editorRef.current;
    if (!editor || isAiCompleting) return;

    editor.focus();

    let textBefore = '';
    let textAfter = '';

    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      
      const preRange = range.cloneRange();
      preRange.selectNodeContents(editor);
      preRange.setEnd(range.startContainer, range.startOffset);
      textBefore = preRange.toString();

      const postRange = range.cloneRange();
      postRange.selectNodeContents(editor);
      postRange.setStart(range.endContainer, range.endOffset);
      textAfter = postRange.toString();
    } else {
      textBefore = editor.innerText;
    }

    setIsAiCompleting(true);
    try {
      const response = await fetch('/api/ai/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ textBefore, textAfter }),
      });

      if (!response.ok) {
        throw new Error('Falha na resposta da IA');
      }

      const data = await response.json();
      if (data.completion) {
        insertText(data.completion);
        showToast('Texto autocompletado com sucesso!', 'success');
      } else {
        showToast('Nenhuma sugestão encontrada para o contexto atual.', 'info');
      }
    } catch (err: any) {
      console.error(err);
      showToast('Erro ao autocompletar com IA: ' + err.message, 'error');
    } finally {
      setIsAiCompleting(false);
    }
  };

  // Auxiliar para processamento inteligente de pontuação e formatação no ditado por voz
  const processVoiceTranscript = (text: string): string => {
    let formatted = text;

    // 1. Substituições de termos falados em português para pontuações e quebras de linha
    // IMPORTANTE: Substituir termos mais longos e específicos primeiro para evitar substituições parciais incorretas.

    // Termos compostos e específicos de 3 ou mais palavras:
    formatted = formatted.replace(/\b(ponto e nova linha|ponto novo parágrafo|ponto novo paragrafo)\b/gi, '.\n\n');
    formatted = formatted.replace(/\b(ponto de interrogação|ponto de interrogacao)\b/gi, '?');
    formatted = formatted.replace(/\b(ponto de exclamação|ponto de exclamacao)\b/gi, '!');
    formatted = formatted.replace(/\b(ponto e vírgula|ponto e virgula)\b/gi, ';');
    formatted = formatted.replace(/\b(abrir parênteses|abrir parenteses)\b/gi, ' (');
    formatted = formatted.replace(/\b(fechar parênteses|fechar parenteses)\b/gi, ') ');

    // Termos de 2 palavras:
    formatted = formatted.replace(/\b(ponto nova linha|ponto parágrafo|ponto paragrafo|ponto e parágrafo|ponto e paragrafo)\b/gi, '.\n\n');
    formatted = formatted.replace(/\b(novo parágrafo|novo paragrafo|nova linha)\b/gi, '\n\n');
    formatted = formatted.replace(/\b(ponto final)\b/gi, '.');
    formatted = formatted.replace(/\b(dois pontos)\b/gi, ':');
    formatted = formatted.replace(/\b(abrir aspas)\b/gi, ' "');
    formatted = formatted.replace(/\b(fechar aspas)\b/gi, '" ');

    // Termos de 1 palavra:
    formatted = formatted.replace(/\b(vírgula|virgula)\b/gi, ',');
    formatted = formatted.replace(/\b(interrogação|interrogacao)\b/gi, '?');
    formatted = formatted.replace(/\b(exclamação|exclamacao)\b/gi, '!');
    formatted = formatted.replace(/\b(reticências|reticencias)\b/gi, '...');
    formatted = formatted.replace(/\b(parágrafo|paragrafo)\b/gi, '\n\n');
    formatted = formatted.replace(/\b(ponto)\b/gi, '.');

    // 2. Ajustar espaçamento em torno das pontuações inseridas:
    // Remove espaços antes de vírgulas, pontos, etc.
    formatted = formatted.replace(/\s+([,.:;?!])/g, '$1');
    
    // Garante um espaço após pontuações se o caractere seguinte for letra ou número
    formatted = formatted.replace(/([,.:;?!])(?=[A-Za-z0-9À-ÿ])/g, '$1 ');

    // 3. Capitalizar a primeira letra após pontos finais, exclamações, interrogações ou novas linhas
    formatted = formatted.replace(/(^|[.!?]\s+)([a-zà-ÿ])/g, (match, p1, p2) => p1 + p2.toUpperCase());
    formatted = formatted.replace(/(\n+\s*)([a-zà-ÿ])/g, (match, p1, p2) => p1 + p2.toUpperCase());

    // Capitaliza a primeira letra do trecho caso comece com letra minúscula
    if (formatted.length > 0) {
      formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }

    return formatted;
  };

  // Speech-to-Text Dictation Handler
  const handleVoiceToText = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsListening(false);
      setInterimTranscript('');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('O seu navegador não suporta reconhecimento de voz direto.', 'error');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'pt-BR';

      recognition.onstart = () => {
        setIsListening(true);
        setInterimTranscript('');
        showToast('Microfone ativo. Fale agora...', 'info');
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptPart = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            if (transcriptPart) {
              const processed = processVoiceTranscript(transcriptPart);
              insertText(processed + ' ');
            }
          } else {
            interim += transcriptPart;
          }
        }
        setInterimTranscript(interim);
      };

      recognition.onerror = (event: any) => {
        console.error('Erro de reconhecimento de voz:', event.error);
        if (event.error !== 'no-speech') {
          let msg = event.error;
          if (event.error === 'not-allowed') {
            msg = 'Acesso ao microfone não permitido. Verifique as permissões de privacidade do seu navegador ou do iframe.';
          }
          showToast('Erro de reconhecimento de voz: ' + msg, 'error');
          setIsListening(false);
          setInterimTranscript('');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      console.error(e);
      showToast('Erro ao iniciar voz: ' + e.message, 'error');
    }
  };

  // Audio Recording Helpers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      setRecordingDuration(0);

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setRecordingState('review');
        
        // release mic stream
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecordingState('recording');

      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      showToast('Gravando áudio...', 'info');
    } catch (err: any) {
      console.error('Erro de gravação:', err);
      let errMsg = 'Erro ao acessar o microfone para gravação.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errMsg = 'Acesso ao microfone negado. Verifique as configurações de privacidade do seu navegador ou as permissões do iframe.';
      }
      showToast(errMsg, 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recordingState === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
  };

  const togglePlayAudio = () => {
    if (!audioUrl) return;

    if (isAudioPlaying) {
      audioPlayerRef.current?.pause();
      setIsAudioPlaying(false);
    } else {
      if (!audioPlayerRef.current) {
        audioPlayerRef.current = new Audio(audioUrl);
        audioPlayerRef.current.onended = () => {
          setIsAudioPlaying(false);
        };
      } else if (audioPlayerRef.current.src !== audioUrl) {
        audioPlayerRef.current.src = audioUrl;
        audioPlayerRef.current.onended = () => {
          setIsAudioPlaying(false);
        };
      }
      audioPlayerRef.current.play();
      setIsAudioPlaying(true);
    }
  };

  const handleProcessAudio = async () => {
    if (!audioBlob) {
      showToast('Nenhum áudio gravado para processar', 'error');
      return;
    }

    setIsProcessingAudio(true);
    showToast('Processando áudio por IA... Por favor, aguarde.', 'info');
    try {
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        try {
          const base64data = (reader.result as string).split(',')[1];
          
          const response = await fetch('/api/ai/process-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audio: base64data,
              mimeType: audioBlob.type || 'audio/webm',
              format: selectedFormat
            }),
          });

          if (!response.ok) {
            throw new Error('Erro ao processar áudio pela IA');
          }

          const data = await response.json();
          if (data.result) {
            // Converte o Markdown da IA para HTML sanitizado para renderizar com formatação no editor
            const markdownHtml = sanitizeHtml(marked.parse(data.result) as string);
            insertHtml('<br/><br/>' + markdownHtml);
            showToast('Áudio processado e conteúdo inserido!', 'success');
            handleDeleteAudio();
          } else {
            showToast('Nenhum resultado retornado do processamento.', 'error');
          }
        } catch (innerErr: any) {
          console.error(innerErr);
          showToast('Erro ao processar áudio: ' + innerErr.message, 'error');
        } finally {
          setIsProcessingAudio(false);
        }
      };
    } catch (err: any) {
      console.error(err);
      showToast('Erro ao carregar gravação: ' + err.message, 'error');
      setIsProcessingAudio(false);
    }
  };

  const handleDeleteAudio = () => {
    setRecordingState('idle');
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl('');
    }
    setRecordingDuration(0);
    setIsAudioPlaying(false);
    if (audioPlayerRef.current) {
      try {
        audioPlayerRef.current.pause();
      } catch (e) {}
      audioPlayerRef.current = null;
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };



  // Sync reference value of version to avoid stale closures in listeners
  useEffect(() => {
    versionRef.current = version;
  }, [version]);

  // Sync reference value of text to avoid stale closures in listeners
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Handle URL change detection (e.g. browser back button)
  useEffect(() => {
    const handlePopState = () => {
      let path = window.location.pathname;
      if (path.startsWith('/')) path = path.substring(1);
      if (path.endsWith('/')) path = path.substring(0, path.length - 1);
      setPadName(path ? decodeURIComponent(path) : '');
      // Reset text states when switching pad URLs
      setText('');
      setVersion(0);
      setVersions([]);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync Dark Mode state to root HTML element and clean up legacy hardcoded text colors
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }

    // Clean up any hardcoded default text colors in the current editor content when the theme changes,
    // converting them to 'inherit' so that they adapt beautifully and remain perfectly readable.
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const div = document.createElement('div');
      div.innerHTML = html;
      const spans = div.querySelectorAll('span');
      let changed = false;
      spans.forEach(span => {
        const color = span.style.color;
        if (
          color === 'rgb(224, 224, 224)' || 
          color === '#e0e0e0' || 
          color === '#E0E0E0' || 
          color === 'rgb(30, 41, 59)' || 
          color === '#1e293b' || 
          color === '#1E293B'
        ) {
          span.style.color = 'inherit';
          changed = true;
        }
      });
      if (changed) {
        const updatedHtml = div.innerHTML;
        editorRef.current.innerHTML = updatedHtml;
        setText(updatedHtml);
        
        const nextVersion = versionRef.current + 1;
        setVersion(nextVersion);
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          const editMsg: ClientMessage = {
            type: 'edit',
            padName,
            text: updatedHtml,
            version: nextVersion,
            senderId: mySenderId.current,
          };
          socketRef.current.send(JSON.stringify(editMsg));
        }
      }
    }
  }, [isDarkMode, padName]);

  // Toast utility helper
  const showToast = (
    message: string, 
    type: 'success' | 'error' | 'info' = 'success',
    duration = 3000,
    undoAction?: { label: string; onClick: () => void }
  ) => {
    setToast({ message, type, undoAction });
    const timer = setTimeout(() => {
      setToast(null);
    }, duration);
    return () => clearTimeout(timer);
  };

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = () => {
      setIsExportDropdownOpen(false);
      setIsFontDropdownOpen(false);
      setIsSizeDropdownOpen(false);
      setIsColorDropdownOpen(false);
      setIsAlignDropdownOpen(false);
      setIsMobileMenuOpen(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // 6. WebSocket Connection Logic
  useEffect(() => {
    if (!padName) return;

    let isCurrent = true;

    setConnectionStatus('connecting');

    const connectWebSocket = () => {
      if (socketRef.current) {
        socketRef.current.close();
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socketUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(socketUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isCurrent) return;
        setConnectionStatus('connected');
        setAuthError('');
        // Immediately try to join room
        const joinMsg: ClientMessage = {
          type: 'join',
          padName,
          password: passwordCached || undefined,
          senderId: mySenderId.current,
        };
        ws.send(JSON.stringify(joinMsg));
      };

      ws.onmessage = (event) => {
        if (!isCurrent) return;
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          
          if (msg.type === 'auth_required') {
            setConnectionStatus('auth_required');
            setAuthError('');
            return;
          }

          if (msg.type === 'auth_failed') {
            setConnectionStatus('auth_required');
            setAuthError(msg.message || 'Senha incorreta.');
            return;
          }

          if (msg.type === 'sync') {
            if (connectionStatus === 'auth_required' || connectionStatus === 'connecting') {
              setConnectionStatus('connected');
              setAuthError('');
            }
            
            setHasPassword(!!msg.hasPassword);
            setVersion(msg.version);
            setUpdatedAt(msg.updatedAt);

            // Synchronize header/footer texts and style variables from network if they exist
            if ('headerText' in msg && msg.headerText !== undefined) setHeaderText(msg.headerText || '');
            if ('footerText' in msg && msg.footerText !== undefined) setFooterText(msg.footerText || '');
            if ('headerAlign' in msg && msg.headerAlign !== undefined) setHeaderAlign(msg.headerAlign);
            if ('headerFont' in msg && msg.headerFont !== undefined) setHeaderFont(msg.headerFont);
            if ('headerFontSize' in msg && msg.headerFontSize !== undefined) setHeaderFontSize(Number(msg.headerFontSize) || 12);
            if ('headerColor' in msg && msg.headerColor !== undefined) setHeaderColor(msg.headerColor || 'DEFAULT');
            if ('headerBold' in msg && msg.headerBold !== undefined) setHeaderBold(!!msg.headerBold);
            if ('headerItalic' in msg && msg.headerItalic !== undefined) setHeaderItalic(!!msg.headerItalic);
            if ('headerUnderline' in msg && msg.headerUnderline !== undefined) setHeaderUnderline(!!msg.headerUnderline);
            if ('footerAlign' in msg && msg.footerAlign !== undefined) setFooterAlign(msg.footerAlign);
            if ('footerFont' in msg && msg.footerFont !== undefined) setFooterFont(msg.footerFont);
            if ('footerFontSize' in msg && msg.footerFontSize !== undefined) setFooterFontSize(Number(msg.footerFontSize) || 10);
            if ('footerColor' in msg && msg.footerColor !== undefined) setFooterColor(msg.footerColor || 'DEFAULT');
            if ('footerBold' in msg && msg.footerBold !== undefined) setFooterBold(!!msg.footerBold);
            if ('footerItalic' in msg && msg.footerItalic !== undefined) setFooterItalic(!!msg.footerItalic);
            if ('footerUnderline' in msg && msg.footerUnderline !== undefined) setFooterUnderline(!!msg.footerUnderline);

            // Handle contenteditable sync to prevent cursor jumping
            const localEditor = editorRef.current;
            if (localEditor && localEditor.innerHTML !== msg.text) {
              setText(msg.text);
              localEditor.innerHTML = msg.text;
            } else {
              setText(msg.text);
            }

            // Sync Code Files
            if (msg.codeFiles && msg.codeFiles.length > 0) {
              setCodeFiles(msg.codeFiles);
              setActiveFileName(prev => {
                if (msg.codeFiles!.some(f => f.name === prev)) return prev;
                const hasIndexHtml = msg.codeFiles!.some(f => f.name === 'index.html');
                return hasIndexHtml ? 'index.html' : msg.codeFiles![0].name;
              });
            } else {
              // If server has no codeFiles, initialize from localStorage or DEFAULT_CODE_FILES
              let initialFiles = DEFAULT_CODE_FILES;
              const saved = localStorage.getItem(`syncpad_code_files_${padName}`);
              if (saved) {
                try {
                  const parsed = JSON.parse(saved);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    initialFiles = parsed;
                  }
                } catch (e) {}
              }
              setCodeFiles(initialFiles);
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'code_edit',
                  padName,
                  codeFiles: initialFiles,
                  senderId: mySenderId.current
                }));
              }
              setActiveFileName(prev => {
                if (initialFiles.some(f => f.name === prev)) return prev;
                const hasIndexHtml = initialFiles.some(f => f.name === 'index.html');
                return hasIndexHtml ? 'index.html' : initialFiles[0].name;
              });
            }
          }

          if (msg.type === 'code_sync') {
            setCodeFiles(msg.codeFiles);
            setActiveFileName(prev => {
              if (msg.codeFiles.some(f => f.name === prev)) return prev;
              const hasIndexHtml = msg.codeFiles.some(f => f.name === 'index.html');
              return hasIndexHtml ? 'index.html' : msg.codeFiles[0].name;
            });
          }

          if (msg.type === 'presence') {
            setActiveUsers(msg.activeUsersCount);
            if (msg.activeUserIds) {
              setActiveUserIds(msg.activeUserIds);
              // Clean up remote cursors for users who left
              setRemoteCursors(prev => {
                const next = { ...prev };
                let changed = false;
                Object.keys(next).forEach(senderId => {
                  if (!msg.activeUserIds!.includes(senderId)) {
                    delete next[senderId];
                    changed = true;
                    // Also clear their decorations in Monaco
                    if (monacoEditorRef.current && remoteDecorationsRef.current[senderId]) {
                      try {
                        monacoEditorRef.current.deltaDecorations(remoteDecorationsRef.current[senderId], []);
                      } catch (err) {}
                      delete remoteDecorationsRef.current[senderId];
                    }
                  }
                });
                return changed ? next : prev;
              });
            }
            if (msg.peerIds) {
              setPeerIdsMap(msg.peerIds);
            }
          }

          if (msg.type === 'cursor_update') {
            const { senderId, nickname, color, fileName, position, selection, textCursor } = msg;
            if (senderId !== mySenderId.current) {
              setRemoteCursors(prev => ({
                ...prev,
                [senderId]: {
                  nickname,
                  color,
                  fileName,
                  position,
                  selection,
                  textCursor,
                  lastUpdate: Date.now()
                }
              }));
            }
          }

          if (msg.type === 'history') {
            setVersions(msg.versions);
          }

          if (msg.type === 'password_set_success') {
            setHasPassword(msg.hasPassword);
            showToast(
              msg.hasPassword ? 'Bloco protegido com senha com sucesso!' : 'Segurança por senha desativada.',
              'success'
            );
          }

          if (msg.type === 'error') {
            showToast(msg.message, 'error');
          }
        } catch (e) {
          console.error('Error handling WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        if (!isCurrent) return;
        setConnectionStatus('disconnected');
        // Auto-reconnect after 4 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (padName && isCurrent) connectWebSocket();
        }, 4000);
      };

      ws.onerror = () => {
        if (!isCurrent) return;
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      isCurrent = false;
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [padName, passwordCached]);

  // Navigate to a pad path
  const handleJoinPad = (name: string) => {
    window.history.pushState(null, '', `/${encodeURIComponent(name)}`);
    setPadName(name);
    // Clear password cache for new pad
    setPasswordCached('');
  };

  const handleBackToHome = () => {
    window.history.pushState(null, '', '/');
    setPadName('');
    setText('');
    setVersion(0);
    setVersions([]);
    setPasswordCached('');
  };



  // Support Tab key inside editor and Word-like keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      setTimeout(() => {
        enforcePageStructure();
        adjustPageMargins();
      }, 0);
    }

    // Word-like Formatting Shortcuts (Ctrl / Cmd + Key)
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        handleFormat('bold');
        return;
      }
      if (key === 'i') {
        e.preventDefault();
        handleFormat('italic');
        return;
      }
      if (key === 'u') {
        e.preventDefault();
        handleFormat('underline');
        return;
      }
      // Optional undo/redo hotkeys to match Word/Google Docs
      if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleFormat('redo');
        } else {
          handleFormat('undo');
        }
        return;
      }
      if (key === 'y') {
        e.preventDefault();
        handleFormat('redo');
        return;
      }
    }

    if (e.key === 'Enter') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let container = range.startContainer;
        while (container && container !== editorRef.current) {
          if (container.nodeName === 'LI') {
            const li = container as HTMLLIElement;
            const parent = li.parentElement;
            const hasCheckbox = li.querySelector('input[type="checkbox"]') || (parent && parent.classList.contains('task-list'));
            if (hasCheckbox) {
              const textContent = li.textContent || '';
              const cleanText = textContent.replace(/\u00a0/g, '').trim();
              
              if (cleanText === '') {
                // Empty item: exit checklist and insert normal paragraph
                e.preventDefault();
                li.remove();
                
                if (parent && parent.children.length === 0) {
                  parent.remove();
                }
                
                const p = document.createElement('p');
                p.innerHTML = '<br/>';
                if (parent && parent.nextSibling) {
                  parent.parentNode?.insertBefore(p, parent.nextSibling);
                } else if (parent) {
                  parent.parentNode?.appendChild(p);
                } else {
                  editorRef.current?.appendChild(p);
                }
                
                const newRange = document.createRange();
                newRange.setStart(p, 0);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
                
                handleEditorInput();
                return;
              } else {
                // Non-empty item: add a new checklist item
                e.preventDefault();
                
                const newLi = document.createElement('li');
                newLi.className = 'task-list-item';
                newLi.style.display = 'flex';
                newLi.style.alignItems = 'center';
                newLi.style.gap = '0.5rem';
                newLi.style.marginBottom = '0.4rem';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'task-list-item-checkbox';
                checkbox.style.width = '1rem';
                checkbox.style.height = '1rem';
                checkbox.style.accentColor = '#3b82f6';
                checkbox.style.cursor = 'pointer';
                checkbox.style.flexShrink = '0';
                
                const span = document.createElement('span');
                span.innerHTML = '&nbsp;';
                
                newLi.appendChild(checkbox);
                newLi.appendChild(span);
                
                if (li.nextSibling) {
                  parent.insertBefore(newLi, li.nextSibling);
                } else {
                  parent.appendChild(newLi);
                }
                
                const newRange = document.createRange();
                newRange.setStart(span.firstChild || span, 0);
                newRange.collapse(true);
                selection.removeAllRanges();
                selection.addRange(newRange);
                
                handleEditorInput();
                return;
              }
            }
            break;
          }
          container = container.parentNode as Node;
        }
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      // Insert spaces or tabs at current selection
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const tabNode = document.createTextNode('\u00a0\u00a0'); // 2 non-breaking spaces
        range.insertNode(tabNode);
        range.setStartAfter(tabNode);
        range.setEndAfter(tabNode);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Trigger input update
        handleEditorInput();
      }
    }
  };

  // Copy Pad Link to Clipboard
  const handleCopyLink = () => {
    const fullUrl = window.location.href;
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopiedLink(true);
      showToast('Link do bloco copiado!', 'success');
      setTimeout(() => setCopiedLink(false), 2000);
    }).catch(() => {
      showToast('Erro ao copiar link.', 'error');
    });
  };

  // 8. Security Controls (Password setup & submission)
  const handleUnlockSubmit = (password: string) => {
    setPasswordCached(password);
    setConnectionStatus('connecting');
    // Connection will rebuild with passwordCached in hook dependency
  };

  const handleSetPassword = (newPassword: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'set_password',
        padName,
        password: newPassword,
      }));
      setPasswordCached(newPassword);
    }
  };

  const handleRemovePassword = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'set_password',
        padName,
        password: '', // empty password clears it
      }));
      setPasswordCached('');
    }
  };

  // 9. Versioning Operations
  const handleSaveManualCheckpoint = (label: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'save_checkpoint',
        padName,
        label,
      }));
      showToast('Backup manual salvo!', 'success');
    }
  };

  const handleRestoreVersion = (versionId: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'restore_version',
        padName,
        versionId,
      }));
      showToast('Versão anterior restaurada com sucesso!', 'success');
      setIsHistoryOpen(false);
    }
  };

  const handleClearHistory = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const currentVersions = [...versions];
      setDeletedVersions(currentVersions);

      socketRef.current.send(JSON.stringify({
        type: 'clear_history',
        padName,
      }));

      showToast(
        'Todo o histórico de backups foi apagado!', 
        'success', 
        8000, 
        {
          label: 'Desfazer',
          onClick: () => {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({
                type: 'restore_history',
                padName,
                versions: currentVersions,
              }));
              showToast('Histórico restaurado com sucesso!', 'success');
            }
          }
        }
      );
    }
  };

  // 10. Code Editor Functions
  const handleCreateFile = (name: string) => {
    if (!name.trim()) return;
    if (codeFiles.some(f => f.name.toLowerCase() === name.toLowerCase())) {
      showToast('Um arquivo com este nome já existe!', 'error');
      return;
    }
    
    let language = 'html';
    if (name.endsWith('.css')) language = 'css';
    else if (name.endsWith('.js')) language = 'javascript';
    else if (name.endsWith('.ts')) language = 'typescript';
    else if (name.endsWith('.json')) language = 'json';

    const newFile: CodeFile = {
      name,
      content: `<!-- Arquivo ${name} -->\n`,
      language
    };

    updateCodeFiles([...codeFiles, newFile]);
    setActiveFileName(name);
    showToast(`Arquivo ${name} criado!`, 'success');
  };

  const handleDeleteFile = (name: string) => {
    if (codeFiles.length <= 1) {
      showToast('Você precisa manter pelo menos um arquivo!', 'error');
      return;
    }
    setDeletingFileName(name);
    setIsDeleteConfirmModalOpen(true);
  };

  const handleDeleteFileConfirm = (name: string) => {
    if (codeFiles.length <= 1) {
      showToast('Você precisa manter pelo menos um arquivo!', 'error');
      setIsDeleteConfirmModalOpen(false);
      return;
    }

    const fileToBackup = codeFiles.find(f => f.name === name);
    const index = codeFiles.findIndex(f => f.name === name);

    if (!fileToBackup) {
      setIsDeleteConfirmModalOpen(false);
      return;
    }

    const filtered = codeFiles.filter(f => f.name !== name);
    updateCodeFiles(filtered);
    if (activeFileName === name) {
      setActiveFileName(filtered[0].name);
    }

    setIsDeleteConfirmModalOpen(false);

    showToast(
      `Arquivo ${name} excluído!`, 
      'info', 
      8000, 
      {
        label: 'Desfazer',
        onClick: () => {
          handleUndoDeleteFile(fileToBackup, index);
        }
      }
    );
  };

  const handleUndoDeleteFile = (backedUpFile: CodeFile, index: number) => {
    const currentFiles = [...codeFiles];
    // Reinsert at original index
    currentFiles.splice(index, 0, backedUpFile);
    updateCodeFiles(currentFiles);
    setActiveFileName(backedUpFile.name);
    showToast(`Exclusão do arquivo ${backedUpFile.name} desfeita!`, 'success');
  };

  const handleRenameFile = (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) {
      showToast('O nome do arquivo não pode ser vazio!', 'error');
      return;
    }
    if (trimmed.toLowerCase() === oldName.toLowerCase()) {
      setIsRenameModalOpen(false);
      return;
    }
    if (codeFiles.some(f => f.name.toLowerCase() === trimmed.toLowerCase())) {
      showToast('Um arquivo com este nome já existe!', 'error');
      return;
    }

    let language = 'html';
    if (trimmed.endsWith('.css')) language = 'css';
    else if (trimmed.endsWith('.js')) language = 'javascript';
    else if (trimmed.endsWith('.ts')) language = 'typescript';
    else if (trimmed.endsWith('.json')) language = 'json';

    const updated = codeFiles.map(f => {
      if (f.name === oldName) {
        return {
          ...f,
          name: trimmed,
          language
        };
      }
      return f;
    });

    updateCodeFiles(updated);
    if (activeFileName === oldName) {
      setActiveFileName(trimmed);
    }
    showToast(`Arquivo renomeado de ${oldName} para ${trimmed}!`, 'success');
    setIsRenameModalOpen(false);
  };

  const getSandboxSrcDoc = () => {
    const htmlFile = codeFiles.find(f => f.name.endsWith('.html')) || { content: '' };
    const cssFile = codeFiles.find(f => f.name.endsWith('.css')) || { content: '' };
    const jsFile = codeFiles.find(f => f.name.endsWith('.js')) || { content: '' };

    let src = htmlFile.content || `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <title>Pré-visualização</title>
      </head>
      <body>
          <div style="font-family: sans-serif; text-align: center; margin-top: 100px; color: #94a3b8;">
              <p style="font-size: 18px; font-weight: bold;">Crie ou selecione um arquivo HTML para pré-visualizar</p>
          </div>
      </body>
      </html>
    `;

    // Bridge console from inside the iframe to parent
    const consoleBridge = `
<script>
(function() {
  const sendLog = (level, args) => {
    const formattedArgs = args.map(arg => {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); } catch(e) { return '[Object Object]'; }
      }
      return String(arg);
    });
    window.parent.postMessage({
      type: 'iframe_console',
      level: level,
      message: formattedArgs.join(' ')
    }, '*');
  };

  const _log = console.log;
  const _info = console.info;
  const _warn = console.warn;
  const _error = console.error;

  console.log = (...args) => { _log.apply(console, args); sendLog('log', args); };
  console.info = (...args) => { _info.apply(console, args); sendLog('info', args); };
  console.warn = (...args) => { _warn.apply(console, args); sendLog('warn', args); };
  console.error = (...args) => { _error.apply(console, args); sendLog('error', args); };

  window.addEventListener('error', (e) => {
    sendLog('error', [e.message + ' (linha ' + e.lineno + ':' + e.colno + ')']);
  });

  window.addEventListener('unhandledrejection', (e) => {
    sendLog('error', ['Erro não tratado (Promise): ' + (e.reason?.message || String(e.reason))]);
  });
})();
</script>
`;

    // Inject console bridge first
    src = consoleBridge + '\n' + src;

    // Inject CSS
    if (cssFile.content) {
      const styleTag = `<style>\n${cssFile.content}\n</style>`;
      if (src.includes('</head>')) {
        src = src.replace('</head>', `${styleTag}\n</head>`);
      } else {
        src = styleTag + '\n' + src;
      }
    }

    // Inject JS
    if (jsFile.content) {
      const scriptTag = `<script>\n${jsFile.content}\n</script>`;
      if (src.includes('</body>')) {
        src = src.replace('</body>', `${scriptTag}\n</body>`);
      } else {
        src = src + '\n' + scriptTag;
      }
    }

    return src;
  };

  // 10. Document Export functions
  const handleExportTxt = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${padName || 'bloco-de-notas'}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Documento exportado como Texto Puro (.txt)!');
  };

  const handleExportDocx = () => {
    // Basic rich HTML format that Word imports beautifully natively
    const compiledMarkdown = marked.parse(text) as string;
    const cleanHtml = sanitizeHtml(compiledMarkdown);

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${padName}</title>
        <style>
          body { font-family: 'Arial', sans-serif; line-height: 1.6; padding: 24px; color: #1e293b; }
          h1 { color: #4f46e5; font-size: 24pt; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 20px; }
          h2 { color: #0f172a; font-size: 18pt; margin-top: 20px; }
          h3 { color: #334155; font-size: 14pt; }
          p { font-size: 11pt; margin-bottom: 12px; }
          pre { background-color: #f8fafc; padding: 12px; border: 1px solid #cbd5e1; font-family: 'Courier New', Courier, monospace; margin-bottom: 16px; border-radius: 4px; }
          code { font-family: 'Courier New', Courier, monospace; background-color: #f1f5f9; padding: 2px 4px; font-size: 10pt; }
          blockquote { border-left: 4px solid #6366f1; padding-left: 14px; color: #475569; font-style: italic; margin: 16px 0; }
          ul, ol { margin-bottom: 16px; padding-left: 20px; }
          li { font-size: 11pt; margin-bottom: 4px; }
          strong { color: #0f172a; }
        </style>
      </head>
      <body>
        <h1>${padName}</h1>
        <div>${cleanHtml}</div>
      </body>
      </html>
    `;
    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${padName || 'bloco-de-notas'}.doc`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Documento formatado Word (.doc) gerado!');
  };

  const handleExportPdf = () => {
    const doc = new jsPDF();
    
    // Add page outline/margins
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(79, 70, 229); // indigo-600 color
    doc.text(`Bloco de Notas: ${padName}`, 15, 20);
    
    doc.setFontSize(9);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(`Criado via SyncPad Colaborativo — Sincronizado em tempo real`, 15, 26);
    doc.text(`Exportado em: ${new Date().toLocaleString('pt-BR')}`, 15, 31);
    
    doc.setDrawColor(226, 232, 240); // slate-200 line
    doc.line(15, 34, 195, 34);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59); // slate-800
    
    // Auto wrapping line size with page margins
    const splitText = doc.splitTextToSize(text, 180);
    let y = 42;
    for (let i = 0; i < splitText.length; i++) {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(splitText[i], 15, y);
      y += 6.2;
    }

    // Helper to apply text colors to PDF
    const applyPdfColor = (hexColor: string) => {
      if (!hexColor || hexColor === 'DEFAULT') {
        doc.setTextColor(148, 163, 184); // slate-400
        return;
      }
      if (hexColor === 'red') doc.setTextColor(239, 68, 68);
      else if (hexColor === 'blue') doc.setTextColor(59, 130, 246);
      else if (hexColor === 'green') doc.setTextColor(16, 185, 129);
      else if (hexColor === 'yellow') doc.setTextColor(245, 158, 11);
      else if (hexColor === 'orange') doc.setTextColor(249, 115, 22);
      else {
        const cleanHex = hexColor.replace('#', '');
        if (cleanHex.length === 6) {
          const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
          const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
          const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
          doc.setTextColor(r, g, b);
        } else {
          doc.setTextColor(148, 163, 184);
        }
      }
    };

    // Add headers and footers to all pages in the PDF
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      
      // Header (only on pages 2+, or on page 1 if headerText is explicitly filled)
      if (headerText) {
        let pdfHeaderFont = 'Helvetica';
        if (headerFont === 'serif') pdfHeaderFont = 'Times';
        else if (headerFont === 'mono') pdfHeaderFont = 'Courier';

        let pdfHeaderStyle = 'normal';
        if (headerBold && headerItalic) pdfHeaderStyle = 'bolditalic';
        else if (headerBold) pdfHeaderStyle = 'bold';
        else if (headerItalic) pdfHeaderStyle = 'italic';

        const pdfHeaderSize = Math.max(6, Math.min(16, headerFontSize));

        doc.setFont(pdfHeaderFont, pdfHeaderStyle);
        doc.setFontSize(pdfHeaderSize);
        applyPdfColor(headerColor);

        let headerX = 105;
        let headerAlignOption: 'center' | 'left' | 'right' = 'center';
        const normHeaderAlign = String(headerAlign).toUpperCase();
        if (normHeaderAlign === 'ESQUERDA' || normHeaderAlign === 'LEFT') {
          headerX = 15;
          headerAlignOption = 'left';
        } else if (normHeaderAlign === 'DIREITA' || normHeaderAlign === 'RIGHT') {
          headerX = 195;
          headerAlignOption = 'right';
        }

        doc.text(headerText, headerX, 10, { align: headerAlignOption });
      }

      // Footer
      if (footerText) {
        let pdfFooterFont = 'Helvetica';
        if (footerFont === 'serif') pdfFooterFont = 'Times';
        else if (footerFont === 'mono') pdfFooterFont = 'Courier';

        let pdfFooterStyle = 'normal';
        if (footerBold && footerItalic) pdfFooterStyle = 'bolditalic';
        else if (footerBold) pdfFooterStyle = 'bold';
        else if (footerItalic) pdfFooterStyle = 'italic';

        const pdfFooterSize = Math.max(6, Math.min(16, footerFontSize));

        doc.setFont(pdfFooterFont, pdfFooterStyle);
        doc.setFontSize(pdfFooterSize);
        applyPdfColor(footerColor);

        const formattedFooter = footerText
          .replace(/{page}/g, String(i))
          .replace(/{pages}/g, String(totalPages));

        let footerX = 105;
        let footerAlignOption: 'center' | 'left' | 'right' = 'center';
        const normFooterAlign = String(footerAlign).toUpperCase();
        if (normFooterAlign === 'ESQUERDA' || normFooterAlign === 'LEFT') {
          footerX = 15;
          footerAlignOption = 'left';
        } else if (normFooterAlign === 'DIREITA' || normFooterAlign === 'RIGHT') {
          footerX = 195;
          footerAlignOption = 'right';
        }

        doc.text(formattedFooter, footerX, 290, { align: footerAlignOption });
      }
    }
    
    doc.save(`${padName || 'bloco-de-notas'}.pdf`);
    showToast('Relatório PDF (.pdf) baixado com sucesso!');
  };

  // Compile Markdown safely
  const getCompiledMarkdown = (): string => {
    try {
      const rawHtml = marked.parse(text) as string;
      return sanitizeHtml(rawHtml);
    } catch (e) {
      return '';
    }
  };

  // Stats calculation
  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lineCount = text ? text.split('\n').length : 0;

  const getContextMenuPosition = () => {
    if (!editorContextMenu) return { top: '0px', left: '0px' };
    const menuWidth = 192;
    const menuHeight = 250;
    let left = editorContextMenu.x;
    let top = editorContextMenu.y;

    if (left + menuWidth > window.innerWidth) {
      left = window.innerWidth - menuWidth - 10;
    }
    if (top + menuHeight > window.innerHeight) {
      top = window.innerHeight - menuHeight - 10;
    }
    return { top: `${top}px`, left: `${left}px` };
  };

  // 11. Router Branching (Home vs Active Pad)
  if (!padName) {
    return (
      <LandingPage 
        onJoinPad={handleJoinPad} 
        isDarkMode={isDarkMode} 
        toggleDarkMode={() => setIsDarkMode(!isDarkMode)} 
      />
    );
  }

  return (
    <div className={`h-screen overflow-hidden flex flex-col transition-colors duration-200 selection:bg-blue-500/20 ${
      isDarkMode ? 'bg-[#0a0a0c] text-[#e0e0e0]' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* Dynamic collaborative cursor styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        ${Object.entries(remoteCursors)
          .map(([senderId, info]: [string, any]) => `
            .remote-cursor-${senderId} {
              border-left: 2px solid ${info.color} !important;
              position: absolute !important;
              z-index: 40 !important;
            }
            .remote-cursor-${senderId}::before {
              content: "" !important;
              position: absolute !important;
              top: -4px !important;
              left: -3px !important;
              border-left: 4px solid transparent !important;
              border-right: 4px solid transparent !important;
              border-bottom: 4px solid ${info.color} !important;
              width: 0 !important;
              height: 0 !important;
              pointer-events: none !important;
              z-index: 51 !important;
            }
            .remote-cursor-${senderId}::after {
              content: "${info.nickname.replace(/"/g, '\\"')}" !important;
              position: absolute !important;
              top: -18px !important;
              left: -3px !important;
              background: ${info.color} !important;
              color: white !important;
              font-size: 9px !important;
              font-family: system-ui, -apple-system, sans-serif !important;
              font-weight: bold !important;
              padding: 1.5px 4.5px !important;
              border-radius: 3px !important;
              white-space: nowrap !important;
              pointer-events: none !important;
              z-index: 50 !important;
              line-height: 1 !important;
              opacity: 0.95 !important;
              box-shadow: 0 1px 3px rgba(0,0,0,0.2) !important;
            }
            .remote-selection-${senderId} {
              background-color: ${info.color}33 !important; /* 20% opacity */
            }
          `)
          .join('\n')}
      ` }} />

      {/* Toast Alert Banner */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className={`px-5 py-3 rounded-xl border shadow-xl text-sm font-semibold flex items-center gap-2.5 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/80 dark:border-emerald-900/60 dark:text-emerald-300'
              : toast.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/80 dark:border-red-900/60 dark:text-red-300'
              : 'bg-indigo-50 border-indigo-200 text-indigo-800 dark:bg-indigo-950/80 dark:border-indigo-900/60 dark:text-indigo-300'
          }`}>
            <Sparkles className="w-4 h-4 flex-shrink-0" />
            <span>{toast.message}</span>
            {toast.undoAction && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toast.undoAction?.onClick();
                  setToast(null);
                }}
                className={`ml-3 px-2 py-1 text-xs font-black uppercase tracking-wider rounded transition-all cursor-pointer ${
                  isDarkMode
                    ? 'bg-white/10 hover:bg-white/20 text-blue-400 hover:text-blue-300 border border-blue-400/20'
                    : 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700 hover:text-indigo-800'
                }`}
              >
                {toast.undoAction.label}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Password Gate */}
      {connectionStatus === 'auth_required' && (
        <PasswordModal
          onUnlock={handleUnlockSubmit}
          onBackToHome={handleBackToHome}
          errorMsg={authError}
          isDarkMode={isDarkMode}
        />
      )}

      {/* Primary Header */}
      <header className={`relative z-30 px-2 sm:px-6 h-14 border-b flex items-center justify-between gap-1.5 sm:gap-3 transition-colors shrink-0 ${
        isDarkMode ? 'bg-[#0f0f12] border-white/5' : 'bg-white border-slate-200/80'
      }`}>
        {/* Left branding + URL navigator */}
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={handleBackToHome}
            className="hidden sm:flex items-center gap-2 font-bold tracking-tight transition-opacity cursor-pointer text-sm"
          >
            <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] ${isDarkMode ? 'bg-blue-500' : 'bg-indigo-600'}`} />
            <span className={`text-sm font-medium tracking-tight ${isDarkMode ? 'text-white/90' : 'text-indigo-600'}`}>
              syncpad.io/
            </span>
          </button>

          <div className="h-4 w-px bg-white/10 hidden sm:block"></div>

          {/* Path bar */}
          <div className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded-lg border text-xs sm:text-sm font-medium overflow-hidden transition-all ${
            isDarkMode 
              ? 'bg-white/5 border-white/10 text-white/90' 
              : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            <span className={`font-mono text-[11px] tracking-tight ${isDarkMode ? 'text-white/50' : 'text-slate-400'} hidden sm:inline`}>
              syncpad.io/
            </span>
            <span className={`font-bold text-xs px-1.5 py-0.5 rounded truncate max-w-[120px] sm:max-w-none ${
              isDarkMode 
                ? 'bg-white/10 text-blue-400 border border-blue-400/20' 
                : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
            }`}>
              {padName}
            </span>
            <button
              onClick={handleCopyLink}
              className={`p-1 rounded transition-colors cursor-pointer ${
                isDarkMode ? 'text-white/40 hover:text-white/80 hover:bg-white/5' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'
              }`}
              title="Copiar link"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Center Connection Status */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] uppercase tracking-widest font-semibold shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${
            connectionStatus === 'connected' 
              ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse' 
              : connectionStatus === 'connecting' 
              ? 'bg-amber-500 animate-bounce' 
              : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
          }`} />
          <span className={`hidden md:inline ${
            isDarkMode 
              ? (connectionStatus === 'connected' ? 'text-emerald-400/80' : connectionStatus === 'connecting' ? 'text-amber-400/80' : 'text-red-400/80')
              : (connectionStatus === 'connected' ? 'text-emerald-700' : connectionStatus === 'connecting' ? 'text-amber-700' : 'text-red-700')
          }`}>
            {connectionStatus === 'connected' ? 'Sincronizado' : connectionStatus === 'connecting' ? 'Conectando...' : 'Sem conexão'}
          </span>
        </div>

        {/* Right utility buttons */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Active Users Badge with Collaborator / Profile Dropdown */}
          <div className="relative">
            <button 
              onClick={() => {
                setIsCollabMenuOpen(!isCollabMenuOpen);
                setIsSecurityOpen(false);
                setIsHistoryOpen(false);
              }}
              className={`p-2 rounded-lg border transition-all flex items-center gap-2 cursor-pointer select-none ${
                isCollabMenuOpen
                  ? (isDarkMode ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.2)]' : 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm')
                  : (isDarkMode ? 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 shadow-sm')
              }`}
              title="Colaboradores e Meu Perfil"
            >
              <div className="flex -space-x-1.5">
                <div className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-[8px] font-black text-white shrink-0 border border-transparent shadow-sm" style={{ backgroundColor: myColor }}>
                  {myNickname.substring(0, 2).toUpperCase()}
                </div>
                {activeUsers > 1 && (
                  <div className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[8px] font-black text-white shrink-0 ${
                    isDarkMode ? 'bg-emerald-600 border border-[#0d0d10]' : 'bg-emerald-500 border border-white'
                  }`}>
                    +{activeUsers - 1}
                  </div>
                )}
              </div>
              <span className="hidden md:inline text-xs font-semibold">
                {activeUsers} {activeUsers === 1 ? 'Colaborador' : 'Colaboradores'}
              </span>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
            </button>

            {isCollabMenuOpen && (
              <>
                {/* Backdrop click closer */}
                <div className="fixed inset-0 z-40" onClick={() => setIsCollabMenuOpen(false)} />
                
                {/* Popover Card */}
                <div className={`absolute right-0 mt-2 w-80 rounded-xl border p-4 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-150 ${
                  isDarkMode 
                    ? 'bg-[#0f0f13] border-white/10 text-white shadow-black/50' 
                    : 'bg-white border-slate-200 text-slate-800 shadow-slate-200/50'
                }`}>
                  <div className="flex items-center justify-between border-b pb-2 mb-3" style={{ borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }}>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-400" />
                      <span className="font-bold text-xs uppercase tracking-wider">Painel de Colaboração</span>
                    </div>
                    <button 
                      onClick={() => setIsCollabMenuOpen(false)}
                      className={`p-1 rounded-lg transition-colors cursor-pointer hover:bg-red-500/10 hover:text-red-400 ${
                        isDarkMode ? 'text-white/40' : 'text-slate-400'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Section 1: Customize My Profile */}
                  <div className="mb-4">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">Meu Perfil (Você)</span>
                    <div className="space-y-3 p-2.5 rounded-lg" style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Apelido no Pad</label>
                        <input
                          type="text"
                          value={myNickname}
                          onChange={(e) => setMyNickname(e.target.value.slice(0, 20))}
                          className={`w-full text-xs px-2.5 py-1.5 rounded-lg border transition-all outline-none ${
                            isDarkMode
                              ? 'bg-white/5 border-white/10 text-white focus:border-indigo-500/50'
                              : 'bg-white border-slate-200 text-slate-800 focus:border-indigo-400'
                          }`}
                          placeholder="Apelido"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Cor do meu Cursor</label>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            '#ef4444', // Red
                            '#f97316', // Orange
                            '#eab308', // Yellow
                            '#10b981', // Emerald
                            '#06b6d4', // Cyan
                            '#3b82f6', // Blue
                            '#6366f1', // Indigo
                            '#8b5cf6', // Violet
                            '#ec4899', // Pink
                          ].map((c) => (
                            <button
                              key={c}
                              onClick={() => setMyColor(c)}
                              className="w-5 h-5 rounded-full transition-transform active:scale-95 cursor-pointer relative flex items-center justify-center shrink-0 border"
                              style={{ 
                                backgroundColor: c,
                                borderColor: myColor === c ? (isDarkMode ? 'white' : 'black') : 'transparent'
                              }}
                            >
                              {myColor === c && (
                                <Check className="w-3 h-3 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Online Collaborators List */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Outros Usuários</span>
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded-full font-bold">
                        {activeUsers} Online
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {/* Current user */}
                      <div className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg border border-transparent" style={{ backgroundColor: isDarkMode ? 'rgba(99,102,241,0.05)' : 'rgba(99,102,241,0.04)' }}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: myColor }} />
                          <span className="font-bold truncate">{myNickname} (Você)</span>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono shrink-0 ${
                          isDarkMode ? 'bg-white/5 border-white/10 text-white/60' : 'bg-slate-100 border-slate-200 text-slate-500'
                        }`}>
                          {activeTab === 'code' ? activeFileName : (activeTab === 'text' ? 'Texto/Notas' : 'P2P Transfer')}
                        </span>
                      </div>

                      {/* Remote users */}
                      {Object.entries(remoteCursors).map(([senderId, info]: [string, any]) => (
                        <div key={senderId} className={`flex items-center justify-between text-xs py-1.5 px-2 rounded-lg border ${
                          isDarkMode ? 'border-white/5 bg-white/[0.01]' : 'border-slate-100 bg-slate-50/50'
                        }`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: info.color }} />
                            <span className="font-medium truncate">{info.nickname || 'Colaborador Anônimo'}</span>
                          </div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono shrink-0 ${
                            isDarkMode ? 'bg-white/5 border-white/10 text-white/60' : 'bg-slate-100 border-slate-200 text-slate-500'
                        }`}>
                            {info.fileName || 'Conectando...'}
                          </span>
                        </div>
                      ))}

                      {Object.keys(remoteCursors).length === 0 && activeUsers > 1 && (
                        <div className="text-center py-3 text-xs text-slate-400 italic">
                          Aguardando sincronização de cursores...
                        </div>
                      )}

                      {activeUsers === 1 && (
                        <div className="text-center py-3 text-xs text-slate-400 italic">
                          Compartilhe o link do SyncPad para colaborar!
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Security status icon */}
          <button
            onClick={() => {
              setIsSecurityOpen(true);
              setIsHistoryOpen(false);
              setIsCollabMenuOpen(false);
            }}
            className={`p-2 rounded-lg border transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer ${
              isDarkMode
                ? (hasPassword
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                  : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10')
                : (hasPassword
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')
            }`}
            title="Segurança"
          >
            {hasPassword ? <Lock className="w-3.5 h-3.5 text-emerald-400" /> : <Unlock className="w-3.5 h-3.5" />}
            <span className="hidden md:inline">Segurança</span>
          </button>

          {/* Version history button */}
          <button
            onClick={() => {
              setIsHistoryOpen(true);
              setIsSecurityOpen(false);
              setIsCollabMenuOpen(false);
            }}
            className={`p-2 rounded-lg border transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer ${
              isDarkMode 
                ? 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10' 
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <History className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden md:inline">Histórico</span>
          </button>

          {/* Export dropdown trigger */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExportDropdownOpen(!isExportDropdownOpen);
              }}
              className={`p-2 rounded-lg border flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-all ${
                isDarkMode 
                  ? 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10' 
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Exportar</span>
            </button>

            {isExportDropdownOpen && (
              <div className={`absolute right-0 mt-2 w-48 rounded-xl border shadow-2xl z-[100] divide-y overflow-hidden ${
                isDarkMode ? 'bg-[#0d0d10] border-white/5 divide-white/5 text-[#e0e0e0]' : 'bg-white border-slate-100 divide-slate-100 text-slate-900'
              }`} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    handleExportTxt();
                    setIsExportDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2 hover:bg-white/5 cursor-pointer`}
                >
                  📝 Texto Puro (.txt)
                </button>
                <button
                  onClick={() => {
                    handleExportDocx();
                    setIsExportDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2 hover:bg-white/5 cursor-pointer`}
                >
                  📘 Documento Word (.doc)
                </button>
                <button
                  onClick={() => {
                    handleExportPdf();
                    setIsExportDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2 hover:bg-white/5 cursor-pointer`}
                >
                  📕 Relatório PDF (.pdf)
                </button>
              </div>
            )}
          </div>

          {/* Mode Claro/Escuro */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-2 rounded-lg border transition-all cursor-pointer ${
              isDarkMode
                ? 'border-white/10 bg-white/5 text-yellow-400 hover:bg-white/10'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            }`}
          >
            {isDarkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Main Workspace Canvas */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Editor Area */}
        <div className={`flex-1 flex flex-col h-full overflow-hidden w-full ${
          isDarkMode ? 'bg-[#0f0f12]' : 'bg-white'
        }`}>
          {/* Tab Switcher Bar - Directly below the header, physically below the link syncpad.io/{padName} */}
          <div className={`px-4 py-2 border-b flex items-center justify-between shrink-0 transition-all ${
            isDarkMode ? 'bg-[#0c0c0f] border-white/5' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide uppercase flex items-center gap-2 transition-all border cursor-pointer ${
                  activeTab === 'text'
                    ? isDarkMode
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                      : 'bg-white text-indigo-600 border-slate-200 shadow-sm'
                    : isDarkMode
                    ? 'text-white/40 hover:text-white/70 hover:bg-white/5 border-transparent'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 border-transparent'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Editor Texto
              </button>
              
              <button
                type="button"
                onClick={() => setActiveTab('code')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide uppercase flex items-center gap-2 transition-all border cursor-pointer ${
                  activeTab === 'code'
                    ? isDarkMode
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                      : 'bg-white text-indigo-600 border-slate-200 shadow-sm'
                    : isDarkMode
                    ? 'text-white/40 hover:text-white/70 hover:bg-white/5 border-transparent'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 border-transparent'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                Editor Código
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('file')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold tracking-wide uppercase flex items-center gap-2 transition-all border cursor-pointer ${
                  activeTab === 'file'
                    ? isDarkMode
                      ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                      : 'bg-white text-indigo-600 border-slate-200 shadow-sm'
                    : isDarkMode
                    ? 'text-white/40 hover:text-white/70 hover:bg-white/5 border-transparent'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 border-transparent'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Enviar/Receber Arquivos
              </button>
            </div>
            
            {activeTab === 'code' && (
              <div className="flex items-center gap-2 animate-fade-in">
                <span className={`text-[10px] font-bold uppercase tracking-wider hidden sm:inline-block ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>
                  Ambiente de Teste de Código
                </span>
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            )}

            {activeTab === 'file' && (
              <div className="flex items-center gap-2 animate-fade-in">
                <span className={`text-[10px] font-bold uppercase tracking-wider hidden sm:inline-block ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>
                  Compartilhamento Peer-to-Peer
                </span>
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
            )}
          </div>

          {activeTab === 'text' &&
            /* Unified Scroll Container (enables pinned sticky toolbar or document flow scrolling) */
            <div 
              onScroll={(e) => {
                const container = e.currentTarget;
                const scrollOffset = container.scrollTop;
                const calculatedPage = Math.min(pageCount, Math.max(1, Math.floor((scrollOffset + 300) / A4_PAGE_HEIGHT) + 1));
                setCurrentPage(calculatedPage);
              }}
              className="flex-1 flex flex-col relative w-full h-full overflow-y-auto scrollbar-thin"
            >
            {/* Rich Toolbar */}
            <div className={`px-2 lg:px-4 py-1.5 border-b flex items-center justify-between gap-1 lg:gap-2 z-50 overflow-visible transition-all duration-200 shrink-0 ${
              isToolbarPinned 
                ? 'sticky top-0 shadow-sm backdrop-blur-md ' + (isDarkMode ? 'bg-[#0f0f12]/95' : 'bg-white/95') 
                : 'relative ' + (isDarkMode ? 'bg-[#0f0f12]' : 'bg-white')
            } ${
              isDarkMode ? 'border-white/10 text-white/90' : 'border-slate-200 text-slate-800'
            }`}>
            {/* Tools Scroll Wrapper */}
            <div className={`flex-1 flex items-center gap-1.5 lg:gap-2 scrollbar-none flex-nowrap lg:flex-wrap pr-1 ${
              isAnyFormatDropdownOpen ? 'overflow-visible' : 'overflow-x-auto lg:overflow-visible'
            }`}>
              {/* Group 1: Undo/Redo */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleFormat('undo')}
                className={`p-1 sm:p-1.5 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-800 dark:text-white/70 hover:text-slate-950 dark:hover:text-white`}
                title="Desfazer"
              >
                <Undo className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('redo')}
                className={`p-1 sm:p-1.5 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-800 dark:text-white/70 hover:text-slate-950 dark:hover:text-white`}
                title="Refazer"
              >
                <Redo className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </button>
            </div>

            <div className={`w-[1px] h-4 transition-colors ${isDarkMode ? 'bg-white/10' : 'bg-slate-300'} mx-0.5 lg:mx-1 shrink-0`} />

            {/* Group 2: Text Styling */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleFormat('bold')}
                className={`p-1 lg:p-1.5 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-800 dark:text-white/70 hover:text-slate-950 dark:hover:text-white`}
                title="Negrito"
              >
                <Bold className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('italic')}
                className={`p-1 lg:p-1.5 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-800 dark:text-white/70 hover:text-slate-950 dark:hover:text-white`}
                title="Itálico"
              >
                <Italic className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('underline')}
                className={`p-1 lg:p-1.5 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-800 dark:text-white/70 hover:text-slate-950 dark:hover:text-white`}
                title="Sublinhado"
              >
                <Underline className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('blockquote')}
                className={`p-1 lg:p-1.5 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-800 dark:text-white/70 hover:text-slate-950 dark:hover:text-white hidden lg:inline-flex`}
                title="Citação"
              >
                <Quote className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('code')}
                className={`p-1 lg:p-1.5 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-800 dark:text-white/70 hover:text-slate-950 dark:hover:text-white hidden lg:inline-flex`}
                title="Bloco de Código"
              >
                <Code className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            <div className={`w-[1px] h-4 transition-colors ${isDarkMode ? 'bg-white/10' : 'bg-slate-300'} mx-0.5 lg:mx-1 shrink-0 hidden lg:block`} />

            {/* Group 3: Font Selection */}
            <div className="relative shrink-0 hidden lg:block" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setIsFontDropdownOpen(!isFontDropdownOpen);
                  setIsSizeDropdownOpen(false);
                  setIsColorDropdownOpen(false);
                  setIsAlignDropdownOpen(false);
                }}
                className={`px-1.5 lg:px-2 py-0.5 lg:py-1 rounded-lg border text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 lg:gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  isDarkMode 
                    ? 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:border-white/20' 
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100 hover:border-slate-400'
                }`}
              >
                <span className="text-blue-500 font-extrabold text-[12px] shrink-0">T</span>
                <div className="flex flex-col items-start leading-none text-left min-w-[36px]">
                  <span className="text-[8px] text-slate-700 dark:text-white/50 font-bold tracking-wider hidden lg:block">FONTE</span>
                  <span className="text-[10px] font-extrabold text-slate-900 dark:text-white">{editorFont}</span>
                </div>
                <ChevronDown className="w-3 h-3 text-slate-600 dark:text-white/40 shrink-0" />
              </button>
              {isFontDropdownOpen && (
                <div className={`absolute left-0 mt-1.5 w-32 rounded-xl border shadow-2xl z-50 overflow-hidden divide-y ${
                  isDarkMode 
                    ? 'bg-[#0f0f12] border-white/10 divide-white/5 text-white' 
                    : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                }`}>
                  {['mono', 'sans', 'serif'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => {
                        setEditorFont(f as any);
                        handleFormat('font', f);
                        setIsFontDropdownOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors uppercase cursor-pointer"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Group 4: Font Size Selection */}
            <div className="relative shrink-0 hidden lg:block" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setIsSizeDropdownOpen(!isSizeDropdownOpen);
                  setIsFontDropdownOpen(false);
                  setIsColorDropdownOpen(false);
                  setIsAlignDropdownOpen(false);
                }}
                className={`px-1.5 lg:px-2 py-0.5 lg:py-1 rounded-lg border text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 lg:gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  isDarkMode 
                    ? 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:border-white/20' 
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100 hover:border-slate-400'
                }`}
              >
                <span className="text-blue-500 font-extrabold text-[12px] shrink-0">AA</span>
                <div className="flex flex-col items-start leading-none text-left min-w-[24px]">
                  <span className="text-[8px] text-slate-700 dark:text-white/50 font-bold tracking-wider hidden lg:block">TAM</span>
                  <span className="text-[10px] font-extrabold text-slate-900 dark:text-white">{editorFontSize}px</span>
                </div>
                <ChevronDown className="w-3 h-3 text-slate-600 dark:text-white/40 shrink-0" />
              </button>
              {isSizeDropdownOpen && (
                <div className={`absolute left-0 mt-1.5 w-24 rounded-xl border shadow-2xl z-50 overflow-hidden divide-y ${
                  isDarkMode 
                    ? 'bg-[#0f0f12] border-white/10 divide-white/5 text-white' 
                    : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                }`}>
                  {[12, 14, 16, 18, 20, 24].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => {
                        setEditorFontSize(sz);
                        handleFormat('fontSize', String(sz));
                        setIsSizeDropdownOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      {sz}px
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Group 5: Text Color Selection */}
            <div className="relative shrink-0 hidden lg:block" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setIsColorDropdownOpen(!isColorDropdownOpen);
                  setIsFontDropdownOpen(false);
                  setIsSizeDropdownOpen(false);
                  setIsAlignDropdownOpen(false);
                }}
                className={`px-1.5 lg:px-2 py-0.5 lg:py-1 rounded-lg border text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 lg:gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  isDarkMode 
                    ? 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:border-white/20' 
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100 hover:border-slate-400'
                }`}
              >
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                <div className="flex flex-col items-start leading-none text-left min-w-[20px]">
                  <span className="text-[8px] text-slate-700 dark:text-white/50 font-bold tracking-wider hidden lg:block">COR</span>
                  <span className="text-[10px] font-extrabold text-slate-900 dark:text-white">TXT</span>
                </div>
                <ChevronDown className="w-3 h-3 text-slate-600 dark:text-white/40 shrink-0" />
              </button>
              {isColorDropdownOpen && (
                <div className={`absolute left-0 mt-1.5 w-36 rounded-xl border shadow-2xl z-50 overflow-hidden divide-y ${
                  isDarkMode 
                    ? 'bg-[#0f0f12] border-white/10 divide-white/5 text-white' 
                    : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                }`}>
                  {[
                    { label: 'Padrão', value: 'DEFAULT', color: isDarkMode ? '#e0e0e0' : '#1e293b' },
                    { label: 'Vermelho', value: 'red', color: '#f87171' },
                    { label: 'Azul', value: 'blue', color: '#60a5fa' },
                    { label: 'Verde', value: 'green', color: '#34d399' },
                    { label: 'Amarelo', value: 'yellow', color: '#facc15' },
                    { label: 'Laranja', value: 'orange', color: '#fb923c' },
                  ].map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => {
                        setEditorTextColor(c.value);
                        handleFormat('color', c.value === 'DEFAULT' ? 'DEFAULT' : c.color);
                        setIsColorDropdownOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                      <span>{c.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={`w-[1px] h-4 transition-colors ${isDarkMode ? 'bg-white/10' : 'bg-slate-300'} mx-0.5 lg:mx-1 shrink-0 hidden lg:block`} />

            {/* Group 6: Rich elements */}
            <div className="flex items-center gap-1 shrink-0 hidden lg:flex">
              <button
                type="button"
                onClick={() => handleFormat('list')}
                className={`p-1 sm:p-1.5 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-800 dark:text-white/70 hover:text-slate-950 dark:hover:text-white`}
                title="Lista Simples"
              >
                <List className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('checklist')}
                className={`p-1 sm:p-1.5 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-800 dark:text-white/70 hover:text-slate-950 dark:hover:text-white`}
                title="Lista de Tarefas"
              >
                <ListTodo className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('link')}
                className={`p-1 sm:p-1.5 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-800 dark:text-white/70 hover:text-slate-950 dark:hover:text-white`}
                title="Link"
              >
                <LinkIcon className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                type="button"
                onClick={() => handleFormat('highlight')}
                className={`p-1 sm:p-1.5 rounded-lg transition-all hover:bg-blue-500/10 dark:hover:bg-blue-500/15 cursor-pointer text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-bold`}
                title="Destacar Texto (Marca-texto)"
              >
                <Paintbrush className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            <div className={`w-[1px] h-4 transition-colors ${isDarkMode ? 'bg-white/10' : 'bg-slate-300'} mx-0.5 lg:mx-1 shrink-0 hidden lg:block`} />

            {/* Group 7: Alignment Selector */}
            <div className="relative shrink-0 hidden lg:block" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setIsAlignDropdownOpen(!isAlignDropdownOpen);
                  setIsFontDropdownOpen(false);
                  setIsSizeDropdownOpen(false);
                  setIsColorDropdownOpen(false);
                }}
                className={`px-1.5 lg:px-2 py-0.5 lg:py-1 rounded-lg border text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 lg:gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
                  isDarkMode 
                    ? 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:border-white/20' 
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100 hover:border-slate-400'
                }`}
              >
                <div className="shrink-0 text-blue-600 dark:text-blue-400 font-black">
                  {editorTextAlign === 'ESQUERDA' && <AlignLeft className="w-3.5 h-3.5 stroke-[2.5]" />}
                  {editorTextAlign === 'CENTRO' && <AlignCenter className="w-3.5 h-3.5 stroke-[2.5]" />}
                  {editorTextAlign === 'DIREITA' && <AlignRight className="w-3.5 h-3.5 stroke-[2.5]" />}
                  {editorTextAlign === 'JUSTIFICADO' && <AlignJustify className="w-3.5 h-3.5 stroke-[2.5]" />}
                </div>
                <div className="flex flex-col items-start leading-none text-left min-w-[36px]">
                  <span className="text-[8px] text-slate-700 dark:text-white/50 font-extrabold tracking-wider hidden lg:block">ALINH</span>
                  <span className="text-[10px] font-black text-slate-900 dark:text-white">
                    {editorTextAlign === 'ESQUERDA' && 'ESQ'}
                    {editorTextAlign === 'CENTRO' && 'CENT'}
                    {editorTextAlign === 'DIREITA' && 'DIR'}
                    {editorTextAlign === 'JUSTIFICADO' && 'JUST'}
                  </span>
                </div>
                <ChevronDown className="w-3 h-3 text-slate-600 dark:text-white/40 shrink-0 stroke-[2.5]" />
              </button>
              {isAlignDropdownOpen && (
                <div className={`absolute left-0 mt-1.5 w-36 rounded-xl border shadow-2xl z-50 overflow-hidden divide-y ${
                  isDarkMode 
                    ? 'bg-[#0f0f12] border-white/10 divide-white/5 text-white' 
                    : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                }`}>
                  {[
                    { label: 'ESQUERDA', value: 'ESQUERDA', icon: AlignLeft },
                    { label: 'CENTRO', value: 'CENTRO', icon: AlignCenter },
                    { label: 'DIREITA', value: 'DIREITA', icon: AlignRight },
                    { label: 'JUSTIFICADO', value: 'JUSTIFICADO', icon: AlignJustify },
                  ].map((a) => (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => {
                        setEditorTextAlign(a.value as any);
                        handleFormat('align', a.value);
                        setIsAlignDropdownOpen(false);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-bold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex items-center gap-2 cursor-pointer uppercase"
                    >
                      <a.icon className="w-3.5 h-3.5" />
                      <span>{a.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Spacer */}
            <div className="flex-1 hidden lg:block" />

            {/* Group 8: AI & Smart functions */}
            <div className="flex items-center gap-1.5 lg:gap-2 pl-1.5 lg:pl-2 border-l border-slate-200 dark:border-white/10 shrink-0 flex">
              {/* 1. Autocomplete com IA */}
              <button
                type="button"
                onClick={handleAiAutocomplete}
                disabled={isAiCompleting}
                className={`px-2 lg:px-3 py-1 lg:py-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 lg:gap-1.5 text-xs font-bold text-white shadow-lg shrink-0 ${
                  isAiCompleting
                    ? 'bg-blue-500/25 text-blue-200 animate-pulse'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/10 hover:shadow-blue-500/20'
                }`}
                title="Autocompletar com IA"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isAiCompleting ? 'animate-spin' : ''}`} />
                <span className="hidden xl:inline text-[10px] uppercase tracking-wider">Autocomplete</span>
              </button>

              {/* 2. Voz para Texto */}
              <button
                type="button"
                onClick={handleVoiceToText}
                className={`p-1 lg:p-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 ${
                  isListening
                    ? 'bg-red-500 text-white animate-pulse shadow-md shadow-red-500/20'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-white/70 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-300 dark:border-white/10 shadow-sm'
                }`}
                title="Voz para Texto (Ditado)"
              >
                <Mic className={`w-4 h-4 stroke-[2.5] ${isListening ? 'scale-110' : ''}`} />
                <span className="hidden xl:inline text-[10px] uppercase tracking-wider font-extrabold">Ditado</span>
              </button>

              {/* 3. Gravar áudio */}
              {recordingState === 'idle' ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="p-1 lg:p-1.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-white/70 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-300 dark:border-white/10 cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold shrink-0 shadow-sm"
                  title="Gravar áudio para IA"
                >
                  <AudioLines className="w-4 h-4 stroke-[2.5]" />
                  <span className="hidden xl:inline text-[10px] uppercase tracking-wider font-extrabold">Gravar IA</span>
                </button>
              ) : recordingState === 'recording' ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="p-1 lg:p-1.5 rounded-md bg-red-600 text-white animate-pulse flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer shadow-lg shadow-red-500/20 shrink-0"
                  title="Parar Gravação"
                >
                  <div className="w-2 h-2 rounded bg-white animate-ping" />
                  <span>{formatDuration(recordingDuration)}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setRecordingState('review')}
                  className="p-1 lg:p-1.5 rounded-md bg-emerald-600 text-white flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer shadow-lg shadow-emerald-500/20 shrink-0"
                  title="Ver gravação"
                >
                  <AudioLines className="w-4 h-4 animate-bounce" />
                  <span>Pendente</span>
                </button>
              )}

              {/* 4. Borracha (Formatting clear) */}
              <button
                type="button"
                onClick={() => handleFormat('eraser')}
                className="p-1 lg:p-1.5 rounded-md transition-all bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-800 dark:text-white/70 hover:text-slate-950 dark:hover:text-white cursor-pointer items-center justify-center shrink-0 hidden lg:inline-flex shadow-sm"
                title="Limpar formatação da seleção ou limpar tudo"
              >
                <Eraser className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div> {/* Tools Scroll Wrapper End */}

          {/* Controls Container: Pin Toggle (Visible everywhere) & Mobile Menu (Mobile only) */}
          <div className="flex items-center gap-2 lg:gap-3 shrink-0 pl-3 md:pl-4 ml-1 md:ml-2 border-l border-slate-200 dark:border-white/10">
            {/* Pin/Unpin Toolbar Toggle (Icon only, premium styling) */}
            <button
              type="button"
              onClick={() => setIsToolbarPinned(!isToolbarPinned)}
              className={`p-1.5 md:p-2 rounded-lg transition-all border flex items-center justify-center cursor-pointer shrink-0 shadow-sm ${
                isToolbarPinned 
                  ? (isDarkMode 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-md shadow-blue-500/10' 
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-md shadow-indigo-500/10')
                  : (isDarkMode 
                      ? 'bg-[#18181f] border-white/10 text-white/90 hover:bg-blue-600 hover:text-white hover:border-blue-600' 
                      : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600')
              }`}
              title={isToolbarPinned ? "Fixado no topo (Acompanha a rolagem)" : "Desafixado (Permanece na posição original)"}
            >
              {isToolbarPinned ? <Pin className="w-4 h-4 fill-current" /> : <PinOff className="w-4 h-4" />}
            </button>

            {/* Mobile Options Menu (3 dots) - visible only on mobile, aligned to the right */}
            <div className="relative lg:hidden" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(!isMobileMenuOpen);
                  setIsFontDropdownOpen(false);
                  setIsSizeDropdownOpen(false);
                  setIsColorDropdownOpen(false);
                  setIsAlignDropdownOpen(false);
                }}
                className={`p-1.5 rounded-lg transition-all border flex items-center justify-center cursor-pointer ${
                  isMobileMenuOpen 
                    ? (isDarkMode ? 'bg-white/10 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/10' : 'bg-slate-100 border-indigo-200 text-indigo-600')
                    : (isDarkMode ? 'bg-white/5 border-white/10 text-white/60 hover:text-white' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800')
                }`}
                title="Mais Opções"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

            {isMobileMenuOpen && (
              <div className={`absolute right-0 mt-2 w-72 max-h-[75vh] overflow-y-auto rounded-xl border shadow-2xl p-4 z-50 flex flex-col gap-4 transition-all scrollbar-none ${
                isDarkMode 
                  ? 'bg-[#121216] border-white/10 text-white/90 shadow-black/80' 
                  : 'bg-white border-slate-200 text-slate-800 shadow-slate-200/50'
              }`}>
                {/* Title */}
                <div className={`text-[10px] font-extrabold tracking-wider uppercase border-b pb-1.5 ${isDarkMode ? 'border-white/5 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
                  Formatação de Texto
                </div>

                {/* Row 1: Quote, Code, Highlight, Eraser */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleFormat('blockquote')}
                    className={`p-2 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-500 dark:text-white/60 hover:text-slate-800 dark:hover:text-white border ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}
                    title="Citação"
                  >
                    <Quote className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormat('code')}
                    className={`p-2 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-500 dark:text-white/60 hover:text-slate-800 dark:hover:text-white border ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}
                    title="Bloco de Código"
                  >
                    <Code className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormat('highlight')}
                    className={`p-2 rounded-lg transition-all hover:bg-blue-500/10 dark:hover:bg-blue-500/15 cursor-pointer text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 border ${isDarkMode ? 'border-blue-500/10' : 'border-blue-100'}`}
                    title="Destacar Texto (Marca-texto)"
                  >
                    <Paintbrush className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormat('eraser')}
                    className={`p-2 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-500 dark:text-white/60 hover:text-slate-800 dark:hover:text-white border ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}
                    title="Limpar formatação"
                  >
                    <Eraser className="w-4 h-4" />
                  </button>
                </div>

                {/* Row 2: Lists & Links */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleFormat('list')}
                    className={`p-2 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-500 dark:text-white/60 hover:text-slate-800 dark:hover:text-white border ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}
                    title="Lista Simples"
                  >
                    <List className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormat('checklist')}
                    className={`p-2 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-500 dark:text-white/60 hover:text-slate-800 dark:hover:text-white border ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}
                    title="Lista de Tarefas"
                  >
                    <ListTodo className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormat('link')}
                    className={`p-2 rounded-lg transition-all hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer text-slate-500 dark:text-white/60 hover:text-slate-800 dark:hover:text-white border ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`}
                    title="Link"
                  >
                    <LinkIcon className="w-4 h-4" />
                  </button>
                </div>

                {/* Dropdown selectors (Font, Size, Color, Alignment) */}
                <div className={`text-[10px] font-extrabold tracking-wider uppercase border-b pb-1.5 ${isDarkMode ? 'border-white/5 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
                  Estilos de Texto
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Font Select */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsFontDropdownOpen(!isFontDropdownOpen);
                        setIsSizeDropdownOpen(false);
                        setIsColorDropdownOpen(false);
                        setIsAlignDropdownOpen(false);
                      }}
                      className={`w-full px-2 py-1.5 rounded-lg border text-[10px] font-bold tracking-wider uppercase flex items-center justify-between gap-1 transition-all cursor-pointer ${
                        isDarkMode 
                          ? 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10' 
                          : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100 font-extrabold'
                      }`}
                    >
                      <div className="flex items-center gap-1 truncate">
                        <span className="text-blue-500 font-extrabold text-[11px]">T</span>
                        <span className="truncate">{editorFont}</span>
                      </div>
                      <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
                    </button>
                    {isFontDropdownOpen && (
                      <div className={`absolute left-0 mt-1.5 w-full rounded-xl border shadow-2xl z-50 overflow-hidden divide-y ${
                        isDarkMode 
                          ? 'bg-[#1a1a20] border-white/10 divide-white/5 text-white' 
                          : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                      }`}>
                        {['mono', 'sans', 'serif'].map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => {
                              setEditorFont(f as any);
                              handleFormat('font', f);
                              setIsFontDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-extrabold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 uppercase cursor-pointer"
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Font Size Select */}
                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSizeDropdownOpen(!isSizeDropdownOpen);
                        setIsFontDropdownOpen(false);
                        setIsColorDropdownOpen(false);
                        setIsAlignDropdownOpen(false);
                      }}
                      className={`w-full px-2 py-1.5 rounded-lg border text-[10px] font-bold tracking-wider uppercase flex items-center justify-between gap-1 transition-all cursor-pointer ${
                        isDarkMode 
                          ? 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10' 
                          : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100 font-extrabold'
                      }`}
                    >
                      <div className="flex items-center gap-1 truncate">
                        <span className="text-blue-500 font-extrabold text-[11px]">AA</span>
                        <span>{editorFontSize}px</span>
                      </div>
                      <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
                    </button>
                    {isSizeDropdownOpen && (
                      <div className={`absolute left-0 mt-1.5 w-full rounded-xl border shadow-2xl z-50 overflow-hidden divide-y ${
                        isDarkMode 
                          ? 'bg-[#1a1a20] border-white/10 divide-white/5 text-white' 
                          : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                      }`}>
                        {[12, 14, 16, 18, 20, 24].map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => {
                              setEditorFontSize(sz);
                              handleFormat('fontSize', String(sz));
                              setIsSizeDropdownOpen(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-extrabold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
                          >
                            {sz}px
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Color Select */}
                  <div className="relative col-span-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsColorDropdownOpen(!isColorDropdownOpen);
                        setIsFontDropdownOpen(false);
                        setIsSizeDropdownOpen(false);
                        setIsAlignDropdownOpen(false);
                      }}
                      className={`w-full px-2 py-1.5 rounded-lg border text-[10px] font-bold tracking-wider uppercase flex items-center justify-between gap-1 transition-all cursor-pointer ${
                        isDarkMode 
                          ? 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10' 
                          : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100 font-extrabold'
                      }`}
                    >
                      <div className="flex items-center gap-1 truncate">
                        <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                        <span>Cor</span>
                      </div>
                      <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
                    </button>
                    {isColorDropdownOpen && (
                      <div className={`absolute left-0 mt-1.5 w-full rounded-xl border shadow-2xl z-50 overflow-hidden divide-y ${
                        isDarkMode 
                          ? 'bg-[#1a1a20] border-white/10 divide-white/5 text-white' 
                          : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                        }`}>
                          {[
                            { label: 'Padrão', value: 'DEFAULT', color: isDarkMode ? '#e0e0e0' : '#1e293b' },
                            { label: 'Vermelho', value: 'red', color: '#f87171' },
                            { label: 'Azul', value: 'blue', color: '#60a5fa' },
                            { label: 'Verde', value: 'green', color: '#34d399' },
                            { label: 'Amarelo', value: 'yellow', color: '#facc15' },
                            { label: 'Laranja', value: 'orange', color: '#fb923c' },
                          ].map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              onClick={() => {
                                setEditorTextColor(c.value);
                                handleFormat('color', c.value === 'DEFAULT' ? 'DEFAULT' : c.color);
                                setIsColorDropdownOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-extrabold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex items-center gap-2 cursor-pointer"
                            >
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                              <span className="truncate">{c.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Alignment Select */}
                    <div className="relative col-span-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAlignDropdownOpen(!isAlignDropdownOpen);
                          setIsFontDropdownOpen(false);
                          setIsSizeDropdownOpen(false);
                          setIsColorDropdownOpen(false);
                        }}
                        className={`w-full px-2 py-1.5 rounded-lg border text-[10px] font-bold tracking-wider uppercase flex items-center justify-between gap-1 transition-all cursor-pointer ${
                          isDarkMode 
                            ? 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10' 
                            : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100 font-extrabold'
                        }`}
                      >
                        <div className="flex items-center gap-1 truncate">
                          <span className="text-blue-500 font-extrabold text-[11px] shrink-0">
                            {editorTextAlign === 'ESQUERDA' && <AlignLeft className="w-3 h-3" />}
                            {editorTextAlign === 'CENTRO' && <AlignCenter className="w-3 h-3" />}
                            {editorTextAlign === 'DIREITA' && <AlignRight className="w-3 h-3" />}
                            {editorTextAlign === 'JUSTIFICADO' && <AlignJustify className="w-3 h-3" />}
                          </span>
                          <span>Alinh</span>
                        </div>
                        <ChevronDown className="w-3 h-3 text-slate-600 shrink-0" />
                      </button>
                      {isAlignDropdownOpen && (
                        <div className={`absolute right-0 mt-1.5 w-full rounded-xl border shadow-2xl z-50 overflow-hidden divide-y ${
                          isDarkMode 
                            ? 'bg-[#1a1a20] border-white/10 divide-white/5 text-white' 
                            : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                        }`}>
                          {[
                            { label: 'ESQUERDA', value: 'ESQUERDA', icon: AlignLeft },
                            { label: 'CENTRO', value: 'CENTRO', icon: AlignCenter },
                            { label: 'DIREITA', value: 'DIREITA', icon: AlignRight },
                            { label: 'JUSTIFICADO', value: 'JUSTIFICADO', icon: AlignJustify },
                          ].map((a) => (
                            <button
                              key={a.value}
                              type="button"
                              onClick={() => {
                                setEditorTextAlign(a.value as any);
                                handleFormat('align', a.value);
                                setIsAlignDropdownOpen(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-extrabold text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors flex items-center gap-2 cursor-pointer uppercase"
                            >
                              <a.icon className="w-3.5 h-3.5" />
                              <span className="truncate">{a.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div> {/* Closes mobile options menu container */}
          </div> {/* Closes Controls Container */}
          </div>

          {/* Desktop Desk Background resembling Google Docs */}
          <div 
            className={`flex-1 p-4 md:p-8 flex justify-center overflow-y-visible ${
              isDarkMode ? 'bg-[#0a0a0c]' : 'bg-slate-100'
            }`}
            onClick={() => {
              if (activeEditArea !== 'body') {
                setActiveEditArea('body');
              }
            }}
          >
            {/* Centered Paper Sheet Page with Paginated Design */}
            <div 
              className="w-full max-w-[812px] flex flex-col relative bg-transparent"
              style={{ minHeight: `${pageCount * A4_PAGE_HEIGHT}px` }}
              onClick={(e) => {
                // Prevent background click from dismissing edit mode if clicking inside page
                e.stopPropagation();
              }}
              onDoubleClick={(e) => {
                if (activeEditArea !== 'body') {
                  e.stopPropagation();
                  setActiveEditArea('body');
                  editorRef.current?.focus();
                }
              }}
            >
              {/* Individual Page Paper Sheets rendered under the content */}
              {Array.from({ length: pageCount }).map((_, pageIdx) => {
                const pageStart = pageIdx * A4_PAGE_HEIGHT;
                const pageEnd = (pageIdx + 1) * A4_PAGE_HEIGHT;
                
                const isFirst = pageIdx === 0;
                const isLast = pageIdx === pageCount - 1;
                
                const sheetTop = isFirst ? 0 : pageStart + 40;
                const sheetBottom = isLast ? pageEnd : pageEnd - 40;
                const sheetHeight = sheetBottom - sheetTop;
                
                return (
                  <div
                    key={`sheet-${pageIdx}`}
                    className={`absolute left-0 right-0 rounded-md shadow-xl border pointer-events-none transition-all ${
                      isDarkMode 
                        ? 'bg-[#0f0f12] border-white/5 shadow-black/40' 
                        : 'bg-white border-slate-200 shadow-slate-200/50'
                    }`}
                    style={{
                      top: `${sheetTop}px`,
                      height: `${sheetHeight}px`,
                      zIndex: 10,
                    }}
                  />
                );
              })}

              {/* Top Ruler representing A4 page width ticks (reserves professional Word feel) */}
              <div className={`w-full h-5 border-b flex items-center px-4 md:px-16 select-none pointer-events-none text-[8px] font-mono opacity-50 shrink-0 rounded-t-md z-20 ${
                isDarkMode ? 'bg-[#121216] border-white/5 text-white/30' : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}>
                {/* Ruler ticks representing centimeters (0 to 20 cm) */}
                <div className="w-full flex justify-between relative">
                  <div className="absolute left-0">0</div>
                  <div className="absolute left-[5%]">•</div>
                  <div className="absolute left-[10%]">•</div>
                  <div className="absolute left-[15%]">2</div>
                  <div className="absolute left-[20%]">•</div>
                  <div className="absolute left-[25%]">•</div>
                  <div className="absolute left-[30%]">5</div>
                  <div className="absolute left-[35%]">•</div>
                  <div className="absolute left-[40%]">•</div>
                  <div className="absolute left-[45%]">8</div>
                  <div className="absolute left-[50%]">•</div>
                  <div className="absolute left-[55%]">•</div>
                  <div className="absolute left-[60%]">11</div>
                  <div className="absolute left-[65%]">•</div>
                  <div className="absolute left-[70%]">•</div>
                  <div className="absolute left-[75%]">14</div>
                  <div className="absolute left-[80%]">•</div>
                  <div className="absolute left-[85%]">•</div>
                  <div className="absolute left-[90%]">17</div>
                  <div className="absolute left-[95%]">•</div>
                  <div className="absolute right-0">20</div>
                </div>
              </div>

              {/* Absolute Page Break dividers overlaying the document in the 80px desk gaps */}
              {Array.from({ length: pageCount - 1 }).map((_, idx) => {
                const pageBoundary = (idx + 1) * A4_PAGE_HEIGHT;
                const gapHeight = 80; // 80px visual gap (between pageEnd - 40 and pageStart + 40)
                const topOffset = pageBoundary - 40;
                return (
                  <div
                    key={idx}
                    className="absolute left-0 right-0 z-20 pointer-events-none flex items-center justify-center"
                    style={{ top: `${topOffset}px`, height: `${gapHeight}px` }}
                  >
                    {/* Visual dashed border overlays for the page break */}
                    <div className="w-full flex items-center justify-center gap-4 px-8 select-none">
                      <div className={`flex-1 border-t border-dashed ${isDarkMode ? 'border-white/10' : 'border-slate-300'}`} />
                      
                      {/* Centered Page Number Divider Label */}
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase shadow-md border shrink-0 ${
                        isDarkMode 
                          ? 'bg-[#121216]/90 border-white/10 text-white/40' 
                          : 'bg-white border-slate-200 text-slate-500 shadow-slate-100'
                      }`}>
                        FIM DA PÁGINA {idx + 1} • INÍCIO DA PÁGINA {idx + 2}
                      </span>
                      
                      <div className={`flex-1 border-t border-dashed ${isDarkMode ? 'border-white/10' : 'border-slate-300'}`} />
                    </div>
                  </div>
                );
              })}

              {/* Interactive Headers and Footers for each page */}
              {Array.from({ length: pageCount }).map((_, pageIdx) => {
                const pageStart = pageIdx * A4_PAGE_HEIGHT;
                const pageEnd = (pageIdx + 1) * A4_PAGE_HEIGHT;

                const isFirst = pageIdx === 0;
                const isLast = pageIdx === pageCount - 1;

                const headerTop = isFirst ? pageStart : pageStart + 40;
                const headerHeight = isFirst ? 80 : 40;

                const footerTop = pageEnd - 80;
                const footerHeight = isLast ? 80 : 40;

                const isHeaderActive = activeEditArea === 'header';
                const isFooterActive = activeEditArea === 'footer';
                const isBodyActive = activeEditArea === 'body';

                return (
                  <React.Fragment key={`page-hf-${pageIdx}`}>
                    {/* Header Slot */}
                    <div
                      className={`absolute left-0 right-0 z-30 transition-all duration-200 flex flex-col justify-center px-8 md:px-16 ${
                        isHeaderActive
                          ? 'ring-2 ring-blue-500 ring-inset bg-blue-500/[0.04] dark:bg-blue-500/[0.02]'
                          : isBodyActive
                            ? 'hover:bg-slate-100/50 hover:dark:bg-white/[0.02] cursor-pointer group border-y border-transparent hover:border-dashed hover:border-slate-300 dark:hover:border-slate-700'
                            : 'opacity-20 pointer-events-none'
                      }`}
                      style={{ top: `${headerTop}px`, height: `${headerHeight}px` }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setActiveEditArea('header');
                      }}
                      title={isBodyActive ? "Clique duplo para editar cabeçalho" : undefined}
                    >
                      {/* Header Tag Badge */}
                      {isHeaderActive && pageIdx === 0 && (
                        <div className="absolute top-1 left-2 flex items-center gap-1 text-[9px] font-bold tracking-wider text-blue-500 uppercase select-none">
                          <span className="px-1.5 py-0.5 bg-blue-500/10 rounded-sm">Cabeçalho (Replicado em todas as páginas)</span>
                        </div>
                      )}
                      
                      {isBodyActive && (
                        <div className="absolute top-1 left-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-[8px] font-medium text-slate-400">
                          Clique duplo para editar cabeçalho
                        </div>
                      )}

                      {isHeaderActive ? (
                        <input
                          type="text"
                          value={headerText}
                          onChange={(e) => {
                            const val = e.target.value;
                            setHeaderText(val);
                            syncHeaderFooterState({ headerText: val });
                          }}
                          onSelect={() => handleTextCursorChange()}
                          onKeyUp={() => handleTextCursorChange()}
                          onMouseUp={() => handleTextCursorChange()}
                          onFocus={() => handleTextCursorChange()}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape' || e.key === 'Enter') {
                              e.preventDefault();
                              setActiveEditArea('body');
                              editorRef.current?.focus();
                            } else if (e.ctrlKey || e.metaKey) {
                              const key = e.key.toLowerCase();
                              if (key === 'b') {
                                e.preventDefault();
                                handleFormat('bold');
                              } else if (key === 'i') {
                                e.preventDefault();
                                handleFormat('italic');
                              } else if (key === 'u') {
                                e.preventDefault();
                                handleFormat('underline');
                              }
                            }
                          }}
                          placeholder="Clique para digitar o cabeçalho..."
                          className={`w-full bg-transparent border-none outline-none focus:ring-0 placeholder-slate-400 dark:placeholder-slate-600 ${
                            getAreaStyle('header').className
                          } ${
                            headerColor === 'DEFAULT' ? 'text-slate-600 dark:text-slate-300' : ''
                          }`}
                          style={getAreaStyle('header').style}
                          autoFocus={pageIdx === 0}
                        />
                      ) : (
                        <div 
                          className={`w-full truncate ${
                            getAreaStyle('header').className
                          } ${
                            headerColor === 'DEFAULT' ? 'text-slate-400 dark:text-slate-500' : ''
                          }`}
                          style={getAreaStyle('header').style}
                        >
                          {headerText || <span className="italic opacity-40">Sem cabeçalho (Clique duplo para editar)</span>}
                        </div>
                      )}
                    </div>

                    {/* Footer Slot */}
                    <div
                      className={`absolute left-0 right-0 z-30 transition-all duration-200 flex flex-col justify-center px-8 md:px-16 ${
                        isFooterActive
                          ? 'ring-2 ring-emerald-500 ring-inset bg-emerald-500/[0.04] dark:bg-emerald-500/[0.02]'
                          : isBodyActive
                            ? 'hover:bg-slate-100/50 hover:dark:bg-white/[0.02] cursor-pointer group border-y border-transparent hover:border-dashed hover:border-slate-300 dark:hover:border-slate-700'
                            : 'opacity-20 pointer-events-none'
                      }`}
                      style={{ top: `${footerTop}px`, height: `${footerHeight}px` }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setActiveEditArea('footer');
                      }}
                      title={isBodyActive ? "Clique duplo para editar rodapé" : undefined}
                    >
                      {/* Footer Tag Badge */}
                      {isFooterActive && pageIdx === 0 && (
                        <div className="absolute bottom-1 left-2 flex items-center gap-1 text-[9px] font-bold tracking-wider text-emerald-500 uppercase select-none">
                          <span className="px-1.5 py-0.5 bg-emerald-500/10 rounded-sm">Rodapé (Replicado em todas as páginas)</span>
                        </div>
                      )}

                      {isBodyActive && (
                        <div className="absolute bottom-1 left-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-[8px] font-medium text-slate-400">
                          Clique duplo para editar rodapé
                        </div>
                      )}

                      {isFooterActive ? (
                        <div className="w-full flex items-center gap-2">
                          <input
                            type="text"
                            value={footerText}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFooterText(val);
                              syncHeaderFooterState({ footerText: val });
                            }}
                            onSelect={() => handleTextCursorChange()}
                            onKeyUp={() => handleTextCursorChange()}
                            onMouseUp={() => handleTextCursorChange()}
                            onFocus={() => handleTextCursorChange()}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape' || e.key === 'Enter') {
                                e.preventDefault();
                                setActiveEditArea('body');
                                editorRef.current?.focus();
                              } else if (e.ctrlKey || e.metaKey) {
                                const key = e.key.toLowerCase();
                                if (key === 'b') {
                                  e.preventDefault();
                                  handleFormat('bold');
                                } else if (key === 'i') {
                                  e.preventDefault();
                                  handleFormat('italic');
                                } else if (key === 'u') {
                                  e.preventDefault();
                                  handleFormat('underline');
                                }
                              }
                            }}
                            placeholder="Clique para digitar o rodapé... (Use {page} para pág. atual e {pages} para total)"
                            className={`flex-1 bg-transparent border-none outline-none focus:ring-0 placeholder-slate-400 dark:placeholder-slate-600 ${
                              getAreaStyle('footer').className
                            } ${
                              footerColor === 'DEFAULT' ? 'text-slate-600 dark:text-slate-300' : ''
                            }`}
                            style={getAreaStyle('footer').style}
                            autoFocus={pageIdx === 0}
                          />
                          <span className="text-[10px] text-emerald-500 font-mono select-none px-2 py-0.5 bg-emerald-500/10 rounded shrink-0">
                            Pág. {pageIdx + 1}/{pageCount}
                          </span>
                        </div>
                      ) : (
                        <div 
                          className={`w-full truncate ${
                            getAreaStyle('footer').className
                          } ${
                            footerColor === 'DEFAULT' ? 'text-slate-400 dark:text-slate-500' : ''
                          }`}
                          style={getAreaStyle('footer').style}
                        >
                          {footerText ? (
                            formatFooterText(footerText, pageIdx + 1, pageCount)
                          ) : (
                            <span className="italic opacity-40">Sem rodapé (Clique duplo para editar)</span>
                          )}
                        </div>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}

              <div
                ref={editorRef}
                contentEditable={activeEditArea === 'body'}
                suppressContentEditableWarning={true}
                onInput={handleEditorInput}
                onClick={handleEditorClick}
                onKeyDown={handleKeyDown}
                data-placeholder="Comece a digitar o conteúdo do seu bloco aqui... Digite seu texto e formate utilizando a barra de ferramentas!"
                className={`flex-1 w-full p-4 sm:p-8 md:p-16 focus:outline-none transition-all duration-200 leading-relaxed rounded-md selection:bg-blue-500/20 bg-transparent prose max-w-none dark:prose-invert ${getEditorStyles()} ${
                  isDarkMode 
                    ? 'caret-blue-500 text-white' 
                    : 'caret-indigo-600 text-slate-800'
                } ${
                  activeEditArea !== 'body' ? 'opacity-30 pointer-events-none select-none' : ''
                }`}
                style={{ outline: 'none', minHeight: `${A4_PAGE_HEIGHT}px`, position: 'relative', zIndex: 20 }}
              />

              {/* Overlay for collaborative rich text cursors */}
              <div 
                className="absolute left-0 right-0 pointer-events-none"
                style={{ 
                  top: '20px', // height of the top ruler h-5 (20px)
                  bottom: 0,
                  zIndex: 30
                }}
              >
                {Object.entries(remoteCursors)
                  .filter(([senderId, info]: [string, any]) => info.fileName === 'Texto/Notas' && info.textCursor)
                  .map(([senderId, info]: [string, any]) => {
                    const { top, left, height, collapsed, width } = info.textCursor;
                    return (
                      <div
                        key={`text-cursor-${senderId}`}
                        className="absolute pointer-events-none transition-all duration-100 ease-out"
                        style={{
                          top: `${top}px`,
                          left: `${left}px`,
                          height: `${height}px`,
                          width: `${collapsed ? 2 : width}px`,
                          backgroundColor: collapsed ? 'transparent' : `${info.color}33`,
                          borderLeft: `2px solid ${info.color}`,
                        }}
                      >
                        {/* Cursor flag/name tag */}
                        <div className="absolute top-0 left-0" style={{ transform: 'translateY(-100%)' }}>
                          <div 
                            className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent absolute -bottom-1 left-0"
                            style={{ borderBottom: `4px solid ${info.color}` }}
                          />
                          <div 
                            className="text-[9px] text-white font-black px-1.5 py-0.5 rounded-sm shadow-sm whitespace-nowrap select-none flex items-center justify-center"
                            style={{ 
                              backgroundColor: info.color,
                              transform: 'translateY(-4px)',
                            }}
                          >
                            {info.nickname || 'Colaborador'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
          </div>
          }

          {activeTab === 'code' && (() => {
            const showEditorMobile = mobileCodeViewMode === 'editor' || mobileCodeViewMode === 'split';
            const showPreviewMobile = mobileCodeViewMode === 'preview' || mobileCodeViewMode === 'split';
            const showPreviewDesktop = isPreviewOpen;
            return (
              <div className={`flex-1 flex overflow-hidden w-full h-full relative ${
                isDarkMode ? 'bg-[#0a0a0c]' : 'bg-slate-50'
              }`}>
                {/* Mobile Sidebar Backdrop overlay */}
                {isCodeSidebarOpen && (
                  <div 
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden animate-fade-in"
                    onClick={() => setIsCodeSidebarOpen(false)}
                  />
                )}

                {/* VS Code File Explorer Sidebar */}
                <div className={`${
                  isCodeSidebarOpen ? 'flex' : 'hidden'
                } absolute md:relative inset-y-0 left-0 z-50 md:z-auto w-72 md:w-64 border-r flex flex-col shrink-0 select-none shadow-2xl md:shadow-none transition-all duration-300 ${
                  isDarkMode ? 'bg-[#0c0c0e] border-white/5' : 'bg-slate-100 border-slate-200'
                }`}>
                  {/* Explorer Header */}
                  <div className={`px-4 py-3 border-b flex items-center justify-between text-xs font-bold tracking-wider uppercase ${
                    isDarkMode ? 'border-white/5 text-white/50' : 'border-slate-200 text-slate-500'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5 text-blue-500" />
                      <span>Explorador</span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setIsNewFileModalOpen(true)}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          isDarkMode ? 'hover:bg-white/5 text-white/60 hover:text-white' : 'hover:bg-slate-200 text-slate-500 hover:text-slate-800'
                        }`}
                        title="Novo Arquivo"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsCodeSidebarOpen(false)}
                        className="p-1 rounded transition-colors cursor-pointer md:hidden hover:bg-red-500/10 text-red-400"
                        title="Fechar Explorador"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Files List */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                    {codeFiles.map((file) => {
                      const isActive = activeFileName === file.name;
                      return (
                        <div
                          key={file.name}
                          onClick={() => {
                            setActiveFileName(file.name);
                            if (window.innerWidth <= 768) {
                              setIsCodeSidebarOpen(false);
                            }
                          }}
                          className={`group px-3 py-2 rounded-lg flex items-center justify-between text-xs font-medium cursor-pointer transition-all ${
                            isActive
                              ? isDarkMode
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-indigo-50 text-indigo-600 border border-indigo-100/50 shadow-sm'
                              : isDarkMode
                              ? 'text-white/60 hover:bg-white/5 hover:text-white border border-transparent'
                              : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileCode className={`w-4 h-4 flex-shrink-0 ${
                              isActive 
                                ? 'text-blue-400' 
                                : file.name.endsWith('.html') 
                                ? 'text-orange-500' 
                                : file.name.endsWith('.css') 
                                ? 'text-blue-500' 
                                : 'text-yellow-500'
                            }`} />
                            <span className="truncate">{file.name}</span>
                          </div>
                          
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Rename File button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingFileName(file.name);
                                setRenameNewName(file.name);
                                setIsRenameModalOpen(true);
                              }}
                              className={`p-1 rounded transition-colors cursor-pointer ${
                                isDarkMode ? 'hover:bg-white/10 text-white/40 hover:text-blue-400' : 'hover:bg-slate-200 text-slate-400 hover:text-indigo-600'
                              }`}
                              title="Renomear Arquivo"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>

                            {/* Delete File button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFile(file.name);
                              }}
                              className={`p-1 rounded transition-colors cursor-pointer ${
                                isDarkMode ? 'hover:bg-white/10 text-white/40 hover:text-red-400' : 'hover:bg-slate-200 text-slate-400 hover:text-red-600'
                              }`}
                              title="Excluir Arquivo"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Shortcuts & Tips Card */}
                  <div className={`p-3.5 m-2.5 rounded-xl border flex flex-col gap-2 shrink-0 ${
                    isDarkMode 
                      ? 'bg-blue-500/5 border-blue-500/10 text-blue-200' 
                      : 'bg-indigo-50/50 border-indigo-100 text-indigo-800'
                  }`}>
                    <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-pulse" />
                      <span>Organizador de Código</span>
                    </div>
                    <p className={`text-[10px] leading-relaxed opacity-85 ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>
                      Formate e organize seu código instantaneamente como no VS Code (Prettier):
                    </p>
                    <div className="flex flex-col gap-1.5 mt-1 font-mono text-[9px]">
                      <div className="flex items-center justify-between">
                        <span className="opacity-70">Formatar</span>
                        <kbd className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                          isDarkMode ? 'bg-[#1a1a24] text-white/90 border border-white/10' : 'bg-white text-slate-700 border border-slate-200 shadow-sm'
                        }`}>Shift + Alt + F</kbd>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="opacity-70">Salvar</span>
                        <kbd className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                          isDarkMode ? 'bg-[#1a1a24] text-white/90 border border-white/10' : 'bg-white text-slate-700 border border-slate-200 shadow-sm'
                        }`}>Ctrl + S</kbd>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Main Workspace (Editor + Live Preview Split Screen) */}
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden h-full relative">
                  {/* Left: Editor Container */}
                  <div className={`flex-col overflow-hidden border-r border-transparent ${
                    showEditorMobile ? 'flex' : 'hidden'
                  } md:flex md:flex-1 ${
                    mobileCodeViewMode === 'split' ? 'h-1/2 md:h-full' : 'h-full'
                  } flex-1`}>
                    {/* Active File Tab Title Bar */}
                    <div className={`px-4 py-2 border-b flex items-center justify-between shrink-0 gap-2 ${
                      isDarkMode ? 'bg-[#0f0f12] border-white/5' : 'bg-white border-slate-200'
                    }`}>
                      <div className="flex items-center gap-2 truncate">
                        <button
                          type="button"
                          onClick={() => setIsCodeSidebarOpen(!isCodeSidebarOpen)}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
                            isCodeSidebarOpen
                              ? isDarkMode
                                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                : 'bg-indigo-50 text-indigo-600 border-indigo-200 shadow-sm'
                              : isDarkMode
                              ? 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
                          }`}
                          title="Alternar Explorador de Arquivos"
                        >
                          <FolderOpen className="w-4 h-4" />
                        </button>
                        <span className={`text-xs font-bold truncate ${isDarkMode ? 'text-white' : 'text-slate-700'}`}>
                          {activeFileName}
                        </span>
                      </div>

                      {/* Segmented Controller for Mobile View Modes */}
                      <div className="flex md:hidden items-center bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/5 gap-0.5 select-none">
                        <button
                          type="button"
                          onClick={() => setMobileCodeViewMode('editor')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                            mobileCodeViewMode === 'editor'
                              ? isDarkMode
                                ? 'bg-blue-500 text-white shadow-sm'
                                : 'bg-white text-indigo-600 shadow-sm'
                              : isDarkMode
                              ? 'text-white/60 hover:text-white hover:bg-white/5'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                          }`}
                        >
                          Editor
                        </button>
                        <button
                          type="button"
                          onClick={() => setMobileCodeViewMode('preview')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                            mobileCodeViewMode === 'preview'
                              ? isDarkMode
                                ? 'bg-blue-500 text-white shadow-sm'
                                : 'bg-white text-indigo-600 shadow-sm'
                              : isDarkMode
                              ? 'text-white/60 hover:text-white hover:bg-white/5'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                          }`}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => setMobileCodeViewMode('split')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                            mobileCodeViewMode === 'split'
                              ? isDarkMode
                                ? 'bg-blue-500 text-white shadow-sm'
                                : 'bg-white text-indigo-600 shadow-sm'
                              : isDarkMode
                              ? 'text-white/60 hover:text-white hover:bg-white/5'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                          }`}
                        >
                          Split
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Format Code button */}
                        <button
                          type="button"
                          onClick={() => {
                            if (monacoEditorRef.current) {
                              formatCurrentDocument(monacoEditorRef.current, null);
                            }
                          }}
                          className={`flex px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border transition-all items-center gap-1.5 cursor-pointer ${
                            isDarkMode
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 shadow-sm'
                          }`}
                          title="Formatar Código (Shift + Alt + F ou Ctrl + S)"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Formatar Código</span>
                          <span className="text-[8px] opacity-75 font-mono ml-0.5">(Shift+Alt+F)</span>
                        </button>

                        {/* AI Assistant button */}
                        <button
                          type="button"
                          onClick={() => setIsAiAssistantOpen(!isAiAssistantOpen)}
                          className={`flex px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border transition-all items-center gap-1.5 cursor-pointer ${
                            isAiAssistantOpen
                              ? isDarkMode
                                ? 'border-purple-500/30 bg-purple-500/15 text-purple-400'
                                : 'border-purple-300 bg-purple-50 text-purple-600'
                              : isDarkMode
                              ? 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100 shadow-sm'
                          }`}
                          title={`Assistente de IA (Explique, Otimize ou resolva erros) - Usos hoje: ${aiUsageCount}/2`}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                          <span className="hidden sm:inline">Assistente de IA</span>
                          <span className="text-[8px] bg-purple-500/10 text-purple-400 px-1 rounded-md ml-0.5 select-none">
                            {2 - aiUsageCount}
                          </span>
                        </button>

                        {/* Split Preview toggle for Desktop */}
                        <button
                          type="button"
                          onClick={() => setIsPreviewOpen(!isPreviewOpen)}
                          className={`hidden md:flex px-3 py-1 rounded-lg text-[10px] font-bold uppercase border transition-all items-center gap-1.5 cursor-pointer ${
                            isPreviewOpen
                              ? isDarkMode
                                ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                                : 'border-indigo-200 bg-indigo-50 text-indigo-600'
                              : isDarkMode
                              ? 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10'
                              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-100'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Pré-visualização {isPreviewOpen ? 'Ativa' : 'Inativa'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Monaco Editor Component with AI Companion Sidebar (Idea D) */}
                    <div className="flex-1 h-full w-full overflow-hidden relative flex flex-row">
                      <div className="flex-1 h-full min-w-0 relative">
                        {(() => {
                          const file = codeFiles.find(f => f.name === activeFileName);
                          if (!file) return null;
                          return (
                            <Editor
                              height="100%"
                              language={file.language}
                              theme={isDarkMode ? "vs-dark" : "light"}
                              value={file.content}
                              onChange={(val) => {
                                handleCodeChange(activeFileName, val || '');
                              }}
                              onMount={(editor, monaco) => {
                                monacoEditorRef.current = editor;
                                (window as any).monaco = monaco;

                                // Initial cursor synchronization
                                setTimeout(() => {
                                  if (handleCursorOrSelectionChangeRef.current) {
                                    handleCursorOrSelectionChangeRef.current(editor);
                                  }
                                }, 100);

                                // Listen to cursor and selection changes
                                editor.onDidChangeCursorPosition(() => {
                                  if (handleCursorOrSelectionChangeRef.current) {
                                    handleCursorOrSelectionChangeRef.current(editor);
                                  }
                                });

                                editor.onDidChangeCursorSelection(() => {
                                  if (handleCursorOrSelectionChangeRef.current) {
                                    handleCursorOrSelectionChangeRef.current(editor);
                                  }
                                });

                                // Register format document shortcuts inside Monaco
                                // 1. Shift + Alt + F (VS Code default for Formatting)
                                editor.addCommand(
                                  monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF,
                                  () => {
                                    formatCurrentDocument(editor, monaco);
                                  }
                                );

                                // 2. Ctrl + S / Cmd + S (VS Code Save/Format)
                                editor.addCommand(
                                  monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
                                  () => {
                                    formatCurrentDocument(editor, monaco);
                                  }
                                );

                                // 3. Ctrl + Shift + I (Alt format standard)
                                editor.addCommand(
                                  monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyI,
                                  () => {
                                    formatCurrentDocument(editor, monaco);
                                  }
                                );
                              }}
                              options={{
                                minimap: { enabled: false },
                                fontSize: 13,
                                fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
                                automaticLayout: true,
                                cursorBlinking: 'smooth',
                                lineNumbers: 'on',
                                scrollbar: {
                                  vertical: 'visible',
                                  horizontal: 'visible'
                                }
                              }}
                            />
                          );
                        })()}
                      </div>

                      {/* AI Coding Companion Panel (Idea D) */}
                      {isAiAssistantOpen && (
                        <div className={`w-80 md:w-96 h-full border-l flex flex-col shrink-0 overflow-hidden ${
                          isDarkMode 
                            ? 'bg-[#0f0f13] border-white/10 text-white' 
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}>
                          {/* Panel Header */}
                          <div className={`px-3 py-2 border-b flex items-center justify-between shrink-0 ${
                            isDarkMode ? 'bg-[#0b0b0e] border-white/5' : 'bg-white border-slate-200'
                          }`}>
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                              <span className="text-xs font-black uppercase tracking-wider">Assistente de IA</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border leading-none ${
                                aiUsageCount >= 2
                                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                  : aiUsageCount === 1
                                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              }`}>
                                {2 - aiUsageCount}/2 restantes
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsAiAssistantOpen(false)}
                              className={`p-1 rounded transition-colors cursor-pointer hover:bg-red-500/15 hover:text-red-400 ${
                                isDarkMode ? 'text-white/40' : 'text-slate-400'
                              }`}
                              title="Fechar Assistente"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Quick AI Action shortcuts */}
                          <div className={`p-2 border-b grid grid-cols-3 gap-1 shrink-0 ${
                            isDarkMode ? 'bg-black/10 border-white/5' : 'bg-slate-100/50 border-slate-200'
                          }`}>
                            <button
                              type="button"
                              onClick={() => handleCallAiAssistant('explain')}
                              disabled={isAiLoading}
                              className={`px-1 py-1.5 rounded-lg border text-[9px] font-bold uppercase transition-all flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-50 ${
                                isDarkMode
                                  ? 'border-blue-500/20 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10'
                                  : 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 shadow-sm'
                              }`}
                              title="Explica o código ou trecho selecionado"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Explicar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCallAiAssistant('optimize')}
                              disabled={isAiLoading}
                              className={`px-1 py-1.5 rounded-lg border text-[9px] font-bold uppercase transition-all flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-50 ${
                                isDarkMode
                                  ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 shadow-sm'
                              }`}
                              title="Melhora a legibilidade e performance do código"
                            >
                              <Code2 className="w-3.5 h-3.5" />
                              <span>Otimizar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCallAiAssistant('bugs')}
                              disabled={isAiLoading}
                              className={`px-1 py-1.5 rounded-lg border text-[9px] font-bold uppercase transition-all flex flex-col items-center justify-center gap-1 cursor-pointer disabled:opacity-50 ${
                                isDarkMode
                                  ? 'border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10'
                                  : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100 shadow-sm'
                              }`}
                              title="Busca potenciais bugs ou falhas de sintaxe"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              <span>Bugs</span>
                            </button>
                          </div>

                          {/* Chat Message list */}
                          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
                            {aiChatHistory.map((message, idx) => {
                              const isUser = message.role === 'user';
                              return (
                                <div key={idx} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                                  <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                                    isUser
                                      ? 'bg-blue-600 text-white rounded-br-none'
                                      : isDarkMode
                                      ? 'bg-white/5 text-slate-100 rounded-bl-none border border-white/5'
                                      : 'bg-white text-slate-800 rounded-bl-none border border-slate-200 shadow-sm'
                                  }`}>
                                    {isUser ? (
                                      <p className="whitespace-pre-wrap">{message.content}</p>
                                    ) : (
                                      <div 
                                        className="prose prose-sm dark:prose-invert text-xs break-words max-w-none space-y-1.5 
                                          prose-headings:text-xs prose-headings:font-bold prose-headings:mt-2 prose-headings:mb-1
                                          prose-p:leading-relaxed prose-pre:bg-black/30 prose-pre:p-1.5 prose-pre:rounded prose-pre:font-mono prose-pre:text-[10px]"
                                        dangerouslySetInnerHTML={{ __html: marked.parse(message.content) }}
                                      />
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            
                            {/* Loading message */}
                            {isAiLoading && (
                              <div className="flex flex-col items-start">
                                <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed flex items-center gap-2 ${
                                  isDarkMode ? 'bg-white/5 text-white/50 border border-white/5' : 'bg-white text-slate-400 border border-slate-200 shadow-sm'
                                }`}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                  <span className="italic">Gerando resposta...</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Chat input form */}
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (aiPrompt.trim() && !isAiLoading) {
                                handleCallAiAssistant('custom');
                              }
                            }}
                            className={`p-3 border-t flex gap-1.5 items-center shrink-0 ${
                              isDarkMode ? 'bg-[#0b0b0e] border-white/5' : 'bg-white border-slate-200'
                            }`}
                          >
                            <input
                              type="text"
                              value={aiPrompt}
                              onChange={(e) => setAiPrompt(e.target.value)}
                              disabled={isAiLoading}
                              placeholder="Pergunte sobre seu código..."
                              className={`flex-1 min-w-0 text-xs px-3 py-1.5 rounded-lg border outline-none focus:ring-1 focus:ring-purple-400 ${
                                isDarkMode 
                                  ? 'bg-[#15151a] border-white/10 text-white placeholder-white/30' 
                                  : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 shadow-inner'
                              }`}
                            />
                            
                            <button
                              type="submit"
                              disabled={!aiPrompt.trim() || isAiLoading}
                              className={`p-2 rounded-lg transition-all flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                isDarkMode
                                  ? 'bg-purple-600 text-white hover:bg-purple-500'
                                  : 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm'
                              }`}
                              title="Enviar pergunta"
                            >
                              <Play className="w-3.5 h-3.5 rotate-90 fill-current" />
                            </button>

                            {aiChatHistory.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setAiChatHistory([
                                    {
                                      role: 'assistant',
                                      content: 'Histórico de conversa limpo! Prontos para um novo assunto. ✨'
                                    }
                                  ]);
                                }}
                                className={`p-2 rounded-lg transition-all border cursor-pointer hover:bg-red-500/15 hover:text-red-400 ${
                                  isDarkMode
                                    ? 'border-white/10 bg-white/5 text-white/50'
                                    : 'border-slate-200 bg-white text-slate-400'
                                }`}
                                title="Limpar conversa"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </form>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Live Preview Sandbox Container */}
                  <div className={`border-l flex flex-col overflow-hidden ${
                    showPreviewMobile ? 'flex' : 'hidden'
                  } ${
                    showPreviewDesktop ? 'md:flex' : 'md:hidden'
                  } ${
                    mobileCodeViewMode === 'split' ? 'h-1/2 md:h-full' : 'h-full'
                  } md:w-[45%] w-full shrink-0 ${
                    isDarkMode ? 'bg-[#0f0f12] border-white/5' : 'bg-white border-slate-200'
                  }`}>
                    {/* Live Preview Header */}
                    <div className={`px-4 py-2 border-b flex items-center justify-between shrink-0 ${
                      isDarkMode ? 'bg-[#0c0c0e] border-white/5' : 'bg-slate-50 border-slate-200'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Play className="w-3.5 h-3.5 text-emerald-500" />
                        <span className={`text-xs font-bold ${isDarkMode ? 'text-white/80' : 'text-slate-600'}`}>
                          Live Preview (Resultado)
                        </span>
                      </div>

                      {/* Display toggle for View Modes on Preview Container as well, keeping it fully responsive */}
                      <div className="flex md:hidden items-center bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/5 gap-0.5 select-none">
                        <button
                          type="button"
                          onClick={() => setMobileCodeViewMode('editor')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                            mobileCodeViewMode === 'editor'
                              ? isDarkMode
                                ? 'bg-blue-500 text-white'
                                : 'bg-white text-indigo-600'
                              : isDarkMode
                              ? 'text-white/60 hover:text-white hover:bg-white/5'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                          }`}
                        >
                          Editor
                        </button>
                        <button
                          type="button"
                          onClick={() => setMobileCodeViewMode('preview')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                            mobileCodeViewMode === 'preview'
                              ? isDarkMode
                                ? 'bg-blue-500 text-white'
                                : 'bg-white text-indigo-600'
                              : isDarkMode
                              ? 'text-white/60 hover:text-white hover:bg-white/5'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                          }`}
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => setMobileCodeViewMode('split')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer ${
                            mobileCodeViewMode === 'split'
                              ? isDarkMode
                                ? 'bg-blue-500 text-white'
                                : 'bg-white text-indigo-600'
                              : isDarkMode
                              ? 'text-white/60 hover:text-white hover:bg-white/5'
                              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                          }`}
                        >
                          Split
                        </button>
                      </div>
                    </div>
                    
                    {/* Frame sandbox viewer */}
                    <div className="flex-1 w-full h-full bg-white relative flex flex-col overflow-hidden">
                      <div className="flex-1 min-h-[150px] relative">
                        <iframe
                          title="Live Preview Sandbox"
                          srcDoc={getSandboxSrcDoc()}
                          className="w-full h-full border-none bg-white"
                          sandbox="allow-scripts"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      {/* Interactive Web Console */}
                      <div className={`border-t flex flex-col transition-all duration-300 ${
                        isConsoleOpen ? 'h-52' : 'h-8'
                      } ${
                        isDarkMode 
                          ? 'bg-[#0f0f13] border-white/10 text-white/90' 
                          : 'bg-slate-900 border-slate-800 text-slate-100'
                      }`}>
                        {/* Console Header */}
                        <div className="flex items-center justify-between px-3 py-1.5 shrink-0 bg-black/20 select-none">
                          <button 
                            type="button"
                            onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                            className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider cursor-pointer hover:opacity-80"
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${consoleLogs.length > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                            <span>Console do Sandbox ({consoleLogs.length})</span>
                          </button>
                          <div className="flex items-center gap-1.5">
                            {consoleLogs.length > 0 && (
                              <button
                                type="button"
                                onClick={clearConsoleLogs}
                                className="px-1.5 py-0.5 text-[8px] uppercase font-bold rounded bg-white/10 hover:bg-white/20 transition-all cursor-pointer text-white/70 hover:text-white border border-transparent"
                                title="Limpar Console"
                              >
                                Limpar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                              className="p-1 hover:bg-white/10 rounded transition-all cursor-pointer text-white/50 hover:text-white"
                            >
                              <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${isConsoleOpen ? '' : 'rotate-180'}`} />
                            </button>
                          </div>
                        </div>

                        {/* Console Logs Body */}
                        {isConsoleOpen && (
                          <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px] leading-relaxed select-text space-y-1">
                            {consoleLogs.length === 0 ? (
                              <div className="h-full flex items-center justify-center text-white/30 text-[9px] italic py-8">
                                Nenhum log registrado. Use console.log() no seu script.js ou index.html
                              </div>
                            ) : (
                              consoleLogs.map((log) => {
                                let badgeColor = 'text-blue-400 bg-blue-400/10 border-blue-400/20';
                                if (log.level === 'warn') badgeColor = 'text-amber-400 bg-amber-400/10 border-amber-400/20';
                                if (log.level === 'error') badgeColor = 'text-red-400 bg-red-400/10 border-red-400/20';
                                if (log.level === 'info') badgeColor = 'text-sky-400 bg-sky-400/10 border-sky-400/20';

                                return (
                                  <div key={log.id} className="flex items-start gap-2 py-0.5 border-b border-white/5 hover:bg-white/5 px-1.5 rounded transition-colors">
                                    <span className={`text-[7px] px-1 py-0.2 rounded border uppercase font-bold tracking-wide shrink-0 ${badgeColor}`}>
                                      {log.level}
                                    </span>
                                    <span className="break-all whitespace-pre-wrap flex-1">{log.message}</span>
                                    <span className="text-[8px] opacity-30 ml-auto shrink-0 select-none">
                                      {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour12: false })}
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {activeTab === 'file' && (
            <FileTransferTab
              isDarkMode={isDarkMode}
              padName={padName}
              mySenderId={mySenderId.current}
              connectedPeers={connectedPeers}
              transfers={transfers}
              sendFileToPeer={sendFileToPeer}
              peerError={peerError}
            />
          )}
        </div> {/* Closes Editor Area */}

        {/* Sliding Version History Panel */}
        <HistoryPanel
          isOpen={isHistoryOpen}
          onClose={() => setIsHistoryOpen(false)}
          versions={versions}
          onRestoreVersion={handleRestoreVersion}
          onSaveCheckpoint={handleSaveManualCheckpoint}
          onClearHistory={handleClearHistory}
          isDarkMode={isDarkMode}
        />

        {/* Sliding Security Panel */}
        <SecurityPanel
          isOpen={isSecurityOpen}
          onClose={() => setIsSecurityOpen(false)}
          hasPassword={hasPassword}
          onSetPassword={handleSetPassword}
          onRemovePassword={handleRemovePassword}
          isDarkMode={isDarkMode}
        />
      </main>

      {/* Editor Footer / Statistics */}
      <footer className={`h-10 px-4 sm:px-6 border-t text-[10px] flex justify-between items-center gap-3 font-semibold transition-colors shrink-0 ${
        isDarkMode 
          ? 'bg-[#0a0a0c] border-white/5 text-white/30 font-mono tracking-wider' 
          : 'bg-white border-slate-200 text-slate-400'
      }`}>
        <div className="flex flex-wrap items-center gap-4 uppercase">
          <span className={`px-2 py-0.5 rounded font-bold ${
            isDarkMode 
              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
              : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
          }`}>
            PÁGINA {currentPage} DE {pageCount}
          </span>
          <span>•</span>
          <span>{charCount} CARACTERES</span>
          <span>•</span>
          <span>{wordCount} PALAVRAS</span>
          <span>•</span>
          <span>{lineCount} LINHAS</span>
        </div>

        <div className="flex items-center gap-4">
          {updatedAt && (
            <span className="hidden sm:inline">
              SINC: <strong className={isDarkMode ? 'text-blue-400' : 'text-indigo-600'}>v{version}</strong> ({new Date(updatedAt).toLocaleTimeString('pt-BR')})
            </span>
          )}
          <div className="flex items-center gap-1.5 font-sans font-medium uppercase text-white/30">
            <span className={`w-1.5 h-1.5 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
            <span>{connectionStatus === 'connected' ? 'SERVIÇO OPERACIONAL' : 'SEM CONEXÃO'}</span>
          </div>
        </div>
      </footer>

      {/* Process Audio Modal overlay */}
      {recordingState === 'review' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`rounded-2xl p-6 md:p-8 max-w-2xl w-full shadow-2xl relative border transition-all duration-200 ${
            isDarkMode 
              ? 'bg-[#0f0f12] border-white/10 text-white shadow-black/80' 
              : 'bg-white border-slate-200 text-slate-800 shadow-slate-200/50'
          }`}>
            <button
              onClick={handleDeleteAudio}
              className={`absolute top-4 right-4 transition-colors cursor-pointer p-1.5 rounded-lg ${
                isDarkMode 
                  ? 'text-white/40 hover:text-white hover:bg-white/5' 
                  : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className={`text-2xl md:text-3xl font-bold font-sans tracking-tight mb-1.5 ${
              isDarkMode ? 'text-white' : 'text-slate-900'
            }`}>
              Processar Gravação de Áudio
            </h2>
            <p className={`text-[10px] font-bold tracking-wider uppercase mb-6 ${
              isDarkMode ? 'text-white/40' : 'text-slate-400'
            }`}>
              REVISE O ÁUDIO GRAVADO E SELECIONE O FORMATO DO RELATÓRIO
            </p>

            {/* Audio Player Card */}
            <div className={`border rounded-xl p-4 flex items-center justify-between mb-6 transition-colors ${
              isDarkMode ? 'bg-white/[0.02] border-white/10' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-4">
                <button
                  onClick={togglePlayAudio}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer text-white shadow-md hover:scale-[1.02] active:scale-[0.98] ${
                    isDarkMode 
                      ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/10' 
                      : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/10'
                  }`}
                >
                  {isAudioPlaying ? (
                    <Pause className="w-5 h-5 fill-white text-white" />
                  ) : (
                    <Play className="w-5 h-5 fill-white text-white ml-0.5" />
                  )}
                </button>
                <div>
                  <p className={`text-[9px] font-bold tracking-wider uppercase ${
                    isDarkMode ? 'text-white/40' : 'text-slate-400'
                  }`}>
                    ÁUDIO GRAVADO
                  </p>
                  <p className={`text-xl font-bold font-mono ${
                    isDarkMode ? 'text-white' : 'text-slate-800'
                  }`}>
                    {formatDuration(recordingDuration)}
                  </p>
                </div>
              </div>

              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-extrabold tracking-wider uppercase border ${
                isDarkMode 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}>
                <AudioLines className="w-3.5 h-3.5" />
                <span>PRONTO PARA REVISÃO</span>
              </div>
            </div>

            <p className={`text-[10px] font-bold tracking-wider uppercase mb-4 ${
              isDarkMode ? 'text-white/40' : 'text-slate-400'
            }`}>
              ESCOLHA O FORMATO DE PROCESSAMENTO PELA IA
            </p>

            {/* Processing Format Selection Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
              {[
                {
                  id: 'TRANSCRIÇÃO SIMPLES',
                  title: 'TRANSCRIÇÃO SIMPLES',
                  desc: 'Transcreve o áudio exatamente como falado.'
                },
                {
                  id: 'ATA DE REUNIÃO',
                  title: 'ATA DE REUNIÃO',
                  desc: 'Gera uma ata estruturada com decisões.'
                },
                {
                  id: 'E-MAIL PARA CLIENTE',
                  title: 'E-MAIL PARA CLIENTE',
                  desc: 'Redige um e-mail profissional baseado na fala.'
                },
                {
                  id: 'RESUMO EXECUTIVO',
                  title: 'RESUMO EXECUTIVO',
                  desc: 'Cria um resumo conciso com pontos principais.'
                },
                {
                  id: 'EXTRAIR TAREFAS',
                  title: 'EXTRAIR TAREFAS',
                  desc: 'Extrai compromissos e tarefas como checklist.'
                }
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => setSelectedFormat(fmt.id)}
                  className={`text-left p-4 rounded-xl border transition-all cursor-pointer hover:scale-[1.01] ${
                    selectedFormat === fmt.id
                      ? isDarkMode
                        ? 'border-blue-500 bg-blue-500/5 text-white shadow-[0_0_16px_rgba(59,130,246,0.1)]'
                        : 'border-indigo-600 bg-indigo-50/50 text-indigo-950 shadow-[0_0_16px_rgba(79,70,229,0.06)]'
                      : isDarkMode
                        ? 'border-white/5 bg-white/[0.01] hover:bg-white/[0.04] text-white/80 hover:text-white'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <p className={`font-bold text-xs tracking-tight mb-1 uppercase ${
                    selectedFormat === fmt.id
                      ? isDarkMode ? 'text-blue-400' : 'text-indigo-600'
                      : isDarkMode ? 'text-white/90' : 'text-slate-800'
                  }`}>
                    {fmt.title}
                  </p>
                  <p className={`text-[11px] leading-relaxed ${
                    isDarkMode ? 'text-white/50' : 'text-slate-500'
                  }`}>
                    {fmt.desc}
                  </p>
                </button>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-stretch gap-3">
              <button
                onClick={handleProcessAudio}
                disabled={isProcessingAudio}
                className={`flex-1 py-3 px-6 rounded-xl font-bold text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50 hover:scale-[1.01] ${
                  isDarkMode 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-blue-500/20 shadow-blue-500/10' 
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white hover:shadow-indigo-500/20 shadow-indigo-500/10'
                }`}
              >
                {isProcessingAudio ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>PROCESSAR ÁUDIO</span>
              </button>

              <button
                onClick={handleDeleteAudio}
                className={`py-3 px-6 rounded-xl font-bold text-xs tracking-widest uppercase flex items-center justify-center gap-2 transition-all cursor-pointer border hover:scale-[1.01] ${
                  isDarkMode 
                    ? 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10 text-red-400' 
                    : 'border-red-200 bg-red-50 hover:bg-red-100/70 text-red-700'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>EXCLUIR</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Dictation Progress Modal */}
      {isListening && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 max-w-sm w-auto p-1 animate-fadeIn">
          <div className={`rounded-xl p-4 shadow-xl border flex flex-col gap-3 transition-all duration-200 ${
            isDarkMode 
              ? 'bg-[#0f0f12] border-white/10 text-white shadow-black/80' 
              : 'bg-white border-slate-200 text-slate-800 shadow-slate-200/50'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <span className={`text-xs font-bold tracking-wider uppercase ${
                  isDarkMode ? 'text-slate-300' : 'text-slate-600'
                }`}>
                  Ditando em Tempo Real
                </span>
              </div>
              <button
                onClick={handleVoiceToText}
                className={`px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                  isDarkMode 
                    ? 'bg-white/10 hover:bg-white/20 text-white' 
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Parar
              </button>
            </div>
            
            <div className={`p-3 rounded-lg min-h-[60px] max-h-[120px] overflow-y-auto text-sm leading-relaxed border ${
              isDarkMode 
                ? 'bg-black/20 border-white/5 text-white/90' 
                : 'bg-slate-50 border-slate-100 text-slate-700'
            }`}>
              {interimTranscript ? (
                <span className="animate-pulse">{interimTranscript}</span>
              ) : (
                <span className={`italic ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>
                  Fale para começar a ditar...
                </span>
              )}
            </div>
            
            <div className={`text-[10px] flex items-center justify-between ${
              isDarkMode ? 'text-white/30' : 'text-slate-400'
            }`}>
              <span>Dica: diga "ponto", "novo parágrafo", "vírgula"</span>
              <span className="font-mono text-[9px]">BR</span>
            </div>
          </div>
        </div>
      )}

      {/* New File Modal */}
      {isNewFileModalOpen && (
        <div className={`fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-md ${
          isDarkMode ? 'bg-[#0a0a0c]/85' : 'bg-slate-900/40'
        }`}>
          <div className={`w-full max-w-sm p-6 rounded-2xl border shadow-2xl transition-all ${
            isDarkMode ? 'bg-[#0f0f12] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="mb-4">
              <h3 className="text-base font-extrabold tracking-tight">Criar Novo Arquivo</h3>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
                Digite o nome do arquivo com a extensão correspondente (ex: <code className="font-mono">app.js</code>, <code className="font-mono">style.css</code>, <code className="font-mono">template.html</code>).
              </p>
            </div>
            
            <input
              type="text"
              placeholder="ex: scripts.js"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateFile(newFileName);
                  setNewFileName('');
                  setIsNewFileModalOpen(false);
                }
              }}
              className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium transition-all focus:ring-2 focus:ring-blue-500/20 focus:outline-none mb-4 ${
                isDarkMode 
                  ? 'bg-white/5 border-white/10 text-white focus:border-blue-500' 
                  : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-indigo-500'
              }`}
              autoFocus
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setNewFileName('');
                  setIsNewFileModalOpen(false);
                }}
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
                  handleCreateFile(newFileName);
                  setNewFileName('');
                  setIsNewFileModalOpen(false);
                }}
                className={`flex-1 py-2 px-4 text-xs font-semibold rounded-xl transition-all cursor-pointer text-white bg-blue-600 hover:bg-blue-700 shadow-md ${
                  isDarkMode ? 'shadow-blue-950/30' : 'shadow-blue-600/10'
                }`}
              >
                Criar Arquivo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename File Modal */}
      {isRenameModalOpen && (
        <div className={`fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-md ${
          isDarkMode ? 'bg-[#0a0a0c]/85' : 'bg-slate-900/40'
        }`}>
          <div className={`w-full max-w-sm p-6 rounded-2xl border shadow-2xl transition-all ${
            isDarkMode ? 'bg-[#0f0f12] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="mb-4">
              <h3 className="text-base font-extrabold tracking-tight">Renomear Arquivo</h3>
              <p className={`text-xs mt-1 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
                Insira o novo nome para o arquivo <code className="font-mono">{renamingFileName}</code>:
              </p>
            </div>
            
            <input
              type="text"
              placeholder="ex: novo_nome.js"
              value={renameNewName}
              onChange={(e) => setRenameNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRenameFile(renamingFileName, renameNewName);
                }
              }}
              className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium transition-all focus:ring-2 focus:ring-blue-500/20 focus:outline-none mb-4 ${
                isDarkMode 
                  ? 'bg-white/5 border-white/10 text-white focus:border-blue-500' 
                  : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-indigo-500'
              }`}
              autoFocus
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setRenameNewName('');
                  setIsRenameModalOpen(false);
                }}
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
                  handleRenameFile(renamingFileName, renameNewName);
                }}
                className={`flex-1 py-2 px-4 text-xs font-semibold rounded-xl transition-all cursor-pointer text-white bg-blue-600 hover:bg-blue-700 shadow-md ${
                  isDarkMode ? 'shadow-blue-950/30' : 'shadow-blue-600/10'
                }`}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmModalOpen && (
        <div className={`fixed inset-0 z-[110] flex items-center justify-center p-4 backdrop-blur-md ${
          isDarkMode ? 'bg-[#0a0a0c]/85' : 'bg-slate-900/40'
        }`}>
          <div className={`w-full max-w-sm p-6 rounded-2xl border shadow-2xl transition-all ${
            isDarkMode ? 'bg-[#0f0f12] border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="mb-4 text-center">
              <div className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3 ${
                isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'
              }`}>
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold tracking-tight">Excluir Arquivo</h3>
              <p className={`text-xs mt-2 ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>
                Tem certeza que deseja excluir o arquivo <strong className="font-mono text-red-500">{deletingFileName}</strong>? Esta ação pode ser desfeita imediatamente após a exclusão.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setDeletingFileName('');
                  setIsDeleteConfirmModalOpen(false);
                }}
                className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold transition-all border cursor-pointer ${
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
                  if (deletingFileName) {
                    handleDeleteFileConfirm(deletingFileName);
                  }
                }}
                className="flex-1 py-2.5 px-4 text-xs font-semibold rounded-xl transition-all cursor-pointer text-white bg-red-600 hover:bg-red-700 shadow-md shadow-red-600/10"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Context Menu inside Text Editor */}
      {editorContextMenu && editorContextMenu.visible && (
        <div
          className={`fixed z-[999] w-48 rounded-xl border p-1.5 shadow-xl transition-opacity duration-100 ${
            isDarkMode 
              ? 'bg-[#0f0f12] border-white/10 text-white shadow-black/40' 
              : 'bg-white border-slate-200 text-slate-800 shadow-slate-200/50'
          }`}
          style={getContextMenuPosition()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col gap-0.5">
            <button
              onClick={handleCopy}
              disabled={!editorContextMenu.selectedText}
              className={`w-full flex items-center justify-between text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all border-0 bg-transparent cursor-pointer ${
                !editorContextMenu.selectedText
                  ? 'opacity-30 cursor-not-allowed'
                  : isDarkMode
                    ? 'hover:bg-white/5 text-slate-200 hover:text-white'
                    : 'hover:bg-slate-50 text-slate-700 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar</span>
              </div>
              <span className="text-[10px] opacity-45 font-mono">Ctrl+C</span>
            </button>

            <button
              onClick={handleCut}
              disabled={!editorContextMenu.selectedText}
              className={`w-full flex items-center justify-between text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all border-0 bg-transparent cursor-pointer ${
                !editorContextMenu.selectedText
                  ? 'opacity-30 cursor-not-allowed'
                  : isDarkMode
                    ? 'hover:bg-white/5 text-slate-200 hover:text-white'
                    : 'hover:bg-slate-50 text-slate-700 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Scissors className="w-3.5 h-3.5" />
                <span>Recortar</span>
              </div>
              <span className="text-[10px] opacity-45 font-mono">Ctrl+X</span>
            </button>

            <button
              onClick={handlePaste}
              className={`w-full flex items-center justify-between text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all border-0 bg-transparent cursor-pointer ${
                isDarkMode
                  ? 'hover:bg-white/5 text-slate-200 hover:text-white'
                  : 'hover:bg-slate-50 text-slate-700 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clipboard className="w-3.5 h-3.5" />
                <span>Colar</span>
              </div>
              <span className="text-[10px] opacity-45 font-mono">Ctrl+V</span>
            </button>

            <div className={`my-1 border-t ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`} />

            <button
              onClick={() => {
                handleFormat('undo');
                setEditorContextMenu(null);
              }}
              className={`w-full flex items-center justify-between text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all border-0 bg-transparent cursor-pointer ${
                isDarkMode
                  ? 'hover:bg-white/5 text-slate-200 hover:text-white'
                  : 'hover:bg-slate-50 text-slate-700 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Undo className="w-3.5 h-3.5" />
                <span>Desfazer</span>
              </div>
              <span className="text-[10px] opacity-45 font-mono">Ctrl+Z</span>
            </button>

            <button
              onClick={() => {
                handleFormat('redo');
                setEditorContextMenu(null);
              }}
              className={`w-full flex items-center justify-between text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all border-0 bg-transparent cursor-pointer ${
                isDarkMode
                  ? 'hover:bg-white/5 text-slate-200 hover:text-white'
                  : 'hover:bg-slate-50 text-slate-700 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Redo className="w-3.5 h-3.5" />
                <span>Refazer</span>
              </div>
              <span className="text-[10px] opacity-45 font-mono">Ctrl+Y</span>
            </button>

            <div className={`my-1 border-t ${isDarkMode ? 'border-white/5' : 'border-slate-100'}`} />

            <button
              onClick={handleSelectAll}
              className={`w-full flex items-center justify-between text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-all border-0 bg-transparent cursor-pointer ${
                isDarkMode
                  ? 'hover:bg-white/5 text-slate-200 hover:text-white'
                  : 'hover:bg-slate-50 text-slate-700 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5" />
                <span>Selecionar Tudo</span>
              </div>
              <span className="text-[10px] opacity-45 font-mono">Ctrl+A</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
