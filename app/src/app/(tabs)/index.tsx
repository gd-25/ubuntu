import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import Animated, { SlideInUp, SlideOutUp, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarSprite, type AvatarSpots } from '@/components/avatar-sprite';
import { EpisodeTimeline } from '@/components/episode-timeline';
import { GridDots } from '@/components/grid-dots';
import { ActionGrid } from '@/components/home/action-grid';
import { CuesModal } from '@/components/home/cues-modal';
import { DodoModal } from '@/components/home/dodo-modal';
import { FeedModal } from '@/components/home/feed-modal';
import { GardeModal } from '@/components/home/garde-modal';
import { OverallModal, type MatPlacement } from '@/components/home/overall-modal';
import { SemiSoloModal } from '@/components/home/semi-solo-modal';
import { SoloPicker } from '@/components/home/solo-picker';
import { SortieModal } from '@/components/home/sortie-modal';
import { VelcroModal } from '@/components/home/velcro-modal';
import { HouseMap } from '@/components/house-map';
import { MapObject, type MapObjectKind } from '@/components/map-object';
import { StatusBadge, type AgentDisplayStatus } from '@/components/status-badge';
import { Text } from '@/components/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  formatChrono,
  formatDuration,
  formatTime,
  OBSERVED_LABELS,
  secondsSince,
} from '@/lib/format';
import {
  BASKET_HOME,
  computeTransition,
  DEFAULT_POSITIONS,
  departureTypeOf,
  FURNITURE_SPOTS,
  isOnUbuntuMat,
  isUbuntuAlone,
  MAGNET_SPOTS,
  MAP_H,
  MAP_W,
  SLOTS,
  spaceAt,
  SPACE_LABELS,
  UBUNTU_MAT_SPOT,
  type Positions,
  type Spot,
} from '@/lib/house';
import { supabase } from '@/lib/supabase';
import type {
  Activity,
  AgentHeartbeat,
  AvatarPosition,
  DepartureState,
  HumanLocation,
  ObjectPosition,
  ObservedKind,
  Person,
  Session,
  SessionSummary,
  Space,
  VocalEpisode,
} from '@/lib/types';
import { useDog } from '@/lib/use-dog';

const HEARTBEAT_FRESH_SECONDS = 120;

const AVATARS: Record<Person, { source: number; w: number; h: number; z: number }> = {
  greg: { source: require('../../../assets/images/avatars/greg.png'), w: 22, h: 30, z: 10 },
  fiona: { source: require('../../../assets/images/avatars/fio.png'), w: 24, h: 32, z: 11 },
  ubuntu: { source: require('../../../assets/images/avatars/ubuntu.png'), w: 32, h: 34, z: 20 },
};

export default function HouseScreen() {
  const colors = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { dog, person } = useDog();

  // --- État du plan ---
  const [positions, setPositions] = useState<Positions>(DEFAULT_POSITIONS);
  const [draggingAvatar, setDraggingAvatar] = useState(false);
  /** Positions des objets déplaçables (centre, unités carte). */
  const [objectPos, setObjectPos] = useState<Record<MapObjectKind, Spot>>({
    mat: UBUNTU_MAT_SPOT,
    basket: BASKET_HOME,
  });
  /** Objet en cours de drag (les points extérieurs sont alors masqués). */
  const [draggingObject, setDraggingObject] = useState<MapObjectKind | null>(null);
  // Positions au repos des trois avatars (partagées entre les sprites pour
  // qu'aucun lâcher ne retombe sur un point déjà occupé).
  const avatarSpots = useSharedValue<AvatarSpots>({
    greg: SLOTS[DEFAULT_POSITIONS.greg].greg,
    fiona: SLOTS[DEFAULT_POSITIONS.fiona].fiona,
    ubuntu: SLOTS[DEFAULT_POSITIONS.ubuntu].ubuntu,
  });
  /** Ubuntu est-il posé sur son tapis ? (pour ne compter que les arrivées) */
  const ubuntuOnMatRef = useRef(false);
  const [mapLayout, setMapLayout] = useState({ w: 0, h: 0 });

  // --- État live (agent, session, balade) ---
  const [lastHeartbeat, setLastHeartbeat] = useState<AgentHeartbeat | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [sessionEpisodes, setSessionEpisodes] = useState<VocalEpisode[]>([]);
  const [activeWalk, setActiveWalk] = useState<Activity | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // --- UI ---
  const [toast, setToast] = useState<string | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [sortieOpen, setSortieOpen] = useState(false);
  const [dodoOpen, setDodoOpen] = useState(false);
  /** Incrémenté à chaque ouverture fraîche de Dodo (reset du formulaire). */
  const [dodoOpenId, setDodoOpenId] = useState(0);
  /** Repositionnement du panier depuis Dodo : la modale se rouvre au drop. */
  const [basketPlacing, setBasketPlacing] = useState(false);
  const [cuesOpen, setCuesOpen] = useState(false);
  const [gardeOpen, setGardeOpen] = useState(false);
  const [velcroOpen, setVelcroOpen] = useState(false);
  const [semiSoloOpen, setSemiSoloOpen] = useState(false);
  /** Mode placement Overall : le tapis clignote et se laisse déplacer. */
  const [overallPlacing, setOverallPlacing] = useState(false);
  /** Tapis posé : la modale de session Overall s'ouvre sur cette position. */
  const [overallPlacement, setOverallPlacement] = useState<MatPlacement | null>(null);
  /** Mini-picker d'état au départ, affiché juste après le lancement SOLO. */
  const [soloPickerFor, setSoloPickerFor] = useState<string | null>(null);
  /** Compteurs du jour pour les objectifs (faux signaux 10/j, Overall 1/j,
      semi solo 60 min/j, minutes de solitude 15 min/j). */
  const [todayCues, setTodayCues] = useState(0);
  const [todayOveralls, setTodayOveralls] = useState(0);
  const [todaySemiSoloMinutes, setTodaySemiSoloMinutes] = useState(0);
  const [todaySoloMinutes, setTodaySoloMinutes] = useState(0);
  const [recap, setRecap] = useState<SessionSummary | null>(null);
  const [lastQuickLog, setLastQuickLog] = useState<string | null>(null);
  /** Ubuntu est seul depuis 2 s : panneau qui propose de lancer la session. */
  const [alonePrompt, setAlonePrompt] = useState(false);

  // Refs pour les callbacks async (évite les fermetures obsolètes).
  const positionsRef = useRef(positions);
  const objectPosRef = useRef(objectPos);
  const activeSessionRef = useRef(activeSession);
  const activeWalkRef = useRef(activeWalk);
  useEffect(() => {
    positionsRef.current = positions;
    objectPosRef.current = objectPos;
    activeSessionRef.current = activeSession;
    activeWalkRef.current = activeWalk;
  }, [positions, objectPos, activeSession, activeWalk]);

  // Délai de grâce avant de proposer la session (le temps de déplacer
  // les autres avatars de pièce en pièce sans déclencher le panneau).
  const aloneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (aloneTimerRef.current) clearTimeout(aloneTimerRef.current);
    },
    []
  );

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Toast auto-masqué.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ------------------------------------------------------------- Chargement

  const fetchAll = useCallback(async () => {
    if (!dog) return null;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [
      posRes,
      objectRes,
      heartbeatRes,
      sessionRes,
      walkRes,
      cuesRes,
      overallRes,
      semiSoloRes,
      soloRes,
    ] = await Promise.all([
      supabase.from('avatar_positions').select('*').eq('dog_id', dog.id),
      supabase.from('object_positions').select('*').eq('dog_id', dog.id),
      supabase
        .from('agent_heartbeats')
        .select('*')
        .eq('dog_id', dog.id)
        .order('at', { ascending: false })
        .limit(1),
      supabase
        .from('sessions')
        .select('*')
        .eq('dog_id', dog.id)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1),
      supabase
        .from('activities')
        .select('*')
        .eq('dog_id', dog.id)
        .eq('kind', 'walk')
        .is('ended_at', null)
        .order('at', { ascending: false })
        .limit(1),
      supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .eq('dog_id', dog.id)
        .eq('kind', 'fake_cue')
        .gte('at', todayStart.toISOString()),
      supabase
        .from('overall_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('dog_id', dog.id)
        .gte('at', todayStart.toISOString()),
      supabase
        .from('semi_solo_sessions')
        .select('started_at, ended_at')
        .eq('dog_id', dog.id)
        .gte('started_at', todayStart.toISOString()),
      supabase
        .from('sessions')
        .select('started_at, ended_at')
        .eq('dog_id', dog.id)
        .gte('started_at', todayStart.toISOString()),
    ]);

    const session = (sessionRes.data?.[0] as Session | undefined) ?? null;
    let episodes: VocalEpisode[] = [];
    if (session) {
      const { data } = await supabase
        .from('vocal_episodes')
        .select('*')
        .eq('session_id', session.id)
        .order('started_at', { ascending: true });
      episodes = (data as VocalEpisode[] | null) ?? [];
    }

    const positionRows = (posRes.data as AvatarPosition[] | null) ?? [];
    const nextPositions = { ...DEFAULT_POSITIONS };
    for (const row of positionRows) nextPositions[row.person] = row.space;

    // Objets : ne JAMAIS retomber sur les positions par défaut sur une
    // erreur réseau (le tapis/panier se téléporterait chez lui) — on ne
    // remplace l'état que si la requête a vraiment répondu.
    let nextObjects: Record<MapObjectKind, Spot> | null = null;
    if (!objectRes.error) {
      nextObjects = { mat: UBUNTU_MAT_SPOT, basket: BASKET_HOME };
      for (const row of (objectRes.data as ObjectPosition[] | null) ?? []) {
        nextObjects[row.object] = { x: Number(row.x), y: Number(row.y) };
      }
    }

    // Minutes de solitude cumulées aujourd'hui (sessions en cours comprises).
    const nowMs = Date.now();
    const soloSeconds = ((soloRes.data as { started_at: string; ended_at: string | null }[] | null) ?? [])
      .reduce((sum, s) => {
        const end = s.ended_at ? new Date(s.ended_at).getTime() : nowMs;
        return sum + Math.max(0, end - new Date(s.started_at).getTime()) / 1000;
      }, 0);

    // Minutes de semi solo cumulées aujourd'hui (objectif 1 h/jour).
    const semiSoloSeconds = ((semiSoloRes.data as { started_at: string; ended_at: string }[] | null) ?? [])
      .reduce(
        (sum, s) =>
          sum + Math.max(0, new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000,
        0
      );

    return {
      positions: nextPositions,
      objects: nextObjects,
      heartbeat: (heartbeatRes.data?.[0] as AgentHeartbeat | undefined) ?? null,
      session,
      episodes,
      walk: (walkRes.data?.[0] as Activity | undefined) ?? null,
      todayCues: cuesRes.count ?? 0,
      todayOveralls: overallRes.count ?? 0,
      todaySemiSoloMinutes: Math.round(semiSoloSeconds / 60),
      todaySoloMinutes: Math.round(soloSeconds / 60),
    };
  }, [dog]);

  useFocusEffect(
    useCallback(() => {
      let ignore = false;
      fetchAll().then((snapshot) => {
        if (ignore || !snapshot) return;
        setPositions(snapshot.positions);
        if (snapshot.objects) setObjectPos(snapshot.objects);
        setLastHeartbeat(snapshot.heartbeat);
        setActiveSession(snapshot.session);
        if (snapshot.session) setAlonePrompt(false);
        setSessionEpisodes(snapshot.episodes);
        setActiveWalk(snapshot.walk);
        setTodayCues(snapshot.todayCues);
        setTodayOveralls(snapshot.todayOveralls);
        setTodaySemiSoloMinutes(snapshot.todaySemiSoloMinutes);
        setTodaySoloMinutes(snapshot.todaySoloMinutes);
      });
      return () => {
        ignore = true;
      };
    }, [fetchAll])
  );

  // ------------------------------------------------------------- Realtime

  useEffect(() => {
    if (!dog) return;
    const channel = supabase
      .channel(`house-${dog.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'avatar_positions', filter: `dog_id=eq.${dog.id}` },
        (payload) => {
          const row = payload.new as AvatarPosition;
          if (!row?.person) return;
          setPositions((prev) => {
            if (prev[row.person] === row.space) return prev;
            // Déplacé depuis l'autre téléphone : l'avatar repart sur
            // l'ancrage de zone, donc Ubuntu n'est plus sur son tapis.
            if (row.person === 'ubuntu') ubuntuOnMatRef.current = false;
            return { ...prev, [row.person]: row.space };
          });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'object_positions', filter: `dog_id=eq.${dog.id}` },
        (payload) => {
          const row = payload.new as ObjectPosition;
          if (!row?.object) return;
          setObjectPos((prev) => ({ ...prev, [row.object]: { x: Number(row.x), y: Number(row.y) } }));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'vocal_episodes', filter: `dog_id=eq.${dog.id}` },
        (payload) => {
          const episode = payload.new as VocalEpisode;
          setSessionEpisodes((prev) => {
            if (prev.some((e) => e.id === episode.id)) return prev;
            const session = activeSessionRef.current;
            if (!session || episode.session_id !== session.id) return prev;
            return [...prev, episode];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'vocal_episodes', filter: `dog_id=eq.${dog.id}` },
        (payload) => {
          const episode = payload.new as VocalEpisode;
          setSessionEpisodes((prev) => prev.map((e) => (e.id === episode.id ? episode : e)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_heartbeats', filter: `dog_id=eq.${dog.id}` },
        (payload) => setLastHeartbeat(payload.new as AgentHeartbeat)
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `dog_id=eq.${dog.id}` },
        (payload) => {
          // Session ouverte/fermée depuis l'autre téléphone → resynchronise.
          const session = payload.new as Session;
          if (!session?.id) return;
          if (session.ended_at === null) {
            setActiveSession(session);
            setAlonePrompt(false);
          } else {
            setActiveSession((prev) => (prev && prev.id === session.id ? null : prev));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [dog]);

  // ------------------------------------------------------------- Actions

  const showToast = useCallback((message: string) => setToast(message), []);

  const persistPosition = useCallback(
    async (person: Person, space: Space) => {
      if (!dog) return;
      const { error } = await supabase.from('avatar_positions').upsert(
        { dog_id: dog.id, person, space, updated_at: new Date().toISOString() },
        { onConflict: 'dog_id,person' }
      );
      if (error) console.warn('Sync de la position impossible :', error.message);
    },
    [dog]
  );

  /** Ubuntu vient d'arriver sur son tapis : on trace la visite. */
  const logMatVisit = useCallback(async () => {
    if (!dog) return;
    const { error } = await supabase
      .from('activities')
      .insert({ dog_id: dog.id, kind: 'mat', at: new Date().toISOString() });
    if (error) {
      console.warn('Visite du tapis non enregistrée :', error.message);
      return;
    }
    showToast('🐾 TAPIS ! VISITE NOTÉE');
  }, [dog, showToast]);

  const startWalk = useCallback(async () => {
    if (!dog) return;
    const { data, error } = await supabase
      .from('activities')
      .insert({ dog_id: dog.id, kind: 'walk', at: new Date().toISOString() })
      .select()
      .single();
    if (error) {
      Alert.alert('Erreur', `Balade non enregistrée : ${error.message}`);
      return;
    }
    setActiveWalk(data as Activity);
    showToast('🚶 BALADE DÉMARRÉE !');
  }, [dog, showToast]);

  const endWalk = useCallback(async () => {
    if (!dog) return;
    let walk = activeWalkRef.current;
    if (!walk) {
      const { data } = await supabase
        .from('activities')
        .select('*')
        .eq('dog_id', dog.id)
        .eq('kind', 'walk')
        .is('ended_at', null)
        .order('at', { ascending: false })
        .limit(1);
      walk = (data?.[0] as Activity | undefined) ?? null;
    }
    if (!walk) return;
    const endedAt = new Date().toISOString();
    const { error } = await supabase
      .from('activities')
      .update({ ended_at: endedAt })
      .eq('id', walk.id);
    if (error) {
      Alert.alert('Erreur', `Fin de balade non enregistrée : ${error.message}`);
      return;
    }
    setActiveWalk(null);
    showToast(`🏠 RETOUR DE BALADE (${formatDuration(secondsSince(walk.at))})`);
  }, [dog, showToast]);

  // Une session lancée est TOUJOURS une vraie session « seul » : on ne
  // déduit plus semi-seul/seul de la position des avatars.
  const startSession = useCallback(async () => {
    if (!dog || activeSessionRef.current) return;
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        dog_id: dog.id,
        trigger: 'manual',
        started_at: new Date().toISOString(),
        solitude_type: 'away',
        departure_type: departureTypeOf(positionsRef.current),
        is_exercise: true,
      })
      .select()
      .single();
    if (error) {
      Alert.alert('Erreur', `Session non démarrée : ${error.message}`);
      return;
    }
    const session = data as Session;
    setActiveSession(session);
    setSessionEpisodes([]);
    setRecap(null);
    // L'état d'Ubuntu au départ se capture au moment T, en un seul tap.
    setSoloPickerFor(session.id);
    showToast('🔴 SESSION : UBUNTU SEUL À LA MAISON');
  }, [dog, showToast]);

  /** Bouton SOLO : lancement instantané, confirmation haptique immédiate. */
  const startSolo = useCallback(() => {
    if (activeSessionRef.current) {
      showToast('⚠️ UNE SESSION EST DÉJÀ EN COURS');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setAlonePrompt(false);
    startSession();
  }, [startSession, showToast]);

  /** Mini-picker post-SOLO, question 1 : état d'Ubuntu au moment du départ.
      Le panneau reste ouvert pour la question 2 (il se ferme tout seul). */
  const pickDepartureState = useCallback(
    async (state: DepartureState) => {
      const sessionId = soloPickerFor;
      if (!sessionId) return;
      Haptics.selectionAsync();
      setActiveSession((prev) =>
        prev && prev.id === sessionId ? { ...prev, departure_state: state } : prev
      );
      const { error } = await supabase
        .from('sessions')
        .update({ departure_state: state })
        .eq('id', sessionId);
      if (error) console.warn("État au départ non enregistré :", error.message);
    },
    [soloPickerFor]
  );

  /** Mini-picker post-SOLO, question 2 : où sera l'humain pendant la
      session. Déplace aussi SON avatar sur le plan : couloir → palier (en
      bas), en bas / dehors → sentier (en haut). */
  const pickHumanLocation = useCallback(
    async (location: HumanLocation) => {
      const sessionId = soloPickerFor;
      if (!sessionId) return;
      Haptics.selectionAsync();
      const targetSpace: Space = location === 'couloir' ? 'couloir_ext' : 'dehors';
      setPositions((prev) => ({ ...prev, [person]: targetSpace }));
      persistPosition(person, targetSpace);
      setActiveSession((prev) =>
        prev && prev.id === sessionId ? { ...prev, human_location: location } : prev
      );
      const { error } = await supabase
        .from('sessions')
        .update({ human_location: location })
        .eq('id', sessionId);
      if (error) console.warn('Position humaine non enregistrée :', error.message);
    },
    [soloPickerFor, person, persistPosition]
  );

  /**
   * TERMINER, immédiat : haptic + panneau fermé tout de suite, la clôture
   * (edge function + récap) se fait en arrière-plan. Les humains gardent
   * leur position — on ne replace plus personne.
   */
  const stopSession = useCallback(() => {
    const session = activeSessionRef.current;
    if (!session) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setActiveSession(null);
    setSessionEpisodes([]);
    setLastQuickLog(null);
    setSoloPickerFor(null);
    showToast('🟢 SESSION TERMINÉE');
    (async () => {
      const { error } = await supabase.functions.invoke('close-session', {
        body: { session_id: session.id },
      });
      if (error) {
        // La clôture a échoué : on restaure le panneau pour réessayer.
        setActiveSession(session);
        showToast('⚠️ CLÔTURE IMPOSSIBLE — RÉESSAYEZ');
        return;
      }
      // Récap seulement pour les vraies absences (≥ 10 min) — les micro
      // sorties n'en ont pas besoin.
      if (secondsSince(session.started_at) < 600) return;
      const { data: summary } = await supabase
        .from('session_summaries')
        .select('*')
        .eq('session_id', session.id)
        .maybeSingle();
      setRecap((summary as SessionSummary | null) ?? null);
    })();
  }, [showToast]);

  /** Toggle exercice / absence subie sur la session en cours (optimiste). */
  const setExercise = useCallback(async (isExercise: boolean) => {
    const session = activeSessionRef.current;
    if (!session || session.is_exercise === isExercise) return;
    Haptics.selectionAsync();
    setActiveSession((prev) => (prev ? { ...prev, is_exercise: isExercise } : prev));
    const { error } = await supabase
      .from('sessions')
      .update({ is_exercise: isExercise })
      .eq('id', session.id);
    if (error) console.warn('Toggle exercice non enregistré :', error.message);
  }, []);

  /** Un avatar vient d'être lâché dans une zone (geste local uniquement). */
  const handleDrop = useCallback(
    (person: Person, space: Space, x: number, y: number) => {
      // Gros haptique à CHAQUE lâcher (les petits accompagnent le drag).
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      // Tapis d'Ubuntu : chaque ARRIVÉE sur le tapis compte une visite
      // (pas les re-lâchers dessus, ni les autres avatars) — où que le
      // tapis soit posé sur le plan.
      if (person === 'ubuntu') {
        const onMat = isOnUbuntuMat(x, y, objectPosRef.current.mat);
        if (onMat && !ubuntuOnMatRef.current) logMatVisit();
        ubuntuOnMatRef.current = onMat;
      }
      const prev = positionsRef.current;
      if (prev[person] === space) return;
      const next = { ...prev, [person]: space };
      setPositions(next);
      persistPosition(person, space);

      const transition = computeTransition(prev, next);
      if (transition.walkStarted) startWalk();
      if (transition.walkEnded) endWalk();
      // Ubuntu seul depuis 2 s : on PROPOSE la session (panneau en haut),
      // elle ne démarre qu'après confirmation.
      if (transition.aloneStarted && !activeSessionRef.current) {
        if (aloneTimerRef.current) clearTimeout(aloneTimerRef.current);
        aloneTimerRef.current = setTimeout(() => {
          aloneTimerRef.current = null;
          const current = positionsRef.current;
          if (!isUbuntuAlone(current) || activeSessionRef.current) return;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setAlonePrompt(true);
        }, 2000);
      }
      if (transition.aloneEnded) {
        if (aloneTimerRef.current) {
          clearTimeout(aloneTimerRef.current);
          aloneTimerRef.current = null;
        }
        setAlonePrompt(false);
        if (activeSessionRef.current) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          stopSession();
        }
      }
    },
    [persistPosition, startWalk, endWalk, stopSession, logMatVisit]
  );

  const confirmSession = useCallback(() => {
    setAlonePrompt(false);
    const current = positionsRef.current;
    if (!isUbuntuAlone(current) || activeSessionRef.current) return;
    startSession();
  }, [startSession]);

  const handleHover = useCallback((space: Space | null) => {
    if (space) Haptics.selectionAsync();
  }, []);

  // ------------------------------------------- Objets déplaçables du plan

  /** Lâcher du tapis ou du panier : position persistée + suites de flux
      (modale Overall après placement du tapis, réouverture de Dodo après
      repositionnement du panier). */
  const handleObjectDropped = useCallback(
    (object: MapObjectKind, x: number, y: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setObjectPos((prev) => ({ ...prev, [object]: { x, y } }));
      if (dog) {
        supabase
          .from('object_positions')
          .upsert(
            { dog_id: dog.id, object, x, y, updated_at: new Date().toISOString() },
            { onConflict: 'dog_id,object' }
          )
          .then(({ error }) => {
            if (error) console.warn("Sync de l'objet impossible :", error.message);
          });
      }
      if (object === 'mat' && overallPlacing) {
        setOverallPlacement({ x, y, space: spaceAt(x, y) });
      }
      if (object === 'basket' && basketPlacing) {
        setBasketPlacing(false);
        setDodoOpen(true);
      }
    },
    [dog, overallPlacing, basketPlacing]
  );

  // ------------------------------------------------- Placement Overall

  /** Bouton OVERALL : le tapis clignote, on le pose là où il sera (la
      bannière de placement porte la consigne — pas de toast en doublon). */
  const startOverallPlacing = useCallback(() => {
    Haptics.selectionAsync();
    setOverallPlacing(true);
  }, []);

  /** Fin (enregistrée ou annulée) : le tapis reste où il a été posé. */
  const closeOverall = useCallback(() => {
    setOverallPlacement(null);
    setOverallPlacing(false);
  }, []);

  // ------------------------------------------- Repositionnement du panier

  /** Depuis Dodo : fermer la modale, faire clignoter le panier ; elle se
      rouvrira (état conservé) au lâcher. */
  const startBasketPlacing = useCallback(() => {
    Haptics.selectionAsync();
    setDodoOpen(false);
    setBasketPlacing(true);
  }, []);

  const cancelBasketPlacing = useCallback(() => {
    setBasketPlacing(false);
    setDodoOpen(true);
  }, []);

  /** Bouton DODO : ouverture fraîche (formulaire réinitialisé). */
  const openDodo = useCallback(() => {
    setDodoOpenId((n) => n + 1);
    setDodoOpen(true);
  }, []);

  const logManualWhine = useCallback(async () => {
    const session = activeSessionRef.current;
    if (!dog || !session) return;
    const nowDate = new Date();
    const { error } = await supabase.from('vocal_episodes').insert({
      dog_id: dog.id,
      session_id: session.id,
      started_at: new Date(nowDate.getTime() - 5000).toISOString(),
      ended_at: nowDate.toISOString(),
      kind: 'whine',
      source: 'manual',
    });
    if (error) {
      Alert.alert('Erreur', `Impossible d'enregistrer : ${error.message}`);
      return;
    }
    setLastQuickLog(`😢 Couinement noté à ${formatTime(nowDate.toISOString())}`);
  }, [dog]);

  const logObservation = useCallback(
    async (kind: ObservedKind) => {
      const session = activeSessionRef.current;
      if (!dog || !session) return;
      const at = new Date().toISOString();
      const { error } = await supabase
        .from('observed_events')
        .insert({ dog_id: dog.id, session_id: session.id, kind, at });
      if (error) {
        Alert.alert('Erreur', `Impossible d'enregistrer : ${error.message}`);
        return;
      }
      setLastQuickLog(`${OBSERVED_LABELS[kind]} noté à ${formatTime(at)}`);
    },
    [dog]
  );

  // ------------------------------------------------------------- Dérivés

  const agentStatus: AgentDisplayStatus = useMemo(() => {
    if (!lastHeartbeat) return 'unknown';
    if (secondsSince(lastHeartbeat.at, now) > HEARTBEAT_FRESH_SECONDS) return 'stale';
    return lastHeartbeat.status;
  }, [lastHeartbeat, now]);

  const totalVocalSeconds = useMemo(
    () =>
      sessionEpisodes.reduce(
        (sum, e) =>
          sum + (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 1000,
        0
      ),
    [sessionEpisodes]
  );

  // Échelle carte → écran : la carte remplit l'espace disponible sans déformation.
  const scale =
    mapLayout.w > 0 && mapLayout.h > 0
      ? Math.min(mapLayout.w / MAP_W, mapLayout.h / MAP_H)
      : 0;
  const mapHeight = MAP_H * scale;

  // Les panneaux et dialogues s'affichent tous en haut, dans l'espace vert
  // au-dessus des arbres (sous le badge caméra).
  const panelTop = insets.top + 40;

  // ------------------------------------------------------------- Rendu

  return (
    <View style={[styles.screen, { backgroundColor: scheme === 'dark' ? '#38583A' : '#78C050' }]}>
      <View
        style={styles.mapWrapper}
        onLayout={(e) =>
          setMapLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }>
        {scale > 0 ? (
          <View style={{ width: MAP_W * scale, height: mapHeight, alignSelf: 'center' }}>
            <HouseMap night={scheme === 'dark'} />

            {/* Points aimantés pendant un drag : tous pour un avatar,
                intérieur autorisé seulement pour le tapis et le panier */}
            {draggingAvatar || draggingObject ? (
              <GridDots
                night={scheme === 'dark'}
                spots={draggingAvatar ? MAGNET_SPOTS : FURNITURE_SPOTS}
              />
            ) : null}

            {/* Objets déplaçables (toujours sous les personnages) : le
                tapis d'Ubuntu et son panier bleu */}
            <MapObject
              kind="mat"
              pos={objectPos.mat}
              otherPos={objectPos.basket}
              scale={scale}
              night={scheme === 'dark'}
              blinking={overallPlacing && !overallPlacement}
              onDragChange={(dragging) => setDraggingObject(dragging ? 'mat' : null)}
              onDropped={(x, y) => handleObjectDropped('mat', x, y)}
            />
            <MapObject
              kind="basket"
              pos={objectPos.basket}
              otherPos={objectPos.mat}
              scale={scale}
              night={scheme === 'dark'}
              blinking={basketPlacing}
              onDragChange={(dragging) => setDraggingObject(dragging ? 'basket' : null)}
              onDropped={(x, y) => handleObjectDropped('basket', x, y)}
            />

            {/* Avatars */}
            {(Object.keys(AVATARS) as Person[]).map((person) => (
              <AvatarSprite
                key={person}
                person={person}
                source={AVATARS[person].source}
                space={positions[person]}
                scale={scale}
                width={AVATARS[person].w}
                height={AVATARS[person].h}
                zIndex={AVATARS[person].z}
                spots={avatarSpots}
                onDropped={handleDrop}
                onHoverSpace={handleHover}
                onDragChange={setDraggingAvatar}
              />
            ))}

            {/* Badge balade en cours */}
            {activeWalk ? (
              <View
                style={[
                  styles.walkBadge,
                  { backgroundColor: colors.card, borderColor: colors.border, top: 40 * scale },
                ]}>
                <Text style={[styles.walkBadgeText, { color: colors.text }]}>
                  🚶 EN BALADE · {formatChrono(secondsSince(activeWalk.at, now))}
                </Text>
              </View>
            ) : null}

          </View>
        ) : null}
      </View>

      {/* Statut de la caméra, en haut à droite de l'écran */}
      <View
        pointerEvents="none"
        style={[styles.cameraBadge, { top: insets.top + 6, right: Spacing.md }]}>
        <StatusBadge status={agentStatus} />
      </View>

      {/* Toast rétro — au niveau du badge caméra, au-dessus des panneaux
          (le mini-picker d'état au départ vit juste en dessous) */}
      {toast ? (
        <Animated.View
          entering={SlideInUp.duration(220)}
          exiting={SlideOutUp.duration(160)}
          style={[
            styles.toast,
            { top: insets.top + 6, backgroundColor: colors.card, borderColor: colors.border },
          ]}>
          <Text style={[styles.toastText, { color: colors.text }]}>{toast}</Text>
        </Animated.View>
      ) : null}

      {/* L'outil de travail : les 7 actions, dans l'espace vert
          (masqué quand un panneau occupe le haut de l'écran) */}
      {!activeSession && !alonePrompt && !soloPickerFor && !overallPlacing && !basketPlacing ? (
        <View style={[styles.actionsWrap, { top: panelTop }]}>
          <ActionGrid
            onSolo={startSolo}
            onFeed={() => setFeedOpen(true)}
            onSortie={() => setSortieOpen(true)}
            onDodo={openDodo}
            onVelcro={() => setVelcroOpen(true)}
            onCues={() => setCuesOpen(true)}
            onOverall={startOverallPlacing}
            onSemiSolo={() => setSemiSoloOpen(true)}
            onGarde={() => setGardeOpen(true)}
            todayCues={todayCues}
            todayOveralls={todayOveralls}
            todaySemiSoloMinutes={todaySemiSoloMinutes}
            todaySoloMinutes={todaySoloMinutes}
          />
        </View>
      ) : null}

      {/* Repositionnement du panier (depuis Dodo) : consigne + annulation */}
      {basketPlacing ? (
        <Animated.View
          entering={SlideInUp.duration(240)}
          exiting={SlideOutUp.duration(160)}
          style={[
            styles.placingBanner,
            {
              top: panelTop,
              backgroundColor: colors.card,
              borderColor: colors.border,
              boxShadow: `4px 4px 0px 0px ${colors.border}`,
            },
          ]}>
          <Text style={[styles.placingText, { color: colors.text }]}>
            🧺 GLISSEZ LE PANIER LÀ OÙ IL A DORMI — LA MODALE REVIENDRA
          </Text>
          <Pressable onPress={cancelBasketPlacing} hitSlop={8}>
            <Text style={[styles.placingCancel, { color: colors.textSecondary }]}>ANNULER</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Placement Overall en cours : consigne + annulation */}
      {overallPlacing && !overallPlacement ? (
        <Animated.View
          entering={SlideInUp.duration(240)}
          exiting={SlideOutUp.duration(160)}
          style={[
            styles.placingBanner,
            {
              top: panelTop,
              backgroundColor: colors.card,
              borderColor: colors.border,
              boxShadow: `4px 4px 0px 0px ${colors.border}`,
            },
          ]}>
          <Text style={[styles.placingText, { color: colors.text }]}>
            🐾 GLISSEZ LE TAPIS LÀ OÙ VOUS LE POSEZ POUR LA SESSION
          </Text>
          <Pressable onPress={closeOverall} hitSlop={8}>
            <Text style={[styles.placingCancel, { color: colors.textSecondary }]}>ANNULER</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Mini-picker d'état au départ (un seul tap, juste après SOLO) —
          descendu pour laisser la place au toast au niveau du badge */}
      {soloPickerFor ? (
        <SoloPicker
          top={panelTop + 22}
          person={person}
          onPickState={pickDepartureState}
          onPickLocation={pickHumanLocation}
          onDismiss={() => setSoloPickerFor(null)}
        />
      ) : null}

      {/* Proposition de session : Ubuntu est seul depuis 2 s, on demande
          avant de lancer (panneau en haut, au-dessus des arbres) */}
      {alonePrompt && !activeSession ? (
        <Animated.View
          entering={SlideInUp.duration(260)}
          exiting={SlideOutUp.duration(160)}
          style={[
            styles.sessionPanel,
            {
              top: panelTop,
              backgroundColor: colors.card,
              borderColor: colors.border,
              boxShadow: `4px 4px 0px 0px ${colors.border}`,
            },
          ]}>
          <Text style={[styles.sessionTitle, { color: colors.accent }]}>
            ● UBUNTU EST SEUL
          </Text>
          <Text style={[styles.sessionDetail, { color: colors.textSecondary }]}>
            Ubuntu est resté : {SPACE_LABELS[positions.ubuntu]}. Lancer la session ?
          </Text>
          <View style={styles.dialogButtons}>
            <Pressable
              onPress={() => setAlonePrompt(false)}
              style={[styles.dialogButton, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={[styles.dialogButtonText, { color: colors.text }]}>IGNORER</Text>
            </Pressable>
            <Pressable
              onPress={confirmSession}
              style={[styles.dialogButton, { backgroundColor: colors.accent, borderColor: colors.border }]}>
              <Text style={[styles.dialogButtonText, { color: colors.accentText }]}>DÉMARRER</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {/* Panneau session en cours (boîte de dialogue Pokémon, en haut) —
          laisse la place au mini-picker d'état au départ juste après SOLO */}
      {activeSession && !soloPickerFor ? (
        <Animated.View
          entering={SlideInUp.duration(260)}
          style={[
            styles.sessionPanel,
            {
              top: panelTop,
              backgroundColor: colors.card,
              borderColor: colors.border,
              boxShadow: `4px 4px 0px 0px ${colors.border}`,
            },
          ]}>
          <View style={styles.sessionHeader}>
            <Text style={[styles.sessionTitle, { color: colors.accent }]}>
              {activeSession.solitude_type === 'in_home' ? '● SEMI-SEUL (AUTRE PIÈCE)' : '● SEUL'}
            </Text>
            <Text style={[styles.sessionChrono, { color: colors.text }]}>
              {formatChrono(secondsSince(activeSession.started_at, now))}
            </Text>
          </View>
          <Text style={[styles.sessionDetail, { color: colors.textSecondary }]}>
            Départ {formatTime(activeSession.started_at)} · vocal{' '}
            {formatDuration(totalVocalSeconds)} · {sessionEpisodes.length} épisode
            {sessionEpisodes.length > 1 ? 's' : ''}
          </Text>
          <EpisodeTimeline
            episodes={sessionEpisodes}
            sessionStart={activeSession.started_at}
            sessionEnd={null}
            nowMs={now}
            showLegend={false}
          />
          {/* Exercice d'entraînement ou absence subie (courses…) ? Les
              absences subies sont filtrables dans les stats. */}
          <View style={styles.exerciseRow}>
            <Pressable
              onPress={() => setExercise(true)}
              style={[
                styles.exerciseChip,
                {
                  backgroundColor: activeSession.is_exercise ? colors.accent : colors.background,
                  borderColor: colors.border,
                },
              ]}>
              <Text
                style={[
                  styles.exerciseChipText,
                  { color: activeSession.is_exercise ? colors.accentText : colors.text },
                ]}>
                🎯 EXERCICE
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setExercise(false)}
              style={[
                styles.exerciseChip,
                {
                  backgroundColor: !activeSession.is_exercise ? colors.accent : colors.background,
                  borderColor: colors.border,
                },
              ]}>
              <Text
                style={[
                  styles.exerciseChipText,
                  { color: !activeSession.is_exercise ? colors.accentText : colors.text },
                ]}>
                🛒 SUBIE
              </Text>
            </Pressable>
          </View>
          <View style={styles.quickRow}>
            <QuickChip label="😢" onPress={logManualWhine} />
            <QuickChip label="😌" onPress={() => logObservation('relief')} />
            <QuickChip label="😰" onPress={() => logObservation('panic')} />
            <Pressable
              onPress={stopSession}
              style={[styles.stopChip, { backgroundColor: colors.danger, borderColor: colors.border }]}>
              <Text style={[styles.stopChipText, { color: colors.accentText }]}>TERMINER</Text>
            </Pressable>
          </View>
          {lastQuickLog ? (
            <Text style={[styles.sessionDetail, { color: colors.textSecondary }]}>
              {lastQuickLog}
            </Text>
          ) : null}
        </Animated.View>
      ) : null}

      {/* Les modales des actions du quotidien */}
      <FeedModal
        visible={feedOpen}
        topOffset={panelTop}
        dogId={dog?.id ?? null}
        onClose={() => setFeedOpen(false)}
        onSaved={showToast}
      />
      <SortieModal
        visible={sortieOpen}
        topOffset={panelTop}
        dogId={dog?.id ?? null}
        onClose={() => setSortieOpen(false)}
        onSaved={showToast}
      />
      <DodoModal
        visible={dodoOpen}
        openId={dodoOpenId}
        topOffset={panelTop}
        dogId={dog?.id ?? null}
        basketPos={objectPos.basket}
        onRepositionBasket={startBasketPlacing}
        onClose={() => setDodoOpen(false)}
        onSaved={showToast}
      />
      <CuesModal
        visible={cuesOpen}
        topOffset={panelTop}
        dogId={dog?.id ?? null}
        todayCount={todayCues}
        onClose={() => setCuesOpen(false)}
        onSaved={(message) => {
          setTodayCues((n) => n + 1);
          showToast(message);
        }}
      />
      <OverallModal
        visible={!!overallPlacement}
        topOffset={panelTop}
        dogId={dog?.id ?? null}
        placement={overallPlacement}
        todayCount={todayOveralls}
        onClose={closeOverall}
        onSaved={(message) => {
          setTodayOveralls((n) => n + 1);
          showToast(message);
        }}
      />
      <GardeModal
        visible={gardeOpen}
        topOffset={panelTop}
        dogId={dog?.id ?? null}
        onClose={() => setGardeOpen(false)}
        onSaved={showToast}
      />
      <VelcroModal
        visible={velcroOpen}
        topOffset={panelTop}
        dogId={dog?.id ?? null}
        onClose={() => setVelcroOpen(false)}
        onSaved={showToast}
      />
      <SemiSoloModal
        visible={semiSoloOpen}
        topOffset={panelTop}
        dogId={dog?.id ?? null}
        todayMinutes={todaySemiSoloMinutes}
        onClose={() => setSemiSoloOpen(false)}
        onSaved={(message, minutes) => {
          setTodaySemiSoloMinutes((n) => n + minutes);
          showToast(message);
        }}
      />

      {/* Récap de fin de session */}
      <Modal visible={!!recap} transparent animationType="fade" onRequestClose={() => setRecap(null)}>
        <View style={[styles.modalBackdrop, { paddingTop: panelTop }]}>
          {recap ? (
            // Pas d'entering Reanimated dans une Modal native (peut rester
            // bloqué invisible) — le fade de la Modal suffit.
            <View
              style={[
                styles.dialog,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  boxShadow: `5px 5px 0px 0px ${colors.border}`,
                },
              ]}>
              <Text style={[styles.dialogTitle, { color: colors.text }]}>RÉCAP SESSION</Text>
              <RecapRow
                label="DURÉE"
                value={
                  recap.ended_at
                    ? formatDuration(
                        (new Date(recap.ended_at).getTime() - new Date(recap.started_at).getTime()) /
                          1000
                      )
                    : '—'
                }
              />
              <RecapRow label="TEMPS VOCALISÉ" value={formatDuration(recap.total_vocal_seconds)} />
              <RecapRow label="ÉPISODES" value={String(recap.episode_count)} />
              <RecapRow label="CALME" value={`${Math.round(recap.calm_percent)} %`} />
              <View style={styles.dialogButtons}>
                <Pressable
                  onPress={() => {
                    const id = recap.session_id;
                    setRecap(null);
                    router.push({ pathname: '/session/[id]', params: { id } });
                  }}
                  style={[styles.dialogButton, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.dialogButtonText, { color: colors.text }]}>DÉTAIL</Text>
                </Pressable>
                <Pressable
                  onPress={() => setRecap(null)}
                  style={[styles.dialogButton, { backgroundColor: colors.accent, borderColor: colors.border }]}>
                  <Text style={[styles.dialogButtonText, { color: colors.accentText }]}>OK !</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function QuickChip({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickChip,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
          opacity: pressed ? 0.6 : 1,
        },
      ]}>
      <Text style={styles.quickChipText}>{label}</Text>
    </Pressable>
  );
}

function RecapRow({ label, value }: { label: string; value: string }) {
  const colors = useTheme();
  return (
    <View style={styles.recapRow}>
      <Text style={[styles.recapLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.recapValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  // Carte ancrée en bas : le couloir extérieur touche la tab bar, l'éventuel
  // surplus part dans l'herbe du haut (fond vert assorti).
  mapWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cameraBadge: {
    position: 'absolute',
  },
  walkBadge: {
    position: 'absolute',
    alignSelf: 'center',
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  walkBadgeText: {
    fontSize: 8,
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    borderWidth: 3,
    borderRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: '86%',
    zIndex: 200,
  },
  toastText: {
    fontSize: 9,
    lineHeight: 15,
    textAlign: 'center',
  },
  // L'outil de travail (SOLO + 6 boutons), dans l'espace vert.
  actionsWrap: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 110,
  },
  placingBanner: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    borderWidth: 3,
    borderRadius: 2,
    padding: Spacing.md,
    gap: Spacing.sm,
    alignItems: 'center',
    zIndex: 120,
  },
  placingText: {
    fontSize: 8,
    lineHeight: 13,
    textAlign: 'center',
  },
  placingCancel: {
    fontSize: 8,
    marginTop: 2,
  },
  // Panneau ancré en haut de l'écran (le `top` exact dépend des insets).
  // Padding vertical généreux : les chips emoji ne doivent jamais déborder.
  sessionPanel: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    borderWidth: 3,
    borderRadius: 2,
    padding: Spacing.md,
    paddingBottom: Spacing.md + 2,
    gap: 10,
    zIndex: 120,
  },
  exerciseRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  exerciseChip: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 2,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseChipText: {
    fontSize: 7,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sessionTitle: {
    fontSize: 9,
    flexShrink: 1,
  },
  sessionChrono: {
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  sessionDetail: {
    fontSize: 7,
    lineHeight: 12,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  // Hauteur FIXE et contenu centré : les emojis ne débordent plus des chips.
  quickChip: {
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 10,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipText: {
    fontSize: 13,
    lineHeight: 18,
  },
  stopChip: {
    marginLeft: 'auto',
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 10,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopChipText: {
    fontSize: 8,
  },
  // Dialogues alignés en haut (dans l'espace vert au-dessus des arbres).
  modalBackdrop: {
    flex: 1,
    backgroundColor: '#00000066',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: Spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 3,
    borderRadius: 2,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  dialogTitle: {
    fontSize: 12,
    marginBottom: 2,
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: 2,
  },
  dialogButton: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dialogButtonText: {
    fontSize: 9,
  },
  recapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  recapLabel: {
    fontSize: 8,
  },
  recapValue: {
    fontSize: 9,
  },
});
