import * as WebBrowser from 'expo-web-browser';

import { supabase } from '@/lib/supabase';

/** Ouvre le clip vidéo d'un épisode (URL signée 1 h, lecteur du navigateur in-app). */
export async function openEpisodeClip(clipPath: string): Promise<void> {
  const { data, error } = await supabase.storage.from('clips').createSignedUrl(clipPath, 3600);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Clip indisponible.');
  }
  await WebBrowser.openBrowserAsync(data.signedUrl);
}
