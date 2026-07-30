/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { ClientMessage, ServerMessage, PadVersion, CodeFile } from './src/types.js';
import { GoogleGenAI } from '@google/genai';
import { ExpressPeerServer } from 'peer';

interface StorePad {
  name: string;
  text: string;
  version: number;
  updatedAt: number;
  passwordHash?: string;
  history: PadVersion[];
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

interface ExtWebSocket extends WebSocket {
  padName?: string;
  senderId?: string;
  peerId?: string;
  isAlive?: boolean;
  isAuthenticated?: boolean;
}

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const PADS_DIR = path.join(DATA_DIR, 'pads');

// Ensure storage directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(PADS_DIR)) {
  fs.mkdirSync(PADS_DIR, { recursive: true });
}

// Password hashing helper
const PEPPER = 'syncpad-secure-salt-2026';
function hashPassword(password: string): string {
  return crypto.createHmac('sha256', PEPPER).update(password).digest('hex');
}

// Hashed filename logic to prevent Directory Traversal
function getPadFilename(padName: string): string {
  const normalized = padName.trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex') + '.json';
}

// Load pad from disk
function loadPad(padName: string): StorePad {
  const filename = getPadFilename(padName);
  const filePath = path.join(PADS_DIR, filename);
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (e) {
      console.error(`Erro ao carregar o pad "${padName}":`, e);
    }
  }
  return {
    name: padName,
    text: '',
    version: 0,
    updatedAt: Date.now(),
    history: []
  };
}

// Save pad to disk
function savePad(pad: StorePad) {
  const filename = getPadFilename(pad.name);
  const filePath = path.join(PADS_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(pad, null, 2), 'utf8');
}

// Helper to get Gemini client lazily
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // AI Autocomplete endpoint
  app.post('/api/ai/autocomplete', async (req, res) => {
    try {
      const { textBefore, textAfter } = req.body;
      const aiClient = getGeminiClient();
      
      const prompt = `Você é um assistente de escrita em tempo real. O usuário está digitando um texto e solicitou um autocompletar automático baseado no contexto.

Texto digitado ANTES do cursor:
"""
${textBefore || ''}
"""

Texto digitado DEPOIS do cursor:
"""
${textAfter || ''}
"""

Instruções:
- Proponha uma continuação de texto natural, lógica e curta (algumas palavras ou no máximo uma frase/parágrafo curto) que complete o raciocínio.
- Retorne APENAS a continuação proposta, sem aspas, sem explicações, sem introduções e sem repetir o texto que o usuário já digitou.
- Se nenhuma continuação fizer sentido, responda com uma string vazia.
- Mantenha o idioma atual do texto (normalmente português).`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          temperature: 0.7,
        }
      });

      const completion = response.text || '';
      res.json({ completion });
    } catch (error: any) {
      console.error('Erro no autocomplete de IA:', error);
      res.status(500).json({ error: error.message || 'Erro ao gerar autocompletar' });
    }
  });

  // AI Audio processing endpoint
  app.post('/api/ai/process-audio', async (req, res) => {
    try {
      const { audio, mimeType, format } = req.body;
      if (!audio) {
        return res.status(400).json({ error: 'Nenhum áudio enviado' });
      }

      const aiClient = getGeminiClient();

      let instruction = '';
      switch (format) {
        case 'TRANSCRIÇÃO SIMPLES':
          instruction = `Você é um transcritor especialista. Transcreva este áudio em português de forma extremamente limpa e estruturada.
Corrija pequenos erros gramaticais de fala, hesitações ou repetições (remova hums, ahs, né, etc) para tornar a leitura fluida, mas mantendo fielmente o teor original da fala.
Divida o conteúdo em parágrafos bem definidos com espaçamento duplo. Use negrito (ex: **palavra-chave**) de maneira estratégica para destacar as palavras-chave e conceitos mais importantes, permitindo uma leitura rápida (leitura dinâmica).

Formate o seu retorno obrigatoriamente usando Markdown limpo com a seguinte estrutura:

### 📝 Transcrição da Gravação
---

(Insira aqui o texto transcrito, estruturado em parágrafos e com termos importantes em negrito)`;
          break;

        case 'ATA DE REUNIÃO':
          instruction = `Você é um secretário executivo profissional. Crie uma ata de reunião estruturada, polida e extremamente legível baseada neste áudio em português. 
Mantenha um visual elegante usando formatação rica do Markdown (títulos, divisores, negritos e listas com marcadores/emojis).

Formate o seu retorno obrigatoriamente usando Markdown limpo com a seguinte estrutura:

### 🤝 Ata de Reunião
---
**📅 Data/Hora:** *(Deixe para preenchimento ou estime se mencionado)*  
**📌 Assunto Principal:** *(Sintetize o assunto central da discussão em uma única frase impactante)*

#### 💬 Tópicos Discutidos
- *[Tópico 1]*: Detalhe o que foi discutido sobre este assunto em uma frase clara e objetiva. Use negrito para dar ênfase aos pontos chave.
- *[Tópico 2]*: Detalhe o que foi discutido sobre este assunto.

#### 🎯 Principais Decisões Tomadas
- **[Decisão 1]:** Descreva a resolução ou consenso estabelecido.
- **[Decisão 2]:** Descreva a resolução ou consenso estabelecido.

#### 🚀 Próximos Passos & Compromissos
- [ ] **[Responsável / Todos]:** Descrição clara da tarefa, ação ou compromisso pendente.
- [ ] **[Responsável]:** Outra ação mapeada.

---
*Ata sintetizada automaticamente através de Inteligência Artificial.*`;
          break;

        case 'E-MAIL PARA CLIENTE':
          instruction = `Você é um assessor de comunicação empresarial especialista. Com base no áudio fornecido, redija um e-mail profissional, elegante e formal em português, adequado para ser enviado diretamente a um cliente ou parceiro comercial. 
Torne a linguagem clara, polida, assertiva e amigável, garantindo um design de texto perfeito com excelente espaçamento.

Formate o seu retorno obrigatoriamente usando Markdown limpo com a seguinte estrutura:

### ✉️ Rascunho de E-mail Profissional
---
**Assunto:** *[Assunto direto, profissional e atrativo]*

**Prezado(a) [Nome do Cliente],**

[Parágrafo introdutório amigável conectando com o tema discutido no áudio.]

[Parágrafo de desenvolvimento detalhando os pontos combinados ou atualizações. Use espaçamento generoso entre parágrafos e negritos estratégicos para destacar prazos ou datas.]

**Nossos próximos passos e alinhamentos:**
- **[Ação 1]:** Detalhes sobre a entrega ou andamento.
- **[Ação 2]:** Outro ponto de atenção relevante.

Ficamos inteiramente à disposição para esclarecer qualquer dúvida ou realizar novos ajustes.

Atenciosamente,  
**[Seu Nome / Sua Empresa]**

---
*Dica: Revise as informações entre colchetes antes de enviar o e-mail.*`;
          break;

        case 'RESUMO EXECUTIVO':
          instruction = `Você é um analista de negócios sênior. Crie um resumo executivo de alto nível, conciso, de altíssimo impacto e legibilidade excepcional do áudio fornecido em português. Use markdown estruturado para que o leitor consiga absorver todas as informações vitais em menos de 30 segundos.

Formate o seu retorno obrigatoriamente usando Markdown limpo com a seguinte estrutura:

### 📊 Resumo Executivo
---

#### 🔍 Visão Geral
*Escreva um parágrafo conciso de 2 a 3 linhas sintetizando brilhantemente o contexto e a essência geral do áudio.*

#### 💡 Pontos-Chave (Key Takeaways)
- 🔸 **[Tema Principal]:** Detalhe principal e crítico do que foi dito.
- 🔸 **[Destaque Técnico/Comercial]:** Detalhe principal e crítico do que foi dito.
- 🔸 **[Alinhamento Operacional]:** Detalhe principal e crítico do que foi dito.

#### 📈 Conclusão & Impacto
*Sintetize em uma única frase inspiradora e objetiva qual o próximo grande objetivo ou impacto das informações discutidas no áudio.*

---`;
          break;

        case 'EXTRAIR TAREFAS':
          instruction = `Você é um gerente de projetos ágil especialista. Analise o áudio fornecido e extraia com precisão cirúrgica todos os compromissos, tarefas, responsabilidades e planos de ação mencionados. Mantenha um visual moderno e super legível.

Formate o seu retorno obrigatoriamente usando Markdown limpo com a seguinte estrutura:

### 📋 Painel de Tarefas & Checklist de Ações
---

#### 🔴 Prioridade Máxima (Urgente / Crítico)
- [ ] ⚠️ **[Tarefa Urgente]:** *[Ação a ser executada]* - **Responsável:** *[Nome ou Cargo se houver]* - **Prazo:** *[Se mencionado]*
- [ ] ⚠️ **[Tarefa Urgente]:** *[Ação a ser executada]*

#### 🟡 Tarefas Gerais / Próximos Passos
- [ ] 📅 **[Tarefa Geral]:** *[Ação a ser executada]* - **Responsável:** *[Nome ou Cargo se houver]*
- [ ] 📅 **[Tarefa Geral]:** *[Ação a ser executada]*

#### 🔵 Notas & Insights Adicionais
- 💡 **[Observação relevante]:** *[Alguma informação complementar ou lembrete valioso extraído do áudio]*

---
*Nota: Se o áudio não tiver tarefas explícitas, sugira de forma inteligente os próximos passos lógicos baseados no conteúdo discutido.*`;
          break;

        default:
          instruction = `Transcreva e resuma este áudio em português de forma muito legível e estruturada com Markdown (títulos, negritos e tópicos).`;
      }

      const audioPart = {
        inlineData: {
          mimeType: mimeType || 'audio/webm',
          data: audio,
        }
      };

      const response = await aiClient.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [audioPart, { text: instruction }],
      });

      const result = response.text || '';
      res.json({ result });
    } catch (error: any) {
      console.error('Erro ao processar áudio por IA:', error);
      res.status(500).json({ error: error.message || 'Erro ao processar gravação de áudio' });
    }
  });

  // API Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // AI Coding Assistant endpoint
  app.post('/api/ai/coding-assistant', async (req, res) => {
    try {
      const { code, fileName, action, customPrompt, chatHistory } = req.body;
      const aiClient = getGeminiClient();

      let systemInstruction = `Você é um Assistente de Programação IA de elite integrado a uma IDE web colaborativa chamada SyncPad.
Seu objetivo é ajudar desenvolvedores a escreverem códigos limpos, eficientes, seguros e modernos.
O usuário está trabalhando no arquivo chamado "${fileName || 'documento'}".

Mantenha suas respostas extremamente polidas, diretas, ricas em formatação Markdown elegante, sem introduções desnecessárias ou bajulação (foco técnico de alto nível).
Sempre forneça exemplos práticos de código em blocos de código formatados com a linguagem correspondente (html, css ou javascript).

Se houver um trecho de código fornecido abaixo, use-o como contexto principal para sua ação.`;

      let prompt = '';
      
      if (code) {
        prompt += `Código em edição no arquivo "${fileName || 'documento'}":\n\`\`\`${fileName?.split('.').pop() || 'javascript'}\n${code}\n\`\`\`\n\n`;
      }

      switch (action) {
        case 'explain':
          prompt += `AÇÃO SOLICITADA: Explique detalhadamente como o código acima funciona, destacando sua lógica de execução, fluxos de controle e possíveis particularidades técnicas. Divida em seções com títulos e use listas com marcadores para maior legibilidade.`;
          break;
        case 'optimize':
          prompt += `AÇÃO SOLICITADA: Analise o código acima e sugira otimizações de performance, melhorias de legibilidade, simplificações de sintaxe ou correção de más práticas. Apresente os problemas encontrados em uma tabela ou lista clara, e depois forneça a versão FINAL REFEITA E OTIMIZADA do código em um único bloco de código completo, comentando as alterações.`;
          break;
        case 'bugs':
          prompt += `AÇÃO SOLICITADA: Verifique minuciosamente o código acima em busca de falhas lógicas, vulnerabilidades de segurança, erros de sintaxe ou comportamentos inesperados. Se encontrar erros, descreva-os e mostre exatamente como corrigi-los, incluindo um bloco de código corrigido. Se o código estiver livre de erros, dê os parabéns e comente brevemente sobre sua qualidade.`;
          break;
        case 'custom':
          prompt += `PERGUNTA DO USUÁRIO:\n${customPrompt}\n\nResponda de forma completa, focando em ajudar o programador a resolver o problema relatado.`;
          break;
        default:
          prompt += `AÇÃO SOLICITADA: Analise o código acima e forneça conselhos úteis sobre sua estrutura e funcionamento.`;
      }

      // Compile history if present
      let contents: any[] = [];
      if (chatHistory && chatHistory.length > 0) {
        contents = chatHistory.map((msg: any) => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }));
        contents.push({
          role: 'user',
          parts: [{ text: prompt }]
        });
      } else {
        contents = [prompt];
      }

      const response = await aiClient.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.3,
        }
      });

      const result = response.text || '';
      res.json({ result });
    } catch (error: any) {
      console.error('Erro no Assistente de Programação de IA:', error);
      res.status(500).json({ error: error.message || 'Erro ao gerar resposta do assistente de IA' });
    }
  });

  // API to export or check pad meta directly if needed
  app.get('/api/pad/:name/meta', (req, res) => {
    const padName = req.params.name;
    const pad = loadPad(padName);
    res.json({
      name: pad.name,
      updatedAt: pad.updatedAt,
      version: pad.version,
      hasPassword: !!pad.passwordHash,
      textLength: pad.text.length
    });
  });

  const server = http.createServer(app);

  // Initialize and mount local PeerServer signaling server
  const peerServer = ExpressPeerServer(server, {
    path: '/'
  });
  app.use('/peerjs', peerServer);

  // Capture PeerJS's upgrade listener to prevent it from intercepting other websocket connections
  const upgradeListeners = server.listeners('upgrade');
  server.removeAllListeners('upgrade');
  const peerUpgradeListener = upgradeListeners[0];

  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket Upgrade
  server.on('upgrade', (request, socket, head) => {
    try {
      const url = request.url || '';
      const pathname = url.split('?')[0];

      if (pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else if (pathname.startsWith('/peerjs')) {
        if (peerUpgradeListener) {
          peerUpgradeListener(request, socket, head);
        } else {
          socket.destroy();
        }
      } else {
        socket.destroy();
      }
    } catch (err) {
      console.error('Error handling WebSocket upgrade:', err);
      socket.destroy();
    }
  });

  // Active rooms & connections
  // Pad Name -> Set of WebSockets
  const rooms = new Map<string, Set<ExtWebSocket>>();

  function broadcastPresence(padName: string) {
    const clients = rooms.get(padName);
    const count = clients ? clients.size : 0;
    const userIds = clients ? Array.from(clients).map(c => c.senderId).filter(Boolean) as string[] : [];
    
    const peerIds: { [senderId: string]: string } = {};
    clients?.forEach(c => {
      if (c.senderId && c.peerId) {
        peerIds[c.senderId] = c.peerId;
      }
    });

    const message: ServerMessage = { 
      type: 'presence', 
      activeUsersCount: count, 
      activeUserIds: userIds, 
      peerIds 
    };
    const payload = JSON.stringify(message);

    clients?.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
        client.send(payload);
      }
    });
  }

  wss.on('connection', (ws: ExtWebSocket) => {
    ws.isAlive = true;
    ws.isAuthenticated = false;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (messageBuffer) => {
      try {
        const data: ClientMessage = JSON.parse(messageBuffer.toString());
        const { type, padName } = data;

        if (!padName || padName.trim().length === 0) {
          ws.send(JSON.stringify({ type: 'error', message: 'Nome do bloco inválido.' }));
          return;
        }

        const normalizedPadName = padName.trim();

        // 1. Join Pad
        if (type === 'join') {
          ws.padName = normalizedPadName;
          if ('senderId' in data) {
            ws.senderId = data.senderId;
          }
          if ('peerId' in data) {
            ws.peerId = data.peerId;
          }
          const pad = loadPad(normalizedPadName);

          // Verify password
          if (pad.passwordHash) {
            const clientPass = 'password' in data ? data.password : '';
            if (!clientPass || hashPassword(clientPass) !== pad.passwordHash) {
              ws.send(JSON.stringify({ type: 'auth_required' }));
              return;
            }
          }

          ws.isAuthenticated = true;

          // Add to room
          if (!rooms.has(normalizedPadName)) {
            rooms.set(normalizedPadName, new Set());
          }
          rooms.get(normalizedPadName)!.add(ws);

          // Send current state
          const syncMsg: ServerMessage = {
            type: 'sync',
            text: pad.text,
            version: pad.version,
            updatedAt: pad.updatedAt,
            hasPassword: !!pad.passwordHash,
            codeFiles: pad.codeFiles,
            headerText: pad.headerText,
            footerText: pad.footerText,
            headerAlign: pad.headerAlign,
            headerFont: pad.headerFont,
            headerFontSize: pad.headerFontSize,
            headerColor: pad.headerColor,
            headerBold: pad.headerBold,
            headerItalic: pad.headerItalic,
            headerUnderline: pad.headerUnderline,
            footerAlign: pad.footerAlign,
            footerFont: pad.footerFont,
            footerFontSize: pad.footerFontSize,
            footerColor: pad.footerColor,
            footerBold: pad.footerBold,
            footerItalic: pad.footerItalic,
            footerUnderline: pad.footerUnderline,
          };
          ws.send(JSON.stringify(syncMsg));

          // Send history
          const historyMsg: ServerMessage = {
            type: 'history',
            versions: pad.history
          };
          ws.send(JSON.stringify(historyMsg));

          // Broadcast presence
          broadcastPresence(normalizedPadName);
          return;
        }

        // Authentication Guard for other actions
        if (!ws.isAuthenticated || ws.padName !== normalizedPadName) {
          ws.send(JSON.stringify({ type: 'error', message: 'Acesso não autorizado.' }));
          return;
        }

        const pad = loadPad(normalizedPadName);

        // 2. Edit Pad
        if (type === 'edit') {
          const { 
            text, version, senderId,
            headerText, footerText,
            headerAlign, headerFont, headerFontSize, headerColor, headerBold, headerItalic, headerUnderline,
            footerAlign, footerFont, footerFontSize, footerColor, footerBold, footerItalic, footerUnderline
          } = data;
          ws.senderId = senderId;

          // Anti-flooding / Security check: maximum content size (500KB)
          if (text.length > 500000) {
            ws.send(JSON.stringify({ type: 'error', message: 'O conteúdo excede o limite de 500KB.' }));
            return;
          }

          // Automatic Backup Checkpoint
          // We save a version if:
          // - Previous text wasn't empty, AND
          // - Previous text is different from new text, AND
          // - There's no history OR the last backup is more than 45 seconds old
          const now = Date.now();
          const lastHistory = pad.history[pad.history.length - 1];
          const textChanged = pad.text !== text;
          const isOlderThan45s = !lastHistory || (now - lastHistory.timestamp > 45000);

          if (pad.text.trim() !== '' && textChanged && isOlderThan45s) {
            const newVersion: PadVersion = {
              id: now.toString(),
              padName: normalizedPadName,
              text: pad.text, // save the state before the edit
              version: pad.version,
              timestamp: now,
              label: `Backup Automático (v${pad.version})`
            };
            pad.history.push(newVersion);
            // Cap history to 30 versions to save space
            if (pad.history.length > 30) {
              pad.history.shift();
            }
          }

          // Apply edit
          pad.text = text;
          pad.version = Math.max(pad.version + 1, version);
          pad.updatedAt = now;

          if (headerText !== undefined) pad.headerText = headerText;
          if (footerText !== undefined) pad.footerText = footerText;
          if (headerAlign !== undefined) pad.headerAlign = headerAlign;
          if (headerFont !== undefined) pad.headerFont = headerFont;
          if (headerFontSize !== undefined) pad.headerFontSize = headerFontSize;
          if (headerColor !== undefined) pad.headerColor = headerColor;
          if (headerBold !== undefined) pad.headerBold = headerBold;
          if (headerItalic !== undefined) pad.headerItalic = headerItalic;
          if (headerUnderline !== undefined) pad.headerUnderline = headerUnderline;
          if (footerAlign !== undefined) pad.footerAlign = footerAlign;
          if (footerFont !== undefined) pad.footerFont = footerFont;
          if (footerFontSize !== undefined) pad.footerFontSize = footerFontSize;
          if (footerColor !== undefined) pad.footerColor = footerColor;
          if (footerBold !== undefined) pad.footerBold = footerBold;
          if (footerItalic !== undefined) pad.footerItalic = footerItalic;
          if (footerUnderline !== undefined) pad.footerUnderline = footerUnderline;

          savePad(pad);

          // Broadcast sync to other clients in the same room
          const syncMsg: ServerMessage = {
            type: 'sync',
            text: pad.text,
            version: pad.version,
            updatedAt: pad.updatedAt,
            hasPassword: !!pad.passwordHash,
            headerText: pad.headerText,
            footerText: pad.footerText,
            headerAlign: pad.headerAlign,
            headerFont: pad.headerFont,
            headerFontSize: pad.headerFontSize,
            headerColor: pad.headerColor,
            headerBold: pad.headerBold,
            headerItalic: pad.headerItalic,
            headerUnderline: pad.headerUnderline,
            footerAlign: pad.footerAlign,
            footerFont: pad.footerFont,
            footerFontSize: pad.footerFontSize,
            footerColor: pad.footerColor,
            footerBold: pad.footerBold,
            footerItalic: pad.footerItalic,
            footerUnderline: pad.footerUnderline,
          };
          const payload = JSON.stringify(syncMsg);

          const clients = rooms.get(normalizedPadName);
          clients?.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN && client.isAuthenticated) {
              client.send(payload);
            }
          });

          // Also broadcast updated history to everyone if a new backup was saved
          if (textChanged && isOlderThan45s) {
            const historyMsg: ServerMessage = {
              type: 'history',
              versions: pad.history
            };
            const historyPayload = JSON.stringify(historyMsg);
            clients?.forEach((client) => {
              if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
                client.send(historyPayload);
              }
            });
          }
          return;
        }

        // 3. Save Manual Checkpoint
        if (type === 'save_checkpoint') {
          const { label } = data;
          const now = Date.now();

          const manualVersion: PadVersion = {
            id: 'm-' + now,
            padName: normalizedPadName,
            text: pad.text,
            version: pad.version,
            timestamp: now,
            label: label?.trim() || `Versão Salva (${new Date(now).toLocaleTimeString('pt-BR')})`
          };

          pad.history.push(manualVersion);
          if (pad.history.length > 30) {
            pad.history.shift();
          }

          savePad(pad);

          // Broadcast new history to all clients
          const historyMsg: ServerMessage = {
            type: 'history',
            versions: pad.history
          };
          const payload = JSON.stringify(historyMsg);

          rooms.get(normalizedPadName)?.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
              client.send(payload);
            }
          });
          return;
        }

        // 4. Set/Update Password
        if (type === 'set_password') {
          const { password } = data;
          if (password && password.trim().length > 0) {
            pad.passwordHash = hashPassword(password);
          } else {
            delete pad.passwordHash;
          }

          savePad(pad);

          const response: ServerMessage = {
            type: 'password_set_success',
            hasPassword: !!pad.passwordHash
          };
          const payload = JSON.stringify(response);

          rooms.get(normalizedPadName)?.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
              client.send(payload);
            }
          });
          return;
        }

        // 5. Request History
        if (type === 'request_history') {
          const historyMsg: ServerMessage = {
            type: 'history',
            versions: pad.history
          };
          ws.send(JSON.stringify(historyMsg));
          return;
        }

        // 6. Restore Version
        if (type === 'restore_version') {
          const { versionId } = data;
          const targetVersion = pad.history.find((v) => v.id === versionId);

          if (!targetVersion) {
            ws.send(JSON.stringify({ type: 'error', message: 'Versão não encontrada no histórico.' }));
            return;
          }

          // Create a backup of current state before restoring
          const now = Date.now();
          const backupVersion: PadVersion = {
            id: now.toString(),
            padName: normalizedPadName,
            text: pad.text,
            version: pad.version,
            timestamp: now,
            label: `Antes de restaurar backup`
          };
          pad.history.push(backupVersion);
          if (pad.history.length > 30) {
            pad.history.shift();
          }

          // Restore text
          pad.text = targetVersion.text;
          pad.version += 1;
          pad.updatedAt = now;

          savePad(pad);

          // Broadcast sync and updated history to all clients
          const syncMsg: ServerMessage = {
            type: 'sync',
            text: pad.text,
            version: pad.version,
            updatedAt: pad.updatedAt,
            hasPassword: !!pad.passwordHash,
            headerText: pad.headerText,
            footerText: pad.footerText,
            headerAlign: pad.headerAlign,
            headerFont: pad.headerFont,
            headerFontSize: pad.headerFontSize,
            headerColor: pad.headerColor,
            headerBold: pad.headerBold,
            headerItalic: pad.headerItalic,
            headerUnderline: pad.headerUnderline,
            footerAlign: pad.footerAlign,
            footerFont: pad.footerFont,
            footerFontSize: pad.footerFontSize,
            footerColor: pad.footerColor,
            footerBold: pad.footerBold,
            footerItalic: pad.footerItalic,
            footerUnderline: pad.footerUnderline,
          };
          const historyMsg: ServerMessage = {
            type: 'history',
            versions: pad.history
          };

          const clients = rooms.get(normalizedPadName);
          clients?.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
              client.send(JSON.stringify(syncMsg));
              client.send(JSON.stringify(historyMsg));
            }
          });
          return;
        }

        // 7. Clear History
        if (type === 'clear_history') {
          pad.history = [];
          savePad(pad);

          const historyMsg: ServerMessage = {
            type: 'history',
            versions: []
          };
          const payload = JSON.stringify(historyMsg);

          rooms.get(normalizedPadName)?.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
              client.send(payload);
            }
          });
          return;
        }

        // 8. Restore History
        if (type === 'restore_history') {
          pad.history = data.versions || [];
          savePad(pad);

          const historyMsg: ServerMessage = {
            type: 'history',
            versions: pad.history
          };
          const payload = JSON.stringify(historyMsg);

          rooms.get(normalizedPadName)?.forEach((client) => {
            if (client.readyState === WebSocket.OPEN && client.isAuthenticated) {
              client.send(payload);
            }
          });
          return;
        }

        // 9. Code Editor Real-time Sync
        if (type === 'code_edit') {
          const { codeFiles, senderId } = data;
          ws.senderId = senderId;

          if (!Array.isArray(codeFiles) || codeFiles.length > 30) {
            ws.send(JSON.stringify({ type: 'error', message: 'Número de arquivos excede o limite.' }));
            return;
          }

          pad.codeFiles = codeFiles;
          pad.updatedAt = Date.now();
          savePad(pad);

          const codeSyncMsg: ServerMessage = {
            type: 'code_sync',
            codeFiles: pad.codeFiles
          };
          const payload = JSON.stringify(codeSyncMsg);

          const clients = rooms.get(normalizedPadName);
          clients?.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN && client.isAuthenticated) {
              client.send(payload);
            }
          });
          return;
        }

        // 10. Peer ID Sync
        if (type === 'peer_id_sync') {
          const { senderId, peerId } = data;
          ws.senderId = senderId;
          ws.peerId = peerId;
          broadcastPresence(normalizedPadName);
          return;
        }

        // 11. Cursor Move Sync
        if (type === 'cursor_move') {
          if (data.type === 'cursor_move') {
            const { senderId, nickname, color, fileName, position, selection, textCursor } = data;
            ws.senderId = senderId;

            const cursorSyncMsg: ServerMessage = {
              type: 'cursor_update',
              senderId,
              nickname,
              color,
              fileName,
              position,
              selection,
              textCursor
            };
            const payload = JSON.stringify(cursorSyncMsg);

            const clients = rooms.get(normalizedPadName);
            clients?.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN && client.isAuthenticated) {
                client.send(payload);
              }
            });
          }
          return;
        }

      } catch (e) {
        console.error('Erro ao processar mensagem do WebSocket:', e);
        ws.send(JSON.stringify({ type: 'error', message: 'Mensagem inválida ou malformada.' }));
      }
    });

    ws.on('close', () => {
      ws.isAlive = false;
      const padName = ws.padName;
      if (padName && rooms.has(padName)) {
        const clients = rooms.get(padName)!;
        clients.delete(ws);
        if (clients.size === 0) {
          rooms.delete(padName);
        } else {
          broadcastPresence(padName);
        }
      }
    });
  });

  // Ping interval to verify client connection health
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws: ExtWebSocket) => {
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 15000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  // Integrate Vite for development, serve index.html in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[SyncPad] Servidor ativo na porta ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Falha crítica ao iniciar o servidor:', err);
});
