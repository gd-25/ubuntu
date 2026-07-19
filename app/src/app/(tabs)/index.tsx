import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, View, useColorScheme } from 'react-native';
import Animated, {
  SlideInUp,
  SlideOutUp,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AvatarSprite } from '@/components/avatar-sprite';
import { EpisodeTimeline } from '@/components/episode-timeline';
import { GridDots } from '@/components/grid-dots';
import { HouseMap } from '@/components/house-map';
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
  computeTransition,
  DEFAULT_POSITIONS,
  isUbuntuAlone,
  MAP_H,
  MAP_W,
  SLOTS,
  solitudeTypeOf,
  SPACE_LABELS,
  type Positions,
} from '@/lib/house';
import { supabase } from '@/lib/supabase';
import type {
  Activity,
  AgentHeartbeat,
  AvatarPosition,
  ObservedKind,
  Person,
  Session,
  SessionSummary,
  Space,
  VocalEpisode,
} from '@/lib/types';
import { useDog } from '@/lib/use-dog';

const HEARTBEAT_FRESH_SECONDS = 120;

// Tailles en unités carte, réduites de 1,2× pour mieux tenir dans les pièces.
const AVATARS: Record<Person, { source: number; w: number; h: number; z: number }> = {
  greg: { source: require('../../../assets/images/avatars/greg.png'), w: 18, h: 25, z: 10 },
  fiona: { source: require('../../../assets/images/avatars/fio.png'), w: 20, h: 27, z: 11 },
  ubuntu: { source: require('../../../assets/images/avatars/ubuntu.png'), w: 27, h: 28, z: 20 },
};

const MEAL_FRACTIONS = [
  { value: 0.25, label: '¼' },
  { value: 0.5, label: '½' },
  { value: 0.75, label: '¾' },
  { value: 1, label: 'TOUT' },
] as const;

export default function HouseScreen() {
  const colors = useTheme();
  const scheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { dog } = useDog();

  // --- État du plan ---
  const [positions, setPositions] = useState<Positions>(DEFAULT_POSITIONS);
  const [draggingAvatar, setDraggingAvatar] = useState(false);
  const [mapLayout, setMapLayout] = useState({ w: 0, h: 0 });

  // --- État live (agent, session, balade) ---
  const [lastHeartbeat, setLastHeartbeat] = useState<AgentHeartbeat | null>(null);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [sessionEpisodes, setSessionEpisodes] = useState<VocalEpisode[]>([]);
  const [activeWalk, setActiveWalk] = useState<Activity | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // --- UI ---
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedFraction, setFeedFraction] = useState<number>(0.5);
  const [feedTime, setFeedTime] = useState<Date>(new Date());
  const [recap, setRecap] = useState<SessionSummary | null>(null);
  const [lastQuickLog, setLastQuickLog] = useState<string | null>(null);
  /** Ubuntu est seul depuis 2 s : panneau qui propose de lancer la session. */
  const [alonePrompt, setAlonePrompt] = useState(false);

  // Refs pour les callbacks async (évite les fermetures obsolètes).
  const positionsRef = useRef(positions);
  const activeSessionRef = useRef(activeSession);
  const activeWalkRef = useRef(activeWalk);
  useEffect(() => {
    positionsRef.current = positions;
    activeSessionRef.current = activeSession;
    activeWalkRef.current = activeWalk;
  }, [positions, activeSession, activeWalk]);

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
    const [posRes, heartbeatRes, sessionRes, walkRes] = await Promise.all([
      supabase.from('avatar_positions').select('*').eq('dog_id', dog.id),
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

    return {
      positions: nextPositions,
      heartbeat: (heartbeatRes.data?.[0] as AgentHeartbeat | undefined) ?? null,
      session,
      episodes,
      walk: (walkRes.data?.[0] as Activity | undefined) ?? null,
    };
  }, [dog]);

  useFocusEffect(
    useCallback(() => {
      let ignore = false;
      fetchAll().then((snapshot) => {
        if (ignore || !snapshot) return;
        setPositions(snapshot.positions);
        setLastHeartbeat(snapshot.heartbeat);
        setActiveSession(snapshot.session);
        if (snapshot.session) setAlonePrompt(false);
        setSessionEpisodes(snapshot.episodes);
        setActiveWalk(snapshot.walk);
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
          setPositions((prev) =>
            prev[row.person] === row.space ? prev : { ...prev, [row.person]: row.space }
          );
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

  const startSession = useCallback(
    async (solitudeType: 'away' | 'in_home') => {
      if (!dog || activeSessionRef.current) return;
      const { data, error } = await supabase
        .from('sessions')
        .insert({
          dog_id: dog.id,
          trigger: 'manual',
          started_at: new Date().toISOString(),
          solitude_type: solitudeType,
        })
        .select()
        .single();
      if (error) {
        Alert.alert('Erreur', `Session non démarrée : ${error.message}`);
        return;
      }
      setActiveSession(data as Session);
      setSessionEpisodes([]);
      setRecap(null);
      showToast(
        solitudeType === 'away'
          ? '🔴 SESSION : UBUNTU SEUL À LA MAISON'
          : '🔴 SESSION : UBUNTU SEMI-SEUL'
      );
    },
    [dog, showToast]
  );

  /** Ramène Greg et Fiona à l'entrée de l'appartement (couloir intérieur). */
  const returnHumansToEntrance = useCallback(() => {
    setPositions((prev) => ({ ...prev, greg: 'couloir_int', fiona: 'couloir_int' }));
    persistPosition('greg', 'couloir_int');
    persistPosition('fiona', 'couloir_int');
  }, [persistPosition]);

  const stopSession = useCallback(async (opts?: { returnHumans?: boolean }) => {
    const session = activeSessionRef.current;
    if (!session) return;
    const { error } = await supabase.functions.invoke('close-session', {
      body: { session_id: session.id },
    });
    if (error) {
      Alert.alert('Erreur', `Impossible de clôturer la session : ${error.message}`);
      return;
    }
    if (opts?.returnHumans) returnHumansToEntrance();
    setActiveSession(null);
    setSessionEpisodes([]);
    setLastQuickLog(null);
    const { data: summary } = await supabase
      .from('session_summaries')
      .select('*')
      .eq('session_id', session.id)
      .maybeSingle();
    setRecap((summary as SessionSummary | null) ?? null);
    showToast('🟢 SESSION TERMINÉE');
  }, [returnHumansToEntrance, showToast]);

  /** Un avatar vient d'être lâché dans une zone (geste local uniquement). */
  const handleDrop = useCallback(
    (person: Person, space: Space) => {
      const prev = positionsRef.current;
      if (prev[person] === space) return;
      const next = { ...prev, [person]: space };
      setPositions(next);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
    [persistPosition, startWalk, endWalk, stopSession]
  );

  const confirmSession = useCallback(() => {
    setAlonePrompt(false);
    const current = positionsRef.current;
    if (!isUbuntuAlone(current) || activeSessionRef.current) return;
    startSession(solitudeTypeOf(current));
  }, [startSession]);

  const handleHover = useCallback((space: Space | null) => {
    if (space) Haptics.selectionAsync();
  }, []);

  const openFeedForm = useCallback(() => {
    setMenuOpen(false);
    setFeedFraction(0.5);
    setFeedTime(new Date());
    setFeedOpen(true);
  }, []);

  const saveMeal = useCallback(async () => {
    if (!dog) return;
    const at = new Date(Math.min(feedTime.getTime(), Date.now()));
    const { error } = await supabase.from('activities').insert({
      dog_id: dog.id,
      kind: 'meal',
      at: at.toISOString(),
      meal_fraction: feedFraction,
    });
    if (error) {
      Alert.alert('Erreur', `Repas non enregistré : ${error.message}`);
      return;
    }
    setFeedOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast(`🍖 REPAS NOTÉ À ${formatTime(at.toISOString())}`);
  }, [dog, feedFraction, feedTime, showToast]);

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

  const ubuntuSlot = SLOTS[positions.ubuntu].ubuntu;

  // Les panneaux et dialogues s'affichent tous en haut, dans l'espace vert
  // au-dessus des arbres (sous le badge caméra).
  const panelTop = insets.top + 40;
  const pendingType = solitudeTypeOf(positions);

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

            {/* Points aimantés des cases utilisables, pendant le drag */}
            {draggingAvatar ? <GridDots night={scheme === 'dark'} /> : null}

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
                onDropped={handleDrop}
                onHoverSpace={handleHover}
                onDragChange={setDraggingAvatar}
                onTap={person === 'ubuntu' ? () => setMenuOpen(true) : undefined}
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

      {/* Toast rétro */}
      {toast ? (
        <Animated.View
          entering={SlideInUp.duration(220)}
          exiting={SlideOutUp.duration(160)}
          style={[
            styles.toast,
            { top: insets.top + 44, backgroundColor: colors.card, borderColor: colors.border },
          ]}>
          <Text style={[styles.toastText, { color: colors.text }]}>{toast}</Text>
        </Animated.View>
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
            {pendingType === 'away' ? '● UBUNTU EST SEUL' : '● UBUNTU EST SEMI-SEUL'}
          </Text>
          <Text style={[styles.sessionDetail, { color: colors.textSecondary }]}>
            {pendingType === 'away'
              ? `Vous avez quitté l'appartement — Ubuntu est resté : ${SPACE_LABELS[positions.ubuntu]}.`
              : `Vous êtes dans une autre pièce — Ubuntu est isolé : ${SPACE_LABELS[positions.ubuntu]}.`}{' '}
            Lancer la session ?
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

      {/* Panneau session en cours (boîte de dialogue Pokémon, en haut) */}
      {activeSession ? (
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
          <View style={styles.quickRow}>
            <QuickChip label="😢" onPress={logManualWhine} />
            <QuickChip label="😌" onPress={() => logObservation('relief')} />
            <QuickChip label="😰" onPress={() => logObservation('panic')} />
            <Pressable
              onPress={() => stopSession({ returnHumans: true })}
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

      {/* Menu Ubuntu (tap sur l'avatar) */}
      {menuOpen && scale > 0 ? (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
          <Animated.View
            entering={ZoomIn.duration(180)}
            exiting={ZoomOut.duration(130)}
            style={[
              styles.ubuntuMenu,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                boxShadow: `4px 4px 0px 0px ${colors.border}`,
                left: Math.min(Math.max(ubuntuSlot.x * scale - 80, 12), mapLayout.w - 172),
                top: Math.max(ubuntuSlot.y * scale - 118, insets.top + 46),
              },
            ]}>
            <Text style={[styles.menuTitle, { color: colors.textSecondary }]}>UBUNTU</Text>
            <Pressable onPress={openFeedForm} style={styles.menuItem}>
              <Text style={[styles.menuItemText, { color: colors.text }]}>▶ 🍖 NOURRITURE</Text>
            </Pressable>
            <Pressable onPress={() => setMenuOpen(false)} style={styles.menuItem}>
              <Text style={[styles.menuItemText, { color: colors.textSecondary }]}>✕ FERMER</Text>
            </Pressable>
          </Animated.View>
        </>
      ) : null}

      {/* Formulaire nourriture */}
      <Modal visible={feedOpen} transparent animationType="fade" onRequestClose={() => setFeedOpen(false)}>
        <View style={[styles.modalBackdrop, { paddingTop: panelTop }]}>
          <Animated.View
            entering={ZoomIn.duration(200)}
            style={[
              styles.dialog,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                boxShadow: `5px 5px 0px 0px ${colors.border}`,
              },
            ]}>
            <Text style={[styles.dialogTitle, { color: colors.text }]}>🍖 NOURRITURE</Text>
            <Text style={[styles.dialogLabel, { color: colors.textSecondary }]}>
              QUELLE PART DE SA RATION ?
            </Text>
            <View style={styles.fractionRow}>
              {MEAL_FRACTIONS.map(({ value, label }) => (
                <Pressable
                  key={value}
                  onPress={() => setFeedFraction(value)}
                  style={[
                    styles.fractionChip,
                    {
                      backgroundColor: feedFraction === value ? colors.accent : colors.background,
                      borderColor: colors.border,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.fractionText,
                      { color: feedFraction === value ? colors.accentText : colors.text },
                    ]}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.dialogLabel, { color: colors.textSecondary }]}>À QUELLE HEURE ?</Text>
            <DateTimePicker
              value={feedTime}
              mode="time"
              display="spinner"
              maximumDate={new Date()}
              themeVariant={scheme === 'dark' ? 'dark' : 'light'}
              onChange={(_, date) => {
                if (date) setFeedTime(date);
              }}
              style={styles.timePicker}
            />
            <View style={styles.dialogButtons}>
              <Pressable
                onPress={() => setFeedOpen(false)}
                style={[styles.dialogButton, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.dialogButtonText, { color: colors.text }]}>ANNULER</Text>
              </Pressable>
              <Pressable
                onPress={saveMeal}
                style={[styles.dialogButton, { backgroundColor: colors.accent, borderColor: colors.border }]}>
                <Text style={[styles.dialogButtonText, { color: colors.accentText }]}>OK !</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Récap de fin de session */}
      <Modal visible={!!recap} transparent animationType="fade" onRequestClose={() => setRecap(null)}>
        <View style={[styles.modalBackdrop, { paddingTop: panelTop }]}>
          {recap ? (
            <Animated.View
              entering={ZoomIn.duration(200)}
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
            </Animated.View>
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
  // Panneau ancré en haut de l'écran (le `top` exact dépend des insets).
  sessionPanel: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    borderWidth: 3,
    borderRadius: 2,
    padding: Spacing.md,
    gap: Spacing.sm,
    zIndex: 120,
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
  quickChip: {
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  quickChipText: {
    fontSize: 13,
  },
  stopChip: {
    marginLeft: 'auto',
    borderWidth: 2,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  stopChipText: {
    fontSize: 8,
  },
  menuBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#00000033',
    zIndex: 150,
  },
  ubuntuMenu: {
    position: 'absolute',
    width: 160,
    borderWidth: 3,
    borderRadius: 2,
    padding: Spacing.sm,
    gap: 2,
    zIndex: 160,
  },
  menuTitle: {
    fontSize: 7,
    marginBottom: 2,
  },
  menuItem: {
    paddingVertical: 8,
  },
  menuItemText: {
    fontSize: 9,
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
  dialogLabel: {
    fontSize: 8,
  },
  fractionRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  fractionChip: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 10,
    alignItems: 'center',
  },
  fractionText: {
    fontSize: 10,
  },
  timePicker: {
    alignSelf: 'center',
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
