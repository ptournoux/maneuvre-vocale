// Classement d'un ordre oral via un modèle audio hébergé sur OpenRouter.
// Le modèle choisit la commande parmi une liste fermée ; classement.js valide et borne le résultat.

import { CATALOGUE, consigneClassement, schemaClassement, lireReponse } from './classement.js';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const MODELE_API_PAR_DEFAUT = 'google/gemini-2.5-flash-lite';

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

// Corps de requête : consigne + liste des commandes + audio WAV en base64.
// avecSchema=true impose la sortie JSON par schéma (enum des commandes possibles).
export function corpsClassement({ modele, pcm, catalogue = CATALOGUE, avecSchema = true, frequence = 16000 }) {
  const corps = {
    model: modele,
    temperature: 0,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: consigneClassement(catalogue) },
        { type: 'input_audio', input_audio: { data: base64(encoderWav(pcm, frequence)), format: 'wav' } },
      ],
    }],
  };
  if (avecSchema) {
    corps.response_format = {
      type: 'json_schema',
      json_schema: { name: 'commande_manoeuvre', strict: true, schema: schemaClassement(catalogue) },
    };
  }
  return corps;
}

async function appeler({ cle, corps, fetchFn }) {
  return fetchFn(OPENROUTER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });
}

// Appelle OpenRouter et renvoie le classement validé (voir lireReponse).
// Si le modèle refuse la sortie structurée (HTTP 400), on réessaie une fois sans schéma :
// la consigne demande déjà du JSON, et lireReponse vérifie que la commande est dans la liste.
// La clé n'est jamais journalisée.
export async function classerOpenRouter({ cle, modele, pcm, catalogue = CATALOGUE, fetchFn = fetch }) {
  let schema = true;
  let reponse = await appeler({ cle, corps: corpsClassement({ modele, pcm, catalogue, avecSchema: true }), fetchFn });
  if (reponse.status === 400) {
    schema = false;
    reponse = await appeler({ cle, corps: corpsClassement({ modele, pcm, catalogue, avecSchema: false }), fetchFn });
  }
  if (!reponse.ok) {
    const detail = (await reponse.text().catch(() => '')).slice(0, 200);
    throw new Error(`OpenRouter ${reponse.status} ${detail}`.trim());
  }
  const json = await reponse.json();
  const classement = lireReponse(json?.choices?.[0]?.message?.content, catalogue);
  return { ...classement, schema };
}
