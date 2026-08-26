import { useEffect, useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, useGlobalSearchParams, useLocalSearchParams } from 'expo-router'
import type { RoloReply, RoloTurn, WorkRecord } from '../../../src/api/model.ts'
import { friendlyError } from '../../../src/api/errors.ts'
import { useSession } from '../../../src/auth/SessionProvider.tsx'
import { HomeHeader } from '../../../src/components/HomeHeader.tsx'
import { Button, Card, Loading, Notice, Page, Tag, TextField } from '../../../src/components/ui.tsx'
import { categoryLabel, colors, kindLabel, radius, space, statusLabel } from '../../../src/theme.ts'

const STARTERS = [
  'Something is not working. Help me figure out what to check safely and what kind of pro I may need.',
  'Help me plan a project such as a pool, remodel, roof, or outdoor upgrade.',
  'I need routine help such as yard care, heating and air service, cleaning, or pest control.',
  'I have a question about my home and what it already remembers.',
]

export default function RoloScreen() {
  const { homeId } = useGlobalSearchParams<{ homeId: string }>()
  const { prompt } = useLocalSearchParams<{ prompt?: string }>()
  const { state: auth, api, previewMode, refreshSession } = useSession()
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<RoloTurn[]>([])
  const [proposal, setProposal] = useState<RoloReply['proposedWork']>(null)
  const [followUpQuestions, setFollowUpQuestions] = useState<readonly string[]>([])
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<WorkRecord | null>(null)
  const pendingCreate = useRef<{ readonly intent: string; readonly commandRef: string } | null>(null)

  useEffect(() => {
    if (prompt && turns.length === 0 && !input) setInput(prompt)
  }, [prompt])

  if (auth.kind === 'signed_out') return <Redirect href="/sign-in" />
  if (auth.kind === 'loading') return <Loading />
  if (auth.kind === 'error') {
    return <Page><Notice message={auth.message} actionLabel="Try again" onAction={() => void refreshSession()} /></Page>
  }
  if (!auth.session.capabilities.homeAssistant) {
    return (
      <Page>
        <HomeHeader section="Rolo Live" title="Rolo is unavailable." detail="Your saved home records and uploads still work normally." />
      </Page>
    )
  }

  async function send(message = input) {
    const clean = message.trim()
    if (!clean || busy) return
    setBusy(true)
    setError(null)
    setSaved(null)
    setInput('')
    try {
      const reply = await api.askRolo(homeId, clean, turns, {
        pendingWork: proposal,
        unansweredFollowUpQuestion: followUpQuestions[0] ?? null,
      })
      const exchange: RoloTurn[] = [
        { role: 'user', text: clean },
        { role: 'assistant', text: reply.answer },
      ]
      setTurns(current => [...current, ...exchange].slice(-18))
      pendingCreate.current = null
      setProposal(reply.proposedWork)
      setFollowUpQuestions(reply.followUpQuestions)
    } catch (caught) {
      setInput(clean)
      setError(previewMode && caught instanceof Error
        ? `Preview error: ${caught.message}`
        : friendlyError(caught))
    } finally { setBusy(false) }
  }

  async function saveProposal() {
    if (!proposal) return
    setSaving(true)
    setError(null)
    try {
      const createFields = {
        title: proposal.title,
        workKind: proposal.kind,
        category: proposal.category,
        status: proposal.status,
        ...(proposal.occurredOn ? { occurredOn: proposal.occurredOn } : {}),
        ...(proposal.summary ? { summary: proposal.summary } : {}),
        ...(proposal.professionalLabel ? { professionalLabel: proposal.professionalLabel } : {}),
        ...(proposal.firstUpdate
          ? { initialActivity: { kind: 'note' as const, body: proposal.firstUpdate } }
          : {}),
      }
      const intent = JSON.stringify(createFields)
      if (!pendingCreate.current || pendingCreate.current.intent !== intent) {
        pendingCreate.current = { intent, commandRef: await api.newCommandRef() }
      }
      const work = await api.createWork(homeId, {
        commandRef: pendingCreate.current.commandRef,
        ...createFields,
      })
      pendingCreate.current = null
      setSaved(work)
      setProposal(null)
      setFollowUpQuestions([])
    } catch (caught) { setError(friendlyError(caught)) } finally { setSaving(false) }
  }

  return (
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Page>
        <HomeHeader
          section="Start"
          title="What do you want to get done?"
          detail="Describe it naturally. Rolo helps you think it through and turns it into a plan only after you approve it."
        />

        {turns.length === 0 ? (
          <Card accent>
            <View style={styles.roloMark}><Ionicons name="sparkles" size={28} color={colors.ink} /></View>
            <Text style={styles.introTitle}>Start with the real reason you opened the app.</Text>
            <Text style={styles.introCopy}>A broken AC, a pool idea, weekly yard help, or a question about the house—just say it the way you would to a person.</Text>
            {STARTERS.map(starter => (
              <Pressable key={starter} onPress={() => void send(starter)} style={styles.starter}>
                <Text style={styles.starterText}>{starter}</Text>
                <Ionicons name="arrow-forward" size={17} color={colors.lime} />
              </Pressable>
            ))}
          </Card>
        ) : null}

        {turns.map((turn, index) => (
          <View key={`${index}-${turn.role}`} style={[styles.bubble, turn.role === 'user' ? styles.userBubble : styles.roloBubble]}>
            <Text style={styles.bubbleName}>{turn.role === 'user' ? 'You' : 'Rolo'}</Text>
            <Text style={styles.bubbleText}>{turn.text}</Text>
          </View>
        ))}
        {busy ? <View style={styles.thinking}><Loading label="Rolo is looking at this home…" /></View> : null}

        {followUpQuestions[0] ? (
          <Card>
            <Text style={styles.followUpLabel}>One thing Rolo still needs</Text>
            <Text style={styles.followUpQuestion}>{followUpQuestions[0]}</Text>
          </Card>
        ) : null}

        {proposal ? (
          <Card accent>
            <View style={styles.proposalTop}>
              <Tag tone="lime">Review before saving</Tag>
              <Text style={styles.proposalKind}>{kindLabel[proposal.kind]}</Text>
            </View>
            <Text style={styles.proposalTitle}>{proposal.title}</Text>
            <Text style={styles.proposalMeta}>{categoryLabel[proposal.category]} · {statusLabel[proposal.status]}</Text>
            {proposal.summary ? <Text style={styles.introCopy}>{proposal.summary}</Text> : null}
            {proposal.professionalLabel ? <Text style={styles.proLabel}>Person/company: {proposal.professionalLabel}</Text> : null}
            <Button label={saving ? 'Saving…' : 'Approve and add to Plans'} onPress={() => void saveProposal()} disabled={saving} />
            <Button label="Do not save this" onPress={() => {
              pendingCreate.current = null
              setProposal(null)
              setFollowUpQuestions([])
            }} disabled={saving} quiet />
            <Text style={styles.disclosure}>Nothing is saved until you approve it.</Text>
          </Card>
        ) : null}
        {saved ? <Notice message={`Saved “${saved.title}” to this home’s Plans.`} /> : null}
        {error ? <Notice message={error} /> : null}

        {turns.length > 0 ? (
          <Button
            label="Start a new conversation"
            icon="refresh-outline"
            quiet
            onPress={() => {
              setTurns([])
              setProposal(null)
              setFollowUpQuestions([])
              setSaved(null)
              setError(null)
              pendingCreate.current = null
            }}
          />
        ) : null}

        <Card>
          <TextField
            label="Message Rolo"
            value={input}
            onChangeText={setInput}
            multiline
            placeholder="Tell me what you need fixed, planned, serviced, or answered…"
          />
          <Button label={busy ? 'Thinking…' : 'Send'} icon="arrow-up" onPress={() => void send()} disabled={busy || !input.trim()} />
        </Card>
        <Text style={styles.safety}>Your message and a limited home index may be processed by OpenAI. The saved street-address field and file or photo contents are not sent. Rolo does not replace a licensed professional or emergency service.</Text>
      </Page>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ink },
  roloMark: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.lime, alignItems: 'center', justifyContent: 'center' },
  introTitle: { color: colors.cream, fontSize: 22, lineHeight: 27, fontWeight: '900' },
  introCopy: { color: colors.slate, fontSize: 14, lineHeight: 21 },
  starter: {
    minHeight: 54, borderRadius: radius.medium, borderWidth: 1, borderColor: colors.line,
    backgroundColor: colors.inkRaised, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  starterText: { flex: 1, color: colors.cream, fontSize: 13, lineHeight: 18, fontWeight: '700' },
  bubble: { maxWidth: '90%', borderRadius: 22, padding: 15, gap: 5 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.limeSoft, borderWidth: 1, borderColor: colors.lime },
  roloBubble: { alignSelf: 'flex-start', backgroundColor: colors.inkRaised, borderWidth: 1, borderColor: colors.line },
  bubbleName: { color: colors.aqua, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  bubbleText: { color: colors.cream, fontSize: 15, lineHeight: 22 },
  thinking: { maxHeight: 150, overflow: 'hidden' },
  followUpLabel: { color: colors.aqua, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.7 },
  followUpQuestion: { color: colors.cream, fontSize: 17, lineHeight: 24, fontWeight: '800' },
  proposalTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  proposalKind: { color: colors.slate, fontSize: 12, fontWeight: '800' },
  proposalTitle: { color: colors.cream, fontSize: 22, lineHeight: 27, fontWeight: '900' },
  proposalMeta: { color: colors.aqua, fontSize: 13, fontWeight: '800' },
  proLabel: { color: colors.lime, fontSize: 13, fontWeight: '800' },
  disclosure: { color: colors.smoke, fontSize: 11, textAlign: 'center' },
  safety: { color: colors.smoke, fontSize: 11, lineHeight: 16, textAlign: 'center', paddingHorizontal: space.lg },
})
