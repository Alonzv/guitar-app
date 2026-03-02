import { useState, useEffect } from 'react';
import {
  collection, addDoc, deleteDoc,
  doc, query, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { ChordInProgression } from '../types/music';

export interface SavedProgression {
  id:          string;
  name:        string;
  progression: ChordInProgression[];
  updatedAt:   number;
}

export function useProgressions() {
  const { user } = useAuth();
  const [progressions, setProgressions] = useState<SavedProgression[]>([]);
  const [loading,      setLoading]      = useState(false);

  useEffect(() => {
    if (!user) { setProgressions([]); return; }
    setLoading(true);
    const ref = collection(db, 'users', user.uid, 'progressions');
    const q   = query(ref, orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setProgressions(snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedProgression)));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const saveProgression = async (name: string, progression: ChordInProgression[]) => {
    if (!user) return;
    const ref = collection(db, 'users', user.uid, 'progressions');
    await addDoc(ref, { name, progression, updatedAt: serverTimestamp() });
  };

  const deleteProgression = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'progressions', id));
  };

  return { progressions, loading, saveProgression, deleteProgression };
}
