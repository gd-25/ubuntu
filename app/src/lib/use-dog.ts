import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import type { Dog, Person } from '@/lib/types';

/**
 * Loads the current user's dog: the first dog VISIBLE by RLS — owned OR
 * shared via `dog_members` (Fiona's account is a member of Ubuntu, not
 * its owner). Also resolves which family avatar this account is
 * (`dog_members.person`, defaults to 'greg' for the owner).
 */
export function useDog() {
  const { user } = useAuth();
  const [dog, setDog] = useState<Dog | null>(null);
  const [person, setPerson] = useState<Exclude<Person, 'ubuntu'>>('greg');
  const [isLoading, setIsLoading] = useState(true);

  const fetchDog = useCallback(async (): Promise<Dog | null> => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('dogs')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) {
      console.warn('Chargement du profil du chien impossible :', error.message);
      return null;
    }
    return (data?.[0] as Dog | undefined) ?? null;
  }, [user]);

  const fetchPerson = useCallback(
    async (dogId: string): Promise<Exclude<Person, 'ubuntu'>> => {
      if (!user) return 'greg';
      const { data } = await supabase
        .from('dog_members')
        .select('person')
        .eq('dog_id', dogId)
        .eq('user_id', user.id)
        .maybeSingle();
      const value = (data as { person: string } | null)?.person;
      return value === 'fiona' ? 'fiona' : 'greg';
    },
    [user]
  );

  useEffect(() => {
    let ignore = false;
    (async () => {
      const next = await fetchDog();
      const who = next ? await fetchPerson(next.id) : 'greg';
      if (ignore) return;
      setDog(next);
      setPerson(who);
      setIsLoading(false);
    })();
    return () => {
      ignore = true;
    };
  }, [fetchDog, fetchPerson]);

  const reload = useCallback(async () => {
    const next = await fetchDog();
    setDog(next);
    setPerson(next ? await fetchPerson(next.id) : 'greg');
    setIsLoading(false);
  }, [fetchDog, fetchPerson]);

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

  return { dog, person, isLoading, reload, saveName };
}
