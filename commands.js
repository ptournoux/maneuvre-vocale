// Parseur de commandes orales en français, sans dépendance.
// Pur JavaScript : utilisable dans le navigateur et dans les tests Node.
//
// Convention de barre : "barre à tribord" = la barre est poussée vers tribord,
// donc le bateau lofe vers bâbord (convention de manœuvre). Ici on traduit
// simplement la phrase en "côté de la barre" ; l'effet sur le cap viendra du moteur.

const UNITS = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6,
  sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13,
  quatorze: 14, quinze: 15, seize: 16,
};
const TENS = { vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };

export function normaliser(texte) {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // accents
    .toLowerCase()
    .replace(/['’\-]/g, ' ')            // l'arrière, marche-arrière
    .replace(/[^a-z0-9% ]/g, ' ')       // ponctuation
    .replace(/\s+/g, ' ')
    .trim();
}

// Extrait un nombre (chiffres ou mots simples, 0 à 99) d'une phrase normalisée.
export function extraireNombre(n) {
  const chiffres = n.match(/\b(\d{1,3})\b/);
  if (chiffres) return Number(chiffres[1]);
  const mots = n.split(' ');
  let total = null;
  for (let i = 0; i < mots.length; i++) {
    const m = mots[i];
    if (TENS[m] !== undefined) {
      total = TENS[m];
      if (mots[i + 1] === 'et' && mots[i + 2] === 'un') { total += 1; break; }
      if (UNITS[mots[i + 1]] !== undefined && UNITS[mots[i + 1]] < 10) total += UNITS[mots[i + 1]];
      break;
    }
    if (UNITS[m] !== undefined) { total = UNITS[m]; break; }
  }
  return total;
}

const contient = (n, motifs) => motifs.some((m) => n.includes(m));

// Règles dans l'ordre de priorité : la première qui correspond gagne.
const REGLES = [
  {
    nom: 'homme_a_la_mer',
    test: (n) => /\bhomme (a|a l) (la )?(mer|eau)\b/.test(n) || /\bmob\b/.test(n),
    commande: () => ({ type: 'mob' }),
  },
  {
    nom: 'barre_milieu',
    test: (n) => /\bbarre\b/.test(n) && contient(n, ['milieu', 'dans l axe', 'centre', 'droit devant']),
    commande: () => ({ type: 'barre', cote: 'milieu', degres: 0 }),
  },
  {
    nom: 'barre_cote',
    test: (n) => /\bbarre\b/.test(n) && contient(n, ['babord', 'tribord', 'gauche', 'droite']),
    commande: (n) => {
      const cote = contient(n, ['babord', 'gauche']) ? 'babord' : 'tribord';
      const degres = extraireNombre(n) ?? 20; // 20° par défaut si non précisé
      return { type: 'barre', cote, degres: Math.min(degres, 35) };
    },
  },
  {
    nom: 'arret',
    test: (n) => /\b(stop|arret|arrete|stoppe|coupe)\b/.test(n),
    commande: () => ({ type: 'moteur', action: 'stop', niveau: 0 }),
  },
  {
    nom: 'marche_arriere',
    test: (n) => contient(n, ['marche arriere', 'arriere', 'recule', 'reculer']),
    commande: (n) => ({ type: 'moteur', action: 'arriere', niveau: niveauGaz(n) }),
  },
  {
    nom: 'marche_avant',
    test: (n) => contient(n, ['avant', 'avance', 'moteur', 'gaz', 'regime', 'ralenti', 'plein gaz']),
    commande: (n) => ({ type: 'moteur', action: 'avant', niveau: niveauGaz(n) }),
  },
];

function niveauGaz(n) {
  if (contient(n, ['ralenti', 'doucement', 'tres lent'])) return 10;
  if (contient(n, ['plein gaz', 'pleine puissance', 'a fond'])) return 100;
  const nombre = extraireNombre(n); // « à 40 », « 30 pour cent », « régime 2000 » (borné à 100)
  if (nombre !== null) return Math.min(nombre, 100);
  return 50; // niveau moyen par défaut
}

// Renvoie { ok, commande, regle, texte } ; ok=false si rien ne correspond.
export function interpreter(phrase) {
  const n = normaliser(phrase);
  if (!n) return { ok: false, texte: phrase, raison: 'phrase vide' };
  for (const regle of REGLES) {
    if (regle.test(n)) {
      return { ok: true, texte: phrase, regle: regle.nom, commande: regle.commande(n) };
    }
  }
  return { ok: false, texte: phrase, raison: 'aucune commande reconnue' };
}

export function etatInitial() {
  return {
    barre: { cote: 'milieu', degres: 0 },
    moteur: { action: 'stop', niveau: 0 },
    homme_a_la_mer: false,
  };
}

// Applique une commande à l'état (affichage seulement, la physique viendra après).
export function appliquer(etat, commande) {
  switch (commande.type) {
    case 'barre':
      return { ...etat, barre: { cote: commande.cote, degres: commande.degres } };
    case 'moteur':
      return { ...etat, moteur: { action: commande.action, niveau: commande.niveau } };
    case 'mob':
      return { ...etat, homme_a_la_mer: true };
    default:
      return etat;
  }
}
