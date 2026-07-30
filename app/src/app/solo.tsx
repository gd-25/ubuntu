import { Redirect } from 'expo-router';
import { useState } from 'react';

/**
 * Cible du deep link `ubuntu:///solo` (tap sur le widget quand aucune
 * session n'est en cours) : renvoie vers la Maison avec un nonce — l'écran
 * lance alors une session SOLO comme si on avait tapé le bouton.
 */
export default function SoloDeepLink() {
  const [nonce] = useState(() => String(Date.now()));
  return <Redirect href={{ pathname: '/', params: { autosolo: nonce } }} />;
}
