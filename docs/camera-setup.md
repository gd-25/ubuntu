# Setup caméra Tapo (M1)

Objectif : obtenir un flux RTSP stable, avec audio, lisible depuis le PC Asus.

## 1. Créer le compte local de la caméra

Dans l'app **Tapo** (téléphone) :

1. Ouvrir la caméra → **Réglages (engrenage)** → **Réglages avancés** → **Compte de la caméra**.
2. Créer un compte local : **username + password**.

> ⚠️ Ce compte est **distinct** du compte cloud TP-Link. C'est **lui** qui sert
> pour RTSP. Ne pas mettre ces identifiants dans un repo git.

## 2. Fixer l'IP de la caméra

Dans l'interface d'admin de la box Internet : faire une **réservation DHCP**
pour l'adresse MAC de la caméra (sinon l'IP peut changer au prochain reboot et
casser l'agent).

Noter l'IP réservée, par exemple `192.168.1.50`.

## 3. URLs RTSP

Port 554 :

| Flux | URL | Usage |
|---|---|---|
| Haute qualité | `rtsp://USER:PASS@CAMERA_IP:554/stream1` | inutile ici |
| Basse qualité | `rtsp://USER:PASS@CAMERA_IP:554/stream2` | **à privilégier** (suffisant pour l'audio, moins de CPU/réseau) |

## 4. Test depuis le PC (même LAN obligatoire)

```bash
./scripts/test_rtsp.sh 'rtsp://USER:PASS@192.168.1.50:554/stream2'
```

ou à la main :

```bash
ffplay rtsp://USER:PASS@CAMERA_IP:554/stream2      # vérifier image + son
ffprobe rtsp://USER:PASS@CAMERA_IP:554/stream2     # vérifier la présence d'une piste audio
```

**M1 validé** quand l'image s'affiche et que le son est audible sur le PC.

## 5. Contraintes Tapo connues

- ONVIF Profile S seulement (pas nécessaire pour ce projet).
- Seuls **2 des 3 usages** {Tapo Care, enregistrement carte SD, flux RTSP/NVR}
  peuvent tourner simultanément. Si le flux RTSP ne monte pas, désactiver
  temporairement Tapo Care ou l'enregistrement SD.
- **Son faible** : monter le volume du micro dans l'app Tapo
  (Réglages → Son/Microphone).

## 6. Dépannage

| Symptôme | Piste |
|---|---|
| `401 Unauthorized` | Mauvais compte : utiliser le compte **local** (étape 1), pas le compte cloud TP-Link. |
| Timeout / pas de connexion | PC et caméra sur le même LAN ? IP correcte ? Port 554 ? |
| Image OK mais pas de son | Micro désactivé dans l'app Tapo, ou volume à zéro. |
| Flux qui coupe | Wi-Fi faible côté caméra ; l'agent gère la reconnexion automatique, mais rapprocher la caméra du routeur aide. |
