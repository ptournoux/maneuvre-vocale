// Transcription via un modèle audio hébergé sur OpenRouter.
// Le modèle ne fait que transcrire ; l'interprétation reste faite par commands.js.

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const MODELE_API_PAR_DEFAUT = 'openai/gpt-audio-mini';

// Consigne courte : transcription fidèle, pas de commentaire, vocabulaire de manœuvre.
export const CONSIGNE = [
  'Transcris exactement, en français, ce que dit la personne sur cet enregistrement.',
  'Réponds uniquement par la transcription, sans guillemets ni commentaire.',
  'Vocabulaire fréquent : barre, bâbord, tribord, moteur, avant, arrière, stop, homme à la mer, degrés, pour cent.',
].join(' ');

// PCM mono Float32 -> fichier WAV 16 bits (en-tête RIFF de 44 octets).
export function encoderWav(pcm, frequence = 16000) {
  const octets = pcm.length * 2;
  const tampon = new ArrayBuffer(44 + octets);
  const vue = new DataView(tampon);
  const ecrire = (offset, texte) => {
    for (let i = 0; i < texte.length; i++) vue.setUint8(offset + i, texte.charCodeAt(i));
  };
  ecrire(0, 'RIFF');
  vue.setUint32(4, 36 + octets, true);
  ecrire(8, 'WAVE');
  ecrire(12, 'fmt ');
  vue.setUint32(16, 16, true);            // taille du bloc fmt
  vue.setUint16(20, 1, true);             // PCM
  vue.setUint16(22, 1, true);             // mono
  vue.setUint32(24, frequence, true);
  vue.setUint32(28, frequence * 2, true); // octets par seconde
  vue.setUint16(32, 2, true);             // octets par échantillon
  vue.setUint16(34, 16, true);            // bits
  ecrire(36, 'data');
  vue.setUint32(40, octets, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    vue.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(tampon);
}

export function base64(octets) {
  let binaire = '';
  const taille = 0x8000;
  for (let i = 0; i < octets.length; i += taille) {
    binaire += String.fromCharCode(...octets.subarray(i, i + taille));
  }
  return btoa(binaire);
}

// Corps de requête au format chat/completions avec une entrée audio WAV en base64.
export function corpsRequete({ modele, pcm, frequence = 16000 }) {
  const wav = base64(encoderWav(pcm, frequence));
  return {
    model: modele,
    temperature: 0,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: CONSIGNE },
        { type: 'input_audio', input_audio: { data: wav, format: 'wav' } },
      ],
    }],
  };
}

// Appelle OpenRouter et renvoie le texte transcrit. La clé n'est jamais journalisée.
export async function transcrireOpenRouter({ cle, modele, pcm, fetchFn = fetch }) {
  const reponse = await fetchFn(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cle}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(corpsRequete({ modele, pcm })),
  });
  if (!reponse.ok) {
    const detail = (await reponse.text().catch(() => '')).slice(0, 200);
    throw new Error(`OpenRouter ${reponse.status} ${detail}`.trim());
  }
  const json = await reponse.json();
  const texte = json?.choices?.[0]?.message?.content;
  if (typeof texte !== 'string') throw new Error('réponse OpenRouter inattendue');
  return texte.trim();
}
