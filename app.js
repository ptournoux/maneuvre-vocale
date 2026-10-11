import { interpreter, appliquer, etatInitial } from './commands.js';

// --- Configuration -----------------------------------------------------------
// Modèle Whisper compatible transformers.js. Surcharge possible : ?modele=...
const MODELE = new URLSearchParams(location.search).get('modele') || 'onnx-community/whisper-tiny';
const LANGUE = 'french';
// Variante du modèle : fp32 = la plus compatible avec le runtime WASM (les variantes quantifiées 4 bits
// ont échoué avec « MatMulNBits ... missing scale » sur téléphone). Plus lourde, mais fiable.
const DTYPE = 'fp32';
const FREQUENCE = 16000; // Whisper attend du 16 kHz mono
// Bibliothèque chargée à la demande, version figée (jsDelivr). Ne charge rien tant que le modèle n'est pas demandé.
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js';

let pipeline = null;
let env = null;

// --- Éléments ---------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const el = {
  charger: $('charger'), modeleStatut: $('modele-statut'),
  ptt: $('ptt'), microStatut: $('micro-statut'),
  saisie: $('saisie'), texte: $('texte'),
  transcription: $('transcription'), resultat: $('resultat'),
  etat: $('etat'), journal: $('journal'),
};

// --- État -------------------------------------------------------------------
let asr = null;
let etat = etatInitial();
let enregistreur = null;
let morceaux = [];
let enCours = false;   // enregistrement en cours
let maintenu = false;  // bouton/espace toujours enfoncé (couvre la demande de micro)

// --- Affichage --------------------------------------------------------------
function ajouterJournal(texte, ok = true) {
  const li = document.createElement('li');
  li.textContent = `${new Date().toLocaleTimeString('fr-FR')} – ${texte}`;
  if (!ok) li.className = 'ko';
  el.journal.prepend(li);
}

function afficherEtat() {
  const { barre, moteur, homme_a_la_mer: mob } = etat;
  const barreTxt = barre.cote === 'milieu' ? 'Dans l’axe' : `${barre.cote} ${barre.degres}°`;
  const moteurTxt = moteur.action === 'stop' ? 'Arrêt' : `${moteur.action === 'avant' ? 'Avant' : 'Arrière'} ${moteur.niveau} %`;
  const cartes = [
    ['Barre', barreTxt],
    ['Moteur', moteurTxt],
    ['Homme à la mer', mob ? 'OUI' : 'non', mob ? 'ko' : 'ok'],
  ];
  el.etat.replaceChildren(...cartes.map(([titre, valeur, classe]) => {
    const d = document.createElement('div');
    const b = document.createElement('b');
    b.textContent = titre;
    const v = document.createElement('span');
    v.textContent = valeur;
    if (classe) v.className = classe;
    d.append(b, v);
    return d;
  }));
}

function traiterPhrase(phrase, transcrit) {
  el.transcription.textContent = transcrit ? phrase : '(saisie texte)';
  const r = interpreter(phrase);
  if (!r.ok) {
    el.resultat.textContent = `Non reconnu : « ${phrase} »\n${r.raison}`;
    ajouterJournal(`non reconnu : « ${phrase} »`, false);
    return;
  }
  etat = appliquer(etat, r.commande);
  el.resultat.textContent = `règle : ${r.regle}\ncommande : ${JSON.stringify(r.commande, null, 2)}`;
  ajouterJournal(`« ${phrase} » → ${r.commande.type}`);
  afficherEtat();
}

// --- Modèle -----------------------------------------------------------------
async function chargerModele() {
  el.charger.disabled = true;
  el.modeleStatut.textContent = 'Téléchargement du modèle…';
  try {
    const lib = await import(TRANSFORMERS_URL);
    pipeline = lib.pipeline;
    env = lib.env;
    env.backends.onnx.wasm.numThreads = 1; // pas de threads sans isolation cross-origin
    // Un dossier ./models/<modele>/ est utilisé en priorité s'il existe ; sinon Hugging Face.
    env.allowLocalModels = true;
    env.localModelPath = new URL('./models/', location.href).href;

    asr = await pipeline('automatic-speech-recognition', MODELE, {
      device: 'wasm',
      dtype: DTYPE,
      progress_callback: (p) => {
        if (p.status === 'progress' && p.progress !== undefined) {
          el.modeleStatut.textContent = `Téléchargement ${p.file ?? ''} : ${Math.round(p.progress)} %`;
        }
      },
    });
    el.modeleStatut.textContent = `Modèle prêt : ${MODELE}`;
    el.modeleStatut.className = 'ok';
    el.ptt.disabled = false;
    el.microStatut.textContent = 'Maintiens le bouton (ou la barre espace) pour parler, relâche pour envoyer.';
    ajouterJournal('modèle Whisper chargé');
  } catch (err) {
    console.error(err);
    el.modeleStatut.textContent = `Échec du chargement (${err.message ?? err}). Vérifie l'accès à huggingface.co, ou place les fichiers du modèle dans ./models/${MODELE}/.`;
    el.modeleStatut.className = 'ko';
    el.charger.disabled = false;
    ajouterJournal('échec du chargement du modèle', false);
  }
}

// --- Audio ------------------------------------------------------------------
// Le navigateur enregistre en webm/ogg ; on décode puis on rééchantillonne à 16 kHz mono.
async function versPCM16k(blob) {
  const ctx = new AudioContext();
  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
  await ctx.close();
  const rendu = new OfflineAudioContext(1, Math.ceil(buffer.duration * FREQUENCE), FREQUENCE);
  const source = rendu.createBufferSource();
  source.buffer = buffer;
  source.connect(rendu.destination);
  source.start();
  return (await rendu.startRendering()).getChannelData(0);
}

async function demarrerEnregistrement() {
  if (!asr || enCours || maintenu) return;
  maintenu = true;
  try {
    const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!maintenu) { // relâché pendant la demande d'accès au micro
      flux.getTracks().forEach((t) => t.stop());
      return;
    }
    morceaux = [];
    enregistreur = new MediaRecorder(flux);
    enregistreur.ondataavailable = (e) => e.data.size && morceaux.push(e.data);
    enregistreur.onstop = () => {
      flux.getTracks().forEach((t) => t.stop());
      traiterAudio(new Blob(morceaux, { type: enregistreur.mimeType }));
    };
    enregistreur.start();
    enCours = true;
    el.ptt.classList.add('enregistre');
    el.microStatut.textContent = 'Enregistrement…';
  } catch (err) {
    maintenu = false;
    el.microStatut.textContent = `Micro indisponible : ${err.message ?? err}. Utilise la saisie texte.`;
    el.microStatut.className = 'ko';
  }
}

function arreterEnregistrement() {
  maintenu = false;
  if (!enCours) return;
  enCours = false;
  el.ptt.classList.remove('enregistre');
  enregistreur.stop();
}

async function traiterAudio(blob) {
  el.microStatut.textContent = 'Transcription…';
  try {
    const pcm = await versPCM16k(blob);
    if (pcm.length < FREQUENCE * 0.3) {
      el.microStatut.textContent = 'Trop court, recommence.';
      return;
    }
    const t0 = performance.now();
    const { text } = await asr(pcm, { language: LANGUE, task: 'transcribe' });
    const ms = Math.round(performance.now() - t0);
    el.microStatut.textContent = `Transcrit en ${ms} ms (audio : ${(pcm.length / FREQUENCE).toFixed(1)} s).`;
    const phrase = text.trim();
    if (!phrase) { ajouterJournal('silence ou rien compris', false); return; }
    traiterPhrase(phrase, true);
  } catch (err) {
    console.error(err);
    el.microStatut.textContent = `Erreur de transcription : ${err.message ?? err}`;
    ajouterJournal('erreur de transcription', false);
  }
}

// --- Événements -------------------------------------------------------------
el.charger.addEventListener('click', chargerModele);

el.ptt.addEventListener('pointerdown', (e) => { e.preventDefault(); demarrerEnregistrement(); });
for (const evt of ['pointerup', 'pointerleave', 'pointercancel']) {
  el.ptt.addEventListener(evt, arreterEnregistrement);
}

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || e.repeat || e.target.tagName === 'INPUT' || el.ptt.disabled) return;
  e.preventDefault();
  demarrerEnregistrement();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') arreterEnregistrement();
});

el.saisie.addEventListener('submit', (e) => {
  e.preventDefault();
  const phrase = el.texte.value.trim();
  if (phrase) traiterPhrase(phrase, false);
  el.texte.value = '';
});

document.querySelectorAll('[data-phrase]').forEach((b) => {
  b.addEventListener('click', () => traiterPhrase(b.dataset.phrase, false));
});

afficherEtat();
