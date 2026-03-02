import { useState, useEffect } from 'react';
import {
  collection, addDoc, deleteDoc,
  doc, query, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db, firebaseReady } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import type { ChordInProgression, ChordPlacement } from '../types/music';

export interface SavedSong {
  id:           string;
  title:        string;
  lyricsText:   string;
  lyricsChords: ChordPlacement[];
  progression:  ChordInProgression[];
  updatedAt:    number;
}

export function useSongs() {
  const { user } = useAuth();
  const [songs,   setSongs]   = useState<SavedSong[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !firebaseReady) { setSongs([]); return; }
    setLoading(true);
    const ref = collection(db, 'users', user.uid, 'songs');
    const q   = query(ref, orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setSongs(snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedSong)));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const saveSong = async (song: Omit<SavedSong, 'id' | 'updatedAt'>) => {
    if (!user || !firebaseReady) return;
    const ref = collection(db, 'users', user.uid, 'songs');
    await addDoc(ref, { ...song, updatedAt: serverTimestamp() });
  };

  const deleteSong = async (id: string) => {
    if (!user || !firebaseReady) return;
    await deleteDoc(doc(db, 'users', user.uid, 'songs', id));
  };

  return { songs, loading, saveSong, deleteSong };
}
