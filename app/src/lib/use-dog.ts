import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Dog } from '@/lib/types';

/**
 * Loads the current user's dog (first one — single-dog UX for now,
 * but the data model supports several).
 */
export function useDog() {
  const { user } = useAuth();
  const [dog, setDog] = useState<Dog | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDog = useCallback(async (): Promise<Dog | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('dogs')
      .select('*')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) {
      console.warn('Chargement du profil du chien impossible :', error.message);
      return null;
    }
    return (data?.[0] as Dog | undefined) ?? null;
  }, [user]);

  useEffect(() => {
    let ignore = false;
    fetchDog().then((next) => {
      if (ignore) return;
      setDog(next);
      setIsLoading(false);
    });
    return () => {
      ignore = true;
    };
  }, [fetchDog]);

  const reload = useCallback(async () => {
    setDog(await fetchDog());
    setIsLoading(false);
  }, [fetchDog]);

  const saveName = useCallback(
    async (name: string): Promise<Dog | null> => {
      if (!user) return null;
      const trimmed = name.trim();
      if (!trimmed) return dog;

      if (dog) {
        const { data, error } = await supabase
          .from('dogs')
          .update({ name: trimmed })
          .eq('id', dog.id)
          .select()
          .single();
        if (error) throw error;
        setDog(data as Dog);
        return data as Dog;
      }

      const { data, error } = await supabase
        .from('dogs')
        .insert({ owner_id: user.id, name: trimmed })
        .select()
        .single();
      if (error) throw error;
      setDog(data as Dog);
      return data as Dog;
    },
    [user, dog]
  );

  return { dog, isLoading, reload, saveName };
}
