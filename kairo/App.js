// Kairo.IA — l'IA qui répond à tout et qui écrit des chansons
// Serveur : Cloudflare Worker « kairoia » (Gemini, GPT-OSS, Qwen, Llama)
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView,
  Platform, StatusBar, Share, Modal, ScrollView, Alert, Animated, StyleSheet, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// === CONFIG ===
const SERVEUR = 'https://kairoia.ursjeixitx.workers.dev';
const CONVS_KEY = 'kairo.convs';
const PREFS_KEY = 'kairo.prefs';
const DELAI_MS = 90000;

const IAS = [
  { id: 'gemini', nom: 'Gemini', emoji: '✨', couleur: '#4F8CFF' },
  { id: 'gpt', nom: 'GPT-OSS', emoji: '🧠', couleur: '#10B981' },
  { id: 'qwen', nom: 'Qwen', emoji: '🐉', couleur: '#F59E0B' },
  { id: 'llama', nom: 'Llama', emoji: '🦙', couleur: '#EC4899' },
];
const iaDe = (id) => IAS.find((i) => i.id === id) || IAS[0];

const MODES = [
  { id: 'chat', emoji: '💬', nom: 'Discussion' },
  { id: 'chanson', emoji: '🎵', nom: 'Chanson' },
  { id: 'image', emoji: '🖼️', nom: 'Image' },
  { id: 'video', emoji: '🎬', nom: 'Vidéo', bientot: true },
];
const modeDe = (id) => MODES.find((m) => m.id === id) || MODES[0];

const SUGGESTIONS = {
  chat: [
    '💡 Donne-moi 5 idées de business à lancer avec peu d\'argent',
    '📚 Explique-moi la photosynthèse simplement',
    '✍️ Écris un message pour souhaiter bon anniversaire à mon ami',
    '🍲 Une recette facile avec du riz et des haricots',
  ],
  chanson: [
    '❤️ Une chanson d\'amour douce, style rumba',
    '🔥 Un rap motivant sur la réussite',
    '🎂 Une chanson pour l\'anniversaire de ma mère',
    '🙏 Un chant de louange joyeux',
  ],
  image: [
    '🦁 Un lion majestueux au coucher du soleil',
    '🌃 Kinshasa futuriste la nuit, style néon',
    '👑 Portrait d\'une reine africaine, peinture à l\'huile',
    '🚀 Une fusée colorée, style dessin animé',
  ],
};

async function sauverImage(base64, id) {
  const f = new File(Paths.document, 'kairo-' + id + '.jpg');
  if (f.exists) f.delete();
  f.create();
  await f.write(base64, { encoding: 'base64' });
  return f.uri;
}

function effacerImages(conv) {
  (conv.messages || []).forEach((m) => {
    if (m.image) {
      try { const f = new File(m.image); if (f.exists) f.delete(); } catch (e) {}
    }
  });
}

const THEMES = {
  noir: {
    nom: 'noir', fond: '#000000', carte: '#121212', carte2: '#1F1F1F', bord: '#2C2C2C',
    texte: '#FFFFFF', gris: '#8E8E8E', accent: '#FFFFFF', surAccent: '#000000',
    erreur: '#FF5C7A', erreurTexte: '#FFC2CD', barre: 'light-content', voile: 'rgba(0,0,0,0.7)',
  },
  blanc: {
    nom: 'blanc', fond: '#FFFFFF', carte: '#F2F2F2', carte2: '#E4E4E4', bord: '#D6D6D6',
    texte: '#000000', gris: '#6E6E6E', accent: '#000000', surAccent: '#FFFFFF',
    erreur: '#D7263D', erreurTexte: '#8A1022', barre: 'dark-content', voile: 'rgba(0,0,0,0.35)',
  },
};
const TAILLES = { petit: 0.9, normal: 1, grand: 1.15 };
const LANGUES = [
  { id: 'auto', nom: 'Auto' }, { id: 'fr', nom: 'Français' }, { id: 'en', nom: 'English' },
  { id: 'ln', nom: 'Lingala' }, { id: 'sw', nom: 'Swahili' },
];
const NOMS_LANGUES = { fr: 'français', en: 'anglais', ln: 'lingala', sw: 'swahili' };
const LONGUEURS = [
  { id: 'courte', nom: 'Courtes' }, { id: 'normale', nom: 'Normales' }, { id: 'detaillee', nom: 'Détaillées' },
];
const PARAMS_DEFAUT = { theme: 'noir', taille: 'normal', langue: 'auto', longueur: 'normale' };

function consignes(p) {
  const t = [];
  if (p.langue && p.langue !== 'auto') t.push('Réponds uniquement en ' + NOMS_LANGUES[p.langue] + '.');
  if (p.longueur === 'courte') t.push('Réponds de façon courte et directe.');
  if (p.longueur === 'detaillee') t.push('Réponds de façon détaillée et complète.');
  return t.join(' ');
}

let C = THEMES.noir;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function nouvelleConv(modele, mode) {
  return { id: uid(), titre: 'Nouvelle discussion', modele, mode, messages: [], maj: Date.now() };
}

function messageErreur(e) {
  const t = String(e || '');
  if (/abort/i.test(t)) return 'La réponse prend trop de temps ⏳ Réessaie dans un instant.';
  if (/network|failed to fetch|request failed/i.test(t)) return 'Pas de connexion internet 📶 Vérifie ton réseau et réessaie.';
  if (/429|quota|limit|exhausted|4006|allocation/i.test(t))
    return 'Cette IA a atteint sa limite pour aujourd\'hui 😅 Choisis une autre IA en haut.';
  return 'Oups, une erreur est survenue : ' + t;
}

// === TEXTE ENRICHI (titres, gras, listes, code) ===
function Inline({ texte, style }) {
  const morceaux = String(texte).split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={style}>
      {morceaux.map((m, i) =>
        m.startsWith('**') && m.endsWith('**') && m.length > 4
          ? <Text key={i} style={{ fontWeight: 'bold' }}>{m.slice(2, -2)}</Text>
          : <Text key={i}>{m}</Text>
      )}
    </Text>
  );
}

function TexteRiche({ texte, couleur }) {
  const blocs = [];
  const parties = String(texte).split('```');
  parties.forEach((p, i) => {
    if (i % 2 === 1) {
      const code = p.replace(/^[a-zA-Z]*\n/, '');
      blocs.push(
        <View key={'c' + i} style={s.code}>
          <Text style={s.codeTexte} selectable>{code.trim()}</Text>
        </View>
      );
      return;
    }
    p.split('\n').forEach((ligne, j) => {
      const k = i + '-' + j;
      if (!ligne.trim()) { blocs.push(<View key={k} style={{ height: 6 }} />); return; }
      const titre = ligne.match(/^#{1,4}\s+(.*)/);
      if (titre) {
        blocs.push(<Inline key={k} texte={titre[1]} style={[s.titreMd, { color: couleur }]} />);
        return;
      }
      const puce = ligne.match(/^\s*[-*•]\s+(.*)/);
      if (puce) {
        blocs.push(
          <View key={k} style={s.puceLigne}>
            <Text style={[s.msgTexte, { color: couleur }]}>•  </Text>
            <Inline texte={puce[1]} style={[s.msgTexte, { color: couleur, flex: 1 }]} />
          </View>
        );
        return;
      }
      blocs.push(<Inline key={k} texte={ligne} style={[s.msgTexte, { color: couleur }]} />);
    });
  });
  return <View>{blocs}</View>;
}

// === INDICATEUR « KAIRO RÉFLÉCHIT » ===
function Points({ couleur }) {
  const a = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    const anims = a.map((v, i) =>
      Animated.loop(Animated.sequence([
        Animated.delay(i * 160),
        Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.3, duration: 320, useNativeDriver: true }),
        Animated.delay((2 - i) * 160),
      ]))
    );
    anims.forEach((x) => x.start());
    return () => anims.forEach((x) => x.stop());
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {a.map((v, i) => (
        <Animated.View key={i} style={[s.point, { backgroundColor: couleur, opacity: v }]} />
      ))}
    </View>
  );
}

// === BOUTON D'OPTION (paramètres) ===
function Option({ actif, nom, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.option, actif ? { backgroundColor: C.accent, borderColor: C.accent } : null]}>
      <Text style={[s.optionTexte, actif ? { color: C.surAccent } : null]}>{nom}</Text>
    </TouchableOpacity>
  );
}

// === ÉCRAN PRINCIPAL ===
function Kairo() {
  const ins = useSafeAreaInsets();
  const [convs, setConvs] = useState([]);
  const [actuelle, setActuelle] = useState(null);
  const [modele, setModele] = useState('gemini');
  const [mode, setMode] = useState('chat');
  const [saisie, setSaisie] = useState('');
  const [attente, setAttente] = useState(false);
  const [menu, setMenu] = useState(false);
  const [choixMode, setChoixMode] = useState(false);
  const [pret, setPret] = useState(false);
  const [params, setParams] = useState(PARAMS_DEFAUT);
  const [voirParams, setVoirParams] = useState(false);
  const liste = useRef(null);

  function changerParam(cle, valeur) {
    const p = { ...params, [cle]: valeur };
    appliquerTheme(p);
    setParams(p);
  }

  // Chargement
  useEffect(() => {
    (async () => {
      try {
        const p = JSON.parse((await AsyncStorage.getItem(PREFS_KEY)) || '{}');
        const m = p.modele && IAS.some((i) => i.id === p.modele) ? p.modele : 'gemini';
        const md = MODES.some((x) => x.id === p.mode && !x.bientot) ? p.mode : 'chat';
        setModele(m); setMode(md);
        const pr = { ...PARAMS_DEFAUT, ...(p.params || {}) };
        appliquerTheme(pr);
        setParams(pr);
        const cs = JSON.parse((await AsyncStorage.getItem(CONVS_KEY)) || '[]');
        setConvs(Array.isArray(cs) ? cs : []);
        setActuelle(nouvelleConv(m, md));
      } catch (e) {
        setActuelle(nouvelleConv('gemini', 'chat'));
      }
      setPret(true);
    })();
  }, []);

  // Sauvegarde
  useEffect(() => {
    if (!pret) return;
    AsyncStorage.setItem(CONVS_KEY, JSON.stringify(convs.slice(0, 50))).catch(() => {});
  }, [convs, pret]);
  useEffect(() => {
    if (!pret) return;
    AsyncStorage.setItem(PREFS_KEY, JSON.stringify({ modele, mode, params })).catch(() => {});
  }, [modele, mode, params, pret]);

  const enregistrer = (conv) => {
    setActuelle(conv);
    if (!conv.messages.length) return;
    setConvs((cs) => [conv, ...cs.filter((c) => c.id !== conv.id)]);
  };

  const defiler = () => setTimeout(() => liste.current && liste.current.scrollToEnd({ animated: true }), 80);

  function choisirMode(id) {
    const m = modeDe(id);
    setChoixMode(false);
    if (m.bientot) {
      Alert.alert('🎬 Vidéo', 'La création de vidéos arrive bientôt dans Kairo.IA ! Pour l\'instant, essaie le mode 🖼️ Image.');
      return;
    }
    if (!attente) setMode(id);
  }

  async function demander(conv, iaId, modeEnvoi) {
    setAttente(true);
    defiler();
    const estImage = modeEnvoi === 'image';
    const derniers = conv.messages.filter((m) => !m.erreur);
    const historiqueMsgs = estImage
      ? [{ role: 'user', content: derniers[derniers.length - 1].content }]
      : derniers.map((m) => ({
          role: m.role,
          content: m.image ? '[Image créée : ' + (m.content || '') + ']' : m.content,
        }));
    const cons = consignes(params);
    const envoi = !estImage && cons && historiqueMsgs.length
      ? historiqueMsgs.map((m, i) => (i === historiqueMsgs.length - 1 && m.role === 'user'
        ? { ...m, content: m.content + '\n\n(' + cons + ')' } : m))
      : historiqueMsgs;
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), DELAI_MS);
    let suivant;
    try {
      const res = await fetch(SERVEUR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: iaId, mode: modeEnvoi, messages: envoi }),
        signal: ctrl.signal,
      });
      const d = await res.json().catch(() => ({}));
      if (estImage) {
        if (!res.ok || !d.image) throw new Error(d.erreur || 'Erreur ' + res.status);
        const id = uid();
        const uri = await sauverImage(d.image, id);
        suivant = { id, role: 'assistant', content: historiqueMsgs[0].content, image: uri, modele: 'flux', mode: 'image' };
      } else {
        if (!res.ok || !d.reponse) throw new Error(d.erreur || 'Erreur ' + res.status);
        suivant = { id: uid(), role: 'assistant', content: d.reponse, modele: iaId, mode: modeEnvoi };
      }
    } catch (e) {
      const brut = e && e.name === 'AbortError' ? 'abort' : (e && e.message) || e;
      suivant = { id: uid(), role: 'assistant', content: messageErreur(brut), modele: estImage ? 'flux' : iaId, mode: modeEnvoi, erreur: true };
    } finally {
      clearTimeout(minuteur);
    }
    const maj = { ...conv, messages: [...conv.messages, suivant], maj: Date.now() };
    enregistrer(maj);
    setAttente(false);
    defiler();
  }

  function envoyer(texteForce) {
    const texte = (texteForce != null ? texteForce : saisie).trim();
    if (!texte || attente || !actuelle) return;
    setSaisie('');
    setChoixMode(false);
    const msg = { id: uid(), role: 'user', content: texte, mode };
    const titre = actuelle.messages.length ? actuelle.titre : texte.replace(/^\W+\s*/, '').slice(0, 42);
    const conv = { ...actuelle, titre, modele, mode, messages: [...actuelle.messages, msg], maj: Date.now() };
    enregistrer(conv);
    demander(conv, modele, mode);
  }

  function reessayer(iaId) {
    if (attente || !actuelle) return;
    const msgs = [...actuelle.messages];
    while (msgs.length && msgs[msgs.length - 1].erreur) msgs.pop();
    if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return;
    const md = msgs[msgs.length - 1].mode || mode;
    if (iaId) setModele(iaId);
    const conv = { ...actuelle, messages: msgs };
    setActuelle(conv);
    demander(conv, iaId || modele, md);
  }

  function nouvelle() {
    if (attente) return;
    setActuelle(nouvelleConv(modele, mode));
    setSaisie('');
  }

  function ouvrir(c) {
    setActuelle(c);
    if (c.modele && IAS.some((i) => i.id === c.modele)) setModele(c.modele);
    if (c.mode && !modeDe(c.mode).bientot) setMode(c.mode);
    setMenu(false);
    defiler();
  }

  function supprimer(c) {
    Alert.alert('Supprimer', 'Supprimer « ' + c.titre + ' » ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer', style: 'destructive', onPress: () => {
          effacerImages(c);
          setConvs((cs) => cs.filter((x) => x.id !== c.id));
          if (actuelle && actuelle.id === c.id) setActuelle(nouvelleConv(modele, mode));
        },
      },
    ]);
  }

  function toutEffacer() {
    if (!convs.length) { Alert.alert('Rien à effacer', 'Tu n\'as aucune discussion enregistrée.'); return; }
    Alert.alert('Tout effacer', 'Supprimer toutes les discussions ?', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Tout effacer', style: 'destructive', onPress: () => {
          convs.forEach(effacerImages);
          setConvs([]); setActuelle(nouvelleConv(modele, mode)); setMenu(false);
        },
      },
    ]);
  }

  const partager = (texte) => Share.share({ message: texte + '\n\n— créé avec Kairo.IA' }).catch(() => {});

  async function partagerImage(uri) {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Image créée avec Kairo.IA' });
      }
    } catch (e) {
      Alert.alert('Oups', 'Impossible de partager cette image.');
    }
  }

  if (!pret || !actuelle) {
    return <View style={[s.ecran, { justifyContent: 'center', alignItems: 'center' }]}><Logo taille={72} /></View>;
  }

  const ia = iaDe(modele);
  const md = modeDe(mode);
  const couleurMode = C.texte;
  const vide = actuelle.messages.length === 0;
  const dernier = actuelle.messages[actuelle.messages.length - 1];
  const placeholders = {
    chat: 'Écris ton message…',
    chanson: 'Thème, style, langue de ta chanson…',
    image: 'Décris l\'image à créer…',
  };

  const rendu = ({ item }) => {
    const moi = item.role === 'user';
    const iam = item.modele === 'flux' ? { emoji: '🎨', nom: 'Kairo Image' } : iaDe(item.modele);
    const estDernier = dernier && item.id === dernier.id;
    const etiquetteMode = item.mode === 'chanson' ? '  ·  🎵' : '';
    return (
      <View style={[s.ligneMsg, moi ? { justifyContent: 'flex-end' } : null]}>
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => !item.erreur && (item.image ? partagerImage(item.image) : partager(item.content))}
          style={[
            s.bulle,
            moi ? s.bulleMoi : s.bulleIA,
            item.image ? { padding: 6, width: '88%' } : null,
            item.erreur ? { borderColor: C.erreur } : null,
          ]}
        >
          {moi && item.mode && item.mode !== 'chat' && (
            <Text style={s.modeBadge}>{modeDe(item.mode).emoji}</Text>
          )}
          {!moi && !item.image && (
            <Text style={[s.etiquette, { color: item.erreur ? C.erreur : C.gris }]}>
              {item.erreur ? '⚠️ ' : iam.emoji + ' '}{iam.nom}{etiquetteMode}
            </Text>
          )}
          {item.image ? (
            <Image source={{ uri: item.image }} style={s.image} resizeMode="cover" />
          ) : moi ? (
            <Text style={[s.msgTexte, { color: C.surAccent }]} selectable>{item.content}</Text>
          ) : (
            <TexteRiche texte={item.content} couleur={item.erreur ? C.erreurTexte : C.texte} />
          )}
          {!moi && !item.erreur && (
            <View style={[s.actions, item.image ? { paddingHorizontal: 6, paddingBottom: 4 } : null]}>
              {item.image ? (
                <>
                  <TouchableOpacity onPress={() => partagerImage(item.image)} style={s.actionBtn}>
                    <Text style={s.actionTexte}>↗ Partager / Enregistrer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => !attente && envoyer(item.content)} style={s.actionBtn}>
                    <Text style={s.actionTexte}>🔄 Autre version</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity onPress={() => partager(item.content)} style={s.actionBtn}>
                  <Text style={s.actionTexte}>↗ Partager</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {item.erreur && estDernier && !attente && (
            <View style={s.actions}>
              <TouchableOpacity onPress={() => reessayer()} style={s.actionBtn}>
                <Text style={s.actionTexte}>🔄 Réessayer</Text>
              </TouchableOpacity>
              {item.mode !== 'image' && IAS.filter((x) => x.id !== item.modele).slice(0, 2).map((x) => (
                <TouchableOpacity key={x.id} onPress={() => reessayer(x.id)} style={s.actionBtn}>
                  <Text style={s.actionTexte}>{x.emoji} {x.nom}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[s.ecran, { paddingTop: ins.top }]}>
      <StatusBar barStyle={C.barre} backgroundColor={C.fond} />

      {/* En-tête */}
      <View style={s.entete}>
        <TouchableOpacity onPress={() => setMenu(true)} style={s.iconeBtn}>
          <Text style={s.icone}>☰</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenu(true)} style={{ alignItems: 'center' }} activeOpacity={0.7}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Logo taille={30} />
            <Text style={s.titre}>  Kairo<Text style={{ color: C.gris }}>.IA</Text></Text>
          </View>
          <Text style={[s.sousEntete, { color: C.gris }]}>
            {mode === 'image' ? '🎨 Kairo Image' : ia.emoji + ' ' + ia.nom} ▾
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={nouvelle} style={s.iconeBtn}>
          <Text style={s.icone}>✎</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {vide ? (
          <ScrollView contentContainerStyle={s.accueil} keyboardShouldPersistTaps="handled">
            <Logo taille={84} />
            <Text style={s.bonjour}>
              {mode === 'chanson' ? 'Quelle chanson on écrit ? 🎤'
                : mode === 'image' ? 'Quelle image on crée ? 🎨'
                : 'Bonjour 👋 Je suis Kairo.IA'}
            </Text>
            <Text style={s.sousTitre}>
              {mode === 'chanson'
                ? 'Dis-moi le thème, le style et la langue : je t\'écris les paroles, le refrain et les accords.'
                : mode === 'image'
                  ? 'Décris ce que tu veux voir, dans n\'importe quelle langue : je le dessine pour toi.'
                  : 'Pose-moi n\'importe quelle question. Tu discutes en ce moment avec ' + ia.emoji + ' ' + ia.nom + '.'}
            </Text>
            {SUGGESTIONS[mode].map((t) => (
              <TouchableOpacity key={t} style={s.suggestion} onPress={() => envoyer(t)}>
                <Text style={s.suggestionTexte}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : (
          <FlatList
            ref={liste}
            data={actuelle.messages}
            keyExtractor={(m) => m.id}
            renderItem={rendu}
            contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
            onContentSizeChange={defiler}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={attente ? (
              <View style={s.ligneMsg}>
                <View style={[s.bulle, s.bulleIA, { flexDirection: 'row', alignItems: 'center' }]}>
                  <Text style={[s.etiquette, { color: couleurMode, marginBottom: 0 }]}>
                    {mode === 'image' ? '🎨 Kairo dessine' : mode === 'chanson' ? '🎵 Kairo compose' : ia.emoji + ' Kairo réfléchit'}{'  '}
                  </Text>
                  <Points couleur={couleurMode} />
                </View>
              </View>
            ) : null}
          />
        )}

        {/* Choix rapide du mode (icônes) */}
        {choixMode && (
          <View style={s.choixModes}>
            {MODES.map((m) => (
              <TouchableOpacity
                key={m.id}
                onPress={() => choisirMode(m.id)}
                style={[s.choixModeBtn, mode === m.id ? { backgroundColor: C.carte2, borderWidth: 1, borderColor: C.texte } : null, m.bientot ? { opacity: 0.5 } : null]}
              >
                <Text style={{ fontSize: 24 }}>{m.emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Zone de saisie */}
        <View style={[s.barre, { paddingBottom: Math.max(ins.bottom, 10) }]}>
          <TouchableOpacity
            onPress={() => setChoixMode((v) => !v)}
            style={[s.modeRond, choixMode ? { borderColor: C.accent } : null]}
          >
            <Text style={{ fontSize: 20 }}>{md.emoji}</Text>
          </TouchableOpacity>
          <TextInput
            style={s.champ}
            value={saisie}
            onChangeText={setSaisie}
            placeholder={placeholders[mode] || placeholders.chat}
            placeholderTextColor={C.gris}
            multiline
            maxLength={4000}
          />
          <TouchableOpacity
            onPress={() => envoyer()}
            disabled={attente || !saisie.trim()}
            style={[s.envoyer, { backgroundColor: attente || !saisie.trim() ? C.carte2 : C.accent }]}
          >
            <Text style={s.envoyerTexte}>➤</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Menu ☰ : IA, modes, discussions */}
      <Modal visible={menu} animationType="slide" transparent onRequestClose={() => setMenu(false)}>
        <View style={s.voile}>
          <View style={[s.panneau, { paddingTop: ins.top + 12, paddingBottom: ins.bottom + 12 }]}>
            <View style={s.panneauTete}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Logo taille={28} />
                <Text style={s.panneauTitre}>  Menu</Text>
              </View>
              <TouchableOpacity onPress={() => setMenu(false)} style={s.iconeBtn}>
                <Text style={s.icone}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.section}>🤖 Intelligence</Text>
              {IAS.map((x) => {
                const actif = x.id === modele;
                return (
                  <TouchableOpacity
                    key={x.id}
                    onPress={() => { if (!attente) setModele(x.id); setMenu(false); }}
                    style={[s.menuLigne, actif ? { borderColor: C.texte, backgroundColor: C.carte2 } : null]}
                  >
                    <Text style={s.menuEmoji}>{x.emoji}</Text>
                    <Text style={[s.menuTexte, actif ? { fontWeight: 'bold' } : null]}>{x.nom}</Text>
                    {actif && <Text style={{ color: C.texte, fontSize: 18 }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}

              <Text style={s.section}>✨ Modes</Text>
              <View style={s.menuModes}>
                {MODES.map((m) => {
                  const actif = m.id === mode;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      onPress={() => { choisirMode(m.id); if (!m.bientot) setMenu(false); }}
                      style={[s.menuMode, actif ? { borderColor: C.texte, backgroundColor: C.carte2 } : null, m.bientot ? { opacity: 0.5 } : null]}
                    >
                      <Text style={{ fontSize: 26 }}>{m.emoji}</Text>
                      <Text style={[s.menuModeTexte, actif ? { color: C.texte } : null]}>{m.nom}</Text>
                      {m.bientot && <Text style={s.bientot}>Bientôt</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity onPress={() => setVoirParams((v) => !v)} style={[s.menuLigne, { marginTop: 14 }]}>
                <Text style={s.menuEmoji}>⚙️</Text>
                <Text style={s.menuTexte}>Paramètres</Text>
                <Text style={{ color: C.gris, fontSize: 16 }}>{voirParams ? '▾' : '▸'}</Text>
              </TouchableOpacity>
              {voirParams && (
                <View style={s.params}>
                  <Text style={s.paramTitre}>🎨 Thème</Text>
                  <View style={s.options}>
                    {[['noir', '🌑 Noir'], ['blanc', '☀️ Blanc']].map(([id, nom]) => (
                      <Option key={id} actif={params.theme === id} nom={nom} onPress={() => changerParam('theme', id)} />
                    ))}
                  </View>
                  <Text style={s.paramTitre}>🔠 Taille du texte</Text>
                  <View style={s.options}>
                    {[['petit', 'A−'], ['normal', 'A'], ['grand', 'A+']].map(([id, nom]) => (
                      <Option key={id} actif={params.taille === id} nom={nom} onPress={() => changerParam('taille', id)} />
                    ))}
                  </View>
                  <Text style={s.paramTitre}>🌍 Langue des réponses</Text>
                  <View style={s.options}>
                    {LANGUES.map((l) => (
                      <Option key={l.id} actif={params.langue === l.id} nom={l.nom} onPress={() => changerParam('langue', l.id)} />
                    ))}
                  </View>
                  <Text style={s.paramTitre}>📏 Longueur des réponses</Text>
                  <View style={s.options}>
                    {LONGUEURS.map((l) => (
                      <Option key={l.id} actif={params.longueur === l.id} nom={l.nom} onPress={() => changerParam('longueur', l.id)} />
                    ))}
                  </View>
                  <TouchableOpacity onPress={toutEffacer} style={s.dangerBtn}>
                    <Text style={{ color: C.erreur, fontWeight: '600' }}>🗑 Effacer toutes les discussions</Text>
                  </TouchableOpacity>
                  <Text style={s.apropos}>Kairo.IA · version 1.3</Text>
                </View>
              )}

              <Text style={s.section}>🕘 Discussions</Text>
              <TouchableOpacity style={s.nouvelleBtn} onPress={() => { nouvelle(); setMenu(false); }}>
                <Text style={s.nouvelleTexte}>＋ Nouvelle discussion</Text>
              </TouchableOpacity>
              {convs.length === 0 && <Text style={s.videTexte}>Aucune discussion pour l'instant.</Text>}
              {convs.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[s.convLigne, actuelle && actuelle.id === item.id ? { borderColor: C.accent } : null]}
                  onPress={() => ouvrir(item)}
                  onLongPress={() => supprimer(item)}
                >
                  <Text style={s.convEmoji}>
                    {item.mode && item.mode !== 'chat' ? modeDe(item.mode).emoji : iaDe(item.modele).emoji}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.convTitre} numberOfLines={1}>{item.titre}</Text>
                    <Text style={s.convDate}>
                      {item.mode === 'image' ? 'Kairo Image' : iaDe(item.modele).nom} · {new Date(item.maj).toLocaleDateString('fr-FR')}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => supprimer(item)} style={s.iconeBtn}>
                    <Text style={{ fontSize: 16 }}>🗑</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setMenu(false)} />
        </View>
      </Modal>
    </View>
  );
}

// === LOGO « K » (noir & blanc) ===
function Logo({ taille }) {
  return (
    <View style={{
      width: taille, height: taille, borderRadius: taille * 0.28, backgroundColor: '#000',
      borderWidth: Math.max(1, taille * 0.03), borderColor: C.nom === 'noir' ? '#3A3A3A' : '#000',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{
        color: '#fff', fontSize: taille * 0.6, fontWeight: 'bold',
        textShadowColor: 'rgba(255,255,255,0.85)', textShadowRadius: taille * 0.16, textShadowOffset: { width: 0, height: 0 },
      }}>K</Text>
      <Text style={{
        position: 'absolute', top: taille * 0.06, right: taille * 0.1,
        color: '#fff', fontSize: taille * 0.22,
      }}>✦</Text>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Kairo />
    </SafeAreaProvider>
  );
}

function creerStyles(C, k) {
  return StyleSheet.create({
  ecran: { flex: 1, backgroundColor: C.fond },
  entete: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 8,
  },
  titre: { color: C.texte, fontSize: 22, fontWeight: 'bold' },
  iconeBtn: { padding: 8, minWidth: 40, alignItems: 'center' },
  sousEntete: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  modeBadge: { fontSize: 12, marginBottom: 2 },
  image: { width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: C.carte2 },
  choixModes: {
    flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 12, marginBottom: 6,
    backgroundColor: C.carte, borderRadius: 18, borderWidth: 1, borderColor: C.bord, padding: 6,
  },
  choixModeBtn: { width: 54, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  modeRond: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.carte, borderWidth: 1, borderColor: C.bord, marginRight: 8,
  },
  section: { color: C.gris, fontSize: 13, fontWeight: 'bold', marginTop: 14, marginBottom: 8, letterSpacing: 0.5 },
  menuLigne: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.carte, borderRadius: 14,
    borderWidth: 1, borderColor: C.bord, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8,
  },
  menuEmoji: { fontSize: 20, marginRight: 12 },
  menuTexte: { flex: 1, color: C.texte, fontSize: 16, fontWeight: '600' },
  menuModes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  menuMode: {
    width: '48%', backgroundColor: C.carte, borderRadius: 14, borderWidth: 1, borderColor: C.bord,
    alignItems: 'center', paddingVertical: 12, marginBottom: 8,
  },
  menuModeTexte: { color: C.gris, fontWeight: '600', marginTop: 4 },
  bientot: { color: C.gris, fontSize: 11, marginTop: 2 },
  params: { backgroundColor: C.carte, borderRadius: 14, borderWidth: 1, borderColor: C.bord, padding: 12, marginBottom: 6 },
  paramTitre: { color: C.texte, fontWeight: 'bold', fontSize: 14, marginBottom: 8, marginTop: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  option: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.bord, backgroundColor: C.fond },
  optionTexte: { color: C.texte, fontWeight: '600' },
  dangerBtn: { paddingVertical: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: C.bord, marginTop: 4 },
  apropos: { color: C.gris, fontSize: 12, textAlign: 'center', marginTop: 4 },
  icone: { color: C.texte, fontSize: 22 },
  puces: { paddingHorizontal: 10, gap: 8, paddingVertical: 4 },
  puce: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
    borderColor: C.bord, backgroundColor: C.carte,
  },
  puceTexte: { color: C.gris, fontWeight: '600' },
  modes: {
    flexDirection: 'row', marginHorizontal: 12, marginTop: 8, marginBottom: 4,
    backgroundColor: C.carte, borderRadius: 14, padding: 4,
  },
  modeBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  modeActif: { backgroundColor: C.accent },
  modeTexte: { color: C.gris, fontWeight: '600' },
  accueil: { alignItems: 'center', padding: 24, paddingTop: 36 },
  bonjour: { color: C.texte, fontSize: 22, fontWeight: 'bold', marginTop: 18, textAlign: 'center' },
  sousTitre: { color: C.gris, fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 20, lineHeight: 21 },
  suggestion: {
    alignSelf: 'stretch', backgroundColor: C.carte, borderColor: C.bord, borderWidth: 1,
    borderRadius: 14, padding: 14, marginBottom: 10,
  },
  suggestionTexte: { color: C.texte, fontSize: 15 * k },
  ligneMsg: { flexDirection: 'row', marginBottom: 10 },
  bulle: { maxWidth: '88%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  bulleMoi: { backgroundColor: C.accent, borderColor: C.accent, borderBottomRightRadius: 6 },
  bulleIA: { backgroundColor: C.carte, borderColor: C.bord, borderBottomLeftRadius: 6 },
  etiquette: { fontSize: 12, fontWeight: 'bold', marginBottom: 4 },
  msgTexte: { fontSize: 16 * k, lineHeight: 23 * k },
  titreMd: { fontSize: 17 * k, fontWeight: 'bold', marginTop: 4, marginBottom: 2 },
  puceLigne: { flexDirection: 'row', paddingLeft: 4 },
  code: { backgroundColor: C.carte2, borderRadius: 10, padding: 10, marginVertical: 6 },
  codeTexte: { color: C.texte, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 * k },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  actionBtn: { backgroundColor: C.carte2, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  actionTexte: { color: C.texte, fontSize: 13 },
  point: { width: 7, height: 7, borderRadius: 4, marginHorizontal: 2 },
  barre: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 10, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: C.bord, backgroundColor: C.fond,
  },
  champ: {
    flex: 1, color: C.texte, backgroundColor: C.carte, borderRadius: 22, borderWidth: 1,
    borderColor: C.bord, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11,
    fontSize: 16 * k, maxHeight: 140,
  },
  envoyer: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  envoyerTexte: { color: C.surAccent, fontSize: 20 },
  voile: { flex: 1, flexDirection: 'row', backgroundColor: C.voile },
  panneau: { width: '82%', backgroundColor: C.fond, paddingHorizontal: 12, borderRightWidth: 1, borderRightColor: C.bord },
  panneauTete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  panneauTitre: { color: C.texte, fontSize: 20, fontWeight: 'bold' },
  nouvelleBtn: { backgroundColor: C.accent, borderRadius: 14, padding: 13, alignItems: 'center', marginBottom: 12 },
  nouvelleTexte: { color: C.surAccent, fontWeight: 'bold', fontSize: 15 },
  videTexte: { color: C.gris, textAlign: 'center', marginTop: 30 },
  convLigne: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.carte, borderRadius: 14,
    borderWidth: 1, borderColor: C.bord, padding: 10, marginBottom: 8,
  },
  convEmoji: { fontSize: 20, marginRight: 10 },
  convTitre: { color: C.texte, fontSize: 15, fontWeight: '600' },
  convDate: { color: C.gris, fontSize: 12, marginTop: 2 },
});
}
let s = creerStyles(C, 1);

function appliquerTheme(p) {
  C = THEMES[p.theme] || THEMES.noir;
  s = creerStyles(C, TAILLES[p.taille] || 1);
}
