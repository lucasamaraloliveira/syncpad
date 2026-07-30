/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Pad {
  name: string;
  text: string;
  version: number;
  updatedAt: number;
  passwordHash?: string;
  hasPassword?: boolean;
}

export interface PadVersion {
  id: string;
  padName: string;
  text: string;
  version: number;
  timestamp: number;
  label?: string;
}

export interface CodeFile {
  name: string;
  content: string;
  language: string;
}

export type ClientMessage =
  | { type: 'join'; padName: string; password?: string; senderId?: string; peerId?: string }
  | { 
      type: 'edit'; 
      padName: string; 
      text: string; 
      version: number; 
      senderId: string;
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
    }
  | { type: 'save_checkpoint'; padName: string; label?: string }
  | { type: 'set_password'; padName: string; password?: string }
  | { type: 'request_history'; padName: string }
  | { type: 'clear_history'; padName: string }
  | { type: 'restore_history'; padName: string; versions: PadVersion[] }
  | { type: 'restore_version'; padName: string; versionId: string }
  | { type: 'code_edit'; padName: string; codeFiles: CodeFile[]; senderId: string }
  | { type: 'peer_id_sync'; padName: string; senderId: string; peerId: string }
  | {
      type: 'cursor_move';
      padName: string;
      senderId: string;
      nickname: string;
      color: string;
      fileName: string;
      position: { lineNumber: number; column: number } | null;
      selection: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      } | null;
      textCursor?: {
        top: number;
        left: number;
        height: number;
        collapsed: boolean;
        width: number;
      } | null;
    };

export type ServerMessage =
  | { 
      type: 'sync'; 
      text: string; 
      version: number; 
      updatedAt: number; 
      hasPassword?: boolean; 
      codeFiles?: CodeFile[];
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
    }
  | { type: 'auth_required' }
  | { 
      type: 'auth_success'; 
      text: string; 
      version: number; 
      updatedAt: number; 
      codeFiles?: CodeFile[];
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
    }
  | { type: 'auth_failed'; message: string }
  | { type: 'presence'; activeUsersCount: number; activeUserIds?: string[]; peerIds?: { [senderId: string]: string } }
  | { type: 'history'; versions: PadVersion[] }
  | { type: 'password_set_success'; hasPassword: boolean }
  | { type: 'code_sync'; codeFiles: CodeFile[] }
  | {
      type: 'cursor_update';
      senderId: string;
      nickname: string;
      color: string;
      fileName: string;
      position: { lineNumber: number; column: number } | null;
      selection: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      } | null;
      textCursor?: {
        top: number;
        left: number;
        height: number;
        collapsed: boolean;
        width: number;
      } | null;
    }
  | { type: 'error'; message: string };
