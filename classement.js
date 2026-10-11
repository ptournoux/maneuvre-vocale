// Classement d'un ordre oral parmi une liste fermée de commandes possibles.
// Le modèle (API) ou la similarité de texte (local) propose ; ce module valide et borne.

import { normaliser, extraireNombre } from './commands.js';

// Catalogue des commandes. Chaque exemple porte ses paramètres implicites,
// ce qui sert aussi au rattrapage par similarité (le côté vient de l'exemple le plus proche).
export const CATALOGUE = [
  {
    id: 'barre',
    description: 'Mettre la barre à bâbord ou à tribord, avec un angle en degrés (gauche = bâbord, droite = tribord)',
    exemples: [
      { phrase: 'barre à tribord', cote: 'tribord' },
      { phrase: 'barre à tribord vingt', cote: 'tribord' },
      { phrase: 'barre à droite', cote: 'tribord' },
      { phrase: 'barre à bâbord', cote: 'babord' },
      { phrase: 'barre à bâbord dix', cote: 'babord' },
      { phrase: 'barre à gauche', cote: 'babord' },
    ],
  },
  {
    id: 'barre_milieu',
    description: 'Remettre la barre dans l’axe',
    exemples: [{ phrase: 'barre au milieu' }, { phrase: 'barre dans l’axe' }, { phrase: 'barre droite devant' }],
  },
  {
    id: 'moteur_avant',
    description: 'Moteur en marche avant, avec un niveau de gaz en pour cent (ralenti = 10, plein gaz = 100)',
    exemples: [{ phrase: 'moteur en avant' }, { phrase: 'marche avant' }, { phrase: 'en avant doucement' }, { phrase: 'plein gaz' }],
  },
  {
    id: 'moteur_arriere',
    description: 'Moteur en marche arrière, avec un niveau de gaz en pour cent',
    exemples: [{ phrase: 'marche arrière' }, { phrase: 'moteur en arrière' }, { phrase: 'en arrière doucement' }],
  },
  {
    id: 'moteur_stop',
    description: 'Couper ou débrayer le moteur',
    exemples: [{ phrase: 'stop moteur' }, { phrase: 'arrête le moteur' }, { phrase: 'point mort' }],
  },
  {
    id: 'homme_a_la_mer',
    description: 'Alerte homme à la mer',
    exemples: [{ phrase: 'homme à la mer' }, { phrase: 'un homme à l’eau' }],
  },
];

export const AUCUNE = 'aucune';
export const SEUIL_CONFIANCE = 0.5;

const borne = (v, min, max) => Math.max(min, Math.min(max, v));

export function idsPossibles(catalogue = CATALOGUE) {
  return [...catalogue.map((c) => c.id), AUCUNE];
}

export function consigneClassement(catalogue = CATALOGUE) {
  const lignes = catalogue.map((c) =>
    `- ${c.id} : ${c.description}. Exemples : ${c.exemples.map((e) => `« ${e.phrase} »`).join(', ')}`);
  return [
    'Tu entends un ordre de manœuvre donné à bord d’un bateau, en français.',
    'Choisis la commande prononcée parmi la liste ci-dessous, même si la formulation diffère des exemples.',
    `Si rien ne correspond ou si l’audio est incompréhensible, réponds « ${AUCUNE} ».`,
    'Commandes possibles :',
    ...lignes,
    'Réponds uniquement par un objet JSON, sans texte autour :',
    '{"commande": "<id>", "cote": "babord" | "tribord" | null, "degres": nombre | null, "niveau": nombre | null, "transcription": "<ce que tu as entendu>", "confiance": nombre entre 0 et 1}',
  ].join('\n');
}

export function schemaClassement(catalogue = CATALOGUE) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['commande', 'cote', 'degres', 'niveau', 'transcription', 'confiance'],
    properties: {
      commande: { type: 'string', enum: idsPossibles(catalogue) },
      cote: { type: ['string', 'null'], enum: ['babord', 'tribord', null] },
      degres: { type: ['number', 'null'] },
      niveau: { type: ['number', 'null'] },
      transcription: { type: 'string' },
      confiance: { type: 'number' },
    },
  };
}

// Lit la réponse du modèle (JSON, éventuellement entouré de ```json ... ```).
export function lireReponse(contenu, catalogue = CATALOGUE) {
  if (typeof contenu !== 'string') throw new Error('réponse vide');
  const debut = contenu.indexOf('{');
  const fin = contenu.lastIndexOf('}');
  if (debut < 0 || fin <= debut) throw new Error(`réponse non JSON : ${contenu.slice(0, 80)}`);
  const json = JSON.parse(contenu.slice(debut, fin + 1));
  if (!idsPossibles(catalogue).includes(json.commande)) {
    throw new Error(`commande hors liste : ${json.commande}`);
  }
  return {
    commande: json.commande,
    cote: json.cote === 'babord' || json.cote === 'tribord' ? json.cote : null,
    degres: Number.isFinite(json.degres) ? json.degres : null,
    niveau: Number.isFinite(json.niveau) ? json.niveau : null,
    transcription: typeof json.transcription === 'string' ? json.transcription : '',
    confiance: Number.isFinite(json.confiance) ? borne(json.confiance, 0, 1) : 0,
  };
}

// Traduit un classement validé en commande applicable (même format que commands.js).
// Renvoie null si « aucune », si la confiance est trop basse, ou si un paramètre obligatoire manque.
export function versCommande(r) {
  if (r.commande === AUCUNE || r.confiance < SEUIL_CONFIANCE) return null;
  switch (r.commande) {
    case 'barre':
      if (!r.cote) return null;
      return { type: 'barre', cote: r.cote, degres: borne(r.degres ?? 20, 0, 35) };
    case 'barre_milieu':
      return { type: 'barre', cote: 'milieu', degres: 0 };
    case 'moteur_avant':
      return { type: 'moteur', action: 'avant', niveau: borne(r.niveau ?? 50, 0, 100) };
    case 'moteur_arriere':
      return { type: 'moteur', action: 'arriere', niveau: borne(r.niveau ?? 50, 0, 100) };
    case 'moteur_stop':
      return { type: 'moteur', action: 'stop', niveau: 0 };
    case 'homme_a_la_mer':
      return { type: 'mob' };
    default:
      return null;
  }
}

// --- Rattrapage local par similarité (pour Whisper hors ligne) ---------------

function levenshtein(a, b) {
  const ligne = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let precedent = ligne[0];
    ligne[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = ligne[j];
      ligne[j] = Math.min(ligne[j] + 1, ligne[j - 1] + 1, precedent + (a[i - 1] === b[j - 1] ? 0 : 1));
      precedent = tmp;
    }
  }
  return ligne[b.length];
}

// Nombres retirés et espaces supprimés : « tri bord » et « tribord » se comparent bien.
const squelette = (texte) => normaliser(texte).replace(/\b\d+\b/g, '').replace(/\s+/g, '');

export function similarite(a, b) {
  const x = squelette(a);
  const y = squelette(b);
  if (!x || !y) return 0;
  return 1 - levenshtein(x, y) / Math.max(x.length, y.length);
}

export const SEUIL_SIMILARITE = 0.6;

// Rattache une transcription approximative à la phrase d'exemple la plus proche.
// Renvoie { commande, id, phrase, score } ou null si rien n'est assez proche.
export function rattraper(texte, catalogue = CATALOGUE) {
  let meilleur = null;
  for (const c of catalogue) {
    for (const e of c.exemples) {
      const score = similarite(texte, e.phrase);
      if (!meilleur || score > meilleur.score) meilleur = { c, e, score };
    }
  }
  if (!meilleur || meilleur.score < SEUIL_SIMILARITE) return null;
  const n = normaliser(texte);
  const nombre = extraireNombre(n);
  let niveau = nombre;
  if (/ralenti|doucement/.test(n)) niveau = 10;
  if (/plein gaz|a fond/.test(n)) niveau = 100;
  const commande = versCommande({
    commande: meilleur.c.id,
    cote: meilleur.e.cote ?? null,
    degres: nombre,
    niveau,
    transcription: texte,
    confiance: 1,
  });
  if (!commande) return null;
  return { commande, id: meilleur.c.id, phrase: meilleur.e.phrase, score: meilleur.score };
}
