import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lireReponse, versCommande, rattraper, similarite, idsPossibles, schemaClassement, consigneClassement } from '../classement.js';

const rep = (o) => JSON.stringify({ commande: 'aucune', cote: null, degres: null, niveau: null, transcription: '', confiance: 0.9, ...o });

test('liste des ids possibles inclut « aucune »', () => {
  assert.deepEqual(idsPossibles(), ['barre', 'barre_milieu', 'moteur_avant', 'moteur_arriere', 'moteur_stop', 'homme_a_la_mer', 'aucune']);
  assert.deepEqual(schemaClassement().properties.commande.enum, idsPossibles());
  assert.match(consigneClassement(), /homme_a_la_mer/);
});

test('lit un JSON entouré de balises de code', () => {
  const r = lireReponse('```json\n' + rep({ commande: 'barre', cote: 'tribord', degres: 20 }) + '\n```');
  assert.equal(r.commande, 'barre');
  assert.equal(r.cote, 'tribord');
  assert.equal(r.degres, 20);
});

test('rejette une commande hors liste et une réponse non JSON', () => {
  assert.throws(() => lireReponse(rep({ commande: 'virer_de_bord' })), /hors liste/);
  assert.throws(() => lireReponse('je ne sais pas'), /non JSON/);
});

test('borne la confiance et nettoie les champs invalides', () => {
  const r = lireReponse(rep({ commande: 'barre', cote: 'nord', degres: 'vingt', confiance: 3 }));
  assert.equal(r.cote, null);
  assert.equal(r.degres, null);
  assert.equal(r.confiance, 1);
});

test('versCommande : traduction et bornes', () => {
  const base = { cote: null, degres: null, niveau: null, transcription: '', confiance: 0.9 };
  assert.deepEqual(versCommande({ ...base, commande: 'barre', cote: 'babord', degres: 50 }), { type: 'barre', cote: 'babord', degres: 35 });
  assert.deepEqual(versCommande({ ...base, commande: 'barre', cote: 'tribord' }), { type: 'barre', cote: 'tribord', degres: 20 });
  assert.equal(versCommande({ ...base, commande: 'barre' }), null); // côté manquant
  assert.deepEqual(versCommande({ ...base, commande: 'moteur_avant', niveau: 140 }), { type: 'moteur', action: 'avant', niveau: 100 });
  assert.deepEqual(versCommande({ ...base, commande: 'moteur_arriere' }), { type: 'moteur', action: 'arriere', niveau: 50 });
  assert.deepEqual(versCommande({ ...base, commande: 'homme_a_la_mer' }), { type: 'mob' });
  assert.equal(versCommande({ ...base, commande: 'aucune' }), null);
  assert.equal(versCommande({ ...base, commande: 'homme_a_la_mer', confiance: 0.3 }), null); // trop peu sûr
});

test('similarité : tolère les espaces et fautes de transcription', () => {
  assert.ok(similarite('bar a tri bord', 'barre à tribord') > 0.8);
  assert.ok(similarite('bonjour', 'homme à la mer') < 0.5);
});

test('rattrapage de transcriptions approximatives', () => {
  const cas = [
    ['Bar a tri bord 20.', { type: 'barre', cote: 'tribord', degres: 20 }],
    ['barre a bas bord', { type: 'barre', cote: 'babord', degres: 20 }],
    ['Home à la mère !', { type: 'mob' }],
    ['marche arrier doucement', { type: 'moteur', action: 'arriere', niveau: 10 }],
    ['stop motor', { type: 'moteur', action: 'stop', niveau: 0 }],
  ];
  for (const [texte, attendu] of cas) {
    const r = rattraper(texte);
    assert.ok(r, `non rattrapé : ${texte}`);
    assert.deepEqual(r.commande, attendu, texte);
  }
  assert.equal(rattraper('quelle belle journée pour naviguer'), null);
});
