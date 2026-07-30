import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore, doc, setDoc, onSnapshot, getDoc } from "firebase/firestore";

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

// Safe Analytics initialization
export const analyticsPromise = isSupported().then((supported) => supported ? getAnalytics(app) : null);

export interface PadCloudData {
  text: string;
  updatedAt: number;
  codeFiles?: any[];
  headerText?: string;
  footerText?: string;
}

/**
 * Inscreve-se para alterações em tempo real de um bloco/pad no Firestore.
 * Se o documento não existir no banco, ele cria automaticamente um registro inicial.
 */
export function subscribeToPad(
  padName: string,
  onData: (data: PadCloudData) => void
) {
  const safePadId = padName.trim().toLowerCase() || 'default-pad';
  const padDocRef = doc(db, "pads", safePadId);

  return onSnapshot(padDocRef, (docSnap) => {
    if (docSnap.exists()) {
      onData(docSnap.data() as PadCloudData);
    } else {
      // Documento ainda não existe, cria estado inicial
      const initialData: PadCloudData = {
        text: '',
        updatedAt: Date.now()
      };
      setDoc(padDocRef, initialData, { merge: true }).catch(err => {
        console.error("Erro ao inicializar pad no Firestore:", err);
      });
      onData(initialData);
    }
  }, (error) => {
    console.error("Erro ao sincronizar com Firestore:", error);
  });
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

export default app;
