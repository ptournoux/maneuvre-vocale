import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encoderWav, corpsRequete, transcrireOpenRouter, OPENROUTER_URL } from '../transcription.js';

test('en-tête WAV 16 kHz mono 16 bits valide', () => {
  const pcm = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const wav = encoderWav(pcm, 16000);
  const vue = new DataView(wav.buffer);
  const texte = (o, n) => String.fromCharCode(...wav.subarray(o, o + n));
  assert.equal(texte(0, 4), 'RIFF');
  assert.equal(texte(8, 4), 'WAVE');
  assert.equal(vue.getUint32(4, true), 36 + 10);
  assert.equal(vue.getUint16(22, true), 1);      // mono
  assert.equal(vue.getUint32(24, true), 16000);  // fréquence
  assert.equal(vue.getUint16(34, true), 16);     // 16 bits
  assert.equal(vue.getUint32(40, true), 10);     // taille des données
  assert.equal(vue.getInt16(44 + 2, true), 16383); // 0.5 -> ~ moitié de 32767
  assert.equal(vue.getInt16(44 + 6, true), 32767); // 1 -> max
  assert.equal(vue.getInt16(44 + 8, true), -32768); // -1 -> min
});

test('corps de requête : audio WAV en base64 et consigne texte', () => {
  const corps = corpsRequete({ modele: 'openai/gpt-audio-mini', pcm: new Float32Array(100) });
  assert.equal(corps.model, 'openai/gpt-audio-mini');
  assert.equal(corps.temperature, 0);
  const [texte, audio] = corps.messages[0].content;
  assert.equal(texte.type, 'text');
  assert.match(texte.text, /français/);
  assert.equal(audio.type, 'input_audio');
  assert.equal(audio.input_audio.format, 'wav');
  assert.equal(Buffer.from(audio.input_audio.data, 'base64').subarray(0, 4).toString(), 'RIFF');
});

test('transcrireOpenRouter : succès renvoie le texte nettoyé', async () => {
  let appel;
  const fetchFn = async (url, init) => {
    appel = { url, init };
    return new Response(JSON.stringify({ choices: [{ message: { content: '  barre à tribord 20 ' } }] }), { status: 200 });
  };
  const texte = await transcrireOpenRouter({ cle: 'sk-test', modele: 'm', pcm: new Float32Array(10), fetchFn });
  assert.equal(texte, 'barre à tribord 20');
  assert.equal(appel.url, OPENROUTER_URL);
  assert.equal(appel.init.headers.Authorization, 'Bearer sk-test');
});

test('transcrireOpenRouter : erreur HTTP lève une erreur lisible', async () => {
  const fetchFn = async () => new Response('invalid key', { status: 401 });
  await assert.rejects(
    transcrireOpenRouter({ cle: 'x', modele: 'm', pcm: new Float32Array(10), fetchFn }),
    /OpenRouter 401 invalid key/,
  );
});
