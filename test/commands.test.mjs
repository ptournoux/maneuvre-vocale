import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpreter, appliquer, etatInitial, extraireNombre, normaliser } from '../commands.js';

test('normalise accents, casse et ponctuation', () => {
  assert.equal(normaliser("Arrête le moteur !"), 'arrete le moteur');
  assert.equal(normaliser("Marche-arrière"), 'marche arriere');
});

test('extrait les nombres en chiffres et en mots', () => {
  assert.equal(extraireNombre('barre a tribord 25'), 25);
  assert.equal(extraireNombre('barre a babord vingt'), 20);
  assert.equal(extraireNombre('trente et un pour cent'), 31);
  assert.equal(extraireNombre('barre au milieu'), null);
});

const cas = [
  ['Homme à la mer !', 'homme_a_la_mer', { type: 'mob' }],
  ['MOB, MOB', 'homme_a_la_mer', { type: 'mob' }],
  ['Barre à bâbord toute', 'barre_cote', { type: 'barre', cote: 'babord', degres: 20 }],
  ['barre à tribord 15', 'barre_cote', { type: 'barre', cote: 'tribord', degres: 15 }],
  ['barre à gauche, dix degrés', 'barre_cote', { type: 'barre', cote: 'babord', degres: 10 }],
  ['barre à droite 50', 'barre_cote', { type: 'barre', cote: 'tribord', degres: 35 }],
  ['barre au milieu', 'barre_milieu', { type: 'barre', cote: 'milieu', degres: 0 }],
  ['moteur en avant', 'marche_avant', { type: 'moteur', action: 'avant', niveau: 50 }],
  ['marche arrière doucement', 'marche_arriere', { type: 'moteur', action: 'arriere', niveau: 10 }],
  ['moteur à 30 pour cent', 'marche_avant', { type: 'moteur', action: 'avant', niveau: 30 }],
  ['plein gaz', 'marche_avant', { type: 'moteur', action: 'avant', niveau: 100 }],
  ['stop moteur', 'arret', { type: 'moteur', action: 'stop', niveau: 0 }],
  ["arrête le moteur", 'arret', { type: 'moteur', action: 'stop', niveau: 0 }],
];

for (const [phrase, regle, commande] of cas) {
  test(`« ${phrase} » -> ${regle}`, () => {
    const r = interpreter(phrase);
    assert.equal(r.ok, true);
    assert.equal(r.regle, regle);
    assert.deepEqual(r.commande, commande);
  });
}

test('phrase hors vocabulaire : non reconnue', () => {
  assert.equal(interpreter('bonjour tout le monde').ok, false);
  assert.equal(interpreter('   ').ok, false);
});

test('appliquer met à jour l’état', () => {
  let etat = etatInitial();
  etat = appliquer(etat, interpreter('barre à tribord 20').commande);
  etat = appliquer(etat, interpreter('moteur en avant à 40').commande);
  etat = appliquer(etat, interpreter('homme à la mer').commande);
  assert.deepEqual(etat.barre, { cote: 'tribord', degres: 20 });
  assert.deepEqual(etat.moteur, { action: 'avant', niveau: 40 });
  assert.equal(etat.homme_a_la_mer, true);
});
