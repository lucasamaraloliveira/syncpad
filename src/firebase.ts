import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  deleteDoc,
  enableIndexedDbPersistence
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore
export const db = getFirestore(app);

// Enable offline persistence so data remains intact even if network flickers
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Multiple tabs open, offline persistence enabled in first tab only.');
    } else if (err.code === 'unimplemented') {
      console.warn('Browser does not support offline persistence.');
    }
  });
}

// Safe Analytics initialization
export const analyticsPromise = isSupported().then((supported) => supported ? getAnalytics(app) : null);

export interface PadCloudData {
  text: string;
  updatedAt: number;
  codeFiles?: any[];
  headerText?: string;
  footerText?: string;
}

export interface UserPresenceData {
  senderId: string;
  nickname: string;
  color: string;
  activeFileName?: string;
  lastSeen: number;
}

/**
 * Inscreve-se para alterações em tempo real de um bloco/pad no Firestore com auto-reconexão resiliente.
 */
export function subscribeToPad(
  padName: string,
  onData: (data: PadCloudData) => void,
  onStatusChange?: (status: 'connected' | 'connecting' | 'disconnected') => void
) {
  const safePadId = padName.trim().toLowerCase() || 'default-pad';
  const padDocRef = doc(db, "pads", safePadId);

  let unsubscribe: (() => void) | null = null;
  let retryTimeout: any = null;

  const connect = () => {
    if (onStatusChange) onStatusChange('connecting');

    unsubscribe = onSnapshot(
      padDocRef,
      { includeMetadataChanges: true },
      (docSnap) => {
        // Connected successfully to Firestore cloud or local cache
        if (onStatusChange) onStatusChange('connected');

        if (docSnap.exists()) {
          onData(docSnap.data() as PadCloudData);
        } else {
          const initialData: PadCloudData = {
            text: '',
            updatedAt: Date.now()
          };
          setDoc(padDocRef, initialData, { merge: true }).catch(() => {});
          onData(initialData);
        }
      },
      (error) => {
        console.warn("Firestore snapshot connection issue:", error.message);
        if (onStatusChange) onStatusChange('disconnected');

        // Automatically attempt reconnection after 3s
        if (retryTimeout) clearTimeout(retryTimeout);
        retryTimeout = setTimeout(() => {
          if (unsubscribe) unsubscribe();
          connect();
        }, 3000);
      }
    );
  };

  connect();

  return () => {
    if (retryTimeout) clearTimeout(retryTimeout);
    if (unsubscribe) unsubscribe();
  };
}

/**
 * Salva as alterações de um bloco/pad no Firestore sem exigir login.
 */
export async function savePadToCloud(padName: string, data: Partial<PadCloudData>) {
  try {
    const safePadId = padName.trim().toLowerCase() || 'default-pad';
    const padDocRef = doc(db, "pads", safePadId);
    await setDoc(padDocRef, {
      ...data,
      updatedAt: Date.now()
    }, { merge: true });
  } catch (error) {
    console.error("Erro ao salvar no Firestore:", error);
  }
}

/**
 * Gerencia a presença do usuário atual e escuta outros usuários online no pad via Firestore
 */
export function trackPresence(
  padName: string,
  user: { senderId: string; nickname: string; color: string; activeFileName?: string },
  onPresenceChange: (users: { [senderId: string]: UserPresenceData }) => void
) {
  const safePadId = padName.trim().toLowerCase() || 'default-pad';
  const presenceColRef = collection(db, "pads", safePadId, "presence");
  const myPresenceRef = doc(db, "pads", safePadId, "presence", user.senderId);

  // Heartbeat periodic update
  const updateMyPresence = () => {
    setDoc(myPresenceRef, {
      senderId: user.senderId,
      nickname: user.nickname,
      color: user.color,
      activeFileName: user.activeFileName || 'Texto/Notas',
      lastSeen: Date.now()
    }, { merge: true }).catch(() => {});
  };

  updateMyPresence();
  const interval = setInterval(updateMyPresence, 10000); // 10s heartbeat

  // Subscribe to all presence docs
  const unsubscribe = onSnapshot(presenceColRef, (snapshot) => {
    const activeMap: { [senderId: string]: UserPresenceData } = {};
    const now = Date.now();

    snapshot.docs.forEach((d) => {
      const p = d.data() as UserPresenceData;
      // Filter out users inactive for more than 30s
      if (p && p.lastSeen && (now - p.lastSeen < 30000)) {
        activeMap[p.senderId] = p;
      }
    });

    onPresenceChange(activeMap);
  });

  return () => {
    clearInterval(interval);
    unsubscribe();
    deleteDoc(myPresenceRef).catch(() => {});
  };
}

export default app;

