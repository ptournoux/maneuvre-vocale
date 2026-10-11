# Prototype vocal – manœuvres (Whisper WebAssembly)

Page statique : la reconnaissance vocale tourne dans le navigateur (transformers.js + ONNX Runtime WASM + Whisper).
La bibliothèque est chargée depuis jsDelivr au moment où tu demandes le modèle (version figée dans `app.js`).
Aucune installation côté utilisateur, aucun serveur de transcription.

## Lancer en local

```bash
npm run serve                  # http://127.0.0.1:8000 (aucune dépendance à installer pour la page)
```

Ouvrir http://127.0.0.1:8000/ puis :
1. **Charger le modèle Whisper** (téléchargement d'environ 150 Mo au premier passage, puis cache du navigateur).
2. **Maintenir** le bouton (ou la barre espace) pour parler, relâcher pour envoyer.
3. Ou taper la phrase dans le champ texte, ou cliquer sur un exemple (utile sans micro).

Modèle alternatif : `http://127.0.0.1:8000/?modele=onnx-community/whisper-base` (plus précis, plus lent).
Pour un modèle hébergé localement : placer les fichiers dans `models/<identifiant>/`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Interface : push-to-talk, saisie texte, état du bateau, journal |
| `app.js` | Chargement du modèle Whisper, capture micro, rééchantillonnage 16 kHz, transcription |
| `transcription.js` | Mode API : envoi de l'audio WAV à OpenRouter (modèle audio), réponse = texte |
| `commands.js` | Parseur déterministe des phrases en commandes (sans IA) et application à l'état |
| `test/commands.test.mjs` | Tests du parseur (`npm test`) |

## Mode API (OpenRouter)

Dans la liste, choisis « API OpenRouter » (modèle par défaut : `google/gemini-2.5-flash-lite`, modifiable). Saisis ta clé (`sk-or-...`), crée-la avec un plafond de dépense. Elle reste dans le navigateur : session seulement par défaut, ou mémorisée si tu coches la case. L'audio est envoyé à OpenRouter ; le parseur de commandes reste local.

## Limites connues

- Le parseur ne couvre qu'un petit vocabulaire : barre, moteur, stop, homme à la mer.
- L'état du bateau est seulement affiché. La physique (mode A) n'est pas branchée.
- Le téléchargement du modèle depuis Hugging Face doit être accessible depuis le navigateur.
- Qualité de reconnaissance en conditions réelles (vent, moteur, cockpit) : à mesurer.
