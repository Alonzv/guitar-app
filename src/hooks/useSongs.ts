import { useState, useEffect } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc,
  doc, query, orderBy, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
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
    if (!user) { setSongs([]); return; }
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
    if (!user) return;
    const ref = collection(db, 'users', user.uid, 'songs');
    await addDoc(ref, { ...song, updatedAt: serverTimestamp() });
  };

  const updateSong = async (id: string, song: Partial<Omit<SavedSong, 'id'>>) => {
    if (!user) return;
    const ref = doc(db, 'users', user.uid, 'songs', id);
    await updateDoc(ref, { ...song, updatedAt: serverTimestamp() });
  };

  const deleteSong = async (id: string) => {
    if (!user) return;
    await deleteDoc(doc(db, 'users', user.uid, 'songs', id));
  };

  return { songs, loading, saveSong, updateSong, deleteSong };
}
