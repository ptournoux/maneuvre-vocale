import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encoderWav, corpsClassement, classerOpenRouter, OPENROUTER_URL } from '../transcription.js';

test('en-tête WAV 16 kHz mono 16 bits valide', () => {
  const wav = encoderWav(new Float32Array([0, 0.5, -0.5, 1, -1]), 16000);
  const vue = new DataView(wav.buffer);
  const texte = (o, n) => String.fromCharCode(...wav.subarray(o, o + n));
  assert.equal(texte(0, 4), 'RIFF');
  assert.equal(texte(8, 4), 'WAVE');
  assert.equal(vue.getUint32(4, true), 36 + 10);
  assert.equal(vue.getUint16(22, true), 1);
  assert.equal(vue.getUint32(24, true), 16000);
  assert.equal(vue.getUint16(34, true), 16);
  assert.equal(vue.getUint32(40, true), 10);
  assert.equal(vue.getInt16(46, true), 16383);
  assert.equal(vue.getInt16(50, true), 32767);
  assert.equal(vue.getInt16(52, true), -32768);
});

test('corps de requête : consigne, audio WAV et schéma JSON optionnel', () => {
  const avec = corpsClassement({ modele: 'm', pcm: new Float32Array(100) });
  const [texte, audio] = avec.messages[0].content;
  assert.match(texte.text, /Commandes possibles/);
  assert.equal(audio.input_audio.format, 'wav');
  assert.equal(Buffer.from(audio.input_audio.data, 'base64').subarray(0, 4).toString(), 'RIFF');
  assert.equal(avec.response_format.type, 'json_schema');
  assert.ok(avec.response_format.json_schema.schema.properties.commande.enum.includes('aucune'));
  assert.equal(corpsClassement({ modele: 'm', pcm: new Float32Array(10), avecSchema: false }).response_format, undefined);
});

const reponseModele = (contenu, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content: contenu } }] }), { status });
const json = (o) => JSON.stringify({ commande: 'barre', cote: 'tribord', degres: 20, niveau: null, transcription: 'barre à tribord vingt', confiance: 0.95, ...o });

test('classerOpenRouter : succès avec schéma', async () => {
  const appels = [];
  const fetchFn = async (url, init) => { appels.push({ url, corps: JSON.parse(init.body), init }); return reponseModele(json()); };
  const r = await classerOpenRouter({ cle: 'sk-test', modele: 'm', pcm: new Float32Array(10), fetchFn });
  assert.equal(r.commande, 'barre');
  assert.equal(r.cote, 'tribord');
  assert.equal(r.schema, true);
  assert.equal(appels.length, 1);
  assert.equal(appels[0].url, OPENROUTER_URL);
  assert.equal(appels[0].init.headers.Authorization, 'Bearer sk-test');
});

test('classerOpenRouter : repli sans schéma si le modèle répond 400', async () => {
  const corps = [];
  const fetchFn = async (url, init) => {
    const c = JSON.parse(init.body);
    corps.push(c);
    return c.response_format ? new Response('response_format not supported', { status: 400 }) : reponseModele('```json\n' + json({ commande: 'homme_a_la_mer', cote: null, degres: null }) + '\n```');
  };
  const r = await classerOpenRouter({ cle: 'k', modele: 'm', pcm: new Float32Array(10), fetchFn });
  assert.equal(r.commande, 'homme_a_la_mer');
  assert.equal(r.schema, false);
  assert.equal(corps.length, 2);
});

test('classerOpenRouter : erreur HTTP lisible, commande hors liste rejetée', async () => {
  await assert.rejects(
    classerOpenRouter({ cle: 'x', modele: 'm', pcm: new Float32Array(10), fetchFn: async () => new Response('invalid key', { status: 401 }) }),
    /OpenRouter 401 invalid key/);
  await assert.rejects(
    classerOpenRouter({ cle: 'x', modele: 'm', pcm: new Float32Array(10), fetchFn: async () => reponseModele(json({ commande: 'virer' })) }),
    /hors liste/);
});
