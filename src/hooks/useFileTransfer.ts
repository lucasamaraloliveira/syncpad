import { useState, useEffect, useRef, useCallback } from 'react';
import { Peer, DataConnection } from 'peerjs';

export interface FileTransfer {
  id: string;
  type: 'send' | 'receive';
  fileName: string;
  fileSize: number;
  mimeType: string;
  timestamp: number;
  progress: number;
  status: 'pending' | 'connecting' | 'transferring' | 'completed' | 'failed' | 'expired';
  peerId: string;
  blobUrl?: string;
}

const CHUNK_SIZE = 16384; // 16KB chunks

export function useFileTransfer(
  padName: string,
  mySenderId: string,
  activeUserIds: string[],
  peerIdsMap: { [senderId: string]: string } = {},
  onPeerIdGenerated?: (peerId: string) => void
) {
  const [peerInstance, setPeerInstance] = useState<Peer | null>(null);
  const [peerId, setPeerId] = useState<string>('');
  const [peerError, setPeerError] = useState<string | null>(null);
  const [transfers, setTransfers] = useState<FileTransfer[]>([]);
  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);

  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const activeTransfersRef = useRef<Map<string, {
    file?: File;
    chunks?: ArrayBuffer[];
    receivedSize: number;
    totalChunks?: number;
    currentIndex?: number;
    mimeType?: string;
  }>>(new Map());

  const padNameSanitized = padName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  // Helper to convert internal peer ID to human sender ID
  const parseSenderIdFromPeerId = useCallback((fullPeerId: string): string => {
    const parts = fullPeerId.split('-');
    if (parts.length >= 3 && parts[0] === 'syncpad') {
      return parts[2];
    }
    return fullPeerId;
  }, []);

  // Handle incoming connections and setup their message listener
  const safeSend = useCallback((conn: DataConnection, data: any) => {
    if (conn && conn.open) {
      try {
        conn.send(data);
      } catch (err) {
        console.error('Error sending data over PeerJS connection:', err);
      }
    } else {
      console.warn('Attempted to send data but PeerJS connection is closed or not open:', conn?.peer);
    }
  }, []);

  // Send next chunk helper
  const sendNextChunk = useCallback((transferId: string, conn: DataConnection) => {
    const active = activeTransfersRef.current.get(transferId);
    if (!active || !active.file) return;

    const index = active.currentIndex || 0;
    const start = index * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, active.file.size);
    const slice = active.file.slice(start, end);

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result instanceof ArrayBuffer) {
        safeSend(conn, {
          type: 'chunk',
          transferId,
          index,
          chunk: event.target.result
        });
      }
    };
    reader.readAsArrayBuffer(slice);
  }, [safeSend]);

  const setupConnection = useCallback((conn: DataConnection | undefined) => {
    if (!conn) return;
    const otherPeerId = conn.peer;
    if (!otherPeerId) return;
    const otherSenderId = parseSenderIdFromPeerId(otherPeerId);

    conn.on('open', () => {
      console.log(`Connected to peer: ${otherPeerId} (${otherSenderId})`);
      connectionsRef.current.set(otherSenderId, conn);
      setConnectedPeers(prev => {
        if (!prev.includes(otherSenderId)) {
          return [...prev, otherSenderId];
        }
        return prev;
      });
    });

    conn.on('close', () => {
      console.log(`Connection closed with peer: ${otherPeerId} (${otherSenderId})`);
      connectionsRef.current.delete(otherSenderId);
      setConnectedPeers(prev => prev.filter(id => id !== otherSenderId));
    });

    conn.on('error', (err) => {
      console.error(`Error with peer connection ${otherSenderId}:`, err);
      connectionsRef.current.delete(otherSenderId);
      setConnectedPeers(prev => prev.filter(id => id !== otherSenderId));
    });

    conn.on('data', (data: any) => {
      if (typeof data !== 'object' || !data) return;

      const { type, transferId } = data;

      if (type === 'meta') {
        const { name, size, mime, timestamp } = data;
        
        // Setup new receiving transfer
        activeTransfersRef.current.set(transferId, {
          chunks: [],
          receivedSize: 0,
          totalChunks: Math.ceil(size / CHUNK_SIZE),
          currentIndex: 0,
          mimeType: mime || 'application/octet-stream',
        });

        setTransfers(prev => [
          {
            id: transferId,
            type: 'receive',
            fileName: name,
            fileSize: size,
            mimeType: mime || 'application/octet-stream',
            timestamp: timestamp || Date.now(),
            progress: 0,
            status: 'transferring',
            peerId: otherSenderId,
          },
          ...prev,
        ]);

        // Respond that we are ready to receive chunks
        safeSend(conn, { type: 'ready', transferId });
      } 
      else if (type === 'ready') {
        // Sender: Start sending chunks
        const active = activeTransfersRef.current.get(transferId);
        if (active && active.file) {
          sendNextChunk(transferId, conn);
        }
      } 
      else if (type === 'chunk') {
        const { index, chunk } = data;
        const active = activeTransfersRef.current.get(transferId);
        if (!active || !active.chunks) return;

        // Save chunk
        active.chunks[index] = chunk;
        active.receivedSize += chunk.byteLength;
        
        // Update transfers progress
        setTransfers(prev => prev.map(t => {
          if (t.id === transferId) {
            const progress = active.receivedSize && t.fileSize
              ? Math.min(Math.round((active.receivedSize / t.fileSize) * 100), 100)
              : 0;
            return {
              ...t,
              progress,
              status: progress === 100 ? 'completed' : 'transferring',
            };
          }
          return t;
        }));

        // Send Ack
        safeSend(conn, { type: 'ack', transferId, index });

        // If completed, reconstruct the file and build a local URL
        if (active.receivedSize >= (active.totalChunks ? active.totalChunks : 0) * CHUNK_SIZE || index + 1 === active.totalChunks) {
          // Reconstruct Blob
          const mimeType = active.mimeType || 'application/octet-stream';
          const blob = new Blob(active.chunks, { type: mimeType });
          const blobUrl = URL.createObjectURL(blob);

          setTransfers(prev => prev.map(t => {
            if (t.id === transferId) {
              return {
                ...t,
                progress: 100,
                status: 'completed',
                blobUrl,
              };
            }
            return t;
          }));

          // Clean memory map, but keep transfers history
          activeTransfersRef.current.delete(transferId);
        }
      } 
      else if (type === 'ack') {
        const { index } = data;
        const active = activeTransfersRef.current.get(transferId);
        if (active && active.file) {
          // Update sender progress
          setTransfers(prev => prev.map(t => {
            if (t.id === transferId) {
              const totalChunks = Math.ceil(t.fileSize / CHUNK_SIZE);
              const progress = Math.min(Math.round(((index + 1) / totalChunks) * 100), 100);
              return {
                ...t,
                progress,
                status: progress === 100 ? 'completed' : 'transferring',
              };
            }
            return t;
          }));

          if (index + 1 < Math.ceil(active.file.size / CHUNK_SIZE)) {
            // Send next chunk
            active.currentIndex = index + 1;
            sendNextChunk(transferId, conn);
          } else {
            // Done sending
            activeTransfersRef.current.delete(transferId);
          }
        }
      }
      else if (type === 'cancel') {
        setTransfers(prev => prev.map(t => {
          if (t.id === transferId) {
            return { ...t, status: 'failed', progress: 0 };
          }
          return t;
        }));
        activeTransfersRef.current.delete(transferId);
      }
    });
  }, [parseSenderIdFromPeerId, safeSend, sendNextChunk]);

  // Trigger file sending
  const sendFileToPeer = useCallback((file: File, targetSenderId: string) => {
    const conn = connectionsRef.current.get(targetSenderId);
    if (!conn) {
      console.error(`Cannot send file: No open peer connection to ${targetSenderId}`);
      return;
    }

    const transferId = `tx-${Math.random().toString(36).substring(2, 11)}`;
    const timestamp = Date.now();

    // Set sender state
    activeTransfersRef.current.set(transferId, {
      file,
      receivedSize: 0,
      currentIndex: 0,
    });

    setTransfers(prev => [
      {
        id: transferId,
        type: 'send',
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        timestamp,
        progress: 0,
        status: 'connecting',
        peerId: targetSenderId,
      },
      ...prev,
    ]);

    // Send metadata to receiver safely
    safeSend(conn, {
      type: 'meta',
      transferId,
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      timestamp,
    });
  }, [safeSend]);

  const onPeerIdGeneratedRef = useRef(onPeerIdGenerated);
  useEffect(() => {
    onPeerIdGeneratedRef.current = onPeerIdGenerated;
  }, [onPeerIdGenerated]);

  // Initialize PeerJS
  useEffect(() => {
    if (!padName || !mySenderId) return;

    // Generate random suffix to prevent "unavailable-id" conflicts on PeerJS public cloud servers
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const myPeerId = `syncpad-${padNameSanitized}-${mySenderId}-${randomSuffix}`;
    console.log('Initializing PeerJS with ID:', myPeerId);

    const isSecure = window.location.protocol === 'https:';
    const peerOptions: any = {
      host: window.location.hostname,
      path: '/peerjs',
      secure: isSecure,
      debug: 1, // Only show errors
    };

    if (window.location.port) {
      peerOptions.port = parseInt(window.location.port, 10);
    }

    const peer = new Peer(myPeerId, peerOptions);

    setPeerInstance(peer);
    setPeerId(myPeerId);

    peer.on('open', (id) => {
      console.log('PeerJS signaling connection opened. My ID:', id);
      setPeerError(null);
      if (onPeerIdGeneratedRef.current) {
        onPeerIdGeneratedRef.current(id);
      }
    });

    peer.on('connection', (conn) => {
      if (!conn) {
        console.warn('Received undefined incoming connection from PeerJS.');
        return;
      }
      console.log('Incoming PeerJS connection from:', conn.peer);
      setupConnection(conn);
    });

    peer.on('disconnected', () => {
      console.log('PeerJS disconnected from signaling server. Attempting to reconnect...');
      if (!peer.destroyed) {
        try {
          peer.reconnect();
        } catch (e) {
          console.error('Failed to reconnect on PeerJS disconnect event:', e);
        }
      }
    });

    peer.on('error', (err: any) => {
      console.error('PeerJS error:', err);
      
      const errorMsg = err.type || err.message || '';
      
      // Filter out 'peer-unavailable' error as it is a common transient event
      if (err.type === 'peer-unavailable') {
        console.log('Target peer is unavailable at the moment, will retry when they are active.');
        return;
      }

      // Filter out or handle 'disconnected' errors gracefully
      if (errorMsg.includes('disconnected') || err.type === 'disconnected') {
        console.log('PeerJS disconnected error. Reconnecting...');
        if (!peer.destroyed && peer.disconnected) {
          try {
            peer.reconnect();
          } catch (e) {
            console.error('Failed to reconnect PeerJS on error:', e);
          }
        }
        return;
      }

      setPeerError(err.type || err.message || 'Erro desconhecido de conexão');
    });

    return () => {
      console.log('Cleaning up PeerJS connection...');
      try {
        peer.destroy();
      } catch (e) {
        console.error('Error destroying peer on cleanup:', e);
      }
      setPeerInstance(null);
    };
  }, [padName, mySenderId, padNameSanitized, setupConnection]);

  // Coordinate connections based on lexicographical order
  useEffect(() => {
    if (!peerInstance || peerInstance.destroyed || peerInstance.disconnected) return;

    // Filter out ourselves from the active user list
    const otherUsers = activeUserIds.filter(uid => uid !== mySenderId);

    otherUsers.forEach(otherId => {
      const isAlreadyConnected = connectionsRef.current.has(otherId);
      const isMyTurnToConnect = mySenderId < otherId; // Lexicographical ordering rule

      if (!isAlreadyConnected && isMyTurnToConnect) {
        // Retrieve the precise, successfully registered peer ID from the broadcasted map
        const otherPeerId = peerIdsMap[otherId];
        
        if (otherPeerId && peerInstance && !peerInstance.destroyed && !peerInstance.disconnected) {
          console.log(`Initiating connect from lexicographically smaller Peer: ${mySenderId} -> ${otherId} using Peer ID: ${otherPeerId}`);
          try {
            const conn = peerInstance.connect(otherPeerId);
            if (conn) {
              setupConnection(conn);
            }
          } catch (e) {
            console.error("Failed to connect to peer:", otherPeerId, e);
          }
        }
      }
    });
  }, [peerInstance, activeUserIds, peerIdsMap, mySenderId, padNameSanitized, setupConnection]);

  // Periodic expiration checker for the 72 hours logic
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

      setTransfers(prev => {
        let changed = false;
        const updated = prev.map(t => {
          if (t.status === 'completed' && now - t.timestamp > SEVENTY_TWO_HOURS_MS) {
            changed = true;
            // Clean up Object URL to free memory if expired
            if (t.blobUrl) {
              URL.revokeObjectURL(t.blobUrl);
            }
            return { ...t, status: 'expired', blobUrl: undefined };
          }
          return t;
        });
        return changed ? updated : prev;
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, []);

  return {
    peerId,
    peerError,
    transfers,
    connectedPeers,
    sendFileToPeer,
  };
}
